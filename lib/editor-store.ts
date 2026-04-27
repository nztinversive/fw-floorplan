"use client";

import { create } from "zustand";

import {
  calculateRoomAreaSqFt,
  cloneFloorPlanData,
  createId,
  detectClosedRooms,
  EMPTY_FLOOR_PLAN,
  formatFeetInches,
  moveRoomsWithWall,
  pointDistance,
  pointOnWall,
  projectPointToWall,
  roomTouchesWall,
  syncDerivedData
} from "@/lib/geometry";
import type {
  Door,
  FloorPlanData,
  Furniture,
  PendingFurniture,
  Point,
  Room,
  Wall,
  Window
} from "@/lib/types";

export type EditorTool =
  | "select"
  | "wall"
  | "measure"
  | "annotate"
  | "comment"
  | "calibrate"
  | "room"
  | "door"
  | "window"
  | "furniture";

const DUPLICATE_OFFSET = { x: 20, y: 20 };
const HISTORY_LIMIT = 60;
const INITIAL_HISTORY_LABEL = "Floor loaded";

type ElementKind = "wall" | "room" | "door" | "window" | "furniture" | "annotation";

type HistoryState = {
  history: FloorPlanData[];
  historyLabels: string[];
  historyIndex: number;
};

type EditorStore = {
  floorPlanData: FloorPlanData;
  selectedIds: string[];
  actionError: string | null;
  tool: EditorTool;
  history: FloorPlanData[];
  historyLabels: string[];
  historyIndex: number;
  zoom: number;
  pan: Point;
  pendingWallStart: Point | null;
  pendingMeasureStart: Point | null;
  calibrationPoints: Point[];
  pendingRoomPoints: Point[];
  pendingAnnotationStart: Point | null;
  pendingFurniture: PendingFurniture | null;
  setFloorPlanData: (data: FloorPlanData, resetHistory?: boolean, historyLabel?: string) => void;
  setSelectedIds: (ids: string[]) => void;
  toggleSelectedId: (id: string) => void;
  clearSelection: () => void;
  clearActionError: () => void;
  setTool: (tool: EditorTool) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Point) => void;
  setPendingWallStart: (point: Point | null) => void;
  setPendingMeasureStart: (point: Point | null) => void;
  setCalibrationPoints: (points: Point[]) => void;
  setPendingRoomPoints: (points: Point[]) => void;
  setPendingAnnotationStart: (point: Point | null) => void;
  setPendingFurniture: (furniture: PendingFurniture | null) => void;
  addWall: (wall: Omit<Wall, "id">) => void;
  addRoom: (room: Omit<Room, "id" | "areaSqFt">) => void;
  addDoor: (door: Omit<Door, "id">) => void;
  addWindow: (window: Omit<Window, "id">) => void;
  addFurniture: (furniture: Omit<Furniture, "id">) => void;
  addAnnotation: (from: Point, to: Point) => void;
  calibrateScale: (feet: number) => void;
  moveElement: (id: string, delta: Point) => void;
  updateElement: (id: string, patch: Record<string, number | string>) => void;
  deleteElement: (id: string | string[]) => void;
  duplicateSelected: () => void;
  jumpToHistory: (index: number) => void;
  undo: () => void;
  redo: () => void;
};

const ELEMENT_LABELS: Record<ElementKind, string> = {
  wall: "Wall",
  room: "Room",
  door: "Door",
  window: "Window",
  furniture: "Furniture",
  annotation: "Annotation"
};

const ELEMENT_PLURALS: Record<ElementKind, string> = {
  wall: "Walls",
  room: "Rooms",
  door: "Doors",
  window: "Windows",
  furniture: "Furniture",
  annotation: "Annotations"
};

function pushHistory(
  history: FloorPlanData[],
  historyLabels: string[],
  historyIndex: number,
  data: FloorPlanData,
  lastActionLabel: string
): HistoryState {
  const nextHistory = history.slice(0, historyIndex + 1);
  const nextHistoryLabels = historyLabels.slice(0, historyIndex + 1);

  nextHistory.push(cloneFloorPlanData(data));
  nextHistoryLabels.push(lastActionLabel);

  if (nextHistory.length > HISTORY_LIMIT) {
    nextHistory.shift();
    nextHistoryLabels.shift();
  }

  return {
    history: nextHistory,
    historyLabels: nextHistoryLabels,
    historyIndex: nextHistory.length - 1
  };
}

