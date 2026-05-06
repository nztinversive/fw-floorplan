import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { floorPlanDataValidator, planEditProposalValidator } from "./validators";
import { requireProjectEditor, requireProjectViewer } from "./members";

const planEditRevisionModeValidator = v.union(
  v.literal("openai"),
  v.literal("local"),
  v.literal("fallback")
);

async function getSessionByClientId(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  clientId: string
) {
  return await ctx.db
    .query("planEditSessions")
    .withIndex("by_projectId_and_clientId", (query: any) =>
      query.eq("projectId", projectId).eq("clientId", clientId)
    )
    .unique();
}

export const list = query({
  args: {
    projectId: v.id("projects"),
    floor: v.number()
  },
  handler: async (ctx, args) => {
    await requireProjectViewer(ctx, args.projectId);

    const sessions = await ctx.db
      .query("planEditSessions")
      .withIndex("by_projectId_and_floor_and_createdAt", (query: any) =>
        query.eq("projectId", args.projectId).eq("floor", args.floor)
      )
      .order("desc")
      .take(20);

    return await Promise.all(
      sessions.map(async (session) => {
        const options = await ctx.db
          .query("planEditOptions")
          .withIndex("by_sessionId", (query: any) => query.eq("sessionId", session._id))
          .take(10);

        return {
          id: session.clientId,
          clientId: session.clientId,
          prompt: session.prompt,
          sourceLabel: session.sourceLabel,
          sourceData: session.sourceData,
          proposals: options
            .sort((left, right) => left.order - right.order)
            .map((option) => option.proposal),
          selectedProposalId: session.selectedProposalId,
          mode: session.mode,
          createdAt: session.createdAt
        };
      })
    );
  }
});

export const save = mutation({
  args: {
    projectId: v.id("projects"),
    clientId: v.string(),
    floor: v.number(),
    prompt: v.string(),
    sourceLabel: v.string(),
    sourceData: floorPlanDataValidator,
    selectedProposalId: v.string(),
    mode: planEditRevisionModeValidator,
    proposals: v.array(planEditProposalValidator)
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    const member = await requireProjectEditor(ctx, args.projectId);
    const now = Date.now();
    const existingSession = await getSessionByClientId(ctx, args.projectId, args.clientId);
    const sessionFields = {
      projectId: args.projectId,
      clientId: args.clientId,
      floor: args.floor,
      prompt: args.prompt.trim(),
      sourceLabel: args.sourceLabel.trim() || "Selected plan",
      sourceData: args.sourceData,
      selectedProposalId: args.selectedProposalId,
      mode: args.mode,
      authorEmail: member.email,
      updatedAt: now
    };
    const sessionId = existingSession
      ? existingSession._id
      : await ctx.db.insert("planEditSessions", {
          ...sessionFields,
          createdAt: now
        });

    if (existingSession) {
      await ctx.db.patch(existingSession._id, sessionFields);
      const existingOptions = await ctx.db
        .query("planEditOptions")
        .withIndex("by_sessionId", (query: any) => query.eq("sessionId", existingSession._id))
        .take(10);

      for (const option of existingOptions) {
        await ctx.db.delete(option._id);
      }
    }

    for (const [index, proposal] of args.proposals.slice(0, 5).entries()) {
      await ctx.db.insert("planEditOptions", {
        projectId: args.projectId,
        sessionId,
        sessionClientId: args.clientId,
        order: index,
        proposal,
        createdAt: now
      });
    }

    await ctx.db.patch(args.projectId, {
      updatedAt: now
    });

    return args.clientId;
  }
});

export const selectOption = mutation({
  args: {
    projectId: v.id("projects"),
    clientId: v.string(),
    selectedProposalId: v.string()
  },
  handler: async (ctx, args) => {
    await requireProjectEditor(ctx, args.projectId);
    const session = await getSessionByClientId(ctx, args.projectId, args.clientId);
    if (!session) {
      return null;
    }

    await ctx.db.patch(session._id, {
      selectedProposalId: args.selectedProposalId,
      updatedAt: Date.now()
    });

    return args.clientId;
  }
});
