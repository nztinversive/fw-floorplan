import { FURNITURE_BY_ID } from "@/lib/furniture-library"
import { getWallLength, pointDistance, roomTouchesWall } from "@/lib/geometry"
import type { FloorPlanData, Furniture, Point, Room, Wall } from "@/lib/types"

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

export type DesignReviewSeverity = "good" | "info" | "warning"

export type DesignReviewItem = {
  id: string
  severity: DesignReviewSeverity
  subject: string
  message: string
  recommendation: string
}

export type RoomDesignAssessment = {
  roomId: string
  label: string
  category: "bedroom" | "kitchen" | "bathroom" | "living" | "dining" | "circulation" | "utility" | "general"
  areaSqFt: number
  widthFt: number
  depthFt: number
  doorCount: number
  windowCount: number
  furnitureCount: number
  items: DesignReviewItem[]
}

export type DesignReview = {
  score: number
  summary: string
  roomAssessments: RoomDesignAssessment[]
  circulationItems: DesignReviewItem[]
  furnitureItems: DesignReviewItem[]
  positives: DesignReviewItem[]
  warnings: DesignReviewItem[]
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

function getRoomCategory(room: Room): RoomDesignAssessment["category"] {
  const label = getRoomName(room).toLowerCase()

  if (/(bed|primary|suite|guest|kid|nursery)/.test(label)) return "bedroom"
  if (/(kitchen|pantry)/.test(label)) return "kitchen"
  if (/(bath|toilet|powder|shower|wc)/.test(label)) return "bathroom"
  if (/(living|family|great)/.test(label)) return "living"
  if (/(dining|breakfast)/.test(label)) return "dining"
  if (/(hall|corridor|entry|foyer|stair|landing)/.test(label)) return "circulation"
  if (/(laundry|mud|mechanical|utility|closet|storage)/.test(label)) return "utility"

  return "general"
}

function getRoomBounds(room: Room) {
  const xs = room.polygon.map((point) => point.x)
  const ys = room.polygon.map((point) => point.y)

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  }
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false

  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    const crosses =
      current.y > point.y !== previous.y > point.y &&
      point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y || 1) + current.x

    if (crosses) {
      inside = !inside
    }
  }

  return inside
}

function furnitureCenter(furniture: Furniture): Point {
  return {
    x: furniture.x + furniture.width / 2,
    y: furniture.y + furniture.depth / 2
  }
}

function getFurnitureForRoom(room: Room, furniture: Furniture[]) {
  return furniture.filter((item) => pointInPolygon(furnitureCenter(item), room.polygon))
}

