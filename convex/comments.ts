import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireProjectEditor, requireProjectViewer } from "./members";

function displayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? email;
  return localPart
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || email;
}

export const listComments = query({
  args: {
    projectId: v.id("projects")
  },
  handler: async (ctx, args) => {
    await requireProjectViewer(ctx, args.projectId);
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_projectId", (query) => query.eq("projectId", args.projectId))
      .order("desc")
      .take(200);

    return comments;
  }
});

export const addComment = mutation({
  args: {
    projectId: v.id("projects"),
    floorPlanId: v.optional(v.id("floorPlans")),
    x: v.number(),
    y: v.number(),
    text: v.string(),
    status: v.optional(v.union(v.literal("open"), v.literal("resolved")))
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    const member = await requireProjectEditor(ctx, args.projectId);

    if (args.floorPlanId) {
      const floorPlan = await ctx.db.get(args.floorPlanId);
      if (!floorPlan || floorPlan.projectId !== args.projectId) {
        throw new Error("Floor plan not found");
      }
    }

    const text = args.text.trim();
    if (!text) {
      throw new Error("Comment text is required");
    }

    const now = Date.now();
    return await ctx.db.insert("comments", {
      projectId: args.projectId,
      floorPlanId: args.floorPlanId,
      x: args.x,
      y: args.y,
      authorName: displayNameFromEmail(member.email),
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

export const reopenComment = mutation({
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
      status: "open",
      resolvedAt: undefined
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
