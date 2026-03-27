"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { Download, ImagePlus, X } from "lucide-react";
import { useMemo, useState } from "react";

import RenderCard from "@/components/RenderCard";
import StyleSelector from "@/components/StyleSelector";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  DEFAULT_RENDER_VIEW_ANGLE,
  RENDER_VIEW_ANGLE_LABELS,
  RENDER_VIEW_ANGLES,
  type RenderViewAngle
} from "@/lib/render-angles";
import {
  RENDER_SETTING_OPTIONS,
  STYLE_PRESET_MAP,
  STYLE_PRESETS,
  type StylePresetDefaults,
  type StylePresetId
} from "@/lib/style-presets";
import { generateClientPackage, generateFloorPlanPreview } from "@/lib/pdf-export";
import type { RenderSettings, StoredRender } from "@/lib/types";

type PendingRenderAction = "favorite" | "delete" | "regenerate";
type SettingKey = keyof StylePresetDefaults;

const INITIAL_STYLE = STYLE_PRESETS[0].id;

function getDefaultSettings(
  styleId: StylePresetId,
  viewAngle: RenderViewAngle = DEFAULT_RENDER_VIEW_ANGLE
): RenderSettings {
  return {
    style: styleId,
    ...STYLE_PRESET_MAP[styleId].defaultSettings,
    viewAngle
  };
}

function getStyleLabel(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? style;
}

