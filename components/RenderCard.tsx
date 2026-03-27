"use client";

import Image from "next/image";
import { Download, RefreshCw, Star, Trash2 } from "lucide-react";

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
  onRegenerate
}: RenderCardProps) {
  async function handleDelete() {
    if (!window.confirm("Delete this render? This also removes the stored image file.")) {
      return;
    }

    await onDelete(render.id);
  }

  function handleDownload() {
    if (!render.imageUrl) {
      return;
    }

    window.open(render.imageUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <article className="render-card">
      <div className="render-toolbar">
        <span className="badge">{getStyleLabel(render.style)}</span>
        <div className="render-actions">
          <button
            type="button"
            className="icon-button"
            onClick={() => onToggleFavorite(render.id)}
            disabled={isFavoriting || isDeleting || isRegenerating}
            aria-label={render.isFavorite ? "Remove favorite" : "Mark favorite"}
            title={render.isFavorite ? "Remove favorite" : "Favorite"}
            style={render.isFavorite ? { color: "#d4a84b" } : undefined}
          >
            <Star size={18} fill={render.isFavorite ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={handleDownload}
            disabled={!render.imageUrl || isDeleting}
            aria-label="Download render"
            title="Download render"
          >
            <Download size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={handleDelete}
            disabled={isDeleting || isRegenerating}
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
          onClick={() => onRegenerate(render)}
          disabled={isDeleting || isRegenerating}
        >
          <RefreshCw size={18} />
          {isRegenerating ? "Generating..." : "Regenerate"}
        </button>
      </div>
    </article>
  );
}
