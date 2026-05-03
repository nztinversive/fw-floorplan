import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type {
  Annotation,
  Dimension,
  Door,
  FloorPlanData,
  Furniture,
  Room,
  Wall,
  Window
} from "../lib/types";

type FloorPlanDoc = Doc<"floorPlans">;
export type HydratedFloorPlanDoc = FloorPlanDoc & { data: FloorPlanData };
type ChildCtx = QueryCtx | MutationCtx;
type FloorPlanDataInput = Omit<FloorPlanData, "annotations"> & {
  annotations?: Annotation[];
};
type ChildTableName =
  | "floorPlanWalls"
  | "floorPlanRooms"
  | "floorPlanDoors"
  | "floorPlanWindows"
  | "floorPlanDimensions"
  | "floorPlanAnnotations"
  | "floorPlanFurniture";

function normalizeData(data: FloorPlanDataInput): FloorPlanData {
  return {
    ...data,
    annotations: data.annotations ?? []
  };
}

async function listChildren(
  ctx: ChildCtx,
  tableName: ChildTableName,
  floorPlanId: Id<"floorPlans">
) {
  return await ctx.db
    .query(tableName)
    .withIndex("by_floorPlanId", (query) => query.eq("floorPlanId", floorPlanId))
    .take(8192);
}

function byOrder<T extends { order: number; itemId: string }>(left: T, right: T) {
  return left.order - right.order || left.itemId.localeCompare(right.itemId);
}

function stripSystemFields<T extends { _id: unknown; _creationTime: number }>(
  document: T
) {
  const { _id, _creationTime, ...rest } = document;
  return rest;
}

function rowChanged<T extends object>(document: T, next: T) {
  return JSON.stringify(document) !== JSON.stringify(next);
}

async function replaceChildRows<
  TableName extends ChildTableName,
  Item extends { id: string },
  Row extends { floorPlanId: Id<"floorPlans">; itemId: string; order: number }
>(
  ctx: MutationCtx,
  tableName: TableName,
  floorPlanId: Id<"floorPlans">,
  items: Item[],
  toRow: (item: Item, order: number) => Row
) {
  const existing = await listChildren(ctx, tableName, floorPlanId);
  const existingByItemId = new Map(
    existing.map((document) => [(document as { itemId: string }).itemId, document])
  );
  const nextItemIds = new Set<string>();

  for (let order = 0; order < items.length; order += 1) {
    const item = items[order];
    const nextRow = toRow(item, order);
    nextItemIds.add(nextRow.itemId);

    const current = existingByItemId.get(nextRow.itemId);
    if (!current) {
      await ctx.db.insert(tableName as never, nextRow as never);
      continue;
    }

    const currentRow = stripSystemFields(current as typeof current & { _id: unknown; _creationTime: number });
    if (rowChanged(currentRow, nextRow)) {
      await ctx.db.patch((current as { _id: Id<any> })._id, nextRow as Partial<Row>);
    }
  }

  for (const current of existing) {
    const itemId = (current as { itemId: string }).itemId;
    if (!nextItemIds.has(itemId)) {
      await ctx.db.delete((current as { _id: Id<any> })._id);
    }
  }
}

export async function hydrateFloorPlanData(
  ctx: QueryCtx | MutationCtx,
  floorPlan: FloorPlanDoc
): Promise<HydratedFloorPlanDoc> {
  const [
    walls,
    rooms,
    doors,
    windows,
    dimensions,
    annotations,
    furniture
  ] = await Promise.all([
    listChildren(ctx, "floorPlanWalls", floorPlan._id),
    listChildren(ctx, "floorPlanRooms", floorPlan._id),
    listChildren(ctx, "floorPlanDoors", floorPlan._id),
    listChildren(ctx, "floorPlanWindows", floorPlan._id),
    listChildren(ctx, "floorPlanDimensions", floorPlan._id),
    listChildren(ctx, "floorPlanAnnotations", floorPlan._id),
    listChildren(ctx, "floorPlanFurniture", floorPlan._id)
  ]);

  return {
    ...floorPlan,
    data: {
      walls: (walls as Doc<"floorPlanWalls">[]).sort(byOrder).map((wall) => ({
        id: wall.itemId,
        x1: wall.x1,
        y1: wall.y1,
        x2: wall.x2,
        y2: wall.y2,
        thickness: wall.thickness
      })),
      rooms: (rooms as Doc<"floorPlanRooms">[]).sort(byOrder).map((room) => ({
        id: room.itemId,
        label: room.label,
        polygon: room.polygon,
        areaSqFt: room.areaSqFt
      })),
      doors: (doors as Doc<"floorPlanDoors">[]).sort(byOrder).map((door) => ({
        id: door.itemId,
        wallId: door.wallId,
        position: door.position,
        width: door.width,
        type: door.type,
        rotation: door.rotation
      })),
      windows: (windows as Doc<"floorPlanWindows">[]).sort(byOrder).map((windowShape) => ({
        id: windowShape.itemId,
        wallId: windowShape.wallId,
        position: windowShape.position,
        width: windowShape.width,
        height: windowShape.height
      })),
      dimensions: (dimensions as Doc<"floorPlanDimensions">[]).sort(byOrder).map((dimension) => ({
        id: dimension.itemId,
        from: dimension.from,
        to: dimension.to,
        valueFt: dimension.valueFt
      })),
      annotations: (annotations as Doc<"floorPlanAnnotations">[]).sort(byOrder).map((annotation) => ({
        id: annotation.itemId,
        from: annotation.from,
        to: annotation.to,
        label: annotation.label
      })),
      furniture: (furniture as Doc<"floorPlanFurniture">[]).sort(byOrder).map((item) => ({
        id: item.itemId,
        type: item.type,
        x: item.x,
        y: item.y,
        width: item.width,
        depth: item.depth,
        rotation: item.rotation
      })),
      scale: floorPlan.scale,
      gridSize: floorPlan.gridSize
    }
  };
}

