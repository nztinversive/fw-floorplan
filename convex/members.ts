import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

export type MemberRole = Doc<"members">["role"];
type RoleRequirement = "viewer" | "editor" | "owner";

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

function roleCan(role: MemberRole, requirement: RoleRequirement) {
  if (requirement === "viewer") {
    return true;
  }
  if (requirement === "editor") {
    return role === "owner" || role === "editor";
  }
  return role === "owner";
}

export async function requireIdentityEmail(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db.get(userId);
  const email = user?.email?.trim().toLowerCase();
  if (!email) {
    throw new Error("Not authenticated");
  }
  return email;
}

export async function requireProjectRole(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  requirement: RoleRequirement
) {
  const email = await requireIdentityEmail(ctx);
  const member = await getMemberByProjectAndEmail(ctx, projectId, email);
  if (!member || !roleCan(member.role, requirement)) {
    throw new Error("Unauthorized");
  }
  return member;
}

export async function requireProjectViewer(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">) {
  return await requireProjectRole(ctx, projectId, "viewer");
}

export async function requireProjectEditor(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">) {
  return await requireProjectRole(ctx, projectId, "editor");
}

export async function requireProjectOwner(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">) {
  return await requireProjectRole(ctx, projectId, "owner");
}

export async function listProjectMembershipsForCurrentUser(ctx: QueryCtx | MutationCtx) {
  const email = await requireIdentityEmail(ctx);
  return await ctx.db
    .query("members")
    .withIndex("by_email", (query) => query.eq("email", email))
    .take(200);
}

export async function ensureProjectOwnerMember(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  email: string
) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Owner email is required");
  }
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

export const requireCurrentUserProjectEditor = internalQuery({
  args: {
    projectId: v.id("projects")
  },
  handler: async (ctx, args) => {
    await requireProjectEditor(ctx, args.projectId);
    return true;
  }
});

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
    await requireProjectOwner(ctx, args.projectId);
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

export const currentMember = query({
  args: {
    projectId: v.id("projects")
  },
  handler: async (ctx, args) => {
    return await requireProjectViewer(ctx, args.projectId);
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
    await requireProjectOwner(ctx, args.projectId);

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
    await requireProjectOwner(ctx, member.projectId);

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
    await requireProjectOwner(ctx, member.projectId);

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
