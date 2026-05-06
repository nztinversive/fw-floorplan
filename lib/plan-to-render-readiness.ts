import type { PlanQualityGateReport, PlanQualityGateStatus } from "./plan-quality-gates";
import type { RenderBrief, StoredFloorPlan } from "./types";

export type PlanToRenderReadinessStatus = PlanQualityGateStatus;

export type PlanToRenderReadinessCheck = {
  id: string;
  label: string;
  detail: string;
  status: PlanToRenderReadinessStatus;
};

export type PlanToRenderReadinessReport = {
  status: PlanToRenderReadinessStatus;
  score: number;
  label: string;
  summary: string;
  promptGuidance: string;
  checks: PlanToRenderReadinessCheck[];
  blockedCount: number;
  reviewCount: number;
  readyCount: number;
};

const READINESS_HEADING = "Plan-to-render readiness lock:";

function isUsefulRoomLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  return normalized.length > 0 && !/^room\s*\d*$/.test(normalized) && normalized !== "unlabeled";
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function getCounts(floorPlans: StoredFloorPlan[]) {
  return floorPlans.reduce(
    (counts, floorPlan) => ({
      walls: counts.walls + floorPlan.data.walls.length,
      rooms: counts.rooms + floorPlan.data.rooms.length,
      doors: counts.doors + floorPlan.data.doors.length,
      windows: counts.windows + floorPlan.data.windows.length,
      furniture: counts.furniture + floorPlan.data.furniture.length
    }),
    { walls: 0, rooms: 0, doors: 0, windows: 0, furniture: 0 }
  );
}

function getPlanText(floorPlans: StoredFloorPlan[]) {
  return floorPlans
    .flatMap((floorPlan) => [
      ...floorPlan.data.rooms.map((room) => room.label),
      ...floorPlan.data.annotations.map((annotation) => annotation.label),
      ...floorPlan.data.furniture.map((furniture) => furniture.type)
    ])
    .join(" ")
    .toLowerCase();
}

function getRoomLabels(floorPlans: StoredFloorPlan[]) {
  return floorPlans
    .flatMap((floorPlan) => floorPlan.data.rooms.map((room) => room.label.trim()))
    .filter(isUsefulRoomLabel);
}

function makeCheck(check: PlanToRenderReadinessCheck): PlanToRenderReadinessCheck {
  return check;
}

function buildFallbackChecks(args: {
  floorPlans: StoredFloorPlan[];
  renderBrief?: RenderBrief;
}): PlanToRenderReadinessCheck[] {
  const counts = getCounts(args.floorPlans);
  const planText = getPlanText(args.floorPlans);
  const roomLabels = getRoomLabels(args.floorPlans);
  const labelRatio = counts.rooms === 0 ? 0 : roomLabels.length / counts.rooms;
  const hasEntryCue = includesAny(planText, ["entry", "foyer", "front", "porch", "stoop", "vestibule"]) || counts.doors > 0;
  const hasBrief = args.renderBrief
    ? args.renderBrief.designNotes.trim().length + args.renderBrief.mustHave.trim().length >= 40
    : true;

  return [
    makeCheck({
      id: "geometry",
      label: counts.walls > 0 && counts.rooms > 0 ? "Plan geometry saved" : "Plan geometry required",
      detail:
        counts.walls > 0 && counts.rooms > 0
          ? `${counts.walls} wall segment${counts.walls === 1 ? "" : "s"} and ${counts.rooms} room${counts.rooms === 1 ? "" : "s"} can guide the render.`
          : "Save wall geometry and room polygons before generating a render.",
      status: counts.walls > 0 && counts.rooms > 0 ? "ready" : "blocked"
    }),
    makeCheck({
      id: "labels",
      label: labelRatio >= 0.8 ? "Room labels ready" : "Room labels need cleanup",
      detail:
        counts.rooms === 0
          ? "Add room polygons before checking labels."
          : `${roomLabels.length}/${counts.rooms} rooms have usable labels for room-aware windows and massing.`,
      status: counts.rooms === 0 ? "blocked" : labelRatio >= 0.8 ? "ready" : "review"
    }),
    makeCheck({
      id: "openings",
      label: hasEntryCue && counts.windows > 0 ? "Openings grounded" : "Openings need guidance",
      detail:
        hasEntryCue && counts.windows > 0
          ? `${counts.doors} door marker${counts.doors === 1 ? "" : "s"} and ${counts.windows} window marker${counts.windows === 1 ? "" : "s"} can anchor the facade.`
          : "Add an entry cue and window markers, or add explicit facade guidance in the brief.",
      status: counts.rooms === 0 ? "blocked" : hasEntryCue && counts.windows > 0 ? "ready" : "review"
    }),
    makeCheck({
      id: "brief",
      label: hasBrief ? "Render brief usable" : "Render brief needs intent",
      detail: hasBrief
        ? "The brief has enough design direction to constrain generation."
        : "Add design direction and must-haves before generating.",
      status: hasBrief ? "ready" : "review"
    })
  ];
}

