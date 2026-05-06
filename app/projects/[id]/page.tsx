"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useAction, useMutation, useQuery } from "convex/react"
import { AlertTriangle, CalendarDays, CheckCircle2, DraftingCompass, Download, Image as ImageIcon, Info, Layers, Link2, MapPin, MessageSquare, MoreHorizontal, Pencil, RotateCw, Trash2, User, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import Breadcrumb from "@/components/Breadcrumb"
import CommentsPanel from "@/components/CommentsPanel"
import ComplianceChecker from "@/components/ComplianceChecker"
import ConfirmDialog from "@/components/ConfirmDialog"
import CostEstimator from "@/components/CostEstimator"
import DesignReviewPanel from "@/components/DesignReviewPanel"
import FloorPlanConceptStudio from "@/components/FloorPlanConceptStudio"
import FloorPlanComparison from "@/components/FloorPlanComparison"
import PlanEditAssistantPanel from "@/components/PlanEditAssistantPanel"
import RoomAreaSummaryDashboard from "@/components/RoomAreaSummaryDashboard"
import RoomSchedule from "@/components/RoomSchedule"
import ShareLinkCard from "@/components/ShareLinkCard"
import { SkeletonPanel } from "@/components/Skeleton"
import { useToast } from "@/components/Toast"
import UnsavedChangesGuard from "@/components/UnsavedChangesGuard"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { generateDxf } from "@/lib/dxf-export"
import { formatDate } from "@/lib/file-utils"
import type { FloorPlanConcept } from "@/lib/floor-plan-concepts"
import { formatFloorLabel, getNextFloorNumber, getPrimaryFloor, sortFloors } from "@/lib/floor-utils"
import { createSeedFloorPlan } from "@/lib/geometry"
import { downloadJson, generateFloorPlanJson } from "@/lib/json-export"
import { generateClientPackage, generateFloorPlanPreview } from "@/lib/pdf-export"
import { buildPlanToRenderReadinessReport } from "@/lib/plan-to-render-readiness"
import {
  createPlanEditProposalFromAI,
  rankPlanEditProposals,
  type PlanEditConstraintSettings,
  type PlanEditProposal,
  type PlanEditRevisionDraft,
  type PlanEditRevisionRecord
} from "@/lib/plan-edit-assistant"
import { downloadSvg, generateSvg } from "@/lib/svg-export"
import type { PersistedFloorPlan, ProjectComment } from "@/lib/types"

type OverviewInsightsTab = "summary" | "design" | "cost" | "schedule" | "compliance"

const ReadOnlyFloorPlanCanvas = dynamic(() => import("@/components/ReadOnlyFloorPlanCanvas"), {
  ssr: false
})

function sanitizeFileStem(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "floor-plan"
  )
}

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [showExtractionBanner, setShowExtractionBanner] = useState(false)
  const projectId = (Array.isArray(params?.id) ? params.id[0] : params?.id) as
    | Id<"projects">
    | undefined
  const project = useQuery(api.projects.get, projectId ? { id: projectId } : "skip")
  const childQueryArgs = projectId && project ? { projectId } : "skip"
  const commentsQuery = useQuery(api.comments.listComments, childQueryArgs)
  const rendersQuery = useQuery(api.renders.list, childQueryArgs)
  const versionsQuery = useQuery(api.versions.listProjectVersions, childQueryArgs)
  const saveFloorPlan = useMutation(api.floorPlans.save)
  const saveFloorPlanVersion = useMutation(api.versions.saveVersion)
  const savePlanEditRevision = useMutation(api.planEditRevisions.save)
  const selectPlanEditRevisionOption = useMutation(api.planEditRevisions.selectOption)
  const updateProject = useMutation(api.projects.update)
  const removeProject = useMutation(api.projects.remove)
  const generateAiConcepts = useAction(api.floorPlanConcepts.generateWithAI)
  const generateAiPlanEdits = useAction(api.planEditAssistant.generateWithAI)
  const enablePublicShare = useMutation(api.projects.enablePublicShare)
  const rotatePublicShare = useMutation(api.projects.rotatePublicShare)
  const disablePublicShare = useMutation(api.projects.disablePublicShare)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [isCreatingFloor, setIsCreatingFloor] = useState(false)
  const [isSavingConceptFloor, setIsSavingConceptFloor] = useState(false)
  const [isSavingPlanEditFloor, setIsSavingPlanEditFloor] = useState(false)
  const [isApplyingPlanEditFloor, setIsApplyingPlanEditFloor] = useState(false)
  const [pendingCreatedFloor, setPendingCreatedFloor] = useState<number | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showComparisonDialog, setShowComparisonDialog] = useState(false)
  const [showCommentsSection, setShowCommentsSection] = useState(false)
  const [showProjectActions, setShowProjectActions] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUpdatingShareLink, setIsUpdatingShareLink] = useState(false)
  const [activeInsightsTab, setActiveInsightsTab] = useState<OverviewInsightsTab>("summary")

  useEffect(() => {
    if (searchParams.get("extraction") === "failed") {
      setShowExtractionBanner(true)
    }
  }, [searchParams])

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
  const planEditRevisionsQuery = useQuery(
    api.planEditRevisions.list,
    projectId && project && activeFloorPlan
      ? { projectId, floor: activeFloorPlan.floor }
      : "skip"
  )
  const savedPlanEditRevisions = useMemo(
    () => (planEditRevisionsQuery ?? []) as PlanEditRevisionRecord[],
    [planEditRevisionsQuery]
  )
  const activePlanToRenderReadiness = useMemo(
    () =>
      activeFloorPlan
        ? buildPlanToRenderReadinessReport({
          floorPlans: [activeFloorPlan],
          renderBrief: project?.renderBrief,
          selectedFloor
        })
        : null,
    [activeFloorPlan, project?.renderBrief, selectedFloor]
  )
  const comments = useMemo(() => (commentsQuery ?? []) as ProjectComment[], [commentsQuery])
  const activeCommentCount = useMemo(
    () => comments.filter((comment) => comment.status !== "resolved").length,
    [comments]
  )
  const activeFloorComments = useMemo(
    () => comments.filter((comment) => comment.floorPlanId === activeFloorPlan?._id),
    [activeFloorPlan?._id, comments]
  )
  const floorLabelById = useMemo(
    () =>
      Object.fromEntries(
        orderedFloorPlans.map((floorPlan) => [floorPlan._id, formatFloorLabel(floorPlan.floor)])
      ),
    [orderedFloorPlans]
  )
  const comparisonOptionsCount = orderedFloorPlans.length + (versionsQuery?.length ?? 0)
  const publicShareUrl =
    typeof window !== "undefined" && projectId && project?.publicShareEnabled && project.publicShareToken
      ? `${window.location.origin}/projects/${projectId}/share?token=${project.publicShareToken}`
      : typeof window !== "undefined" && projectId
        ? `${window.location.origin}/projects/${projectId}/share`
        : projectId
          ? `/projects/${projectId}/share`
          : ""
  const clientPackageChecks = [
    {
      label: "Floor plan saved",
      ready: orderedFloorPlans.length > 0,
      detail:
        orderedFloorPlans.length > 0
          ? `${orderedFloorPlans.length} floor${orderedFloorPlans.length === 1 ? "" : "s"} available for presentation.`
          : "Create or save at least one floor before sharing."
    },
    {
      label: "Render concepts",
      ready: (rendersQuery?.length ?? 0) > 0,
      detail:
        (rendersQuery?.length ?? 0) > 0
          ? `${rendersQuery?.length ?? 0} render${rendersQuery?.length === 1 ? "" : "s"} available.`
          : "Generate at least one exterior render for a complete client package."
    },
    {
      label: "Public presentation link",
      ready: Boolean(project?.publicShareEnabled && project.publicShareToken),
      detail: project?.publicShareEnabled
        ? "Anyone with the tokenized link can view the read-only presentation."
        : "Enable a public link when the package is ready to send."
    },
    {
      label: "Review comments",
      ready: activeCommentCount === 0,
      detail:
        activeCommentCount === 0
          ? "No open review comments are waiting."
          : `${activeCommentCount} active comment${activeCommentCount === 1 ? "" : "s"} remain.`
    }
  ]
  const clientPackageReadyCount = clientPackageChecks.filter((check) => check.ready).length

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
        address: editAddress.trim(),
        clientName: editClient.trim()
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

  async function handleEnablePublicShare() {
    if (!projectId || isUpdatingShareLink) return

    setIsUpdatingShareLink(true)
    try {
      await enablePublicShare({ id: projectId })
      toast("Public presentation link enabled", "success")
    } catch (error) {
      console.error("Unable to enable public share link.", error)
      toast("Unable to enable public share link", "error")
    } finally {
      setIsUpdatingShareLink(false)
    }
  }

  async function handleRotatePublicShare() {
    if (!projectId || isUpdatingShareLink) return

    setIsUpdatingShareLink(true)
    try {
      await rotatePublicShare({ id: projectId })
      toast("Public presentation link rotated", "success")
    } catch (error) {
      console.error("Unable to rotate public share link.", error)
      toast("Unable to rotate public share link", "error")
    } finally {
      setIsUpdatingShareLink(false)
    }
  }

  async function handleDisablePublicShare() {
    if (!projectId || isUpdatingShareLink) return

    setIsUpdatingShareLink(true)
    try {
      await disablePublicShare({ id: projectId })
      toast("Public presentation link disabled", "success")
    } catch (error) {
      console.error("Unable to disable public share link.", error)
      toast("Unable to disable public share link", "error")
    } finally {
      setIsUpdatingShareLink(false)
    }
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

  async function handleSaveConceptFloor(concept: FloorPlanConcept) {
    if (!projectId || !project || isCreatingFloor || isSavingConceptFloor) return

    const nextFloor = getNextFloorNumber(orderedFloorPlans)
    setIsSavingConceptFloor(true)

    try {
      await saveFloorPlan({
        projectId,
        floor: nextFloor,
        data: concept.data
      })
      setPendingCreatedFloor(nextFloor)
      setSelectedFloor(nextFloor)
      toast(`${concept.name} saved as ${formatFloorLabel(nextFloor)}`, "success")
      router.push(`/projects/${projectId}/edit?floor=${nextFloor}`)
    } catch (error) {
      console.error("Unable to save generated concept.", error)
      toast("Unable to save the generated plan option", "error")
    } finally {
      setIsSavingConceptFloor(false)
    }
  }

  async function handleGeneratePlanEditsWithAI(request: {
    prompt: string
    constraints: PlanEditConstraintSettings
    sourceData: PersistedFloorPlan["data"]
  }) {
    if (!projectId || !activeFloorPlan) {
      throw new Error("Select a floor before generating AI plan edits")
    }

    const aiProposals = await generateAiPlanEdits({
      projectId,
      floor: activeFloorPlan.floor,
      sourceData: request.sourceData,
      prompt: request.prompt,
      constraints: request.constraints
    })

    return rankPlanEditProposals(
      aiProposals.map((proposal, index) =>
        createPlanEditProposalFromAI(request.sourceData, request.prompt, proposal, index, request.constraints)
      )
    )
  }

  async function handleSavePlanEditRevision(revision: PlanEditRevisionDraft) {
    if (!projectId || !activeFloorPlan) return

    try {
      await savePlanEditRevision({
        projectId,
        floor: activeFloorPlan.floor,
        clientId: revision.clientId,
        prompt: revision.prompt,
        sourceLabel: revision.sourceLabel,
        sourceData: revision.sourceData,
        selectedProposalId: revision.selectedProposalId,
        mode: revision.mode,
        proposals: revision.proposals
      })
    } catch (error) {
      console.error("Unable to save plan edit revision.", error)
      toast("Unable to save the plan edit history entry", "error")
    }
  }

  async function handleSelectPlanEditRevisionOption(clientId: string, proposalId: string) {
    if (!projectId) return

    try {
      await selectPlanEditRevisionOption({
        projectId,
        clientId,
        selectedProposalId: proposalId
      })
    } catch (error) {
      console.error("Unable to update plan edit revision selection.", error)
    }
  }

  async function handleSavePlanEditFloor(proposal: PlanEditProposal) {
    if (!projectId || !project || isCreatingFloor || isSavingPlanEditFloor) return

    const nextFloor = getNextFloorNumber(orderedFloorPlans)
    setIsSavingPlanEditFloor(true)

    try {
      await saveFloorPlan({
        projectId,
        floor: nextFloor,
        data: proposal.data
      })
      setPendingCreatedFloor(nextFloor)
      setSelectedFloor(nextFloor)
      toast(`${proposal.title} saved as ${formatFloorLabel(nextFloor)}`, "success")
      router.push(`/projects/${projectId}/edit?floor=${nextFloor}`)
    } catch (error) {
      console.error("Unable to save plan edit proposal.", error)
      toast("Unable to save the plan edit preview", "error")
    } finally {
      setIsSavingPlanEditFloor(false)
    }
  }

  async function handleApplyPlanEditToCurrentFloor(proposal: PlanEditProposal) {
    if (!projectId || !project || !activeFloorPlan || isApplyingPlanEditFloor) return

    const floorLabel = formatFloorLabel(activeFloorPlan.floor)
    setIsApplyingPlanEditFloor(true)

    try {
      await saveFloorPlanVersion({
        projectId,
        floor: activeFloorPlan.floor,
        name: `Before ${proposal.title}`,
        data: activeFloorPlan.data
      })
      await saveFloorPlan({
        projectId,
        floor: activeFloorPlan.floor,
        data: proposal.data
      })
      setSelectedFloor(activeFloorPlan.floor)
      toast(`${proposal.title} applied to ${floorLabel}. Previous plan saved as a version.`, "success")
    } catch (error) {
      console.error("Unable to apply plan edit proposal.", error)
      toast("Unable to apply this plan edit right now", "error")
    } finally {
      setIsApplyingPlanEditFloor(false)
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

  function handleExportDxf() {
    if (!project || !activeFloorPlan) return

    const dxf = generateDxf(activeFloorPlan.data, project.name)
    const safeName = project.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "floor-plan"
    const blob = new Blob([dxf], { type: "application/dxf;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${safeName}-${formatFloorLabel(selectedFloor).toLowerCase().replace(/\s+/g, "-")}.dxf`
    link.click()
    URL.revokeObjectURL(url)
    toast("DXF exported", "success")
  }

  function handleExportSvg() {
    if (!project || !activeFloorPlan) return

    const svg = generateSvg(activeFloorPlan.data, { showGrid: true })
    const safeName = sanitizeFileStem(project.name)
    const floorLabel = formatFloorLabel(selectedFloor).toLowerCase().replace(/\s+/g, "-")
    downloadSvg(svg, `${safeName}-${floorLabel}.svg`)
    toast("SVG exported", "success")
  }

  function handleExportJson() {
    if (!project || !activeFloorPlan) return

    const floorLabel = formatFloorLabel(selectedFloor)
    const json = generateFloorPlanJson({
      projectName: project.name,
      floorLabel,
      data: activeFloorPlan.data
    })
    const safeName = sanitizeFileStem(project.name)
    downloadJson(json, `${safeName}-${floorLabel.toLowerCase().replace(/\s+/g, "-")}.json`)
    toast("JSON exported", "success")
  }

  if (projectId && project === undefined) {
    return (
      <main className="page-shell">
        <Breadcrumb items={[{ label: "Projects", href: "/" }, { label: "Loading..." }]} />
        <SkeletonPanel height="400px" />
      </main>
    )
  }

  if (!projectId || !project) {
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

      {showExtractionBanner ? (
        <div className="info-banner" style={{ marginBottom: "1rem" }}>
          <Info size={18} />
          <div>
            <strong>AI extraction was unable to read this image.</strong>{" "}
            A starter layout has been provided — use the source image overlay in the editor to trace your floor plan.
          </div>
          <button type="button" className="icon-button" onClick={() => setShowExtractionBanner(false)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ) : null}

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
        {!isEditing ? (
          <div className="overview-heading-actions">
            <button
              type="button"
              className={`overview-comment-chip${showCommentsSection ? " is-active" : ""}`}
              onClick={() => setShowCommentsSection((open) => !open)}
            >
              <MessageSquare size={16} />
              <span>{showCommentsSection ? "Hide comments" : "Comments"}</span>
              <strong>{activeCommentCount}</strong>
            </button>

            {activeFloorPlan ? (
              <Link href={`/projects/${projectId}/edit?floor=${selectedFloor}`} className="button">
                <DraftingCompass size={18} />
                Open editor
              </Link>
            ) : (
              <button
                type="button"
                className="button"
                onClick={handleAddFloor}
                disabled={isCreatingFloor}
              >
                {isCreatingFloor ? "Creating..." : "Add floor"}
              </button>
            )}

            <button
              type="button"
              className={`button-secondary overview-more-button${showProjectActions ? " is-active" : ""}`}
              onClick={() => setShowProjectActions((open) => !open)}
              aria-expanded={showProjectActions}
            >
              <MoreHorizontal size={18} />
              More actions
            </button>
          </div>
        ) : null}
      </div>

      {!isEditing && showProjectActions ? (
        <section className="panel overview-actions-panel">
          <div className="overview-actions-grid">
            <button type="button" className="overview-action-tile" onClick={startEditing}>
              <Pencil size={17} />
              <span>Edit details</span>
            </button>
            <button
              type="button"
              className="overview-action-tile"
              onClick={handleAddFloor}
              disabled={isCreatingFloor}
            >
              <Layers size={17} />
              <span>{isCreatingFloor ? "Creating..." : "Add floor"}</span>
            </button>
            <button
              type="button"
              className="overview-action-tile"
              onClick={() => setShowComparisonDialog(true)}
              disabled={comparisonOptionsCount < 2 || versionsQuery === undefined}
            >
              <DraftingCompass size={17} />
              <span>Compare plans</span>
            </button>
            <button
              type="button"
              className="overview-action-tile"
              onClick={handleExportPdf}
              disabled={isExportingPdf || rendersQuery === undefined || orderedFloorPlans.length === 0}
            >
              <Download size={17} />
              <span>{isExportingPdf ? "Exporting..." : "Export PDF"}</span>
            </button>
            <button
              type="button"
              className="overview-action-tile"
              onClick={handleExportDxf}
              disabled={orderedFloorPlans.length === 0}
            >
              <Download size={17} />
              <span>Export DXF</span>
            </button>
            <button
              type="button"
              className="overview-action-tile"
              onClick={handleExportSvg}
              disabled={orderedFloorPlans.length === 0}
            >
              <Download size={17} />
              <span>Export SVG</span>
            </button>
            <button
              type="button"
              className="overview-action-tile"
              onClick={handleExportJson}
              disabled={orderedFloorPlans.length === 0}
            >
              <Download size={17} />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              className="overview-action-tile is-danger"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 size={17} />
              <span>Delete project</span>
            </button>
          </div>
        </section>
      ) : null}

      <FloorPlanConceptStudio
        projectName={project.name}
        floorCount={orderedFloorPlans.length}
        isSaving={isSavingConceptFloor}
        onGenerateConcepts={(brief) => generateAiConcepts({ projectId, brief })}
        onSaveConcept={handleSaveConceptFloor}
      />

      <PlanEditAssistantPanel
        floorLabel={activeFloorPlan ? formatFloorLabel(activeFloorPlan.floor) : "the selected floor"}
        sourceData={activeFloorPlan?.data ?? null}
        isSaving={isSavingPlanEditFloor}
        isApplying={isApplyingPlanEditFloor}
        onGenerateWithAI={handleGeneratePlanEditsWithAI}
        savedRevisions={savedPlanEditRevisions}
        onSaveRevision={handleSavePlanEditRevision}
        onSelectRevisionOption={handleSelectPlanEditRevisionOption}
        onSaveProposal={handleSavePlanEditFloor}
        onApplyProposal={activeFloorPlan ? handleApplyPlanEditToCurrentFloor : undefined}
      />

      <section className="panel overview-readiness-panel">
        <div className="panel-header">
          <div>
            <div className="section-title">Client presentation readiness</div>
            <div className="muted">
              Package status before sharing the read-only client view.
            </div>
          </div>
          <span className="badge">
            {clientPackageReadyCount}/{clientPackageChecks.length} ready
          </span>
        </div>
        <div className="overview-readiness-grid">
          {clientPackageChecks.map((check) => {
            const Icon = check.ready ? CheckCircle2 : AlertTriangle

            return (
              <div key={check.label} className={`overview-readiness-item${check.ready ? " is-ready" : ""}`}>
                <Icon size={16} />
                <div>
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {activePlanToRenderReadiness ? (
        <section className={`panel plan-to-render-readiness-panel is-${activePlanToRenderReadiness.status}`}>
          <div className="panel-header">
            <div>
              <div className="section-title">Plan-to-render readiness</div>
              <div className="muted">
                Checks whether {formatFloorLabel(selectedFloor).toLowerCase()} is safe to send into render generation.
              </div>
            </div>
            <span className={`badge plan-to-render-readiness-status is-${activePlanToRenderReadiness.status}`}>
              {activePlanToRenderReadiness.status === "ready" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              {activePlanToRenderReadiness.label}
            </span>
          </div>

          <div className="plan-to-render-readiness-summary">
            <div>
              <div className="plan-to-render-readiness-score">{activePlanToRenderReadiness.score}</div>
              <div className="plan-to-render-readiness-score-label">ready</div>
            </div>
            <div>
              <div className="plan-to-render-readiness-copy">{activePlanToRenderReadiness.summary}</div>
              <div className="plan-to-render-readiness-detail">
                Hard blockers lock render generation; review items are folded into the prompt as guardrails.
              </div>
            </div>
          </div>

          <div className="button-row">
            <Link href={`/projects/${projectId}/renders`} className="button-secondary">
              Open render studio
            </Link>
            {activePlanToRenderReadiness.status !== "ready" ? (
              <Link href={`/projects/${projectId}/edit?floor=${selectedFloor}`} className="button-ghost">
                Fix before render
              </Link>
            ) : null}
          </div>
        </section>
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

              {activeFloorPlan ? (
                <ReadOnlyFloorPlanCanvas
                  data={activeFloorPlan.data}
                  comments={activeFloorComments}
                />
              ) : (
                <div className="overview-thumb overview-thumb-v2" style={{ position: "relative" }}>
                  <div className="floor-preview-empty">
                    <DraftingCompass size={28} />
                    <div>No floor preview available</div>
                    <div className="muted" style={{ fontSize: "0.82rem" }}>Open the editor to start drawing walls and rooms</div>
                  </div>
                </div>
              )}

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

      <section className="panel insights-panel">
        <div className="panel-header">
          <div>
            <div className="section-title">Construction workflow</div>
            <div className="muted">
              Project-wide area analytics plus selected-floor design, estimating, scheduling, and validation.
            </div>
          </div>
          <span className="badge">
            {activeInsightsTab === "summary"
              ? `${orderedFloorPlans.length} floor${orderedFloorPlans.length === 1 ? "" : "s"}`
              : activeFloorPlan
                ? formatFloorLabel(activeFloorPlan.floor)
                : "No floor selected"}
          </span>
        </div>

        <div className="insights-tabs" role="tablist" aria-label="Construction workflow sections">
          {[
            { key: "summary", label: "Area summary" },
            { key: "design", label: "Design review" },
            { key: "cost", label: "Cost estimator" },
            { key: "schedule", label: "Room schedule" },
            { key: "compliance", label: "Compliance" }
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeInsightsTab === tab.key}
              className={`insight-tab${activeInsightsTab === tab.key ? " is-active" : ""}`}
              onClick={() => setActiveInsightsTab(tab.key as OverviewInsightsTab)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          className="insight-panel"
          hidden={activeInsightsTab !== "summary"}
        >
          <RoomAreaSummaryDashboard
            floorPlans={orderedFloorPlans.map((floorPlan) => ({
              floor: floorPlan.floor,
              data: floorPlan.data
            }))}
          />
        </div>

        <div
          role="tabpanel"
          className="insight-panel"
          hidden={activeInsightsTab !== "design"}
        >
          {activeFloorPlan ? (
            <DesignReviewPanel data={activeFloorPlan.data} />
          ) : (
            <div className="empty-state compact-empty-state">
              <div className="section-title">No floor selected</div>
              <div className="muted">Create or choose a floor plan to review home-design quality.</div>
            </div>
          )}
        </div>

        <div
          role="tabpanel"
          className="insight-panel"
          hidden={activeInsightsTab !== "cost"}
        >
          {activeFloorPlan ? (
            <CostEstimator data={activeFloorPlan.data} />
          ) : (
            <div className="empty-state compact-empty-state">
              <div className="section-title">No floor selected</div>
              <div className="muted">Create or choose a floor plan to estimate material costs.</div>
            </div>
          )}
        </div>

        <div
          role="tabpanel"
          className="insight-panel"
          hidden={activeInsightsTab !== "schedule"}
        >
          {activeFloorPlan ? (
            <RoomSchedule data={activeFloorPlan.data} floor={activeFloorPlan.floor} />
          ) : (
            <div className="empty-state compact-empty-state">
              <div className="section-title">No floor selected</div>
              <div className="muted">Create or choose a floor plan to generate a room schedule.</div>
            </div>
          )}
        </div>

        <div
          role="tabpanel"
          className="insight-panel"
          hidden={activeInsightsTab !== "compliance"}
        >
          {activeFloorPlan ? (
            <ComplianceChecker data={activeFloorPlan.data} />
          ) : (
            <div className="empty-state compact-empty-state">
              <div className="section-title">No floor selected</div>
              <div className="muted">Create or choose a floor plan to run validation checks.</div>
            </div>
          )}
        </div>
      </section>

      {showCommentsSection ? (
        <section className="panel" style={{ marginTop: "1.5rem" }}>
          <CommentsPanel
            comments={comments}
            floorLabelById={floorLabelById}
            showComposer={false}
            title="Project comments"
            subtitle="Track review notes and resolved items across all saved floors."
          />
        </section>
      ) : null}

      <ShareLinkCard
        url={publicShareUrl}
        disabled={!project.publicShareEnabled}
        description={
          project.publicShareEnabled
            ? "Public read-only client presentation link. Anyone with the token can view floor plans, renders, and comments."
            : "Enable a tokenized public link when this package is ready for a client."
        }
        actions={
          project.publicShareEnabled ? (
            <>
              <button
                type="button"
                className="button-ghost"
                onClick={handleRotatePublicShare}
                disabled={isUpdatingShareLink}
              >
                <RotateCw size={16} />
                Rotate
              </button>
              <button
                type="button"
                className="button-ghost"
                onClick={handleDisablePublicShare}
                disabled={isUpdatingShareLink}
              >
                Disable
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button-secondary"
              onClick={handleEnablePublicShare}
              disabled={isUpdatingShareLink}
            >
              <Link2 size={16} />
              {isUpdatingShareLink ? "Enabling..." : "Enable public link"}
            </button>
          )
        }
      />

      {showComparisonDialog ? (
        <div className="dialog-backdrop" onClick={() => setShowComparisonDialog(false)}>
          <div
            className="dialog-panel floor-compare-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="floor-compare-title"
          >
            <div className="dialog-body">
              <div className="comparison-header">
                <div>
                  <div className="dialog-title" id="floor-compare-title">
                    Compare floor plans
                  </div>
                  <div className="dialog-message">
                    Review floor-to-floor changes, saved versions, and the current state in one place.
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowComparisonDialog(false)}
                  aria-label="Close floor plan comparison"
                >
                  <X size={18} />
                </button>
              </div>

              <FloorPlanComparison
                orderedFloorPlans={orderedFloorPlans}
                versions={versionsQuery ?? []}
              />
            </div>
          </div>
        </div>
      ) : null}

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
