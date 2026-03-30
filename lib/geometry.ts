import type {
  Annotation,
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
  annotations: [],
  furniture: [],
  scale: 24,
  gridSize: 6
};

const ROOM_DETECTION_TOLERANCE = 5;
const MIN_ROOM_AREA_PIXELS = 100;

export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cloneFloorPlanData(data: FloorPlanData): FloorPlanData {
  const cloned = JSON.parse(JSON.stringify(data)) as Partial<FloorPlanData>;
  return {
    ...EMPTY_FLOOR_PLAN,
    ...cloned,
    walls: cloned.walls ?? [],
    rooms: cloned.rooms ?? [],
    doors: cloned.doors ?? [],
    windows: cloned.windows ?? [],
    dimensions: cloned.dimensions ?? [],
    annotations: cloned.annotations ?? [],
    furniture: cloned.furniture ?? []
  };
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

function projectPointToWallSegment(
  wall: Wall,
  point: Point
): { ratio: number; point: Point } {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const lengthSquared = dx * dx + dy * dy || 1;
  const rawRatio = ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / lengthSquared;
  const ratio = clamp(rawRatio, 0, 1);
  return {
    ratio,
    point: pointOnWall(wall, ratio)
  };
}

export function projectPointToWall(
  wall: Wall,
  point: Point
): { ratio: number; point: Point } {
  const projected = projectPointToWallSegment(wall, point);
  const ratio = clamp(projected.ratio, 0.02, 0.98);
  return {
    ratio,
    point: pointOnWall(wall, ratio)
  };
}

export function formatFeetInches(pixels: number, scale: number): string {
  const totalFeet = pixels / (scale || 1)
  const feet = Math.floor(totalFeet)
  const inches = Math.round((totalFeet - feet) * 12)
  if (inches === 12) {
    return `${feet + 1} ft`
  }
  if (feet === 0) {
    return `${inches} in`
  }
  if (inches === 0) {
    return `${feet} ft`
  }
  return `${feet} ft ${inches} in`
}

export function snapToNearestEndpoint(
  point: Point,
  walls: Wall[],
  threshold = 15
): Point | null {
  let nearest: Point | null = null
  let bestDist = threshold

  for (const wall of walls) {
    const endpoints = [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 }
    ]
    for (const ep of endpoints) {
      const dist = pointDistance(point, ep)
      if (dist < bestDist) {
        bestDist = dist
        nearest = ep
      }
    }
  }

  return nearest
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

function signedPolygonArea(points: Point[]): number {
  if (points.length < 3) {
    return 0;
  }

  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    total += current.x * next.y - next.x * current.y;
  }

  return total / 2;
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

function createNormalizedPolygonKey(points: Point[], tolerance = ROOM_DETECTION_TOLERANCE): string {
  if (points.length < 3) {
    return "";
  }

  const tokens = points.map(
    (point) => `${Math.round(point.x / tolerance)}:${Math.round(point.y / tolerance)}`
  );

  const rotateToSmallest = (values: string[]): string[] => {
    let best = values;
    for (let index = 1; index < values.length; index += 1) {
      const rotated = [...values.slice(index), ...values.slice(0, index)];
      if (rotated.join("|") < best.join("|")) {
        best = rotated;
      }
    }
    return best;
  };

  const forward = rotateToSmallest(tokens);
  const reversed = rotateToSmallest([...tokens].reverse());
  const forwardKey = forward.join("|");
  const reversedKey = reversed.join("|");
  return forwardKey < reversedKey ? forwardKey : reversedKey;
}

function getNextAutoRoomNumber(rooms: Room[]): number {
  let nextNumber = 1;

  for (const room of rooms) {
    const match = /^Room (\d+)$/i.exec(room.label.trim());
    if (!match) {
      continue;
    }

    nextNumber = Math.max(nextNumber, Number(match[1]) + 1);
  }

  return nextNumber;
}

function getNodeIdForPoint(
  point: Point,
  nodes: Array<{ point: Point; count: number }>,
  tolerance: number
): number {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (pointDistance(point, node.point) > tolerance) {
      continue;
    }

    node.point = {
      x: (node.point.x * node.count + point.x) / (node.count + 1),
      y: (node.point.y * node.count + point.y) / (node.count + 1)
    };
    node.count += 1;
    return index;
  }

  nodes.push({
    point: { ...point },
    count: 1
  });
  return nodes.length - 1;
}

