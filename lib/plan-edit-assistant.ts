import { cloneFloorPlanData, syncDerivedData } from "@/lib/geometry"
import type { Door, FloorPlanData, Room, Wall, Window } from "@/lib/types"

export type PlanEditProposal = {
  id: string
  title: string
  focus: string
  summary: string
  data: FloorPlanData
  delta: PlanEditDelta
  constraints: PlanEditConstraintResult[]
  constraintSummary: string
  hasHardConstraintMiss: boolean
  scores: PlanEditScores
  changes: string[]
  checks: string[]
  confidence: number
  isRecommended: boolean
  recommendationReason: string
}

export type PlanEditScores = {
  privacy: number
  flow: number
  programFit: number
  outdoorConnection: number
  renderReadiness: number
  overall: number
}

export type PlanEditConstraintId =
  | "keep-bedroom-count"
  | "keep-bathroom-count"
  | "keep-kitchen"
  | "must-have-mudroom"
  | "improve-privacy"
  | "improve-render-readiness"

export type PlanEditConstraintSettings = {
  lockedIds: PlanEditConstraintId[]
  maxSqFt?: number | null
}

export type PlanEditConstraintStatus = "met" | "review" | "missed"

export type PlanEditConstraintResult = {
  id: PlanEditConstraintId | "max-sqft"
  label: string
  status: PlanEditConstraintStatus
  detail: string
  isHard: boolean
}

export type PlanEditStats = {
  roomCount: number
  wallCount: number
  doorCount: number
  windowCount: number
  totalAreaSqFt: number
  bedroomCount: number
  bathroomCount: number
  outdoorCount: number
}

export type PlanEditDelta = {
  before: PlanEditStats
  after: PlanEditStats
  roomDelta: number
  wallDelta: number
  doorDelta: number
  windowDelta: number
  areaDeltaSqFt: number
  bedroomDelta: number
  bathroomDelta: number
  outdoorDelta: number
  addedRooms: string[]
  removedRooms: string[]
  summary: string[]
}

export type PlanEditRevisionMode = "openai" | "local" | "fallback"

export type PlanEditRevisionDraft = {
  clientId: string
  prompt: string
  sourceLabel: string
  sourceData: FloorPlanData
  proposals: PlanEditProposal[]
  selectedProposalId: string
  mode: PlanEditRevisionMode
}

export type PlanEditRevisionRecord = PlanEditRevisionDraft & {
  id: string
  createdAt: number
}

export type PlanEditVariant = "balanced" | "privacy" | "entertaining" | "openai"

export type AiPlanEditProposal = {
  title: string
  focus: string
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

const EMPTY_CONSTRAINTS: PlanEditConstraintSettings = {
  lockedIds: [],
  maxSqFt: null
}

const CONSTRAINT_LABELS: Record<PlanEditConstraintId, string> = {
  "keep-bedroom-count": "Keep bedroom count",
  "keep-bathroom-count": "Keep bath count",
  "keep-kitchen": "Do not move kitchen",
  "must-have-mudroom": "Must include mudroom",
  "improve-privacy": "Improve privacy",
  "improve-render-readiness": "Improve render readiness"
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

function hasRoom(data: FloorPlanData, pattern: RegExp) {
  return Boolean(findRoom(data, pattern))
}

function countRooms(data: FloorPlanData, pattern: RegExp) {
  return data.rooms.filter((room) => pattern.test(room.label)).length
}

function getRoomCenter(room: Room) {
  const bounds = rectFromRoom(room)
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  }
}

function normalizeRoomLabel(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, " ")
}

function titleCaseRoomLabel(label: string) {
  return label.replace(/\b\w/g, (match: string) => match.toUpperCase())
}

