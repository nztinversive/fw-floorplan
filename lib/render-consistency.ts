import type { RenderBrief, RenderSettings, StoredFloorPlan } from "./types";

export type RenderConsistencyStatus = "ready" | "review" | "missing";

export type RenderConsistencyCheck = {
  id: string;
  title: string;
  detail: string;
  status: RenderConsistencyStatus;
  actionLabel?: string;
  briefTarget?: keyof RenderBrief;
  briefText?: string;
};

export type RenderConsistencyReport = {
  score: number;
  summary: string;
  checks: RenderConsistencyCheck[];
};

const ENTRY_TERMS = ["entry", "foyer", "vestibule", "porch", "front"];
const PORCH_TERMS = ["porch", "deck", "stoop", "patio"];
const GARAGE_TERMS = ["garage", "carport"];
const LIVING_TERMS = ["living", "family", "great room"];

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function getAllPlanText(floorPlans: StoredFloorPlan[]) {
  return floorPlans
    .flatMap((floorPlan) => [
      ...floorPlan.data.rooms.map((room) => room.label),
      ...floorPlan.data.annotations.map((annotation) => annotation.label),
      ...floorPlan.data.furniture.map((furniture) => furniture.type)
    ])
    .join(" ")
    .toLowerCase();
}

function getBriefText(renderBrief: RenderBrief) {
  return [
    renderBrief.designNotes,
    renderBrief.mustHave,
    renderBrief.avoid,
    renderBrief.revisionNotes
  ].join(" ").toLowerCase();
}

function countRooms(floorPlans: StoredFloorPlan[], matcher: (label: string) => boolean) {
  return floorPlans.reduce(
    (total, floorPlan) =>
      total + floorPlan.data.rooms.filter((room) => matcher(room.label.toLowerCase())).length,
    0
  );
}

function hasPlanDoors(floorPlans: StoredFloorPlan[]) {
  return floorPlans.some((floorPlan) => floorPlan.data.doors.length > 0);
}

function getWindowCount(floorPlans: StoredFloorPlan[]) {
  return floorPlans.reduce((total, floorPlan) => total + floorPlan.data.windows.length, 0);
}

function getRoomCount(floorPlans: StoredFloorPlan[]) {
  return floorPlans.reduce((total, floorPlan) => total + floorPlan.data.rooms.length, 0);
}

function buildCheck(args: RenderConsistencyCheck): RenderConsistencyCheck {
  return args;
}

