import { syncDerivedData } from "@/lib/geometry"
import type { Door, FloorPlanData, Room, Wall, Window } from "@/lib/types"

export type FloorPlanTemplate = {
  id: string
  name: string
  description: string
  data: FloorPlanData
}

let _idCounter = 0
function tid(prefix: string): string {
  _idCounter += 1
  return `${prefix}-tpl-${_idCounter}`
}

function buildTemplate(
  walls: Omit<Wall, "id">[],
  rooms: Omit<Room, "id">[],
  doors: Omit<Door, "id">[],
  windows: Omit<Window, "id">[]
): FloorPlanData {
  _idCounter = 0
  const wallsWithIds = walls.map((w) => ({ id: tid("wall"), ...w }))
  const roomsWithIds = rooms.map((r) => ({ id: tid("room"), ...r }))
  const doorsWithIds = doors.map((d) => ({ id: tid("door"), ...d }))
  const windowsWithIds = windows.map((w) => ({ id: tid("window"), ...w }))

  return syncDerivedData({
    walls: wallsWithIds,
    rooms: roomsWithIds,
    doors: doorsWithIds,
    windows: windowsWithIds,
    dimensions: [],
    annotations: [],
    furniture: [],
    scale: 24,
    gridSize: 6
  })
}

const ranchData = buildTemplate(
  [
    // Outer walls
    { x1: 80, y1: 80, x2: 680, y2: 80, thickness: 8 },
    { x1: 680, y1: 80, x2: 680, y2: 440, thickness: 8 },
    { x1: 680, y1: 440, x2: 80, y2: 440, thickness: 8 },
    { x1: 80, y1: 440, x2: 80, y2: 80, thickness: 8 },
    // Interior walls
    { x1: 320, y1: 80, x2: 320, y2: 280, thickness: 6 },
    { x1: 320, y1: 280, x2: 80, y2: 280, thickness: 6 },
    { x1: 320, y1: 280, x2: 680, y2: 280, thickness: 6 },
    { x1: 480, y1: 80, x2: 480, y2: 280, thickness: 6 },
    { x1: 200, y1: 280, x2: 200, y2: 440, thickness: 6 },
  ],
  [
    { label: "Living Room", polygon: [{ x: 320, y: 280 }, { x: 680, y: 280 }, { x: 680, y: 440 }, { x: 80, y: 440 }, { x: 80, y: 280 }, { x: 200, y: 280 }, { x: 200, y: 440 }], areaSqFt: 0 },
    { label: "Primary Bedroom", polygon: [{ x: 80, y: 80 }, { x: 320, y: 80 }, { x: 320, y: 280 }, { x: 80, y: 280 }], areaSqFt: 0 },
    { label: "Bedroom 2", polygon: [{ x: 320, y: 80 }, { x: 480, y: 80 }, { x: 480, y: 280 }, { x: 320, y: 280 }], areaSqFt: 0 },
    { label: "Bedroom 3", polygon: [{ x: 480, y: 80 }, { x: 680, y: 80 }, { x: 680, y: 280 }, { x: 480, y: 280 }], areaSqFt: 0 },
    { label: "Kitchen", polygon: [{ x: 80, y: 280 }, { x: 200, y: 280 }, { x: 200, y: 440 }, { x: 80, y: 440 }], areaSqFt: 0 },
  ],
  [
    { wallId: "wall-tpl-6", position: 0.5, width: 36, type: "standard", rotation: 0 },
    { wallId: "wall-tpl-9", position: 0.5, width: 36, type: "standard", rotation: 0 },
  ],
  [
    { wallId: "wall-tpl-1", position: 0.25, width: 48, height: 42 },
    { wallId: "wall-tpl-1", position: 0.75, width: 48, height: 42 },
    { wallId: "wall-tpl-2", position: 0.6, width: 54, height: 48 },
  ]
)

