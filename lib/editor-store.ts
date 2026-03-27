"use client";

import { create } from "zustand";

import {
  cloneFloorPlanData,
  createId,
  EMPTY_FLOOR_PLAN,
  findNearestWall,
  pointOnWall,
  projectPointToWall,
  snapPoint,
  syncDerivedData
} from "@/lib/geometry";
import type { Door, FloorPlanData, Point, Wall, Window } from "@/lib/types";

type EditorTool = "select" | "wall" | "door" | "window";

type EditorStore = {
  floorPlanData: FloorPlanData;
  selectedId: string | null;
  tool: EditorTool;
  history: FloorPlanData[];
  historyIndex: number;
  zoom: number;
  pan: Point;
  pendingWallStart: Point | null;
  setFloorPlanData: (data: FloorPlanData, resetHistory?: boolean) => void;
  setSelectedId: (id: string | null) => void;
  setTool: (tool: EditorTool) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  setPendingWallStart: (point: Point | null) => void;
  addWall: (wall: Omit<Wall, "id">) => void;
  addDoor: (door: Omit<Door, "id">) => void;
  addWindow: (window: Omit<Window, "id">) => void;
  moveElement: (id: string, delta: Point) => void;
  updateElement: (id: string, patch: Record<string, number | string>) => void;
  deleteElement: (id: string) => void;
  undo: () => void;
  redo: () => void;
};

function pushHistory(
  history: FloorPlanData[],
  historyIndex: number,
  data: FloorPlanData
): { history: FloorPlanData[]; historyIndex: number } {
  const nextHistory = history.slice(0, historyIndex + 1);
  nextHistory.push(cloneFloorPlanData(data));
  if (nextHistory.length > 60) {
    nextHistory.shift();
  }
  return {
    history: nextHistory,
    historyIndex: nextHistory.length - 1
  };
}

