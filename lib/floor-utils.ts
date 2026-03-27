import type { StoredFloorPlan } from "./types";

export function sortFloors<T extends { floor: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.floor - right.floor);
}

export function getPrimaryFloor<T extends { floor: number }>(items: T[]): T | null {
  return sortFloors(items)[0] ?? null;
}

export function getNextFloorNumber(items: Array<{ floor: number }>): number {
  const highestFloor = items.reduce((highest, item) => Math.max(highest, item.floor), 0);
  return highestFloor + 1;
}

export function findFloorPlan(floorPlans: StoredFloorPlan[], floor: number): StoredFloorPlan | null {
  return floorPlans.find((floorPlan) => floorPlan.floor === floor) ?? null;
}

export function formatFloorLabel(floor: number): string {
  return `Floor ${floor}`;
}

export function parseFloorParam<T extends { floor: number }>(
  value: string | null | undefined,
  floorPlans: T[]
): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return getPrimaryFloor(floorPlans)?.floor ?? 1;
}
