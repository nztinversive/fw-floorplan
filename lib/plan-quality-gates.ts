import { getFurnitureClearanceConflicts } from "./furniture-clearance";
import { buildRoomDesignDirectionReport } from "./room-design-directions";
import type { RenderBrief, RenderSettings, StoredFloorPlan } from "./types";

export type PlanQualityGateStatus = "ready" | "review" | "blocked";

export type PlanQualityGateAction =
  | {
      id: string;
      kind: "brief";
      label: string;
      target: keyof RenderBrief;
      text: string;
    }
  | {
      id: string;
      kind: "scroll";
      label: string;
      targetId: string;
    }
  | {
      id: string;
      kind: "link";
      label: string;
      href: string;
    };

export type PlanQualityGate = {
  id: string;
  label: string;
  detail: string;
  status: PlanQualityGateStatus;
  actions: PlanQualityGateAction[];
};

export type PlanQualityGateReport = {
  status: PlanQualityGateStatus;
  score: number;
  label: string;
  summary: string;
  readyCount: number;
  reviewCount: number;
  blockedCount: number;
  gates: PlanQualityGate[];
};

const ENTRY_TERMS = ["entry", "foyer", "front", "porch", "stoop", "vestibule"];
const REAR_TERMS = ["rear", "back", "deck", "patio"];

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function countPlanItems(floorPlans: StoredFloorPlan[]) {
  return floorPlans.reduce(
    (counts, floorPlan) => ({
      walls: counts.walls + floorPlan.data.walls.length,
      rooms: counts.rooms + floorPlan.data.rooms.length,
      doors: counts.doors + floorPlan.data.doors.length,
      windows: counts.windows + floorPlan.data.windows.length,
      furniture: counts.furniture + floorPlan.data.furniture.length,
      annotations: counts.annotations + floorPlan.data.annotations.length
    }),
    { walls: 0, rooms: 0, doors: 0, windows: 0, furniture: 0, annotations: 0 }
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

function isUsefulRoomLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  return normalized.length > 0 && !/^room\s*\d*$/.test(normalized) && normalized !== "unlabeled";
}

function makeBriefAction(
  id: string,
  label: string,
  target: keyof RenderBrief,
  text: string
): PlanQualityGateAction {
  return {
    id,
    kind: "brief",
    label,
    target,
    text
  };
}

function makeGate(args: PlanQualityGate): PlanQualityGate {
  return args;
}

export function applyPlanQualityGateActionToBrief(
  renderBrief: RenderBrief,
  action: Extract<PlanQualityGateAction, { kind: "brief" }>
): RenderBrief {
  const currentValue = renderBrief[action.target];
  const existingLines = currentValue
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const nextLines = action.text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !existingLines.includes(line));

  if (nextLines.length === 0) {
    return renderBrief;
  }

  return {
    ...renderBrief,
    [action.target]: [...existingLines, ...nextLines].join("\n")
  };
}

