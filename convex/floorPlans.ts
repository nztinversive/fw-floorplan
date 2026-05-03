import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import { floorPlanDataValidator } from "./validators";
import { requireIdentityEmail, requireProjectEditor, requireProjectViewer } from "./members";
import {
  hydrateFloorPlanData,
  saveFloorPlanChildData
} from "./floorPlanChildData";

export const get = queryGeneric({
  args: {
    projectId: v.id("projects"),
    floor: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    await requireProjectViewer(ctx, args.projectId);
    const floor = args.floor ?? 1;
    const floorPlan = await ctx.db
      .query("floorPlans")
      .withIndex("by_projectId_floor", (query: any) =>
        query.eq("projectId", args.projectId).eq("floor", floor)
      )
      .unique();
    return floorPlan ? await hydrateFloorPlanData(ctx, floorPlan) : null;
  }
});

export const getSourceImageUrl = queryGeneric({
  args: {
    sourceImageId: v.optional(v.id("_storage"))
  },
  handler: async (ctx, args) => {
    await requireIdentityEmail(ctx);
    if (!args.sourceImageId) {
      return null;
    }

    return await ctx.storage.getUrl(args.sourceImageId);
  }
});

export const save = mutationGeneric({
  args: {
    projectId: v.id("projects"),
    floor: v.number(),
    sourceImage: v.optional(v.id("_storage")),
    data: floorPlanDataValidator
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    await requireProjectEditor(ctx, args.projectId);

    const existing = await ctx.db
      .query("floorPlans")
      .withIndex("by_projectId_floor", (query: any) =>
        query.eq("projectId", args.projectId).eq("floor", args.floor)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        sourceImage: args.sourceImage ?? existing.sourceImage,
        scale: args.data.scale,
        gridSize: args.data.gridSize,
        childDataUpdatedAt: Date.now(),
        version: existing.version + 1
      });
      await saveFloorPlanChildData(ctx, existing._id, args.data);
    } else {
      const floorPlanId = await ctx.db.insert("floorPlans", {
        projectId: args.projectId,
        floor: args.floor,
        sourceImage: args.sourceImage,
        scale: args.data.scale,
        gridSize: args.data.gridSize,
        childDataUpdatedAt: Date.now(),
        version: 1
      });
      await saveFloorPlanChildData(ctx, floorPlanId, args.data);
    }

    await ctx.db.patch(args.projectId, {
      updatedAt: Date.now(),
      thumbnail:
        args.floor === 1
          ? args.sourceImage ?? project.thumbnail
          : project.thumbnail ?? args.sourceImage
    });

    return { ok: true };
  }
});

export const uploadSource = mutationGeneric({
  args: {},
  handler: async (ctx) => {
    await requireIdentityEmail(ctx);
    return await ctx.storage.generateUploadUrl();
  }
});
