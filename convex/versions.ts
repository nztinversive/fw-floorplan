import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

import { floorPlanDataValidator } from "./validators";

export const saveVersion = mutationGeneric({
  args: {
    projectId: v.id("projects"),
    floor: v.number(),
    name: v.string(),
    data: floorPlanDataValidator
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const now = Date.now();
    const versionId = await ctx.db.insert("versions", {
      projectId: args.projectId,
      floor: args.floor,
      name: args.name.trim(),
      data: args.data,
      createdAt: now
    });

    await ctx.db.patch(args.projectId, {
      updatedAt: now
    });

    return versionId;
  }
});

export const listVersions = queryGeneric({
  args: {
    projectId: v.id("projects"),
    floor: v.number()
  },
  handler: async (ctx, args) => {
    const versions = await ctx.db
      .query("versions")
      .withIndex("by_projectId_floor", (query: any) =>
        query.eq("projectId", args.projectId).eq("floor", args.floor)
      )
      .order("desc")
      .take(100);

    return versions
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((version) => ({
        _id: version._id,
        projectId: version.projectId,
        floor: version.floor,
        name: version.name,
        createdAt: version.createdAt
      }));
  }
});

export const getVersion = queryGeneric({
  args: {
    versionId: v.id("versions")
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.versionId);
  }
});

export const deleteVersion = mutationGeneric({
  args: {
    versionId: v.id("versions")
  },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId);
    if (!version) {
      throw new Error("Version not found");
    }

    await ctx.db.delete(args.versionId);
    await ctx.db.patch(version.projectId, {
      updatedAt: Date.now()
    });

    return args.versionId;
  }
});
