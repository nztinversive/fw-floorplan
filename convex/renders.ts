import OpenAI from "openai";
import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import {
  DEFAULT_RENDER_VIEW_ANGLE,
  RENDER_VIEW_ANGLE_PROMPTS,
  type RenderViewAngle
} from "../lib/render-angles";
import { STYLE_PRESET_MAP, type StylePresetId } from "../lib/style-presets";
import { requireProjectEditor, requireProjectViewer } from "./members";
import { renderBriefValidator, renderSettingsValidator, renderViewAngleValidator } from "./validators";
import { hydrateFloorPlansData, type HydratedFloorPlanDoc } from "./floorPlanChildData";

type ProjectWithFloorPlans = Doc<"projects"> & {
  floorPlans: HydratedFloorPlanDoc[];
};

type RenderBrief = {
  designNotes: string;
  mustHave: string;
  avoid: string;
  revisionNotes: string;
};

type PlanBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type RenderCritiqueRecommendation = "use" | "tweak" | "regenerate";
type RenderCritiqueIssue = {
  category: string;
  severity: "strength" | "minor" | "major";
  detail: string;
};
type RenderCritique = {
  score: number;
  confidence: number;
  recommendation: RenderCritiqueRecommendation;
  summary: string;
  issues: RenderCritiqueIssue[];
  suggestedFixes: string;
};

const renderCritiqueIssueValidator = v.object({
  category: v.string(),
  severity: v.union(v.literal("strength"), v.literal("minor"), v.literal("major")),
  detail: v.string()
});

const renderCritiqueSchema = {
  type: "object",
  additionalProperties: false,
  required: ["score", "confidence", "recommendation", "summary", "issues", "suggestedFixes"],
  properties: {
    score: {
      type: "number",
      minimum: 0,
      maximum: 100,
      description: "Overall render usefulness for client-ready exterior design review."
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Confidence that the critique is grounded in the visible render."
    },
    recommendation: {
      type: "string",
      enum: ["use", "tweak", "regenerate"],
      description: "Whether this render should be used, lightly revised, or regenerated."
    },
    summary: {
      type: "string",
      description: "A concise client-facing assessment of the render quality."
    },
    issues: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "severity", "detail"],
        properties: {
          category: {
            type: "string",
            description: "Short category such as massing, windows, materials, roof, landscaping, or fidelity."
          },
          severity: {
            type: "string",
            enum: ["strength", "minor", "major"]
          },
          detail: {
            type: "string",
            description: "One specific observation grounded in the image and design brief."
          }
        }
      }
    },
    suggestedFixes: {
      type: "string",
      description: "One concise regeneration instruction that can be pasted into revision notes."
    }
  }
} as const;

function normalizeStyleId(style: string): StylePresetId {
  const normalized = style.trim().toLowerCase();

  for (const preset of Object.values(STYLE_PRESET_MAP)) {
    if (preset.id === normalized || preset.name.toLowerCase() === normalized) {
      return preset.id;
    }
  }

  throw new Error(`Unsupported render style: ${style}`);
}

function getStyleLabelForPrompt(style: string) {
  return STYLE_PRESET_MAP[style as StylePresetId]?.name ?? style;
}

function summarizeCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function roundToNearestFive(value: number) {
  return Math.max(5, Math.round(value / 5) * 5);
}

function getPlanBounds(floorPlan: HydratedFloorPlanDoc): PlanBounds | null {
  const points = [
    ...floorPlan.data.walls.flatMap((wall) => [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 }
    ]),
    ...floorPlan.data.rooms.flatMap((room) => room.polygon)
  ];

  if (points.length === 0) {
    return null;
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y))
  };
}

