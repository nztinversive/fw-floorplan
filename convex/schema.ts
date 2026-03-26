import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
  furniture: v.array(furniture),
  scale: v.number(),
  gridSize: v.number()
});

const renderSettings = v.object({
  style: v.string(),
  sidingMaterial: v.string(),
  roofStyle: v.string(),
  colorPalette: v.string(),
  landscaping: v.string(),
  timeOfDay: v.string(),
  season: v.string()
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
  renders: defineTable({
    projectId: v.id("projects"),
    style: v.string(),
    settings: renderSettings,
    imageUrl: v.id("_storage"),
    prompt: v.string(),
    isFavorite: v.boolean(),
    createdAt: v.number()
  }).index("by_projectId", ["projectId"])
});

