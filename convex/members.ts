import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

export type MemberRole = Doc<"members">["role"];

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function getMemberByProjectAndEmail(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  email: string
) {
  return await ctx.db
    .query("members")
    .withIndex("by_projectId_email", (query) =>
      query.eq("projectId", projectId).eq("email", normalizeEmail(email))
    )
    .unique();
}

async function getProjectMembers(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">) {
  return await ctx.db
    .query("members")
    .withIndex("by_projectId", (query) => query.eq("projectId", projectId))
    .collect();
}

export async function ensureProjectOwnerMember(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  email?: string
) {
  const normalizedEmail = normalizeEmail(email || "owner@local.dev");
  const existing = await getMemberByProjectAndEmail(ctx, projectId, normalizedEmail);
  const now = Date.now();

  if (existing) {
    await ctx.db.patch(existing._id, {
      role: "owner",
      acceptedAt: existing.acceptedAt ?? now
    });
    return existing._id;
  }

  return await ctx.db.insert("members", {
    projectId,
    email: normalizedEmail,
    role: "owner",
    invitedAt: now,
    acceptedAt: now
  });
}

export async function canEdit(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  email: string
) {
  const member = await getMemberByProjectAndEmail(ctx, projectId, email);
  return member?.role === "owner" || member?.role === "editor";
}

export async function canView(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  email: string
) {
  return Boolean(await getMemberByProjectAndEmail(ctx, projectId, email));
}

export const listMembers = query({
  args: {
    projectId: v.id("projects")
  },
  handler: async (ctx, args) => {
    const members = await getProjectMembers(ctx, args.projectId);

    return members.sort((left, right) => {
      if (left.role === right.role) {
        return left.email.localeCompare(right.email);
      }
      if (left.role === "owner") {
        return -1;
      }
      if (right.role === "owner") {
        return 1;
      }
      if (left.role === "editor" && right.role === "viewer") {
        return -1;
      }
      if (left.role === "viewer" && right.role === "editor") {
        return 1;
      }
      return left.email.localeCompare(right.email);
    });
  }
});

export const inviteMember = mutation({
  args: {
    projectId: v.id("projects"),
    email: v.string(),
    role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer"))
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const email = normalizeEmail(args.email);
    if (!email) {
      throw new Error("Email is required");
    }

    const existing = await getMemberByProjectAndEmail(ctx, args.projectId, email);
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role
      });
      return existing._id;
    }

    return await ctx.db.insert("members", {
      projectId: args.projectId,
      email,
      role: args.role,
      invitedAt: now
    });
  }
});

export const updateRole = mutation({
  args: {
    memberId: v.id("members"),
    role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer"))
  },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member) {
      throw new Error("Member not found");
    }

    if (member.role === "owner" && args.role !== "owner") {
      const owners = (await getProjectMembers(ctx, member.projectId)).filter(
        (entry) => entry.role === "owner"
      );

      if (owners.length <= 1) {
        throw new Error("Each project must keep at least one owner");
      }
    }

    await ctx.db.patch(args.memberId, {
      role: args.role,
      acceptedAt: member.acceptedAt
    });

    return args.memberId;
  }
});

export const removeMember = mutation({
  args: {
    memberId: v.id("members")
  },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member) {
      throw new Error("Member not found");
    }

    if (member.role === "owner") {
      const owners = (await getProjectMembers(ctx, member.projectId)).filter(
        (entry) => entry.role === "owner"
      );

      if (owners.length <= 1) {
        throw new Error("Each project must keep at least one owner");
      }
    }

    await ctx.db.delete(args.memberId);
    return args.memberId;
  }
});
