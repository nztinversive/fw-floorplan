import { cloneFloorPlanData, syncDerivedData } from "@/lib/geometry"
import type { Door, FloorPlanData, Room, Wall, Window } from "@/lib/types"

export type PlanEditProposal = {
  id: string
  title: string
  summary: string
  data: FloorPlanData
  changes: string[]
  checks: string[]
  confidence: number
}

type Rect = {
  x: number
  y: number
  width: number
  height: number
}

type EditBuilder = {
  data: FloorPlanData
  changes: string[]
  checks: string[]
  nextId: (prefix: string) => string
}

function normalizePrompt(prompt: string) {
  return prompt.trim().toLowerCase()
}

function getPlanBounds(data: FloorPlanData) {
  const points = [
    ...data.walls.flatMap((wall) => [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 }
    ]),
    ...data.rooms.flatMap((room) => room.polygon)
  ]

  if (points.length === 0) {
    return { minX: 80, maxX: 560, minY: 80, maxY: 380, width: 480, height: 300 }
  }

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1)
  }
}

function rectFromRoom(room: Room): Rect {
  const xs = room.polygon.map((point) => point.x)
  const ys = room.polygon.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1)
  }
}

function polygonFromRect(rect: Rect) {
  return [
    { x: Math.round(rect.x), y: Math.round(rect.y) },
    { x: Math.round(rect.x + rect.width), y: Math.round(rect.y) },
    { x: Math.round(rect.x + rect.width), y: Math.round(rect.y + rect.height) },
    { x: Math.round(rect.x), y: Math.round(rect.y + rect.height) }
  ]
}

function createBuilder(source: FloorPlanData, prompt: string): EditBuilder {
  let count = 0
  const slug = prompt
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "edit"

  return {
    data: cloneFloorPlanData(source),
    changes: [],
    checks: [],
    nextId(prefix) {
      count += 1
      return `${prefix}-assistant-${slug}-${count}`
    }
  }
}

function addWall(builder: EditBuilder, x1: number, y1: number, x2: number, y2: number, thickness = 6): Wall {
  const wall = {
    id: builder.nextId("wall"),
    x1: Math.round(x1),
    y1: Math.round(y1),
    x2: Math.round(x2),
    y2: Math.round(y2),
    thickness
  }
  builder.data.walls.push(wall)
  return wall
}

function addDoor(builder: EditBuilder, wall: Wall, position = 0.5, width = 36, type: Door["type"] = "standard") {
  builder.data.doors.push({
    id: builder.nextId("door"),
    wallId: wall.id,
    position,
    width,
    type,
    rotation: 0
  })
}

function addWindow(builder: EditBuilder, wall: Wall, position = 0.5, width = 48, height = 42) {
  const windowEntry: Window = {
    id: builder.nextId("window"),
    wallId: wall.id,
    position,
    width,
    height
  }
  builder.data.windows.push(windowEntry)
}

function addRectangularRoom(builder: EditBuilder, label: string, rect: Rect, options?: { exteriorDoor?: boolean }) {
  const top = addWall(builder, rect.x, rect.y, rect.x + rect.width, rect.y, 8)
  const right = addWall(builder, rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, 8)
  const bottom = addWall(builder, rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height, 8)
  const left = addWall(builder, rect.x, rect.y + rect.height, rect.x, rect.y, 8)

  builder.data.rooms.push({
    id: builder.nextId("room"),
    label,
    polygon: polygonFromRect(rect),
    areaSqFt: 0
  })
  addDoor(builder, left, 0.5, label.toLowerCase().includes("patio") ? 48 : 36, options?.exteriorDoor ? "sliding" : "standard")
  addWindow(builder, right, 0.5, label.toLowerCase().includes("great") ? 60 : 48)

  return { top, right, bottom, left }
}

function findRoom(data: FloorPlanData, pattern: RegExp) {
  return data.rooms.find((room) => pattern.test(room.label))
}

function expandRoom(builder: EditBuilder, pattern: RegExp, label: string, growX: number, growY: number) {
  const room = findRoom(builder.data, pattern)
  if (!room) {
    return false
  }

  const bounds = getPlanBounds(builder.data)
  const rect = rectFromRoom(room)
  const nextRect = {
    x: Math.max(bounds.minX, rect.x - growX * 0.25),
    y: Math.max(bounds.minY, rect.y - growY * 0.2),
    width: Math.min(bounds.maxX - rect.x, rect.width + growX),
    height: Math.min(bounds.maxY - rect.y, rect.height + growY)
  }

  room.polygon = polygonFromRect(nextRect)
  builder.changes.push(label)
  builder.checks.push("Review adjacent walls in the editor after resizing the room zone.")
  return true
}

