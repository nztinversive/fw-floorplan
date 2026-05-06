import { syncDerivedData } from "@/lib/geometry"
import type { Door, FloorPlanData, Room, Wall, Window } from "@/lib/types"

export type FloorPlanConceptBrief = {
  targetSqFt: number
  bedrooms: number
  bathrooms: number
  stories: number
  lotShape: "standard" | "wide" | "narrow" | "corner"
  lifestyle: "open" | "private" | "compact" | "entertaining"
  mustHaves: string
}

export type FloorPlanConcept = {
  id: string
  name: string
  summary: string
  data: FloorPlanData
  estimatedSqFt: number
  roomCount: number
  score: number
  highlights: string[]
  tradeoffs: string[]
}

type Rect = {
  x: number
  y: number
  width: number
  height: number
}

type ConceptBuilder = {
  walls: Wall[]
  rooms: Room[]
  doors: Door[]
  windows: Window[]
  nextId: (prefix: string) => string
}

const SCALE = 18
const ORIGIN_X = 90
const ORIGIN_Y = 82
const WALL_THICKNESS = 8
const PARTITION_THICKNESS = 6

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeBrief(brief: FloorPlanConceptBrief): FloorPlanConceptBrief {
  return {
    ...brief,
    targetSqFt: clamp(Math.round(brief.targetSqFt || 1600), 450, 4200),
    bedrooms: clamp(Math.round(brief.bedrooms || 3), 1, 6),
    bathrooms: clamp(Math.round(brief.bathrooms || 2), 1, 5),
    stories: clamp(Math.round(brief.stories || 1), 1, 3),
    mustHaves: brief.mustHaves.trim()
  }
}

function hasMustHave(brief: FloorPlanConceptBrief, pattern: RegExp) {
  return pattern.test(brief.mustHaves)
}

function getPlanRect(brief: FloorPlanConceptBrief, aspectBias = 1): Rect {
  const lotAspect =
    brief.lotShape === "wide"
      ? 1.85
      : brief.lotShape === "narrow"
        ? 1.08
        : brief.lotShape === "corner"
          ? 1.45
          : 1.55
  const aspect = lotAspect * aspectBias
  const widthFt = clamp(Math.sqrt(brief.targetSqFt * aspect), 34, 86)
  const heightFt = clamp(brief.targetSqFt / widthFt, 24, 62)

  return {
    x: ORIGIN_X,
    y: ORIGIN_Y,
    width: Math.round(widthFt * SCALE),
    height: Math.round(heightFt * SCALE)
  }
}

function createBuilder(seed: string): ConceptBuilder {
  let count = 0
  return {
    walls: [],
    rooms: [],
    doors: [],
    windows: [],
    nextId(prefix) {
      count += 1
      return `${prefix}-${seed}-${count}`
    }
  }
}

function addWall(builder: ConceptBuilder, x1: number, y1: number, x2: number, y2: number, thickness = PARTITION_THICKNESS) {
  const wall: Wall = {
    id: builder.nextId("wall"),
    x1: Math.round(x1),
    y1: Math.round(y1),
    x2: Math.round(x2),
    y2: Math.round(y2),
    thickness
  }
  builder.walls.push(wall)
  return wall
}

function addRoom(builder: ConceptBuilder, label: string, rect: Rect) {
  builder.rooms.push({
    id: builder.nextId("room"),
    label,
    polygon: [
      { x: Math.round(rect.x), y: Math.round(rect.y) },
      { x: Math.round(rect.x + rect.width), y: Math.round(rect.y) },
      { x: Math.round(rect.x + rect.width), y: Math.round(rect.y + rect.height) },
      { x: Math.round(rect.x), y: Math.round(rect.y + rect.height) }
    ],
    areaSqFt: 0
  })
}

function addOuterRect(builder: ConceptBuilder, rect: Rect) {
  const top = addWall(builder, rect.x, rect.y, rect.x + rect.width, rect.y, WALL_THICKNESS)
  const right = addWall(builder, rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, WALL_THICKNESS)
  const bottom = addWall(builder, rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height, WALL_THICKNESS)
  const left = addWall(builder, rect.x, rect.y + rect.height, rect.x, rect.y, WALL_THICKNESS)
  return { top, right, bottom, left }
}

function addDoor(builder: ConceptBuilder, wall: Wall, position = 0.5, width = 36, type: Door["type"] = "standard") {
  builder.doors.push({
    id: builder.nextId("door"),
    wallId: wall.id,
    position,
    width,
    type,
    rotation: 0
  })
}

