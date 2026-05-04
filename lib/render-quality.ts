import { RENDER_VIEW_ANGLE_LABELS } from "./render-angles";
import { analyzeRenderConsistency } from "./render-consistency";
import { getRenderReviewIssueFeedback } from "./render-review";
import { STYLE_PRESET_MAP } from "./style-presets";
import type { RenderBrief, StoredFloorPlan, StoredRender } from "./types";

export type RenderQualityStatus = "strong" | "review" | "regenerate";

export type RenderQualityCheck = {
  id: string;
  title: string;
  detail: string;
  score: number;
  status: RenderQualityStatus;
};

export type RenderQualityReport = {
  score: number;
  status: RenderQualityStatus;
  label: string;
  summary: string;
  checks: RenderQualityCheck[];
  suggestion: string;
};

const SCORE_LABELS = [
  { threshold: 88, label: "Strong output", status: "strong" as const },
  { threshold: 74, label: "Needs review", status: "review" as const },
  { threshold: 0, label: "Regenerate next", status: "regenerate" as const }
];

const SETTING_LABELS: Record<string, string> = {
  "board-batten": "board and batten",
  brick: "brick",
  dark: "dark",
  daylight: "daylight",
  evening: "evening",
  fall: "fall",
  full: "full landscaping",
  gable: "gable",
  "golden hour": "golden hour",
  metal: "metal",
  minimal: "minimal landscaping",
  mixed: "mixed siding",
  neutral: "neutral",
  night: "night",
  shed: "shed",
  shingle: "shingle",
  spring: "spring",
  stone: "stone",
  summer: "summer",
  warm: "warm",
  winter: "winter",
  wood: "wood"
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getQualityLabel(score: number) {
  return SCORE_LABELS.find((entry) => score >= entry.threshold) ?? SCORE_LABELS[SCORE_LABELS.length - 1];
}

function getPromptText(render: StoredRender) {
  return render.prompt.toLowerCase();
}

function countRooms(floorPlans: StoredFloorPlan[]) {
  return floorPlans.reduce((total, floorPlan) => total + floorPlan.data.rooms.length, 0);
}

function countWindows(floorPlans: StoredFloorPlan[]) {
  return floorPlans.reduce((total, floorPlan) => total + floorPlan.data.windows.length, 0);
}

function includesUsefulToken(prompt: string, value: string) {
  const normalized = SETTING_LABELS[value] ?? value.replace(/-/g, " ");
  return normalized
    .split(/\s+/)
    .filter((token) => token.length > 3)
    .some((token) => prompt.includes(token));
}

function getStyleName(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? style;
}

function buildCheck(args: RenderQualityCheck): RenderQualityCheck {
  return {
    ...args,
    score: clampScore(args.score)
  };
}

function getReviewIssueKeys(render: StoredRender) {
  const issueKeys = new Set<string>();

  for (const review of render.reviewHistory ?? []) {
    for (const issueKey of review.issueKeys) {
      issueKeys.add(issueKey);
    }
  }

  return [...issueKeys];
}

function getSuggestionFromChecks(checks: RenderQualityCheck[], issueKeys: string[]) {
  const checkSuggestions = checks
    .filter((check) => check.status !== "strong")
    .map((check) => check.detail)
    .slice(0, 2);
  const reviewSuggestions = issueKeys.map(getRenderReviewIssueFeedback).slice(0, 2);

  return [...reviewSuggestions, ...checkSuggestions]
    .filter(Boolean)
    .join("; ");
}

export function analyzeRenderQuality(args: {
  render: StoredRender;
  floorPlans: StoredFloorPlan[];
  renderBrief: RenderBrief;
  childRenders?: StoredRender[];
}): RenderQualityReport {
  const prompt = getPromptText(args.render);
  const roomCount = countRooms(args.floorPlans);
  const windowCount = countWindows(args.floorPlans);
  const consistency = analyzeRenderConsistency({
    floorPlans: args.floorPlans,
    renderBrief: args.renderBrief,
    settings: args.render.settings
  });
  const childCount = args.childRenders?.length ?? 0;
  const issueKeys = getReviewIssueKeys(args.render);
  const activeIssueCount = childCount > 0 ? 0 : issueKeys.length;
  const styleName = getStyleName(args.render.style);
  const styleTerms = [
    styleName,
    args.render.settings.sidingMaterial,
    args.render.settings.roofStyle,
    args.render.settings.colorPalette,
    args.render.settings.landscaping,
    args.render.settings.timeOfDay,
    args.render.settings.season
  ];
  const matchedStyleTerms = styleTerms.filter((term) => includesUsefulToken(prompt, term)).length;
  const presentationTerms = ["realistic", "materials", "landscaping", "entry", "facade", "roofline", "massing", "lighting"];
  const matchedPresentationTerms = presentationTerms.filter((term) => prompt.includes(term)).length;
  const promptMentionsRooms = roomCount === 0 || prompt.includes(`${roomCount} `) || prompt.includes("room");
  const promptMentionsWindows = windowCount === 0 || prompt.includes("window");
  const promptMentionsView = prompt.includes(RENDER_VIEW_ANGLE_LABELS[args.render.settings.viewAngle].toLowerCase().split(" ")[0]);
  const roomWindowScore = promptMentionsRooms && promptMentionsWindows
    ? windowCount >= Math.max(2, Math.ceil(roomCount / 2))
      ? 90
      : 76
    : 58;
  const reviewScore =
    args.render.sourceReviewId && activeIssueCount === 0
      ? 88
      : activeIssueCount === 0
        ? childCount > 0
          ? 84
          : 90
        : activeIssueCount === 1
          ? 70
          : 52;

  const checks = [
    buildCheck({
      id: "plan-consistency",
      title: "Floor plan consistency",
      detail: consistency.summary,
      score: consistency.score,
      status: consistency.score >= 86 ? "strong" : consistency.score >= 72 ? "review" : "regenerate"
    }),
    buildCheck({
      id: "style-match",
      title: "Style and material match",
      detail:
        matchedStyleTerms >= 5
          ? `${styleName} direction, material, roof, palette, and environment are represented in the prompt.`
          : `${styleName} direction is present, but the next pass should reinforce materials, roof, palette, or environment.`,
      score: matchedStyleTerms >= 5 ? 92 : matchedStyleTerms >= 3 ? 76 : 58,
      status: matchedStyleTerms >= 5 ? "strong" : matchedStyleTerms >= 3 ? "review" : "regenerate"
    }),
    buildCheck({
      id: "room-window-alignment",
      title: "Room and window alignment",
      detail:
        promptMentionsRooms && promptMentionsWindows
          ? `${roomCount} room cue${roomCount === 1 ? "" : "s"} and ${windowCount} window cue${windowCount === 1 ? "" : "s"} are available for facade alignment.`
          : "Regenerate with explicit room-aware window placement and facade proportion guidance.",
      score: roomWindowScore,
      status: roomWindowScore >= 86 ? "strong" : roomWindowScore >= 72 ? "review" : "regenerate"
    }),
    buildCheck({
      id: "review-outcome",
      title: "Review outcome",
      detail:
        activeIssueCount === 0
          ? args.render.sourceReviewId
            ? "This version was generated from review notes and has no new review flags yet."
            : childCount > 0
              ? `${childCount} regenerated version${childCount === 1 ? "" : "s"} already explore fixes from this render.`
              : "No review flags are attached to this render yet."
          : `${activeIssueCount} review issue${activeIssueCount === 1 ? "" : "s"} should be addressed before using this as the final direction.`,
      score: reviewScore,
      status: reviewScore >= 86 ? "strong" : reviewScore >= 72 ? "review" : "regenerate"
    }),
    buildCheck({
      id: "curb-appeal",
      title: "Curb appeal and presentation",
      detail:
        matchedPresentationTerms >= 6 && promptMentionsView
          ? "Presentation language supports a realistic, client-readable exterior concept."
          : "Add more explicit entry hierarchy, lighting, landscaping, and buildable material guidance.",
      score: matchedPresentationTerms >= 6 && promptMentionsView ? 90 : matchedPresentationTerms >= 4 ? 76 : 60,
      status: matchedPresentationTerms >= 6 && promptMentionsView ? "strong" : matchedPresentationTerms >= 4 ? "review" : "regenerate"
    })
  ];
  const score = clampScore(
    checks.reduce((total, check) => total + check.score, 0) / checks.length - activeIssueCount * 4
  );
  const label = getQualityLabel(score);
  const regenerateChecks = checks.filter((check) => check.status === "regenerate").length;
  const reviewChecks = checks.filter((check) => check.status === "review").length;
  const suggestion = getSuggestionFromChecks(checks, issueKeys);

  return {
    score,
    status: label.status,
    label: label.label,
    summary:
      label.status === "strong"
        ? "This render is a strong candidate for client review or refinement."
        : regenerateChecks > 0
          ? `${regenerateChecks} quality area${regenerateChecks === 1 ? "" : "s"} should drive the next regeneration.`
          : `${reviewChecks} quality area${reviewChecks === 1 ? "" : "s"} could be tightened before final selection.`,
    checks,
    suggestion
  };
}
