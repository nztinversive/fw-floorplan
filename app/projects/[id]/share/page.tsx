"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";

import ReadOnlyFloorPlanCanvas from "@/components/ReadOnlyFloorPlanCanvas";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatFloorLabel, sortFloors } from "@/lib/floor-utils";
import { DEFAULT_RENDER_VIEW_ANGLE, RENDER_VIEW_ANGLE_LABELS } from "@/lib/render-angles";
import { formatRelativeTime } from "@/lib/file-utils";
import { STYLE_PRESET_MAP } from "@/lib/style-presets";
import type { PersistedFloorPlan } from "@/lib/types";

function getStyleLabel(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? style;
}

export default function ProjectSharePage() {
  const params = useParams<{ id: string }>();
  const projectId = (Array.isArray(params?.id) ? params.id[0] : params?.id) as Id<"projects"> | undefined;
  const project = useQuery(api.projects.get, projectId ? { id: projectId } : "skip");
  const rendersQuery = useQuery(api.renders.list, projectId ? { projectId } : "skip");

  const floorPlans = project?.floorPlans
    ? sortFloors(project.floorPlans as PersistedFloorPlan[])
    : [];
  const renders = (rendersQuery ?? []).map((render) => ({
    ...render,
    settings: {
      ...render.settings,
      viewAngle: render.settings.viewAngle ?? DEFAULT_RENDER_VIEW_ANGLE
    }
  }));
  const favoriteRenders = renders.filter((render) => render.isFavorite);
  const visibleRenders = favoriteRenders.length > 0 ? favoriteRenders : renders;

  if ((projectId && project === undefined) || (projectId && rendersQuery === undefined)) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <div className="section-title">Loading shared project</div>
          <div className="muted">Fetching the floor plans and render gallery.</div>
        </div>
      </main>
    );
  }

  if (!projectId || project === null) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <div className="section-title">Project not found</div>
          <div className="muted">This shared presentation link is no longer available.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell share-page-shell">
      <section className="hero-panel share-hero">
        <div className="share-brand-row">
          <div className="brand-lockup">
            <div className="brand-mark">FW</div>
            <div>
              <div className="brand-title">FW Floor Plan Studio</div>
              <div className="brand-subtitle">Shared read-only presentation</div>
            </div>
          </div>
          <div className="badge">Public link</div>
        </div>

        <div className="share-hero-copy">
          <div className="hero-title">{project.name}</div>
          <div className="hero-copy">
            Review every saved floor plan and the exterior render concepts in a clean, read-only presentation.
          </div>
        </div>

        <div className="share-meta-grid">
          <div className="stat-card">
            <div className="stat-label">Address</div>
            <div className="stat-value share-stat">{project.address || "Not provided"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Client</div>
            <div className="stat-value share-stat">{project.clientName || "Not provided"}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Floors shown</div>
            <div className="stat-value share-stat">{floorPlans.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Renders shown</div>
            <div className="stat-value share-stat">{visibleRenders.length}</div>
          </div>
        </div>
      </section>

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
                {favoriteRenders.length > 0
                  ? "Showing favorited renders."
                  : "No favorites selected, so all saved renders are shown."}
              </div>
            </div>
          </div>

          {visibleRenders.length > 0 ? (
            <div className="render-grid">
              {visibleRenders.map((render) => (
                <article key={render._id} className="render-card share-render-card">
                  <div className="render-media">
                    {render.imageUrl ? (
                      <Image
                        src={render.imageUrl}
                        alt={`${getStyleLabel(render.style)} shared render`}
                        fill
                        sizes="(max-width: 760px) 100vw, (max-width: 1280px) 50vw, 33vw"
                        unoptimized
                      />
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
    </main>
  );
}