function inferSqFtFromGeometry(floorPlans: HydratedFloorPlanDoc[]) {
  return floorPlans.reduce((total, floorPlan) => {
    const bounds = getPlanBounds(floorPlan);
    if (!bounds) {
      return total;
    }

    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxY - bounds.minY;
    const scale = floorPlan.data.scale;

    if (!Number.isFinite(scale) || scale <= 0) {
      return total;
    }

    const widthFeet = width / scale;
    const depthFeet = depth / scale;

    if (widthFeet < 10 || widthFeet > 200 || depthFeet < 10 || depthFeet > 200) {
      return total;
    }

    return total + widthFeet * depthFeet * 0.76;
  }, 0);
}

function getTotalSqFt(floorPlans: HydratedFloorPlanDoc[]) {
  const roomAreaTotal = floorPlans.reduce(
    (total, floorPlan) =>
      total +
      floorPlan.data.rooms.reduce((roomTotal, room) => roomTotal + Math.max(room.areaSqFt, 0), 0),
    0
  );

  if (roomAreaTotal >= 300) {
    return roundToNearestFive(roomAreaTotal);
  }

  const inferredArea = inferSqFtFromGeometry(floorPlans);
  if (inferredArea >= 300) {
    return roundToNearestFive(inferredArea);
  }

  return null;
}

function countRoomsByLabel(floorPlans: HydratedFloorPlanDoc[], matcher: (label: string) => boolean) {
  return floorPlans.reduce(
    (count, floorPlan) =>
      count + floorPlan.data.rooms.filter((room) => matcher(room.label.toLowerCase())).length,
    0
  );
}

function summarizeLayout(floorPlans: HydratedFloorPlanDoc[]) {
  const allLabels = floorPlans.flatMap((floorPlan) =>
    floorPlan.data.rooms.map((room) => room.label.toLowerCase())
  );
  const hasLiving = allLabels.some((label) => label.includes("living") || label.includes("family"));
  const hasKitchen = allLabels.some((label) => label.includes("kitchen"));
  const hasDining = allLabels.some((label) => label.includes("dining"));
  const hasEntry = allLabels.some((label) => label.includes("entry") || label.includes("foyer"));
  const hasHall = allLabels.some((label) => label.includes("hall"));
  const hasPrimarySuite = allLabels.some(
    (label) => label.includes("master bedroom") || label.includes("primary bedroom") || label.includes("suite")
  );

  if (floorPlans.length > 1) {
    const lowerFloor = floorPlans[0].data.rooms.map((room) => room.label.toLowerCase());
    const upperFloor = floorPlans.slice(1).flatMap((floorPlan) =>
      floorPlan.data.rooms.map((room) => room.label.toLowerCase())
    );

    const lowerMentions = [];
    if (lowerFloor.some((label) => label.includes("living") || label.includes("family"))) {
      lowerMentions.push("shared living areas");
    }
    if (lowerFloor.some((label) => label.includes("kitchen"))) {
      lowerMentions.push("the kitchen core");
    }
    if (lowerFloor.some((label) => label.includes("dining"))) {
      lowerMentions.push("dining spaces");
    }

    const upperHasBedrooms = upperFloor.some((label) => label.includes("bedroom"));
    const upperHasBaths = upperFloor.some((label) => label.includes("bath"));

    return `The first floor organizes ${lowerMentions.join(", ") || "the main public rooms"} around the home's primary circulation, while the upper level contains${upperHasBedrooms ? " additional bedrooms" : " secondary spaces"}${upperHasBaths ? " and bathrooms" : ""}.`;
  }

  if (hasLiving && hasKitchen && hasDining) {
    return `The layout flows${hasEntry ? " from a defined entry" : ""} into an open-concept living, kitchen, and dining core${hasHall ? ", with private rooms branching off adjoining hallways" : ""}.`;
  }

  if (hasLiving && hasKitchen) {
    return `The plan centers the home around connected living and kitchen spaces${hasHall ? ", with circulation leading to the private rooms" : ""}.`;
  }

  if (hasPrimarySuite) {
    return `The plan balances shared living spaces with a defined primary suite and supporting secondary rooms.`;
  }

  return `The home uses a clear residential layout with shared living spaces at its core and private rooms arranged around them.`;
}

