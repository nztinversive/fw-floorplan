"use client"

import Image from "next/image"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useAction, useMutation, useQuery } from "convex/react"
import { AlertTriangle, Download, ImagePlus, Palette, Sparkles, Trash2, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import Breadcrumb from "@/components/Breadcrumb"
import ConfirmDialog from "@/components/ConfirmDialog"
import Lightbox from "@/components/Lightbox"
import RenderCard from "@/components/RenderCard"
import RenderProgress from "@/components/RenderProgress"
import SettingTooltip, { SETTING_TOOLTIPS } from "@/components/SettingTooltip"
import { SkeletonPanel } from "@/components/Skeleton"
import StyleSelector from "@/components/StyleSelector"
import { useToast } from "@/components/Toast"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import {
  DEFAULT_RENDER_VIEW_ANGLE,
  RENDER_VIEW_ANGLE_LABELS,
  RENDER_VIEW_ANGLES,
  type RenderViewAngle
} from "@/lib/render-angles"
import {
  RENDER_SETTING_OPTIONS,
  STYLE_PRESET_MAP,
  STYLE_PRESETS,
  type StylePresetDefaults,
  type StylePresetId
} from "@/lib/style-presets"
import { generateClientPackage, generateFloorPlanPreview } from "@/lib/pdf-export"
import { sortFloors } from "@/lib/floor-utils"
import type { PersistedFloorPlan, RenderBrief, RenderSettings, StoredRender, StoredRenderPreset } from "@/lib/types"

type PendingRenderAction = "favorite" | "delete" | "regenerate"
type SettingKey = keyof StylePresetDefaults
type BatchProgress = {
  completed: number
  total: number
  failed: number
}

const INITIAL_STYLE = STYLE_PRESETS[0].id
const EMPTY_BATCH_PROGRESS: BatchProgress = {
  completed: 0,
  total: 0,
  failed: 0
}
const EMPTY_RENDER_BRIEF: RenderBrief = {
  designNotes: "",
  mustHave: "",
  avoid: "",
  revisionNotes: ""
}

function getDefaultSettings(
  styleId: StylePresetId,
  viewAngle: RenderViewAngle = DEFAULT_RENDER_VIEW_ANGLE
): RenderSettings {
  return {
    style: styleId,
    ...STYLE_PRESET_MAP[styleId].defaultSettings,
    viewAngle
  }
}

function getStyleLabel(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? style
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(timestamp)
}

export default function ProjectRendersPage() {
  const params = useParams<{ id: string }>()
  const { toast } = useToast()
  const projectId = (Array.isArray(params?.id) ? params.id[0] : params?.id) as Id<"projects"> | undefined
  const project = useQuery(api.projects.get, projectId ? { id: projectId } : "skip")
  const rendersQuery = useQuery(api.renders.list, projectId ? { projectId } : "skip")
  const presetsQuery = useQuery(api.renderPresets.listPresets, projectId ? { projectId } : "skip")
  const generateRender = useAction(api.renders.generateRender)
  const toggleFavorite = useMutation(api.renders.toggleFavorite)
  const removeRender = useMutation(api.renders.remove)
  const savePreset = useMutation(api.renderPresets.savePreset)
  const deletePreset = useMutation(api.renderPresets.deletePreset)
  const updateRenderBrief = useMutation(api.projects.updateRenderBrief)

  const [selectedStyle, setSelectedStyle] = useState<StylePresetId>(INITIAL_STYLE)
  const [settings, setSettings] = useState<RenderSettings>(() => getDefaultSettings(INITIAL_STYLE))
  const [renderBrief, setRenderBrief] = useState<RenderBrief>(EMPTY_RENDER_BRIEF)
  const [presetName, setPresetName] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isBatchGenerating, setIsBatchGenerating] = useState(false)
  const [isSavingBrief, setIsSavingBrief] = useState(false)
  const [isSavingPreset, setIsSavingPreset] = useState(false)
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState<BatchProgress>(EMPTY_BATCH_PROGRESS)
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false)
  const [batchStyles, setBatchStyles] = useState<StylePresetId[]>([INITIAL_STYLE])
  const [batchAngles, setBatchAngles] = useState<RenderViewAngle[]>([DEFAULT_RENDER_VIEW_ANGLE])
  const [comparisonMode, setComparisonMode] = useState(false)
  const [selectedRenderIds, setSelectedRenderIds] = useState<string[]>([])
  const [isExportingPackage, setIsExportingPackage] = useState(false)
  const [pendingRenderAction, setPendingRenderAction] = useState<{
    renderId: string
    action: PendingRenderAction
  } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const renders = useMemo<StoredRender[]>(
    () =>
      (rendersQuery ?? []).map((render) => ({
        id: render._id,
        projectId: render.projectId,
        style: render.style,
        settings: {
          ...render.settings,
          viewAngle: render.settings.viewAngle ?? DEFAULT_RENDER_VIEW_ANGLE
        },
        imageStorageId: render.imageStorageId,
        imageUrl: render.imageUrl,
        prompt: render.prompt,
        isFavorite: render.isFavorite,
        createdAt: render.createdAt
      })),
    [rendersQuery]
  )
  const renderPresets = useMemo<StoredRenderPreset[]>(
    () =>
      (presetsQuery ?? []).map((preset) => ({
        id: preset._id,
        projectId: preset.projectId,
        name: preset.name,
        style: preset.style,
        viewAngle: (preset.settings.viewAngle ?? preset.viewAngle) as RenderViewAngle,
        settings: {
          ...preset.settings,
          style: preset.style,
          viewAngle: (preset.settings.viewAngle ?? preset.viewAngle) as RenderViewAngle
        },
        createdAt: preset.createdAt
      })),
    [presetsQuery]
  )

  const comparisonRenders = useMemo(
    () => selectedRenderIds.map((renderId) => renders.find((render) => render.id === renderId)).filter(Boolean) as StoredRender[],
    [renders, selectedRenderIds]
  )

  const exportRenders = useMemo(() => {
    const favoriteRenders = renders.filter((render) => render.isFavorite && render.imageUrl)
    return favoriteRenders.length > 0 ? favoriteRenders : renders.filter((render) => render.imageUrl)
  }, [renders])

  const lightboxImages = useMemo(
    () =>
      renders
        .filter((r) => r.imageUrl)
        .map((r) => ({
          src: r.imageUrl!,
          alt: `${getStyleLabel(r.style)} render`,
          caption: `${getStyleLabel(r.style)} — ${RENDER_VIEW_ANGLE_LABELS[r.settings.viewAngle]}`,
          badge: r.isFavorite ? "★ Favorite" : undefined
        })),
    [renders]
  )
  const isGenerationBusy = isGenerating || isBatchGenerating
  const batchRenderCount = batchStyles.length * batchAngles.length
  const batchProgressPercent =
    batchProgress.total > 0 ? (batchProgress.completed / batchProgress.total) * 100 : 0
  const batchProgressLabel =
    batchProgress.total > 0
      ? `Generating ${Math.min(batchProgress.completed + 1, batchProgress.total)} of ${batchProgress.total}...`
      : null
  const loadedProjectId = project?._id
  const loadedRenderBrief = project?.renderBrief
  const persistedRenderBrief = project?.renderBrief ?? EMPTY_RENDER_BRIEF
  const isRenderBriefDirty = useMemo(
    () => JSON.stringify(renderBrief) !== JSON.stringify(persistedRenderBrief),
    [persistedRenderBrief, renderBrief]
  )
  const hasRenderBriefContent = Object.values(renderBrief).some((value) => value.trim().length > 0)

  useEffect(() => {
    if (loadedProjectId) {
      setRenderBrief(loadedRenderBrief ?? EMPTY_RENDER_BRIEF)
    }
  }, [loadedProjectId, loadedRenderBrief])

  function updateRenderBriefField(key: keyof RenderBrief, value: string) {
    setRenderBrief((current) => ({
      ...current,
      [key]: value
    }))
  }

  async function saveRenderBrief(options: { silent?: boolean } = {}) {
    if (!projectId || isSavingBrief) {
      return
    }

    setIsSavingBrief(true)

    try {
      await updateRenderBrief({
        id: projectId,
        renderBrief
      })
      if (!options.silent) {
        toast("Render brief saved", "success")
      }
    } catch (error) {
      console.error("Unable to save render brief.", error)
      toast("Unable to save the render brief", "error")
      throw error
    } finally {
      setIsSavingBrief(false)
    }
  }

  function handleOpenLightbox(renderId: string) {
    const renderIndex = renders.filter((r) => r.imageUrl).findIndex((r) => r.id === renderId)
    if (renderIndex >= 0) setLightboxIndex(renderIndex)
  }

  function handleStyleSelect(styleId: StylePresetId) {
    setSelectedStyle(styleId)
    setSettings((current) => getDefaultSettings(styleId, current.viewAngle))
  }

  function handleLoadPreset(preset: StoredRenderPreset) {
    const nextStyle = preset.style as StylePresetId

    setSelectedStyle(nextStyle)
    setSettings({
      ...preset.settings,
      style: nextStyle,
      viewAngle: preset.viewAngle
    })
    toast(`Loaded preset "${preset.name}"`, "info")
  }

  function updateSetting(key: SettingKey, value: string) {
    setSettings((current) => ({
      ...current,
      style: selectedStyle,
      [key]: value
    }))
  }

  function handleViewAngleSelect(viewAngle: RenderViewAngle) {
    setSettings((current) => ({
      ...current,
      style: selectedStyle,
      viewAngle
    }))
  }

  async function triggerGeneration(nextStyle: string, nextSettings: RenderSettings) {
    if (!projectId || isGenerationBusy) return

    setErrorMessage(null)
    setIsGenerating(true)

    try {
      if (isRenderBriefDirty) {
        await saveRenderBrief({ silent: true })
      }
      await generateRender({
        projectId,
        style: nextStyle,
        viewAngle: nextSettings.viewAngle,
        settings: {
          ...nextSettings,
          style: nextStyle
        },
        renderBrief
      })
      toast("Render generated successfully", "success")
    } catch (error) {
      console.error("Unable to generate render.", error)
      setErrorMessage("Unable to generate a render right now. Check the floor plan and API configuration, then try again.")
      toast("Render generation failed", "error")
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleGenerateRender() {
    await triggerGeneration(selectedStyle, settings)
  }

  async function handleSavePreset() {
    const trimmedName = presetName.trim()
    if (!projectId || isSavingPreset) {
      return
    }

    if (!trimmedName) {
      toast("Enter a preset name before saving", "warning")
      return
    }

    setIsSavingPreset(true)

    try {
      await savePreset({
        projectId,
        name: trimmedName,
        style: selectedStyle,
        viewAngle: settings.viewAngle,
        settings: {
          ...settings,
          style: selectedStyle,
          viewAngle: settings.viewAngle
        }
      })
      setPresetName("")
      toast(`Saved preset "${trimmedName}"`, "success")
    } catch (error) {
      console.error("Unable to save preset.", error)
      toast("Unable to save this preset right now", "error")
    } finally {
      setIsSavingPreset(false)
    }
  }

  async function handleDeletePreset(presetId: string) {
    if (deletingPresetId) {
      return
    }

    setDeletingPresetId(presetId)

    try {
      await deletePreset({ presetId: presetId as Id<"renderPresets"> })
      toast("Preset deleted", "success")
    } catch (error) {
      console.error("Unable to delete preset.", error)
      toast("Unable to delete this preset right now", "error")
    } finally {
      setDeletingPresetId(null)
    }
  }

  function handleOpenBatchDialog() {
    setBatchStyles([selectedStyle])
    setBatchAngles([settings.viewAngle])
    setIsBatchDialogOpen(true)
  }

  function toggleBatchStyle(styleId: StylePresetId) {
    setBatchStyles((current) =>
      current.includes(styleId)
        ? current.filter((style) => style !== styleId)
        : [...current, styleId]
    )
  }

  function toggleBatchAngle(viewAngle: RenderViewAngle) {
    setBatchAngles((current) =>
      current.includes(viewAngle)
        ? current.filter((angle) => angle !== viewAngle)
        : [...current, viewAngle]
    )
  }

  async function handleBatchGenerate() {
    if (!projectId || isGenerationBusy) {
      return
    }

    if (batchStyles.length === 0 || batchAngles.length === 0) {
      toast("Select at least one style and one angle", "warning")
      return
    }

    const combinations = batchStyles.flatMap((styleId) =>
      batchAngles.map((viewAngle) => ({
        styleId,
        viewAngle
      }))
    )

    setIsBatchDialogOpen(false)
    setErrorMessage(null)
    setIsBatchGenerating(true)
    setBatchProgress({
      completed: 0,
      total: combinations.length,
      failed: 0
    })

    let failed = 0

    if (isRenderBriefDirty) {
      try {
        await saveRenderBrief({ silent: true })
      } catch {
        setIsBatchGenerating(false)
        setBatchProgress(EMPTY_BATCH_PROGRESS)
        return
      }
    }

    for (const [index, combination] of combinations.entries()) {
      try {
        await generateRender({
          projectId,
          style: combination.styleId,
          viewAngle: combination.viewAngle,
          settings: {
            ...settings,
            style: combination.styleId,
            viewAngle: combination.viewAngle
          },
          renderBrief
        })
      } catch (error) {
        failed += 1
        console.error("Unable to generate batch render.", error)
      } finally {
        setBatchProgress({
          completed: index + 1,
          total: combinations.length,
          failed
        })
      }
    }

    setIsBatchGenerating(false)

    if (failed > 0) {
      setErrorMessage(
        `Batch completed with ${failed} failed ${failed === 1 ? "render" : "renders"}.`
      )
      toast(
        `Batch finished with ${failed} failure${failed === 1 ? "" : "s"}`,
        "warning"
      )
    } else {
      setErrorMessage(null)
      toast(`Batch generated ${combinations.length} render${combinations.length === 1 ? "" : "s"}`, "success")
    }
  }

  async function handleToggleFavorite(renderId: string) {
    setErrorMessage(null)
    setPendingRenderAction({ renderId, action: "favorite" })

    try {
      await toggleFavorite({ renderId: renderId as Id<"renders"> })
    } catch (error) {
      console.error("Unable to toggle favorite.", error)
      toast("Unable to update favorites", "error")
    } finally {
      setPendingRenderAction(null)
    }
  }

  async function handleDeleteRender(renderId: string) {
    setDeleteTarget(renderId)
  }

  async function confirmDeleteRender() {
    if (!deleteTarget) return

    setErrorMessage(null)
    setPendingRenderAction({ renderId: deleteTarget, action: "delete" })

    try {
      await removeRender({ renderId: deleteTarget as Id<"renders"> })
      setSelectedRenderIds((current) => current.filter((id) => id !== deleteTarget))
      toast("Render deleted", "success")
    } catch (error) {
      console.error("Unable to delete render.", error)
      toast("Unable to delete the render", "error")
    } finally {
      setPendingRenderAction(null)
      setDeleteTarget(null)
    }
  }

  async function handleRegenerate(render: StoredRender) {
    setPendingRenderAction({ renderId: render.id, action: "regenerate" })

    try {
      await triggerGeneration(render.style, render.settings)
    } finally {
      setPendingRenderAction(null)
    }
  }

  async function handleExportClientPackage() {
    if (!project || isExportingPackage) return

    const exportFloors = sortFloors(project.floorPlans as PersistedFloorPlan[])
    if (exportFloors.length === 0) {
      toast("Save a floor plan before exporting", "warning")
      return
    }

    setErrorMessage(null)
    setIsExportingPackage(true)

    try {
      await generateClientPackage({
        projectName: project.name,
        address: project.address,
        clientName: project.clientName,
        floorPlans: exportFloors.map((floorPlan) => {
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
      toast("Client package exported", "success")
    } catch (error) {
      console.error("Unable to export PDF package.", error)
      toast("Unable to export the client package right now", "error")
    } finally {
      setIsExportingPackage(false)
    }
  }

  function handleComparisonToggle() {
    setComparisonMode((current) => !current)
    setSelectedRenderIds([])
  }

  function handleComparisonSelect(renderId: string) {
    setSelectedRenderIds((current) => {
      if (current.includes(renderId)) {
        return current.filter((id) => id !== renderId)
      }

      if (current.length < 2) {
        return [...current, renderId]
      }

      return [current[1], renderId]
    })
  }

  function handleApplyRenderFeedback(render: StoredRender, feedback: string) {
    const styleLabel = getStyleLabel(render.style)
    const viewLabel = RENDER_VIEW_ANGLE_LABELS[render.settings.viewAngle]
    const nextLine = `${styleLabel} ${viewLabel}: ${feedback}.`

    setRenderBrief((current) => {
      const existingLines = current.revisionNotes
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)

      if (existingLines.includes(nextLine)) {
        return current
      }

      return {
        ...current,
        revisionNotes: [...existingLines, nextLine].join("\n")
      }
    })
    toast("Tweak added to the render brief", "info")
  }

  if ((projectId && project === undefined) || (projectId && rendersQuery === undefined)) {
    return (
      <main className="page-shell">
        <Breadcrumb items={[{ label: "Projects", href: "/" }, { label: "Loading..." }, { label: "Renders" }]} />
        <SkeletonPanel height="300px" />
      </main>
    )
  }

  if (!projectId || !project) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <div className="section-title">Project not found</div>
          <div className="muted">The render studio needs a valid project before images can be generated.</div>
          <Link href="/" className="button-secondary">
            Return to dashboard
          </Link>
        </div>
      </main>
    )
  }

  if (project.floorPlans.length === 0) {
    return (
      <main className="page-shell">
        <Breadcrumb items={[
          { label: "Projects", href: "/" },
          { label: project.name, href: `/projects/${projectId}` },
          { label: "Renders" }
        ]} />
        <div className="page-heading">
          <div>
            <div className="page-title">AI House Renders</div>
            <div className="muted">A saved floor plan is required before render generation can start.</div>
          </div>
        </div>

        <div className="empty-state">
          <div className="section-title">No floor plan data yet</div>
          <div className="muted">Open the editor and save at least one floor before generating exterior imagery.</div>
          <Link href={`/projects/${projectId}/edit`} className="button-secondary">
            Open editor
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <Breadcrumb items={[
        { label: "Projects", href: "/" },
        { label: project.name, href: `/projects/${projectId}` },
        { label: "Renders" }
      ]} />

      <div className="page-heading">
        <div>
          <div className="page-title">AI House Renders</div>
          <div className="muted">
            {project.name} • Generate photorealistic exterior concepts from the saved floor plan.
          </div>
        </div>
        <div className="button-row" style={{ alignItems: "center" }}>
          <button
            type="button"
            className="button-secondary"
            onClick={handleExportClientPackage}
            disabled={isExportingPackage || rendersQuery === undefined || project.floorPlans.length === 0}
          >
            <Download size={18} />
            {isExportingPackage ? "Exporting..." : "Export Client Package"}
          </button>
          <Link href={`/projects/${projectId}`} className="button-ghost">
            Back to overview
          </Link>
        </div>
      </div>

      <div className="render-stack">
        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="section-title">Render brief</div>
              <div className="muted">
                Capture the design intent and tweak notes that should guide every generated exterior.
              </div>
            </div>
            <div className="button-row" style={{ alignItems: "center" }}>
              {hasRenderBriefContent ? (
                <span className={`badge${isRenderBriefDirty ? " is-warning" : " is-success"}`}>
                  {isRenderBriefDirty ? "unsaved changes" : "saved"}
                </span>
              ) : (
                <span className="badge">optional</span>
              )}
              <button
                type="button"
                className="button-secondary"
                onClick={() => saveRenderBrief()}
                disabled={!isRenderBriefDirty || isSavingBrief || isGenerationBusy}
              >
                {isSavingBrief ? "Saving..." : "Save brief"}
              </button>
            </div>
          </div>

          <div className="render-brief-grid">
            <label className="field">
              <span className="field-label">Design direction</span>
              <textarea
                className="field-textarea render-brief-textarea"
                value={renderBrief.designNotes}
                onChange={(event) => updateRenderBriefField("designNotes", event.target.value)}
                placeholder="Example: modern farmhouse with clean massing, warm entry lighting, generous front porch, black-framed windows."
                disabled={isGenerationBusy || isSavingBrief}
              />
            </label>
            <label className="field">
              <span className="field-label">Must include</span>
              <textarea
                className="field-textarea render-brief-textarea"
                value={renderBrief.mustHave}
                onChange={(event) => updateRenderBriefField("mustHave", event.target.value)}
                placeholder="Example: covered porch, board-and-batten siding, simple gable roof, native landscaping."
                disabled={isGenerationBusy || isSavingBrief}
              />
            </label>
            <label className="field">
              <span className="field-label">Avoid</span>
              <textarea
                className="field-textarea render-brief-textarea"
                value={renderBrief.avoid}
                onChange={(event) => updateRenderBriefField("avoid", event.target.value)}
                placeholder="Example: ornate trim, fantasy architecture, oversized windows, tropical landscaping."
                disabled={isGenerationBusy || isSavingBrief}
              />
            </label>
            <label className="field">
              <span className="field-label">Regeneration tweaks</span>
              <textarea
                className="field-textarea render-brief-textarea"
                value={renderBrief.revisionNotes}
                onChange={(event) => updateRenderBriefField("revisionNotes", event.target.value)}
                placeholder="Example: make the porch deeper, reduce roof complexity, use warmer siding, keep the same camera angle."
                disabled={isGenerationBusy || isSavingBrief}
              />
            </label>
          </div>

          <div className="field-hint">
            Generate and batch generate automatically use the current brief. Unsaved brief edits are saved before generation starts.
          </div>
        </section>

        <div className="render-controls">
          <section className="panel">
            <div className="panel-header">
              <div>
                <div className="section-title">Style preset</div>
                <div className="muted">Choose the exterior direction that will anchor the generation prompt.</div>
              </div>
            </div>
            <StyleSelector selectedStyle={selectedStyle} onSelect={handleStyleSelect} />
          </section>

          <aside className="sidebar-card render-settings-sidebar">
            <div className="panel-header">
              <div>
                <div className="section-title">Render settings</div>
                <div className="muted">{STYLE_PRESET_MAP[selectedStyle].name} defaults can be adjusted before generation.</div>
              </div>
            </div>

            {/* Materials group */}
            <div className="settings-group">
              <div className="settings-group-header">
                <Palette size={14} />
                <span>Materials &amp; Colors</span>
              </div>
              <div className="form-grid">
                {(Object.entries(RENDER_SETTING_OPTIONS) as Array<[SettingKey, string[]]>).map(([key, options]) => (
                  <label key={key} className="field">
                    <span className="field-label">
                      {key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                      {SETTING_TOOLTIPS[key] ? <SettingTooltip text={SETTING_TOOLTIPS[key]} /> : null}
                    </span>
                    <select
                      className="field-select"
                      value={settings[key]}
                      onChange={(event) => updateSetting(key, event.target.value)}
                      disabled={isGenerationBusy}
                    >
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            {/* View angle group */}
            <div className="settings-group">
              <div className="settings-group-header">
                <Sparkles size={14} />
                <span>Camera &amp; View</span>
              </div>
              <div className="field">
                <span className="field-label">View angle</span>
                <div className="pill-row">
                  {RENDER_VIEW_ANGLES.map((viewAngle) => (
                    <button
                      key={viewAngle}
                      type="button"
                      className={`pill-button${settings.viewAngle === viewAngle ? " is-active" : ""}`}
                      onClick={() => handleViewAngleSelect(viewAngle)}
                      disabled={isGenerationBusy}
                    >
                      {RENDER_VIEW_ANGLE_LABELS[viewAngle]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="settings-group">
              <div className="settings-group-header">
                <ImagePlus size={14} />
                <span>Saved presets</span>
              </div>

              <div className="versions-save-row render-presets-save-row">
                <label className="field" style={{ margin: 0 }}>
                  <span className="field-label">Preset name</span>
                  <input
                    className="field-input"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    placeholder="Warm front elevation"
                    disabled={isGenerationBusy || isSavingPreset}
                  />
                </label>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleSavePreset}
                  disabled={isGenerationBusy || isSavingPreset}
                >
                  {isSavingPreset ? "Saving..." : "Save preset"}
                </button>
              </div>

              <div className="render-presets-list">
                {presetsQuery === undefined ? (
                  <div className="versions-empty">
                    <div className="muted">Loading presets...</div>
                  </div>
                ) : renderPresets.length === 0 ? (
                  <div className="versions-empty">
                    <div className="muted">Save a named settings combination to reuse styles and camera angles later.</div>
                  </div>
                ) : (
                  renderPresets.map((preset) => (
                    <div key={preset.id} className="render-preset-item">
                      <button
                        type="button"
                        className="render-preset-load"
                        onClick={() => handleLoadPreset(preset)}
                        disabled={isGenerationBusy}
                      >
                        <span className="render-preset-name">{preset.name}</span>
                        <span className="render-preset-meta">
                          {getStyleLabel(preset.style)} | {RENDER_VIEW_ANGLE_LABELS[preset.viewAngle]}
                        </span>
                        <span className="render-preset-meta">{formatTimestamp(preset.createdAt)}</span>
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => handleDeletePreset(preset.id)}
                        disabled={deletingPresetId === preset.id}
                        aria-label={`Delete preset ${preset.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Generate action */}
            <div className="settings-action">
              <button
                type="button"
                className="button button-generate"
                onClick={handleGenerateRender}
                disabled={isGenerationBusy}
              >
                <ImagePlus size={18} />
                {isGenerating ? "Generating..." : "Generate Render"}
              </button>
              <button
                type="button"
                className="button-secondary button-generate"
                onClick={handleOpenBatchDialog}
                disabled={isGenerationBusy}
              >
                <Sparkles size={18} />
                {isBatchGenerating ? "Batch running..." : "Batch Generate"}
              </button>

              <RenderProgress isGenerating={isGenerating} />

              {isBatchGenerating && batchProgressLabel ? (
                <div className="batch-progress-card">
                  <div className="creation-progress-bar">
                    <span style={{ width: `${batchProgressPercent}%` }} />
                  </div>
                  <div className="batch-progress-meta">
                    <strong>{batchProgressLabel}</strong>
                    <span className="muted">
                      {batchProgress.failed} failed of {batchProgress.total}
                    </span>
                  </div>
                </div>
              ) : null}

              {errorMessage ? (
                <div className="error-banner">
                  <AlertTriangle size={16} />
                  <span>{errorMessage}</span>
                </div>
              ) : null}
            </div>
          </aside>
        </div>

        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="section-title">Render gallery</div>
              <div className="muted">
                {renders.length} saved {renders.length === 1 ? "render" : "renders"} for this project
              </div>
            </div>
            <button
              type="button"
              className={`button-ghost${comparisonMode ? " is-active" : ""}`}
              onClick={handleComparisonToggle}
              disabled={renders.length < 2}
            >
              {comparisonMode ? "Exit compare" : "Compare"}
            </button>
          </div>

          {comparisonMode ? (
            <div className="comparison-shell comparison-enter">
              <div className="comparison-header">
                <div>
                  <div className="section-title">Comparison mode</div>
                  <div className="muted">
                    {comparisonRenders.length === 2
                      ? "Two renders selected. Review style, angle, and setting differences side by side."
                      : `Select ${2 - comparisonRenders.length} more render${comparisonRenders.length === 1 ? "" : "s"} below to compare side by side.`}
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={handleComparisonToggle}
                  aria-label="Close comparison mode"
                >
                  <X size={18} />
                </button>
              </div>

              {comparisonRenders.length === 2 ? (
                <div className="comparison-grid">
                  {comparisonRenders.map((render) => (
                    <article key={render.id} className="comparison-card">
                      <div className="comparison-media">
                        {render.imageUrl ? (
                          <Image
                            src={render.imageUrl}
                            alt={`${getStyleLabel(render.style)} comparison render`}
                            fill
                            sizes="(max-width: 1024px) 100vw, 50vw"
                            unoptimized
                          />
                        ) : (
                          <div className="comparison-empty">Render image unavailable</div>
                        )}
                      </div>
                      <div className="comparison-meta">
                        <div className="render-toolbar-badges">
                          <span className="badge">{getStyleLabel(render.style)}</span>
                          <span className="badge">{RENDER_VIEW_ANGLE_LABELS[render.settings.viewAngle]}</span>
                        </div>
                        <dl className="key-value comparison-labels">
                          <dt>Siding</dt>
                          <dd>{render.settings.sidingMaterial}</dd>
                          <dt>Roof</dt>
                          <dd>{render.settings.roofStyle}</dd>
                          <dt>Palette</dt>
                          <dd>{render.settings.colorPalette}</dd>
                          <dt>Landscape</dt>
                          <dd>{render.settings.landscaping}</dd>
                          <dt>Light</dt>
                          <dd>{render.settings.timeOfDay}</dd>
                          <dt>Season</dt>
                          <dd>{render.settings.season}</dd>
                        </dl>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {renders.length > 0 ? (
            <div className="render-grid">
              {renders.map((render) => (
                <RenderCard
                  key={render.id}
                  render={render}
                  isFavoriting={
                    pendingRenderAction?.renderId === render.id && pendingRenderAction.action === "favorite"
                  }
                  isDeleting={
                    pendingRenderAction?.renderId === render.id && pendingRenderAction.action === "delete"
                  }
                  isRegenerating={
                    isGenerating &&
                    pendingRenderAction?.renderId === render.id &&
                    pendingRenderAction.action === "regenerate"
                  }
                  onToggleFavorite={handleToggleFavorite}
                  onDelete={handleDeleteRender}
                  onRegenerate={handleRegenerate}
                  onApplyFeedback={handleApplyRenderFeedback}
                  comparisonMode={comparisonMode}
                  isSelectedForComparison={selectedRenderIds.includes(render.id)}
                  onSelectForComparison={handleComparisonSelect}
                  onImageClick={handleOpenLightbox}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state empty-state-v2">
              <div className="empty-state-icon">
                <ImagePlus size={36} />
              </div>
              <div className="section-title">Generate your first render</div>
              <div className="muted" style={{ maxWidth: "28rem" }}>
                Pick a style preset on the left, tune materials and camera angle, then hit Generate.
                Your photorealistic exterior concept will appear here.
              </div>
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

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this render?"
        message="This will permanently remove the render and its stored image file. This action cannot be undone."
        confirmLabel="Delete render"
        variant="danger"
        onConfirm={confirmDeleteRender}
        onCancel={() => setDeleteTarget(null)}
      />

      {isBatchDialogOpen ? (
        <div className="dialog-backdrop" onClick={() => setIsBatchDialogOpen(false)}>
          <div
            className="dialog-panel batch-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-generate-title"
          >
            <div className="dialog-body">
              <div className="dialog-title" id="batch-generate-title">
                Batch generate renders
              </div>
              <div className="dialog-message">
                Current material, roof, palette, landscape, and lighting settings apply to every combination.
              </div>

              <div className="batch-dialog-grid">
                <div className="batch-option-group">
                  <div className="field-label">Style presets</div>
                  <div className="batch-option-list">
                    {STYLE_PRESETS.map((preset) => (
                      <label key={preset.id} className="batch-option-item">
                        <input
                          type="checkbox"
                          checked={batchStyles.includes(preset.id)}
                          onChange={() => toggleBatchStyle(preset.id)}
                        />
                        <span>{preset.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="batch-option-group">
                  <div className="field-label">View angles</div>
                  <div className="batch-option-list">
                    {RENDER_VIEW_ANGLES.map((viewAngle) => (
                      <label key={viewAngle} className="batch-option-item">
                        <input
                          type="checkbox"
                          checked={batchAngles.includes(viewAngle)}
                          onChange={() => toggleBatchAngle(viewAngle)}
                        />
                        <span>{RENDER_VIEW_ANGLE_LABELS[viewAngle]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="batch-summary">
                This will generate {batchRenderCount} render{batchRenderCount === 1 ? "" : "s"} ({batchStyles.length} styles x {batchAngles.length} angles)
              </div>
            </div>
            <div className="dialog-footer">
              <button type="button" className="button-ghost" onClick={() => setIsBatchDialogOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="button"
                onClick={handleBatchGenerate}
                disabled={batchRenderCount === 0}
              >
                Start batch
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