function appendModule(builder: EditBuilder, label: string, preferred: "right" | "bottom", widthFt: number, heightFt: number) {
  const bounds = getPlanBounds(builder.data)
  const scale = builder.data.scale || 18
  const gap = scale * 0.75
  const moduleIndex = builder.data.rooms.filter((room) => /Office|Mudroom|Bedroom|Patio|Flex/.test(room.label)).length
  const width = widthFt * scale
  const height = heightFt * scale
  const rect =
    preferred === "bottom"
      ? {
          x: bounds.minX + Math.min(moduleIndex * (width * 0.35), Math.max(bounds.width - width, 0)),
          y: bounds.maxY + gap,
          width,
          height
        }
      : {
          x: bounds.maxX + gap,
          y: bounds.minY + Math.min(moduleIndex * (height + gap), Math.max(bounds.height - height, 0)),
          width,
          height
        }

  addRectangularRoom(builder, label, rect, { exteriorDoor: /patio|porch/i.test(label) })
  builder.changes.push(`Added ${label.toLowerCase()} as a safe preview module.`)
}

function makeTitle(prompt: string, changes: string[]) {
  if (changes.some((change) => /office/i.test(change))) return "Office Addition Preview"
  if (changes.some((change) => /mudroom/i.test(change))) return "Mudroom Revision Preview"
  if (changes.some((change) => /bedroom/i.test(change))) return "Bedroom Option Preview"
  if (/private|split/i.test(prompt)) return "Privacy Layout Preview"
  return "Plan Edit Preview"
}

export function generatePlanEditProposal(source: FloorPlanData, prompt: string): PlanEditProposal {
  const normalizedPrompt = normalizePrompt(prompt)
  const builder = createBuilder(source, normalizedPrompt)
  const wantsKitchen = /kitchen|dining|cook|island|pantry/.test(normalizedPrompt)
  const wantsOffice = /office|study|work|flex/.test(normalizedPrompt)
  const wantsMudroom = /mudroom|mud room|laundry|drop zone|entry/.test(normalizedPrompt)
  const wantsBedroom = /bedroom|bed room|4-bed|four bed|guest/.test(normalizedPrompt)
  const wantsPatio = /patio|porch|deck|outdoor|indoor-outdoor/.test(normalizedPrompt)
  const wantsPrivacy = /private|privacy|split|separate|suite/.test(normalizedPrompt)

  if (wantsKitchen) {
    const didExpandKitchen = expandRoom(
      builder,
      /kitchen|dining/i,
      "Expanded the kitchen/dining zone for a more generous daily living core.",
      (builder.data.scale || 18) * 6,
      (builder.data.scale || 18) * 3
    )

    if (!didExpandKitchen) {
      appendModule(builder, "Kitchen / Dining", "bottom", 16, 12)
      builder.changes.push("Added a dedicated kitchen/dining zone because no kitchen room was found.")
    }
  }

  if (wantsOffice) {
    appendModule(builder, "Office", "right", 11, 10)
  }

  if (wantsMudroom) {
    appendModule(builder, "Mudroom / Laundry", "bottom", 12, 9)
  }

  if (wantsBedroom) {
    appendModule(builder, builder.data.rooms.some((room) => /Bedroom 3/i.test(room.label)) ? "Guest Bedroom" : "Bedroom 3", "right", 12, 11)
  }

  if (wantsPatio) {
    appendModule(builder, "Covered Patio", "bottom", 18, 10)
  }

  if (wantsPrivacy) {
    const didExpandPrimary = expandRoom(
      builder,
      /primary|suite/i,
      "Strengthened the primary suite zone for a more private bedroom wing.",
      (builder.data.scale || 18) * 4,
      (builder.data.scale || 18) * 2
    )
    if (!didExpandPrimary) {
      appendModule(builder, "Primary Suite", "right", 15, 13)
    }
  }

  if (builder.changes.length === 0) {
    expandRoom(
      builder,
      /living|great/i,
      "Opened the main living area as the default assistant revision.",
      (builder.data.scale || 18) * 5,
      (builder.data.scale || 18) * 3
    )
    builder.changes.push("Interpreted the request as a broader open-plan refinement.")
  }

  builder.checks.push("Run design review after saving to confirm circulation, doors, windows, and furniture clearances.")
  builder.checks.push("Use the editor to resolve any structural wall alignment before sending to renders.")

  const data = syncDerivedData(builder.data)
  const confidence = Math.min(96, 72 + builder.changes.length * 6)
  const title = makeTitle(normalizedPrompt, builder.changes)

  return {
    id: `proposal-${Date.now()}`,
    title,
    summary: `Assistant interpreted: "${prompt.trim()}". Preview saves as a new floor so the current plan stays intact.`,
    data,
    changes: [...new Set(builder.changes)],
    checks: [...new Set(builder.checks)],
    confidence
  }
}