function summarizeFeatures(floorPlans: HydratedFloorPlanDoc[]) {
  const labels = floorPlans.flatMap((floorPlan) =>
    floorPlan.data.rooms.map((room) => room.label.toLowerCase())
  );
  const features = new Set<string>();

  if (labels.some((label) => label.includes("garage"))) {
    features.add("an attached garage");
  }
  if (labels.some((label) => label.includes("porch"))) {
    features.add("a covered porch");
  }
  if (labels.some((label) => label.includes("laundry"))) {
    features.add("a dedicated laundry room");
  }
  if (labels.some((label) => label.includes("office"))) {
    features.add("a home office");
  }
  if (labels.some((label) => label.includes("pantry"))) {
    features.add("a pantry");
  }
  if (labels.some((label) => label.includes("mudroom"))) {
    features.add("a mudroom");
  }
  if (
    floorPlans.some((floorPlan) => floorPlan.data.doors.some((door) => door.type === "garage"))
  ) {
    features.add("garage access integrated into the main volume");
  }

  const selected = Array.from(features).slice(0, 4);
  if (selected.length === 0) {
    return null;
  }

  return `Key features include ${selected.join(", ")}.`;
}

function estimateFootprint(floorPlans: HydratedFloorPlanDoc[], totalSqFt: number | null) {
  const primaryFloor = floorPlans[0];
  if (!primaryFloor) {
    return null;
  }

  const bounds = getPlanBounds(primaryFloor);
  if (!bounds) {
    return null;
  }

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxY - bounds.minY;
  if (width <= 0 || depth <= 0) {
    return null;
  }

  const scale = primaryFloor.data.scale;
  let widthFeet = scale > 0 ? width / scale : 0;
  let depthFeet = scale > 0 ? depth / scale : 0;

  if (
    !Number.isFinite(widthFeet) ||
    !Number.isFinite(depthFeet) ||
    widthFeet < 10 ||
    widthFeet > 200 ||
    depthFeet < 10 ||
    depthFeet > 200
  ) {
    if (!totalSqFt) {
      return null;
    }

    const footprintArea = totalSqFt / Math.max(floorPlans.length, 1);
    const ratio = width / depth;
    widthFeet = Math.sqrt(footprintArea * ratio);
    depthFeet = footprintArea / widthFeet;
  }

  return `The footprint is approximately ${Math.round(widthFeet)} feet wide by ${Math.round(depthFeet)} feet deep.`;
}

function describeFloorPlans(floorPlans: HydratedFloorPlanDoc[]) {
  const orderedFloorPlans = [...floorPlans].sort((left, right) => left.floor - right.floor);
  const totalSqFt = getTotalSqFt(orderedFloorPlans);
  const bedrooms = countRoomsByLabel(
    orderedFloorPlans,
    (label) => label.includes("bedroom") || label.includes("bunk")
  );
  const bathrooms = countRoomsByLabel(
    orderedFloorPlans,
    (label) => label.includes("bath") || label.includes("powder")
  );

  const sizeText = totalSqFt ? `${totalSqFt.toLocaleString()} sq ft` : "residential-scale";
  const floorsText =
    orderedFloorPlans.length === 1
      ? "single-story"
      : orderedFloorPlans.length === 2
        ? "two-story"
        : `${orderedFloorPlans.length}-story`;

  const roomCounts =
    bedrooms > 0 && bathrooms > 0
      ? `${summarizeCount(bedrooms, "bedroom", "bedrooms")} and ${summarizeCount(bathrooms, "bathroom", "bathrooms")}`
      : bedrooms > 0
        ? `${summarizeCount(bedrooms, "bedroom", "bedrooms")} with supporting bathrooms and service spaces`
        : "a mix of shared living spaces and private support rooms";

  const description = [
    `A ${sizeText} ${floorsText} home with ${roomCounts}.`,
    summarizeLayout(orderedFloorPlans),
    summarizeFeatures(orderedFloorPlans),
    estimateFootprint(orderedFloorPlans, totalSqFt)
  ]
    .filter(Boolean)
    .join(" ");

  return description;
}