export function analyzeRenderConsistency(args: {
  floorPlans: StoredFloorPlan[];
  renderBrief: RenderBrief;
  settings: RenderSettings;
}): RenderConsistencyReport {
  const planText = getAllPlanText(args.floorPlans);
  const briefText = getBriefText(args.renderBrief);
  const checks: RenderConsistencyCheck[] = [];
  const bedrooms = countRooms(
    args.floorPlans,
    (label) => label.includes("bedroom") || label.includes("bunk")
  );
  const livingRooms = countRooms(args.floorPlans, (label) => includesAny(label, LIVING_TERMS));
  const roomCount = getRoomCount(args.floorPlans);
  const windowCount = getWindowCount(args.floorPlans);
  const expectedWindowCount = Math.max(2, bedrooms + livingRooms);
  const hasEntryCue = includesAny(planText, ENTRY_TERMS) || hasPlanDoors(args.floorPlans);
  const hasPorchCue = includesAny(planText, PORCH_TERMS);
  const hasGarageCue =
    includesAny(planText, GARAGE_TERMS) ||
    args.floorPlans.some((floorPlan) => floorPlan.data.doors.some((door) => door.type === "garage"));
  const briefMentionsPorch = briefText.includes("porch") || briefText.includes("covered entry");
  const briefMentionsGarage = briefText.includes("garage") || briefText.includes("carport");
  const briefHasDirection = args.renderBrief.designNotes.trim().length >= 24;
  const briefHasMustHave = args.renderBrief.mustHave.trim().length >= 12;

  checks.push(
    buildCheck({
      id: "plan-room-cues",
      title: roomCount > 0 ? "Floor plan cues available" : "Floor plan cues missing",
      detail:
        roomCount > 0
          ? `${roomCount} room label${roomCount === 1 ? "" : "s"} can guide massing and room-aware window placement.`
          : "Add room labels before generating so the prompt can describe the house accurately.",
      status: roomCount > 0 ? "ready" : "missing"
    })
  );

  checks.push(
    buildCheck({
      id: "entry-sequence",
      title: hasEntryCue ? "Entry sequence has a cue" : "Entry sequence needs clarification",
      detail: hasEntryCue
        ? "The plan includes entry, porch, front, or door cues for the camera prompt."
        : "The selected view needs a clear front-entry instruction so the model does not invent the approach.",
      status: hasEntryCue ? "ready" : "review",
      actionLabel: hasEntryCue ? undefined : "Clarify entry",
      briefTarget: hasEntryCue ? undefined : "designNotes",
      briefText: hasEntryCue
        ? undefined
        : "Make the front entry sequence clear, believable, and aligned with the saved floor plan."
    })
  );

  if (briefMentionsPorch || args.settings.style === "craftsman" || args.settings.style === "modern-farmhouse") {
    checks.push(
      buildCheck({
        id: "porch-alignment",
        title: hasPorchCue ? "Porch request matches plan cues" : "Porch request needs plan context",
        detail: hasPorchCue
          ? "The plan or annotations mention a porch, deck, stoop, or patio."
          : "The current style or brief wants a porch, but the plan does not clearly label one.",
        status: hasPorchCue ? "ready" : "review",
        actionLabel: hasPorchCue ? undefined : "Anchor porch",
        briefTarget: hasPorchCue ? undefined : "mustHave",
        briefText: hasPorchCue
          ? undefined
          : "Covered front porch should feel integrated with the entry and main roof massing."
      })
    );
  }

  checks.push(
    buildCheck({
      id: "window-density",
      title: windowCount >= expectedWindowCount ? "Window cues look usable" : "Window cues look light",
      detail:
        windowCount >= expectedWindowCount
          ? `${windowCount} window${windowCount === 1 ? "" : "s"} are saved for ${bedrooms} bedroom${bedrooms === 1 ? "" : "s"} and ${livingRooms} living area${livingRooms === 1 ? "" : "s"}.`
          : `${windowCount} window${windowCount === 1 ? "" : "s"} may be too few for the saved room layout.`,
      status: windowCount >= expectedWindowCount ? "ready" : "review",
      actionLabel: windowCount >= expectedWindowCount ? undefined : "Guide windows",
      briefTarget: windowCount >= expectedWindowCount ? undefined : "mustHave",
      briefText: windowCount >= expectedWindowCount
        ? undefined
        : "Window placement should align with bedrooms, living spaces, and facade proportions from the floor plan."
    })
  );

  if (briefMentionsGarage || hasGarageCue) {
    checks.push(
      buildCheck({
        id: "garage-alignment",
        title: hasGarageCue ? "Garage cue detected" : "Garage mentioned but not detected",
        detail: hasGarageCue
          ? "Garage language or a garage door is present in the saved plan."
          : "The brief mentions a garage, but the floor plan does not include a garage cue.",
        status: hasGarageCue ? "ready" : "missing",
        actionLabel: hasGarageCue ? undefined : "Constrain garage",
        briefTarget: hasGarageCue ? undefined : "avoid",
        briefText: hasGarageCue ? undefined : "Do not invent a garage unless it is visible in the saved plan."
      })
    );
  }

  checks.push(
    buildCheck({
      id: "view-angle-fit",
      title:
        args.settings.viewAngle === "rear-elevation" && !includesAny(planText, ["rear", "patio", "deck", "back"])
          ? "Rear view needs extra context"
          : args.settings.viewAngle === "aerial" && roomCount < 3
            ? "Aerial view has limited plan detail"
            : "Camera angle fits the plan",
      detail:
        args.settings.viewAngle === "rear-elevation" && !includesAny(planText, ["rear", "patio", "deck", "back"])
          ? "Rear elevation can work, but the plan does not identify rear-facing features."
          : args.settings.viewAngle === "aerial" && roomCount < 3
            ? "Aerial renders benefit from fuller room and roof cues before generation."
            : "The selected camera has enough plan cues for a grounded prompt.",
      status:
        (args.settings.viewAngle === "rear-elevation" && !includesAny(planText, ["rear", "patio", "deck", "back"])) ||
        (args.settings.viewAngle === "aerial" && roomCount < 3)
          ? "review"
          : "ready",
      actionLabel:
        args.settings.viewAngle === "rear-elevation" && !includesAny(planText, ["rear", "patio", "deck", "back"])
          ? "Clarify rear"
          : undefined,
      briefTarget:
        args.settings.viewAngle === "rear-elevation" && !includesAny(planText, ["rear", "patio", "deck", "back"])
          ? "revisionNotes"
          : undefined,
      briefText:
        args.settings.viewAngle === "rear-elevation" && !includesAny(planText, ["rear", "patio", "deck", "back"])
          ? "Keep rear elevation believable and avoid inventing rear features not implied by the floor plan."
          : undefined
    })
  );

  checks.push(
    buildCheck({
      id: "brief-specificity",
      title: briefHasDirection && briefHasMustHave ? "Brief is specific enough" : "Brief could be more specific",
      detail: briefHasDirection && briefHasMustHave
        ? "Design direction and must-have details are ready for generation."
        : "Add a little more design intent or must-have detail before spending render credits.",
      status: briefHasDirection && briefHasMustHave ? "ready" : "review",
      actionLabel: briefHasDirection && briefHasMustHave ? undefined : "Add baseline",
      briefTarget: briefHasDirection && briefHasMustHave ? undefined : "designNotes",
      briefText: briefHasDirection && briefHasMustHave
        ? undefined
        : "Create a realistic residential exterior that follows the saved floor plan, with clear massing and buildable details."
    })
  );

  const missingCount = checks.filter((check) => check.status === "missing").length;
  const reviewCount = checks.filter((check) => check.status === "review").length;
  const score = Math.max(0, Math.round(100 - missingCount * 24 - reviewCount * 12));

  return {
    score,
    summary:
      missingCount > 0
        ? `${missingCount} important plan gap${missingCount === 1 ? "" : "s"} should be resolved before generating.`
        : reviewCount > 0
          ? `${reviewCount} prompt improvement${reviewCount === 1 ? "" : "s"} available before generation.`
          : "Plan cues, brief, and camera settings are ready for generation.",
    checks
  };
}