function formatSignedNumber(value: number, suffix = "") {
  if (value === 0) return `no change${suffix}`
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}${suffix}`
}

function getRoomLabelCounts(data: FloorPlanData) {
  return data.rooms.reduce<Record<string, number>>((counts, room) => {
    const label = normalizeRoomLabel(room.label)
    counts[label] = (counts[label] ?? 0) + 1
    return counts
  }, {})
}

export function getPlanEditStats(data: FloorPlanData): PlanEditStats {
  return {
    roomCount: data.rooms.length,
    wallCount: data.walls.length,
    doorCount: data.doors.length,
    windowCount: data.windows.length,
    totalAreaSqFt: Math.round(data.rooms.reduce((total, room) => total + Math.max(room.areaSqFt, 0), 0)),
    bedroomCount: countRooms(data, /bedroom|bed room|guest|primary|suite/i),
    bathroomCount: countRooms(data, /bath|powder/i),
    outdoorCount: countRooms(data, /patio|porch|deck|outdoor|courtyard/i)
  }
}

export function buildPlanEditDelta(beforeData: FloorPlanData, afterData: FloorPlanData): PlanEditDelta {
  const before = getPlanEditStats(beforeData)
  const after = getPlanEditStats(afterData)
  const beforeLabels = getRoomLabelCounts(beforeData)
  const afterLabels = getRoomLabelCounts(afterData)
  const addedRooms = Object.entries(afterLabels)
    .flatMap(([label, count]) => Array(Math.max(0, count - (beforeLabels[label] ?? 0))).fill(label))
    .map((label) => titleCaseRoomLabel(String(label)))
  const removedRooms = Object.entries(beforeLabels)
    .flatMap(([label, count]) => Array(Math.max(0, count - (afterLabels[label] ?? 0))).fill(label))
    .map((label) => titleCaseRoomLabel(String(label)))
  const areaDeltaSqFt = after.totalAreaSqFt - before.totalAreaSqFt
  const roomDelta = after.roomCount - before.roomCount
  const bedroomDelta = after.bedroomCount - before.bedroomCount
  const bathroomDelta = after.bathroomCount - before.bathroomCount
  const outdoorDelta = after.outdoorCount - before.outdoorCount
  const summary = [
    `${formatSignedNumber(roomDelta)} room${Math.abs(roomDelta) === 1 ? "" : "s"}`,
    `${formatSignedNumber(areaDeltaSqFt, " sq ft")} total area`,
    bedroomDelta !== 0 ? `${formatSignedNumber(bedroomDelta)} bedroom${Math.abs(bedroomDelta) === 1 ? "" : "s"}` : "",
    bathroomDelta !== 0 ? `${formatSignedNumber(bathroomDelta)} bath${Math.abs(bathroomDelta) === 1 ? "" : "s"}` : "",
    outdoorDelta !== 0 ? `${formatSignedNumber(outdoorDelta)} outdoor space${Math.abs(outdoorDelta) === 1 ? "" : "s"}` : "",
    addedRooms.length > 0 ? `adds ${addedRooms.slice(0, 3).join(", ")}` : "",
    removedRooms.length > 0 ? `removes ${removedRooms.slice(0, 2).join(", ")}` : ""
  ].filter(Boolean)

  return {
    before,
    after,
    roomDelta,
    wallDelta: after.wallCount - before.wallCount,
    doorDelta: after.doorCount - before.doorCount,
    windowDelta: after.windowCount - before.windowCount,
    areaDeltaSqFt,
    bedroomDelta,
    bathroomDelta,
    outdoorDelta,
    addedRooms,
    removedRooms,
    summary
  }
}

function getConstraintSettings(settings?: PlanEditConstraintSettings): PlanEditConstraintSettings {
  return {
    lockedIds: settings?.lockedIds ?? [],
    maxSqFt: settings?.maxSqFt ?? null
  }
}

function makeConstraintResult(result: PlanEditConstraintResult): PlanEditConstraintResult {
  return result
}

function evaluatePlanEditConstraints(args: {
  source: FloorPlanData
  data: FloorPlanData
  delta: PlanEditDelta
  scores: PlanEditScores
  settings?: PlanEditConstraintSettings
}): PlanEditConstraintResult[] {
  const settings = getConstraintSettings(args.settings)
  const results: PlanEditConstraintResult[] = []
  const sourceKitchen = findRoom(args.source, /kitchen|dining/i)
  const nextKitchen = findRoom(args.data, /kitchen|dining/i)
  const scale = args.source.scale || 18

  if (settings.lockedIds.includes("keep-bedroom-count")) {
    const before = args.delta.before.bedroomCount
    const after = args.delta.after.bedroomCount
    results.push(makeConstraintResult({
      id: "keep-bedroom-count",
      label: CONSTRAINT_LABELS["keep-bedroom-count"],
      status: after === before ? "met" : "missed",
      detail: after === before ? `Kept ${after} bedroom${after === 1 ? "" : "s"}.` : `Changed bedrooms from ${before} to ${after}.`,
      isHard: true
    }))
  }

  if (settings.lockedIds.includes("keep-bathroom-count")) {
    const before = args.delta.before.bathroomCount
    const after = args.delta.after.bathroomCount
    results.push(makeConstraintResult({
      id: "keep-bathroom-count",
      label: CONSTRAINT_LABELS["keep-bathroom-count"],
      status: after === before ? "met" : "missed",
      detail: after === before ? `Kept ${after} bath${after === 1 ? "" : "s"}.` : `Changed baths from ${before} to ${after}.`,
      isHard: true
    }))
  }

  if (settings.lockedIds.includes("keep-kitchen")) {
    let status: PlanEditConstraintStatus = "met"
    let detail = "Kitchen location is preserved."

    if (sourceKitchen && !nextKitchen) {
      status = "missed"
      detail = "The source kitchen/dining room is no longer represented."
    } else if (sourceKitchen && nextKitchen) {
      const sourceCenter = getRoomCenter(sourceKitchen)
      const nextCenter = getRoomCenter(nextKitchen)
      const drift = Math.hypot(nextCenter.x - sourceCenter.x, nextCenter.y - sourceCenter.y)
      const driftFt = Math.round(drift / scale)
      status = drift <= scale * 4 ? "met" : drift <= scale * 8 ? "review" : "missed"
      detail =
        status === "met"
          ? `Kitchen center stays within ${Math.max(1, driftFt)} ft of the source plan.`
          : `Kitchen center shifts about ${driftFt} ft from the source plan.`
    }

    results.push(makeConstraintResult({
      id: "keep-kitchen",
      label: CONSTRAINT_LABELS["keep-kitchen"],
      status,
      detail,
      isHard: true
    }))
  }

  if (settings.lockedIds.includes("must-have-mudroom")) {
    const hasMudroom = hasRoom(args.data, /mudroom|mud room|laundry|drop zone/i)
    results.push(makeConstraintResult({
      id: "must-have-mudroom",
      label: CONSTRAINT_LABELS["must-have-mudroom"],
      status: hasMudroom ? "met" : "missed",
      detail: hasMudroom ? "Mudroom/drop-zone space is represented." : "No mudroom, laundry, or drop-zone room was found.",
      isHard: true
    }))
  }

  if (settings.lockedIds.includes("improve-privacy")) {
    results.push(makeConstraintResult({
      id: "improve-privacy",
      label: CONSTRAINT_LABELS["improve-privacy"],
      status: args.scores.privacy >= 80 ? "met" : args.scores.privacy >= 70 ? "review" : "missed",
      detail: `Privacy score is ${args.scores.privacy}/100 after the edit.`,
      isHard: false
    }))
  }

  if (settings.lockedIds.includes("improve-render-readiness")) {
    results.push(makeConstraintResult({
      id: "improve-render-readiness",
      label: CONSTRAINT_LABELS["improve-render-readiness"],
      status: args.scores.renderReadiness >= 82 ? "met" : args.scores.renderReadiness >= 72 ? "review" : "missed",
      detail: `Render readiness is ${args.scores.renderReadiness}/100 after the edit.`,
      isHard: false
    }))
  }

  if (settings.maxSqFt && settings.maxSqFt > 0) {
    const afterArea = args.delta.after.totalAreaSqFt
    const overBy = afterArea - settings.maxSqFt
    results.push(makeConstraintResult({
      id: "max-sqft",
      label: `Stay under ${settings.maxSqFt.toLocaleString()} sq ft`,
      status: overBy <= 0 ? "met" : overBy <= settings.maxSqFt * 0.05 ? "review" : "missed",
      detail: overBy <= 0
        ? `Plan is ${afterArea.toLocaleString()} sq ft.`
        : `Plan is ${Math.round(overBy).toLocaleString()} sq ft over the limit.`,
      isHard: true
    }))
  }

  return results
}

function summarizeConstraints(results: PlanEditConstraintResult[]) {
  if (results.length === 0) {
    return "No locked constraints"
  }

  const met = results.filter((result) => result.status === "met").length
  const review = results.filter((result) => result.status === "review").length
  const missed = results.filter((result) => result.status === "missed").length
  return `${met} met${review > 0 ? ` / ${review} review` : ""}${missed > 0 ? ` / ${missed} missed` : ""}`
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

function makeTitle(prompt: string, changes: string[], variant: PlanEditVariant) {
  if (variant === "privacy") return "Privacy-First Option"
  if (variant === "entertaining") return "Entertaining Option"
  if (changes.some((change) => /office/i.test(change))) return "Direct Edit Option"
  if (changes.some((change) => /mudroom/i.test(change))) return "Service-Core Option"
  if (changes.some((change) => /bedroom/i.test(change))) return "Bedroom Option"
  if (/private|split/i.test(prompt)) return "Privacy Layout Option"
  return "Balanced Edit Option"
}

function getVariantFocus(variant: PlanEditVariant) {
  if (variant === "privacy") return "Privacy"
  if (variant === "entertaining") return "Entertaining"
  return "Balanced"
}

function scoreHasIntent(prompt: string, pattern: RegExp) {
  return pattern.test(prompt)
}

function clampScore(value: number) {
  return Math.max(45, Math.min(98, Math.round(value)))
}

function calculatePlanEditScores(data: FloorPlanData, prompt: string, variant: PlanEditVariant, changes: string[]): PlanEditScores {
  const bedrooms = countRooms(data, /bedroom|guest|primary|suite/i)
  const hasOffice = hasRoom(data, /office|study|flex|work/i)
  const hasMudroom = hasRoom(data, /mudroom|laundry|drop zone/i)
  const hasKitchen = hasRoom(data, /kitchen|dining/i)
  const hasOutdoor = hasRoom(data, /patio|porch|deck|outdoor/i)
  const hasPrimary = hasRoom(data, /primary|suite/i)
  const exteriorOpenings = data.windows.length + data.doors.filter((door) => door.type === "sliding" || door.type === "double").length
  const roomCount = data.rooms.length

  const wantsOffice = scoreHasIntent(prompt, /office|study|work|flex/)
  const wantsMudroom = scoreHasIntent(prompt, /mudroom|mud room|laundry|drop zone|entry/)
  const wantsKitchen = scoreHasIntent(prompt, /kitchen|dining|cook|island|pantry/)
  const wantsOutdoor = scoreHasIntent(prompt, /patio|porch|deck|outdoor|indoor-outdoor/)
  const wantsPrivacy = scoreHasIntent(prompt, /private|privacy|split|separate|suite/)
  const wantsBedroom = scoreHasIntent(prompt, /bedroom|bed room|4-bed|four bed|guest/)

  let programFit = 62 + changes.length * 4
  if (!wantsOffice || hasOffice) programFit += 7
  if (!wantsMudroom || hasMudroom) programFit += 7
  if (!wantsKitchen || hasKitchen) programFit += 7
  if (!wantsOutdoor || hasOutdoor) programFit += 5
  if (!wantsBedroom || bedrooms >= 3) programFit += 5

  let privacy = 58 + bedrooms * 3 + (hasPrimary ? 8 : 0)
  if (variant === "privacy") privacy += 14
  if (wantsPrivacy && variant !== "privacy") privacy -= 5
  if (hasOffice) privacy += 3

  let flow = 68 + (hasKitchen ? 7 : 0) + (hasMudroom ? 4 : 0) - Math.max(0, roomCount - 9) * 2
  if (variant === "balanced") flow += 8
  if (variant === "entertaining") flow += 5

  let outdoorConnection = 54 + exteriorOpenings * 3
  if (hasOutdoor) outdoorConnection += 24
  if (variant === "entertaining") outdoorConnection += 10
  if (wantsOutdoor && !hasOutdoor) outdoorConnection -= 8

  let renderReadiness = 64 + data.windows.length * 2 + data.doors.length + Math.min(roomCount, 8)
  if (hasOutdoor) renderReadiness += 5
  if (variant === "balanced") renderReadiness += 3

  privacy = clampScore(privacy)
  flow = clampScore(flow)
  programFit = clampScore(programFit)
  outdoorConnection = clampScore(outdoorConnection)
  renderReadiness = clampScore(renderReadiness)

  const outdoorWeight = wantsOutdoor ? 1.25 : 0.85
  const privacyWeight = wantsPrivacy ? 1.25 : 0.95
  const overall = clampScore(
    (privacy * privacyWeight + flow + programFit * 1.3 + outdoorConnection * outdoorWeight + renderReadiness) /
      (privacyWeight + 1 + 1.3 + outdoorWeight + 1)
  )

  return {
    privacy,
    flow,
    programFit,
    outdoorConnection,
    renderReadiness,
    overall
  }
}

export function rankPlanEditProposals(proposals: PlanEditProposal[]): PlanEditProposal[] {
  const rankedProposals = [...proposals].sort((left, right) => {
    const leftHardMisses = left.constraints.filter((constraint) => constraint.isHard && constraint.status === "missed").length
    const rightHardMisses = right.constraints.filter((constraint) => constraint.isHard && constraint.status === "missed").length
    if (leftHardMisses !== rightHardMisses) return leftHardMisses - rightHardMisses
    return right.scores.overall - left.scores.overall
  })
  const recommendedId = rankedProposals[0]?.id

  return rankedProposals.map((proposal) => ({
    ...proposal,
    isRecommended: proposal.id === recommendedId
  }))
}

function makeRecommendationReason(proposal: Pick<PlanEditProposal, "focus" | "scores" | "changes">) {
  const scoreEntries: Array<[string, number]> = [
    ["program fit", proposal.scores.programFit],
    ["privacy", proposal.scores.privacy],
    ["flow", proposal.scores.flow],
    ["outdoor connection", proposal.scores.outdoorConnection],
    ["render readiness", proposal.scores.renderReadiness]
  ]
  const strongestScore = scoreEntries.sort((left, right) => right[1] - left[1])[0]?.[0]

  return `${proposal.focus} option is strongest on ${strongestScore} while covering ${proposal.changes.length} requested change${proposal.changes.length === 1 ? "" : "s"}.`
}

function addVariantIntent(builder: EditBuilder, variant: PlanEditVariant) {
  if (variant === "privacy") {
    const didExpandPrimary = expandRoom(
      builder,
      /primary|suite/i,
      "Pulled the plan toward a quieter primary-suite wing.",
      (builder.data.scale || 18) * 5,
      (builder.data.scale || 18) * 3
    )
    if (!didExpandPrimary) {
      appendModule(builder, "Primary Suite", "right", 15, 13)
    }
    if (!hasRoom(builder.data, /flex|guest/i)) {
      appendModule(builder, "Flex / Guest Room", "right", 11, 10)
    }
    builder.checks.push("Confirm the added private-room wing has a clean hall connection in the editor.")
  }

  if (variant === "entertaining") {
    expandRoom(
      builder,
      /living|great/i,
      "Opened the main living room to support larger gatherings.",
      (builder.data.scale || 18) * 6,
      (builder.data.scale || 18) * 3
    )
    if (!hasRoom(builder.data, /covered patio|patio|porch|deck/i)) {
      appendModule(builder, "Covered Patio", "bottom", 18, 10)
    }
    builder.checks.push("Check exterior doors and window rhythm before moving this option into renders.")
  }
}

export function generatePlanEditProposal(
  source: FloorPlanData,
  prompt: string,
  variant: PlanEditVariant = "balanced",
  constraints?: PlanEditConstraintSettings
): PlanEditProposal {
  const normalizedPrompt = normalizePrompt(prompt)
  const builder = createBuilder(source, `${normalizedPrompt}-${variant}`)
  const wantsKitchen = /kitchen|dining|cook|island|pantry/.test(normalizedPrompt)
  const wantsOffice = /office|study|work|flex/.test(normalizedPrompt)
  const wantsMudroom = /mudroom|mud room|laundry|drop zone|entry/.test(normalizedPrompt)
  const wantsBedroom = /bedroom|bed room|4-bed|four bed|guest/.test(normalizedPrompt)
  const wantsPatio = /patio|porch|deck|outdoor|indoor-outdoor/.test(normalizedPrompt)
  const wantsPrivacy = /private|privacy|split|separate|suite/.test(normalizedPrompt)
  const shouldForcePrivacy = variant === "privacy"
  const shouldForceEntertaining = variant === "entertaining"

  if (wantsKitchen || shouldForceEntertaining) {
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

  if (wantsOffice || (variant === "privacy" && !wantsBedroom)) {
    appendModule(builder, "Office", "right", 11, 10)
  }

  if (wantsMudroom) {
    appendModule(builder, "Mudroom / Laundry", "bottom", 12, 9)
  }

  if (wantsBedroom || shouldForcePrivacy) {
    appendModule(builder, builder.data.rooms.some((room) => /Bedroom 3/i.test(room.label)) ? "Guest Bedroom" : "Bedroom 3", "right", 12, 11)
  }

  if (wantsPatio || shouldForceEntertaining) {
    appendModule(builder, "Covered Patio", "bottom", 18, 10)
  }

  if (wantsPrivacy || shouldForcePrivacy) {
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

  addVariantIntent(builder, variant)

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
  const delta = buildPlanEditDelta(source, data)
  const scores = calculatePlanEditScores(data, normalizedPrompt, variant, builder.changes)
  const constraintResults = evaluatePlanEditConstraints({
    source,
    data,
    delta,
    scores,
    settings: constraints
  })
  const confidence = Math.min(97, 72 + builder.changes.length * 5 + (variant === "balanced" ? 2 : 0))
  const title = makeTitle(normalizedPrompt, builder.changes, variant)
  const focus = getVariantFocus(variant)
  const uniqueChanges = [...new Set(builder.changes)]
  const uniqueChecks = [...new Set(builder.checks)]
  const recommendationReason = makeRecommendationReason({
    focus,
    scores,
    changes: uniqueChanges
  })

  return {
    id: `proposal-${variant}-${Date.now()}`,
    title,
    focus,
    summary: `${focus} interpretation of: "${prompt.trim()}". Save as a new floor so the current plan stays intact.`,
    data,
    delta,
    constraints: constraintResults,
    constraintSummary: summarizeConstraints(constraintResults),
    hasHardConstraintMiss: constraintResults.some((result) => result.isHard && result.status === "missed"),
    scores,
    changes: uniqueChanges,
    checks: uniqueChecks,
    confidence,
    isRecommended: false,
    recommendationReason
  }
}

export function createPlanEditProposalFromAI(
  source: FloorPlanData,
  prompt: string,
  aiProposal: AiPlanEditProposal,
  index: number,
  constraints?: PlanEditConstraintSettings
): PlanEditProposal {
  const data = syncDerivedData(aiProposal.data)
  const changes = [...new Set(aiProposal.changes.map((change) => change.trim()).filter(Boolean))]
  const checks = [...new Set(aiProposal.checks.map((check) => check.trim()).filter(Boolean))]
  const delta = buildPlanEditDelta(source, data)
  const scores = calculatePlanEditScores(data, normalizePrompt(prompt), "openai", changes)
  const constraintResults = evaluatePlanEditConstraints({
    source,
    data,
    delta,
    scores,
    settings: constraints
  })
  const focus = aiProposal.focus.trim() || "OpenAI"
  const recommendationReason = makeRecommendationReason({
    focus,
    scores,
    changes
  })

  return {
    id: `proposal-openai-${index + 1}-${Date.now()}`,
    title: aiProposal.title.trim() || `OpenAI Option ${index + 1}`,
    focus,
    summary: aiProposal.summary.trim() || `OpenAI-generated interpretation of: "${prompt.trim()}".`,
    data,
    delta,
    constraints: constraintResults,
    constraintSummary: summarizeConstraints(constraintResults),
    hasHardConstraintMiss: constraintResults.some((result) => result.isHard && result.status === "missed"),
    scores,
    changes: changes.length > 0 ? changes : ["Generated an editable plan option from the requested brief."],
    checks: checks.length > 0 ? checks : ["Run design review before sending this option to renders."],
    confidence: Math.max(45, Math.min(99, Math.round(aiProposal.confidence))),
    isRecommended: false,
    recommendationReason
  }
}

export function generatePlanEditProposals(
  source: FloorPlanData,
  prompt: string,
  constraints?: PlanEditConstraintSettings
): PlanEditProposal[] {
  const proposals = [
    generatePlanEditProposal(source, prompt, "balanced", constraints),
    generatePlanEditProposal(source, prompt, "privacy", constraints),
    generatePlanEditProposal(source, prompt, "entertaining", constraints)
  ]

  return rankPlanEditProposals(proposals)
}
