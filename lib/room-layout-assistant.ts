import { FURNITURE_BY_ID } from "@/lib/furniture-library"
import { polygonCentroid } from "@/lib/geometry"
import type { FloorPlanData, Furniture, Point, Room } from "@/lib/types"

export type RoomLayoutCategory = "bedroom" | "kitchen" | "living" | "bathroom" | "general"

export type PlannedFurniture = Omit<Furniture, "id"> & {
  label: string
}

export type RoomLayoutPlan = {
  room: Room
  category: Extract<RoomLayoutCategory, "bedroom" | "kitchen">
  title: string
  description: string
  dimensions: {
    widthFt: number
    depthFt: number
  }
  items: PlannedFurniture[]
}

type RoomBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
  widthPx: number
  depthPx: number
}

function roundTo(value: number, digits = 1) {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

export function getRoomCategory(room: Room): RoomLayoutCategory {
  const label = room.label.trim().toLowerCase()

  if (/(bed|primary|suite|guest|kid|nursery)/.test(label)) return "bedroom"
  if (/(kitchen|pantry)/.test(label)) return "kitchen"
  if (/(bath|toilet|powder|shower|wc)/.test(label)) return "bathroom"
  if (/(living|family|great)/.test(label)) return "living"

  return "general"
}

export function getRoomBounds(room: Room): RoomBounds {
  if (room.polygon.length === 0) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      widthPx: 0,
      depthPx: 0
    }
  }

  const xs = room.polygon.map((point) => point.x)
  const ys = room.polygon.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    minX,
    maxX,
    minY,
    maxY,
    widthPx: maxX - minX,
    depthPx: maxY - minY
  }
}

