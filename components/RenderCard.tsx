"use client";

import Image from "next/image";
import { Download, RefreshCw, Star, Trash2 } from "lucide-react";

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
  comparisonMode?: boolean;
  isSelectedForComparison?: boolean;
  onSelectForComparison?: (renderId: string) => void;
};

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
  comparisonMode = false,
  isSelectedForComparison = false,
  onSelectForComparison
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

      <div className="render-media">
        {render.imageUrl ? (
          <Image
            src={render.imageUrl}
            alt={`${getStyleLabel(render.style)} render`}
            fill
            sizes="(max-width: 760px) 100vw, (max-width: 1280px) 50vw, 33vw"
            unoptimized
          />
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
      </div>
    </article>
  );
}
