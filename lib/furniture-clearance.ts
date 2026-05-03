import { FURNITURE_BY_ID } from "@/lib/furniture-library"
import { pointOnWall, polygonCentroid, roomTouchesWall } from "@/lib/geometry"
import { furnitureCenter, getFurnitureForRoom, getRoomBounds, pointInPolygon } from "@/lib/room-layout-assistant"
import type { Door, FloorPlanData, Furniture, Point, Room } from "@/lib/types"

export type FurnitureBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  widthPx: number
  depthPx: number
}

export type FurnitureConflict = {
  id: string
  severity: "warning" | "info"
  furnitureId: string
  relatedFurnitureId?: string
  doorId?: string
  subject: string
  message: string
  recommendation: string
}

export type FurnitureFixSuggestion = {
  id: string
  conflictId: string
  label: string
  detail: string
  furnitureId: string
  patch: Partial<Pick<Furniture, "x" | "y" | "rotation">>
}

function roundTo(value: number, digits = 1) {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

export function getFurnitureClearanceInches(type: string): number {
  if (type.startsWith("dining-table")) return 36
  if (["refrigerator", "stove", "dishwasher", "kitchen-island"].includes(type)) return 36
  if (["queen-bed", "king-bed", "twin-bed"].includes(type)) return 24
  if (["toilet", "sink-vanity", "bathtub", "shower"].includes(type)) return 24
  if (["couch", "loveseat", "armchair", "office-chair", "dining-chair"].includes(type)) return 24

  return 18
}

export function getFurnitureFootprintPx(furniture: Furniture, scale: number) {
  const widthPx = (furniture.width / 12) * scale
  const depthPx = (furniture.depth / 12) * scale
  const isTurned = Math.abs(furniture.rotation) % 180 === 90

  return {
    widthPx: isTurned ? depthPx : widthPx,
    depthPx: isTurned ? widthPx : depthPx
  }
}

export function getFurnitureBounds(furniture: Furniture, scale: number, clearanceInches = 0): FurnitureBounds {
  const center = furnitureCenter(furniture)
  const { widthPx, depthPx } = getFurnitureFootprintPx(furniture, scale)
  const clearancePx = (clearanceInches / 12) * scale

  return {
    minX: center.x - widthPx / 2 - clearancePx,
    maxX: center.x + widthPx / 2 + clearancePx,
    minY: center.y - depthPx / 2 - clearancePx,
    maxY: center.y + depthPx / 2 + clearancePx,
    widthPx: widthPx + clearancePx * 2,
    depthPx: depthPx + clearancePx * 2
  }
}

function boundsOverlap(left: FurnitureBounds, right: FurnitureBounds) {
  return left.minX < right.maxX && left.maxX > right.minX && left.minY < right.maxY && left.maxY > right.minY
}

function boundsGapPx(left: FurnitureBounds, right: FurnitureBounds) {
  const xGap = Math.max(0, Math.max(right.minX - left.maxX, left.minX - right.maxX))
  const yGap = Math.max(0, Math.max(right.minY - left.maxY, left.minY - right.maxY))

  return Math.hypot(xGap, yGap)
}

function pointInsideBounds(point: Point, bounds: FurnitureBounds) {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY
}

function getFurnitureLabel(furniture: Furniture) {
  return FURNITURE_BY_ID[furniture.type]?.label ?? furniture.type
}

function getHostRoom(data: FloorPlanData, furniture: Furniture) {
  return data.rooms.find((room) => pointInPolygon(furnitureCenter(furniture), room.polygon))
}

function normalizeVector(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y)

  if (length <= 0.001) {
    return { x: 1, y: 0 }
  }

  return {
    x: vector.x / length,
    y: vector.y / length
  }
}

function getDoorRooms(data: FloorPlanData, door: Door) {
  const wall = data.walls.find((entry) => entry.id === door.wallId)
  if (!wall) return []

  const doorPoint = pointOnWall(wall, door.position)
  return data.rooms.filter((room) => {
    if (pointInPolygon(doorPoint, room.polygon)) return true
    return roomTouchesWall(room, wall)
  })
}