function detectGraphFaces(walls: Wall[], tolerance: number): Point[][] {
  const nodes: Array<{ point: Point; count: number }> = [];
  const adjacency = new Map<number, Set<number>>();
  const edgeKeys = new Set<string>();

  for (const wall of walls) {
    const startId = getNodeIdForPoint({ x: wall.x1, y: wall.y1 }, nodes, tolerance);
    const endId = getNodeIdForPoint({ x: wall.x2, y: wall.y2 }, nodes, tolerance);
    if (startId === endId) {
      continue;
    }

    const edgeKey = startId < endId ? `${startId}:${endId}` : `${endId}:${startId}`;
    if (edgeKeys.has(edgeKey)) {
      continue;
    }

    edgeKeys.add(edgeKey);
    if (!adjacency.has(startId)) {
      adjacency.set(startId, new Set<number>());
    }
    if (!adjacency.has(endId)) {
      adjacency.set(endId, new Set<number>());
    }
    adjacency.get(startId)!.add(endId);
    adjacency.get(endId)!.add(startId);
  }

  const orderedNeighbors = new Map<number, number[]>();
  for (const [nodeId, neighbors] of adjacency.entries()) {
    const origin = nodes[nodeId].point;
    orderedNeighbors.set(
      nodeId,
      [...neighbors].sort((leftId, rightId) => {
        const left = nodes[leftId].point;
        const right = nodes[rightId].point;
        const leftAngle = Math.atan2(left.y - origin.y, left.x - origin.x);
        const rightAngle = Math.atan2(right.y - origin.y, right.x - origin.x);
        return leftAngle - rightAngle;
      })
    );
  }

  const visitedHalfEdges = new Set<string>();
  const faces: Point[][] = [];
  const maxSteps = Math.max(edgeKeys.size * 2, 1);

  for (const [startId, neighbors] of orderedNeighbors.entries()) {
    for (const neighborId of neighbors) {
      const startHalfEdgeKey = `${startId}->${neighborId}`;
      if (visitedHalfEdges.has(startHalfEdgeKey)) {
        continue;
      }

      const faceNodeIds: number[] = [];
      let currentId = startId;
      let nextId = neighborId;
      let isClosedFace = false;

      for (let step = 0; step < maxSteps; step += 1) {
        const halfEdgeKey = `${currentId}->${nextId}`;
        if (visitedHalfEdges.has(halfEdgeKey)) {
          break;
        }

        visitedHalfEdges.add(halfEdgeKey);
        faceNodeIds.push(currentId);

        const nextNeighbors = orderedNeighbors.get(nextId);
        if (!nextNeighbors || nextNeighbors.length === 0) {
          break;
        }

        const incomingIndex = nextNeighbors.indexOf(currentId);
        if (incomingIndex === -1) {
          break;
        }

        const turnIndex =
          (incomingIndex - 1 + nextNeighbors.length) % nextNeighbors.length;
        const turnId = nextNeighbors[turnIndex];
        currentId = nextId;
        nextId = turnId;

        if (currentId === startId && nextId === neighborId) {
          isClosedFace = true;
          break;
        }
      }

      if (!isClosedFace) {
        continue;
      }

      const uniqueNodeIds = [...new Set(faceNodeIds)];
      if (uniqueNodeIds.length < 3 || uniqueNodeIds.length !== faceNodeIds.length) {
        continue;
      }

      const polygon = faceNodeIds.map((nodeId) => nodes[nodeId].point);
      const polygonSignedArea = signedPolygonArea(polygon);
      if (polygonSignedArea <= MIN_ROOM_AREA_PIXELS) {
        continue;
      }

      faces.push(polygon);
    }
  }

  return faces;
}

