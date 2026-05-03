"use client"

import { useParams } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { Download, Expand, MapPin, User, Layers, Image as ImageIcon } from "lucide-react"
import { useMemo, useState } from "react"

import Lightbox from "@/components/Lightbox"
import ProgressiveImage from "@/components/ProgressiveImage"
import ReadOnlyFloorPlanCanvas from "@/components/ReadOnlyFloorPlanCanvas"
import ShareLinkCard from "@/components/ShareLinkCard"
import SharePermissionsPanel from "@/components/SharePermissionsPanel"
import { SkeletonPanel } from "@/components/Skeleton"
import { useToast } from "@/components/Toast"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { formatFloorLabel, sortFloors } from "@/lib/floor-utils"
import { DEFAULT_RENDER_VIEW_ANGLE, RENDER_VIEW_ANGLE_LABELS } from "@/lib/render-angles"
import { formatRelativeTime } from "@/lib/file-utils"
import { STYLE_PRESET_MAP } from "@/lib/style-presets"
import { generateClientPackage, generateFloorPlanPreview } from "@/lib/pdf-export"
import type { PersistedFloorPlan, ProjectMemberRole } from "@/lib/types"

function getStyleLabel(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? style
}

export default function ProjectSharePage() {
  const params = useParams<{ id: string }>()
  const { toast } = useToast()
  const projectId = (Array.isArray(params?.id) ? params.id[0] : params?.id) as Id<"projects"> | undefined
  const project = useQuery(api.projects.get, projectId ? { id: projectId } : "skip")
  const currentMember = useQuery(api.members.currentMember, projectId ? { projectId } : "skip")
  const membersQuery = useQuery(
    api.members.listMembers,
    projectId && currentMember?.role === "owner" ? { projectId } : "skip"
  )
  const rendersQuery = useQuery(api.renders.list, projectId ? { projectId } : "skip")
  const inviteMember = useMutation(api.members.inviteMember)
  const removeMember = useMutation(api.members.removeMember)
  const updateRole = useMutation(api.members.updateRole)
  const [isExporting, setIsExporting] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const floorPlans = project?.floorPlans
    ? sortFloors(project.floorPlans as PersistedFloorPlan[])
    : []
  const renders = useMemo(
    () =>
      (rendersQuery ?? []).map((render) => ({
        ...render,
        settings: {
          ...render.settings,
          viewAngle: render.settings.viewAngle ?? DEFAULT_RENDER_VIEW_ANGLE
        }
      })),
    [rendersQuery]
  )
  const visibleRenders = useMemo(() => {
    const favs = renders.filter((render) => render.isFavorite)
    return favs.length > 0 ? favs : renders
  }, [renders])

  const lightboxImages = useMemo(
    () =>
      visibleRenders
        .filter((r) => r.imageUrl)
        .map((r) => ({
          src: r.imageUrl!,
          alt: `${getStyleLabel(r.style)} render`,
          caption: `${getStyleLabel(r.style)} — ${RENDER_VIEW_ANGLE_LABELS[r.settings.viewAngle]}`,
          badge: r.isFavorite ? "★ Favorite" : undefined
        })),
    [visibleRenders]
  )

  const exportRenders = useMemo(() => {
    const favs = renders.filter((r) => r.isFavorite && r.imageUrl)
    return favs.length > 0 ? favs : renders.filter((r) => r.imageUrl)
  }, [renders])

  async function handleInvite(email: string, role: ProjectMemberRole) {
    if (!projectId) {
      return
    }

    try {
      await inviteMember({ projectId, email, role })
      toast("Member invited", "success")
    } catch (error) {
      console.error("Unable to invite member.", error)
      toast("Unable to invite member", "error")
      throw error
    }
  }

  async function handleRemove(memberId: string) {
    try {
      await removeMember({ memberId: memberId as Id<"members"> })
      toast("Member removed", "success")
    } catch (error) {
      console.error("Unable to remove member.", error)
      toast("Unable to remove member", "error")
      throw error
    }
  }

  async function handleUpdateRole(memberId: string, role: ProjectMemberRole) {
    try {
      await updateRole({ memberId: memberId as Id<"members">, role })
      toast("Member role updated", "success")
    } catch (error) {
      console.error("Unable to update member role.", error)
      toast("Unable to update member role", "error")
      throw error
    }
  }

  async function handleExportPdf() {
    if (!project || isExporting) return

    if (floorPlans.length === 0) {
      toast("No floor plans available to export", "warning")
      return
    }

    setIsExporting(true)

    try {
      await generateClientPackage({
        projectName: project.name,
        address: project.address,
        clientName: project.clientName,
        floorPlans: floorPlans.map((floorPlan) => {
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
        renders: exportRenders.map((render) => ({
          imageUrl: render.imageUrl,
          style: render.style,
          settings: render.settings
        }))
      })
      toast("PDF package downloaded", "success")
    } catch (error) {
      console.error("Unable to export PDF.", error)
      toast("Unable to export the package right now", "error")
    } finally {
      setIsExporting(false)
    }
  }

  if ((projectId && project === undefined) || (projectId && rendersQuery === undefined)) {
    return (
      <main className="page-shell">
        <SkeletonPanel height="300px" />
      </main>
    )
  }

  if (!projectId || project === null) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <div className="section-title">Project not found</div>
          <div className="muted">This shared presentation link is no longer available.</div>
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell share-page-shell">
      <section className="hero-panel share-hero">
        <div className="share-brand-row">
          <div className="brand-lockup">
            <div className="brand-mark">FW</div>
            <div>
              <div className="brand-title">Floor Plan Studio</div>
              <div className="brand-subtitle">Fading West • Shared presentation</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
            <button
              type="button"
              className="button"
              onClick={handleExportPdf}
              disabled={isExporting || floorPlans.length === 0}
            >
              <Download size={16} />
              {isExporting ? "Exporting..." : "Download PDF"}
            </button>
            <div className="badge">Shared link</div>
          </div>
        </div>

        <div className="share-hero-copy">
          <div className="hero-title">{project.name}</div>
          <div className="hero-copy">
            Review every saved floor plan and the exterior render concepts in a clean, read-only presentation.
          </div>
        </div>

        <div className="share-meta-grid">
          <div className="stat-card stat-card-v2">
            <div className="stat-card-icon stat-card-icon-blue"><MapPin size={18} /></div>
            <div className="stat-label">Address</div>
            <div className="stat-value share-stat">{project.address || "Not provided"}</div>
          </div>
          <div className="stat-card stat-card-v2">
            <div className="stat-card-icon stat-card-icon-amber"><User size={18} /></div>
            <div className="stat-label">Client</div>
            <div className="stat-value share-stat">{project.clientName || "Not provided"}</div>
          </div>
          <div className="stat-card stat-card-v2">
            <div className="stat-card-icon stat-card-icon-green"><Layers size={18} /></div>
            <div className="stat-label">Floors shown</div>
            <div className="stat-value share-stat">{floorPlans.length}</div>
          </div>
          <div className="stat-card stat-card-v2">
            <div className="stat-card-icon stat-card-icon-purple"><ImageIcon size={18} /></div>
            <div className="stat-label">Renders shown</div>
            <div className="stat-value share-stat">{visibleRenders.length}</div>
          </div>
        </div>
      </section>

      <ShareLinkCard
        url={typeof window !== "undefined" ? window.location.href : `/projects/${projectId}/share`}
      />

      {currentMember?.role === "owner" ? (
        <SharePermissionsPanel
          members={membersQuery ?? []}
          onInvite={handleInvite}
          onRemove={handleRemove}
          onUpdateRole={handleUpdateRole}
        />
      ) : null}

      <div className="share-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="section-title">Floor plans</div>
              <div className="muted">Read-only plan views with zoom and pan enabled for each saved floor.</div>
            </div>
          </div>

          {floorPlans.length > 0 ? (
            <div className="property-list">
              {floorPlans.map((floorPlan) => (
                <article key={floorPlan._id} className="property-card">
                  <div className="panel-header">
                    <div className="section-title">{formatFloorLabel(floorPlan.floor)}</div>
                    <span className="badge">Version {floorPlan.version}</span>
                  </div>
                  <ReadOnlyFloorPlanCanvas data={floorPlan.data} />
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="section-title">No floor plans available</div>
              <div className="muted">The project does not have any saved floor plans yet.</div>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="section-title">Render gallery</div>
              <div className="muted">
                {renders.some((r) => r.isFavorite)
                  ? "Showing favorited renders."
                  : "No favorites selected, so all saved renders are shown."}
              </div>
            </div>
          </div>

          {visibleRenders.length > 0 ? (
            <div className="render-grid">
              {visibleRenders.map((render, idx) => (
                <article key={render._id} className="render-card share-render-card">
                  <div
                    className={`render-media${render.imageUrl ? " render-media-clickable" : ""}`}
                    onClick={() => {
                      if (!render.imageUrl) return
                      const lightboxIdx = visibleRenders.filter((r) => r.imageUrl).findIndex((r) => r._id === render._id)
                      if (lightboxIdx >= 0) setLightboxIndex(lightboxIdx)
                    }}
                  >
                    {render.imageUrl ? (
                      <>
                        <ProgressiveImage
                          src={render.imageUrl}
                          alt={`${getStyleLabel(render.style)} shared render`}
                          sizes="(max-width: 760px) 100vw, (max-width: 1280px) 50vw, 33vw"
                        />
                        <span className="render-media-zoom-hint">
                          <Expand size={12} />
                          View full size
                        </span>
                      </>
                    ) : (
                      <div className="comparison-empty">Render image unavailable</div>
                    )}
                  </div>
                  <div className="render-card-body">
                    <div className="render-toolbar-badges">
                      <span className="badge">{getStyleLabel(render.style)}</span>
                      <span className="badge">{RENDER_VIEW_ANGLE_LABELS[render.settings.viewAngle]}</span>
                      {render.isFavorite ? <span className="badge">Favorite</span> : null}
                    </div>
                    <div className="render-meta">
                      <div className="section-title">{getStyleLabel(render.style)}</div>
                      <div className="render-meta-time">Generated {formatRelativeTime(render.createdAt)}</div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="section-title">No renders available</div>
              <div className="muted">Render concepts will appear here once they have been generated.</div>
            </div>
          )}
        </section>
      </div>

      <Lightbox
        images={lightboxImages}
        startIndex={lightboxIndex ?? 0}
        open={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
      />
    </main>
  )
}