function getStatusFromCounts(blockedCount: number, reviewCount: number): PlanToRenderReadinessStatus {
  if (blockedCount > 0) return "blocked";
  if (reviewCount > 0) return "review";
  return "ready";
}

function getLabel(status: PlanToRenderReadinessStatus) {
  if (status === "ready") return "Ready";
  if (status === "blocked") return "Locked";
  return "Review";
}

function summarizeFloorScope(floorPlans: StoredFloorPlan[], selectedFloor?: number) {
  if (selectedFloor) {
    return `floor ${selectedFloor}`;
  }

  if (floorPlans.length === 1) {
    return `floor ${floorPlans[0].floor}`;
  }

  return `${floorPlans.length} floors`;
}

function buildPromptGuidance(args: {
  floorPlans: StoredFloorPlan[];
  checks: PlanToRenderReadinessCheck[];
  score: number;
  status: PlanToRenderReadinessStatus;
  selectedFloor?: number;
}) {
  const counts = getCounts(args.floorPlans);
  const labels = getRoomLabels(args.floorPlans).slice(0, 18);
  const issues = args.checks
    .filter((check) => check.status !== "ready")
    .map((check) => `${check.label}: ${check.detail}`)
    .slice(0, 4);
  const issueText = issues.length > 0
    ? `Resolve or compensate for these plan risks: ${issues.join(" ")}`
    : "No hard plan risks are currently flagged.";
  const labelText = labels.length > 0
    ? `Use the saved room program (${labels.join(", ")}) to infer facade massing, window rhythm, and entry hierarchy.`
    : "Use saved geometry as the source of truth and avoid inventing unsupported room logic.";

  return [
    `${getLabel(args.status)} at ${args.score}/100 for ${summarizeFloorScope(args.floorPlans, args.selectedFloor)}.`,
    `${counts.rooms} rooms, ${counts.walls} walls, ${counts.doors} doors, and ${counts.windows} windows are present.`,
    labelText,
    issueText,
    "Keep exterior renders faithful to the saved floor plan; do not invent extra stories, major wings, or facade openings that conflict with the plan."
  ].join(" ");
}

function replaceReadinessBlock(existingText: string, blockText: string) {
  const lines = existingText.split("\n");
  const startIndex = lines.findIndex((line) => line.trim() === READINESS_HEADING);

  if (startIndex === -1) {
    return [existingText.trim(), blockText].filter(Boolean).join("\n\n");
  }

  let endIndex = startIndex + 1;
  while (endIndex < lines.length && lines[endIndex].trim().length > 0) {
    endIndex += 1;
  }

  return [
    ...lines.slice(0, startIndex),
    ...blockText.split("\n"),
    ...lines.slice(endIndex)
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildPlanToRenderReadinessReport(args: {
  floorPlans: StoredFloorPlan[];
  renderBrief?: RenderBrief;
  planQualityGates?: PlanQualityGateReport | null;
  selectedFloor?: number;
}): PlanToRenderReadinessReport {
  const checks = args.planQualityGates
    ? args.planQualityGates.gates.map((gate) => ({
      id: gate.id,
      label: gate.label,
      detail: gate.detail,
      status: gate.status
    }))
    : buildFallbackChecks({
      floorPlans: args.floorPlans,
      renderBrief: args.renderBrief
    });
  const blockedCount = checks.filter((check) => check.status === "blocked").length;
  const reviewCount = checks.filter((check) => check.status === "review").length;
  const readyCount = checks.filter((check) => check.status === "ready").length;
  const status = args.planQualityGates?.status ?? getStatusFromCounts(blockedCount, reviewCount);
  const score = args.planQualityGates?.score ?? Math.max(0, Math.round(100 - blockedCount * 25 - reviewCount * 8));
  const label = status === "ready" ? "Render ready" : status === "blocked" ? "Render locked" : "Review before render";
  const summary = status === "ready"
    ? "The saved plan is ready to drive high-quality render generation."
    : status === "blocked"
      ? `${blockedCount} blocker${blockedCount === 1 ? "" : "s"} must be fixed before rendering.`
      : `${reviewCount} plan issue${reviewCount === 1 ? "" : "s"} should be reviewed before rendering.`;
  const promptGuidance = buildPromptGuidance({
    floorPlans: args.floorPlans,
    checks,
    score,
    status,
    selectedFloor: args.selectedFloor
  });

  return {
    status,
    score,
    label,
    summary,
    promptGuidance,
    checks,
    blockedCount,
    reviewCount,
    readyCount
  };
}

export function applyPlanToRenderReadinessToBrief(
  renderBrief: RenderBrief,
  report: PlanToRenderReadinessReport
): RenderBrief {
  const blockText = `${READINESS_HEADING}\n${report.promptGuidance}`;

  return {
    ...renderBrief,
    designNotes: replaceReadinessBlock(renderBrief.designNotes, blockText)
  };
}