function composePrompt(args: {
  architecturalDescription: string;
  projectName: string;
  address?: string;
  styleId: StylePresetId;
  renderBrief?: RenderBrief;
  settings: {
    sidingMaterial: string;
    roofStyle: string;
    colorPalette: string;
    landscaping: string;
    timeOfDay: string;
    season: string;
    viewAngle: RenderViewAngle;
  };
}) {
  const preset = STYLE_PRESET_MAP[args.styleId];
  const projectReference = args.address
    ? `${args.projectName} located at ${args.address}`
    : args.projectName;

  return [
    `Create a photorealistic exterior architectural render for ${projectReference}.`,
    args.architecturalDescription,
    `Style direction: ${preset.promptFragment}.`,
    `Material and form direction: ${args.settings.sidingMaterial} siding, ${args.settings.roofStyle} roof form, ${args.settings.colorPalette} color palette, ${args.settings.landscaping} landscaping.`,
    args.renderBrief?.designNotes
      ? `Designer brief: ${args.renderBrief.designNotes}.`
      : null,
    args.renderBrief?.mustHave
      ? `Must include: ${args.renderBrief.mustHave}.`
      : null,
    args.renderBrief?.avoid
      ? `Avoid or downplay: ${args.renderBrief.avoid}.`
      : null,
    args.renderBrief?.revisionNotes
      ? `Revision notes for this generation: ${args.renderBrief.revisionNotes}.`
      : null,
    `Lighting and environment: ${args.settings.timeOfDay} light in ${args.settings.season}.`,
    RENDER_VIEW_ANGLE_PROMPTS[args.settings.viewAngle],
    "Keep the image grounded in realistic residential architecture with natural materials, clean detailing, and high-end presentation quality.",
    "Do not include text, watermarks, floor plan overlays, exploded views, interior cutaways, cartoon styling, or exaggerated fantasy elements."
  ].filter(Boolean).join(" ");
}

async function getProjectWithFloorPlans(ctx: QueryCtx, projectId: Id<"projects">) {
  const project = await ctx.db.get(projectId);
  if (!project) {
    return null;
  }

  const floorPlans = await ctx.db
    .query("floorPlans")
    .withIndex("by_projectId", (query) => query.eq("projectId", projectId))
    .collect();
  const hydratedFloorPlans = await hydrateFloorPlansData(ctx, floorPlans);

  return {
    ...project,
    floorPlans: hydratedFloorPlans.sort((left, right) => left.floor - right.floor)
  };
}

function buildRenderPrompt(args: {
  project: ProjectWithFloorPlans;
  style: string;
  settings: {
    style: string;
    sidingMaterial: string;
    roofStyle: string;
    colorPalette: string;
    landscaping: string;
    timeOfDay: string;
    season: string;
    viewAngle: RenderViewAngle;
  };
  viewAngle: RenderViewAngle;
  renderBrief?: RenderBrief;
}) {
  const styleId = normalizeStyleId(args.style);
  const settings = {
    ...args.settings,
    style: styleId,
    viewAngle: args.viewAngle
  };
  const architecturalDescription = describeFloorPlans(args.project.floorPlans);
  const prompt = composePrompt({
    architecturalDescription,
    projectName: args.project.name,
    address: args.project.address,
    styleId,
    renderBrief: args.renderBrief ?? args.project.renderBrief,
    settings
  });

  return {
    architecturalDescription,
    prompt,
    settings,
    styleId
  };
}