const colonialData = buildTemplate(
  [
    // Outer walls
    { x1: 80, y1: 80, x2: 700, y2: 80, thickness: 8 },
    { x1: 700, y1: 80, x2: 700, y2: 500, thickness: 8 },
    { x1: 700, y1: 500, x2: 80, y2: 500, thickness: 8 },
    { x1: 80, y1: 500, x2: 80, y2: 80, thickness: 8 },
    // Interior
    { x1: 380, y1: 80, x2: 380, y2: 300, thickness: 6 },
    { x1: 80, y1: 300, x2: 700, y2: 300, thickness: 6 },
    { x1: 380, y1: 300, x2: 380, y2: 500, thickness: 6 },
    { x1: 220, y1: 300, x2: 220, y2: 500, thickness: 6 },
  ],
  [
    { label: "Formal Living", polygon: [{ x: 80, y: 80 }, { x: 380, y: 80 }, { x: 380, y: 300 }, { x: 80, y: 300 }], areaSqFt: 0 },
    { label: "Study", polygon: [{ x: 380, y: 80 }, { x: 700, y: 80 }, { x: 700, y: 300 }, { x: 380, y: 300 }], areaSqFt: 0 },
    { label: "Formal Dining", polygon: [{ x: 80, y: 300 }, { x: 220, y: 300 }, { x: 220, y: 500 }, { x: 80, y: 500 }], areaSqFt: 0 },
    { label: "Kitchen", polygon: [{ x: 220, y: 300 }, { x: 380, y: 300 }, { x: 380, y: 500 }, { x: 220, y: 500 }], areaSqFt: 0 },
    { label: "Family Room", polygon: [{ x: 380, y: 300 }, { x: 700, y: 300 }, { x: 700, y: 500 }, { x: 380, y: 500 }], areaSqFt: 0 },
  ],
  [
    { wallId: "wall-tpl-5", position: 0.7, width: 36, type: "standard", rotation: 0 },
    { wallId: "wall-tpl-8", position: 0.5, width: 36, type: "standard", rotation: 0 },
  ],
  [
    { wallId: "wall-tpl-1", position: 0.3, width: 54, height: 48 },
    { wallId: "wall-tpl-2", position: 0.4, width: 48, height: 42 },
    { wallId: "wall-tpl-3", position: 0.7, width: 54, height: 48 },
  ]
)

const lShapeData = buildTemplate(
  [
    // L-shape outer
    { x1: 80, y1: 80, x2: 500, y2: 80, thickness: 8 },
    { x1: 500, y1: 80, x2: 500, y2: 260, thickness: 8 },
    { x1: 500, y1: 260, x2: 680, y2: 260, thickness: 8 },
    { x1: 680, y1: 260, x2: 680, y2: 480, thickness: 8 },
    { x1: 680, y1: 480, x2: 80, y2: 480, thickness: 8 },
    { x1: 80, y1: 480, x2: 80, y2: 80, thickness: 8 },
    // Interior
    { x1: 300, y1: 80, x2: 300, y2: 480, thickness: 6 },
    { x1: 300, y1: 260, x2: 500, y2: 260, thickness: 6 },
  ],
  [
    { label: "Living Room", polygon: [{ x: 80, y: 80 }, { x: 300, y: 80 }, { x: 300, y: 480 }, { x: 80, y: 480 }], areaSqFt: 0 },
    { label: "Bedroom", polygon: [{ x: 300, y: 80 }, { x: 500, y: 80 }, { x: 500, y: 260 }, { x: 300, y: 260 }], areaSqFt: 0 },
    { label: "Kitchen", polygon: [{ x: 300, y: 260 }, { x: 680, y: 260 }, { x: 680, y: 480 }, { x: 300, y: 480 }], areaSqFt: 0 },
  ],
  [
    { wallId: "wall-tpl-7", position: 0.4, width: 36, type: "standard", rotation: 0 },
  ],
  [
    { wallId: "wall-tpl-1", position: 0.35, width: 54, height: 48 },
    { wallId: "wall-tpl-4", position: 0.5, width: 48, height: 42 },
  ]
)

const studioData = buildTemplate(
  [
    // Outer walls
    { x1: 120, y1: 120, x2: 520, y2: 120, thickness: 8 },
    { x1: 520, y1: 120, x2: 520, y2: 400, thickness: 8 },
    { x1: 520, y1: 400, x2: 120, y2: 400, thickness: 8 },
    { x1: 120, y1: 400, x2: 120, y2: 120, thickness: 8 },
    // Bathroom partition
    { x1: 380, y1: 120, x2: 380, y2: 240, thickness: 6 },
    { x1: 380, y1: 240, x2: 520, y2: 240, thickness: 6 },
  ],
  [
    { label: "Studio", polygon: [{ x: 120, y: 120 }, { x: 380, y: 120 }, { x: 380, y: 240 }, { x: 520, y: 240 }, { x: 520, y: 400 }, { x: 120, y: 400 }], areaSqFt: 0 },
    { label: "Bathroom", polygon: [{ x: 380, y: 120 }, { x: 520, y: 120 }, { x: 520, y: 240 }, { x: 380, y: 240 }], areaSqFt: 0 },
  ],
  [
    { wallId: "wall-tpl-5", position: 0.8, width: 30, type: "standard", rotation: 0 },
  ],
  [
    { wallId: "wall-tpl-1", position: 0.4, width: 48, height: 42 },
    { wallId: "wall-tpl-3", position: 0.5, width: 48, height: 42 },
  ]
)

export const FLOOR_PLAN_TEMPLATES: FloorPlanTemplate[] = [
  { id: "ranch", name: "Ranch", description: "Single-story, 3 bedrooms, kitchen, living room", data: ranchData },
  { id: "colonial", name: "Colonial", description: "Formal living, study, dining, kitchen, family room", data: colonialData },
  { id: "l-shape", name: "L-Shape", description: "L-shaped layout with living, bedroom, kitchen", data: lShapeData },
  { id: "studio", name: "Studio", description: "Open-plan studio with bathroom partition", data: studioData },
]
