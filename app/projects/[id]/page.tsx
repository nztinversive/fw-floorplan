"use client"

import Image from "next/image"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import { Download, DraftingCompass, Image as ImageIcon, Link2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { formatDate } from "@/lib/file-utils"
import { generateClientPackage, generateFloorPlanPreview } from "@/lib/pdf-export"

function getDisplayImage(src?: string) {
  return src?.startsWith("http") || src?.startsWith("data:") ? src : undefined
}

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>()
  const projectId = (Array.isArray(params?.id) ? params.id[0] : params?.id) as Id<"projects"> | undefined
  const project = useQuery(api.projects.get, projectId ? { id: projectId } : "skip")
  const rendersQuery = useQuery(api.renders.list, projectId ? { projectId } : "skip")
  const copyTimerRef = useRef<number | null>(null)
  const [shareFeedback, setShareFeedback] = useState<"idle" | "copied" | "error">("idle")
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [pdfErrorMessage, setPdfErrorMessage] = useState<string | null>(null)

  const primaryFloor = useMemo(
    () => project?.floorPlans.find((entry: { floor: number }) => entry.floor === 1),
    [project]
  )
  const thumbnail = getDisplayImage(project?.thumbnail)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

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

  async function handleExportPdf() {
    if (!project || isExportingPdf || rendersQuery === undefined) {
      return
    }

    const exportFloor = primaryFloor ?? project.floorPlans[0]
    if (!exportFloor) {
      setPdfErrorMessage("Save a floor plan before exporting a client package.")
      return
    }

    setPdfErrorMessage(null)
    setIsExportingPdf(true)

    try {
      const floorPlanPreview = generateFloorPlanPreview(exportFloor.data)

      await generateClientPackage({
        projectName: project.name,
        address: project.address,
        clientName: project.clientName,
        floorPlanImage: floorPlanPreview.dataUrl,
        floorPlanStats: {
          roomCount: floorPlanPreview.roomCount,
          wallCount: floorPlanPreview.wallCount
        },
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
          <div className="page-title">{project?.name ?? "Loading project"}</div>
          <div className="muted">
            {project?.address || "No address yet"} • Updated {project ? formatDate(project.updatedAt) : "now"}
          </div>
        </div>
        <div className="button-row" style={{ alignItems: "center" }}>
          <button
            type="button"
            className="button-secondary"
            onClick={handleExportPdf}
            disabled={isExportingPdf || rendersQuery === undefined || project.floorPlans.length === 0}
          >
            <Download size={18} />
            {isExportingPdf ? "Exporting..." : "Export PDF"}
          </button>
          <Link href="/" className="button-ghost">
            Back to dashboard
          </Link>
        </div>
      </div>

      {pdfErrorMessage ? <div className="muted" style={{ color: "#9a3412", marginBottom: "1rem" }}>{pdfErrorMessage}</div> : null}

      <div className="overview-grid">
        <section className="panel">
          <div className="panel-header">
            <div className="section-title">Floor plan</div>
            <span className="badge">Floor {primaryFloor?.floor ?? 1}</span>
          </div>
          <div className="overview-thumb" style={{ position: "relative" }}>
            {thumbnail ? (
              <Image
                src={thumbnail}
                alt={`${project.name} floor plan`}
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
                No thumbnail uploaded
              </div>
            )}
          </div>
          <div className="button-row" style={{ marginTop: "1rem" }}>
            <Link href={`/projects/${projectId}/edit`} className="button-secondary">
              <DraftingCompass size={18} />
              Open editor
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
              <dd>{project?.clientName || "Not set"}</dd>
              <dt>Address</dt>
              <dd>{project?.address || "Not set"}</dd>
              <dt>Created</dt>
              <dd>{project ? formatDate(project.createdAt) : "-"}</dd>
              <dt>Floor plans</dt>
              <dd>{project?.floorPlans.length ?? 0}</dd>
            </dl>
          </div>

          <div className="sidebar-card">
            <div className="panel-header">
              <div className="section-title">Editor status</div>
            </div>
            <div className="status-line">
              <span className="status-dot" />
              Changes save back into Convex automatically.
            </div>
            <div className="divider" style={{ margin: "1rem 0" }} />
            <div className="muted">
              Use the editor to refine walls, place openings, and prepare the plan for rendering.
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}