function addWindow(builder: ConceptBuilder, wall: Wall, position: number, width = 54, height = 48) {
  builder.windows.push({
    id: builder.nextId("window"),
    wallId: wall.id,
    position,
    width,
    height
  })
}

function createConcept(
  builder: ConceptBuilder,
  id: string,
  name: string,
  summary: string,
  score: number,
  highlights: string[],
  tradeoffs: string[]
): FloorPlanConcept {
  const data = syncDerivedData({
    walls: builder.walls,
    rooms: builder.rooms,
    doors: builder.doors,
    windows: builder.windows,
    dimensions: [],
    annotations: [],
    furniture: [],
    scale: SCALE,
    gridSize: 6
  })
  const estimatedSqFt = Math.round(data.rooms.reduce((total, room) => total + room.areaSqFt, 0))

  return {
    id,
    name,
    summary,
    data,
    estimatedSqFt,
    roomCount: data.rooms.length,
    score,
    highlights,
    tradeoffs
  }
}

function buildOpenCoreConcept(brief: FloorPlanConceptBrief): FloorPlanConcept {
  const rect = getPlanRect(brief)
  const builder = createBuilder("open")
  const outer = addOuterRect(builder, rect)
  const publicWidth = rect.width * 0.58
  const privateX = rect.x + publicWidth
  const publicSplitY = rect.y + rect.height * 0.58
  const primaryHeight = rect.height * 0.42
  const bedroomBandHeight = rect.height * 0.32
  const bedroomSplitX = privateX + (rect.width - publicWidth) / 2

  const publicWall = addWall(builder, privateX, rect.y, privateX, rect.y + rect.height)
  const kitchenWall = addWall(builder, rect.x, publicSplitY, privateX, publicSplitY)
  const primaryWall = addWall(builder, privateX, rect.y + primaryHeight, rect.x + rect.width, rect.y + primaryHeight)
  const bedroomWall = addWall(builder, privateX, rect.y + primaryHeight + bedroomBandHeight, rect.x + rect.width, rect.y + primaryHeight + bedroomBandHeight)

  addRoom(builder, "Great Room", { x: rect.x, y: rect.y, width: publicWidth, height: publicSplitY - rect.y })
  addRoom(builder, "Kitchen / Dining", { x: rect.x, y: publicSplitY, width: publicWidth, height: rect.y + rect.height - publicSplitY })
  addRoom(builder, "Primary Suite", { x: privateX, y: rect.y, width: rect.x + rect.width - privateX, height: primaryHeight })

  if (brief.bedrooms >= 3) {
    const divider = addWall(builder, bedroomSplitX, rect.y + primaryHeight, bedroomSplitX, rect.y + primaryHeight + bedroomBandHeight)
    addRoom(builder, "Bedroom 2", { x: privateX, y: rect.y + primaryHeight, width: bedroomSplitX - privateX, height: bedroomBandHeight })
    addRoom(builder, "Bedroom 3", { x: bedroomSplitX, y: rect.y + primaryHeight, width: rect.x + rect.width - bedroomSplitX, height: bedroomBandHeight })
    addDoor(builder, divider, 0.5)
  } else {
    addRoom(builder, "Bedroom 2", { x: privateX, y: rect.y + primaryHeight, width: rect.x + rect.width - privateX, height: bedroomBandHeight })
  }

  addRoom(builder, brief.bathrooms > 2 ? "Bath / Laundry" : "Bath", {
    x: privateX,
    y: rect.y + primaryHeight + bedroomBandHeight,
    width: rect.x + rect.width - privateX,
    height: rect.y + rect.height - (rect.y + primaryHeight + bedroomBandHeight)
  })

  if (hasMustHave(brief, /office|study|work/i)) {
    addRoom(builder, "Pocket Office", {
      x: rect.x + publicWidth * 0.62,
      y: publicSplitY,
      width: publicWidth * 0.38,
      height: (rect.y + rect.height - publicSplitY) * 0.42
    })
  }

  addDoor(builder, publicWall, 0.5, 42)
  addDoor(builder, kitchenWall, 0.42, 42)
  addDoor(builder, primaryWall, 0.36)
  addDoor(builder, bedroomWall, 0.55)
  addDoor(builder, outer.bottom, 0.2, 42)
  addWindow(builder, outer.top, 0.22, 60)
  addWindow(builder, outer.top, 0.72, 60)
  addWindow(builder, outer.right, 0.32, 48)
  addWindow(builder, outer.right, 0.7, 48)

  return createConcept(
    builder,
    "open-core",
    "Open Core Ranch",
    "A broad single-level layout with the kitchen, dining, and great room grouped for fast iteration into exterior render concepts.",
    brief.lifestyle === "open" || brief.lifestyle === "entertaining" ? 94 : 88,
    ["Central open living zone", "Private bedroom wing", "Simple buildable rectangle"],
    ["Less acoustic separation", "Exterior massing is intentionally simple"]
  )
}

