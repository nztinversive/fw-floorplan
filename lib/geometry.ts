import type {
  Dimension,
  Door,
  FloorPlanData,
  Point,
  Room,
  Wall,
  Window
} from "@/lib/types";

export const EMPTY_FLOOR_PLAN: FloorPlanData = {
  walls: [],
  rooms: [],
  doors: [],
  windows: [],
  dimensions: [],
  furniture: [],
  scale: 24,
  gridSize: 6
};

export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cloneFloorPlanData(data: FloorPlanData): FloorPlanData {
  return JSON.parse(JSON.stringify(data)) as FloorPlanData;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function getWallLength(wall: Wall): number {
  return Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
}

export function getWallAngle(wall: Wall): number {
  return (Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180) / Math.PI;
}

export function pointOnWall(wall: Wall, position: number): Point {
  return {
    x: wall.x1 + (wall.x2 - wall.x1) * position,
    y: wall.y1 + (wall.y2 - wall.y1) * position
  };
}

export function projectPointToWall(
  wall: Wall,
  point: Point
): { ratio: number; point: Point } {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const lengthSquared = dx * dx + dy * dy || 1;
  const rawRatio = ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / lengthSquared;
  const ratio = clamp(rawRatio, 0.02, 0.98);
  return {
    ratio,
    point: pointOnWall(wall, ratio)
  };
}

export function snapPoint(point: Point, scale: number, gridSizeInches: number): Point {
  const grid = (scale * gridSizeInches) / 12;
  if (grid <= 0) {
    return point;
  }

  return {
    x: Math.round(point.x / grid) * grid,
    y: Math.round(point.y / grid) * grid
  };
}

export function polygonArea(points: Point[]): number {
  if (points.length < 3) {
    return 0;
  }

  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    total += current.x * next.y - next.x * current.y;
  }

  return Math.abs(total / 2);
}

export function polygonCentroid(points: Point[]): Point {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  if (points.length < 3) {
    const total = points.reduce(
      (accumulator, point) => ({
        x: accumulator.x + point.x,
        y: accumulator.y + point.y
      }),
      { x: 0, y: 0 }
    );

    return {
      x: total.x / points.length,
      y: total.y / points.length
    };
  }

  let signedDoubleArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const factor = current.x * next.y - next.x * current.y;
    signedDoubleArea += factor;
    cx += (current.x + next.x) * factor;
    cy += (current.y + next.y) * factor;
  }

  if (Math.abs(signedDoubleArea) < 1e-6) {
    const total = points.reduce(
      (accumulator, point) => ({
        x: accumulator.x + point.x,
        y: accumulator.y + point.y
      }),
      { x: 0, y: 0 }
    );

    return {
      x: total.x / points.length,
      y: total.y / points.length
    };
  }

  return {
    x: cx / (3 * signedDoubleArea),
    y: cy / (3 * signedDoubleArea)
  };
}

export function calculateRoomAreaSqFt(room: Room, scale: number): number {
  const squarePixels = polygonArea(room.polygon);
  const squareFeet = squarePixels / (scale * scale || 1);
  return Number(squareFeet.toFixed(1));
}

export function findNearestWall(
  walls: Wall[],
  point: Point,
  threshold = 36
): Wall | null {
  let nearest: Wall | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const wall of walls) {
    const projected = projectPointToWall(wall, point);
    const distance = pointDistance(projected.point, point);
    if (distance < bestDistance && distance <= threshold) {
      bestDistance = distance;
      nearest = wall;
    }
  }

  return nearest;
}

export function deriveDimensions(walls: Wall[], scale: number): Dimension[] {
  return walls.map((wall) => ({
    id: `dim-${wall.id}`,
    from: { x: wall.x1, y: wall.y1 },
    to: { x: wall.x2, y: wall.y2 },
    valueFt: Number((getWallLength(wall) / (scale || 1)).toFixed(1))
  }));
}

export function syncDerivedData(data: FloorPlanData): FloorPlanData {
  const next = cloneFloorPlanData(data);
  next.rooms = next.rooms.map((room) => ({
    ...room,
    areaSqFt: calculateRoomAreaSqFt(room, next.scale)
  }));
  next.dimensions = deriveDimensions(next.walls, next.scale);
  return next;
}

export function createSeedFloorPlan(sourceImage?: string): {
  sourceImage?: string;
  data: FloorPlanData;
} {
  const scale = 24;
  const walls: Wall[] = [
    { id: "wall-1", x1: 80, y1: 80, x2: 560, y2: 80, thickness: 8 },
    { id: "wall-2", x1: 560, y1: 80, x2: 560, y2: 380, thickness: 8 },
    { id: "wall-3", x1: 560, y1: 380, x2: 80, y2: 380, thickness: 8 },
    { id: "wall-4", x1: 80, y1: 380, x2: 80, y2: 80, thickness: 8 },
    { id: "wall-5", x1: 300, y1: 80, x2: 300, y2: 380, thickness: 6 },
    { id: "wall-6", x1: 80, y1: 220, x2: 300, y2: 220, thickness: 6 }
  ];

  const rooms: Room[] = [
    {
      id: "room-1",
      label: "Living Room",
      polygon: [
        { x: 80, y: 80 },
        { x: 300, y: 80 },
        { x: 300, y: 220 },
        { x: 80, y: 220 }
      ],
      areaSqFt: 0
    },
    {
      id: "room-2",
      label: "Kitchen",
      polygon: [
        { x: 80, y: 220 },
        { x: 300, y: 220 },
        { x: 300, y: 380 },
        { x: 80, y: 380 }
      ],
      areaSqFt: 0
    },
    {
      id: "room-3",
      label: "Primary Suite",
      polygon: [
        { x: 300, y: 80 },
        { x: 560, y: 80 },
        { x: 560, y: 380 },
        { x: 300, y: 380 }
      ],
      areaSqFt: 0
    }
  ];

  const doors: Door[] = [
    {
      id: "door-1",
      wallId: "wall-6",
      position: 0.52,
      width: 36,
      type: "standard",
      rotation: 0
    }
  ];

  const windows: Window[] = [
    {
      id: "window-1",
      wallId: "wall-1",
      position: 0.22,
      width: 54,
      height: 48
    },
    {
      id: "window-2",
      wallId: "wall-2",
      position: 0.5,
      width: 48,
      height: 42
    }
  ];

  const synced = syncDerivedData({
    walls,
    rooms,
    doors,
    windows,
    dimensions: [],
    furniture: [],
    scale,
    gridSize: 6
  });

  return {
    sourceImage,
    data: synced
  };
}

