"use client"

import Link from "next/link"
import type Konva from "konva"
import { Clock } from "lucide-react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { useDebouncedCallback } from "use-debounce"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import Breadcrumb from "@/components/Breadcrumb"
import CanvasGuidance from "@/components/CanvasGuidance"
import FloorPlanCanvas from "@/components/FloorPlanCanvas"
import HistoryPanel from "@/components/HistoryPanel"
import OnboardingTour from "@/components/OnboardingTour"
import PropertiesPanel from "@/components/PropertiesPanel"
import { SkeletonPanel } from "@/components/Skeleton"
import { useToast } from "@/components/Toast"
import Toolbar from "@/components/Toolbar"
import UnsavedChangesGuard from "@/components/UnsavedChangesGuard"
import VersionsPanel from "@/components/VersionsPanel"
import { formatFloorLabel, getNextFloorNumber, parseFloorParam, sortFloors } from "@/lib/floor-utils"
import { createSeedFloorPlan } from "@/lib/geometry"
import { useEditorStore } from "@/lib/editor-store"
import type { FloorPlanData, PersistedFloorPlan } from "@/lib/types"

type UploadResponse = {
  storageId: Id<"_storage">
}

async function uploadFileToStorage(uploadUrl: string, file: File): Promise<Id<"_storage">> {
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream"
    },
    body: file
  })

  if (!response.ok) {
    throw new Error("Upload failed")
  }

  const payload = (await response.json()) as UploadResponse
  return payload.storageId
}

