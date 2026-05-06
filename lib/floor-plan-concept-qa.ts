import type { FloorPlanConcept, FloorPlanConceptBrief } from "@/lib/floor-plan-concepts"
import type { FloorPlanData, Room } from "@/lib/types"

export type FloorPlanConceptQAStatus = "ready" | "review" | "fix"
export type FloorPlanConceptRepairFocus = "fit" | "compact" | "privacy" | "outdoor"

export type FloorPlanConceptQACheck = {
  key: string
  title: string
  status: FloorPlanConceptQAStatus
  detail: string
}

export type FloorPlanConceptRepairAction = {
  focus: FloorPlanConceptRepairFocus
  label: string
  detail: string
  brief: FloorPlanConceptBrief
}

export type FloorPlanConceptQAReport = {
  status: FloorPlanConceptQAStatus
  score: number
  summary: string
  checks: FloorPlanConceptQACheck[]
  actions: FloorPlanConceptRepairAction[]
}

type RoomBounds = {
  room: Room
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

function roomMatches(room: Room, pattern: RegExp) {
  return pattern.test(normalizeText(room.label))
}

function countRooms(data: FloorPlanData, pattern: RegExp) {
  return data.rooms.filter((room) => roomMatches(room, pattern)).length
}

function hasRoom(data: FloorPlanData, pattern: RegExp) {
  return data.rooms.some((room) => roomMatches(room, pattern))
}

function getRoomBounds(room: Room): RoomBounds {
  const xs = room.polygon.map((point) => point.x)
  const ys = room.polygon.map((point) => point.y)

  return {
    room,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  }
}

function getGap(left: RoomBounds, right: RoomBounds) {
  const horizontalGap = Math.max(0, Math.max(left.minX, right.minX) - Math.min(left.maxX, right.maxX))
  const verticalGap = Math.max(0, Math.max(left.minY, right.minY) - Math.min(left.maxY, right.maxY))
  return Math.hypot(horizontalGap, verticalGap)
}

function getOverlapLength(a1: number, a2: number, b1: number, b2: number) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
}

function roomsTouchOrNearlyTouch(left: RoomBounds, right: RoomBounds, tolerance: number) {
  const horizontalOverlap = getOverlapLength(left.minX, left.maxX, right.minX, right.maxX)
  const verticalOverlap = getOverlapLength(left.minY, left.maxY, right.minY, right.maxY)
  const xGap = Math.max(0, Math.max(left.minX, right.minX) - Math.min(left.maxX, right.maxX))
  const yGap = Math.max(0, Math.max(left.minY, right.minY) - Math.min(left.maxY, right.maxY))

  return (
    (horizontalOverlap > tolerance && yGap <= tolerance) ||
    (verticalOverlap > tolerance && xGap <= tolerance) ||
    getGap(left, right) <= tolerance
  )
}

function getConnectivityReport(data: FloorPlanData) {
  const interiorRooms = data.rooms.filter((room) => !roomMatches(room, /patio|porch|deck|courtyard|covered entry/))
  const bounds = interiorRooms.map(getRoomBounds)
  const tolerance = Math.max(data.scale * 1.25, 18)
  const visited = new Set<number>()
  let components = 0

  for (let index = 0; index < bounds.length; index += 1) {
    if (visited.has(index)) continue
    components += 1
    const queue = [index]
    visited.add(index)

    while (queue.length > 0) {
      const current = queue.shift()!
      for (let next = 0; next < bounds.length; next += 1) {
        if (visited.has(next)) continue
        if (!roomsTouchOrNearlyTouch(bounds[current], bounds[next], tolerance)) continue
        visited.add(next)
        queue.push(next)
      }
    }
  }

  return {
    components,
    interiorRoomCount: interiorRooms.length
  }
}

function getMustHaveGaps(data: FloorPlanData, brief: FloorPlanConceptBrief) {
  const mustHaves = normalizeText(brief.mustHaves)
  const gaps: string[] = []

  const requiredPatterns = [
    { test: /mud\s*room|mudroom|drop zone/, label: "mudroom", room: /mud|drop zone/ },
    { test: /pantry|walk-in pantry|walk in pantry/, label: "pantry", room: /pantry/ },
    { test: /office|study|work from home/, label: "office", room: /office|study|flex/ },
    { test: /laundry/, label: "laundry", room: /laundry/ },
    { test: /patio|porch|deck|outdoor|indoor-outdoor|indoor outdoor/, label: "outdoor living", room: /patio|porch|deck|courtyard|outdoor/ },
    { test: /covered entry|front porch/, label: "covered entry", room: /covered entry|porch|entry/ },
    { test: /walk-in closet|walk in closet|wic/, label: "walk-in closet", room: /closet|wic/ }
  ]

  for (const pattern of requiredPatterns) {
    if (pattern.test.test(mustHaves) && !hasRoom(data, pattern.room)) {
      gaps.push(pattern.label)
    }
  }

  return gaps
}

