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

export type CommentStatus = "open" | "in_progress" | "resolved";

export type ProjectCommentReply = {
  _id: string;
  projectId: string;
  commentId: string;
  authorName: string;
  text: string;
  createdAt: number;
};

export type ProjectComment = {
  _id: string;
  projectId: string;
  floorPlanId?: string;
  x: number;
  y: number;
  authorName: string;
  text: string;
  status: CommentStatus;
  createdAt: number;
  resolvedAt?: number;
  replies?: ProjectCommentReply[];
};

export type ProjectMemberRole = "owner" | "editor" | "viewer";

export type ProjectMember = {
  _id: string;
  projectId: string;
  email: string;
  role: ProjectMemberRole;
  invitedAt: number;
  acceptedAt?: number;
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

export type RenderBrief = {
  designNotes: string;
  mustHave: string;
  avoid: string;
  revisionNotes: string;
};

export type StoredRenderReview = {
  id: string;
  projectId: string;
  renderId: string;
  issueKeys: string[];
  notes: string;
  authorEmail?: string;
  createdAt: number;
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
  parentRenderId?: string;
  sourceReviewId?: string;
  sourceReview?: StoredRenderReview | null;
  reviewHistory: StoredRenderReview[];
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

export type StoredFloorPlanVersion = {
  id: string;
  projectId: string;
  floor: number;
  name: string;
  data: FloorPlanData;
  createdAt: number;
};

export type StoredRenderPreset = {
  id: string;
  projectId: string;
  name: string;
  style: string;
  viewAngle: RenderViewAngle;
  settings: RenderSettings;
  createdAt: number;
};

export type StoredProject = {
  id: string;
  name: string;
  address?: string;
  clientName?: string;
  ownerEmail?: string;
  renderBrief?: RenderBrief;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  floorPlans: StoredFloorPlan[];
};
