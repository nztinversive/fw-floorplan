"use client"

import Image from "next/image"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { DraftingCompass, Download, Image as ImageIcon, Layers, Link2, MapPin, Pencil, Trash2, User, CalendarDays } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import Breadcrumb from "@/components/Breadcrumb"
import ConfirmDialog from "@/components/ConfirmDialog"
import ShareLinkCard from "@/components/ShareLinkCard"
import { SkeletonPanel } from "@/components/Skeleton"
import { useToast } from "@/components/Toast"
import UnsavedChangesGuard from "@/components/UnsavedChangesGuard"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { formatDate } from "@/lib/file-utils"
import { formatFloorLabel, getNextFloorNumber, getPrimaryFloor, sortFloors } from "@/lib/floor-utils"
import { createSeedFloorPlan } from "@/lib/geometry"
import { generateClientPackage, generateFloorPlanPreview } from "@/lib/pdf-export"
import type { PersistedFloorPlan } from "@/lib/types"

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const projectId = (Array.isArray(params?.id) ? params.id[0] : params?.id) as
    | Id<"projects">
    | undefined
  const project = useQuery(api.projects.get, projectId ? { id: projectId } : "skip")
  const rendersQuery = useQuery(api.renders.list, projectId ? { projectId } : "skip")
  const saveFloorPlan = useMutation(api.floorPlans.save)
  const updateProject = useMutation(api.projects.update)
  const removeProject = useMutation(api.projects.remove)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [isCreatingFloor, setIsCreatingFloor] = useState(false)
  const [pendingCreatedFloor, setPendingCreatedFloor] = useState<number | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Inline editing state
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState("")
  const [editAddress, setEditAddress] = useState("")
  const [editClient, setEditClient] = useState("")

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

  const activeFloorPlan = useMemo(
    () => orderedFloorPlans.find((floorPlan) => floorPlan.floor === selectedFloor) ?? null,
    [orderedFloorPlans, selectedFloor]
  )
  const activeFloorPreview = useMemo(
    () => (activeFloorPlan ? generateFloorPlanPreview(activeFloorPlan.data) : null),
    [activeFloorPlan]
  )

  function startEditing() {
    if (!project) return
    setEditName(project.name)
    setEditAddress(project.address ?? "")
    setEditClient(project.clientName ?? "")
    setIsEditing(true)
  }

  async function saveEdits() {
    if (!projectId || !editName.trim()) return

    try {
      await updateProject({
        id: projectId,
        name: editName.trim(),
        address: editAddress.trim() || undefined,
        clientName: editClient.trim() || undefined
      })
      setIsEditing(false)
      toast("Project details updated", "success")
    } catch (error) {
      console.error("Unable to update project.", error)
      toast("Unable to update project details", "error")
    }
  }

  function cancelEditing() {
    setIsEditing(false)
  }

  async function handleDeleteProject() {
    if (!projectId || isDeleting) return

    setIsDeleting(true)
    try {
      await removeProject({ id: projectId })
      toast("Project deleted", "success")
      router.push("/")
    } catch (error) {
      console.error("Unable to delete project.", error)
      toast("Unable to delete project", "error")
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  async function handleAddFloor() {
    if (!projectId || !project || isCreatingFloor) return

    const nextFloor = getNextFloorNumber(orderedFloorPlans)
    setIsCreatingFloor(true)

    try {
      await saveFloorPlan({
        projectId,
        floor: nextFloor,
        data: createSeedFloorPlan().data
      })
      setPendingCreatedFloor(nextFloor)
      setSelectedFloor(nextFloor)
      toast(`${formatFloorLabel(nextFloor)} created`, "success")
    } catch (error) {
      console.error("Unable to create floor.", error)
      toast("Unable to create another floor right now", "error")
    } finally {
      setIsCreatingFloor(false)
    }
  }

  async function handleExportPdf() {
    if (!project || isExportingPdf || rendersQuery === undefined) return

    if (orderedFloorPlans.length === 0) {
      toast("Save a floor plan before exporting", "warning")
      return
    }

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
      toast("Client package exported", "success")
    } catch (error) {
      console.error("Unable to export PDF package.", error)
      toast("Unable to export the client package right now", "error")
    } finally {
      setIsExportingPdf(false)
    }
  }

  if (projectId && project === undefined) {
    return (
      <main className="page-shell">
        <Breadcrumb items={[{ label: "Projects", href: "/" }, { label: "Loading..." }]} />
        <SkeletonPanel height="400px" />
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
      <UnsavedChangesGuard hasUnsavedChanges={isEditing} message="You have unsaved project edits. Are you sure you want to leave?" />
      <Breadcrumb items={[
        { label: "Projects", href: "/" },
        { label: project.name }
      ]} />

      <div className="page-heading">
        <div>
          {isEditing ? (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              <input
                className="inline-edit-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Project name"
                autoFocus
              />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  className="inline-edit-small"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Address"
                />
                <input
                  className="inline-edit-small"
                  value={editClient}
                  onChange={(e) => setEditClient(e.target.value)}
                  placeholder="Client name"
                />
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                <button type="button" className="button" onClick={saveEdits} disabled={!editName.trim()}>Save</button>
                <button type="button" className="button-ghost" onClick={cancelEditing}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="page-title">{project.name}</div>
              <div className="muted">
                {project.address || "No address yet"} | Updated {formatDate(project.updatedAt)}
              </div>
            </>
          )}
        </div>
        {!isEditing && (
          <div className="button-row" style={{ alignItems: "center" }}>
            <button type="button" className="button-ghost" onClick={startEditing} title="Edit project details">
              <Pencil size={16} />
              Edit
            </button>
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
            <button
              type="button"
              className="button-ghost"
              onClick={() => setShowDeleteDialog(true)}
              style={{ color: "#b42318" }}
              title="Delete project"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

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

              <div className="overview-thumb overview-thumb-v2" style={{ position: "relative" }}>
                {activeFloorPreview ? (
                  <Image
                    key={selectedFloor}
                    src={activeFloorPreview.dataUrl}
                    alt={`${project.name} ${formatFloorLabel(selectedFloor).toLowerCase()} preview`}
                    fill
                    sizes="(max-width: 1024px) 100vw, 70vw"
                    unoptimized
                    className="floor-preview-image"
                  />
                ) : (
                  <div className="floor-preview-empty">
                    <DraftingCompass size={28} />
                    <div>No floor preview available</div>
                    <div className="muted" style={{ fontSize: "0.82rem" }}>Open the editor to start drawing walls and rooms</div>
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
                <Link href={`/projects/${projectId}/share`} className="button-ghost">
                  <Link2 size={18} />
                  Share page
                </Link>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="section-title">No floor plans yet</div>
              <div className="muted">Create the first floor to start drafting and exporting.</div>
            </div>
          )}
        </section>

        <aside className="editor-sidebar">
          <div className="sidebar-card">
            <div className="panel-header">
              <div className="section-title">Project details</div>
            </div>
            <div className="detail-list">
              <div className="detail-item">
                <div className="detail-icon detail-icon-amber"><User size={14} /></div>
                <div>
                  <div className="detail-label">Client</div>
                  <div className="detail-value">{project.clientName || "Not set"}</div>
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-icon detail-icon-blue"><MapPin size={14} /></div>
                <div>
                  <div className="detail-label">Address</div>
                  <div className="detail-value">{project.address || "Not set"}</div>
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-icon detail-icon-green"><CalendarDays size={14} /></div>
                <div>
                  <div className="detail-label">Created</div>
                  <div className="detail-value">{formatDate(project.createdAt)}</div>
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-icon detail-icon-purple"><Layers size={14} /></div>
                <div>
                  <div className="detail-label">Floor plans</div>
                  <div className="detail-value">{orderedFloorPlans.length}</div>
                </div>
              </div>
            </div>
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
                    <div className="floor-stats-row">
                      <div className="floor-stat">
                        <span className="floor-stat-value">{floorPlan.data.rooms.length}</span>
                        <span className="floor-stat-label">rooms</span>
                      </div>
                      <div className="floor-stat">
                        <span className="floor-stat-value">{floorPlan.data.walls.length}</span>
                        <span className="floor-stat-label">walls</span>
                      </div>
                      <div className="floor-stat">
                        <span className="floor-stat-value">{floorPlan.data.doors?.length ?? 0}</span>
                        <span className="floor-stat-label">doors</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </aside>
      </div>

      <ShareLinkCard url={typeof window !== "undefined" ? `${window.location.origin}/projects/${projectId}/share` : `/projects/${projectId}/share`} />

      <ConfirmDialog
        open={showDeleteDialog}
        title="Delete project?"
        message={`This will permanently delete "${project.name}" including all floor plans, renders, and uploaded files. This action cannot be undone.`}
        confirmLabel={isDeleting ? "Deleting..." : "Delete project"}
        variant="danger"
        onConfirm={handleDeleteProject}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </main>
  )
}