function getFurnitureWallClearanceConflict(room: Room, furniture: Furniture, scale: number): FurnitureConflict | null {
  const bounds = getRoomBounds(room)
  const footprint = getFurnitureBounds(furniture, scale)
  const wallGapPx = Math.min(
    footprint.minX - bounds.minX,
    bounds.maxX - footprint.maxX,
    footprint.minY - bounds.minY,
    bounds.maxY - footprint.maxY
  )
  const wallGapInches = (wallGapPx / (scale || 1)) * 12
  const needsWallClearance = ["dining-table-4", "dining-table-6", "kitchen-island", "couch", "loveseat", "armchair"].includes(furniture.type)

  if (!needsWallClearance || wallGapInches >= 18) return null

  return {
    id: `furniture-wall-clearance-${furniture.id}`,
    severity: "warning",
    furnitureId: furniture.id,
    subject: getFurnitureLabel(furniture),
    message: `${getFurnitureLabel(furniture)} has only ${Math.max(0, roundTo(wallGapInches, 0))} inches from the nearest wall.`,
    recommendation: "Move it inward or choose a smaller item so circulation does not pinch against the wall."
  }
}

export function getFurnitureClearanceConflicts(data: FloorPlanData): FurnitureConflict[] {
  const scale = data.scale || 1
  const conflicts: FurnitureConflict[] = []

  for (const room of data.rooms) {
    const roomFurniture = getFurnitureForRoom(room, data.furniture)

    for (let index = 0; index < roomFurniture.length; index += 1) {
      const current = roomFurniture[index]
      const currentBounds = getFurnitureBounds(current, scale)
      const currentClearanceBounds = getFurnitureBounds(
        current,
        scale,
        getFurnitureClearanceInches(current.type)
      )
      const wallConflict = getFurnitureWallClearanceConflict(room, current, scale)

      if (wallConflict) {
        conflicts.push(wallConflict)
      }

      for (let otherIndex = index + 1; otherIndex < roomFurniture.length; otherIndex += 1) {
        const other = roomFurniture[otherIndex]
        const otherBounds = getFurnitureBounds(other, scale)
        const otherClearanceBounds = getFurnitureBounds(
          other,
          scale,
          getFurnitureClearanceInches(other.type)
        )

        if (boundsOverlap(currentBounds, otherBounds)) {
          conflicts.push({
            id: `furniture-overlap-${current.id}-${other.id}`,
            severity: "warning",
            furnitureId: current.id,
            relatedFurnitureId: other.id,
            subject: getFurnitureLabel(current),
            message: `${getFurnitureLabel(current)} overlaps ${getFurnitureLabel(other)} in ${room.label}.`,
            recommendation: "Separate the furniture footprints before treating this layout as usable."
          })
          continue
        }

        if (boundsOverlap(currentClearanceBounds, otherBounds) || boundsOverlap(otherClearanceBounds, currentBounds)) {
          const gapInches = roundTo((boundsGapPx(currentBounds, otherBounds) / scale) * 12, 0)
          conflicts.push({
            id: `furniture-clearance-${current.id}-${other.id}`,
            severity: "warning",
            furnitureId: current.id,
            relatedFurnitureId: other.id,
            subject: getFurnitureLabel(current),
            message: `${getFurnitureLabel(current)} and ${getFurnitureLabel(other)} are ${gapInches} inches apart in ${room.label}.`,
            recommendation: "Leave the recommended walking or operating clearance between these pieces."
          })
        }
      }
    }
  }

  for (const door of data.doors) {
    const wall = data.walls.find((entry) => entry.id === door.wallId)
    if (!wall) continue

    const doorPoint = pointOnWall(wall, door.position)
    const doorRooms = getDoorRooms(data, door)
    const checkedFurniture = doorRooms.length > 0
      ? doorRooms.flatMap((room) => getFurnitureForRoom(room, data.furniture))
      : data.furniture
    const uniqueFurniture = [...new Map(checkedFurniture.map((item) => [item.id, item])).values()]

    for (const furniture of uniqueFurniture) {
      const operatingBounds = getFurnitureBounds(furniture, scale, Math.max(door.width, 30))

      if (!pointInsideBounds(doorPoint, operatingBounds)) continue

      conflicts.push({
        id: `door-blocked-${door.id}-${furniture.id}`,
        severity: "warning",
        furnitureId: furniture.id,
        doorId: door.id,
        subject: getFurnitureLabel(furniture),
        message: `${getFurnitureLabel(furniture)} is inside the operating zone of a ${door.width} inch door.`,
        recommendation: "Move the item away from the doorway or adjust the door/furniture layout."
      })
    }
  }

  return [...new Map(conflicts.map((conflict) => [conflict.id, conflict])).values()]
}