function extractTextOutput(response: unknown): string {
  const candidate = response as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (candidate.output_text) {
    return candidate.output_text;
  }

  const messages = candidate.output ?? [];
  for (const message of messages) {
    for (const item of message.content ?? []) {
      if (item.type === "output_text" && item.text) {
        return item.text;
      }
    }
  }

  throw new Error("OpenAI response did not include text output");
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizeCritique(parsed: Partial<RenderCritique>): RenderCritique {
  const recommendation =
    parsed.recommendation === "use" ||
    parsed.recommendation === "tweak" ||
    parsed.recommendation === "regenerate"
      ? parsed.recommendation
      : "tweak";

  const issues = Array.isArray(parsed.issues)
    ? parsed.issues
        .map((issue) => ({
          category: String(issue.category ?? "quality").trim().slice(0, 40) || "quality",
          severity:
            issue.severity === "strength" ||
            issue.severity === "minor" ||
            issue.severity === "major"
              ? issue.severity
              : "minor",
          detail: String(issue.detail ?? "").trim().slice(0, 260)
        }))
        .filter((issue) => issue.detail.length > 0)
        .slice(0, 6)
    : [];

  return {
    score: Math.round(clamp(Number(parsed.score), 0, 100)),
    confidence: Math.round(clamp(Number(parsed.confidence), 0, 1) * 100) / 100,
    recommendation,
    summary: String(parsed.summary ?? "AI critique completed.").trim().slice(0, 360),
    issues,
    suggestedFixes: String(parsed.suggestedFixes ?? "")
      .trim()
      .slice(0, 700)
  };
}

function buildCritiquePrompt(args: {
  project: ProjectWithFloorPlans;
  render: Doc<"renders">;
  imageUrl: string;
}) {
  const architecturalDescription = describeFloorPlans(args.project.floorPlans);
  const styleLabel = getStyleLabelForPrompt(args.render.style);
  const viewAngle = args.render.settings.viewAngle ?? DEFAULT_RENDER_VIEW_ANGLE;

  return [
    "You are an architectural design director reviewing AI-generated exterior home renders for a modular home design workflow.",
    "Evaluate the visible render against the saved render prompt and floor-plan summary. Be practical: focus on design quality, floor-plan fidelity, buildability cues, client-readiness, material coherence, window/door logic, roof realism, and whether another generation would likely improve the output.",
    "Do not mention that you cannot perfectly verify dimensions from a single render. Ground every issue in what is visible or in a clear mismatch with the brief.",
    "",
    `Project: ${args.project.name}`,
    args.project.address ? `Address/context: ${args.project.address}` : null,
    `Floor-plan summary: ${architecturalDescription}`,
    `Saved render style: ${styleLabel}`,
    `Saved camera angle: ${RENDER_VIEW_ANGLE_PROMPTS[viewAngle]}`,
    `Saved generation prompt: ${args.render.prompt}`,
    "",
    "Return only the structured critique schema. Keep suggestedFixes as one regeneration-ready instruction sentence or short paragraph."
  ]
    .filter(Boolean)
    .join("\n");
}

export const previewPrompt = query({
  args: {
    projectId: v.id("projects"),
    style: v.string(),
    settings: renderSettingsValidator,
    viewAngle: renderViewAngleValidator,
    renderBrief: v.optional(renderBriefValidator)
  },
  handler: async (ctx, args) => {
    await requireProjectEditor(ctx, args.projectId);

    const project = await getProjectWithFloorPlans(ctx, args.projectId);
    if (!project || project.floorPlans.length === 0) {
      return null;
    }

    const preview = buildRenderPrompt({
      project,
      style: args.style,
      settings: args.settings,
      viewAngle: args.viewAngle,
      renderBrief: args.renderBrief
    });

    return {
      architecturalDescription: preview.architecturalDescription,
      prompt: preview.prompt
    };
  }
});

async function resolveGeneratedImageBlob(response: {
  data?: Array<{
    url?: string | null;
    b64_json?: string | null;
  }>;
}) {
  const image = response.data?.[0];
  if (!image) {
    throw new Error("OpenAI did not return an image");
  }

  if (image.url) {
    const downloadResponse = await fetch(image.url);
    if (!downloadResponse.ok) {
      throw new Error("Unable to download generated image");
    }

    return await downloadResponse.blob();
  }

  if (image.b64_json) {
    const binary = atob(image.b64_json);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: "image/png" });
  }

  throw new Error("Generated image response did not include a URL or base64 payload");
}