function buildSplitBedroomConcept(brief: FloorPlanConceptBrief): FloorPlanConcept {
  const rect = getPlanRect(brief, brief.lotShape === "wide" ? 1.08 : 0.95)
  const builder = createBuilder("split")
  const outer = addOuterRect(builder, rect)
  const wingWidth = rect.width * 0.28
  const rightX = rect.x + rect.width - wingWidth
  const publicTop = rect.y + rect.height * 0.18
  const publicBottom = rect.y + rect.height * 0.64
  const leftWall = addWall(builder, rect.x + wingWidth, rect.y, rect.x + wingWidth, rect.y + rect.height)
  const rightWall = addWall(builder, rightX, rect.y, rightX, rect.y + rect.height)
  const livingWall = addWall(builder, rect.x + wingWidth, publicBottom, rightX, publicBottom)
  const entryWall = addWall(builder, rect.x + wingWidth, publicTop, rightX, publicTop)
  const rightBedroomWall = addWall(builder, rightX, rect.y + rect.height * 0.44, rect.x + rect.width, rect.y + rect.height * 0.44)
  const rightBathWall = addWall(builder, rightX, rect.y + rect.height * 0.72, rect.x + rect.width, rect.y + rect.height * 0.72)

  addRoom(builder, "Primary Suite", { x: rect.x, y: rect.y, width: wingWidth, height: rect.height * 0.62 })
  addRoom(builder, hasMustHave(brief, /closet|wic/i) ? "WIC / Bath" : "Primary Bath", {
    x: rect.x,
    y: rect.y + rect.height * 0.62,
    width: wingWidth,
    height: rect.height * 0.38
  })
  addRoom(builder, "Entry", { x: rect.x + wingWidth, y: rect.y, width: rightX - (rect.x + wingWidth), height: publicTop - rect.y })
  addRoom(builder, "Great Room", { x: rect.x + wingWidth, y: publicTop, width: rightX - (rect.x + wingWidth), height: publicBottom - publicTop })
  addRoom(builder, "Kitchen / Dining", { x: rect.x + wingWidth, y: publicBottom, width: rightX - (rect.x + wingWidth), height: rect.y + rect.height - publicBottom })
  addRoom(builder, "Bedroom 2", { x: rightX, y: rect.y, width: wingWidth, height: rect.height * 0.44 })

  if (brief.bedrooms >= 3) {
    addRoom(builder, "Bedroom 3", { x: rightX, y: rect.y + rect.height * 0.44, width: wingWidth, height: rect.height * 0.28 })
  } else {
    addRoom(builder, "Flex Room", { x: rightX, y: rect.y + rect.height * 0.44, width: wingWidth, height: rect.height * 0.28 })
  }

  addRoom(builder, brief.bathrooms >= 3 ? "Hall Bath / Laundry" : "Hall Bath", {
    x: rightX,
    y: rect.y + rect.height * 0.72,
    width: wingWidth,
    height: rect.height * 0.28
  })

  addDoor(builder, leftWall, 0.36)
  addDoor(builder, rightWall, 0.34)
  addDoor(builder, livingWall, 0.45, 42)
  addDoor(builder, entryWall, 0.5, 42)
  addDoor(builder, rightBedroomWall, 0.5)
  addDoor(builder, rightBathWall, 0.4)
  addDoor(builder, outer.top, 0.5, 42)
  addWindow(builder, outer.left, 0.28, 54)
  addWindow(builder, outer.right, 0.25, 54)
  addWindow(builder, outer.bottom, 0.42, 60)
  addWindow(builder, outer.bottom, 0.68, 48)

  return createConcept(
    builder,
    "split-bedroom",
    "Split Bedroom Plan",
    "A privacy-first option that separates the primary suite from secondary bedrooms around a shared living core.",
    brief.lifestyle === "private" ? 95 : 89,
    ["Primary suite separation", "Clear entry-to-living path", "Strong client-friendly room zoning"],
    ["Longer plumbing runs", "Central living room has fewer exterior walls"]
  )
}

