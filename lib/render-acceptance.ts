import type { RenderQualityCheck, RenderQualityReport, RenderQualityStatus } from "./render-quality";
import type { RenderSpecDeltaCheck, RenderSpecDeltaReport } from "./render-spec-delta";
import type { StoredRender } from "./types";

export type RenderAcceptanceCheckStatus = "pass" | "review" | "fail";
export type RenderAcceptanceStatus = "ready" | "review" | "blocked";

export type RenderAcceptanceCheck = {
  id: string;
  title: string;
  detail: string;
  status: RenderAcceptanceCheckStatus;
};

export type RenderAcceptanceReport = {
  score: number;
  status: RenderAcceptanceStatus;
  label: string;
  summary: string;
  checks: RenderAcceptanceCheck[];
  suggestedFixes: string;
  canAccept: boolean;
};

function getQualityCheck(report: RenderQualityReport | undefined, id: string) {
  return report?.checks.find((check) => check.id === id);
}

function getSpecCheck(report: RenderSpecDeltaReport | undefined, id: string) {
  return report?.checks.find((check) => check.id === id);
}

function qualityStatusToAcceptance(status?: RenderQualityStatus): RenderAcceptanceCheckStatus {
  if (status === "strong") return "pass";
  if (status === "regenerate") return "fail";
  return "review";
}

function specStatusToAcceptance(status?: RenderSpecDeltaCheck["status"]): RenderAcceptanceCheckStatus {
  if (status === "match") return "pass";
  if (status === "drift") return "fail";
  return "review";
}

function scoreCheck(status: RenderAcceptanceCheckStatus) {
  if (status === "pass") return 100;
  if (status === "review") return 72;
  return 35;
}

function getLabel(status: RenderAcceptanceStatus) {
  if (status === "ready") return "Ready to accept";
  if (status === "blocked") return "Needs revision";
  return "Review before final";
}

function buildCheck(check: RenderAcceptanceCheck) {
  return check;
}

function getOpenFixes(checks: RenderAcceptanceCheck[]) {
  return checks
    .filter((check) => check.status !== "pass")
    .map((check) => `${check.title}: ${check.detail}`)
    .slice(0, 3)
    .join("; ");
}

export function analyzeRenderAcceptance(args: {
  render: StoredRender;
  qualityReport?: RenderQualityReport;
  specDeltaReport?: RenderSpecDeltaReport;
}): RenderAcceptanceReport {
  const planCheck = getQualityCheck(args.qualityReport, "plan-consistency");
  const windowCheck = getQualityCheck(args.qualityReport, "room-window-alignment");
  const curbAppealCheck = getQualityCheck(args.qualityReport, "curb-appeal");
  const cameraCheck = getSpecCheck(args.specDeltaReport, "camera-angle");
  const specOpenChecks = args.specDeltaReport?.checks.filter((check) => check.status !== "match") ?? [];
  const majorCritiqueIssues =
    args.render.latestCritique?.issues.filter((issue) => issue.severity === "major") ?? [];
  const critiqueWantsRegeneration = args.render.latestCritique?.recommendation === "regenerate";

  const imageStatus: RenderAcceptanceCheckStatus = args.render.imageUrl ? "pass" : "fail";
  const planStatus = qualityStatusToAcceptance(planCheck?.status);
  const specStatus = args.specDeltaReport ? specStatusToAcceptance(args.specDeltaReport.status) : "review";
  const keyElementStatus: RenderAcceptanceCheckStatus =
    critiqueWantsRegeneration || majorCritiqueIssues.length > 0
      ? "fail"
      : windowCheck?.status === "strong"
        ? "pass"
        : windowCheck?.status === "regenerate"
          ? "fail"
          : "review";
  const cameraStatus = cameraCheck ? specStatusToAcceptance(cameraCheck.status) : "review";
  const clientReadyStatus: RenderAcceptanceCheckStatus =
    args.qualityReport?.status === "strong" &&
    (!args.specDeltaReport || args.specDeltaReport.status !== "drift") &&
    !critiqueWantsRegeneration
      ? "pass"
      : args.qualityReport?.status === "regenerate" || critiqueWantsRegeneration
        ? "fail"
        : "review";

  const checks = [
    buildCheck({
      id: "image-ready",
      title: "Image generated",
      detail: args.render.imageUrl ? "Render image is available for review." : "Generate an image before accepting this render.",
      status: imageStatus
    }),
    buildCheck({
      id: "floor-plan-match",
      title: "Matches floor plan",
      detail: planCheck?.detail ?? "Run render quality analysis against saved floor-plan cues before final acceptance.",
      status: planStatus
    }),
    buildCheck({
      id: "design-spec-match",
      title: "Matches design spec",
      detail:
        args.specDeltaReport?.summary ??
        "No spec-delta report is available yet, so confirm this render against the current design spec.",
      status: specStatus
    }),
    buildCheck({
      id: "key-elements",
      title: "No missing key elements",
      detail:
        majorCritiqueIssues.length > 0
          ? `${majorCritiqueIssues.length} major critique issue${majorCritiqueIssues.length === 1 ? "" : "s"} should be resolved.`
          : windowCheck?.detail ?? "Confirm windows, entry, roof, and visible key elements are present.",
      status: keyElementStatus
    }),
    buildCheck({
      id: "camera-usable",
      title: "Camera angle usable",
      detail: cameraCheck?.detail ?? "Confirm the camera angle is useful for client review.",
      status: cameraStatus
    }),
    buildCheck({
      id: "client-ready",
      title: "Client-ready",
      detail:
        curbAppealCheck?.detail ??
        (args.render.latestCritique
          ? args.render.latestCritique.summary
          : "Confirm the render is polished enough for final selection or client sharing."),
      status: clientReadyStatus
    })
  ];
  const score = Math.round(checks.reduce((total, check) => total + scoreCheck(check.status), 0) / checks.length);
  const failCount = checks.filter((check) => check.status === "fail").length;
  const reviewCount = checks.filter((check) => check.status === "review").length;
  const status: RenderAcceptanceStatus =
    failCount > 0 || score < 68 ? "blocked" : reviewCount === 0 && score >= 90 ? "ready" : "review";
  const suggestedFixes =
    getOpenFixes(checks) ||
    specOpenChecks.map((check) => check.fix).join(" ") ||
    args.qualityReport?.suggestion ||
    "";

  return {
    score,
    status,
    label: getLabel(status),
    summary:
      status === "ready"
        ? "This render clears the acceptance gate for final selection."
        : status === "blocked"
          ? `${failCount} acceptance item${failCount === 1 ? "" : "s"} should be fixed before using this as final.`
          : `${reviewCount} acceptance item${reviewCount === 1 ? "" : "s"} should be checked before client delivery.`,
    checks,
    suggestedFixes,
    canAccept: status !== "blocked" && Boolean(args.render.imageUrl)
  };
}
