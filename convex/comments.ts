import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireProjectEditor, requireProjectViewer } from "./members";

export const listComments = query({
  args: {
    projectId: v.id("projects")
  },
  handler: async (ctx, args) => {
    await requireProjectViewer(ctx, args.projectId);
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_projectId", (query) => query.eq("projectId", args.projectId))
      .collect();

    return comments.sort((left, right) => right.createdAt - left.createdAt);
  }
});

export const addComment = mutation({
  args: {
    projectId: v.id("projects"),
    floorPlanId: v.optional(v.id("floorPlans")),
    x: v.number(),
    y: v.number(),
    authorName: v.string(),
    text: v.string(),
    status: v.optional(v.union(v.literal("open"), v.literal("resolved")))
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    await requireProjectEditor(ctx, args.projectId);

    if (args.floorPlanId) {
      const floorPlan = await ctx.db.get(args.floorPlanId);
      if (!floorPlan || floorPlan.projectId !== args.projectId) {
        throw new Error("Floor plan not found");
      }
    }

    const authorName = args.authorName.trim();
    const text = args.text.trim();
    if (!authorName) {
      throw new Error("Author name is required");
    }
    if (!text) {
      throw new Error("Comment text is required");
    }

    const now = Date.now();
    return await ctx.db.insert("comments", {
      projectId: args.projectId,
      floorPlanId: args.floorPlanId,
      x: args.x,
      y: args.y,
      authorName,
      text,
      status: args.status ?? "open",
      createdAt: now,
      resolvedAt: args.status === "resolved" ? now : undefined
    });
  }
});

export const resolveComment = mutation({
  args: {
    commentId: v.id("comments")
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }
    await requireProjectEditor(ctx, comment.projectId);

    await ctx.db.patch(args.commentId, {
      status: "resolved",
      resolvedAt: Date.now()
    });

    return args.commentId;
  }
});

export const deleteComment = mutation({
  args: {
    commentId: v.id("comments")
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }
    await requireProjectEditor(ctx, comment.projectId);

    await ctx.db.delete(args.commentId);
    return args.commentId;
  }
});