export const storeGeneratedRender = internalMutation({
  args: {
    projectId: v.id("projects"),
    style: v.string(),
    settings: renderSettingsValidator,
    prompt: v.string(),
    imageUrl: v.id("_storage"),
    parentRenderId: v.optional(v.id("renders")),
    sourceReviewId: v.optional(v.id("renderReviews")),
    sourceCritiqueId: v.optional(v.id("renderCritiques"))
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    await requireProjectEditor(ctx, args.projectId);

    if (args.parentRenderId) {
      const parentRender = await ctx.db.get(args.parentRenderId);
      if (!parentRender || parentRender.projectId !== args.projectId) {
        throw new Error("Parent render not found");
      }
    }

    if (args.sourceReviewId) {
      if (!args.parentRenderId) {
        throw new Error("Source review requires a parent render");
      }
      if (args.sourceCritiqueId) {
        throw new Error("Use either a source review or a source critique, not both");
      }

      const sourceReview = await ctx.db.get(args.sourceReviewId);
      if (
        !sourceReview ||
        sourceReview.projectId !== args.projectId ||
        sourceReview.renderId !== args.parentRenderId
      ) {
        throw new Error("Source review not found");
      }
    }

    if (args.sourceCritiqueId) {
      if (!args.parentRenderId) {
        throw new Error("Source critique requires a parent render");
      }

      const sourceCritique = await ctx.db.get(args.sourceCritiqueId);
      if (
        !sourceCritique ||
        sourceCritique.projectId !== args.projectId ||
        sourceCritique.renderId !== args.parentRenderId
      ) {
        throw new Error("Source critique not found");
      }
    }

    const now = Date.now();
    const renderId = await ctx.db.insert("renders", {
      projectId: args.projectId,
      style: args.style,
      settings: args.settings,
      imageUrl: args.imageUrl,
      prompt: args.prompt,
      isFavorite: false,
      parentRenderId: args.parentRenderId,
      sourceReviewId: args.sourceReviewId,
      sourceCritiqueId: args.sourceCritiqueId,
      createdAt: now
    });

    await ctx.db.patch(args.projectId, {
      updatedAt: now
    });

    return renderId;
  }
});

export const generateRender = action({
  args: {
    projectId: v.id("projects"),
    style: v.string(),
    settings: renderSettingsValidator,
    viewAngle: renderViewAngleValidator,
    renderBrief: v.optional(renderBriefValidator),
    parentRenderId: v.optional(v.id("renders")),
    sourceReviewId: v.optional(v.id("renderReviews")),
    sourceCritiqueId: v.optional(v.id("renderCritiques"))
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.members.requireCurrentUserProjectEditor, {
      projectId: args.projectId
    });

    const project = (await ctx.runQuery(api.projects.get, {
      id: args.projectId
    })) as ProjectWithFloorPlans | null;

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.floorPlans.length === 0) {
      throw new Error("A saved floor plan is required before generating a render");
    }

    const promptDetails = buildRenderPrompt({
      project,
      style: args.style,
      settings: args.settings,
      viewAngle: args.viewAngle,
      renderBrief: args.renderBrief
    });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const imageModel = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
    const client = new OpenAI({ apiKey });
    const response = await client.images.generate({
      model: imageModel,
      prompt: promptDetails.prompt,
      size: "1536x1024",
      quality: "high"
    });

    const imageBlob = await resolveGeneratedImageBlob(response);
    const storageId = await ctx.storage.store(imageBlob);
    const renderId: Id<"renders"> = await ctx.runMutation(internal.renders.storeGeneratedRender, {
      projectId: args.projectId,
      style: promptDetails.styleId,
      settings: promptDetails.settings,
      prompt: promptDetails.prompt,
      imageUrl: storageId,
      parentRenderId: args.parentRenderId,
      sourceReviewId: args.sourceReviewId,
      sourceCritiqueId: args.sourceCritiqueId
    });

    return renderId;
  }
});

