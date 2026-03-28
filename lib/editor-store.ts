"use client";

import { create } from "zustand";

import {
  calculateRoomAreaSqFt,
  cloneFloorPlanData,
  createId,
  EMPTY_FLOOR_PLAN,
  findNearestWall,
  moveRoomsWithWall,
  pointOnWall,
  projectPointToWall,
  roomTouchesWall,
  snapPoint,
  syncDerivedData
} from "@/lib/geometry";
import type { Door, FloorPlanData, Point, Room, Wall, Window } from "@/lib/types";

export type EditorTool = "select" | "wall" | "room" | "door" | "window";

const DUPLICATE_OFFSET = { x: 20, y: 20 };

type EditorStore = {
  floorPlanData: FloorPlanData;
  selectedIds: string[];
  actionError: string | null;
  tool: EditorTool;
  history: FloorPlanData[];
  historyIndex: number;
  zoom: number;
  pan: Point;
  pendingWallStart: Point | null;
  pendingRoomPoints: Point[];
  setFloorPlanData: (data: FloorPlanData, resetHistory?: boolean) => void;
  setSelectedIds: (ids: string[]) => void;
  toggleSelectedId: (id: string) => void;
  clearSelection: () => void;
  clearActionError: () => void;
  setTool: (tool: EditorTool) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  setPendingWallStart: (point: Point | null) => void;
  setPendingRoomPoints: (points: Point[]) => void;
  addWall: (wall: Omit<Wall, "id">) => void;
  addRoom: (room: Omit<Room, "id" | "areaSqFt">) => void;
  addDoor: (door: Omit<Door, "id">) => void;
  addWindow: (window: Omit<Window, "id">) => void;
  moveElement: (id: string, delta: Point) => void;
  updateElement: (id: string, patch: Record<string, number | string>) => void;
  deleteElement: (id: string | string[]) => void;
  duplicateSelected: () => void;
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
  selectedIds: [],
  actionError: null,
  tool: "select",
  history: [cloneFloorPlanData(EMPTY_FLOOR_PLAN)],
  historyIndex: 0,
  zoom: 1,
  pan: { x: 0, y: 0 },
  pendingWallStart: null,
  pendingRoomPoints: [],
  setFloorPlanData: (data, resetHistory = false) =>
    set(() => {
      const synced = syncDerivedData(data);
      return resetHistory
        ? {
            floorPlanData: synced,
            history: [cloneFloorPlanData(synced)],
            historyIndex: 0,
            selectedIds: [],
            actionError: null,
            pendingWallStart: null,
            pendingRoomPoints: []
          }
        : {
            floorPlanData: synced,
            actionError: null,
            ...pushHistory(get().history, get().historyIndex, synced)
          };
    }),
  setSelectedIds: (ids) => set({ selectedIds: [...new Set(ids)], actionError: null }),
  toggleSelectedId: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedIds, id],
      actionError: null
    })),
  clearSelection: () => set({ selectedIds: [], actionError: null }),
  clearActionError: () => set({ actionError: null }),
  setTool: (tool) =>
    set({
      tool,
      pendingWallStart: null,
      pendingRoomPoints: [],
      actionError: null
    }),
  setZoom: (zoom) => set({ zoom }),
  setPan: (pan) => set({ pan }),
  setPendingWallStart: (point) => set({ pendingWallStart: point }),
  setPendingRoomPoints: (points) => set({ pendingRoomPoints: points }),
  addWall: (wall) =>
    set((state) => {
      const wallId = createId("wall");
      const next = updateState(state.floorPlanData, (draft) => {
        draft.walls.push({ id: wallId, ...wall });
        return draft;
      });
      return {
        floorPlanData: next,
        actionError: null,
        selectedIds: [wallId],
        pendingWallStart: { x: wall.x2, y: wall.y2 },
        tool: state.tool,
        ...pushHistory(state.history, state.historyIndex, next)
      };
    }),
  addRoom: (room) =>
    set((state) => {
      const next = updateState(state.floorPlanData, (draft) => {
        const nextRoom = {
          id: createId("room"),
          ...room,
          areaSqFt: 0
        };
        nextRoom.areaSqFt = calculateRoomAreaSqFt(nextRoom, draft.scale);
        draft.rooms.push(nextRoom);
        return draft;
      });

      return {
        floorPlanData: next,
        actionError: null,
        selectedIds: next.rooms.at(-1)?.id ? [next.rooms.at(-1)!.id] : [],
        pendingRoomPoints: [],
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
        actionError: null,
        selectedIds: next.doors.at(-1)?.id ? [next.doors.at(-1)!.id] : [],
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
        actionError: null,
        selectedIds: next.windows.at(-1)?.id ? [next.windows.at(-1)!.id] : [],
        tool: "select",
        ...pushHistory(state.history, state.historyIndex, next)
      };
    }),
  moveElement: (id, delta) =>
    set((state) => {
      const next = updateState(state.floorPlanData, (draft) => {
        const wall = draft.walls.find((entry) => entry.id === id);
        if (wall) {
          const previousWall = { ...wall };
          wall.x1 += delta.x;
          wall.y1 += delta.y;
          wall.x2 += delta.x;
          wall.y2 += delta.y;
          draft.rooms = moveRoomsWithWall(draft.rooms, previousWall, wall);
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
        actionError: null,
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
            if (draft.walls.includes(item as Wall)) {
              const wall = item as Wall;
              const previousWall = { ...wall };
              Object.assign(wall, patch as Partial<Wall>);
              draft.rooms = moveRoomsWithWall(draft.rooms, previousWall, wall);
              break;
            }

            Object.assign(item, patch);
            break;
          }
        }
        return draft;
      });

      return {
        floorPlanData: next,
        actionError: null,
        ...pushHistory(state.history, state.historyIndex, next)
      };
    }),
  deleteElement: (id) =>
    set((state) => {
      const ids = Array.isArray(id) ? id : [id];
      const uniqueIds = [...new Set(ids)];
      const idsToDelete = new Set(uniqueIds);
      const removedWalls = state.floorPlanData.walls.filter((entry) => idsToDelete.has(entry.id));
      const remainingRooms = state.floorPlanData.rooms.filter((entry) => !idsToDelete.has(entry.id));

      if (
        removedWalls.some((removedWall) =>
          remainingRooms.some((entry) => roomTouchesWall(entry, removedWall))
        )
      ) {
        return {
          actionError:
            "Delete or redraw the affected rooms before removing that wall."
        };
      }

      const next = updateState(state.floorPlanData, (draft) => {
        const removedWallIds = new Set(
          draft.walls.filter((entry) => idsToDelete.has(entry.id)).map((entry) => entry.id)
        );
        draft.walls = draft.walls.filter((entry) => !idsToDelete.has(entry.id));
        draft.rooms = draft.rooms.filter((entry) => !idsToDelete.has(entry.id));
        draft.doors = draft.doors.filter(
          (entry) => !idsToDelete.has(entry.id) && !removedWallIds.has(entry.wallId)
        );
        draft.windows = draft.windows.filter(
          (entry) => !idsToDelete.has(entry.id) && !removedWallIds.has(entry.wallId)
        );
        draft.furniture = draft.furniture.filter((entry) => !idsToDelete.has(entry.id));
        return draft;
      });

      return {
        floorPlanData: next,
        actionError: null,
        selectedIds: [],
        ...pushHistory(state.history, state.historyIndex, next)
      };
    }),
  duplicateSelected: () =>
    set((state) => {
      if (state.selectedIds.length === 0) {
        return state;
      }

      const next = updateState(state.floorPlanData, (draft) => {
        const selectedIds = new Set(state.selectedIds);
        const wallIdMap = new Map<string, string>();
        const duplicatedWalls = draft.walls
          .filter((entry) => selectedIds.has(entry.id))
          .map((wall) => {
            const nextId = createId("wall");
            wallIdMap.set(wall.id, nextId);
            return {
              ...wall,
              id: nextId,
              x1: wall.x1 + DUPLICATE_OFFSET.x,
              y1: wall.y1 + DUPLICATE_OFFSET.y,
              x2: wall.x2 + DUPLICATE_OFFSET.x,
              y2: wall.y2 + DUPLICATE_OFFSET.y
            };
          });
        const duplicatedRooms = draft.rooms
          .filter((entry) => selectedIds.has(entry.id))
          .map((room) => ({
            ...room,
            id: createId("room"),
            polygon: room.polygon.map((point) => ({
              x: point.x + DUPLICATE_OFFSET.x,
              y: point.y + DUPLICATE_OFFSET.y
            }))
          }));
        const duplicatedDoors = draft.doors
          .filter((entry) => selectedIds.has(entry.id))
          .map((door) => {
            const originalWall = draft.walls.find((entry) => entry.id === door.wallId) ?? null;
            const targetWallId = wallIdMap.get(door.wallId) ?? door.wallId;
            const targetWall =
              duplicatedWalls.find((entry) => entry.id === targetWallId) ??
              draft.walls.find((entry) => entry.id === targetWallId) ??
              originalWall;
            const originalCenter = originalWall ? pointOnWall(originalWall, door.position) : null;
            const projected =
              targetWall && originalCenter
                ? projectPointToWall(targetWall, {
                    x: originalCenter.x + DUPLICATE_OFFSET.x,
                    y: originalCenter.y + DUPLICATE_OFFSET.y
                  })
                : null;

            return {
              ...door,
              id: createId("door"),
              wallId: targetWallId,
              position: projected?.ratio ?? door.position
            };
          });
        const duplicatedWindows = draft.windows
          .filter((entry) => selectedIds.has(entry.id))
          .map((window) => {
            const originalWall = draft.walls.find((entry) => entry.id === window.wallId) ?? null;
            const targetWallId = wallIdMap.get(window.wallId) ?? window.wallId;
            const targetWall =
              duplicatedWalls.find((entry) => entry.id === targetWallId) ??
              draft.walls.find((entry) => entry.id === targetWallId) ??
              originalWall;
            const originalCenter = originalWall ? pointOnWall(originalWall, window.position) : null;
            const projected =
              targetWall && originalCenter
                ? projectPointToWall(targetWall, {
                    x: originalCenter.x + DUPLICATE_OFFSET.x,
                    y: originalCenter.y + DUPLICATE_OFFSET.y
                  })
                : null;

            return {
              ...window,
              id: createId("window"),
              wallId: targetWallId,
              position: projected?.ratio ?? window.position
            };
          });
        const duplicatedFurniture = draft.furniture
          .filter((entry) => selectedIds.has(entry.id))
          .map((item) => ({
            ...item,
            id: createId("furniture"),
            x: item.x + DUPLICATE_OFFSET.x,
            y: item.y + DUPLICATE_OFFSET.y
          }));

        draft.walls.push(...duplicatedWalls);
        draft.rooms.push(...duplicatedRooms);
        draft.doors.push(...duplicatedDoors);
        draft.windows.push(...duplicatedWindows);
        draft.furniture.push(...duplicatedFurniture);
        return draft;
      });

      const duplicatedSelection = [
        ...next.walls.filter((entry) => !state.floorPlanData.walls.some((wall) => wall.id === entry.id)).map((entry) => entry.id),
        ...next.rooms.filter((entry) => !state.floorPlanData.rooms.some((room) => room.id === entry.id)).map((entry) => entry.id),
        ...next.doors.filter((entry) => !state.floorPlanData.doors.some((door) => door.id === entry.id)).map((entry) => entry.id),
        ...next.windows.filter((entry) => !state.floorPlanData.windows.some((window) => window.id === entry.id)).map((entry) => entry.id),
        ...next.furniture.filter((entry) => !state.floorPlanData.furniture.some((item) => item.id === entry.id)).map((entry) => entry.id)
      ];

      return {
        floorPlanData: next,
        actionError: null,
        selectedIds: duplicatedSelection,
        ...pushHistory(state.history, state.historyIndex, next)
      };
    }),
  undo: () =>
    set((state) => {
      const nextIndex = Math.max(0, state.historyIndex - 1);
      return {
        floorPlanData: cloneFloorPlanData(state.history[nextIndex]),
        historyIndex: nextIndex,
        actionError: null,
        selectedIds: [],
        pendingWallStart: null,
        pendingRoomPoints: []
      };
    }),
  redo: () =>
    set((state) => {
      const nextIndex = Math.min(state.history.length - 1, state.historyIndex + 1);
      return {
        floorPlanData: cloneFloorPlanData(state.history[nextIndex]),
        historyIndex: nextIndex,
        actionError: null,
        selectedIds: [],
        pendingWallStart: null,
        pendingRoomPoints: []
      };
    })
}));

