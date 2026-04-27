"use client";

import { getWallAngle, pointOnWall, polygonCentroid } from "@/lib/geometry";
import type { FloorPlanData, Point, Wall } from "@/lib/types";

type SvgExportOptions = {
  width?: number;
  height?: number;
  showGrid?: boolean;
};

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type SvgPoint = {
  x: number;
  y: number;
};

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 900;
const WINDOW_LINE_OFFSET_FEET = 0.15;

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const rounded = Number(value.toFixed(4));
  return Object.is(rounded, -0) ? "0" : `${rounded}`;
}

function toFeet(point: Point, scale: number): SvgPoint {
  return {
    x: point.x / scale,
    y: point.y / scale
  };
}

function getBounds(points: SvgPoint[]): Bounds | null {
  if (points.length === 0) {
    return null;
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y))
  };
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

function getDoorGeometry(wall: Wall, position: number, widthInches: number, scale: number) {
  const center = pointOnWall(wall, position);
  const radiusFeet = widthInches / 24;
  const angle = (getWallAngle(wall) * Math.PI) / 180;
  const start = toFeet(center, scale);
  const closed = {
    x: start.x + Math.cos(angle) * radiusFeet,
    y: start.y + Math.sin(angle) * radiusFeet
  };
  const open = {
    x: start.x + Math.cos(angle + Math.PI / 2) * radiusFeet,
    y: start.y + Math.sin(angle + Math.PI / 2) * radiusFeet
  };

  return { center: start, closed, open, radiusFeet };
}

function buildGrid(bounds: Bounds, spacingFeet: number) {
  if (spacingFeet <= 0) {
    return "";
  }

  const lines: string[] = [];
  const startX = Math.floor(bounds.minX / spacingFeet) * spacingFeet;
  const endX = Math.ceil(bounds.maxX / spacingFeet) * spacingFeet;
  const startY = Math.floor(bounds.minY / spacingFeet) * spacingFeet;
  const endY = Math.ceil(bounds.maxY / spacingFeet) * spacingFeet;

  for (let x = startX; x <= endX; x += spacingFeet) {
    lines.push(
      `<line x1="${formatNumber(x)}" y1="${formatNumber(bounds.minY)}" x2="${formatNumber(x)}" y2="${formatNumber(bounds.maxY)}" />`
    );
  }

  for (let y = startY; y <= endY; y += spacingFeet) {
    lines.push(
      `<line x1="${formatNumber(bounds.minX)}" y1="${formatNumber(y)}" x2="${formatNumber(bounds.maxX)}" y2="${formatNumber(y)}" />`
    );
  }

  return `<g stroke="#d7dee8" stroke-width="0.03">${lines.join("")}</g>`;
}