function buildCourtyardConcept(brief: FloorPlanConceptBrief): FloorPlanConcept {
  const rect = getPlanRect(brief, 0.88)
  const builder = createBuilder("court")
  const notchWidth = rect.width * 0.28
  const notchHeight = rect.height * 0.34
  const top = addWall(builder, rect.x, rect.y, rect.x + rect.width, rect.y, WALL_THICKNESS)
  const rightTop = addWall(builder, rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height - notchHeight, WALL_THICKNESS)
  const notchTop = addWall(builder, rect.x + rect.width, rect.y + rect.height - notchHeight, rect.x + rect.width - notchWidth, rect.y + rect.height - notchHeight, WALL_THICKNESS)
  const notchLeft = addWall(builder, rect.x + rect.width - notchWidth, rect.y + rect.height - notchHeight, rect.x + rect.width - notchWidth, rect.y + rect.height, WALL_THICKNESS)
  const bottom = addWall(builder, rect.x + rect.width - notchWidth, rect.y + rect.height, rect.x, rect.y + rect.height, WALL_THICKNESS)
  const left = addWall(builder, rect.x, rect.y + rect.height, rect.x, rect.y, WALL_THICKNESS)
  const publicX = rect.x + rect.width * 0.48
  const publicWall = addWall(builder, publicX, rect.y, publicX, rect.y + rect.height)
  const livingSplit = addWall(builder, rect.x, rect.y + rect.height * 0.54, publicX, rect.y + rect.height * 0.54)
  const bedroomWall = addWall(builder, publicX, rect.y + rect.height * 0.38, rect.x + rect.width, rect.y + rect.height * 0.38)
  const serviceWall = addWall(builder, publicX, rect.y + rect.height * 0.68, rect.x + rect.width - notchWidth, rect.y + rect.height * 0.68)

  addRoom(builder, "Kitchen / Dining", { x: rect.x, y: rect.y, width: publicX - rect.x, height: rect.height * 0.54 })
  addRoom(builder, "Great Room", { x: rect.x, y: rect.y + rect.height * 0.54, width: publicX - rect.x, height: rect.height * 0.46 })
  addRoom(builder, "Primary Suite", { x: publicX, y: rect.y, width: rect.x + rect.width - publicX, height: rect.height * 0.38 })
  addRoom(builder, brief.bedrooms >= 3 ? "Bedrooms 2 / 3" : "Bedroom / Flex", {
    x: publicX,
    y: rect.y + rect.height * 0.38,
    width: rect.x + rect.width - publicX,
    height: rect.height * 0.3
  })
  addRoom(builder, hasMustHave(brief, /mud|laundry|pantry/i) ? "Mudroom / Pantry" : "Bath / Laundry", {
    x: publicX,
    y: rect.y + rect.height * 0.68,
    width: rect.x + rect.width - notchWidth - publicX,
    height: rect.height * 0.32
  })

  addDoor(builder, publicWall, 0.48, 42)
  addDoor(builder, livingSplit, 0.45, 42)
  addDoor(builder, bedroomWall, 0.42)
  addDoor(builder, serviceWall, 0.35)
  addDoor(builder, bottom, 0.22, 42)
  addWindow(builder, top, 0.24, 60)
  addWindow(builder, top, 0.72, 54)
  addWindow(builder, rightTop, 0.3, 48)
  addWindow(builder, notchTop, 0.45, 54)
  addWindow(builder, left, 0.68, 60)

  return createConcept(
    builder,
    "courtyard-l",
    "Courtyard L-Plan",
    "An L-shaped option that creates an outdoor pocket for daylight, patio connection, and more expressive massing.",
    brief.lotShape === "corner" || brief.lifestyle === "entertaining" ? 93 : 86,
    ["Built-in patio edge", "Better daylight potential", "More distinctive render massing"],
    ["Slightly less efficient footprint", "May need more detailing at the inside corner"]
  )
}

export function generateFloorPlanConcepts(rawBrief: FloorPlanConceptBrief): FloorPlanConcept[] {
  const brief = normalizeBrief(rawBrief)
  return [
    buildOpenCoreConcept(brief),
    buildSplitBedroomConcept(brief),
    buildCourtyardConcept(brief)
  ].sort((left, right) => right.score - left.score)
}
