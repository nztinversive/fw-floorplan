"use client"

import clsx from "clsx"

import { STYLE_PRESETS, type StylePresetId } from "@/lib/style-presets"

type StyleSelectorProps = {
  selectedStyle: StylePresetId
  onSelect: (styleId: StylePresetId) => void
}

const STYLE_PREVIEW_CLASS: Record<StylePresetId, string> = {
  craftsman: "is-craftsman",
  "modern-farmhouse": "is-modern-farmhouse",
  contemporary: "is-contemporary"
}

export default function StyleSelector({ selectedStyle, onSelect }: StyleSelectorProps) {
  return (
    <div className="style-grid">
      {STYLE_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={clsx("style-card", preset.id === selectedStyle && "is-selected")}
          onClick={() => onSelect(preset.id)}
        >
          <div className={clsx("style-card-preview", STYLE_PREVIEW_CLASS[preset.id])} />
          <div className="style-card-name">{preset.name}</div>
          <div className="style-card-description">{preset.description}</div>
        </button>
      ))}
    </div>
  )
}
