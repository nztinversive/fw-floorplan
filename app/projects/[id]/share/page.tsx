"use client"

import dynamic from "next/dynamic"
import { useParams, useSearchParams } from "next/navigation"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { Download, Expand, MapPin, User, Layers, Image as ImageIcon } from "lucide-react"
import { useMemo, useState } from "react"

import CommentsPanel from "@/components/CommentsPanel"
import Lightbox from "@/components/Lightbox"
import ProgressiveImage from "@/components/ProgressiveImage"
import ShareLinkCard from "@/components/ShareLinkCard"
import SharePermissionsPanel from "@/components/SharePermissionsPanel"
import { SkeletonPanel } from "@/components/Skeleton"
import { useToast } from "@/components/Toast"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { formatFloorLabel, sortFloors } from "@/lib/floor-utils"
import {
  DEFAULT_RENDER_VIEW_ANGLE,
  RENDER_VIEW_ANGLE_LABELS,
  type RenderViewAngle
} from "@/lib/render-angles"
import { formatRelativeTime } from "@/lib/file-utils"
import { STYLE_PRESET_MAP } from "@/lib/style-presets"
import { generateClientPackage, generateFloorPlanPreview } from "@/lib/pdf-export"
import type { PersistedFloorPlan, ProjectComment, ProjectMember, ProjectMemberRole } from "@/lib/types"

const EMPTY_COMMENTS: ProjectComment[] = []

const ReadOnlyFloorPlanCanvas = dynamic(() => import("@/components/ReadOnlyFloorPlanCanvas"), {
  ssr: false
})

function getStyleLabel(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? style
}