export default function ProjectEditorPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const projectId = (Array.isArray(params?.id) ? params.id[0] : params?.id) as
    | Id<"projects">
    | undefined
  const stageRef = useRef<Konva.Stage>(null)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null)
  const [isCreatingFloor, setIsCreatingFloor] = useState(false)
  const [isReplacingSourceImage, setIsReplacingSourceImage] = useState(false)
  const [pendingCreatedFloor, setPendingCreatedFloor] = useState<number | null>(null)
  const [isSourceImageVisible, setIsSourceImageVisible] = useState(true)
  const [sourceImageOpacity, setSourceImageOpacity] = useState(0.3)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isVersionsOpen, setIsVersionsOpen] = useState(false)
  const [showCalibrationDialog, setShowCalibrationDialog] = useState(false)
  const [calibrationFeetInput, setCalibrationFeetInput] = useState("")
  const hydratedFloorPlanIdRef = useRef<string | null>(null)
  const lastSavedSnapshotsRef = useRef<Record<number, string>>({})
  const sourceImageByFloorRef = useRef<Record<number, Id<"_storage"> | undefined>>({})
  const currentFloorRef = useRef<number>(1)
  const project = useQuery(api.projects.get, projectId ? { id: projectId } : "skip")
  const saveFloorPlan = useMutation(api.floorPlans.save)
  const uploadSource = useMutation(api.floorPlans.uploadSource)
  const actionError = useEditorStore((state) => state.actionError)
  const calibrationPoints = useEditorStore((state) => state.calibrationPoints)

  const orderedFloorPlans = useMemo(
    () =>
      project?.floorPlans
        ? sortFloors(project.floorPlans as PersistedFloorPlan[])
        : [],
    [project?.floorPlans]
  )
  const rawFloorParam = searchParams.get("floor")
  const selectedFloor = useMemo(
    () => {
      const requestedFloor = Number(rawFloorParam)
      if (
        Number.isInteger(requestedFloor) &&
        requestedFloor > 0 &&
        (orderedFloorPlans.some((floorPlan) => floorPlan.floor === requestedFloor) ||
          pendingCreatedFloor === requestedFloor)
      ) {
        return requestedFloor
      }

      return parseFloorParam(rawFloorParam, orderedFloorPlans)
    },
    [orderedFloorPlans, pendingCreatedFloor, rawFloorParam]
  )
  const activeFloorPlan = useMemo(
    () => orderedFloorPlans.find((floorPlan) => floorPlan.floor === selectedFloor) ?? null,
    [orderedFloorPlans, selectedFloor]
  )
  const activeSourceImageUrl = activeFloorPlan?.sourceImageUrl ?? null

  const floorPlanData = useEditorStore((state) => state.floorPlanData)
  const setFloorPlanData = useEditorStore((state) => state.setFloorPlanData)
  const setCalibrationPoints = useEditorStore((state) => state.setCalibrationPoints)
  const calibrateScale = useEditorStore((state) => state.calibrateScale)

  useEffect(() => {
    currentFloorRef.current = selectedFloor
  }, [selectedFloor])

  useEffect(() => {
    if (
      pendingCreatedFloor !== null &&
      orderedFloorPlans.some((floorPlan) => floorPlan.floor === pendingCreatedFloor)
    ) {
      setPendingCreatedFloor(null)
    }
  }, [orderedFloorPlans, pendingCreatedFloor])

  useEffect(() => {
    if (!projectId || orderedFloorPlans.length === 0) {
      return
    }

    const requestedFloor = Number(rawFloorParam)
    if (
      Number.isInteger(requestedFloor) &&
      requestedFloor > 0 &&
      !orderedFloorPlans.some((floorPlan) => floorPlan.floor === requestedFloor) &&
      pendingCreatedFloor !== requestedFloor
    ) {
      router.replace(`/projects/${projectId}/edit?floor=${orderedFloorPlans[0].floor}`, {
        scroll: false
      })
    }
  }, [orderedFloorPlans, pendingCreatedFloor, projectId, rawFloorParam, router])

  useEffect(() => {
    if (!activeFloorPlan) {
      return
    }

    if (hydratedFloorPlanIdRef.current === activeFloorPlan._id) {
      return
    }

    setFloorPlanData(activeFloorPlan.data, true)
    hydratedFloorPlanIdRef.current = activeFloorPlan._id
    lastSavedSnapshotsRef.current[activeFloorPlan.floor] = JSON.stringify(activeFloorPlan.data)
    sourceImageByFloorRef.current[activeFloorPlan.floor] =
      activeFloorPlan.sourceImage as Id<"_storage"> | undefined
    setSaveState("idle")
    setSaveErrorMessage(null)
  }, [activeFloorPlan, setFloorPlanData])

  useEffect(() => {
    setIsSourceImageVisible(Boolean(activeSourceImageUrl))
  }, [activeSourceImageUrl])

  useEffect(() => {
    if (calibrationPoints.length === 2) {
      setCalibrationFeetInput("")
      setShowCalibrationDialog(true)
    }
  }, [calibrationPoints])

  const debouncedSave = useDebouncedCallback(
    async (
      floor: number,
      nextData: FloorPlanData,
      snapshot: string,
      sourceImage?: Id<"_storage">
    ) => {
      if (!projectId) {
        return
      }

      try {
        await saveFloorPlan({
          projectId,
          floor,
          sourceImage,
          data: nextData
        })
        lastSavedSnapshotsRef.current[floor] = snapshot
        if (currentFloorRef.current === floor) {
          setSaveState("saved")
          setSaveErrorMessage(null)
        }
      } catch (error) {
        console.error("Unable to autosave floor plan.", error)
        if (currentFloorRef.current === floor) {
          setSaveState("error")
          setSaveErrorMessage("Autosave failed. Your edits are still in the browser.")
          toast("Autosave failed — edits preserved locally", "warning")
        }
      }
    },
    700
  )

  useEffect(() => {
    if (!projectId || !activeFloorPlan || hydratedFloorPlanIdRef.current !== activeFloorPlan._id) {
      return
    }

    const nextSnapshot = JSON.stringify(floorPlanData)
    if (nextSnapshot === lastSavedSnapshotsRef.current[activeFloorPlan.floor]) {
      return
    }

    setSaveState("saving")
    setSaveErrorMessage(null)
    debouncedSave(
      activeFloorPlan.floor,
      floorPlanData,
      nextSnapshot,
      sourceImageByFloorRef.current[activeFloorPlan.floor]
    )
  }, [activeFloorPlan, debouncedSave, floorPlanData, projectId])

  useEffect(() => () => debouncedSave.cancel(), [debouncedSave])

  const statusLabel = useMemo(() => {
    if (projectId && project === undefined) {
      return "Loading floor plan..."
    }

    if (saveState === "saving") {
      return `Saving ${formatFloorLabel(selectedFloor).toLowerCase()}...`
    }

    if (saveState === "saved") {
      return `${formatFloorLabel(selectedFloor)} saved`
    }

    if (saveState === "error") {
      return `Save failed for ${formatFloorLabel(selectedFloor).toLowerCase()}`
    }

    return "Autosave ready"
  }, [project, projectId, saveState, selectedFloor])

  function navigateToFloor(floor: number) {
    if (!projectId) {
      return
    }

    router.replace(`/projects/${projectId}/edit?floor=${floor}`, { scroll: false })
  }

  const handleSourceImageSelected = useCallback(
    async (file: File) => {
      if (!projectId || !activeFloorPlan || isReplacingSourceImage) {
        return
      }

      const floor = activeFloorPlan.floor
      const previousSourceImage = sourceImageByFloorRef.current[floor]
      const nextSnapshot = JSON.stringify(floorPlanData)

      setIsReplacingSourceImage(true)
      setSaveState("saving")
      setSaveErrorMessage(null)
      debouncedSave.cancel()

      try {
        const uploadUrl = await uploadSource({})
        const sourceImage = await uploadFileToStorage(uploadUrl, file)
        sourceImageByFloorRef.current[floor] = sourceImage

        await saveFloorPlan({
          projectId,
          floor,
          sourceImage,
          data: floorPlanData
        })

        lastSavedSnapshotsRef.current[floor] = nextSnapshot
        setIsSourceImageVisible(true)
        setSaveState("saved")
        setSaveErrorMessage(null)
        toast("Source image updated", "success")
      } catch (error) {
        sourceImageByFloorRef.current[floor] = previousSourceImage
        console.error("Unable to replace the source image.", error)
        setSaveState("error")
        setSaveErrorMessage("Source image upload failed. Your current floor plan is unchanged.")
        toast("Unable to replace source image", "error")
      } finally {
        setIsReplacingSourceImage(false)
      }
    },
    [
      activeFloorPlan,
      debouncedSave,
      floorPlanData,
      isReplacingSourceImage,
      projectId,
      saveFloorPlan,
      toast,
      uploadSource
    ]
  )

  async function handleCreateFloor() {
    if (!projectId || !project || isCreatingFloor) {
      return
    }

    const nextFloor =
      orderedFloorPlans.length > 0 ? getNextFloorNumber(orderedFloorPlans) : 1

    setIsCreatingFloor(true)
    setSaveErrorMessage(null)

    try {
      await saveFloorPlan({
        projectId,
        floor: nextFloor,
        data: createSeedFloorPlan().data
      })
      setPendingCreatedFloor(nextFloor)
      navigateToFloor(nextFloor)
      toast(`${formatFloorLabel(nextFloor)} created`, "success")
    } catch (error) {
      console.error("Unable to create a new floor.", error)
      toast("Unable to create a new floor right now", "error")
    } finally {
      setIsCreatingFloor(false)
    }
  }

  if (projectId && project === undefined) {
    return (
      <main className="page-shell">
        <Breadcrumb items={[{ label: "Projects", href: "/" }, { label: "Loading..." }, { label: "Editor" }]} />
        <SkeletonPanel height="620px" />
      </main>
    )
  }

  if (!projectId || project === null) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <div className="section-title">Project not found</div>
          <div className="muted">This editor session requires a saved project.</div>
          <Link href="/" className="button-secondary">
            Return to dashboard
          </Link>
        </div>
      </main>
    )
  }

  if (orderedFloorPlans.length === 0) {
    return (
      <main className="page-shell">
        <Breadcrumb items={[
          { label: "Projects", href: "/" },
          { label: project.name, href: `/projects/${projectId}` },
          { label: "Editor" }
        ]} />
        <div className="page-heading">
          <div>
            <div className="page-title">{project.name}</div>
            <div className="muted">This project does not have any saved floors yet.</div>
          </div>
        </div>

        <div className="empty-state">
          <div className="section-title">Create the first floor</div>
          <div className="muted">A starter floor plan will be created so the editor has a working canvas.</div>
          <button type="button" className="button" onClick={handleCreateFloor} disabled={isCreatingFloor}>
            {isCreatingFloor ? "Creating..." : "Create floor 1"}
          </button>
        </div>
      </main>
    )
  }

  if (!activeFloorPlan) {
    return (
      <main className="page-shell">
        <Breadcrumb items={[
          { label: "Projects", href: "/" },
          { label: project.name, href: `/projects/${projectId}` },
          { label: "Editor" }
        ]} />
        <div className="empty-state">
          <div className="section-title">Loading requested floor</div>
          <div className="muted">
            Waiting for {formatFloorLabel(selectedFloor).toLowerCase()} to become available.
          </div>
        </div>
      </main>
    )
  }

  const hasUnsavedChanges = saveState === "saving" || saveState === "error"

  function handleCloseCalibrationDialog() {
    setShowCalibrationDialog(false)
    setCalibrationFeetInput("")
    setCalibrationPoints([])
  }

  function handleSubmitCalibration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    calibrateScale(parseFloat(calibrationFeetInput))
    setShowCalibrationDialog(false)
    setCalibrationFeetInput("")
  }

  function handleRestoreVersion(data: FloorPlanData, versionName: string) {
    debouncedSave.cancel()
    setFloorPlanData(data, true, `Restored version: ${versionName}`)
    setSaveState("idle")
    setSaveErrorMessage(null)
  }

  return (
    <main className="page-shell">
      <UnsavedChangesGuard hasUnsavedChanges={hasUnsavedChanges} />
      <Breadcrumb items={[
        { label: "Projects", href: "/" },
        { label: project.name, href: `/projects/${projectId}` },
        { label: `Editor — ${formatFloorLabel(selectedFloor)}` }
      ]} />

      <div className="mobile-note">
        <div className="muted">
          The editor is optimized for larger screens. Tablet and desktop provide the best drafting space.
        </div>
      </div>

      <div className="page-heading">
        <div>
          <div className="page-title">{project.name}</div>
          <div className="muted">
            {formatFloorLabel(selectedFloor)} • {statusLabel}
            {hasUnsavedChanges ? <span className="unsaved-dot" title="Unsaved changes" /> : null}
          </div>
        </div>
        <div className="button-row" style={{ alignItems: "center" }}>
          <button
            type="button"
            className={`button-ghost${isVersionsOpen ? " is-active" : ""}`}
            onClick={() => setIsVersionsOpen((open) => !open)}
          >
            {isVersionsOpen ? "Hide versions" : "Versions"}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={handleCreateFloor}
            disabled={isCreatingFloor}
          >
            {isCreatingFloor ? "Creating..." : "Add floor"}
          </button>
          <Link href={`/projects/${projectId}`} className="button-ghost">
            Back to overview
          </Link>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="panel-header" style={{ marginBottom: "0.75rem" }}>
          <div className="section-title">Floors</div>
          <div className="muted">{orderedFloorPlans.length} saved floors</div>
        </div>
        <div className="pill-row">
          {orderedFloorPlans.map((floorPlan) => (
            <button
              key={floorPlan._id}
              type="button"
              className={`pill-button${floorPlan.floor === selectedFloor ? " is-active" : ""}`}
              onClick={() => navigateToFloor(floorPlan.floor)}
            >
              {formatFloorLabel(floorPlan.floor)}
            </button>
          ))}
        </div>
      </div>

      {saveErrorMessage ? (
        <div className="muted" style={{ color: "#9a3412", marginBottom: "1rem" }}>
          {saveErrorMessage}
        </div>
      ) : null}

      {actionError ? (
        <div className="muted" style={{ color: "#9a3412", marginBottom: "1rem" }}>
          {actionError}
        </div>
      ) : null}

      <div className="editor-shell editor-dark">
        <Toolbar
          projectName={project.name}
          exportFileName={`${project.name}-${formatFloorLabel(selectedFloor)}`}
          stageRef={stageRef}
          sourceImageUrl={activeSourceImageUrl}
          overlayVisible={isSourceImageVisible}
          overlayOpacity={sourceImageOpacity}
          onToggleOverlay={() => setIsSourceImageVisible((visible) => !visible)}
          onOverlayOpacityChange={setSourceImageOpacity}
          onSourceImageSelected={handleSourceImageSelected}
          isUploadingSourceImage={isReplacingSourceImage}
        />
        <div className="editor-grid">
          <div style={{ position: "relative", overflow: "hidden" }}>
            <HistoryPanel open={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
            <button
              type="button"
              className={`icon-button${isHistoryOpen ? " is-active" : ""}`}
              aria-label={isHistoryOpen ? "Close history panel" : "Open history panel"}
              aria-pressed={isHistoryOpen}
              onClick={() => setIsHistoryOpen((open) => !open)}
              style={{ position: "absolute", top: "1rem", right: "1rem", zIndex: 110 }}
            >
              <Clock size={16} />
            </button>
            <FloorPlanCanvas
              stageRef={stageRef}
              sourceImageUrl={activeSourceImageUrl}
              overlayVisible={isSourceImageVisible}
              overlayOpacity={sourceImageOpacity}
            />
            <CanvasGuidance />
          </div>
          <div className="editor-sidebar">
            {isVersionsOpen ? (
              <VersionsPanel
                projectId={projectId}
                floor={selectedFloor}
                floorPlanData={floorPlanData}
                onRestore={handleRestoreVersion}
              />
            ) : null}
            <PropertiesPanel />
          </div>
        </div>
      </div>

      {showCalibrationDialog ? (
        <div className="dialog-backdrop" onClick={handleCloseCalibrationDialog}>
          <div
            className="dialog-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calibration-dialog-title"
          >
            <form onSubmit={handleSubmitCalibration}>
              <div className="dialog-body">
                <div className="dialog-title" id="calibration-dialog-title">
                  Calibrate scale
                </div>
                <div className="dialog-message">
                  Enter the real distance between these two points.
                </div>
                <label className="field">
                  <span className="field-label">Distance in feet</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    autoFocus
                    className="field-input"
                    value={calibrationFeetInput}
                    onChange={(event) => setCalibrationFeetInput(event.target.value)}
                    placeholder="12"
                  />
                </label>
              </div>
              <div className="dialog-footer">
                <button type="button" className="button-ghost" onClick={handleCloseCalibrationDialog}>
                  Cancel
                </button>
                <button type="submit" className="button">
                  Apply calibration
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <OnboardingTour />
    </main>
  )
}
