"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { ImagePlus } from "lucide-react";
import { useMemo, useState } from "react";

import RenderCard from "@/components/RenderCard";
import StyleSelector from "@/components/StyleSelector";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  RENDER_SETTING_OPTIONS,
  STYLE_PRESET_MAP,
  STYLE_PRESETS,
  type StylePresetDefaults,
  type StylePresetId
} from "@/lib/style-presets";
import type { RenderSettings, StoredRender } from "@/lib/types";

type PendingRenderAction = "favorite" | "delete" | "regenerate";
type SettingKey = keyof StylePresetDefaults;

const INITIAL_STYLE = STYLE_PRESETS[0].id;

function getDefaultSettings(styleId: StylePresetId): RenderSettings {
  return {
    style: styleId,
    ...STYLE_PRESET_MAP[styleId].defaultSettings
  };
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
        settings: render.settings,
        imageStorageId: render.imageStorageId,
        imageUrl: render.imageUrl,
        prompt: render.prompt,
        isFavorite: render.isFavorite,
        createdAt: render.createdAt
      })),
    [rendersQuery]
  );

  function handleStyleSelect(styleId: StylePresetId) {
    setSelectedStyle(styleId);
    setSettings(getDefaultSettings(styleId));
  }

  function updateSetting(key: SettingKey, value: string) {
    setSettings((current) => ({
      ...current,
      style: selectedStyle,
      [key]: value
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
        <Link href={`/projects/${projectId}`} className="button-ghost">
          Back to overview
        </Link>
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
          </div>

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
