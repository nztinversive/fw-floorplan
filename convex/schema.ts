import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { legacyRenderSettingsValidator, renderSettingsValidator } from "./validators";

const point = v.object({
  x: v.number(),
  y: v.number()
});

const wall = v.object({
  id: v.string(),
  x1: v.number(),
  y1: v.number(),
  x2: v.number(),
  y2: v.number(),
  thickness: v.number()
});

const room = v.object({
  id: v.string(),
  label: v.string(),
  polygon: v.array(point),
  areaSqFt: v.number()
});

const door = v.object({
  id: v.string(),
  wallId: v.string(),
  position: v.number(),
  width: v.number(),
  type: v.union(
    v.literal("standard"),
    v.literal("sliding"),
    v.literal("double"),
    v.literal("garage")
  ),
  rotation: v.number()
});

const windowShape = v.object({
  id: v.string(),
  wallId: v.string(),
  position: v.number(),
  width: v.number(),
  height: v.number()
});

const dimension = v.object({
  id: v.string(),
  from: point,
  to: point,
  valueFt: v.number()
});

const annotation = v.object({
  id: v.string(),
  from: point,
  to: point,
  label: v.string()
});

const furniture = v.object({
  id: v.string(),
  type: v.string(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  depth: v.number(),
  rotation: v.number()
});

const floorPlanData = v.object({
  walls: v.array(wall),
  rooms: v.array(room),
  doors: v.array(door),
  windows: v.array(windowShape),
  dimensions: v.array(dimension),
  annotations: v.optional(v.array(annotation)),
  furniture: v.array(furniture),
  scale: v.number(),
  gridSize: v.number()
});

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    address: v.optional(v.string()),
    clientName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    thumbnail: v.optional(v.id("_storage"))
  }).index("by_updatedAt", ["updatedAt"]),
  floorPlans: defineTable({
    projectId: v.id("projects"),
    floor: v.number(),
    sourceImage: v.optional(v.id("_storage")),
    data: floorPlanData,
    version: v.number()
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_floor", ["projectId", "floor"]),
  versions: defineTable({
    projectId: v.id("projects"),
    floor: v.number(),
    name: v.string(),
    data: floorPlanData,
    createdAt: v.number()
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_floor", ["projectId", "floor"]),
  renders: defineTable({
    projectId: v.id("projects"),
    style: v.string(),
    settings: legacyRenderSettingsValidator,
    imageUrl: v.id("_storage"),
    prompt: v.string(),
    isFavorite: v.boolean(),
    createdAt: v.number()
  })
    .index("by_projectId", ["projectId"])
    .index("by_projectId_and_createdAt", ["projectId", "createdAt"]),
  renderPresets: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    style: v.string(),
    viewAngle: v.string(),
    settings: renderSettingsValidator,
    createdAt: v.number()
  }).index("by_projectId", ["projectId"])
});
