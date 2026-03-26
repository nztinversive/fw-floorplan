"use client";

import { createId, createSeedFloorPlan, EMPTY_FLOOR_PLAN, syncDerivedData } from "@/lib/geometry";
import type { FloorPlanData, ProjectSummary, StoredFloorPlan, StoredProject } from "@/lib/types";

const STORAGE_KEY = "fw-floor-plan-studio.projects.v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readProjects(): StoredProject[] {
  if (!canUseStorage()) {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as StoredProject[];
  } catch {
    return [];
  }
}

function writeProjects(projects: StoredProject[]): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function listProjects(): ProjectSummary[] {
  return readProjects()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((project) => ({
      id: project.id,
      name: project.name,
      address: project.address,
      clientName: project.clientName,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      thumbnail: project.thumbnail,
      floorCount: project.floorPlans.length
    }));
}

export function getProject(id: string): StoredProject | null {
  return readProjects().find((project) => project.id === id) ?? null;
}

export function createProject(input: {
  name: string;
  address?: string;
  clientName?: string;
  thumbnail?: string;
  sourceImage?: string;
  floorPlanData?: FloorPlanData;
}): StoredProject {
  const timestamp = Date.now();
  const floorPlans: StoredFloorPlan[] = [
    {
      floor: 1,
      sourceImage: input.sourceImage,
      data: syncDerivedData(input.floorPlanData ?? createSeedFloorPlan(input.sourceImage).data),
      version: 1
    }
  ];

  const project: StoredProject = {
    id: createId("project"),
    name: input.name,
    address: input.address,
    clientName: input.clientName,
    createdAt: timestamp,
    updatedAt: timestamp,
    thumbnail: input.thumbnail ?? input.sourceImage,
    floorPlans
  };

  const projects = readProjects();
  projects.unshift(project);
  writeProjects(projects);
  return project;
}

export function updateProject(
  id: string,
  updates: Partial<Pick<StoredProject, "name" | "address" | "clientName" | "thumbnail">>
): StoredProject | null {
  const projects = readProjects();
  const project = projects.find((entry) => entry.id === id);
  if (!project) {
    return null;
  }

  Object.assign(project, updates, { updatedAt: Date.now() });
  writeProjects(projects);
  return project;
}

export function saveFloorPlan(
  projectId: string,
  floor: number,
  payload: { data: FloorPlanData; sourceImage?: string }
): StoredProject | null {
  const projects = readProjects();
  const project = projects.find((entry) => entry.id === projectId);
  if (!project) {
    return null;
  }

  const existing = project.floorPlans.find((entry) => entry.floor === floor);
  if (existing) {
    existing.data = syncDerivedData(payload.data);
    existing.sourceImage = payload.sourceImage ?? existing.sourceImage;
    existing.version += 1;
  } else {
    project.floorPlans.push({
      floor,
      sourceImage: payload.sourceImage,
      data: syncDerivedData(payload.data)
        ? syncDerivedData(payload.data)
        : EMPTY_FLOOR_PLAN,
      version: 1
    });
  }

  project.updatedAt = Date.now();
  if (payload.sourceImage && !project.thumbnail) {
    project.thumbnail = payload.sourceImage;
  }

  writeProjects(projects);
  return project;
}

export function removeProject(id: string): void {
  writeProjects(readProjects().filter((project) => project.id !== id));
}