function getSizingIssues(data: FloorPlanData) {
  const issues: string[] = []
  const bedrooms = data.rooms.filter((room) => roomMatches(room, /bedroom|primary suite|primary bedroom|guest/))
  const bathrooms = data.rooms.filter((room) => roomMatches(room, /bath|powder/))

  const tinyBedroom = bedrooms.find((room) => room.areaSqFt < 100)
  const oversizedBath = bathrooms.find((room) => room.areaSqFt > 150)
  const smallPrimary = data.rooms.find((room) => roomMatches(room, /primary suite|primary bedroom/) && room.areaSqFt < 160)

  if (tinyBedroom) issues.push(`${tinyBedroom.label} is only ${Math.round(tinyBedroom.areaSqFt)} sq ft`)
  if (smallPrimary) issues.push(`${smallPrimary.label} needs more area`)
  if (oversizedBath) issues.push(`${oversizedBath.label} looks oversized`)

  return issues
}

function mergeMustHave(base: string, addition: string) {
  const normalizedBase = normalizeText(base)
  const normalizedAddition = normalizeText(addition)
  if (normalizedBase.includes(normalizedAddition)) {
    return base
  }
  return `${base.trim()}${base.trim() ? ", " : ""}${addition}`
}

function makeRepairBrief(
  brief: FloorPlanConceptBrief,
  focus: FloorPlanConceptRepairFocus,
  reportChecks: FloorPlanConceptQACheck[]
): FloorPlanConceptBrief {
  const next: FloorPlanConceptBrief = { ...brief }
  const fixDetails = reportChecks
    .filter((check) => check.status !== "ready")
    .map((check) => check.detail)
    .join("; ")

  if (focus === "fit") {
    next.mustHaves = mergeMustHave(
      next.mustHaves,
      `repair generated plan quality: ${fixDetails || "tighten room count, sizing, and required spaces"}`
    )
  }

  if (focus === "compact") {
    next.lifestyle = "compact"
    next.mustHaves = mergeMustHave(next.mustHaves, "make the plan more compact and keep conditioned area close to target")
  }

  if (focus === "privacy") {
    next.lifestyle = "private"
    next.mustHaves = mergeMustHave(next.mustHaves, "improve bedroom privacy with a separated primary suite and clear circulation")
  }

  if (focus === "outdoor") {
    next.lifestyle = "entertaining"
    next.mustHaves = mergeMustHave(next.mustHaves, "strengthen indoor-outdoor connection with patio access from main living areas")
  }

  return next
}

function createAction(
  brief: FloorPlanConceptBrief,
  focus: FloorPlanConceptRepairFocus,
  checks: FloorPlanConceptQACheck[],
  label: string,
  detail: string
): FloorPlanConceptRepairAction {
  return {
    focus,
    label,
    detail,
    brief: makeRepairBrief(brief, focus, checks)
  }
}

