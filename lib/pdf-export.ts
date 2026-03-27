"use client";

import jsPDF from "jspdf";

import { formatFloorLabel } from "@/lib/floor-utils";
import {
  DEFAULT_RENDER_VIEW_ANGLE,
  RENDER_VIEW_ANGLE_LABELS,
  type RenderViewAngle
} from "@/lib/render-angles";
import { getWallAngle, pointOnWall, polygonCentroid } from "@/lib/geometry";
import { STYLE_PRESET_MAP } from "@/lib/style-presets";
import type { FloorPlanData, RenderSettings } from "@/lib/types";

const FW_NAVY = "#1B2A4A";
const FW_AMBER = "#D4A84B";
const FW_SLATE = "#64748B";
const FW_BORDER = "#D7DEE8";
const ROOM_COLORS = ["rgba(212, 168, 75, 0.18)", "rgba(100, 116, 139, 0.12)", "rgba(27, 42, 74, 0.08)"];

type FloorPlanStats = {
  roomCount: number;
  wallCount: number;
};

type ClientPackageFloorPlan = {
  floor: number;
  image: string;
  stats?: FloorPlanStats;
};

type ClientPackageRender = {
  imageUrl?: string | null;
  style: string;
  viewAngle?: RenderViewAngle;
  settings: RenderSettings;
};

type ClientPackageOptions = {
  projectName: string;
  address?: string;
  clientName?: string;
  floorPlans: ClientPackageFloorPlan[];
  renders: ClientPackageRender[];
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

function getContentBounds(data: FloorPlanData): Bounds | null {
  const points = [
    ...data.walls.flatMap((wall) => [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 }
    ]),
    ...data.rooms.flatMap((room) => room.polygon)
  ];

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

function humanize(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getStyleLabel(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? humanize(style);
}

function getViewAngleLabel(viewAngle: RenderViewAngle) {
  return RENDER_VIEW_ANGLE_LABELS[viewAngle] ?? humanize(viewAngle);
}

function sanitizeFileName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "fw-client-package"
  );
}

function getImageFormat(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/i)?.[1]?.toUpperCase();

  if (!match || match === "JPG") {
    return "JPEG";
  }

  if (match === "SVG+XML") {
    return "PNG";
  }

  return match;
}

function formatDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(date);
}

function formatSettingsSummary(settings: RenderSettings) {
  return [
    `Siding: ${humanize(settings.sidingMaterial)}`,
    `Roof: ${humanize(settings.roofStyle)}`,
    `Palette: ${humanize(settings.colorPalette)}`,
    `Landscape: ${humanize(settings.landscaping)}`,
    `Light: ${humanize(settings.timeOfDay)}`,
    `Season: ${humanize(settings.season)}`
  ];
}

function drawWrappedText(pdf: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const lines = pdf.splitTextToSize(text, maxWidth);
  pdf.text(lines, x, y, { align: "center" });
  return y + lines.length * lineHeight;
}

function fitRect(imageWidth: number, imageHeight: number, frame: Rect) {
  const scale = Math.min(frame.width / imageWidth, frame.height / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return {
    width,
    height,
    x: frame.x + (frame.width - width) / 2,
    y: frame.y + (frame.height - height) / 2
  };
}

function addAccentRule(pdf: jsPDF, x: number, y: number, width: number) {
  pdf.setDrawColor(FW_AMBER);
  pdf.setLineWidth(2);
  pdf.line(x, y, x + width, y);
}

function addImageContained(pdf: jsPDF, dataUrl: string, frame: Rect) {
  const image = pdf.getImageProperties(dataUrl);
  const box = fitRect(image.width, image.height, frame);
  pdf.addImage(dataUrl, getImageFormat(dataUrl), box.x, box.y, box.width, box.height);
}

function addPageNumber(pdf: jsPDF, pageWidth: number, pageHeight: number, pageNumber: number) {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(FW_SLATE);
  pdf.text(`Page ${pageNumber}`, pageWidth - 44, pageHeight - 24, { align: "right" });
}

function loadImageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image."));
    image.src = url;
  });
}

