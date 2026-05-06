import { v } from "convex/values";

export const pointValidator = v.object({
  x: v.number(),
  y: v.number()
});

export const renderViewAngleValidator = v.union(
  v.literal("front-three-quarter"),
  v.literal("front-elevation"),
  v.literal("rear-elevation"),
  v.literal("aerial")
);

export const renderSettingsFields = {
  style: v.string(),
  sidingMaterial: v.string(),
  roofStyle: v.string(),
  colorPalette: v.string(),
  landscaping: v.string(),
  timeOfDay: v.string(),
  season: v.string(),
  viewAngle: renderViewAngleValidator
} as const;

export const renderSettingsValidator = v.object(renderSettingsFields);

export const legacyRenderSettingsValidator = v.object({
  ...renderSettingsFields,
  viewAngle: v.optional(renderViewAngleValidator)
});

export const renderBriefValidator = v.object({
  designNotes: v.string(),
  mustHave: v.string(),
  avoid: v.string(),
  revisionNotes: v.string()
});

export const floorPlanDataValidator = v.object({
  walls: v.array(
    v.object({
      id: v.string(),
      x1: v.number(),
      y1: v.number(),
      x2: v.number(),
      y2: v.number(),
      thickness: v.number()
    })
  ),
  rooms: v.array(
    v.object({
      id: v.string(),
      label: v.string(),
      polygon: v.array(pointValidator),
      areaSqFt: v.number()
    })
  ),
  doors: v.array(
    v.object({
      id: v.string(),
      wallId: v.string(),
      position: v.number(),
      width: v.number(),
      type: v.union(
        v.literal("standard"),
        v.literal("sliding"),
        v.literal("double"),
        v.literal("garage")
      ),
      rotation: v.number()
    })
  ),
  windows: v.array(
    v.object({
      id: v.string(),
      wallId: v.string(),
      position: v.number(),
      width: v.number(),
      height: v.number()
    })
  ),
  dimensions: v.array(
    v.object({
      id: v.string(),
      from: pointValidator,
      to: pointValidator,
      valueFt: v.number()
    })
  ),
  annotations: v.optional(
    v.array(
      v.object({
        id: v.string(),
        from: pointValidator,
        to: pointValidator,
        label: v.string()
      })
    )
  ),
  furniture: v.array(
    v.object({
      id: v.string(),
      type: v.string(),
      x: v.number(),
      y: v.number(),
      width: v.number(),
      depth: v.number(),
      rotation: v.number()
    })
  ),
  scale: v.number(),
  gridSize: v.number()
});

export const planEditConstraintIdValidator = v.union(
  v.literal("keep-bedroom-count"),
  v.literal("keep-bathroom-count"),
  v.literal("keep-kitchen"),
  v.literal("must-have-mudroom"),
  v.literal("improve-privacy"),
  v.literal("improve-render-readiness"),
  v.literal("max-sqft")
);

export const planEditConstraintResultValidator = v.object({
  id: planEditConstraintIdValidator,
  label: v.string(),
  status: v.union(v.literal("met"), v.literal("review"), v.literal("missed")),
  detail: v.string(),
  isHard: v.boolean()
});

export const planEditStatsValidator = v.object({
  roomCount: v.number(),
  wallCount: v.number(),
  doorCount: v.number(),
  windowCount: v.number(),
  totalAreaSqFt: v.number(),
  bedroomCount: v.number(),
  bathroomCount: v.number(),
  outdoorCount: v.number()
});

export const planEditDeltaValidator = v.object({
  before: planEditStatsValidator,
  after: planEditStatsValidator,
  roomDelta: v.number(),
  wallDelta: v.number(),
  doorDelta: v.number(),
  windowDelta: v.number(),
  areaDeltaSqFt: v.number(),
  bedroomDelta: v.number(),
  bathroomDelta: v.number(),
  outdoorDelta: v.number(),
  addedRooms: v.array(v.string()),
  removedRooms: v.array(v.string()),
  summary: v.array(v.string())
});

export const planEditScoresValidator = v.object({
  privacy: v.number(),
  flow: v.number(),
  programFit: v.number(),
  outdoorConnection: v.number(),
  renderReadiness: v.number(),
  overall: v.number()
});

export const planEditProposalValidator = v.object({
  id: v.string(),
  title: v.string(),
  focus: v.string(),
  summary: v.string(),
  data: floorPlanDataValidator,
  delta: planEditDeltaValidator,
  constraints: v.array(planEditConstraintResultValidator),
  constraintSummary: v.string(),
  hasHardConstraintMiss: v.boolean(),
  scores: planEditScoresValidator,
  changes: v.array(v.string()),
  checks: v.array(v.string()),
  confidence: v.number(),
  isRecommended: v.boolean(),
  recommendationReason: v.string()
});
