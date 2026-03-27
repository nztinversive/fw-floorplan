"use client"

import { HelpCircle } from "lucide-react"
import { useState } from "react"

type SettingTooltipProps = {
  text: string
}

export default function SettingTooltip({ text }: SettingTooltipProps) {
  const [show, setShow] = useState(false)

  return (
    <span
      className="setting-tooltip-anchor"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={0}
      role="img"
      aria-label={text}
    >
      <HelpCircle size={14} />
      {show ? (
        <span className="setting-tooltip" role="tooltip">
          {text}
        </span>
      ) : null}
    </span>
  )
}

export const SETTING_TOOLTIPS: Record<string, string> = {
  sidingMaterial: "The primary exterior cladding — wood, stone, stucco, or a combination.",
  roofStyle: "Roof geometry: gable (peaked), hip (sloped all sides), flat, or shed (single slope).",
  colorPalette: "Overall color mood of the exterior — warm (earth tones), cool (blues/grays), or neutral.",
  landscaping: "Amount of surrounding greenery: none, minimal beds, or full mature landscaping.",
  timeOfDay: "Lighting conditions — affects shadows, sky color, and ambient warmth.",
  season: "Seasonal context that influences foliage color, ground cover, and sky atmosphere."
}