function updateState(
  current: FloorPlanData,
  recipe: (draft: FloorPlanData) => FloorPlanData
): FloorPlanData {
  return syncDerivedData(recipe(cloneFloorPlanData(current)));
}

function findElementKind(data: FloorPlanData, id: string): ElementKind | null {
  if (data.walls.some((entry) => entry.id === id)) {
    return "wall";
  }
  if (data.rooms.some((entry) => entry.id === id)) {
    return "room";
  }
  if (data.doors.some((entry) => entry.id === id)) {
    return "door";
  }
  if (data.windows.some((entry) => entry.id === id)) {
    return "window";
  }
  if (data.furniture.some((entry) => entry.id === id)) {
    return "furniture";
  }
  if (data.annotations.some((entry) => entry.id === id)) {
    return "annotation";
  }
  return null;
}

function getActionLabel(kind: ElementKind | null, action: string): string {
  return kind ? `${ELEMENT_LABELS[kind]} ${action}` : `Selection ${action}`;
}

function getSelectionActionLabel(data: FloorPlanData, ids: string[], action: string): string {
  const uniqueKinds = [...new Set(ids.map((id) => findElementKind(data, id)).filter(Boolean))] as ElementKind[];

  if (ids.length === 1) {
    return getActionLabel(uniqueKinds[0] ?? null, action);
  }

  if (uniqueKinds.length === 1) {
    return `${ELEMENT_PLURALS[uniqueKinds[0]]} ${action}`;
  }

  return `Selection ${action}`;
}

