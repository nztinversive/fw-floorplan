"use client"

import Link from "next/link"
import type Konva from "konva"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { useDebouncedCallback } from "use-debounce"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import FloorPlanCanvas from "@/components/FloorPlanCanvas"
import PropertiesPanel from "@/components/PropertiesPanel"
import Toolbar from "@/components/Toolbar"
import { useEditorStore } from "@/lib/editor-store"
import type { FloorPlanData } from "@/lib/types"

export default function ProjectEditorPage() {
  const params = useParams<{ id: string }>()
  const projectId = (Array.isArray(params?.id) ? params.id[0] : params?.id) as Id<"projects"> | undefined
  const stageRef = useRef<Konva.Stage>(null)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const hydratedFloorPlanIdRef = useRef<string | null>(null)
  const lastSavedSnapshotRef = useRef<string | null>(null)
  const project = useQuery(api.projects.get, projectId ? { id: projectId } : "skip")
  const activeFloorPlan = useQuery(
    api.floorPlans.get,
    projectId
      ? {
          projectId,
          floor: 1
        }
      : "skip"
  )
  const saveFloorPlan = useMutation(api.floorPlans.save)

  const floorPlanData = useEditorStore((state) => state.floorPlanData)
  const setFloorPlanData = useEditorStore((state) => state.setFloorPlanData)

  useEffect(() => {
    if (!activeFloorPlan) {
      return
    }

    if (hydratedFloorPlanIdRef.current === activeFloorPlan._id) {
      return
    }

    setFloorPlanData(activeFloorPlan.data, true)
    hydratedFloorPlanIdRef.current = activeFloorPlan._id
    lastSavedSnapshotRef.current = JSON.stringify(activeFloorPlan.data)
    setSaveState("idle")
  }, [activeFloorPlan, setFloorPlanData])

  const debouncedSave = useDebouncedCallback(async (nextData: FloorPlanData, sourceImage?: Id<"_storage">) => {
    if (!projectId) {
      return
    }

    await saveFloorPlan({
      projectId,
      floor: 1,
      sourceImage,
      data: nextData
    })
    lastSavedSnapshotRef.current = JSON.stringify(nextData)
    setSaveState("saved")
  }, 700)

  useEffect(() => {
    if (!projectId || !activeFloorPlan || hydratedFloorPlanIdRef.current !== activeFloorPlan._id) {
      return
    }

    const nextSnapshot = JSON.stringify(floorPlanData)
    if (nextSnapshot === lastSavedSnapshotRef.current) {
      return
    }

    setSaveState("saving")
    debouncedSave(floorPlanData, activeFloorPlan.sourceImage)
  }, [activeFloorPlan, debouncedSave, floorPlanData, projectId])

  useEffect(() => () => debouncedSave.cancel(), [debouncedSave])

  const statusLabel = useMemo(() => {
    if (projectId && (project === undefined || activeFloorPlan === undefined)) {
      return "Loading floor plan..."
    }

    if (saveState === "saving") {
      return "Saving to Convex..."
    }

    if (saveState === "saved") {
      return "Saved to Convex"
    }

    return "Convex autosave ready"
  }, [activeFloorPlan, project, projectId, saveState])

  if ((projectId && project === undefined) || (projectId && activeFloorPlan === undefined)) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <div className="section-title">Loading editor</div>
          <div className="muted">Fetching the latest floor plan from Convex.</div>
        </div>
      </main>
    )
  }

  if (!projectId || project === null || activeFloorPlan === null) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <div className="section-title">Project not found</div>
          <div className="muted">This editor session requires a saved Convex floor plan.</div>
          <Link href="/" className="button-secondary">
            Return to dashboard
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <div className="mobile-note">
        <div className="muted">
          The editor is optimized for larger screens. Tablet and desktop provide the best drafting space.
        </div>
      </div>

      <div className="page-heading">
        <div>
          <div className="page-title">{project?.name ?? "Loading editor"}</div>
          <div className="muted">{statusLabel}</div>
        </div>
        <Link href={`/projects/${projectId}`} className="button-ghost">
          Back to overview
        </Link>
      </div>

      <div className="editor-shell">
        <Toolbar stageRef={stageRef} />
        <div className="editor-grid">
          <FloorPlanCanvas stageRef={stageRef} />
          <PropertiesPanel />
        </div>
      </div>
    </main>
  )
}
