import { getWallLength, pointDistance, roomTouchesWall } from "@/lib/geometry"
import type { FloorPlanData, Room, Wall } from "@/lib/types"

const DISCONNECTED_WALL_TOLERANCE = 12

export type FloorPlanAnalysisInput = {
  floor: number
  data: FloorPlanData
}

export type RoomMetric = {
  room: Room
  wallCount: number
  doorCount: number
  windowCount: number
}

export type AreaSummaryItem = {
  label: string
  areaSqFt: number
  roomCount: number
}

export type FloorAreaSummaryItem = {
  floor: number
  areaSqFt: number
  roomCount: number
}

export type RoomAreaSummary = {
  totalAreaSqFt: number
  totalRoomCount: number
  byLabel: AreaSummaryItem[]
  byFloor: FloorAreaSummaryItem[]
}

export type CostEstimatorRates = {
  framing: number
  drywall: number
  flooring: number
  doors: number
  windows: number
}

export type CostLineItem = {
  key: keyof CostEstimatorRates
  label: string
  quantity: number
  unit: string
  unitCost: number
  total: number
}

export type CostEstimate = {
  wallLengthFt: number
  wallAreaSqFt: number
  roomAreaSqFt: number
  doorCount: number
  windowCount: number
  lineItems: CostLineItem[]
  grandTotal: number
}

export type ComplianceIssue = {
  id: string
  severity: "warning" | "error"
  subject: string
  message: string
}

export const DEFAULT_COST_RATES: CostEstimatorRates = {
  framing: 12,
  drywall: 1.5,
  flooring: 6,
  doors: 250,
  windows: 400
}

function roundTo(value: number, digits: number): number {
  return Number(value.toFixed(digits))
}

function getRoomName(room: Room): string {
  return room.label.trim() || "Unlabeled Room"
}

function getWallEndpointPairs(wall: Wall) {
  return [
    { x: wall.x1, y: wall.y1 },
    { x: wall.x2, y: wall.y2 }
  ]
}

export function getRoomMetrics(data: FloorPlanData): RoomMetric[] {
  const wallMap = new Map(data.walls.map((wall) => [wall.id, wall]))

  return data.rooms.map((room) => {
    const touchingWalls = data.walls.filter((wall) => roomTouchesWall(room, wall))
    const touchingWallIds = new Set(touchingWalls.map((wall) => wall.id))

    const doorCount = data.doors.reduce((total, door) => {
      const wall = wallMap.get(door.wallId)
      return total + (wall && touchingWallIds.has(wall.id) ? 1 : 0)
    }, 0)

    const windowCount = data.windows.reduce((total, windowEntry) => {
      const wall = wallMap.get(windowEntry.wallId)
      return total + (wall && touchingWallIds.has(wall.id) ? 1 : 0)
    }, 0)

    return {
      room,
      wallCount: touchingWalls.length,
      doorCount,
      windowCount
    }
  })
}

export function getRoomNotes(metric: RoomMetric): string[] {
  const notes: string[] = []

  if (metric.room.areaSqFt <= 0) {
    notes.push("Check polygon")
  } else if (metric.room.areaSqFt < 70) {
    notes.push("Below 70 sq ft")
  }

  if (metric.doorCount === 0) {
    notes.push("No door access")
  }

  if (metric.windowCount === 0) {
    notes.push("No windows")
  }

  return notes
}

export function summarizeRoomAreas(floorPlans: FloorPlanAnalysisInput[]): RoomAreaSummary {
  const byLabel = new Map<string, AreaSummaryItem>()
  const byFloor = floorPlans.map(({ floor, data }) => ({
    floor,
    areaSqFt: roundTo(data.rooms.reduce((total, room) => total + room.areaSqFt, 0), 1),
    roomCount: data.rooms.length
  }))

  let totalAreaSqFt = 0
  let totalRoomCount = 0

  for (const { data } of floorPlans) {
    totalRoomCount += data.rooms.length

    for (const room of data.rooms) {
      const label = getRoomName(room)
      totalAreaSqFt += room.areaSqFt

      const existing = byLabel.get(label)
      if (existing) {
        existing.areaSqFt = roundTo(existing.areaSqFt + room.areaSqFt, 1)
        existing.roomCount += 1
        continue
      }

      byLabel.set(label, {
        label,
        areaSqFt: roundTo(room.areaSqFt, 1),
        roomCount: 1
      })
    }
  }

  return {
    totalAreaSqFt: roundTo(totalAreaSqFt, 1),
    totalRoomCount,
    byLabel: [...byLabel.values()].sort((left, right) => right.areaSqFt - left.areaSqFt),
    byFloor: byFloor.sort((left, right) => left.floor - right.floor),
  }
}

