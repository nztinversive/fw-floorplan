import { v } from "convex/values";

export const pointValidator = v.object({
  x: v.number(),
  y: v.number()
});

export const floorPlanDataValidator = v.object({
  walls: v.array(
    v.object({
      id: v.string(),
      x1: v.number(),
      y1: v.number(),
      x2: v.number(),
      y2: v.number(),
      thickness: v.number()
    })
  ),
  rooms: v.array(
    v.object({
      id: v.string(),
      label: v.string(),
      polygon: v.array(pointValidator),
      areaSqFt: v.number()
    })
  ),
  doors: v.array(
    v.object({
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
    })
  ),
  windows: v.array(
    v.object({
      id: v.string(),
      wallId: v.string(),
      position: v.number(),
      width: v.number(),
      height: v.number()
    })
  ),
  dimensions: v.array(
    v.object({
      id: v.string(),
      from: pointValidator,
      to: pointValidator,
      valueFt: v.number()
    })
  ),
  furniture: v.array(
    v.object({
      id: v.string(),
      type: v.string(),
      x: v.number(),
      y: v.number(),
      width: v.number(),
      depth: v.number(),
      rotation: v.number()
    })
  ),
  scale: v.number(),
  gridSize: v.number()
});
