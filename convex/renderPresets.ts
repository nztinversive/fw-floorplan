import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { renderSettingsValidator, renderViewAngleValidator } from "./validators";

export const savePreset = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    style: v.string(),
    viewAngle: renderViewAngleValidator,
    settings: renderSettingsValidator
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const now = Date.now();
    const presetId = await ctx.db.insert("renderPresets", {
      projectId: args.projectId,
      name: args.name.trim(),
      style: args.style,
      viewAngle: args.viewAngle,
      settings: {
        ...args.settings,
        style: args.style,
        viewAngle: args.viewAngle
      },
      createdAt: now
    });

    await ctx.db.patch(args.projectId, {
      updatedAt: now
    });

    return presetId;
  }
});

export const listPresets = query({
  args: {
    projectId: v.id("projects")
  },
  handler: async (ctx, args) => {
    const presets = await ctx.db
      .query("renderPresets")
      .withIndex("by_projectId", (query) => query.eq("projectId", args.projectId))
      .collect();

    return presets
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((preset) => ({
        _id: preset._id,
        projectId: preset.projectId,
        name: preset.name,
        style: preset.style,
        viewAngle: preset.viewAngle,
        settings: preset.settings,
        createdAt: preset.createdAt
      }));
  }
});

export const deletePreset = mutation({
  args: {
    presetId: v.id("renderPresets")
  },
  handler: async (ctx, args) => {
    const preset = await ctx.db.get(args.presetId);
    if (!preset) {
      throw new Error("Render preset not found");
    }

    await ctx.db.delete(args.presetId);
    await ctx.db.patch(preset.projectId, {
      updatedAt: Date.now()
    });

    return args.presetId;
  }
});