export function buildPlanQualityGateReport(args: {
  floorPlans: StoredFloorPlan[];
  renderBrief: RenderBrief;
  settings: RenderSettings;
  styleLabel: string;
  editHref: string;
  designDNAText?: string;
}): PlanQualityGateReport {
  const counts = countPlanItems(args.floorPlans);
  const planText = getPlanText(args.floorPlans);
  const allRooms = args.floorPlans.flatMap((floorPlan) => floorPlan.data.rooms);
  const labeledRooms = allRooms.filter((room) => isUsefulRoomLabel(room.label)).length;
  const labelRatio = counts.rooms === 0 ? 0 : labeledRooms / counts.rooms;
  const hasEntryCue = includesAny(planText, ENTRY_TERMS) || counts.doors > 0;
  const hasRearCue = includesAny(planText, REAR_TERMS);
  const furnitureConflicts = args.floorPlans.flatMap((floorPlan) =>
    getFurnitureClearanceConflicts(floorPlan.data)
  );
  const hasRoomDirections = args.renderBrief.designNotes.includes("Room-by-room design directions:");
  const hasDesignDNAInBrief = args.renderBrief.designNotes.includes("Project Design DNA:");
  const hasUsableDNA = Boolean(args.designDNAText?.trim());
  const directionReport = buildRoomDesignDirectionReport({
    floorPlans: args.floorPlans,
    styleLabel: args.styleLabel
  });
  const briefHasDirection = args.renderBrief.designNotes.trim().length >= 40;
  const briefHasMustHave = args.renderBrief.mustHave.trim().length >= 18;
  const gates: PlanQualityGate[] = [];

  gates.push(makeGate({
    id: "core-plan",
    label: counts.walls > 0 && counts.rooms > 0 ? "Core plan saved" : "Core plan needs geometry",
    detail:
      counts.walls > 0 && counts.rooms > 0
        ? `${counts.walls} wall segment${counts.walls === 1 ? "" : "s"} and ${counts.rooms} room${counts.rooms === 1 ? "" : "s"} are available for generation.`
        : "Save wall geometry and room polygons before generating so the model has real plan structure.",
    status: counts.walls > 0 && counts.rooms > 0 ? "ready" : "blocked",
    actions: [
      {
        id: "open-editor-core",
        kind: "link",
        label: "Open editor",
        href: args.editHref
      }
    ]
  }));

  gates.push(makeGate({
    id: "room-labels",
    label: labelRatio >= 0.8 ? "Room labels are useful" : "Room labels need cleanup",
    detail:
      labelRatio >= 0.8
        ? `${labeledRooms}/${counts.rooms} rooms have usable labels for room-aware massing and window logic.`
        : "Label bedrooms, kitchens, living areas, entries, and service spaces before relying on generated design details.",
    status: counts.rooms === 0 ? "blocked" : labelRatio >= 0.8 ? "ready" : "review",
    actions: [
      {
        id: "open-editor-labels",
        kind: "link",
        label: "Edit labels",
        href: args.editHref
      }
    ]
  }));

  gates.push(makeGate({
    id: "entry-window-cues",
    label: hasEntryCue && counts.windows > 0 ? "Entry and windows grounded" : "Entry/window cues need guidance",
    detail:
      hasEntryCue && counts.windows > 0
        ? `${counts.windows} window marker${counts.windows === 1 ? "" : "s"} and entry cues are ready to anchor the facade.`
        : "Exterior renders need an entry sequence and window rhythm so the model does not invent facade logic.",
    status: counts.rooms === 0 ? "blocked" : hasEntryCue && counts.windows > 0 ? "ready" : "review",
    actions: [
      !hasEntryCue
        ? makeBriefAction(
            "clarify-entry",
            "Clarify entry",
            "designNotes",
            "Make the front entry sequence clear, believable, and aligned with the saved floor plan."
          )
        : null,
      counts.windows === 0
        ? makeBriefAction(
            "guide-windows",
            "Guide windows",
            "mustHave",
            "Window placement should align with bedrooms, living spaces, and believable facade proportions from the floor plan."
          )
        : null
    ].filter(Boolean) as PlanQualityGateAction[]
  }));

  gates.push(makeGate({
    id: "circulation-furniture",
    label: furnitureConflicts.length === 0 ? "Furniture clearances pass" : "Furniture/circulation conflicts found",
    detail:
      furnitureConflicts.length === 0
        ? counts.furniture > 0
          ? `${counts.furniture} furniture item${counts.furniture === 1 ? "" : "s"} have no major clearance conflicts.`
          : "No furniture is placed yet; generation can proceed, but interior-aware design feedback will be lighter."
        : `${furnitureConflicts.length} clearance conflict${furnitureConflicts.length === 1 ? "" : "s"} may weaken plan quality and downstream design choices.`,
    status: furnitureConflicts.length === 0 ? "ready" : "review",
    actions: [
      {
        id: "open-editor-furniture",
        kind: "link",
        label: counts.furniture > 0 ? "Fix layout" : "Add furniture",
        href: args.editHref
      }
    ]
  }));

  gates.push(makeGate({
    id: "room-directions",
    label: hasRoomDirections ? "Room directions applied" : "Room directions can sharpen output",
    detail:
      hasRoomDirections
        ? "The render brief includes room-by-room design directions from the current plan."
        : directionReport.roomCount > 0
          ? directionReport.summary
          : "Add room polygons before generating room-by-room design directions.",
    status: directionReport.roomCount === 0 ? "blocked" : hasRoomDirections ? "ready" : "review",
    actions: [
      directionReport.directionText
        ? makeBriefAction(
            "add-room-directions",
            "Add directions",
            "designNotes",
            `Room-by-room design directions:\n${directionReport.directionText}`
          )
        : null,
      {
        id: "open-room-directions",
        kind: "scroll",
        label: "Review directions",
        targetId: "room-design-directions-section"
      }
    ].filter(Boolean) as PlanQualityGateAction[]
  }));

  gates.push(makeGate({
    id: "design-dna",
    label: !hasUsableDNA || hasDesignDNAInBrief ? "Design DNA aligned" : "Design DNA not applied",
    detail:
      !hasUsableDNA
        ? "No favorite render DNA exists yet; this gate becomes useful after a strong option is favored."
        : hasDesignDNAInBrief
          ? "Project Design DNA is included in the brief and can stabilize future generations."
          : "Favorite-render DNA exists, but it is not yet included in the active brief.",
    status: !hasUsableDNA || hasDesignDNAInBrief ? "ready" : "review",
    actions: [
      hasUsableDNA && !hasDesignDNAInBrief
        ? makeBriefAction("apply-design-dna", "Apply DNA", "designNotes", args.designDNAText!)
        : null,
      {
        id: "open-design-dna",
        kind: "scroll",
        label: "Review DNA",
        targetId: "design-dna-section"
      }
    ].filter(Boolean) as PlanQualityGateAction[]
  }));

  gates.push(makeGate({
    id: "brief-specificity",
    label: briefHasDirection && briefHasMustHave ? "Brief is generation-ready" : "Brief needs stronger intent",
    detail:
      briefHasDirection && briefHasMustHave
        ? "Design direction and must-have details are specific enough for controlled generation."
        : "Add design intent and non-negotiables before spending render time.",
    status: briefHasDirection && briefHasMustHave ? "ready" : "review",
    actions: [
      !briefHasDirection
        ? makeBriefAction(
            "baseline-design-intent",
            "Add baseline intent",
            "designNotes",
            `Create a realistic ${args.styleLabel} residential exterior that follows the saved floor plan, with clear massing, buildable roof forms, and room-aware windows.`
          )
        : null,
      !briefHasMustHave
        ? makeBriefAction(
            "baseline-must-haves",
            "Add must-haves",
            "mustHave",
            "Preserve floor-plan logic, believable roof massing, room-aligned windows, coherent entry sequence, and practical material transitions."
          )
        : null
    ].filter(Boolean) as PlanQualityGateAction[]
  }));

  if (args.settings.viewAngle === "rear-elevation" && !hasRearCue) {
    gates.push(makeGate({
      id: "rear-view-context",
      label: "Rear view needs context",
      detail: "Rear elevation is selected, but the plan does not clearly mark rear-facing features.",
      status: "review",
      actions: [
        makeBriefAction(
          "clarify-rear-view",
          "Clarify rear view",
          "revisionNotes",
          "Keep the rear elevation believable and avoid inventing rear features not implied by the floor plan."
        )
      ]
    }));
  }

  const blockedCount = gates.filter((gate) => gate.status === "blocked").length;
  const reviewCount = gates.filter((gate) => gate.status === "review").length;
  const readyCount = gates.filter((gate) => gate.status === "ready").length;
  const score = Math.max(0, Math.round(100 - blockedCount * 22 - reviewCount * 8));
  const status: PlanQualityGateStatus = blockedCount > 0 ? "blocked" : reviewCount > 0 ? "review" : "ready";

  return {
    status,
    score,
    label: status === "ready" ? "Gates ready" : status === "blocked" ? "Blocked" : "Needs review",
    summary:
      status === "ready"
        ? "Plan, brief, and design controls are strong enough for high-quality generation."
        : status === "blocked"
          ? `${blockedCount} blocked gate${blockedCount === 1 ? "" : "s"} must be resolved before generation.`
          : `${reviewCount} quality improvement${reviewCount === 1 ? "" : "s"} can improve the next render.`,
    readyCount,
    reviewCount,
    blockedCount,
    gates
  };
}
