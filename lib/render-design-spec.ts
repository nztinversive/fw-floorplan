import type { RenderBrief, RenderSettings, StoredFloorPlan } from "./types";

export type RenderDesignSpecStatus = "ready" | "review" | "blocked";

export type RenderDesignSpecAction = {
  id: string;
  label: string;
  target: keyof RenderBrief;
  text: string;
};

export type RenderDesignSpecReport = {
  status: RenderDesignSpecStatus;
  score: number;
  label: string;
  summary: string;
  massing: string;
  roomWindowAssumptions: string[];
  constraints: string[];
  missingInfo: string[];
  actions: RenderDesignSpecAction[];
  specText: string;
};

const ENTRY_TERMS = ["entry", "foyer", "front", "porch", "stoop", "vestibule"];
const REAR_TERMS = ["rear", "back", "deck", "patio"];
const PORCH_TERMS = ["porch", "stoop", "deck", "patio", "covered entry"];
const GARAGE_TERMS = ["garage", "carport"];
const LIVING_TERMS = ["living", "family", "great room"];
const KITCHEN_TERMS = ["kitchen"];
const DINING_TERMS = ["dining"];
const BEDROOM_TERMS = ["bedroom", "bunk", "primary suite"];
const BATH_TERMS = ["bath", "powder"];

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function cleanLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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

function countRooms(floorPlans: StoredFloorPlan[], terms: string[]) {
  return floorPlans.reduce(
    (total, floorPlan) =>
      total + floorPlan.data.rooms.filter((room) => includesAny(room.label.toLowerCase(), terms)).length,
    0
  );
}

function getTotalArea(floorPlans: StoredFloorPlan[]) {
  return floorPlans.reduce(
    (total, floorPlan) =>
      total + floorPlan.data.rooms.reduce((floorTotal, room) => floorTotal + Math.max(0, room.areaSqFt), 0),
    0
  );
}

function getPlanCounts(floorPlans: StoredFloorPlan[]) {
  return floorPlans.reduce(
    (counts, floorPlan) => ({
      walls: counts.walls + floorPlan.data.walls.length,
      rooms: counts.rooms + floorPlan.data.rooms.length,
      doors: counts.doors + floorPlan.data.doors.length,
      windows: counts.windows + floorPlan.data.windows.length,
      annotations: counts.annotations + floorPlan.data.annotations.length
    }),
    { walls: 0, rooms: 0, doors: 0, windows: 0, annotations: 0 }
  );
}

function getFootprintSummary(floorPlans: StoredFloorPlan[]) {
  const firstFloor = [...floorPlans].sort((left, right) => left.floor - right.floor)[0];
  if (!firstFloor || firstFloor.data.walls.length === 0 || firstFloor.data.scale <= 0) {
    return null;
  }

  const points = firstFloor.data.walls.flatMap((wall) => [
    { x: wall.x1, y: wall.y1 },
    { x: wall.x2, y: wall.y2 }
  ]);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const widthFeet = Math.round((maxX - minX) / firstFloor.data.scale);
  const depthFeet = Math.round((maxY - minY) / firstFloor.data.scale);

  if (!Number.isFinite(widthFeet) || !Number.isFinite(depthFeet) || widthFeet <= 0 || depthFeet <= 0) {
    return null;
  }

  return `${widthFeet} ft wide by ${depthFeet} ft deep`;
}

function makeAction(id: string, label: string, target: keyof RenderBrief, text: string): RenderDesignSpecAction {
  return { id, label, target, text };
}

function buildSpecText(args: {
  massing: string;
  roomWindowAssumptions: string[];
  constraints: string[];
  missingInfo: string[];
}) {
  return [
    "Render-ready design spec:",
    `- Massing: ${args.massing}`,
    ...args.roomWindowAssumptions.map((item) => `- Room/window assumption: ${item}`),
    ...args.constraints.map((item) => `- Constraint: ${item}`),
    ...args.missingInfo.map((item) => `- Missing info warning: ${item}`)
  ].join("\n");
}