async function blobToPngDataUrl(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await loadImageFromUrl(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to create a canvas context.");
    }

    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function imageUrlToDataUrl(url?: string | null) {
  if (!url) {
    return null;
  }

  if (url.startsWith("data:")) {
    return url;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to fetch image: ${response.status}`);
  }

  return await blobToPngDataUrl(await response.blob());
}

export function generateFloorPlanPreview(data: FloorPlanData) {
  const canvas = document.createElement("canvas");
  canvas.width = 1800;
  canvas.height = 1100;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create a floor plan preview.");
  }

  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const bounds = getContentBounds(data);
  if (!bounds) {
    context.fillStyle = FW_NAVY;
    context.font = "600 40px Arial";
    context.textAlign = "center";
    context.fillText("No floor plan data available", canvas.width / 2, canvas.height / 2);

    return {
      dataUrl: canvas.toDataURL("image/png"),
      roomCount: 0,
      wallCount: 0
    };
  }

  const padding = 80;
  const contentWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const contentHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min(
    (canvas.width - padding * 2) / contentWidth,
    (canvas.height - padding * 2) / contentHeight
  );
  const offsetX = (canvas.width - contentWidth * scale) / 2 - bounds.minX * scale;
  const offsetY = (canvas.height - contentHeight * scale) / 2 - bounds.minY * scale;

  const mapPoint = (x: number, y: number) => ({
    x: offsetX + x * scale,
    y: offsetY + y * scale
  });

  context.strokeStyle = FW_BORDER;
  context.lineWidth = 2;
  context.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  data.rooms.forEach((room, index) => {
    if (room.polygon.length === 0) {
      return;
    }

    context.beginPath();
    room.polygon.forEach((point, pointIndex) => {
      const mapped = mapPoint(point.x, point.y);
      if (pointIndex === 0) {
        context.moveTo(mapped.x, mapped.y);
      } else {
        context.lineTo(mapped.x, mapped.y);
      }
    });
    context.closePath();
    context.fillStyle = ROOM_COLORS[index % ROOM_COLORS.length];
    context.fill();
    context.strokeStyle = "rgba(27, 42, 74, 0.22)";
    context.lineWidth = 2;
    context.stroke();

    const centroid = polygonCentroid(room.polygon);
    const mappedCentroid = mapPoint(centroid.x, centroid.y);

    context.fillStyle = FW_NAVY;
    context.textAlign = "center";
    context.font = "600 22px Arial";
    context.fillText(room.label, mappedCentroid.x, mappedCentroid.y - 4);
    context.font = "16px Arial";
    context.fillText(`${Math.round(room.areaSqFt)} sq ft`, mappedCentroid.x, mappedCentroid.y + 20);
  });

  data.walls.forEach((wall) => {
    const start = mapPoint(wall.x1, wall.y1);
    const end = mapPoint(wall.x2, wall.y2);

    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.strokeStyle = FW_NAVY;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = Math.max(3, wall.thickness * scale);
    context.stroke();
  });

  data.doors.forEach((door) => {
    const wall = data.walls.find((entry) => entry.id === door.wallId);
    if (!wall) {
      return;
    }

    const center = pointOnWall(wall, door.position);
    const mappedCenter = mapPoint(center.x, center.y);
    const radius = Math.max(12, (door.width / 12) * data.scale * 0.5 * scale);
    const rotation = ((getWallAngle(wall) - 45) * Math.PI) / 180;

    context.beginPath();
    context.strokeStyle = FW_AMBER;
    context.lineWidth = 4;
    context.arc(mappedCenter.x, mappedCenter.y, radius, rotation, rotation + Math.PI / 2);
    context.stroke();
  });

  data.windows.forEach((windowEntry) => {
    const wall = data.walls.find((entry) => entry.id === windowEntry.wallId);
    if (!wall) {
      return;
    }

    const center = pointOnWall(wall, windowEntry.position);
    const mappedCenter = mapPoint(center.x, center.y);
    const width = Math.max(20, (windowEntry.width / 12) * data.scale * scale);
    const angle = (getWallAngle(wall) * Math.PI) / 180;
    const offsetXAlong = Math.cos(angle) * (width / 2);
    const offsetYAlong = Math.sin(angle) * (width / 2);
    const offsetXPerp = Math.cos(angle + Math.PI / 2) * 6;
    const offsetYPerp = Math.sin(angle + Math.PI / 2) * 6;

    context.strokeStyle = FW_SLATE;
    context.lineWidth = 4;

    context.beginPath();
    context.moveTo(
      mappedCenter.x - offsetXAlong - offsetXPerp,
      mappedCenter.y - offsetYAlong - offsetYPerp
    );
    context.lineTo(
      mappedCenter.x + offsetXAlong - offsetXPerp,
      mappedCenter.y + offsetYAlong - offsetYPerp
    );
    context.stroke();

    context.beginPath();
    context.moveTo(
      mappedCenter.x - offsetXAlong + offsetXPerp,
      mappedCenter.y - offsetYAlong + offsetYPerp
    );
    context.lineTo(
      mappedCenter.x + offsetXAlong + offsetXPerp,
      mappedCenter.y + offsetYAlong + offsetYPerp
    );
    context.stroke();
  });

  return {
    dataUrl: canvas.toDataURL("image/png"),
    roomCount: data.rooms.length,
    wallCount: data.walls.length
  };
}

export async function generateClientPackage({
  projectName,
  address,
  clientName,
  floorPlans,
  renders
}: ClientPackageOptions) {
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "letter",
    compress: true
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 44;
  const generatedAt = new Date();
  const dateLabel = formatDateLabel(generatedAt);

  const renderImages = await Promise.all(
    renders.map(async (render) => {
      try {
        return {
          ...render,
          imageDataUrl: await imageUrlToDataUrl(render.imageUrl)
        };
      } catch (error) {
        console.error("Unable to prepare render image for PDF export.", error);
        return {
          ...render,
          imageDataUrl: null
        };
      }
    })
  );

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");

  pdf.setFillColor(FW_AMBER);
  pdf.roundedRect(margin, 34, 64, 64, 12, 12, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(28);
  pdf.text("FW", margin + 32, 76, { align: "center" });

  pdf.setTextColor(FW_NAVY);
  pdf.setFontSize(28);
  pdf.text("Fading West", margin + 84, 75);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(14);
  pdf.setTextColor(FW_SLATE);
  pdf.text("Floor Plan Studio - Client Presentation", pageWidth / 2, 176, { align: "center" });

  pdf.setTextColor(FW_NAVY);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(28);
  const coverTitleY = drawWrappedText(pdf, projectName, pageWidth / 2, 280, 420, 34);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(15);
  pdf.setTextColor(FW_SLATE);
  const coverDetails = [address, clientName ? `Client: ${clientName}` : undefined].filter(Boolean) as string[];

  if (coverDetails.length > 0) {
    pdf.text(coverDetails, pageWidth / 2, coverTitleY + 12, { align: "center" });
  }

  addAccentRule(pdf, pageWidth / 2 - 120, 214, 240);

  pdf.setFontSize(12);
  pdf.text(dateLabel, pageWidth / 2, pageHeight - 42, { align: "center" });

  let pageNumber = 2;

  floorPlans.forEach((floorPlan) => {
    pdf.addPage();
    pdf.setTextColor(FW_NAVY);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.text(formatFloorLabel(floorPlan.floor), margin, 52);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    pdf.setTextColor(FW_SLATE);
    pdf.text(projectName, margin, 72);
    addAccentRule(pdf, margin, 84, 160);

    const floorPlanFrame = {
      x: margin,
      y: 106,
      width: pageWidth - margin * 2,
      height: pageHeight - 196
    };

    pdf.setDrawColor(FW_BORDER);
    pdf.roundedRect(
      floorPlanFrame.x,
      floorPlanFrame.y,
      floorPlanFrame.width,
      floorPlanFrame.height,
      12,
      12
    );

    addImageContained(pdf, floorPlan.image, {
      x: floorPlanFrame.x + 12,
      y: floorPlanFrame.y + 12,
      width: floorPlanFrame.width - 24,
      height: floorPlanFrame.height - 24
    });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(FW_NAVY);
    const roomCountLabel = floorPlan.stats
      ? `${floorPlan.stats.roomCount} room${floorPlan.stats.roomCount === 1 ? "" : "s"}`
      : "Room count unavailable";
    const wallCountLabel = floorPlan.stats
      ? `${floorPlan.stats.wallCount} wall${floorPlan.stats.wallCount === 1 ? "" : "s"}`
      : "Wall count unavailable";
    pdf.text(`${roomCountLabel}   |   ${wallCountLabel}`, margin, pageHeight - 34);
    addPageNumber(pdf, pageWidth, pageHeight, pageNumber);
    pageNumber += 1;
  });

  renderImages.forEach((render) => {
    pdf.addPage();

    const resolvedViewAngle = render.viewAngle ?? render.settings.viewAngle ?? DEFAULT_RENDER_VIEW_ANGLE;

    pdf.setTextColor(FW_NAVY);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.text(`${getStyleLabel(render.style)} - ${getViewAngleLabel(resolvedViewAngle)}`, margin, 52);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    pdf.setTextColor(FW_SLATE);
    pdf.text(projectName, margin, 72);
    addAccentRule(pdf, margin, 84, 240);

    const renderFrame = {
      x: margin,
      y: 102,
      width: pageWidth - margin * 2,
      height: 356
    };

    pdf.setDrawColor(FW_BORDER);
    pdf.roundedRect(renderFrame.x, renderFrame.y, renderFrame.width, renderFrame.height, 12, 12);

    if (render.imageDataUrl) {
      addImageContained(pdf, render.imageDataUrl, {
        x: renderFrame.x + 10,
        y: renderFrame.y + 10,
        width: renderFrame.width - 20,
        height: renderFrame.height - 20
      });
    } else {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(16);
      pdf.setTextColor(FW_SLATE);
      pdf.text(
        "Render image unavailable for this page",
        pageWidth / 2,
        renderFrame.y + renderFrame.height / 2,
        { align: "center" }
      );
    }

    const settingsSummary = formatSettingsSummary(render.settings);
    pdf.setTextColor(FW_NAVY);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("Settings", margin, 494);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text(settingsSummary.slice(0, 3), margin, 518);
    pdf.text(settingsSummary.slice(3), pageWidth / 2, 518);

    addPageNumber(pdf, pageWidth, pageHeight, pageNumber);
    pageNumber += 1;
  });

  pdf.addPage();
  pdf.setTextColor(FW_NAVY);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.text("Prepared by Fading West", pageWidth / 2, 254, { align: "center" });
  addAccentRule(pdf, pageWidth / 2 - 120, 278, 240);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(14);
  pdf.setTextColor(FW_SLATE);
  pdf.text("fw-floorplan.onrender.com", pageWidth / 2, 316, { align: "center" });
  pdf.text(`Date generated: ${dateLabel}`, pageWidth / 2, 342, { align: "center" });
  addPageNumber(pdf, pageWidth, pageHeight, pageNumber);

  const fileName = `${sanitizeFileName(projectName)}-client-package.pdf`;
  pdf.save(fileName);
}
