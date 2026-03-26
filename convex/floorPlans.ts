import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

const point = v.object({
  x: v.number(),
  y: v.number()
});

const floorPlanData = v.object({
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
      polygon: v.array(point),
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
      from: point,
      to: point,
      valueFt: v.number()
    })
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

export const get = queryGeneric({
  args: {
    projectId: v.id("projects"),
    floor: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const floor = args.floor ?? 1;
    return await ctx.db
      .query("floorPlans")
      .withIndex("by_projectId_floor", (query: any) =>
        query.eq("projectId", args.projectId).eq("floor", floor)
      )
      .first();
  }
});

export const save = mutationGeneric({
  args: {
    projectId: v.id("projects"),
    floor: v.number(),
    sourceImage: v.optional(v.id("_storage")),
    data: floorPlanData
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("floorPlans")
      .withIndex("by_projectId_floor", (query: any) =>
        query.eq("projectId", args.projectId).eq("floor", args.floor)
      )
      .first();

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        sourceImage: args.sourceImage ?? existing.sourceImage,
        data: args.data,
        version: existing.version + 1
      });
    } else {
      await ctx.db.insert("floorPlans", {
        projectId: args.projectId,
        floor: args.floor,
        sourceImage: args.sourceImage,
        data: args.data,
        version: 1
      });
    }

    await ctx.db.patch(args.projectId, {
      updatedAt: Date.now(),
      thumbnail: args.sourceImage ?? project.thumbnail
    });

    return { ok: true };
  }
});

export const uploadSource = mutationGeneric({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  }
});