export default function ProjectSharePage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const { isAuthenticated } = useConvexAuth()
  const { toast } = useToast()
  const projectId = (Array.isArray(params?.id) ? params.id[0] : params?.id) as Id<"projects"> | undefined
  const shareToken = searchParams.get("token")?.trim() ?? ""
  const protectedProject = useQuery(
    api.projects.get,
    projectId && !shareToken && isAuthenticated ? { id: projectId } : "skip"
  )
  const publicShare = useQuery(
    api.projects.getPublicShare,
    projectId && shareToken ? { id: projectId, token: shareToken } : "skip"
  )
  const rendersQuery = useQuery(
    api.renders.list,
    projectId && !shareToken && isAuthenticated ? { projectId } : "skip"
  )
  const commentsQuery = useQuery(
    api.comments.listComments,
    projectId && !shareToken && isAuthenticated ? { projectId } : "skip"
  )
  const currentMember = useQuery(
    api.members.currentMember,
    projectId && !shareToken && isAuthenticated ? { projectId } : "skip"
  )
  const membersQuery = useQuery(
    api.members.listMembers,
    projectId && !shareToken && isAuthenticated && currentMember?.role === "owner"
      ? { projectId }
      : "skip"
  )
  const inviteMember = useMutation(api.members.inviteMember)
  const removeMember = useMutation(api.members.removeMember)
  const updateRole = useMutation(api.members.updateRole)
  const [isExporting, setIsExporting] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const project = shareToken ? publicShare?.project : protectedProject
  const canManageMembers = !shareToken && currentMember?.role === "owner"
  const shareUrl = typeof window !== "undefined"
    ? window.location.href
    : `/projects/${projectId}/share${shareToken ? `?token=${shareToken}` : ""}`

  const floorPlans = useMemo(
    () => (project?.floorPlans ? sortFloors(project.floorPlans as PersistedFloorPlan[]) : []),
    [project?.floorPlans]
  )
  const floorLabelById = useMemo(
    () =>
      Object.fromEntries(
        floorPlans.map((floorPlan) => [floorPlan._id, formatFloorLabel(floorPlan.floor)])
      ),
    [floorPlans]
  )
  const comments = useMemo(
    () => ((shareToken ? publicShare?.comments : commentsQuery) ?? []) as ProjectComment[],
    [commentsQuery, publicShare?.comments, shareToken]
  )
  const activeCommentCount = useMemo(
    () => comments.filter((comment) => comment.status !== "resolved").length,
    [comments]
  )
  const commentsByFloorPlanId = useMemo(() => {
    const groupedComments: Record<string, ProjectComment[]> = {}

    for (const comment of comments) {
      if (!comment.floorPlanId) {
        continue
      }

      const floorComments = groupedComments[comment.floorPlanId] ?? []
      floorComments.push(comment)
      groupedComments[comment.floorPlanId] = floorComments
    }

    return groupedComments
  }, [comments])
  const renders = useMemo(
    () =>
      ((shareToken ? publicShare?.renders : rendersQuery) ?? []).map((render) => ({
        ...render,
        settings: {
          ...render.settings,
          viewAngle: (render.settings.viewAngle ?? DEFAULT_RENDER_VIEW_ANGLE) as RenderViewAngle
        }
      })),
    [publicShare?.renders, rendersQuery, shareToken]
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
          caption: `${getStyleLabel(r.style)} — ${RENDER_VIEW_ANGLE_LABELS[r.settings.viewAngle as RenderViewAngle]}`,
          badge: r.isFavorite ? "★ Favorite" : undefined
        })),
    [visibleRenders]
  )

  const exportRenders = useMemo(() => {
    const favs = renders.filter((r) => r.isFavorite && r.imageUrl)
    return favs.length > 0 ? favs : renders.filter((r) => r.imageUrl)
  }, [renders])
  const projectMembers = useMemo(
    () => (membersQuery ?? []) as ProjectMember[],
    [membersQuery]
  )

  async function handleInviteMember(email: string, role: ProjectMemberRole) {
    if (!projectId) return

    try {
      await inviteMember({
        projectId,
        email,
        role
      })
      toast("Project member invited", "success")
    } catch (error) {
      console.error("Unable to invite project member.", error)
      toast("Unable to invite that member", "error")
      throw error
    }
  }

  async function handleRemoveMember(memberId: string) {
    try {
      await removeMember({
        memberId: memberId as Id<"members">
      })
      toast("Project member removed", "success")
    } catch (error) {
      console.error("Unable to remove project member.", error)
      toast("Unable to remove that member", "error")
      throw error
    }
  }

  async function handleUpdateMemberRole(memberId: string, role: ProjectMemberRole) {
    try {
      await updateRole({
        memberId: memberId as Id<"members">,
        role
      })
      toast("Project member role updated", "success")
    } catch (error) {
      console.error("Unable to update project member role.", error)
      toast("Unable to update that role", "error")
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

  if (
    (projectId && shareToken && publicShare === undefined) ||
    (projectId && !shareToken && isAuthenticated && project === undefined) ||
    (projectId && !shareToken && isAuthenticated && rendersQuery === undefined) ||
    (projectId && !shareToken && isAuthenticated && commentsQuery === undefined)
  ) {
    return (
      <main className="page-shell">
        <SkeletonPanel height="300px" />
      </main>
    )
  }

  if (!projectId || publicShare === null || protectedProject === null || (!shareToken && !isAuthenticated)) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <div className="section-title">Project not found</div>
          <div className="muted">
            {shareToken
              ? "This shared presentation link is no longer available."
              : "Sign in with project access or use a public presentation link."}
          </div>
        </div>
      </main>
    )
  }

  if (!project) {
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
            <div className="stat-label">Active comments</div>
            <div className="stat-value share-stat">{activeCommentCount}</div>
          </div>
        </div>
      </section>

      <ShareLinkCard
        url={shareUrl}
        disabled={!shareToken}
        description={
          shareToken
            ? "Public read-only presentation link. Anyone with this token can view the shared floor plans and render gallery."
            : "Protected member presentation view. Enable and copy the public client link from the project overview."
        }
      />

      {canManageMembers ? (
        membersQuery === undefined ? (
          <SkeletonPanel height="260px" />
        ) : (
          <SharePermissionsPanel
            members={projectMembers}
            onInvite={handleInviteMember}
            onRemove={handleRemoveMember}
            onUpdateRole={handleUpdateMemberRole}
          />
        )
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
                  <ReadOnlyFloorPlanCanvas
                    data={floorPlan.data}
                    comments={commentsByFloorPlanId[floorPlan._id] ?? EMPTY_COMMENTS}
                  />
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
                      <span className="badge">{RENDER_VIEW_ANGLE_LABELS[render.settings.viewAngle as RenderViewAngle]}</span>
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

      <section className="panel" style={{ marginTop: "1.5rem" }}>
        <CommentsPanel
          comments={comments}
          floorLabelById={floorLabelById}
          showComposer={false}
          title="Review comments"
          subtitle="Pinned floor-plan feedback and reply history for this shared package."
        />
      </section>

      <Lightbox
        images={lightboxImages}
        startIndex={lightboxIndex ?? 0}
        open={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
      />
    </main>
  )
}
