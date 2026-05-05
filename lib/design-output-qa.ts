import { RENDER_VIEW_ANGLE_LABELS } from "./render-angles";
import type { RenderQualityReport } from "./render-quality";
import { STYLE_PRESET_MAP } from "./style-presets";
import type { RenderBrief, StoredFloorPlan, StoredRender } from "./types";

export type DesignOutputQAStatus = "ready" | "review" | "blocked";

export type DesignOutputQACheck = {
  id: string;
  title: string;
  detail: string;
  status: DesignOutputQAStatus;
  renderId?: string;
  renderLabel?: string;
  suggestion?: string;
};

export type DesignOutputQAReport = {
  score: number;
  status: DesignOutputQAStatus;
  label: string;
  summary: string;
  checks: DesignOutputQACheck[];
  stats: {
    renderCount: number;
    imageCount: number;
    favoriteCount: number;
    critiquedCount: number;
    averageQuality: number | null;
  };
  suggestedFixes: string;
  regenerationTarget?: {
    renderId: string;
    renderLabel: string;
    fixes: string;
  };
};

const EMPTY_RENDER_BRIEF: RenderBrief = {
  designNotes: "",
  mustHave: "",
  avoid: "",
  revisionNotes: ""
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getStyleLabel(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? style;
}

function getRenderLabel(render: StoredRender) {
  return `${getStyleLabel(render.style)} ${RENDER_VIEW_ANGLE_LABELS[render.settings.viewAngle]}`;
}

function getRoomCount(floorPlans: StoredFloorPlan[]) {
  return floorPlans.reduce((total, floorPlan) => total + floorPlan.data.rooms.length, 0);
}

function getWindowCount(floorPlans: StoredFloorPlan[]) {
  return floorPlans.reduce((total, floorPlan) => total + floorPlan.data.windows.length, 0);
}

function countReviewIssues(render: StoredRender) {
  return (render.reviewHistory ?? []).reduce((total, review) => total + review.issueKeys.length, 0);
}

function hasBriefContent(renderBrief: RenderBrief) {
  return Object.values(renderBrief).some((value) => value.trim().length > 0);
}

function getReportLabel(status: DesignOutputQAStatus) {
  if (status === "ready") return "Ready to share";
  if (status === "blocked") return "Needs fixes";
  return "Needs review";
}

function getStatusScore(status: DesignOutputQAStatus) {
  if (status === "ready") return 100;
  if (status === "blocked") return 42;
  return 74;
}

function getStatusFromScore(score: number, hasBlocked: boolean, hasReview: boolean): DesignOutputQAStatus {
  if (hasBlocked || score < 68) return "blocked";
  if (hasReview || score < 86) return "review";
  return "ready";
}

function buildCheck(check: DesignOutputQACheck): DesignOutputQACheck {
  return check;
}

export function analyzeDesignOutputQA(args: {
  floorPlans: StoredFloorPlan[];
  renders: StoredRender[];
  qualityByRenderId?: Record<string, RenderQualityReport>;
  renderBrief?: RenderBrief;
}): DesignOutputQAReport {
  const renderBrief = args.renderBrief ?? EMPTY_RENDER_BRIEF;
  const imageRenders = args.renders.filter((render) => render.imageUrl);
  const favoriteCount = args.renders.filter((render) => render.isFavorite).length;
  const roomCount = getRoomCount(args.floorPlans);
  const windowCount = getWindowCount(args.floorPlans);
  const qualityReports = imageRenders
    .map((render) => args.qualityByRenderId?.[render.id])
    .filter(Boolean) as RenderQualityReport[];
  const averageQuality =
    qualityReports.length > 0
      ? clampScore(qualityReports.reduce((total, report) => total + report.score, 0) / qualityReports.length)
      : null;
  const weakestQuality = imageRenders
    .map((render) => ({ render, report: args.qualityByRenderId?.[render.id] }))
    .filter((entry) => entry.report)
    .sort((a, b) => (a.report?.score ?? 0) - (b.report?.score ?? 0))[0];
  const critiqueRenders = imageRenders.filter((render) => render.latestCritique);
  const weakestCritique = imageRenders
    .filter((render) => render.latestCritique)
    .sort((a, b) => (a.latestCritique?.score ?? 0) - (b.latestCritique?.score ?? 0))[0];
  const critiqueNeedsRegeneration = imageRenders.find(
    (render) => render.latestCritique?.recommendation === "regenerate"
  );
  const activeReviewRender = imageRenders.find((render) => countReviewIssues(render) > 0);
  const checks: DesignOutputQACheck[] = [];

  checks.push(
    buildCheck({
      id: "floor-plan-foundation",
      title: args.floorPlans.length > 0 ? "Floor plan foundation" : "Save a floor plan first",
      detail:
        args.floorPlans.length > 0
          ? `${roomCount} room cue${roomCount === 1 ? "" : "s"} and ${windowCount} window cue${windowCount === 1 ? "" : "s"} are available to judge render fidelity.`
          : "A saved floor plan is required before the design output can be checked against real geometry.",
      status: args.floorPlans.length > 0 && roomCount > 0 ? "ready" : "blocked",
      suggestion:
        args.floorPlans.length > 0 && roomCount > 0
          ? undefined
          : "Save at least one room-labeled floor plan before selecting final renders."
    })
  );

  checks.push(
    buildCheck({
      id: "share-selection",
      title: imageRenders.length > 0 ? "Share selection has render images" : "No render images selected",
      detail:
        imageRenders.length > 0
          ? `${imageRenders.length} render image${imageRenders.length === 1 ? "" : "s"} will be included in the current package.`
          : "Generate or restore at least one render image before exporting or sharing a design package.",
      status: imageRenders.length > 0 ? "ready" : "blocked",
      suggestion:
        imageRenders.length > 0
          ? undefined
          : "Generate at least one exterior render before sharing the package."
    })
  );

  if (args.renders.length > 1) {
    checks.push(
      buildCheck({
        id: "favorite-curation",
        title: favoriteCount > 0 ? "Final selection is curated" : "Choose final favorites",
        detail:
          favoriteCount > 0
            ? `${favoriteCount} favorite render${favoriteCount === 1 ? "" : "s"} will lead the shared package.`
            : "No favorite is selected, so every saved render appears in the package.",
        status: favoriteCount > 0 ? "ready" : "review",
        suggestion:
          favoriteCount > 0
            ? undefined
            : "Mark the strongest render as a favorite so the shared package leads with the intended direction."
      })
    );
  }

  checks.push(
    buildCheck({
      id: "quality-gate",
      title:
        averageQuality === null
          ? "Render quality checks unavailable"
          : averageQuality >= 86
            ? "Render quality clears the bar"
            : "Render quality needs attention",
      detail:
        averageQuality === null
          ? "Quality scoring will appear after render data is available for this package."
          : weakestQuality?.report && weakestQuality.report.status !== "strong"
            ? `${getRenderLabel(weakestQuality.render)} is the weakest output at ${weakestQuality.report.score}/100: ${weakestQuality.report.summary}`
            : `Average render quality is ${averageQuality}/100 across the selected outputs.`,
      status:
        averageQuality === null
          ? "review"
          : qualityReports.some((report) => report.status === "regenerate")
            ? "blocked"
            : averageQuality >= 86
              ? "ready"
              : "review",
      renderId: weakestQuality?.render.id,
      renderLabel: weakestQuality ? getRenderLabel(weakestQuality.render) : undefined,
      suggestion:
        weakestQuality?.report?.suggestion ||
        (averageQuality !== null && averageQuality < 86
          ? "Tighten the weakest render quality checks before final sharing."
          : undefined)
    })
  );

  checks.push(
    buildCheck({
      id: "ai-critique",
      title:
        critiqueRenders.length === imageRenders.length && imageRenders.length > 0
          ? "AI critique coverage is complete"
          : "Run AI critique before final share",
      detail:
        imageRenders.length === 0
          ? "No render image is available for AI critique."
          : critiqueNeedsRegeneration?.latestCritique
            ? `${getRenderLabel(critiqueNeedsRegeneration)} was marked regenerate: ${critiqueNeedsRegeneration.latestCritique.summary}`
            : critiqueRenders.length === imageRenders.length
              ? weakestCritique?.latestCritique
                ? `All selected renders have critique results. Lowest critique score is ${weakestCritique.latestCritique.score}/100.`
                : "All selected renders have critique results."
              : `${critiqueRenders.length} of ${imageRenders.length} selected render${imageRenders.length === 1 ? "" : "s"} have AI critique results.`,
      status:
        imageRenders.length === 0 || critiqueNeedsRegeneration
          ? "blocked"
          : critiqueRenders.length === imageRenders.length && imageRenders.length > 0
            ? "ready"
            : "review",
      renderId: critiqueNeedsRegeneration?.id ?? weakestCritique?.id,
      renderLabel: critiqueNeedsRegeneration
        ? getRenderLabel(critiqueNeedsRegeneration)
        : weakestCritique
          ? getRenderLabel(weakestCritique)
          : undefined,
      suggestion:
        critiqueNeedsRegeneration?.latestCritique?.suggestedFixes ||
        (critiqueRenders.length < imageRenders.length
          ? "Run AI critique on every selected render before sending the client package."
          : undefined)
    })
  );

  checks.push(
    buildCheck({
      id: "review-closure",
      title: activeReviewRender ? "Open review flags remain" : "Review loop is closed",
      detail: activeReviewRender
        ? `${getRenderLabel(activeReviewRender)} still has ${countReviewIssues(activeReviewRender)} saved review flag${countReviewIssues(activeReviewRender) === 1 ? "" : "s"}.`
        : "No selected render has unresolved saved review flags.",
      status: activeReviewRender ? "review" : "ready",
      renderId: activeReviewRender?.id,
      renderLabel: activeReviewRender ? getRenderLabel(activeReviewRender) : undefined,
      suggestion: activeReviewRender
        ? "Regenerate from review notes or clear the saved review flags before final selection."
        : undefined
    })
  );

  checks.push(
    buildCheck({
      id: "brief-traceability",
      title: hasBriefContent(renderBrief) ? "Design brief is traceable" : "Design brief is light",
      detail: hasBriefContent(renderBrief)
        ? "The render package has saved design intent, must-haves, avoids, or revision notes to explain the output."
        : "Add a short brief so future tweaks and client-facing outputs have a clear design rationale.",
      status: hasBriefContent(renderBrief) ? "ready" : "review",
      suggestion: hasBriefContent(renderBrief)
        ? undefined
        : "Add design intent, must-have exterior details, and any avoid-list items before the next generation."
    })
  );

  const hasBlocked = checks.some((check) => check.status === "blocked");
  const hasReview = checks.some((check) => check.status === "review");
  const score = clampScore(checks.reduce((total, check) => total + getStatusScore(check.status), 0) / checks.length);
  const status = getStatusFromScore(score, hasBlocked, hasReview);
  const regenerationCheck =
    checks.find((check) => check.status === "blocked" && check.renderId && check.suggestion) ??
    checks.find((check) => check.status === "review" && check.renderId && check.suggestion);
  const suggestedFixes = checks
    .filter((check) => check.status !== "ready" && check.suggestion)
    .map((check) => check.suggestion)
    .slice(0, 3)
    .join(" ");

  return {
    score,
    status,
    label: getReportLabel(status),
    summary:
      status === "ready"
        ? "The selected design outputs have enough plan fidelity, critique coverage, and curation for sharing."
        : status === "blocked"
          ? "Resolve the blocked QA items before using this as the final shared package."
          : "A few QA items should be reviewed before the package is treated as final.",
    checks,
    stats: {
      renderCount: args.renders.length,
      imageCount: imageRenders.length,
      favoriteCount,
      critiquedCount: critiqueRenders.length,
      averageQuality
    },
    suggestedFixes,
    regenerationTarget:
      regenerationCheck?.renderId && regenerationCheck.renderLabel && regenerationCheck.suggestion
        ? {
          renderId: regenerationCheck.renderId,
          renderLabel: regenerationCheck.renderLabel,
          fixes: regenerationCheck.suggestion
        }
        : undefined
  };
}
