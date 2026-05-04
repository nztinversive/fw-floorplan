"use client";

import { Download, Expand, RefreshCw, Star, Trash2 } from "lucide-react";

import ProgressiveImage from "@/components/ProgressiveImage";
import { RENDER_VIEW_ANGLE_LABELS } from "@/lib/render-angles";
import { STYLE_PRESET_MAP } from "@/lib/style-presets";
import { formatRelativeTime } from "@/lib/file-utils";
import type { StoredRender } from "@/lib/types";

type RenderCardProps = {
  render: StoredRender;
  isFavoriting: boolean;
  isDeleting: boolean;
  isRegenerating: boolean;
  onToggleFavorite: (renderId: string) => Promise<void> | void;
  onDelete: (renderId: string) => Promise<void> | void;
  onRegenerate: (render: StoredRender) => Promise<void> | void;
  onApplyFeedback?: (render: StoredRender, feedback: string) => void;
  comparisonMode?: boolean;
  isSelectedForComparison?: boolean;
  onSelectForComparison?: (renderId: string) => void;
  onImageClick?: (renderId: string) => void;
};

const FEEDBACK_OPTIONS = [
  {
    label: "Too plain",
    feedback: "add more architectural character, depth, trim detail, and intentional material contrast"
  },
  {
    label: "Too modern",
    feedback: "make the next version warmer, softer, and more traditional"
  },
  {
    label: "More porch",
    feedback: "emphasize a deeper covered porch with a stronger, more inviting entry sequence"
  },
  {
    label: "Warmer",
    feedback: "use warmer exterior tones, softer lighting, and a more welcoming residential feel"
  },
  {
    label: "Simpler roof",
    feedback: "simplify the roof geometry while keeping the home realistic and well-proportioned"
  },
  {
    label: "Better landscape",
    feedback: "improve the landscaping with native plantings, cleaner beds, and stronger curb appeal"
  }
];

function getStyleLabel(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? style;
}

export default function RenderCard({
  render,
  isFavoriting,
  isDeleting,
  isRegenerating,
  onToggleFavorite,
  onDelete,
  onRegenerate,
  onApplyFeedback,
  comparisonMode = false,
  isSelectedForComparison = false,
  onSelectForComparison,
  onImageClick
}: RenderCardProps) {
  function handleDelete() {
    onDelete(render.id);
  }

  function handleDownload() {
    if (!render.imageUrl) {
      return;
    }

    window.open(render.imageUrl, "_blank", "noopener,noreferrer");
  }

  function handleCardClick() {
    if (!comparisonMode || !onSelectForComparison) {
      return;
    }

    onSelectForComparison(render.id);
  }

  function handleCardKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (!comparisonMode || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    handleCardClick();
  }

  function handleImageClick(event: React.MouseEvent) {
    event.stopPropagation();
    if (comparisonMode || !onImageClick || !render.imageUrl) return;
    onImageClick(render.id);
  }

  return (
    <article
      className={`render-card${comparisonMode ? " is-comparison-mode" : ""}${isSelectedForComparison ? " is-selected" : ""}`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      role={comparisonMode ? "button" : undefined}
      tabIndex={comparisonMode ? 0 : undefined}
    >
      <div className="render-toolbar">
        <div className="render-toolbar-badges">
          <span className="badge">{getStyleLabel(render.style)}</span>
          <span className="badge">{RENDER_VIEW_ANGLE_LABELS[render.settings.viewAngle]}</span>
          {comparisonMode && isSelectedForComparison ? <span className="badge">Selected</span> : null}
        </div>
        <div className="render-actions">
          <button
            type="button"
            className="icon-button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(render.id);
            }}
            disabled={comparisonMode || isFavoriting || isDeleting || isRegenerating}
            aria-label={render.isFavorite ? "Remove favorite" : "Mark favorite"}
            title={render.isFavorite ? "Remove favorite" : "Favorite"}
            style={render.isFavorite ? { color: "#d4a84b" } : undefined}
          >
            <Star size={18} fill={render.isFavorite ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={(event) => {
              event.stopPropagation();
              handleDownload();
            }}
            disabled={comparisonMode || !render.imageUrl || isDeleting}
            aria-label="Download render"
            title="Download render"
          >
            <Download size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={(event) => {
              event.stopPropagation();
              void handleDelete();
            }}
            disabled={comparisonMode || isDeleting || isRegenerating}
            aria-label="Delete render"
            title="Delete render"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div
        className={`render-media${onImageClick && render.imageUrl && !comparisonMode ? " render-media-clickable" : ""}`}
        onClick={handleImageClick}
      >
        {render.imageUrl ? (
          <>
            <ProgressiveImage
              src={render.imageUrl}
              alt={`${getStyleLabel(render.style)} render`}
              sizes="(max-width: 760px) 100vw, (max-width: 1280px) 50vw, 33vw"
            />
            {onImageClick && !comparisonMode ? (
              <span className="render-media-zoom-hint">
                <Expand size={12} />
                View full size
              </span>
            ) : null}
          </>
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              color: "rgba(255, 255, 255, 0.86)"
            }}
          >
            Render image unavailable
          </div>
        )}
      </div>

      <div className="render-card-body">
        <div className="render-meta">
          <div className="section-title">{getStyleLabel(render.style)}</div>
          <div className="render-meta-time">Generated {formatRelativeTime(render.createdAt)}</div>
        </div>

        <button
          type="button"
          className="button-ghost"
          onClick={(event) => {
            event.stopPropagation();
            onRegenerate(render);
          }}
          disabled={comparisonMode || isDeleting || isRegenerating}
        >
          <RefreshCw size={18} />
          {isRegenerating ? "Generating..." : "Regenerate"}
        </button>

        {onApplyFeedback ? (
          <div className="render-feedback">
            <div className="field-label">Quick tweaks</div>
            <div className="render-feedback-options">
              {FEEDBACK_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className="render-feedback-chip"
                  onClick={(event) => {
                    event.stopPropagation();
                    onApplyFeedback(render, option.feedback);
                  }}
                  disabled={comparisonMode || isDeleting || isRegenerating}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