export function generateSvg(data: FloorPlanData, options: SvgExportOptions = {}) {
  const safeScale = data.scale > 0 ? data.scale : 1;
  const roomPoints = data.rooms.flatMap((room) => room.polygon.map((point) => toFeet(point, safeScale)));
  const wallPoints = data.walls.flatMap((wall) => [
    toFeet({ x: wall.x1, y: wall.y1 }, safeScale),
    toFeet({ x: wall.x2, y: wall.y2 }, safeScale)
  ]);
  const annotationPoints = data.annotations.flatMap((annotation) => [
    toFeet(annotation.from, safeScale),
    toFeet(annotation.to, safeScale)
  ]);
  const dimensionPoints = data.dimensions.flatMap((dimension) => [
    toFeet(dimension.from, safeScale),
    toFeet(dimension.to, safeScale)
  ]);

  const bounds =
    getBounds([...roomPoints, ...wallPoints, ...annotationPoints, ...dimensionPoints]) ?? {
      minX: 0,
      maxX: 24,
      minY: 0,
      maxY: 18
    };

  const padding = 2;
  const viewBox = {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    width: Math.max(bounds.maxX - bounds.minX + padding * 2, 12),
    height: Math.max(bounds.maxY - bounds.minY + padding * 2, 12)
  };
  const aspectRatio = viewBox.width / viewBox.height;
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? (Math.round(width / aspectRatio) || DEFAULT_HEIGHT);
  const grid = options.showGrid ? buildGrid(bounds, data.gridSize / 12) : "";

  const rooms = data.rooms
    .map((room) => {
      const labelPosition = polygonCentroid(room.polygon);
      const points = room.polygon
        .map((point) => {
          const nextPoint = toFeet(point, safeScale);
          return `${formatNumber(nextPoint.x)},${formatNumber(nextPoint.y)}`;
        })
        .join(" ");
      const labelPoint = toFeet(labelPosition, safeScale);

      return [
        `<polygon points="${points}" fill="rgba(212,168,75,0.16)" stroke="#50627b" stroke-width="0.06" />`,
        `<text x="${formatNumber(labelPoint.x)}" y="${formatNumber(labelPoint.y)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="0.55" fill="#1b2a4a">${escapeXml(room.label)}</text>`,
        `<text x="${formatNumber(labelPoint.x)}" y="${formatNumber(labelPoint.y + 0.65)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="0.42" fill="#5a6c82">${escapeXml(`${room.areaSqFt} sq ft`)}</text>`
      ].join("");
    })
    .join("");

  const walls = data.walls
    .map((wall) => {
      const from = toFeet({ x: wall.x1, y: wall.y1 }, safeScale);
      const to = toFeet({ x: wall.x2, y: wall.y2 }, safeScale);

      return `<line x1="${formatNumber(from.x)}" y1="${formatNumber(from.y)}" x2="${formatNumber(to.x)}" y2="${formatNumber(to.y)}" stroke="#1b2a4a" stroke-width="${formatNumber(wall.thickness / safeScale)}" stroke-linecap="round" />`;
    })
    .join("");

  const doors = data.doors
    .map((door) => {
      const wall = data.walls.find((entry) => entry.id === door.wallId);
      if (!wall) {
        return "";
      }

      const { center, open, closed, radiusFeet } = getDoorGeometry(
        wall,
        door.position,
        door.width,
        safeScale
      );

      return [
        `<line x1="${formatNumber(center.x)}" y1="${formatNumber(center.y)}" x2="${formatNumber(open.x)}" y2="${formatNumber(open.y)}" stroke="#b58b31" stroke-width="0.08" />`,
        `<path d="M ${formatNumber(closed.x)} ${formatNumber(closed.y)} A ${formatNumber(radiusFeet)} ${formatNumber(radiusFeet)} 0 0 1 ${formatNumber(open.x)} ${formatNumber(open.y)}" fill="none" stroke="#b58b31" stroke-width="0.08" />`
      ].join("");
    })
    .join("");

  const windows = data.windows
    .map((windowEntry) => {
      const wall = data.walls.find((entry) => entry.id === windowEntry.wallId);
      if (!wall) {
        return "";
      }

      return getWindowSegments(wall, windowEntry.position, windowEntry.width, safeScale)
        .map((segment) => {
          const start = toFeet(segment.start, safeScale);
          const end = toFeet(segment.end, safeScale);
          return `<line x1="${formatNumber(start.x)}" y1="${formatNumber(start.y)}" x2="${formatNumber(end.x)}" y2="${formatNumber(end.y)}" stroke="#64748b" stroke-width="0.08" stroke-dasharray="0.28 0.18" />`;
        })
        .join("");
    })
    .join("");

  const dimensions = data.dimensions
    .map((dimension) => {
      const from = toFeet(dimension.from, safeScale);
      const to = toFeet(dimension.to, safeScale);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      const offset = 0.7;
      const normal = {
        x: -dy / length,
        y: dx / length
      };
      const fromOffset = {
        x: from.x + normal.x * offset,
        y: from.y + normal.y * offset
      };
      const toOffset = {
        x: to.x + normal.x * offset,
        y: to.y + normal.y * offset
      };
      const label = {
        x: (fromOffset.x + toOffset.x) / 2,
        y: (fromOffset.y + toOffset.y) / 2 - 0.18
      };

      return [
        `<line x1="${formatNumber(from.x)}" y1="${formatNumber(from.y)}" x2="${formatNumber(fromOffset.x)}" y2="${formatNumber(fromOffset.y)}" stroke="#8a97a8" stroke-width="0.04" />`,
        `<line x1="${formatNumber(to.x)}" y1="${formatNumber(to.y)}" x2="${formatNumber(toOffset.x)}" y2="${formatNumber(toOffset.y)}" stroke="#8a97a8" stroke-width="0.04" />`,
        `<line x1="${formatNumber(fromOffset.x)}" y1="${formatNumber(fromOffset.y)}" x2="${formatNumber(toOffset.x)}" y2="${formatNumber(toOffset.y)}" stroke="#8a97a8" stroke-width="0.05" />`,
        `<text x="${formatNumber(label.x)}" y="${formatNumber(label.y)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="0.36" fill="#64748b">${escapeXml(`${dimension.valueFt} ft`)}</text>`
      ].join("");
    })
    .join("");

  const annotations = data.annotations
    .map((annotation) => {
      const from = toFeet(annotation.from, safeScale);
      const to = toFeet(annotation.to, safeScale);

      return [
        `<line x1="${formatNumber(from.x)}" y1="${formatNumber(from.y)}" x2="${formatNumber(to.x)}" y2="${formatNumber(to.y)}" stroke="#16a34a" stroke-width="0.05" stroke-dasharray="0.25 0.15" />`,
        `<text x="${formatNumber(to.x + 0.18)}" y="${formatNumber(to.y - 0.18)}" font-family="Arial, sans-serif" font-size="0.42" fill="#166534">${escapeXml(annotation.label)}</text>`
      ].join("");
    })
    .join("");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(width)}" height="${formatNumber(height)}" viewBox="${formatNumber(viewBox.minX)} ${formatNumber(viewBox.minY)} ${formatNumber(viewBox.width)} ${formatNumber(viewBox.height)}" fill="none" preserveAspectRatio="xMidYMid meet">`,
    `<rect x="${formatNumber(viewBox.minX)}" y="${formatNumber(viewBox.minY)}" width="${formatNumber(viewBox.width)}" height="${formatNumber(viewBox.height)}" fill="#fcfcfb" />`,
    grid,
    `<g>`,
    rooms,
    walls,
    doors,
    windows,
    dimensions,
    annotations,
    `</g>`,
    `</svg>`
  ].join("");
}

export function downloadSvg(svg: string, fileName: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(objectUrl);
}
