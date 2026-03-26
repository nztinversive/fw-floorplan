"use client"

import Image from "next/image"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { DraftingCompass, Image as ImageIcon } from "lucide-react"

import { formatDate } from "@/lib/file-utils"
import { getProject } from "@/lib/local-data"
import type { StoredProject } from "@/lib/types"

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>()
  const projectId = Array.isArray(params?.id) ? params.id[0] : params?.id
  const [project, setProject] = useState<StoredProject | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

  useEffect(() => {
    if (!projectId) {
      setHasLoaded(true)
      return
    }

    setProject(getProject(projectId))
    setHasLoaded(true)
  }, [projectId])

  const primaryFloor = useMemo(() => project?.floorPlans.find((entry) => entry.floor === 1), [project])

  if (hasLoaded && !project) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <div className="section-title">Project not found</div>
          <div className="muted">The local record may have been removed or never created on this device.</div>
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
        <Link href="/" className="button-ghost">
          Back to dashboard
        </Link>
      </div>

      <div className="overview-grid">
        <section className="panel">
          <div className="panel-header">
            <div className="section-title">Floor plan</div>
            <span className="badge">Floor {primaryFloor?.floor ?? 1}</span>
          </div>
          <div className="overview-thumb" style={{ position: "relative" }}>
            {project?.thumbnail ? (
              <Image
                src={project.thumbnail}
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
          </div>
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
              Changes save back into local browser storage.
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
