import type { RenderSettings } from "./types";

export type StylePresetId = "craftsman" | "modern-farmhouse" | "contemporary";

export type StylePresetDefaults = Omit<RenderSettings, "style">;

export type StylePreset = {
  id: StylePresetId;
  name: string;
  description: string;
  promptFragment: string;
  defaultSettings: StylePresetDefaults;
};

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "craftsman",
    name: "Craftsman",
    description: "Warm, grounded detailing with natural materials, strong porch presence, and classic gabled rooflines.",
    promptFragment:
      "Craftsman-style home with exposed rafter tails, tapered columns on stone piers, wide covered porch, natural wood and stone materials, low-pitched gabled roof, warm earth tones",
    defaultSettings: {
      sidingMaterial: "wood",
      roofStyle: "gable",
      colorPalette: "warm",
      landscaping: "full",
      timeOfDay: "golden hour",
      season: "summer"
    }
  },
  {
    id: "modern-farmhouse",
    name: "Modern Farmhouse",
    description: "Clean rural-inspired forms with crisp contrast, covered entries, and a bright exterior palette.",
    promptFragment:
      "Modern farmhouse with board-and-batten siding, metal roof accents, large black-framed windows, covered entry porch, white exterior with dark trim, clean lines with rustic warmth",
    defaultSettings: {
      sidingMaterial: "mixed",
      roofStyle: "gable",
      colorPalette: "neutral",
      landscaping: "minimal",
      timeOfDay: "daylight",
      season: "fall"
    }
  },
  {
    id: "contemporary",
    name: "Contemporary",
    description: "Sharp, minimal massing with expressive glazing, mixed materials, and a refined modern landscape.",
    promptFragment:
      "Contemporary home with flat or butterfly roof, floor-to-ceiling glass, mixed materials of concrete/wood/steel, minimalist landscaping, clean geometric forms, neutral palette with bold accents",
    defaultSettings: {
      sidingMaterial: "mixed",
      roofStyle: "flat",
      colorPalette: "cool",
      landscaping: "minimal",
      timeOfDay: "dusk",
      season: "summer"
    }
  }
];

export const STYLE_PRESET_MAP = Object.fromEntries(
  STYLE_PRESETS.map((preset) => [preset.id, preset])
) as Record<StylePresetId, StylePreset>;

export const RENDER_SETTING_OPTIONS: Record<keyof StylePresetDefaults, string[]> = {
  sidingMaterial: ["wood", "stone", "stucco", "mixed"],
  roofStyle: ["gable", "hip", "flat", "shed"],
  colorPalette: ["warm", "cool", "neutral", "custom"],
  landscaping: ["none", "minimal", "full"],
  timeOfDay: ["daylight", "golden hour", "dusk"],
  season: ["summer", "fall", "winter"]
};