function updateState(
  current: FloorPlanData,
  recipe: (draft: FloorPlanData) => FloorPlanData
): FloorPlanData {
  return syncDerivedData(recipe(cloneFloorPlanData(current)));
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  floorPlanData: cloneFloorPlanData(EMPTY_FLOOR_PLAN),
  selectedId: null,
  tool: "select",
  history: [cloneFloorPlanData(EMPTY_FLOOR_PLAN)],
  historyIndex: 0,
  zoom: 1,
  pan: { x: 0, y: 0 },
  pendingWallStart: null,
  setFloorPlanData: (data, resetHistory = false) =>
    set(() => {
      const synced = syncDerivedData(data);
      return resetHistory
        ? {
            floorPlanData: synced,
            history: [cloneFloorPlanData(synced)],
            historyIndex: 0,
            selectedId: null,
            pendingWallStart: null
          }
        : {
            floorPlanData: synced,
            ...pushHistory(get().history, get().historyIndex, synced)
          };
    }),
  setSelectedId: (id) => set({ selectedId: id }),
  setTool: (tool) => set({ tool, pendingWallStart: null }),
  setZoom: (zoom) => set({ zoom }),
  setPan: (pan) => set({ pan }),
  setPendingWallStart: (point) => set({ pendingWallStart: point }),
  addWall: (wall) =>
    set((state) => {
      const next = updateState(state.floorPlanData, (draft) => {
        draft.walls.push({ id: createId("wall"), ...wall });
        return draft;
      });
      return {
        floorPlanData: next,
        selectedId: next.walls.at(-1)?.id ?? null,
        pendingWallStart: null,
        tool: "select",
        ...pushHistory(state.history, state.historyIndex, next)
      };
    }),
  addDoor: (door) =>
    set((state) => {
      const next = updateState(state.floorPlanData, (draft) => {
        draft.doors.push({ id: createId("door"), ...door });
        return draft;
      });
      return {
        floorPlanData: next,
        selectedId: next.doors.at(-1)?.id ?? null,
        tool: "select",
        ...pushHistory(state.history, state.historyIndex, next)
      };
    }),
  addWindow: (window) =>
    set((state) => {
      const next = updateState(state.floorPlanData, (draft) => {
        draft.windows.push({ id: createId("window"), ...window });
        return draft;
      });
      return {
        floorPlanData: next,
        selectedId: next.windows.at(-1)?.id ?? null,
        tool: "select",
        ...pushHistory(state.history, state.historyIndex, next)
      };
    }),
  moveElement: (id, delta) =>
    set((state) => {
      const next = updateState(state.floorPlanData, (draft) => {
        const wall = draft.walls.find((entry) => entry.id === id);
        if (wall) {
          wall.x1 += delta.x;
          wall.y1 += delta.y;
          wall.x2 += delta.x;
          wall.y2 += delta.y;
          return draft;
        }

        const room = draft.rooms.find((entry) => entry.id === id);
        if (room) {
          room.polygon = room.polygon.map((point) => ({
            x: point.x + delta.x,
            y: point.y + delta.y
          }));
          return draft;
        }

        const door = draft.doors.find((entry) => entry.id === id);
        if (door) {
          const hostWall = draft.walls.find((entry) => entry.id === door.wallId);
          if (hostWall) {
            const currentPoint = pointOnWall(hostWall, door.position);
            const projected = projectPointToWall(hostWall, {
              x: currentPoint.x + delta.x,
              y: currentPoint.y + delta.y
            });
            door.position = projected.ratio;
            door.rotation = 0;
          }
          return draft;
        }

        const window = draft.windows.find((entry) => entry.id === id);
        if (window) {
          const hostWall = draft.walls.find((entry) => entry.id === window.wallId);
          if (hostWall) {
            const currentPoint = pointOnWall(hostWall, window.position);
            const projected = projectPointToWall(hostWall, {
              x: currentPoint.x + delta.x,
              y: currentPoint.y + delta.y
            });
            window.position = projected.ratio;
          }
          return draft;
        }

        return draft;
      });

      return {
        floorPlanData: next,
        ...pushHistory(state.history, state.historyIndex, next)
      };
    }),
  updateElement: (id, patch) =>
    set((state) => {
      const next = updateState(state.floorPlanData, (draft) => {
        const collections = [draft.walls, draft.rooms, draft.doors, draft.windows, draft.furniture];
        for (const collection of collections) {
          const item = collection.find((entry) => entry.id === id);
          if (item) {
            Object.assign(item, patch);
            break;
          }
        }
        return draft;
      });

      return {
        floorPlanData: next,
        ...pushHistory(state.history, state.historyIndex, next)
      };
    }),
  deleteElement: (id) =>
    set((state) => {
      const next = updateState(state.floorPlanData, (draft) => {
        const isWall = draft.walls.some((entry) => entry.id === id);
        draft.walls = draft.walls.filter((entry) => entry.id !== id);
        draft.rooms = draft.rooms.filter((entry) => entry.id !== id);
        draft.doors = draft.doors.filter(
          (entry) => entry.id !== id && (!isWall || entry.wallId !== id)
        );
        draft.windows = draft.windows.filter(
          (entry) => entry.id !== id && (!isWall || entry.wallId !== id)
        );
        draft.furniture = draft.furniture.filter((entry) => entry.id !== id);
        return draft;
      });

      return {
        floorPlanData: next,
        selectedId: null,
        ...pushHistory(state.history, state.historyIndex, next)
      };
    }),
  undo: () =>
    set((state) => {
      const nextIndex = Math.max(0, state.historyIndex - 1);
      return {
        floorPlanData: cloneFloorPlanData(state.history[nextIndex]),
        historyIndex: nextIndex,
        selectedId: null,
        pendingWallStart: null
      };
    }),
  redo: () =>
    set((state) => {
      const nextIndex = Math.min(state.history.length - 1, state.historyIndex + 1);
      return {
        floorPlanData: cloneFloorPlanData(state.history[nextIndex]),
        historyIndex: nextIndex,
        selectedId: null,
        pendingWallStart: null
      };
    })
}));

export type { EditorTool };

