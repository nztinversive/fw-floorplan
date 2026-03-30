import type { RenderViewAngle } from "./render-angles";

export type Point = {
  x: number;
  y: number;
};

export type Wall = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
};

export type Room = {
  id: string;
  label: string;
  polygon: Point[];
  areaSqFt: number;
};

export type DoorType = "standard" | "sliding" | "double" | "garage";

export type Door = {
  id: string;
  wallId: string;
  position: number;
  width: number;
  type: DoorType;
  rotation: number;
};

export type Window = {
  id: string;
  wallId: string;
  position: number;
  width: number;
  height: number;
};

export type Furniture = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: number;
};

export type PendingFurniture = {
  type: string;
  width: number;
  depth: number;
  rotation: number;
};

export type Dimension = {
  id: string;
  from: Point;
  to: Point;
  valueFt: number;
};

export type Annotation = {
  id: string;
  from: Point;
  to: Point;
  label: string;
};

export type FloorPlanData = {
  walls: Wall[];
  rooms: Room[];
  doors: Door[];
  windows: Window[];
  dimensions: Dimension[];
  annotations: Annotation[];
  furniture: Furniture[];
  scale: number;
  gridSize: number;
};

export type RenderSettings = {
  style: string;
  sidingMaterial: string;
  roofStyle: string;
  colorPalette: string;
  landscaping: string;
  timeOfDay: string;
  season: string;
  viewAngle: RenderViewAngle;
};

export type StoredRender = {
  id: string;
  projectId: string;
  style: string;
  settings: RenderSettings;
  imageStorageId: string;
  imageUrl?: string | null;
  prompt: string;
  isFavorite: boolean;
  createdAt: number;
};

export type ProjectSummary = {
  id: string;
  name: string;
  address?: string;
  clientName?: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  floorCount: number;
};

export type StoredFloorPlan = {
  floor: number;
  sourceImage?: string;
  sourceImageUrl?: string | null;
  data: FloorPlanData;
  version: number;
};

export type PersistedFloorPlan = StoredFloorPlan & {
  _id: string;
};

export type StoredProject = {
  id: string;
  name: string;
  address?: string;
  clientName?: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  floorPlans: StoredFloorPlan[];
};
