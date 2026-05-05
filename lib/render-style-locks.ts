import { RENDER_VIEW_ANGLE_LABELS } from "./render-angles";
import { STYLE_PRESET_MAP } from "./style-presets";
import type { StoredRender } from "./types";

export type RenderStyleLockKey =
  | "style"
  | "sidingMaterial"
  | "roofStyle"
  | "colorPalette"
  | "landscaping"
  | "viewAngle"
  | "timeOfDay"
  | "season";

export type RenderStyleLockTrait = {
  key: RenderStyleLockKey;
  label: string;
  value: string;
};

export const DEFAULT_RENDER_STYLE_LOCK_KEYS: RenderStyleLockKey[] = [
  "style",
  "sidingMaterial",
  "roofStyle",
  "colorPalette",
  "landscaping",
  "viewAngle"
];

export const RENDER_STYLE_LOCK_LABELS: Record<RenderStyleLockKey, string> = {
  style: "Style",
  sidingMaterial: "Siding",
  roofStyle: "Roof",
  colorPalette: "Palette",
  landscaping: "Landscape",
  viewAngle: "Camera",
  timeOfDay: "Light",
  season: "Season"
};

const LOCKED_TRAITS_PREFIX = "Locked design traits";

function getStyleLabel(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? style;
}

function formatValue(render: StoredRender, key: RenderStyleLockKey) {
  if (key === "style") {
    return getStyleLabel(render.style);
  }

  if (key === "viewAngle") {
    return RENDER_VIEW_ANGLE_LABELS[render.settings.viewAngle];
  }

  return render.settings[key];
}

export function getRenderStyleLockTraits(
  render: StoredRender,
  selectedKeys: RenderStyleLockKey[]
): RenderStyleLockTrait[] {
  return selectedKeys.map((key) => ({
    key,
    label: RENDER_STYLE_LOCK_LABELS[key],
    value: formatValue(render, key)
  }));
}

export function getRenderStyleLockSummary(render: StoredRender, selectedKeys: RenderStyleLockKey[]) {
  return getRenderStyleLockTraits(render, selectedKeys)
    .map((trait) => `${trait.label}: ${trait.value}`)
    .join("; ");
}

export function buildRenderStyleLockRevision(render: StoredRender, selectedKeys: RenderStyleLockKey[]) {
  const summary = getRenderStyleLockSummary(render, selectedKeys);
  const styleLabel = getStyleLabel(render.style);
  const viewLabel = RENDER_VIEW_ANGLE_LABELS[render.settings.viewAngle];

  return `${LOCKED_TRAITS_PREFIX} from ${styleLabel} ${viewLabel}: ${summary}. Preserve these traits exactly and change only the requested issues.`;
}

export function extractRenderStyleLockSummary(prompt: string) {
  const match = new RegExp(`${LOCKED_TRAITS_PREFIX}[^:]*: ([^.]+)\\.`).exec(prompt);
  return match?.[1]?.trim() ?? null;
}