function getHistorySnapshotAtIndex(state: EditorStore, nextIndex: number) {
  return {
    floorPlanData: cloneFloorPlanData(state.history[nextIndex]),
    historyIndex: nextIndex,
    actionError: null,
    selectedIds: [],
    pendingWallStart: null,
    pendingMeasureStart: null,
    calibrationPoints: [],
    pendingRoomPoints: [],
    pendingAnnotationStart: null,
    pendingFurniture: null
  };
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  floorPlanData: cloneFloorPlanData(EMPTY_FLOOR_PLAN),
  selectedIds: [],
  actionError: null,
  tool: "select",
  history: [cloneFloorPlanData(EMPTY_FLOOR_PLAN)],
  historyLabels: [INITIAL_HISTORY_LABEL],
  historyIndex: 0,
  zoom: 1,
  pan: { x: 0, y: 0 },
  pendingWallStart: null,
  pendingMeasureStart: null,
  calibrationPoints: [],
  pendingRoomPoints: [],
  pendingAnnotationStart: null,
  pendingFurniture: null,
  setFloorPlanData: (data, resetHistory = false, historyLabel = INITIAL_HISTORY_LABEL) =>
    set(() => {
      const synced = syncDerivedData(data);
      return resetHistory
        ? {
            floorPlanData: synced,
            history: [cloneFloorPlanData(synced)],
            historyLabels: [historyLabel],
            historyIndex: 0,
            selectedIds: [],
            actionError: null,
            pendingWallStart: null,
            pendingMeasureStart: null,
            calibrationPoints: [],
            pendingRoomPoints: [],
            pendingAnnotationStart: null,
            pendingFurniture: null
          }
        : {
            floorPlanData: synced,
            actionError: null,
            pendingWallStart: null,
            pendingMeasureStart: null,
            calibrationPoints: [],
            pendingAnnotationStart: null,
            ...pushHistory(
              get().history,
              get().historyLabels,
              get().historyIndex,
              synced,
              historyLabel
            )
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
    set((state) => ({
      tool,
      pendingWallStart: null,
      pendingMeasureStart: null,
      calibrationPoints: [],
      pendingRoomPoints: [],
      pendingAnnotationStart: null,
      pendingFurniture: tool === "furniture" ? state.pendingFurniture : null,
      actionError: null
    })),
  setZoom: (zoom) => set({ zoom }),
  setPan: (pan) => set({ pan }),
  setPendingWallStart: (point) => set({ pendingWallStart: point }),
  setPendingMeasureStart: (point) => set({ pendingMeasureStart: point }),
  setCalibrationPoints: (points) =>
    set({
      calibrationPoints: points.slice(0, 2),
      actionError: null
    }),
  setPendingRoomPoints: (points) => set({ pendingRoomPoints: points }),
  setPendingAnnotationStart: (point) => set({ pendingAnnotationStart: point }),
  setPendingFurniture: (pendingFurniture) =>
    set((state) => ({
      pendingFurniture,
      pendingMeasureStart: null,
      calibrationPoints: [],
      pendingAnnotationStart: null,
      tool:
        pendingFurniture
          ? "furniture"
          : state.tool === "furniture"
            ? "select"
            : state.tool,
      actionError: null
    })),
  addWall: (wall) =>
    set((state) => {
      const wallId = createId("wall");
      const next = updateState(state.floorPlanData, (draft) => {
        draft.walls.push({ id: wallId, ...wall });
        const detectedRooms = detectClosedRooms(draft.walls, draft.rooms, draft.scale);
        if (detectedRooms.length > 0) {
          draft.rooms.push(...detectedRooms);
        }
        return draft;
      });

      return {
        floorPlanData: next,
        actionError: null,
        selectedIds: [wallId],
        pendingWallStart: { x: wall.x2, y: wall.y2 },
        tool: state.tool,
        ...pushHistory(state.history, state.historyLabels, state.historyIndex, next, "Wall added")
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
        ...pushHistory(state.history, state.historyLabels, state.historyIndex, next, "Room added")
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
        ...pushHistory(state.history, state.historyLabels, state.historyIndex, next, "Door added")
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
        ...pushHistory(state.history, state.historyLabels, state.historyIndex, next, "Window added")
      };
    }),
  addFurniture: (furniture) =>
    set((state) => {
      const next = updateState(state.floorPlanData, (draft) => {
        draft.furniture.push({ id: createId("furniture"), ...furniture });
        return draft;
      });
      return {
        floorPlanData: next,
        actionError: null,
        selectedIds: next.furniture.at(-1)?.id ? [next.furniture.at(-1)!.id] : [],
        tool: state.pendingFurniture ? "furniture" : "select",
        ...pushHistory(state.history, state.historyLabels, state.historyIndex, next, "Furniture added")
      };
    }),
  addAnnotation: (from, to) =>
    set((state) => {
      if (pointDistance(from, to) < 4) {
        return {
          pendingAnnotationStart: null,
          actionError: null
        };
      }

      const annotationId = createId("annotation");
      const next = updateState(state.floorPlanData, (draft) => {
        draft.annotations.push({
          id: annotationId,
          from,
          to,
          label: formatFeetInches(pointDistance(from, to), draft.scale)
        });
        return draft;
      });

      return {
        floorPlanData: next,
        actionError: null,
        selectedIds: [annotationId],
        pendingAnnotationStart: null,
        ...pushHistory(state.history, state.historyLabels, state.historyIndex, next, "Annotation added")
      };
    }),
  calibrateScale: (feet) =>
    set((state) => {
      if (feet <= 0) {
        return { actionError: "Enter a valid distance to calibrate the scale." };
      }

      const [from, to] = state.calibrationPoints;
      if (!from || !to) {
        return { actionError: "Pick two points before calibrating the scale." };
      }

      const pixelDistance = pointDistance(from, to);
      if (pixelDistance <= 0) {
        return { actionError: "Pick two distinct points before calibrating the scale." };
      }

      const next = updateState(state.floorPlanData, (draft) => {
        draft.scale = pixelDistance / feet;
        return draft;
      });

      return {
        floorPlanData: next,
        actionError: null,
        selectedIds: [],
        tool: "select" as const,
        pendingWallStart: null,
        pendingMeasureStart: null,
        calibrationPoints: [],
        pendingRoomPoints: [],
        pendingAnnotationStart: null,
        pendingFurniture: null,
        ...pushHistory(state.history, state.historyLabels, state.historyIndex, next, "Scale calibrated")
      };
    }),
  moveElement: (id, delta) =>
    set((state) => {
      const kind = findElementKind(state.floorPlanData, id);
      if (!kind) {
        return { actionError: null };
      }

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

        const furniture = draft.furniture.find((entry) => entry.id === id);
        if (furniture) {
          furniture.x += delta.x;
          furniture.y += delta.y;
          return draft;
        }

        const annotation = draft.annotations.find((entry) => entry.id === id);
        if (annotation) {
          annotation.from.x += delta.x;
          annotation.from.y += delta.y;
          annotation.to.x += delta.x;
          annotation.to.y += delta.y;
        }

        return draft;
      });

      return {
        floorPlanData: next,
        actionError: null,
        ...pushHistory(
          state.history,
          state.historyLabels,
          state.historyIndex,
          next,
          getActionLabel(kind, "moved")
        )
      };
    }),
  updateElement: (id, patch) =>
    set((state) => {
      const kind = findElementKind(state.floorPlanData, id);
      if (!kind) {
        return { actionError: null };
      }

      const next = updateState(state.floorPlanData, (draft) => {
        const collections = [
          draft.walls,
          draft.rooms,
          draft.doors,
          draft.windows,
          draft.furniture,
          draft.annotations
        ];

        for (const collection of collections) {
          const item = collection.find((entry) => entry.id === id);
          if (!item) {
            continue;
          }

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
        return draft;
      });

      return {
        floorPlanData: next,
        actionError: null,
        ...pushHistory(
          state.history,
          state.historyLabels,
          state.historyIndex,
          next,
          getActionLabel(kind, "updated")
        )
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
        draft.annotations = draft.annotations.filter((entry) => !idsToDelete.has(entry.id));
        return draft;
      });

      return {
        floorPlanData: next,
        actionError: null,
        selectedIds: [],
        ...pushHistory(
          state.history,
          state.historyLabels,
          state.historyIndex,
          next,
          getSelectionActionLabel(state.floorPlanData, uniqueIds, "deleted")
        )
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
        const duplicatedAnnotations = draft.annotations
          .filter((entry) => selectedIds.has(entry.id))
          .map((annotation) => ({
            ...annotation,
            id: createId("annotation"),
            from: {
              x: annotation.from.x + DUPLICATE_OFFSET.x,
              y: annotation.from.y + DUPLICATE_OFFSET.y
            },
            to: {
              x: annotation.to.x + DUPLICATE_OFFSET.x,
              y: annotation.to.y + DUPLICATE_OFFSET.y
            }
          }));

        draft.walls.push(...duplicatedWalls);
        draft.rooms.push(...duplicatedRooms);
        draft.doors.push(...duplicatedDoors);
        draft.windows.push(...duplicatedWindows);
        draft.furniture.push(...duplicatedFurniture);
        draft.annotations.push(...duplicatedAnnotations);
        return draft;
      });

      const duplicatedSelection = [
        ...next.walls
          .filter((entry) => !state.floorPlanData.walls.some((wall) => wall.id === entry.id))
          .map((entry) => entry.id),
        ...next.rooms
          .filter((entry) => !state.floorPlanData.rooms.some((room) => room.id === entry.id))
          .map((entry) => entry.id),
        ...next.doors
          .filter((entry) => !state.floorPlanData.doors.some((door) => door.id === entry.id))
          .map((entry) => entry.id),
        ...next.windows
          .filter((entry) => !state.floorPlanData.windows.some((window) => window.id === entry.id))
          .map((entry) => entry.id),
        ...next.furniture
          .filter((entry) => !state.floorPlanData.furniture.some((item) => item.id === entry.id))
          .map((entry) => entry.id),
        ...next.annotations
          .filter((entry) => !state.floorPlanData.annotations.some((annotation) => annotation.id === entry.id))
          .map((entry) => entry.id)
      ];

      return {
        floorPlanData: next,
        actionError: null,
        selectedIds: duplicatedSelection,
        ...pushHistory(
          state.history,
          state.historyLabels,
          state.historyIndex,
          next,
          getSelectionActionLabel(state.floorPlanData, state.selectedIds, "duplicated")
        )
      };
    }),
  jumpToHistory: (index) =>
    set((state) => {
      const nextIndex = Math.max(0, Math.min(state.history.length - 1, index));
      return getHistorySnapshotAtIndex(state, nextIndex);
    }),
  undo: () =>
    set((state) => {
      const nextIndex = Math.max(0, state.historyIndex - 1);
      return getHistorySnapshotAtIndex(state, nextIndex);
    }),
  redo: () =>
    set((state) => {
      const nextIndex = Math.min(state.history.length - 1, state.historyIndex + 1);
      return getHistorySnapshotAtIndex(state, nextIndex);
    })
}));
