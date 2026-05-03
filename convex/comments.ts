import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireProjectEditor, requireProjectViewer } from "./members";

const commentStatusValidator = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("resolved")
);

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
    const replies = await ctx.db
      .query("commentReplies")
      .withIndex("by_projectId", (query) => query.eq("projectId", args.projectId))
      .order("desc")
      .take(500);
    const repliesByCommentId = new Map<string, typeof replies>();

    for (const reply of replies) {
      const currentReplies = repliesByCommentId.get(reply.commentId) ?? [];
      currentReplies.push(reply);
      repliesByCommentId.set(reply.commentId, currentReplies);
    }

    return comments.map((comment) => ({
      ...comment,
      replies: (repliesByCommentId.get(comment._id) ?? []).reverse()
    }));
  }
});

export const addComment = mutation({
  args: {
    projectId: v.id("projects"),
    floorPlanId: v.optional(v.id("floorPlans")),
    x: v.number(),
    y: v.number(),
    text: v.string(),
    status: v.optional(commentStatusValidator)
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

export const updateCommentStatus = mutation({
  args: {
    commentId: v.id("comments"),
    status: commentStatusValidator
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }
    await requireProjectEditor(ctx, comment.projectId);

    await ctx.db.patch(args.commentId, {
      status: args.status,
      resolvedAt: args.status === "resolved" ? Date.now() : undefined
    });

    return args.commentId;
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

    await ctx.db.patch(args.commentId, { status: "resolved", resolvedAt: Date.now() });

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

    await ctx.db.patch(args.commentId, { status: "open", resolvedAt: undefined });

    return args.commentId;
  }
});

export const addReply = mutation({
  args: {
    commentId: v.id("comments"),
    text: v.string()
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }
    const member = await requireProjectEditor(ctx, comment.projectId);

    const text = args.text.trim();
    if (!text) {
      throw new Error("Reply text is required");
    }

    return await ctx.db.insert("commentReplies", {
      projectId: comment.projectId,
      commentId: args.commentId,
      authorName: displayNameFromEmail(member.email),
      text,
      createdAt: Date.now()
    });
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

    const replies = await ctx.db
      .query("commentReplies")
      .withIndex("by_commentId", (query) => query.eq("commentId", args.commentId))
      .take(200);

    for (const reply of replies) {
      await ctx.db.delete(reply._id);
    }

    await ctx.db.delete(args.commentId);
    return args.commentId;
  }
});
