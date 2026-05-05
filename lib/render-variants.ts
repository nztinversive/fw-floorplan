import { RENDER_VIEW_ANGLE_LABELS } from "./render-angles";
import { STYLE_PRESET_MAP } from "./style-presets";
import type { StoredRender } from "./types";

export type RenderWinnerVariantKey = "windows" | "materials" | "entry" | "landscaping";

export type RenderWinnerVariantPreset = {
  key: RenderWinnerVariantKey;
  label: string;
  description: string;
  revision: string;
};

export const RENDER_WINNER_VARIANTS: RenderWinnerVariantPreset[] = [
  {
    key: "windows",
    label: "Better windows",
    description: "Keep the design, improve window rhythm and room alignment.",
    revision:
      "Keep the same massing, style, camera angle, and strongest facade traits. Improve the window placement, sizing, mullion rhythm, and room-aware alignment so the exterior reads as more buildable and intentional."
  },
  {
    key: "materials",
    label: "Richer materials",
    description: "Preserve the form while elevating cladding and detail quality.",
    revision:
      "Keep the same massing, style, camera angle, roof form, and overall composition. Upgrade the material realism with richer cladding texture, cleaner trim details, believable transitions, and higher-end finish quality."
  },
  {
    key: "entry",
    label: "Cleaner entry",
    description: "Strengthen the front door, porch, and arrival sequence.",
    revision:
      "Keep the same massing, style, camera angle, and facade proportions. Refine the entry sequence with a clearer front door, cleaner porch or stoop detailing, better lighting, and a more welcoming path to the entrance."
  },
  {
    key: "landscaping",
    label: "Realistic landscaping",
    description: "Improve site realism without changing the house design.",
    revision:
      "Keep the same house design, massing, style, camera angle, and material direction. Improve the landscape realism with grounded planting beds, believable grade transitions, natural hardscape, and a finished residential presentation."
  }
];

function getStyleLabel(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? style;
}

export function getRenderWinnerVariant(key: RenderWinnerVariantKey) {
  return RENDER_WINNER_VARIANTS.find((variant) => variant.key === key);
}

export function getWinnerVariantLabelFromPrompt(prompt: string) {
  const normalizedPrompt = prompt.toLowerCase();

  return (
    RENDER_WINNER_VARIANTS.find((variant) =>
      normalizedPrompt.includes(`winner-based variant (${variant.label.toLowerCase()})`)
    )?.label ?? null
  );
}

export function buildWinnerVariantRevision(render: StoredRender, variantKey: RenderWinnerVariantKey) {
  const variant = getRenderWinnerVariant(variantKey);
  const styleLabel = getStyleLabel(render.style);
  const viewLabel = RENDER_VIEW_ANGLE_LABELS[render.settings.viewAngle];

  if (!variant) {
    return `${styleLabel} ${viewLabel} winner-based variant: Keep the strongest traits from the winning render and improve the design quality without changing the core concept.`;
  }

  return `${styleLabel} ${viewLabel} winner-based variant (${variant.label}): ${variant.revision}`;
}