export function evaluateFloorPlanConcept(
  concept: FloorPlanConcept,
  brief: FloorPlanConceptBrief
): FloorPlanConceptQAReport {
  const checks: FloorPlanConceptQACheck[] = []
  const data = concept.data
  const targetSqFt = clamp(Math.round(brief.targetSqFt || 1600), 450, 4200)
  const sqftDrift = Math.abs(concept.estimatedSqFt - targetSqFt) / targetSqFt
  const bedroomCount = countRooms(data, /bedroom|primary suite|primary bedroom|guest/)
  const bathroomCount = countRooms(data, /bath|powder/)
  const mustHaveGaps = getMustHaveGaps(data, brief)
  const sizingIssues = getSizingIssues(data)
  const connectivity = getConnectivityReport(data)
  const hasOutdoorNeed = /patio|porch|deck|outdoor|indoor-outdoor|indoor outdoor/.test(normalizeText(brief.mustHaves)) || brief.lifestyle === "entertaining"
  const hasOutdoorRoom = hasRoom(data, /patio|porch|deck|courtyard|outdoor/)

  checks.push({
    key: "target-fit",
    title: "Area fit",
    status: sqftDrift <= 0.15 ? "ready" : sqftDrift <= 0.25 ? "review" : "fix",
    detail:
      sqftDrift <= 0.15
        ? `${concept.estimatedSqFt.toLocaleString()} sq ft is close to the ${targetSqFt.toLocaleString()} sq ft target.`
        : `${concept.estimatedSqFt.toLocaleString()} sq ft is ${Math.round(sqftDrift * 100)}% off the ${targetSqFt.toLocaleString()} sq ft target.`
  })

  checks.push({
    key: "program",
    title: "Program fit",
    status:
      bedroomCount >= brief.bedrooms && bathroomCount >= brief.bathrooms && mustHaveGaps.length === 0
        ? "ready"
        : bedroomCount >= brief.bedrooms && bathroomCount >= brief.bathrooms
          ? "review"
          : "fix",
    detail:
      bedroomCount >= brief.bedrooms && bathroomCount >= brief.bathrooms && mustHaveGaps.length === 0
        ? `${bedroomCount} bedrooms, ${bathroomCount} baths, and requested must-haves are represented.`
        : [
            bedroomCount < brief.bedrooms ? `needs ${brief.bedrooms - bedroomCount} more bedroom${brief.bedrooms - bedroomCount === 1 ? "" : "s"}` : "",
            bathroomCount < brief.bathrooms ? `needs ${brief.bathrooms - bathroomCount} more bath${brief.bathrooms - bathroomCount === 1 ? "" : "s"}` : "",
            mustHaveGaps.length > 0 ? `missing ${mustHaveGaps.join(", ")}` : ""
          ].filter(Boolean).join("; ")
  })

  checks.push({
    key: "room-sizing",
    title: "Room sizing",
    status: sizingIssues.length === 0 ? "ready" : sizingIssues.length === 1 ? "review" : "fix",
    detail: sizingIssues.length === 0 ? "Bedrooms, bathrooms, and suite spaces are within workable ranges." : sizingIssues.join("; ")
  })

  checks.push({
    key: "connectivity",
    title: "Connected layout",
    status: connectivity.components <= 1 ? "ready" : connectivity.components === 2 ? "review" : "fix",
    detail:
      connectivity.components <= 1
        ? `${connectivity.interiorRoomCount} interior rooms form one connected layout.`
        : `${connectivity.components} separate room groups may need tighter adjacency.`
  })

  checks.push({
    key: "openings",
    title: "Doors and windows",
    status: data.doors.length >= 2 && data.windows.length >= 3 ? "ready" : data.doors.length >= 1 && data.windows.length >= 2 ? "review" : "fix",
    detail:
      data.doors.length >= 2 && data.windows.length >= 3
        ? `${data.doors.length} doors and ${data.windows.length} windows are available for editing/render prompts.`
        : `Only ${data.doors.length} doors and ${data.windows.length} windows were generated.`
  })

  checks.push({
    key: "outdoor",
    title: "Outdoor connection",
    status: !hasOutdoorNeed || hasOutdoorRoom ? "ready" : "review",
    detail:
      !hasOutdoorNeed
        ? "Outdoor connection was not a primary requirement."
        : hasOutdoorRoom
          ? "Outdoor living space is represented in the concept."
          : "Add a patio, porch, deck, or courtyard connection before rendering."
  })

  const fixCount = checks.filter((check) => check.status === "fix").length
  const reviewCount = checks.filter((check) => check.status === "review").length
  const readyCount = checks.filter((check) => check.status === "ready").length
  const score = clamp(Math.round((readyCount / checks.length) * 100 - fixCount * 10 - reviewCount * 3), 0, 100)
  const status: FloorPlanConceptQAStatus = fixCount > 0 ? "fix" : reviewCount > 0 ? "review" : "ready"
  const actions: FloorPlanConceptRepairAction[] = [
    createAction(brief, "fit", checks, "Fix plan", "Regenerate with the QA gaps folded into the brief."),
    createAction(brief, "compact", checks, "Make compact", "Tighten the footprint and area fit."),
    createAction(brief, "privacy", checks, "Improve privacy", "Separate bedrooms and strengthen circulation."),
    createAction(brief, "outdoor", checks, "Improve outdoor", "Strengthen patio, porch, or deck adjacency.")
  ]

  return {
    status,
    score,
    summary:
      status === "ready"
        ? "Ready to save or send into editing."
        : status === "review"
          ? `${reviewCount} item${reviewCount === 1 ? "" : "s"} to review before saving.`
          : `${fixCount} issue${fixCount === 1 ? "" : "s"} should be fixed before saving.`,
    checks,
    actions
  }
}