function makeDesignItem(
  id: string,
  severity: DesignReviewSeverity,
  subject: string,
  message: string,
  recommendation: string
): DesignReviewItem {
  return { id, severity, subject, message, recommendation }
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

export function getDesignReview(data: FloorPlanData): DesignReview {
  const roomMetrics = getRoomMetrics(data)
  const roomAssessments: RoomDesignAssessment[] = []
  const circulationItems: DesignReviewItem[] = []
  const furnitureItems: DesignReviewItem[] = []
  const positives: DesignReviewItem[] = []
  const warnings: DesignReviewItem[] = []
  const scale = data.scale || 1

  for (const metric of roomMetrics) {
    const room = metric.room
    const label = getRoomName(room)
    const category = getRoomCategory(room)
    const bounds = getRoomBounds(room)
    const widthFt = roundTo((bounds.maxX - bounds.minX) / scale, 1)
    const depthFt = roundTo((bounds.maxY - bounds.minY) / scale, 1)
    const roomFurniture = getFurnitureForRoom(room, data.furniture)
    const items: DesignReviewItem[] = []

    if (category === "bedroom") {
      if (room.areaSqFt < 90 || Math.min(widthFt, depthFt) < 9) {
        items.push(makeDesignItem(
          `bedroom-size-${room.id}`,
          "warning",
          label,
          `${label} is ${roundTo(room.areaSqFt, 1)} sq ft with a ${widthFt} ft by ${depthFt} ft envelope.`,
          "Target at least 90 sq ft and a 9 ft minimum dimension for a more comfortable bedroom."
        ))
      } else {
        items.push(makeDesignItem(
          `bedroom-size-good-${room.id}`,
          "good",
          label,
          `${label} has workable bedroom proportions.`,
          "Keep bed placement and closet access clear as furniture is added."
        ))
      }

      if (metric.windowCount === 0) {
        items.push(makeDesignItem(
          `bedroom-window-${room.id}`,
          "warning",
          label,
          `${label} has no detected window.`,
          "Add or verify a window for daylight, ventilation, and egress review."
        ))
      }
    }

    if (category === "kitchen") {
      const kitchenFurniture = roomFurniture.map((item) => item.type)
      const hasRefrigerator = kitchenFurniture.includes("refrigerator")
      const hasStove = kitchenFurniture.includes("stove")

      if (room.areaSqFt < 70) {
        items.push(makeDesignItem(
          `kitchen-size-${room.id}`,
          "warning",
          label,
          `${label} is ${roundTo(room.areaSqFt, 1)} sq ft.`,
          "Consider increasing kitchen area or using a compact galley layout with clear appliance landing zones."
        ))
      }

      if (!hasRefrigerator || !hasStove) {
        items.push(makeDesignItem(
          `kitchen-appliances-${room.id}`,
          "info",
          label,
          "The kitchen work zone is not fully represented with refrigerator and stove furniture.",
          "Place refrigerator, stove, sink or island references to review appliance clearances and work-triangle quality."
        ))
      } else {
        items.push(makeDesignItem(
          `kitchen-appliances-good-${room.id}`,
          "good",
          label,
          "Core kitchen appliances are represented.",
          "Use the furniture layout to confirm aisle widths and appliance door swings."
        ))
      }
    }

    if (category === "bathroom") {
      if (room.areaSqFt < 35) {
        items.push(makeDesignItem(
          `bath-size-${room.id}`,
          "warning",
          label,
          `${label} is ${roundTo(room.areaSqFt, 1)} sq ft.`,
          "Verify fixture clearances carefully; compact baths usually need very deliberate door and vanity placement."
        ))
      }

      const bathFixtures = roomFurniture.filter((item) =>
        ["toilet", "sink-vanity", "bathtub", "shower"].includes(item.type)
      )

      if (bathFixtures.length === 0) {
        items.push(makeDesignItem(
          `bath-fixtures-${room.id}`,
          "info",
          label,
          "No bathroom fixtures are placed in this room.",
          "Add toilet, vanity, shower or tub furniture to validate fixture clearances."
        ))
      }
    }

    if (category === "living" && room.areaSqFt < 120) {
      items.push(makeDesignItem(
        `living-size-${room.id}`,
        "warning",
        label,
        `${label} is ${roundTo(room.areaSqFt, 1)} sq ft.`,
        "A main living space often benefits from at least 120 sq ft plus clear circulation around seating."
      ))
    }

    if (metric.doorCount === 0) {
      items.push(makeDesignItem(
        `room-access-${room.id}`,
        "warning",
        label,
        "No door is associated with this room.",
        "Add or verify door placement so circulation and privacy are clear."
      ))
    }

    if (metric.windowCount > 0 && ["living", "kitchen", "bedroom"].includes(category)) {
      items.push(makeDesignItem(
        `room-daylight-${room.id}`,
        "good",
        label,
        `${label} has ${metric.windowCount} detected window${metric.windowCount === 1 ? "" : "s"}.`,
        "Use window placement to guide furniture orientation and daylight-sensitive uses."
      ))
    }

    roomAssessments.push({
      roomId: room.id,
      label,
      category,
      areaSqFt: roundTo(room.areaSqFt, 1),
      widthFt,
      depthFt,
      doorCount: metric.doorCount,
      windowCount: metric.windowCount,
      furnitureCount: roomFurniture.length,
      items
    })

    for (const item of items) {
      if (item.severity === "good") {
        positives.push(item)
      } else {
        warnings.push(item)
      }
    }
  }

  for (const door of data.doors) {
    const widthInches = door.width

    if (widthInches < 30) {
      circulationItems.push(makeDesignItem(
        `door-width-${door.id}`,
        "warning",
        "Door clearance",
        `A ${door.type} door is ${widthInches} inches wide.`,
        "Use 30 inches or wider for a more comfortable interior passage; 32 to 36 inches is better for accessibility."
      ))
    }
  }

  if (data.doors.length === 0 && data.rooms.length > 0) {
    circulationItems.push(makeDesignItem(
      "missing-doors",
      "warning",
      "Circulation",
      "Rooms exist but no doors are placed.",
      "Add doors to clarify circulation, privacy, and furniture move-in paths."
    ))
  }

  for (const item of data.furniture) {
    const catalogItem = FURNITURE_BY_ID[item.type]
    const itemWidthFt = roundTo(item.width / 12, 1)
    const itemDepthFt = roundTo(item.depth / 12, 1)
    const hostRoom = data.rooms.find((room) => pointInPolygon(furnitureCenter(item), room.polygon))

    if (!hostRoom) {
      furnitureItems.push(makeDesignItem(
        `furniture-floating-${item.id}`,
        "info",
        catalogItem?.label ?? "Furniture",
        `${catalogItem?.label ?? item.type} is not inside a detected room.`,
        "Move the furniture reference into a room polygon so room-level clearance checks can include it."
      ))
      continue
    }

    if (["queen-bed", "king-bed"].includes(item.type)) {
      const bounds = getRoomBounds(hostRoom)
      const roomWidthFt = (bounds.maxX - bounds.minX) / scale
      const roomDepthFt = (bounds.maxY - bounds.minY) / scale
      const minimumRoomDimension = Math.min(roomWidthFt, roomDepthFt)

      if (minimumRoomDimension < 10) {
        furnitureItems.push(makeDesignItem(
          `bed-clearance-${item.id}`,
          "warning",
          catalogItem?.label ?? "Bed",
          `${catalogItem?.label ?? item.type} is in a room with a ${roundTo(minimumRoomDimension, 1)} ft minimum dimension.`,
          "Verify at least 24 inches of walking clearance beside the bed and consider a smaller bed if needed."
        ))
      }
    }

    if (item.type.startsWith("dining-table")) {
      furnitureItems.push(makeDesignItem(
        `dining-clearance-${item.id}`,
        "info",
        catalogItem?.label ?? "Dining table",
        `${catalogItem?.label ?? item.type} footprint is ${itemWidthFt} ft by ${itemDepthFt} ft.`,
        "Confirm roughly 36 inches around the table for chairs and circulation."
      ))
    }
  }

  warnings.push(...circulationItems.filter((item) => item.severity !== "good"))
  warnings.push(...furnitureItems.filter((item) => item.severity !== "good"))
  positives.push(...circulationItems.filter((item) => item.severity === "good"))
  positives.push(...furnitureItems.filter((item) => item.severity === "good"))

  if (data.rooms.length > 0 && warnings.length === 0) {
    positives.push(makeDesignItem(
      "design-balanced",
      "good",
      "Design review",
      "No major layout warnings were found.",
      "Continue adding furniture and fixtures to make the review more precise."
    ))
  }

  const warningPenalty = warnings.filter((item) => item.severity === "warning").length * 10
  const infoPenalty = warnings.filter((item) => item.severity === "info").length * 3
  const score = data.rooms.length === 0 ? 0 : Math.max(35, Math.min(100, 100 - warningPenalty - infoPenalty))

  return {
    score,
    summary:
      data.rooms.length === 0
        ? "Draw or detect rooms to start the home-design review."
        : `${warnings.length} design note${warnings.length === 1 ? "" : "s"} across ${data.rooms.length} room${data.rooms.length === 1 ? "" : "s"}.`,
    roomAssessments,
    circulationItems,
    furnitureItems,
    positives,
    warnings
  }
}