export const getRenderCritiqueInput = internalQuery({
  args: {
    renderId: v.id("renders")
  },
  handler: async (ctx, args) => {
    const render = await ctx.db.get(args.renderId);
    if (!render) {
      throw new Error("Render not found");
    }

    await requireProjectEditor(ctx, render.projectId);

    const project = await getProjectWithFloorPlans(ctx, render.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const imageUrl = await ctx.storage.getUrl(render.imageUrl);
    if (!imageUrl) {
      throw new Error("Render image is unavailable");
    }

    return {
      project,
      render,
      imageUrl
    };
  }
});

export const storeRenderCritique = internalMutation({
  args: {
    renderId: v.id("renders"),
    model: v.string(),
    score: v.number(),
    confidence: v.number(),
    recommendation: v.union(v.literal("use"), v.literal("tweak"), v.literal("regenerate")),
    summary: v.string(),
    issues: v.array(renderCritiqueIssueValidator),
    suggestedFixes: v.string(),
    authorEmail: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const render = await ctx.db.get(args.renderId);
    if (!render) {
      throw new Error("Render not found");
    }

    await requireProjectEditor(ctx, render.projectId);

    const now = Date.now();
    const critiqueId = await ctx.db.insert("renderCritiques", {
      projectId: render.projectId,
      renderId: args.renderId,
      model: args.model,
      score: args.score,
      confidence: args.confidence,
      recommendation: args.recommendation,
      summary: args.summary,
      issues: args.issues,
      suggestedFixes: args.suggestedFixes,
      authorEmail: args.authorEmail,
      createdAt: now
    });

    await ctx.db.patch(render.projectId, {
      updatedAt: now
    });

    return critiqueId;
  }
});

export const critiqueRender = action({
  args: {
    renderId: v.id("renders")
  },
  handler: async (ctx, args) => {
    const input: {
      project: ProjectWithFloorPlans;
      render: Doc<"renders">;
      imageUrl: string;
    } = await ctx.runQuery(internal.renders.getRenderCritiqueInput, {
      renderId: args.renderId
    });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const model = process.env.OPENAI_RENDER_CRITIQUE_MODEL ?? "gpt-5.4-mini";
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You critique residential exterior renders for high-quality home design output. Return precise structured JSON only."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildCritiquePrompt(input)
            },
            {
              type: "input_image",
              image_url: input.imageUrl,
              detail: "high"
            }
          ]
        }
      ],
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "render_critique",
          schema: renderCritiqueSchema,
          description: "Structured critique of a generated exterior render.",
          strict: true
        }
      }
    });

    const critique = normalizeCritique(JSON.parse(extractTextOutput(response)) as Partial<RenderCritique>);
    const identity = await ctx.auth.getUserIdentity();
    const critiqueId: Id<"renderCritiques"> = await ctx.runMutation(
      internal.renders.storeRenderCritique,
      {
        renderId: args.renderId,
        model,
        ...critique,
        authorEmail: identity?.email
      }
    );

    return {
      _id: critiqueId,
      projectId: input.render.projectId,
      renderId: args.renderId,
      model,
      ...critique,
      authorEmail: identity?.email,
      createdAt: Date.now()
    };
  }
});

