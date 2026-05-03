import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import { floorPlanDataValidator } from "./validators";
import { requireIdentityEmail, requireProjectEditor, requireProjectViewer } from "./members";

export const get = queryGeneric({
  args: {
    projectId: v.id("projects"),
    floor: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    await requireProjectViewer(ctx, args.projectId);
    const floor = args.floor ?? 1;
    return await ctx.db
      .query("floorPlans")
      .withIndex("by_projectId_floor", (query: any) =>
        query.eq("projectId", args.projectId).eq("floor", floor)
      )
      .unique();
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
