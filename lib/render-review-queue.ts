import type { RenderAcceptanceReport, RenderAcceptanceStatus } from "./render-acceptance";
import type { RenderQualityReport } from "./render-quality";
import type { RenderSpecDeltaReport } from "./render-spec-delta";
import type { StoredRender } from "./types";

export type RenderReviewQueueGroupId = "ready" | "review" | "needs-revision";

export type RenderReviewQueueItem = {
  render: StoredRender;
  group: RenderReviewQueueGroupId;
  score: number;
  label: string;
  detail: string;
  isStale: boolean;
  staleReason?: string;
  suggestedFixes: string;
};

export type RenderReviewQueueReport = {
  ready: RenderReviewQueueItem[];
  review: RenderReviewQueueItem[];
  needsRevision: RenderReviewQueueItem[];
  weakest?: RenderReviewQueueItem;
  stats: {
    total: number;
    ready: number;
    review: number;
    needsRevision: number;
    stale: number;
    missingVisualQA: number;
  };
};

function getGroup(status: RenderAcceptanceStatus, isStale: boolean): RenderReviewQueueGroupId {
  if (status === "blocked") return "needs-revision";
  if (status === "ready" && !isStale) return "ready";
  return "review";
}

function getGroupLabel(group: RenderReviewQueueGroupId) {
  if (group === "ready") return "Ready";
  if (group === "needs-revision") return "Needs revision";
  return "Review";
}

function getRenderName(render: StoredRender) {
  return `${render.style} ${render.settings.viewAngle}`.replace(/-/g, " ");
}

function isRenderQAStale(args: {
  render: StoredRender;
  specDeltaReport?: RenderSpecDeltaReport;
  sourceUpdatedAt?: number;
}) {
  const critique = args.render.latestCritique;
  if (!critique) {
    return {
      isStale: true,
      reason: "Visual QA has not run yet."
    };
  }

  if (args.sourceUpdatedAt && critique.createdAt + 5000 < args.sourceUpdatedAt) {
    return {
      isStale: true,
      reason: "Floor plan data changed after the last Visual QA run."
    };
  }

  const missingSpec = args.specDeltaReport?.checks.find(
    (check) => check.id === "spec-embedded" && check.status !== "match"
  );
  if (missingSpec) {
    return {
      isStale: true,
      reason: "Render was reviewed before the current design-spec layer was embedded."
    };
  }

  return {
    isStale: false,
    reason: undefined
  };
}

function getItemDetail(args: {
  acceptanceReport: RenderAcceptanceReport;
  qualityReport?: RenderQualityReport;
  specDeltaReport?: RenderSpecDeltaReport;
  staleReason?: string;
}) {
  if (args.staleReason) return args.staleReason;

  const failedAcceptance = args.acceptanceReport.checks.find((check) => check.status === "fail");
  if (failedAcceptance) return failedAcceptance.detail;

  const reviewAcceptance = args.acceptanceReport.checks.find((check) => check.status === "review");
  if (reviewAcceptance) return reviewAcceptance.detail;

  if (args.specDeltaReport?.status !== "match") return args.specDeltaReport?.summary ?? args.acceptanceReport.summary;
  if (args.qualityReport?.status !== "strong") return args.qualityReport?.summary ?? args.acceptanceReport.summary;

  return args.acceptanceReport.summary;
}

function sortItems(left: RenderReviewQueueItem, right: RenderReviewQueueItem) {
  if (left.isStale !== right.isStale) {
    return left.isStale ? -1 : 1;
  }

  if (left.group === "needs-revision" || right.group === "needs-revision") {
    return left.score - right.score;
  }

  return right.score - left.score;
}

export function buildRenderReviewQueueReport(args: {
  renders: StoredRender[];
  acceptanceByRenderId: Record<string, RenderAcceptanceReport | undefined>;
  qualityByRenderId: Record<string, RenderQualityReport | undefined>;
  specDeltaByRenderId: Record<string, RenderSpecDeltaReport | undefined>;
  sourceUpdatedAt?: number;
}): RenderReviewQueueReport {
  const items = args.renders
    .filter((render) => render.imageUrl)
    .map((render) => {
      const acceptanceReport = args.acceptanceByRenderId[render.id];
      if (!acceptanceReport) return null;

      const qualityReport = args.qualityByRenderId[render.id];
      const specDeltaReport = args.specDeltaByRenderId[render.id];
      const stale = isRenderQAStale({
        render,
        specDeltaReport,
        sourceUpdatedAt: args.sourceUpdatedAt
      });
      const group = getGroup(acceptanceReport.status, stale.isStale);

      return {
        render,
        group,
        score: acceptanceReport.score,
        label: `${getGroupLabel(group)} | ${getRenderName(render)}`,
        detail: getItemDetail({
          acceptanceReport,
          qualityReport,
          specDeltaReport,
          staleReason: stale.reason
        }),
        isStale: stale.isStale,
        staleReason: stale.reason,
        suggestedFixes:
          acceptanceReport.suggestedFixes ||
          specDeltaReport?.suggestedFixes ||
          qualityReport?.suggestion ||
          "Regenerate from the weakest Visual QA and acceptance checklist findings.",
      } satisfies RenderReviewQueueItem;
    })
    .filter(Boolean) as RenderReviewQueueItem[];
  const ready = items.filter((item) => item.group === "ready").sort(sortItems);
  const review = items.filter((item) => item.group === "review").sort(sortItems);
  const needsRevision = items.filter((item) => item.group === "needs-revision").sort(sortItems);
  const weakest = [...needsRevision, ...review].sort((left, right) => left.score - right.score)[0];

  return {
    ready,
    review,
    needsRevision,
    weakest,
    stats: {
      total: items.length,
      ready: ready.length,
      review: review.length,
      needsRevision: needsRevision.length,
      stale: items.filter((item) => item.isStale).length,
      missingVisualQA: items.filter((item) => !item.render.latestCritique).length
    }
  };
}