export const list = query({
  args: {
    projectId: v.id("projects")
  },
  handler: async (ctx, args) => {
    await requireProjectViewer(ctx, args.projectId);
    const renders = await ctx.db
      .query("renders")
      .withIndex("by_projectId_and_createdAt", (query) => query.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    return await Promise.all(
      renders.map(async (render) => {
        const reviewHistory = await ctx.db
          .query("renderReviews")
          .withIndex("by_renderId_and_createdAt", (query) => query.eq("renderId", render._id))
          .order("desc")
          .take(5);
        const critiqueHistory = await ctx.db
          .query("renderCritiques")
          .withIndex("by_renderId_and_createdAt", (query) => query.eq("renderId", render._id))
          .order("desc")
          .take(3);
        const sourceReview = render.sourceReviewId ? await ctx.db.get(render.sourceReviewId) : null;
        const sourceCritique = render.sourceCritiqueId ? await ctx.db.get(render.sourceCritiqueId) : null;

        return {
          _id: render._id,
          projectId: render.projectId,
          style: render.style,
          settings: render.settings,
          imageStorageId: render.imageUrl,
          imageUrl: await ctx.storage.getUrl(render.imageUrl),
          prompt: render.prompt,
          isFavorite: render.isFavorite,
          createdAt: render.createdAt,
          parentRenderId: render.parentRenderId,
          sourceReviewId: render.sourceReviewId,
          sourceCritiqueId: render.sourceCritiqueId,
          sourceReview,
          sourceCritique,
          reviewHistory,
          latestCritique: critiqueHistory[0] ?? null,
          critiqueHistory
        };
      })
    );
  }
});

export const saveReview = mutation({
  args: {
    renderId: v.id("renders"),
    issueKeys: v.array(v.string()),
    notes: v.string()
  },
  handler: async (ctx, args) => {
    const render = await ctx.db.get(args.renderId);
    if (!render) {
      throw new Error("Render not found");
    }
    await requireProjectEditor(ctx, render.projectId);

    const issueKeys = Array.from(
      new Set(args.issueKeys.map((issueKey) => issueKey.trim()).filter(Boolean))
    ).slice(0, 8);
    const notes = args.notes.trim();

    if (issueKeys.length === 0 && notes.length === 0) {
      throw new Error("Choose at least one review issue or add a note");
    }

    const identity = await ctx.auth.getUserIdentity();
    const now = Date.now();
    const reviewId = await ctx.db.insert("renderReviews", {
      projectId: render.projectId,
      renderId: args.renderId,
      issueKeys,
      notes,
      authorEmail: identity?.email,
      createdAt: now
    });

    await ctx.db.patch(render.projectId, {
      updatedAt: now
    });

    return reviewId;
  }
});

export const toggleFavorite = mutation({
  args: {
    renderId: v.id("renders")
  },
  handler: async (ctx, args) => {
    const render = await ctx.db.get(args.renderId);
    if (!render) {
      throw new Error("Render not found");
    }
    await requireProjectEditor(ctx, render.projectId);

    const nextValue = !render.isFavorite;
    await ctx.db.patch(args.renderId, {
      isFavorite: nextValue
    });

    return nextValue;
  }
});

export const remove = mutation({
  args: {
    renderId: v.id("renders")
  },
  handler: async (ctx, args) => {
    const render = await ctx.db.get(args.renderId);
    if (!render) {
      throw new Error("Render not found");
    }
    await requireProjectEditor(ctx, render.projectId);

    const reviews = await ctx.db
      .query("renderReviews")
      .withIndex("by_renderId_and_createdAt", (query) => query.eq("renderId", args.renderId))
      .take(100);

    for (const review of reviews) {
      await ctx.db.delete(review._id);
    }

    const critiques = await ctx.db
      .query("renderCritiques")
      .withIndex("by_renderId_and_createdAt", (query) => query.eq("renderId", args.renderId))
      .take(100);

    for (const critique of critiques) {
      await ctx.db.delete(critique._id);
    }

    await ctx.storage.delete(render.imageUrl);
    await ctx.db.delete(args.renderId);

    const project = await ctx.db.get(render.projectId);
    if (project) {
      await ctx.db.patch(project._id, {
        updatedAt: Date.now()
      });
    }

    return args.renderId;
  }
});
