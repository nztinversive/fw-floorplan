"use client";

import { CheckCircle2, LocateFixed, RefreshCw, Sparkles, TriangleAlert, XCircle } from "lucide-react";

import { RENDER_VIEW_ANGLE_LABELS } from "@/lib/render-angles";
import type { RenderReviewQueueGroupId, RenderReviewQueueItem, RenderReviewQueueReport } from "@/lib/render-review-queue";
import { STYLE_PRESET_MAP } from "@/lib/style-presets";

type RenderReviewQueuePanelProps = {
  report: RenderReviewQueueReport;
  isBusy?: boolean;
  onFocusRender?: (renderId: string) => void;
  onRunVisualQA?: (renderId: string) => void;
  onFixRender?: (renderId: string, fixes: string) => void;
};

const GROUPS: Array<{
  id: RenderReviewQueueGroupId;
  title: string;
  empty: string;
  icon: "ready" | "review" | "blocked";
}> = [
  {
    id: "ready",
    title: "Ready",
    empty: "No renders are fully ready yet.",
    icon: "ready"
  },
  {
    id: "review",
    title: "Review",
    empty: "No renders are waiting for review.",
    icon: "review"
  },
  {
    id: "needs-revision",
    title: "Needs revision",
    empty: "No renders are blocked.",
    icon: "blocked"
  }
];

function getStyleLabel(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? style;
}

function getGroupItems(report: RenderReviewQueueReport, groupId: RenderReviewQueueGroupId) {
  if (groupId === "ready") return report.ready;
  if (groupId === "needs-revision") return report.needsRevision;
  return report.review;
}

function getIcon(icon: "ready" | "review" | "blocked") {
  if (icon === "ready") return <CheckCircle2 size={16} />;
  if (icon === "blocked") return <XCircle size={16} />;
  return <TriangleAlert size={16} />;
}

function RenderQueueItemCard({
  item,
  isBusy,
  onFocusRender,
  onRunVisualQA,
  onFixRender
}: {
  item: RenderReviewQueueItem;
  isBusy: boolean;
  onFocusRender?: (renderId: string) => void;
  onRunVisualQA?: (renderId: string) => void;
  onFixRender?: (renderId: string, fixes: string) => void;
}) {
  const render = item.render;

  return (
    <article className={`render-review-queue-card is-${item.group}${item.isStale ? " is-stale" : ""}`}>
      <div className="render-review-queue-card-top">
        <div>
          <div className="render-review-queue-title">
            {getStyleLabel(render.style)} | {RENDER_VIEW_ANGLE_LABELS[render.settings.viewAngle]}
          </div>
          <div className="render-review-queue-meta">
            {render.latestCritique ? `${render.latestCritique.score}/100 visual QA` : "Visual QA needed"}
            {render.isFinal ? " | Final" : render.isFavorite ? " | Favorite" : ""}
          </div>
        </div>
        <span className="render-review-queue-score">{item.score}</span>
      </div>

      <div className="render-review-queue-detail">{item.detail}</div>

      <div className="render-review-queue-badges">
        {item.isStale ? <span className="badge render-review-queue-badge is-stale">QA stale</span> : null}
        {!render.latestCritique ? <span className="badge render-review-queue-badge is-missing">No visual QA</span> : null}
      </div>

      <div className="render-review-queue-actions">
        {onFocusRender ? (
          <button
            type="button"
            className="render-review-queue-action"
            onClick={() => onFocusRender(render.id)}
          >
            <LocateFixed size={14} />
            Focus
          </button>
        ) : null}
        {onRunVisualQA ? (
          <button
            type="button"
            className="render-review-queue-action"
            onClick={() => onRunVisualQA(render.id)}
            disabled={isBusy}
          >
            <Sparkles size={14} />
            {render.latestCritique ? "Refresh QA" : "Run QA"}
          </button>
        ) : null}
        {onFixRender && item.group !== "ready" ? (
          <button
            type="button"
            className="render-review-queue-action is-primary"
            onClick={() => onFixRender(render.id, item.suggestedFixes)}
            disabled={isBusy}
          >
            <RefreshCw size={14} />
            Fix
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function RenderReviewQueuePanel({
  report,
  isBusy = false,
  onFocusRender,
  onRunVisualQA,
  onFixRender
}: RenderReviewQueuePanelProps) {
  return (
    <section className="panel render-review-queue-panel">
      <div className="panel-header">
        <div>
          <div className="section-title">Render review queue</div>
          <div className="muted">Sort generated renders by acceptance, Visual QA freshness, and next revision need.</div>
        </div>
        <div className="render-review-queue-stats">
          <span>{report.stats.ready} ready</span>
          <span>{report.stats.review} review</span>
          <span>{report.stats.needsRevision} revise</span>
          {report.stats.stale > 0 ? <span>{report.stats.stale} stale</span> : null}
        </div>
      </div>

      {report.weakest && onFixRender ? (
        <div className="render-review-queue-next">
          <div>
            <div className="field-label">Next weakest render</div>
            <div className="render-review-queue-next-title">{report.weakest.label}</div>
            <div className="render-review-queue-detail">{report.weakest.detail}</div>
          </div>
          <button
            type="button"
            className="render-review-queue-action is-primary"
            onClick={() => onFixRender(report.weakest!.render.id, report.weakest!.suggestedFixes)}
            disabled={isBusy}
          >
            <RefreshCw size={15} />
            Fix next weakest
          </button>
        </div>
      ) : null}

      <div className="render-review-queue-grid">
        {GROUPS.map((group) => {
          const items = getGroupItems(report, group.id);

          return (
            <div key={group.id} className={`render-review-queue-group is-${group.id}`}>
              <div className="render-review-queue-group-header">
                {getIcon(group.icon)}
                <span>{group.title}</span>
                <strong>{items.length}</strong>
              </div>

              <div className="render-review-queue-list">
                {items.length > 0 ? (
                  items.slice(0, 4).map((item) => (
                    <RenderQueueItemCard
                      key={item.render.id}
                      item={item}
                      isBusy={isBusy}
                      onFocusRender={onFocusRender}
                      onRunVisualQA={onRunVisualQA}
                      onFixRender={onFixRender}
                    />
                  ))
                ) : (
                  <div className="render-review-queue-empty">{group.empty}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
