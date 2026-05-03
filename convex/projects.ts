import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { floorPlanDataValidator } from "./validators";
import {
  ensureProjectOwnerMember,
  listProjectMembershipsForCurrentUser,
  requireIdentityEmail,
  requireProjectOwner,
  requireProjectViewer
} from "./members";

function hasArg<T extends object, K extends PropertyKey>(
  args: T,
  key: K
): args is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(args, key);
}

export const list = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const memberships = await listProjectMembershipsForCurrentUser(ctx);
    const projects = (
      await Promise.all(memberships.map((member) => ctx.db.get(member.projectId)))
    ).filter((project) => project !== null);

    return await Promise.all(
      projects
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(async (project) => {
          const floorPlans = await ctx.db
            .query("floorPlans")
            .withIndex("by_projectId", (query) => query.eq("projectId", project._id))
            .collect();

          return {
            ...project,
            thumbnailUrl: project.thumbnail ? await ctx.storage.getUrl(project.thumbnail) : null,
            floorCount: floorPlans.length
          };
        })
    );
  }
});

export const get = queryGeneric({
  args: {
    id: v.id("projects")
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) {
      return null;
    }
    await requireProjectViewer(ctx, args.id);

    const floorPlans = await ctx.db
      .query("floorPlans")
      .withIndex("by_projectId", (query) => query.eq("projectId", args.id))
      .collect();

    const floorPlansWithSourceImageUrls = await Promise.all(
      floorPlans.map(async (floorPlan) => ({
        ...floorPlan,
        sourceImageUrl: floorPlan.sourceImage ? await ctx.storage.getUrl(floorPlan.sourceImage) : null
      }))
    );

    return {
      ...project,
      thumbnailUrl: project.thumbnail ? await ctx.storage.getUrl(project.thumbnail) : null,
      floorPlans: floorPlansWithSourceImageUrls.sort((a, b) => a.floor - b.floor)
    };
  }
});

export const create = mutationGeneric({
  args: {
    name: v.string(),
    address: v.optional(v.string()),
    clientName: v.optional(v.string()),
    thumbnail: v.optional(v.id("_storage"))
  },
  handler: async (ctx, args) => {
    const ownerEmail = await requireIdentityEmail(ctx);
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      address: args.address,
      clientName: args.clientName,
      ownerEmail,
      createdAt: now,
      updatedAt: now,
      thumbnail: args.thumbnail
    });
    await ensureProjectOwnerMember(ctx, projectId, ownerEmail);
    return projectId;
  }
});

export const createWithInitialFloorPlan = mutationGeneric({
  args: {
    name: v.string(),
    address: v.optional(v.string()),
    clientName: v.optional(v.string()),
    thumbnail: v.optional(v.id("_storage")),
    sourceImage: v.optional(v.id("_storage")),
    floor: v.number(),
    data: floorPlanDataValidator
  },
  handler: async (ctx, args) => {
    const ownerEmail = await requireIdentityEmail(ctx);
    const now = Date.now();
    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      address: args.address,
      clientName: args.clientName,
      ownerEmail,
      createdAt: now,
      updatedAt: now,
      thumbnail: args.thumbnail
    });
    await ensureProjectOwnerMember(ctx, projectId, ownerEmail);

    await ctx.db.insert("floorPlans", {
      projectId,
      floor: args.floor,
      sourceImage: args.sourceImage,
      data: args.data,
      version: 1
    });

    return projectId;
  }
});

export const update = mutationGeneric({
  args: {
    id: v.id("projects"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    clientName: v.optional(v.string()),
    thumbnail: v.optional(v.id("_storage"))
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) {
      throw new Error("Project not found");
    }
    await requireProjectOwner(ctx, args.id);

    await ctx.db.patch(args.id, {
      name: args.name ?? project.name,
      address: hasArg(args, "address") ? args.address || undefined : project.address,
      clientName: hasArg(args, "clientName") ? args.clientName || undefined : project.clientName,
      thumbnail: args.thumbnail ?? project.thumbnail,
      updatedAt: Date.now()
    });

    return args.id;
  }
});

export const remove = mutationGeneric({
  args: {
    id: v.id("projects")
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) {
      throw new Error("Project not found");
    }
    await requireProjectOwner(ctx, args.id);

    const floorPlans = await ctx.db
      .query("floorPlans")
      .withIndex("by_projectId", (query) => query.eq("projectId", args.id))
      .collect();
    const renders = await ctx.db
      .query("renders")
      .withIndex("by_projectId", (query) => query.eq("projectId", args.id))
      .collect();
    const versions = await ctx.db
      .query("versions")
      .withIndex("by_projectId", (query) => query.eq("projectId", args.id))
      .collect();
    const renderPresets = await ctx.db
      .query("renderPresets")
      .withIndex("by_projectId", (query) => query.eq("projectId", args.id))
      .collect();
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_projectId", (query) => query.eq("projectId", args.id))
      .collect();
    const members = await ctx.db
      .query("members")
      .withIndex("by_projectId", (query) => query.eq("projectId", args.id))
      .collect();

    const storageIds = new Set<Id<"_storage">>();
    if (project.thumbnail) {
      storageIds.add(project.thumbnail);
    }

    for (const floorPlan of floorPlans) {
      if (floorPlan.sourceImage) {
        storageIds.add(floorPlan.sourceImage);
      }
    }

    for (const render of renders) {
      storageIds.add(render.imageUrl);
    }

    for (const floorPlan of floorPlans) {
      await ctx.db.delete(floorPlan._id);
    }

    for (const render of renders) {
      await ctx.db.delete(render._id);
    }

    for (const version of versions) {
      await ctx.db.delete(version._id);
    }

    for (const renderPreset of renderPresets) {
      await ctx.db.delete(renderPreset._id);
    }

    for (const comment of comments) {
      await ctx.db.delete(comment._id);
    }

    for (const member of members) {
      await ctx.db.delete(member._id);
    }

    for (const storageId of storageIds) {
      await ctx.storage.delete(storageId);
    }

    await ctx.db.delete(args.id);
    return args.id;
  }
});
