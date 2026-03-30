import { getWallAngle, pointOnWall } from "@/lib/geometry";
import type { FloorPlanData, Point, Wall } from "@/lib/types";

type DxfPoint = {
  x: number;
  y: number;
};

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const WINDOW_LINE_OFFSET_FEET = 0.15;

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const rounded = Number(value.toFixed(4));
  return Object.is(rounded, -0) ? "0" : `${rounded}`;
}

function pushGroup(output: string[], code: number | string, value: number | string) {
  output.push(`${code}`, `${value}`);
}

function getBounds(points: Point[]): Bounds | null {
  if (points.length === 0) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function toDxfPoint(point: Point, origin: Point, scale: number): DxfPoint {
  return {
    x: (point.x - origin.x) / scale,
    y: -((point.y - origin.y) / scale)
  };
}

function getDoorRadiusPx(widthInches: number, scale: number) {
  return (widthInches / 12) * scale * 0.5;
}

function getWindowSegments(wall: Wall, position: number, widthInches: number, scale: number) {
  const center = pointOnWall(wall, position);
  const angle = (getWallAngle(wall) * Math.PI) / 180;
  const widthPx = (widthInches / 12) * scale;
  const offsetPx = WINDOW_LINE_OFFSET_FEET * scale;
  const halfWidthX = Math.cos(angle) * (widthPx / 2);
  const halfWidthY = Math.sin(angle) * (widthPx / 2);
  const offsetX = Math.cos(angle + Math.PI / 2) * offsetPx;
  const offsetY = Math.sin(angle + Math.PI / 2) * offsetPx;

  return [
    {
      start: { x: center.x - halfWidthX - offsetX, y: center.y - halfWidthY - offsetY },
      end: { x: center.x + halfWidthX - offsetX, y: center.y + halfWidthY - offsetY }
    },
    {
      start: { x: center.x - halfWidthX + offsetX, y: center.y - halfWidthY + offsetY },
      end: { x: center.x + halfWidthX + offsetX, y: center.y + halfWidthY + offsetY }
    }
  ];
}

function addLineEntity(output: string[], layer: string, start: DxfPoint, end: DxfPoint) {
  pushGroup(output, 0, "LINE");
  pushGroup(output, 100, "AcDbEntity");
  pushGroup(output, 8, layer);
  pushGroup(output, 100, "AcDbLine");
  pushGroup(output, 10, formatNumber(start.x));
  pushGroup(output, 20, formatNumber(start.y));
  pushGroup(output, 30, 0);
  pushGroup(output, 11, formatNumber(end.x));
  pushGroup(output, 21, formatNumber(end.y));
  pushGroup(output, 31, 0);
}

function addCircleEntity(output: string[], layer: string, center: DxfPoint, radiusFeet: number) {
  pushGroup(output, 0, "CIRCLE");
  pushGroup(output, 100, "AcDbEntity");
  pushGroup(output, 8, layer);
  pushGroup(output, 100, "AcDbCircle");
  pushGroup(output, 10, formatNumber(center.x));
  pushGroup(output, 20, formatNumber(center.y));
  pushGroup(output, 30, 0);
  pushGroup(output, 40, formatNumber(radiusFeet));
}

function addPolylineEntity(output: string[], layer: string, points: DxfPoint[]) {
  if (points.length < 3) {
    return;
  }

  pushGroup(output, 0, "LWPOLYLINE");
  pushGroup(output, 100, "AcDbEntity");
  pushGroup(output, 8, layer);
  pushGroup(output, 100, "AcDbPolyline");
  pushGroup(output, 90, points.length);
  pushGroup(output, 70, 1);

  for (const point of points) {
    pushGroup(output, 10, formatNumber(point.x));
    pushGroup(output, 20, formatNumber(point.y));
  }
}

export function generateDxf(floorPlanData: FloorPlanData, projectName: string): string {
  const safeScale = floorPlanData.scale > 0 ? floorPlanData.scale : 1;
  const planPoints = [
    ...floorPlanData.walls.flatMap((wall) => [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 }
    ]),
    ...floorPlanData.rooms.flatMap((room) => room.polygon)
  ];

  const detailPoints: Point[] = [...planPoints];

  for (const door of floorPlanData.doors) {
    const wall = floorPlanData.walls.find((entry) => entry.id === door.wallId);
    if (!wall) {
      continue;
    }

    const center = pointOnWall(wall, door.position);
    const radiusPx = getDoorRadiusPx(door.width, safeScale);
    detailPoints.push(
      { x: center.x - radiusPx, y: center.y - radiusPx },
      { x: center.x + radiusPx, y: center.y + radiusPx }
    );
  }

  for (const windowEntry of floorPlanData.windows) {
    const wall = floorPlanData.walls.find((entry) => entry.id === windowEntry.wallId);
    if (!wall) {
      continue;
    }

    for (const segment of getWindowSegments(wall, windowEntry.position, windowEntry.width, safeScale)) {
      detailPoints.push(segment.start, segment.end);
    }
  }

  const originBounds = getBounds(planPoints.length > 0 ? planPoints : detailPoints);
  const origin = originBounds
    ? { x: originBounds.minX, y: originBounds.minY }
    : { x: 0, y: 0 };
  const mappedPoints = (detailPoints.length > 0 ? detailPoints : [origin]).map((point) =>
    toDxfPoint(point, origin, safeScale)
  );
  const mappedBounds = getBounds(
    mappedPoints.map((point) => ({ x: point.x, y: point.y }))
  ) ?? {
    minX: 0,
    maxX: 1,
    minY: -1,
    maxY: 0
  };

  const output: string[] = [];

  pushGroup(output, 999, `Generated by Fading West for ${projectName}`);
  pushGroup(output, 0, "SECTION");
  pushGroup(output, 2, "HEADER");
  pushGroup(output, 9, "$ACADVER");
  pushGroup(output, 1, "AC1015");
  pushGroup(output, 9, "$INSUNITS");
  pushGroup(output, 70, 2);
  pushGroup(output, 9, "$EXTMIN");
  pushGroup(output, 10, formatNumber(mappedBounds.minX));
  pushGroup(output, 20, formatNumber(mappedBounds.minY));
  pushGroup(output, 30, 0);
  pushGroup(output, 9, "$EXTMAX");
  pushGroup(output, 10, formatNumber(mappedBounds.maxX));
  pushGroup(output, 20, formatNumber(mappedBounds.maxY));
  pushGroup(output, 30, 0);
  pushGroup(output, 0, "ENDSEC");

  pushGroup(output, 0, "SECTION");
  pushGroup(output, 2, "ENTITIES");

  for (const wall of floorPlanData.walls) {
    addLineEntity(
      output,
      "WALLS",
      toDxfPoint({ x: wall.x1, y: wall.y1 }, origin, safeScale),
      toDxfPoint({ x: wall.x2, y: wall.y2 }, origin, safeScale)
    );
  }

  for (const room of floorPlanData.rooms) {
    addPolylineEntity(
      output,
      "ROOMS",
      room.polygon.map((point) => toDxfPoint(point, origin, safeScale))
    );
  }

  for (const door of floorPlanData.doors) {
    const wall = floorPlanData.walls.find((entry) => entry.id === door.wallId);
    if (!wall) {
      continue;
    }

    const center = pointOnWall(wall, door.position);
    addCircleEntity(
      output,
      "DOORS",
      toDxfPoint(center, origin, safeScale),
      (door.width / 12) * 0.5
    );
  }

  for (const windowEntry of floorPlanData.windows) {
    const wall = floorPlanData.walls.find((entry) => entry.id === windowEntry.wallId);
    if (!wall) {
      continue;
    }

    for (const segment of getWindowSegments(wall, windowEntry.position, windowEntry.width, safeScale)) {
      addLineEntity(
        output,
        "WINDOWS",
        toDxfPoint(segment.start, origin, safeScale),
        toDxfPoint(segment.end, origin, safeScale)
      );
    }
  }

  pushGroup(output, 0, "ENDSEC");
  pushGroup(output, 0, "EOF");

  return output.join("\n");
}