function getMoveAwayPatch(furniture: Furniture, otherPoint: Point, distancePx: number) {
  const center = furnitureCenter(furniture)
  const vector = normalizeVector({
    x: center.x - otherPoint.x,
    y: center.y - otherPoint.y
  })

  return {
    x: furniture.x + vector.x * distancePx,
    y: furniture.y + vector.y * distancePx
  }
}

function getMoveTowardPatch(furniture: Furniture, point: Point, distancePx: number) {
  const center = furnitureCenter(furniture)
  const vector = normalizeVector({
    x: point.x - center.x,
    y: point.y - center.y
  })

  return {
    x: furniture.x + vector.x * distancePx,
    y: furniture.y + vector.y * distancePx
  }
}

function getMovePastFurniturePatch(furniture: Furniture, other: Furniture, scale: number) {
  const currentBounds = getFurnitureBounds(furniture, scale)
  const otherBounds = getFurnitureBounds(other, scale)
  const currentCenter = furnitureCenter(furniture)
  const otherCenter = furnitureCenter(other)
  const clearancePx = (18 / 12) * scale
  const requiredXMove =
    currentBounds.widthPx / 2 +
    otherBounds.widthPx / 2 +
    clearancePx -
    Math.abs(currentCenter.x - otherCenter.x)
  const requiredYMove =
    currentBounds.depthPx / 2 +
    otherBounds.depthPx / 2 +
    clearancePx -
    Math.abs(currentCenter.y - otherCenter.y)

  if (requiredXMove <= requiredYMove) {
    const direction = currentCenter.x >= otherCenter.x ? 1 : -1
    return {
      x: furniture.x + direction * Math.max(clearancePx, requiredXMove),
      y: furniture.y
    }
  }

  const direction = currentCenter.y >= otherCenter.y ? 1 : -1
  return {
    x: furniture.x,
    y: furniture.y + direction * Math.max(clearancePx, requiredYMove)
  }
}

export function getFurnitureFixSuggestions(data: FloorPlanData): FurnitureFixSuggestion[] {
  const scale = data.scale || 1
  const suggestions: FurnitureFixSuggestion[] = []
  const conflicts = getFurnitureClearanceConflicts(data)

  for (const conflict of conflicts) {
    const furniture = data.furniture.find((item) => item.id === conflict.furnitureId)
    if (!furniture) continue

    const label = getFurnitureLabel(furniture)

    if (conflict.relatedFurnitureId) {
      const other = data.furniture.find((item) => item.id === conflict.relatedFurnitureId)

      if (other) {
        suggestions.push({
          id: `move-${conflict.id}`,
          conflictId: conflict.id,
          label: `Move ${label}`,
          detail: `Separate it from ${getFurnitureLabel(other)}.`,
          furnitureId: furniture.id,
          patch: getMovePastFurniturePatch(furniture, other, scale)
        })
      }
    } else if (conflict.doorId) {
      const door = data.doors.find((entry) => entry.id === conflict.doorId)
      const wall = door ? data.walls.find((entry) => entry.id === door.wallId) : null

      if (door && wall) {
        suggestions.push({
          id: `move-${conflict.id}`,
          conflictId: conflict.id,
          label: `Move ${label}`,
          detail: "Clear the door operating zone.",
          furnitureId: furniture.id,
          patch: getMoveAwayPatch(furniture, pointOnWall(wall, door.position), (24 / 12) * scale)
        })
      }
    } else {
      const hostRoom = getHostRoom(data, furniture)

      if (hostRoom) {
        suggestions.push({
          id: `move-${conflict.id}`,
          conflictId: conflict.id,
          label: `Move ${label}`,
          detail: "Pull it inward from the wall pinch point.",
          furnitureId: furniture.id,
          patch: getMoveTowardPatch(furniture, polygonCentroid(hostRoom.polygon), (18 / 12) * scale)
        })
      }
    }

    if (furniture.width !== furniture.depth) {
      suggestions.push({
        id: `rotate-${conflict.id}`,
        conflictId: conflict.id,
        label: `Rotate ${label}`,
        detail: "Turn it 90 degrees to test a tighter footprint.",
        furnitureId: furniture.id,
        patch: {
          rotation: (furniture.rotation + 90) % 360
        }
      })
    }
  }

  return [...new Map(suggestions.map((suggestion) => [suggestion.id, suggestion])).values()].slice(0, 6)
}