export function detectClosedRooms(
  walls: Wall[],
  existingRooms: Room[],
  scale: number
): Room[] {
  const existingKeys = new Set(
    existingRooms.map((room) => createNormalizedPolygonKey(room.polygon))
  );
  const detectedKeys = new Set<string>();
  const nextRooms: Room[] = [];
  let nextRoomNumber = getNextAutoRoomNumber(existingRooms);

  for (const polygon of detectGraphFaces(walls, ROOM_DETECTION_TOLERANCE)) {
    const polygonKey = createNormalizedPolygonKey(polygon);
    if (!polygonKey || existingKeys.has(polygonKey) || detectedKeys.has(polygonKey)) {
      continue;
    }

    const nextRoom: Room = {
      id: createId("room"),
      label: `Room ${nextRoomNumber}`,
      polygon,
      areaSqFt: 0
    };
    nextRoom.areaSqFt = calculateRoomAreaSqFt(nextRoom, scale);
    nextRooms.push(nextRoom);
    detectedKeys.add(polygonKey);
    nextRoomNumber += 1;
  }

  return nextRooms;
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

function moveRoomPointWithWall(point: Point, previousWall: Wall, nextWall: Wall, tolerance: number): Point {
  const projected = projectPointToWallSegment(previousWall, point);
  if (pointDistance(projected.point, point) > tolerance) {
    return point;
  }

  const previousStart = { x: previousWall.x1, y: previousWall.y1 };
  const previousEnd = { x: previousWall.x2, y: previousWall.y2 };
  const ratio =
    pointDistance(point, previousStart) <= tolerance
      ? 0
      : pointDistance(point, previousEnd) <= tolerance
        ? 1
        : projected.ratio;
  const nextProjected = pointOnWall(nextWall, ratio);

  return {
    x: nextProjected.x + (point.x - projected.point.x),
    y: nextProjected.y + (point.y - projected.point.y)
  };
}

export function moveRoomsWithWall(
  rooms: Room[],
  previousWall: Wall,
  nextWall: Wall,
  tolerance = 10
): Room[] {
  return rooms.map((room) => ({
    ...room,
    polygon: room.polygon.map((point) =>
      moveRoomPointWithWall(point, previousWall, nextWall, tolerance)
    )
  }));
}

function pointTouchesWall(point: Point, wall: Wall, tolerance: number): boolean {
  const projected = projectPointToWallSegment(wall, point);
  return pointDistance(projected.point, point) <= tolerance;
}

export function roomTouchesWall(room: Room, wall: Wall, tolerance = 10): boolean {
  let touchingVertices = 0;

  for (const point of room.polygon) {
    if (pointTouchesWall(point, wall, tolerance)) {
      touchingVertices += 1;
      if (touchingVertices >= 2) {
        return true;
      }
    }
  }

  for (let index = 0; index < room.polygon.length; index += 1) {
    const start = room.polygon[index];
    const end = room.polygon[(index + 1) % room.polygon.length];
    const midpoint = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };

    if (
      pointTouchesWall(start, wall, tolerance) &&
      pointTouchesWall(end, wall, tolerance) &&
      pointTouchesWall(midpoint, wall, tolerance)
    ) {
      return true;
    }
  }

  return false;
}

export function syncDerivedData(data: FloorPlanData): FloorPlanData {
  const next = cloneFloorPlanData(data);
  next.rooms = next.rooms.map((room) => ({
    ...room,
    areaSqFt: calculateRoomAreaSqFt(room, next.scale)
  }));
  next.annotations = next.annotations.map((annotation) => syncAnnotationLabel(annotation, next.scale));
  next.dimensions = deriveDimensions(next.walls, next.scale);
  return next;
}

function syncAnnotationLabel(annotation: Annotation, scale: number): Annotation {
  return {
    ...annotation,
    label: formatFeetInches(pointDistance(annotation.from, annotation.to), scale)
  };
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
    annotations: [],
    furniture: [],
    scale,
    gridSize: 6
  });

  return {
    sourceImage,
    data: synced
  };
}