export function applyRenderDesignSpecToBrief(renderBrief: RenderBrief, report: RenderDesignSpecReport): RenderBrief {
  const heading = "Render-ready design spec:";
  const existingLines = renderBrief.designNotes.split("\n");
  const startIndex = existingLines.findIndex((line) => line.trim() === heading);
  let nextDesignNotes = "";

  if (startIndex === -1) {
    nextDesignNotes = [renderBrief.designNotes.trim(), report.specText].filter(Boolean).join("\n\n");
  } else {
    let endIndex = startIndex + 1;
    while (endIndex < existingLines.length && existingLines[endIndex].trim().startsWith("- ")) {
      endIndex += 1;
    }
    nextDesignNotes = [
      ...existingLines.slice(0, startIndex),
      ...report.specText.split("\n"),
      ...existingLines.slice(endIndex)
    ]
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return {
    ...renderBrief,
    designNotes: nextDesignNotes
  };
}

export function buildRenderDesignSpecReport(args: {
  floorPlans: StoredFloorPlan[];
  renderBrief: RenderBrief;
  settings: RenderSettings;
  styleLabel: string;
}): RenderDesignSpecReport {
  const counts = getPlanCounts(args.floorPlans);
  const planText = getPlanText(args.floorPlans);
  const briefText = [
    args.renderBrief.designNotes,
    args.renderBrief.mustHave,
    args.renderBrief.avoid,
    args.renderBrief.revisionNotes
  ].join(" ").toLowerCase();
  const totalArea = getTotalArea(args.floorPlans);
  const floorCount = args.floorPlans.length;
  const bedrooms = countRooms(args.floorPlans, BEDROOM_TERMS);
  const bathrooms = countRooms(args.floorPlans, BATH_TERMS);
  const livingRooms = countRooms(args.floorPlans, LIVING_TERMS);
  const kitchens = countRooms(args.floorPlans, KITCHEN_TERMS);
  const diningRooms = countRooms(args.floorPlans, DINING_TERMS);
  const hasEntryCue = includesAny(planText, ENTRY_TERMS) || counts.doors > 0;
  const hasRearCue = includesAny(planText, REAR_TERMS);
  const hasPorchCue = includesAny(planText, PORCH_TERMS) || includesAny(briefText, PORCH_TERMS);
  const hasGarageCue =
    includesAny(planText, GARAGE_TERMS) ||
    args.floorPlans.some((floorPlan) => floorPlan.data.doors.some((door) => door.type === "garage"));
  const footprintSummary = getFootprintSummary(args.floorPlans);
  const missingInfo: string[] = [];
  const roomWindowAssumptions: string[] = [];
  const constraints: string[] = [];
  const actions: RenderDesignSpecAction[] = [];

  if (counts.walls === 0) {
    missingInfo.push("No saved wall geometry is available for exterior massing.");
  }
  if (counts.rooms === 0) {
    missingInfo.push("No room labels are available to ground room-aware windows and massing.");
  }
  if (counts.windows === 0) {
    missingInfo.push("No window markers are saved, so facade window placement needs explicit guidance.");
    actions.push(makeAction(
      "guide-windows",
      "Add window guidance",
      "mustHave",
      "Window placement should align with bedrooms, living spaces, and believable facade proportions from the floor plan."
    ));
  }
  if (!hasEntryCue) {
    missingInfo.push("The front entry sequence is not clearly labeled.");
    actions.push(makeAction(
      "clarify-entry",
      "Clarify entry",
      "designNotes",
      "Make the front entry sequence clear, welcoming, and aligned with the saved floor plan."
    ));
  }
  if (args.settings.viewAngle === "rear-elevation" && !hasRearCue) {
    missingInfo.push("Rear elevation selected without rear-facing plan cues.");
    actions.push(makeAction(
      "clarify-rear",
      "Clarify rear view",
      "revisionNotes",
      "Keep the rear elevation believable and avoid inventing rear features not implied by the floor plan."
    ));
  }
  if (args.renderBrief.designNotes.trim().length < 24) {
    missingInfo.push("Design direction is light; add target exterior character before rendering.");
    actions.push(makeAction(
      "baseline-direction",
      "Add baseline direction",
      "designNotes",
      "Create a realistic residential exterior that follows the saved floor plan, with clear massing and buildable details."
    ));
  }
  if (args.renderBrief.mustHave.trim().length < 12) {
    actions.push(makeAction(
      "baseline-must-have",
      "Add must-haves",
      "mustHave",
      "Preserve floor-plan logic, believable roof massing, room-aligned windows, and a coherent entry sequence."
    ));
  }

  const floorText =
    floorCount === 1 ? "single-story" : floorCount === 2 ? "two-story" : `${floorCount}-story`;
  const roomSummary = [
    bedrooms > 0 ? pluralize(bedrooms, "bedroom") : null,
    bathrooms > 0 ? pluralize(bathrooms, "bathroom") : null,
    livingRooms > 0 ? pluralize(livingRooms, "living area") : null,
    kitchens > 0 ? pluralize(kitchens, "kitchen") : null,
    diningRooms > 0 ? pluralize(diningRooms, "dining area") : null
  ].filter(Boolean).join(", ");
  const areaText = totalArea > 0 ? `${Math.round(totalArea).toLocaleString()} sq ft` : "residential-scale";
  const massing = [
    `A ${floorText} ${areaText} home`,
    roomSummary ? `with ${roomSummary}` : "with room relationships inferred from the saved plan",
    footprintSummary ? `on a footprint roughly ${footprintSummary}` : null
  ].filter(Boolean).join(" ");

  if (bedrooms > 0) {
    roomWindowAssumptions.push(`${pluralize(bedrooms, "bedroom")} should have appropriately scaled private-room windows.`);
  }
  if (livingRooms + kitchens + diningRooms > 0) {
    roomWindowAssumptions.push("Shared living, kitchen, and dining zones can carry larger public-facing openings.");
  }
  if (counts.windows > 0) {
    roomWindowAssumptions.push(`${pluralize(counts.windows, "window")} are saved and should guide facade rhythm.`);
  }
  if (counts.doors > 0) {
    roomWindowAssumptions.push(`${pluralize(counts.doors, "door")} are saved and should anchor entry and service openings.`);
  }

  constraints.push(`${args.styleLabel} exterior direction using ${args.settings.sidingMaterial}, ${args.settings.roofStyle}, and ${args.settings.colorPalette}.`);
  constraints.push(`Camera must stay aligned to ${args.settings.viewAngle.replace(/-/g, " ")} with ${args.settings.timeOfDay} lighting in ${args.settings.season}.`);
  if (hasPorchCue) {
    constraints.push("If a porch or covered entry appears, integrate it with the roof and entry rather than treating it as an add-on.");
  }
  if (!hasGarageCue && !briefText.includes("garage")) {
    constraints.push("Do not invent a garage or carport unless the saved plan clearly supports one.");
  }
  cleanLines(args.renderBrief.avoid).forEach((line) => constraints.push(`Avoid ${line.replace(/\.$/, "")}.`));

  if (roomWindowAssumptions.length === 0) {
    roomWindowAssumptions.push("Use the saved walls and room labels as the primary source of truth for exterior massing.");
  }

  const criticalMissing = counts.walls === 0 || counts.rooms === 0;
  const reviewMissing = missingInfo.length;
  const score = Math.max(0, Math.round(100 - (criticalMissing ? 36 : 0) - reviewMissing * 9));
  const status: RenderDesignSpecStatus = criticalMissing ? "blocked" : reviewMissing > 0 ? "review" : "ready";
  const label = status === "ready" ? "Spec ready" : status === "blocked" ? "Blocked" : "Needs review";
  const summary =
    status === "ready"
      ? "The floor plan, brief, and settings produce a render-ready design spec."
      : status === "blocked"
        ? "Add core floor-plan geometry and room labels before generating."
        : "The spec is usable, but a few clarifications will improve render quality.";
  const specText = buildSpecText({
    massing,
    roomWindowAssumptions,
    constraints,
    missingInfo
  });

  return {
    status,
    score,
    label,
    summary,
    massing,
    roomWindowAssumptions,
    constraints,
    missingInfo,
    actions,
    specText
  };
}
