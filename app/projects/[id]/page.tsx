"use client"

import Image from "next/image"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { Download, DraftingCompass, Image as ImageIcon, Link2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { formatDate } from "@/lib/file-utils"
import { formatFloorLabel, getNextFloorNumber, getPrimaryFloor, sortFloors } from "@/lib/floor-utils"
import { createSeedFloorPlan } from "@/lib/geometry"
import { generateClientPackage, generateFloorPlanPreview } from "@/lib/pdf-export"
import type { PersistedFloorPlan } from "@/lib/types"

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>()
  const projectId = (Array.isArray(params?.id) ? params.id[0] : params?.id) as
    | Id<"projects">
    | undefined
  const project = useQuery(api.projects.get, projectId ? { id: projectId } : "skip")
  const rendersQuery = useQuery(api.renders.list, projectId ? { projectId } : "skip")
  const saveFloorPlan = useMutation(api.floorPlans.save)
  const copyTimerRef = useRef<number | null>(null)
  const [shareFeedback, setShareFeedback] = useState<"idle" | "copied" | "error">("idle")
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [pdfErrorMessage, setPdfErrorMessage] = useState<string | null>(null)
  const [isCreatingFloor, setIsCreatingFloor] = useState(false)
  const [pendingCreatedFloor, setPendingCreatedFloor] = useState<number | null>(null)
  const orderedFloorPlans = useMemo(
    () =>
      project?.floorPlans
        ? sortFloors(project.floorPlans as PersistedFloorPlan[])
        : [],
    [project?.floorPlans]
  )
  const [selectedFloor, setSelectedFloor] = useState<number>(1)

  useEffect(() => {
    const primaryFloor = getPrimaryFloor(orderedFloorPlans)
    if (!primaryFloor) {
      setSelectedFloor(1)
      return
    }

    if (orderedFloorPlans.some((floorPlan) => floorPlan.floor === selectedFloor)) {
      if (pendingCreatedFloor === selectedFloor) {
        setPendingCreatedFloor(null)
      }
      return
    }

    if (pendingCreatedFloor === selectedFloor) {
      return
    }

    if (!orderedFloorPlans.some((floorPlan) => floorPlan.floor === selectedFloor)) {
      setSelectedFloor(primaryFloor.floor)
    }
  }, [orderedFloorPlans, pendingCreatedFloor, selectedFloor])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const activeFloorPlan = useMemo(
    () => orderedFloorPlans.find((floorPlan) => floorPlan.floor === selectedFloor) ?? null,
    [orderedFloorPlans, selectedFloor]
  )
  const activeFloorPreview = useMemo(
    () => (activeFloorPlan ? generateFloorPlanPreview(activeFloorPlan.data) : null),
    [activeFloorPlan]
  )

  async function handleCopyShareLink() {
    if (!projectId) {
      return
    }

    try {
      const shareUrl = `${window.location.origin}/projects/${projectId}/share`
      await navigator.clipboard.writeText(shareUrl)
      setShareFeedback("copied")
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
      copyTimerRef.current = window.setTimeout(() => setShareFeedback("idle"), 1800)
    } catch (error) {
      console.error("Unable to copy share link.", error)
      setShareFeedback("error")
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
      copyTimerRef.current = window.setTimeout(() => setShareFeedback("idle"), 2200)
    }
  }

  async function handleAddFloor() {
    if (!projectId || !project || isCreatingFloor) {
      return
    }

    const nextFloor = getNextFloorNumber(orderedFloorPlans)
    setIsCreatingFloor(true)
    setPdfErrorMessage(null)

    try {
      await saveFloorPlan({
        projectId,
        floor: nextFloor,
        data: createSeedFloorPlan().data
      })
      setPendingCreatedFloor(nextFloor)
      setSelectedFloor(nextFloor)
    } catch (error) {
      console.error("Unable to create floor.", error)
      setPdfErrorMessage("Unable to create another floor right now.")
    } finally {
      setIsCreatingFloor(false)
    }
  }

  async function handleExportPdf() {
    if (!project || isExportingPdf || rendersQuery === undefined) {
      return
    }

    if (orderedFloorPlans.length === 0) {
      setPdfErrorMessage("Save a floor plan before exporting a client package.")
      return
    }

    setPdfErrorMessage(null)
    setIsExportingPdf(true)

    try {
      await generateClientPackage({
        projectName: project.name,
        address: project.address,
        clientName: project.clientName,
        floorPlans: orderedFloorPlans.map((floorPlan) => {
          const preview = generateFloorPlanPreview(floorPlan.data)
          return {
            floor: floorPlan.floor,
            image: preview.dataUrl,
            stats: {
              roomCount: preview.roomCount,
              wallCount: preview.wallCount
            }
          }
        }),
        renders: (rendersQuery ?? []).map((render) => ({
          imageUrl: render.imageUrl,
          style: render.style,
          settings: {
            ...render.settings,
            viewAngle: render.settings.viewAngle ?? "front-three-quarter"
          }
        }))
      })
    } catch (error) {
      console.error("Unable to export PDF package.", error)
      setPdfErrorMessage("Unable to export the client package right now.")
    } finally {
      setIsExportingPdf(false)
    }
  }

  if (projectId && project === undefined) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <div className="section-title">Loading project</div>
          <div className="muted">Fetching project details from Convex.</div>
        </div>
      </main>
    )
  }

  if (!projectId || project === null) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <div className="section-title">Project not found</div>
          <div className="muted">The project may have been removed or has not been created yet.</div>
          <Link href="/" className="button-secondary">
            Return to dashboard
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-title">{project.name}</div>
          <div className="muted">
            {project.address || "No address yet"} | Updated {formatDate(project.updatedAt)}
          </div>
        </div>
        <div className="button-row" style={{ alignItems: "center" }}>
          <button
            type="button"
            className="button-secondary"
            onClick={handleAddFloor}
            disabled={isCreatingFloor}
          >
            {isCreatingFloor ? "Creating..." : "Add floor"}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={handleExportPdf}
            disabled={isExportingPdf || rendersQuery === undefined || orderedFloorPlans.length === 0}
          >
            <Download size={18} />
            {isExportingPdf ? "Exporting..." : "Export PDF"}
          </button>
          <Link href="/" className="button-ghost">
            Back to dashboard
          </Link>
        </div>
      </div>

      {pdfErrorMessage ? (
        <div className="muted" style={{ color: "#9a3412", marginBottom: "1rem" }}>
          {pdfErrorMessage}
        </div>
      ) : null}

      <div className="overview-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="section-title">Floor plans</div>
              <div className="muted">Switch between floors and open the editor at the selected level.</div>
            </div>
            <span className="badge">
              {activeFloorPlan ? formatFloorLabel(activeFloorPlan.floor) : "No floors"}
            </span>
          </div>

          {orderedFloorPlans.length > 0 ? (
            <>
              <div className="pill-row" style={{ marginBottom: "1rem" }}>
                {orderedFloorPlans.map((floorPlan) => (
                  <button
                    key={floorPlan._id}
                    type="button"
                    className={`pill-button${floorPlan.floor === selectedFloor ? " is-active" : ""}`}
                    onClick={() => setSelectedFloor(floorPlan.floor)}
                  >
                    {formatFloorLabel(floorPlan.floor)}
                  </button>
                ))}
              </div>

              <div className="overview-thumb" style={{ position: "relative" }}>
                {activeFloorPreview ? (
                  <Image
                    src={activeFloorPreview.dataUrl}
                    alt={`${project.name} ${formatFloorLabel(selectedFloor).toLowerCase()} preview`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 70vw"
                    unoptimized
                  />
                ) : (
                  <div
                    style={{
                      minHeight: "360px",
                      display: "grid",
                      placeItems: "center",
                      color: "var(--fw-slate)"
                    }}
                  >
                    No floor preview available
                  </div>
                )}
              </div>

              <div className="button-row" style={{ marginTop: "1rem" }}>
                <Link href={`/projects/${projectId}/edit?floor=${selectedFloor}`} className="button-secondary">
                  <DraftingCompass size={18} />
                  Edit {formatFloorLabel(selectedFloor).toLowerCase()}
                </Link>
                <Link href={`/projects/${projectId}/renders`} className="button-ghost">
                  <ImageIcon size={18} />
                  Renders
                </Link>
                <button type="button" className="button-ghost" onClick={handleCopyShareLink}>
                  <Link2 size={18} />
                  Copy share link
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="section-title">No floor plans yet</div>
              <div className="muted">Create the first floor to start drafting and exporting.</div>
            </div>
          )}

          {shareFeedback !== "idle" ? (
            <div className={`copy-feedback ${shareFeedback === "error" ? "is-error" : ""}`}>
              {shareFeedback === "copied" ? "Copied!" : "Unable to copy link"}
            </div>
          ) : null}
        </section>

        <aside className="editor-sidebar">
          <div className="sidebar-card">
            <div className="panel-header">
              <div className="section-title">Project details</div>
            </div>
            <dl className="key-value">
              <dt>Client</dt>
              <dd>{project.clientName || "Not set"}</dd>
              <dt>Address</dt>
              <dd>{project.address || "Not set"}</dd>
              <dt>Created</dt>
              <dd>{formatDate(project.createdAt)}</dd>
              <dt>Floor plans</dt>
              <dd>{orderedFloorPlans.length}</dd>
            </dl>
          </div>

          <div className="sidebar-card">
            <div className="panel-header">
              <div className="section-title">Floor summary</div>
            </div>
            <div className="property-list">
              {orderedFloorPlans.map((floorPlan) => {
                return (
                  <div key={floorPlan._id} className="property-card">
                    <div className="property-title">
                      <strong>{formatFloorLabel(floorPlan.floor)}</strong>
                      <span className="badge">v{floorPlan.version}</span>
                    </div>
                    <dl className="key-value">
                      <dt>Rooms</dt>
                      <dd>{floorPlan.data.rooms.length}</dd>
                      <dt>Walls</dt>
                      <dd>{floorPlan.data.walls.length}</dd>
                    </dl>
                  </div>
                )
              })}
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}