export default function ProjectRendersPage() {
  const params = useParams<{ id: string }>();
  const projectId = (Array.isArray(params?.id) ? params.id[0] : params?.id) as Id<"projects"> | undefined;
  const project = useQuery(api.projects.get, projectId ? { id: projectId } : "skip");
  const rendersQuery = useQuery(api.renders.list, projectId ? { projectId } : "skip");
  const generateRender = useAction(api.renders.generateRender);
  const toggleFavorite = useMutation(api.renders.toggleFavorite);
  const removeRender = useMutation(api.renders.remove);

  const [selectedStyle, setSelectedStyle] = useState<StylePresetId>(INITIAL_STYLE);
  const [settings, setSettings] = useState<RenderSettings>(() => getDefaultSettings(INITIAL_STYLE));
  const [isGenerating, setIsGenerating] = useState(false);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [selectedRenderIds, setSelectedRenderIds] = useState<string[]>([]);
  const [isExportingPackage, setIsExportingPackage] = useState(false);
  const [pendingRenderAction, setPendingRenderAction] = useState<{
    renderId: string;
    action: PendingRenderAction;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
  );

  const comparisonRenders = useMemo(
    () => selectedRenderIds.map((renderId) => renders.find((render) => render.id === renderId)).filter(Boolean) as StoredRender[],
    [renders, selectedRenderIds]
  );

  const exportRenders = useMemo(() => {
    const favoriteRenders = renders.filter((render) => render.isFavorite && render.imageUrl);
    return favoriteRenders.length > 0 ? favoriteRenders : renders.filter((render) => render.imageUrl);
  }, [renders]);

  function handleStyleSelect(styleId: StylePresetId) {
    setSelectedStyle(styleId);
    setSettings((current) => getDefaultSettings(styleId, current.viewAngle));
  }

  function updateSetting(key: SettingKey, value: string) {
    setSettings((current) => ({
      ...current,
      style: selectedStyle,
      [key]: value
    }));
  }

  function handleViewAngleSelect(viewAngle: RenderViewAngle) {
    setSettings((current) => ({
      ...current,
      style: selectedStyle,
      viewAngle
    }));
  }

  async function triggerGeneration(nextStyle: string, nextSettings: RenderSettings) {
    if (!projectId || isGenerating) {
      return;
    }

    setErrorMessage(null);
    setIsGenerating(true);

    try {
      await generateRender({
        projectId,
        style: nextStyle,
        viewAngle: nextSettings.viewAngle,
        settings: {
          ...nextSettings,
          style: nextStyle
        }
      });
    } catch (error) {
      console.error("Unable to generate render.", error);
      setErrorMessage("Unable to generate a render right now. Check the floor plan and API configuration, then try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleGenerateRender() {
    await triggerGeneration(selectedStyle, settings);
  }

  async function handleToggleFavorite(renderId: string) {
    setErrorMessage(null);
    setPendingRenderAction({ renderId, action: "favorite" });

    try {
      await toggleFavorite({ renderId: renderId as Id<"renders"> });
    } catch (error) {
      console.error("Unable to toggle favorite.", error);
      setErrorMessage("Unable to update favorites right now.");
    } finally {
      setPendingRenderAction(null);
    }
  }

  async function handleDeleteRender(renderId: string) {
    setErrorMessage(null);
    setPendingRenderAction({ renderId, action: "delete" });

    try {
      await removeRender({ renderId: renderId as Id<"renders"> });
      setSelectedRenderIds((current) => current.filter((id) => id !== renderId));
    } catch (error) {
      console.error("Unable to delete render.", error);
      setErrorMessage("Unable to delete the selected render.");
    } finally {
      setPendingRenderAction(null);
    }
  }

  async function handleRegenerate(render: StoredRender) {
    setPendingRenderAction({ renderId: render.id, action: "regenerate" });

    try {
      await triggerGeneration(render.style, render.settings);
    } finally {
      setPendingRenderAction(null);
    }
  }

  async function handleExportClientPackage() {
    if (!project || isExportingPackage) {
      return;
    }

    const exportFloor = project.floorPlans[0];
    if (!exportFloor) {
      setErrorMessage("Save a floor plan before exporting a client package.");
      return;
    }

    setErrorMessage(null);
    setIsExportingPackage(true);

    try {
      const floorPlanPreview = generateFloorPlanPreview(exportFloor.data);

      await generateClientPackage({
        projectName: project.name,
        address: project.address,
        clientName: project.clientName,
        floorPlanImage: floorPlanPreview.dataUrl,
        floorPlanStats: {
          roomCount: floorPlanPreview.roomCount,
          wallCount: floorPlanPreview.wallCount
        },
        renders: exportRenders.map((render) => ({
          imageUrl: render.imageUrl,
          style: render.style,
          settings: render.settings
        }))
      });
    } catch (error) {
      console.error("Unable to export PDF package.", error);
      setErrorMessage("Unable to export the client package right now.");
    } finally {
      setIsExportingPackage(false);
    }
  }

  function handleComparisonToggle() {
    setComparisonMode((current) => !current);
    setSelectedRenderIds([]);
  }

  function handleComparisonSelect(renderId: string) {
    setSelectedRenderIds((current) => {
      if (current.includes(renderId)) {
        return current.filter((id) => id !== renderId);
      }

      if (current.length < 2) {
        return [...current, renderId];
      }

      return [current[1], renderId];
    });
  }

  if ((projectId && project === undefined) || (projectId && rendersQuery === undefined)) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <div className="section-title">Loading renders</div>
          <div className="muted">Fetching project details and saved render history from Convex.</div>
        </div>
      </main>
    );
  }

  if (!projectId || project === null) {
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
    );
  }

  if (project.floorPlans.length === 0) {
    return (
      <main className="page-shell">
        <div className="page-heading">
          <div>
            <div className="page-title">AI House Renders</div>
            <div className="muted">A saved floor plan is required before render generation can start.</div>
          </div>
          <Link href={`/projects/${projectId}`} className="button-ghost">
            Back to overview
          </Link>
        </div>

        <div className="empty-state">
          <div className="section-title">No floor plan data yet</div>
          <div className="muted">Open the editor and save at least one floor before generating exterior imagery.</div>
          <Link href={`/projects/${projectId}/edit`} className="button-secondary">
            Open editor
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
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

          <aside className="sidebar-card">
            <div className="panel-header">
              <div>
                <div className="section-title">Render settings</div>
                <div className="muted">{STYLE_PRESET_MAP[selectedStyle].name} defaults can be adjusted before generation.</div>
              </div>
            </div>

            <div className="form-grid">
              {(Object.entries(RENDER_SETTING_OPTIONS) as Array<[SettingKey, string[]]>).map(([key, options]) => (
                <label key={key} className="field">
                  <span className="field-label">{key.replace(/([A-Z])/g, " $1")}</span>
                  <select
                    className="field-select"
                    value={settings[key]}
                    onChange={(event) => updateSetting(key, event.target.value)}
                    disabled={isGenerating}
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

            <div style={{ display: "grid", gap: "0.9rem", marginTop: "1rem" }}>
              <div className="field">
                <span className="field-label">View angle</span>
                <div className="pill-row">
                  {RENDER_VIEW_ANGLES.map((viewAngle) => (
                    <button
                      key={viewAngle}
                      type="button"
                      className={`pill-button${settings.viewAngle === viewAngle ? " is-active" : ""}`}
                      onClick={() => handleViewAngleSelect(viewAngle)}
                      disabled={isGenerating}
                    >
                      {RENDER_VIEW_ANGLE_LABELS[viewAngle]}
                    </button>
                  ))}
                </div>
              </div>

              <button type="button" className="button" onClick={handleGenerateRender} disabled={isGenerating}>
                <ImagePlus size={18} />
                {isGenerating ? "Generating..." : "Generate Render"}
              </button>

              {isGenerating ? <div className="loading-note">Generating your render... ~30 seconds</div> : null}
              {errorMessage ? <div className="muted" style={{ color: "#9a3412" }}>{errorMessage}</div> : null}
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
            <div className="comparison-shell">
              <div className="comparison-header">
                <div>
                  <div className="section-title">Comparison mode</div>
                  <div className="muted">
                    {comparisonRenders.length === 2
                      ? "Two renders selected. Review style, angle, and setting differences side by side."
                      : "Select two render cards below to compare them side by side."}
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
                  comparisonMode={comparisonMode}
                  isSelectedForComparison={selectedRenderIds.includes(render.id)}
                  onSelectForComparison={handleComparisonSelect}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="section-title">Generate your first render</div>
              <div className="muted">
                Pick a style preset, tune the exterior settings, and generate the first concept image for this home.
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
