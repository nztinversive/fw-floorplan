import OpenAI from "openai";
import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, mutation, query } from "./_generated/server";
import {
  RENDER_VIEW_ANGLE_PROMPTS,
  type RenderViewAngle
} from "../lib/render-angles";
import { STYLE_PRESET_MAP, type StylePresetId } from "../lib/style-presets";
import { requireProjectEditor, requireProjectViewer } from "./members";
import { renderBriefValidator, renderSettingsValidator, renderViewAngleValidator } from "./validators";
import type { HydratedFloorPlanDoc } from "./floorPlanChildData";

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

function normalizeStyleId(style: string): StylePresetId {
  const normalized = style.trim().toLowerCase();

  for (const preset of Object.values(STYLE_PRESET_MAP)) {
    if (preset.id === normalized || preset.name.toLowerCase() === normalized) {
      return preset.id;
    }
  }

  throw new Error(`Unsupported render style: ${style}`);
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
    imageUrl: v.id("_storage")
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    await requireProjectEditor(ctx, args.projectId);

    const now = Date.now();
    const renderId = await ctx.db.insert("renders", {
      projectId: args.projectId,
      style: args.style,
      settings: args.settings,
      imageUrl: args.imageUrl,
      prompt: args.prompt,
      isFavorite: false,
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
    renderBrief: v.optional(renderBriefValidator)
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

    const styleId = normalizeStyleId(args.style);
    const settings = {
      ...args.settings,
      style: styleId,
      viewAngle: args.viewAngle
    };
    const architecturalDescription = describeFloorPlans(project.floorPlans);
    const prompt = composePrompt({
      architecturalDescription,
      projectName: project.name,
      address: project.address,
      styleId,
      renderBrief: args.renderBrief ?? project.renderBrief,
      settings
    });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const client = new OpenAI({ apiKey });
    const response = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1536x1024",
      quality: "high"
    });

    const imageBlob = await resolveGeneratedImageBlob(response);
    const storageId = await ctx.storage.store(imageBlob);
    const renderId: Id<"renders"> = await ctx.runMutation(internal.renders.storeGeneratedRender, {
      projectId: args.projectId,
      style: styleId,
      settings,
      prompt,
      imageUrl: storageId
    });

    return renderId;
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
      renders.map(async (render) => ({
        _id: render._id,
        projectId: render.projectId,
        style: render.style,
        settings: render.settings,
        imageStorageId: render.imageUrl,
        imageUrl: await ctx.storage.getUrl(render.imageUrl),
        prompt: render.prompt,
        isFavorite: render.isFavorite,
        createdAt: render.createdAt
      }))
    );
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