export function pointInPolygon(point: Point, polygon: Point[]) {
  if (polygon.length < 3) return false

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

export function furnitureCenter(furniture: Furniture): Point {
  return {
    x: furniture.x,
    y: furniture.y
  }
}

export function getFurnitureForRoom(room: Room, furniture: Furniture[]) {
  return furniture.filter((item) => pointInPolygon(furnitureCenter(item), room.polygon))
}

function getFurnitureFootprint(type: string, scale: number, rotation = 0) {
  const catalogItem = FURNITURE_BY_ID[type]
  if (!catalogItem) return { widthPx: 0, depthPx: 0 }

  const widthPx = (catalogItem.width / 12) * scale
  const depthPx = (catalogItem.depth / 12) * scale
  const isTurned = Math.abs(rotation) % 180 === 90

  return {
    widthPx: isTurned ? depthPx : widthPx,
    depthPx: isTurned ? widthPx : depthPx
  }
}

function createFurniture(type: string, point: Point, rotation = 0): PlannedFurniture | null {
  const catalogItem = FURNITURE_BY_ID[type]
  if (!catalogItem) return null

  return {
    type,
    x: point.x,
    y: point.y,
    width: catalogItem.width,
    depth: catalogItem.depth,
    rotation,
    label: catalogItem.label
  }
}

function safeRoomPoint(room: Room, point: Point, fallback: Point): Point {
  return pointInPolygon(point, room.polygon) ? point : fallback
}

function createFurnitureInRoom(type: string, room: Room, point: Point, rotation = 0): PlannedFurniture | null {
  if (!pointInPolygon(point, room.polygon)) return null

  return createFurniture(type, point, rotation)
}

function hasFurnitureType(furniture: Furniture[], types: string[]) {
  return furniture.some((item) => types.includes(item.type))
}

function buildBedroomPlan(room: Room, data: FloorPlanData): RoomLayoutPlan {
  const scale = data.scale || 1
  const bounds = getRoomBounds(room)
  const center = polygonCentroid(room.polygon)
  const roomFurniture = getFurnitureForRoom(room, data.furniture)
  const widthFt = roundTo(bounds.widthPx / scale)
  const depthFt = roundTo(bounds.depthPx / scale)
  const isWide = bounds.widthPx >= bounds.depthPx
  const bedType = Math.min(widthFt, depthFt) >= 11 && room.areaSqFt >= 120 ? "queen-bed" : "twin-bed"
  const items: PlannedFurniture[] = []
  const marginPx = (18 / 12) * scale

  if (!hasFurnitureType(roomFurniture, ["queen-bed", "king-bed", "twin-bed"])) {
    const rotation = isWide ? 0 : 90
    const bedFootprint = getFurnitureFootprint(bedType, scale, rotation)
    const bedPoint = isWide
      ? { x: center.x, y: bounds.minY + bedFootprint.depthPx / 2 + marginPx }
      : { x: bounds.minX + bedFootprint.widthPx / 2 + marginPx, y: center.y }
    const bed = createFurniture(bedType, safeRoomPoint(room, bedPoint, center), rotation)

    if (bed) {
      items.push(bed)
    }

    if (!hasFurnitureType(roomFurniture, ["nightstand"])) {
      const nightstandFootprint = getFurnitureFootprint("nightstand", scale)
      const nightstandOffset =
        bedFootprint.widthPx / 2 + nightstandFootprint.widthPx / 2 + marginPx / 2
      const nightstandPoint = isWide
        ? { x: center.x + nightstandOffset, y: bedPoint.y }
        : { x: bedPoint.x, y: center.y + nightstandOffset }
      const nightstand = createFurnitureInRoom("nightstand", room, nightstandPoint)

      if (nightstand) {
        items.push(nightstand)
      }
    }
  }

  if (!hasFurnitureType(roomFurniture, ["dresser"]) && room.areaSqFt >= 80) {
    const dresserRotation = isWide ? 0 : 90
    const dresserFootprint = getFurnitureFootprint("dresser", scale, dresserRotation)
    const dresserPoint = isWide
      ? { x: center.x, y: bounds.maxY - dresserFootprint.depthPx / 2 - marginPx }
      : { x: bounds.maxX - dresserFootprint.widthPx / 2 - marginPx, y: center.y }
    const dresser = createFurnitureInRoom("dresser", room, dresserPoint, dresserRotation)

    if (dresser) {
      items.push(dresser)
    }
  }

  return {
    room,
    category: "bedroom",
    title: `${room.label} layout`,
    description: items.length > 0
      ? `Adds ${items.map((item) => item.label).join(", ")}.`
      : "Bedroom furniture is already represented.",
    dimensions: { widthFt, depthFt },
    items
  }
}

function buildKitchenPlan(room: Room, data: FloorPlanData): RoomLayoutPlan {
  const scale = data.scale || 1
  const bounds = getRoomBounds(room)
  const center = polygonCentroid(room.polygon)
  const roomFurniture = getFurnitureForRoom(room, data.furniture)
  const roomFurnitureTypes = roomFurniture.map((item) => item.type)
  const widthFt = roundTo(bounds.widthPx / scale)
  const depthFt = roundTo(bounds.depthPx / scale)
  const isWide = bounds.widthPx >= bounds.depthPx
  const marginPx = (18 / 12) * scale
  const items: PlannedFurniture[] = []
  const applianceSlots = [
    { type: "refrigerator", ratio: 0.22 },
    { type: "dishwasher", ratio: 0.5 },
    { type: "stove", ratio: 0.78 }
  ]

  for (const slot of applianceSlots) {
    if (roomFurnitureTypes.includes(slot.type)) continue

    const rotation = isWide ? 0 : 90
    const footprint = getFurnitureFootprint(slot.type, scale, rotation)
    const point = isWide
      ? {
          x: bounds.minX + bounds.widthPx * slot.ratio,
          y: bounds.minY + footprint.depthPx / 2 + marginPx
        }
      : {
          x: bounds.minX + footprint.widthPx / 2 + marginPx,
          y: bounds.minY + bounds.depthPx * slot.ratio
        }
    const furniture = createFurnitureInRoom(slot.type, room, point, rotation)

    if (furniture) {
      items.push(furniture)
    }
  }

  if (
    !roomFurnitureTypes.includes("kitchen-island") &&
    room.areaSqFt >= 80 &&
    Math.min(widthFt, depthFt) >= 8
  ) {
    const islandRotation = isWide ? 0 : 90
    const island = createFurniture("kitchen-island", center, islandRotation)

    if (island) {
      items.push(island)
    }
  }

  return {
    room,
    category: "kitchen",
    title: `${room.label} layout`,
    description: items.length > 0
      ? `Adds ${items.map((item) => item.label).join(", ")}.`
      : "Kitchen appliance references are already represented.",
    dimensions: { widthFt, depthFt },
    items
  }
}

export function getRoomLayoutPlans(data: FloorPlanData) {
  return data.rooms.flatMap((room) => {
    const category = getRoomCategory(room)

    if (category === "bedroom") {
      return [buildBedroomPlan(room, data)]
    }

    if (category === "kitchen") {
      return [buildKitchenPlan(room, data)]
    }

    return []
  })
}