export function calculateCostEstimate(
  data: FloorPlanData,
  rates: CostEstimatorRates
): CostEstimate {
  const scale = data.scale || 1
  const wallLengthFt = roundTo(
    data.walls.reduce((total, wall) => total + getWallLength(wall) / scale, 0),
    1
  )
  const wallAreaSqFt = roundTo(wallLengthFt * 8 * 2, 1)
  const roomAreaSqFt = roundTo(
    data.rooms.reduce((total, room) => total + room.areaSqFt, 0),
    1
  )
  const doorCount = data.doors.length
  const windowCount = data.windows.length

  const lineItems: CostLineItem[] = [
    {
      key: "framing",
      label: "Framing",
      quantity: wallLengthFt,
      unit: "LF",
      unitCost: rates.framing,
      total: roundTo(wallLengthFt * rates.framing, 2)
    },
    {
      key: "drywall",
      label: "Drywall",
      quantity: wallAreaSqFt,
      unit: "sq ft",
      unitCost: rates.drywall,
      total: roundTo(wallAreaSqFt * rates.drywall, 2)
    },
    {
      key: "flooring",
      label: "Flooring",
      quantity: roomAreaSqFt,
      unit: "sq ft",
      unitCost: rates.flooring,
      total: roundTo(roomAreaSqFt * rates.flooring, 2)
    },
    {
      key: "doors",
      label: "Doors",
      quantity: doorCount,
      unit: "each",
      unitCost: rates.doors,
      total: roundTo(doorCount * rates.doors, 2)
    },
    {
      key: "windows",
      label: "Windows",
      quantity: windowCount,
      unit: "each",
      unitCost: rates.windows,
      total: roundTo(windowCount * rates.windows, 2)
    }
  ]

  return {
    wallLengthFt,
    wallAreaSqFt,
    roomAreaSqFt,
    doorCount,
    windowCount,
    lineItems,
    grandTotal: roundTo(lineItems.reduce((total, item) => total + item.total, 0), 2)
  }
}

function isWallEndpointConnected(wall: Wall, point: { x: number; y: number }, walls: Wall[]): boolean {
  return walls.some((candidate) => {
    if (candidate.id === wall.id) {
      return false
    }

    return getWallEndpointPairs(candidate).some(
      (candidatePoint) => pointDistance(point, candidatePoint) <= DISCONNECTED_WALL_TOLERANCE
    )
  })
}

export function getComplianceIssues(data: FloorPlanData): ComplianceIssue[] {
  const issues: ComplianceIssue[] = []
  const roomMetrics = getRoomMetrics(data)

  for (const metric of roomMetrics) {
    const roomName = getRoomName(metric.room)

    if (metric.room.areaSqFt <= 0) {
      issues.push({
        id: `room-zero-${metric.room.id}`,
        severity: "error",
        subject: roomName,
        message: "Zero area room (check polygon)"
      })
    } else if (metric.room.areaSqFt < 70) {
      issues.push({
        id: `room-size-${metric.room.id}`,
        severity: "warning",
        subject: roomName,
        message: "Below minimum habitable room size"
      })
    }

    if (metric.doorCount === 0) {
      issues.push({
        id: `room-door-${metric.room.id}`,
        severity: "error",
        subject: roomName,
        message: "No door access"
      })
    }
  }

  for (const wall of data.walls) {
    const wallLengthFt = getWallLength(wall) / (data.scale || 1)

    if (wallLengthFt < 1) {
      issues.push({
        id: `wall-short-${wall.id}`,
        severity: "warning",
        subject: wall.id,
        message: "Very short wall segment"
      })
    }

    const [start, end] = getWallEndpointPairs(wall)
    const isFloating =
      !isWallEndpointConnected(wall, start, data.walls) &&
      !isWallEndpointConnected(wall, end, data.walls)

    if (isFloating) {
      issues.push({
        id: `wall-floating-${wall.id}`,
        severity: "warning",
        subject: wall.id,
        message: "Floating wall"
      })
    }
  }

  return issues
}
