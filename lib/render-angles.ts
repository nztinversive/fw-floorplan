export const RENDER_VIEW_ANGLES = [
  "front-three-quarter",
  "front-elevation",
  "rear-elevation",
  "aerial"
] as const;

export type RenderViewAngle = (typeof RENDER_VIEW_ANGLES)[number];

export const DEFAULT_RENDER_VIEW_ANGLE: RenderViewAngle = "front-three-quarter";

export const RENDER_VIEW_ANGLE_LABELS: Record<RenderViewAngle, string> = {
  "front-three-quarter": "Front 3/4",
  "front-elevation": "Front elevation",
  "rear-elevation": "Rear elevation",
  aerial: "Aerial"
};

export const RENDER_VIEW_ANGLE_PROMPTS: Record<RenderViewAngle, string> = {
  "front-three-quarter":
    "Show a believable front three-quarter perspective that clearly communicates the entry sequence, roofline, facade proportions, and overall massing.",
  "front-elevation":
    "Show a straight-on front elevation view, centered and symmetrical, clearly showing the front facade, entry, windows, roofline, and material transitions.",
  "rear-elevation":
    "Show a straight-on rear elevation view, centered and symmetrical, showing the back of the house with any patios, decks, rear windows, and secondary entries.",
  aerial:
    "Show a bird-eye aerial view at roughly 45 degrees, revealing the roof form, overall massing, landscaping, and site context."
};