export async function hydrateFloorPlansData(
  ctx: QueryCtx | MutationCtx,
  floorPlans: FloorPlanDoc[]
) {
  return await Promise.all(floorPlans.map((floorPlan) => hydrateFloorPlanData(ctx, floorPlan)));
}

export async function saveFloorPlanChildData(
  ctx: MutationCtx,
  floorPlanId: Id<"floorPlans">,
  data: FloorPlanDataInput
) {
  const normalized = normalizeData(data);

  await replaceChildRows(ctx, "floorPlanWalls", floorPlanId, normalized.walls, (wall: Wall, order) => ({
    floorPlanId,
    itemId: wall.id,
    order,
    x1: wall.x1,
    y1: wall.y1,
    x2: wall.x2,
    y2: wall.y2,
    thickness: wall.thickness
  }));

  await replaceChildRows(ctx, "floorPlanRooms", floorPlanId, normalized.rooms, (room: Room, order) => ({
    floorPlanId,
    itemId: room.id,
    order,
    label: room.label,
    polygon: room.polygon,
    areaSqFt: room.areaSqFt
  }));

  await replaceChildRows(ctx, "floorPlanDoors", floorPlanId, normalized.doors, (door: Door, order) => ({
    floorPlanId,
    itemId: door.id,
    order,
    wallId: door.wallId,
    position: door.position,
    width: door.width,
    type: door.type,
    rotation: door.rotation
  }));

  await replaceChildRows(ctx, "floorPlanWindows", floorPlanId, normalized.windows, (windowShape: Window, order) => ({
    floorPlanId,
    itemId: windowShape.id,
    order,
    wallId: windowShape.wallId,
    position: windowShape.position,
    width: windowShape.width,
    height: windowShape.height
  }));

  await replaceChildRows(ctx, "floorPlanDimensions", floorPlanId, normalized.dimensions, (dimension: Dimension, order) => ({
    floorPlanId,
    itemId: dimension.id,
    order,
    from: dimension.from,
    to: dimension.to,
    valueFt: dimension.valueFt
  }));

  await replaceChildRows(ctx, "floorPlanAnnotations", floorPlanId, normalized.annotations, (annotation: Annotation, order) => ({
    floorPlanId,
    itemId: annotation.id,
    order,
    from: annotation.from,
    to: annotation.to,
    label: annotation.label
  }));

  await replaceChildRows(ctx, "floorPlanFurniture", floorPlanId, normalized.furniture, (item: Furniture, order) => ({
    floorPlanId,
    itemId: item.id,
    order,
    type: item.type,
    x: item.x,
    y: item.y,
    width: item.width,
    depth: item.depth,
    rotation: item.rotation
  }));
}

export async function deleteFloorPlanChildData(
  ctx: MutationCtx,
  floorPlanId: Id<"floorPlans">
) {
  const tables = [
    "floorPlanWalls",
    "floorPlanRooms",
    "floorPlanDoors",
    "floorPlanWindows",
    "floorPlanDimensions",
    "floorPlanAnnotations",
    "floorPlanFurniture"
  ] satisfies ChildTableName[];

  for (const tableName of tables) {
    const rows = await listChildren(ctx, tableName, floorPlanId);
    for (const row of rows) {
      await ctx.db.delete((row as { _id: Id<any> })._id);
    }
  }
}
