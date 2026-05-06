import OpenAI from "openai";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import type { Door, FloorPlanData, Room, Wall, Window } from "../lib/types";
import { floorPlanDataValidator } from "./validators";

type PlanEditConstraintId =
  | "keep-bedroom-count"
  | "keep-bathroom-count"
  | "keep-kitchen"
  | "must-have-mudroom"
  | "improve-privacy"
  | "improve-render-readiness";

type AiRoomRect = {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  role: "public" | "private" | "service" | "circulation" | "outdoor";
};

type AiOpening = {
  roomLabel: string;
  edge: "top" | "right" | "bottom" | "left";
  position: number;
};

type AiPlanEdit = {
  title: string;
  focus: string;
  summary: string;
  confidence: number;
  changes: string[];
  checks: string[];
  rooms: AiRoomRect[];
  exteriorDoors: AiOpening[];
  windows: AiOpening[];
};

type AiPlanEditResponse = {
  proposals: AiPlanEdit[];
};

const WALL_THICKNESS = 8;
const PARTITION_THICKNESS = 6;

const planEditConstraintIdValidator = v.union(
  v.literal("keep-bedroom-count"),
  v.literal("keep-bathroom-count"),
  v.literal("keep-kitchen"),
  v.literal("must-have-mudroom"),
  v.literal("improve-privacy"),
  v.literal("improve-render-readiness")
);

const planEditConstraintSettingsValidator = v.object({
  lockedIds: v.array(planEditConstraintIdValidator),
  maxSqFt: v.optional(v.union(v.number(), v.null()))
});

const planEditSchema = {
  type: "object",
  additionalProperties: false,
  required: ["proposals"],
  properties: {
    proposals: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "focus",
          "summary",
          "confidence",
          "changes",
          "checks",
          "rooms",
          "exteriorDoors",
          "windows"
        ],
        properties: {
          title: { type: "string" },
          focus: {
            type: "string",
            enum: ["Balanced", "Privacy", "Efficiency", "Entertaining", "Render Ready", "Program Fit"]
          },
          summary: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 100 },
          changes: {
            type: "array",
            minItems: 3,
            maxItems: 6,
            items: { type: "string" }
          },
          checks: {
            type: "array",
            minItems: 2,
            maxItems: 5,
            items: { type: "string" }
          },
          rooms: {
            type: "array",
            minItems: 4,
            maxItems: 18,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "x", "y", "width", "height", "role"],
              properties: {
                label: { type: "string" },
                x: { type: "number", description: "Room left coordinate in feet." },
                y: { type: "number", description: "Room top coordinate in feet." },
                width: { type: "number", description: "Room width in feet." },
                height: { type: "number", description: "Room height in feet." },
                role: {
                  type: "string",
                  enum: ["public", "private", "service", "circulation", "outdoor"]
                }
              }
            }
          },
          exteriorDoors: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["roomLabel", "edge", "position"],
              properties: {
                roomLabel: { type: "string" },
                edge: { type: "string", enum: ["top", "right", "bottom", "left"] },
                position: { type: "number", minimum: 0.1, maximum: 0.9 }
              }
            }
          },
          windows: {
            type: "array",
            minItems: 2,
            maxItems: 14,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["roomLabel", "edge", "position"],
              properties: {
                roomLabel: { type: "string" },
                edge: { type: "string", enum: ["top", "right", "bottom", "left"] },
                position: { type: "number", minimum: 0.1, maximum: 0.9 }
              }
            }
          }
        }
      }
    }
  }
} as const;

const systemPrompt = `
You are an expert residential floor plan editor for a home design application.
Return three editable plan revision options as structured JSON only.

You receive a current floor plan summary, a user edit request, and locked constraints.
Create three plan alternatives that remain editable after conversion to walls, rooms, doors, and windows.

Rules:
- Coordinates are in feet with x/y using a top-left origin.
- Keep room rectangles orthogonal and aligned into a coherent home plan.
- Preserve hard constraints whenever possible. If a hard constraint cannot be fully met, make the closest practical option and explain the issue in checks.
- Treat existing room names and counts as important context.
- Include all major existing program rooms unless the user explicitly asks to remove them.
- Prefer room labels that are easy to edit: Great Room, Kitchen / Dining, Primary Suite, Bedroom 2, Hall Bath, Mudroom, Laundry, Office, Entry, Covered Patio.
- Return three meaningfully different options: balanced, privacy/efficiency, and render-ready/design direction.
- Avoid impossible layouts: no negative sizes, no tiny bedrooms, no bathrooms larger than bedrooms.
- Windows should be assigned to exterior-facing room edges. Exterior doors should connect entry, living, kitchen/dining, mudroom, or patio spaces.
`;

const constraintLabels: Record<PlanEditConstraintId, string> = {
  "keep-bedroom-count": "Keep the current bedroom count",
  "keep-bathroom-count": "Keep the current bathroom count",
  "keep-kitchen": "Keep the kitchen/dining zone in roughly the same location",
  "must-have-mudroom": "Must include a mudroom, laundry, or drop-zone room",
  "improve-privacy": "Improve private bedroom/suite separation",
  "improve-render-readiness": "Improve exterior logic, windows, entry, and render readiness"
};

function extractTextOutput(response: unknown): string {
  const candidate = response as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (candidate.output_text) {
    return candidate.output_text;
  }

  for (const message of candidate.output ?? []) {
    for (const item of message.content ?? []) {
      if (item.type === "output_text" && item.text) {
        return item.text;
      }
    }
  }

  throw new Error("OpenAI response did not include text output");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeLabel(label: string) {
  return label.trim().replace(/\s+/g, " ") || "Room";
}

function ensureUniqueLabels(rooms: AiRoomRect[]) {
  const totals = new Map<string, number>();
  const counts = new Map<string, number>();

  for (const room of rooms) {
    const label = normalizeLabel(room.label);
    totals.set(label, (totals.get(label) ?? 0) + 1);
  }

  return rooms.map((room) => {
    const label = normalizeLabel(room.label);
    const total = totals.get(label) ?? 0;
    if (total <= 1) {
      return { ...room, label };
    }

    const next = (counts.get(label) ?? 0) + 1;
    counts.set(label, next);
    return { ...room, label: `${label} ${next}` };
  });
}

function edgeKey(x1: number, y1: number, x2: number, y2: number) {
  const start = `${Math.round(x1)}:${Math.round(y1)}`;
  const end = `${Math.round(x2)}:${Math.round(y2)}`;
  return start < end ? `${start}|${end}` : `${end}|${start}`;
}

function getRoomEdge(room: Room, edge: AiOpening["edge"]) {
  const [topLeft, topRight, bottomRight, bottomLeft] = room.polygon;

  if (edge === "top") return { x1: topLeft.x, y1: topLeft.y, x2: topRight.x, y2: topRight.y };
  if (edge === "right") return { x1: topRight.x, y1: topRight.y, x2: bottomRight.x, y2: bottomRight.y };
  if (edge === "bottom") return { x1: bottomRight.x, y1: bottomRight.y, x2: bottomLeft.x, y2: bottomLeft.y };
  return { x1: bottomLeft.x, y1: bottomLeft.y, x2: topLeft.x, y2: topLeft.y };
}

function getPlanBounds(data: FloorPlanData) {
  const points = [
    ...data.walls.flatMap((wall) => [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 }
    ]),
    ...data.rooms.flatMap((room) => room.polygon)
  ];

  if (points.length === 0) {
    return { minX: 90, minY: 82, width: 480, height: 300 };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1)
  };
}

function calculateAreaSqFt(room: Room, scale: number) {
  const [topLeft, topRight, bottomRight] = room.polygon;
  return Math.round(((topRight.x - topLeft.x) * (bottomRight.y - topRight.y)) / (scale * scale));
}

function summarizeSourcePlan(data: FloorPlanData) {
  const scale = data.scale || 18;
  const bounds = getPlanBounds(data);
  const rooms = data.rooms.slice(0, 18).map((room) => {
    const xs = room.polygon.map((point) => point.x);
    const ys = room.polygon.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      label: room.label,
      x: Math.round((minX - bounds.minX) / scale),
      y: Math.round((minY - bounds.minY) / scale),
      width: Math.max(1, Math.round((maxX - minX) / scale)),
      height: Math.max(1, Math.round((maxY - minY) / scale)),
      areaSqFt: room.areaSqFt
    };
  });

  return {
    scale,
    roomCount: data.rooms.length,
    wallCount: data.walls.length,
    doorCount: data.doors.length,
    windowCount: data.windows.length,
    totalAreaSqFt: Math.round(data.rooms.reduce((total, room) => total + Math.max(room.areaSqFt, 0), 0)),
    rooms
  };
}

function createFloorPlanData(sourceData: FloorPlanData, rawRooms: AiRoomRect[], openings: AiOpening[], windows: AiOpening[]): FloorPlanData {
  const normalizedRooms = ensureUniqueLabels(
    rawRooms
      .filter((room) => Number.isFinite(room.x) && Number.isFinite(room.y) && room.width > 1 && room.height > 1)
      .slice(0, 18)
  );

  if (normalizedRooms.length === 0) {
    throw new Error("OpenAI did not return any usable rooms");
  }

  const scale = clamp(sourceData.scale || 18, 8, 36);
  const gridSize = sourceData.gridSize || 6;
  const sourceBounds = getPlanBounds(sourceData);
  const minX = Math.min(...normalizedRooms.map((room) => room.x), 0);
  const minY = Math.min(...normalizedRooms.map((room) => room.y), 0);
  const wallsByKey = new Map<string, Wall>();
  const roomEdgeKeys = new Map<string, string>();
  let nextWallNumber = 1;

  const rooms: Room[] = normalizedRooms.map((room, index) => {
    const x = sourceBounds.minX + (room.x - minX) * scale;
    const y = sourceBounds.minY + (room.y - minY) * scale;
    const width = clamp(room.width, 4, 44) * scale;
    const height = clamp(room.height, 4, 36) * scale;
    const polygon = [
      { x: Math.round(x), y: Math.round(y) },
      { x: Math.round(x + width), y: Math.round(y) },
      { x: Math.round(x + width), y: Math.round(y + height) },
      { x: Math.round(x), y: Math.round(y + height) }
    ];
    const nextRoom: Room = {
      id: `room-ai-edit-${index + 1}`,
      label: room.label,
      polygon,
      areaSqFt: 0
    };

    for (const edge of ["top", "right", "bottom", "left"] as const) {
      const segment = getRoomEdge(nextRoom, edge);
      const key = edgeKey(segment.x1, segment.y1, segment.x2, segment.y2);
      roomEdgeKeys.set(`${nextRoom.label}:${edge}`, key);
      if (!wallsByKey.has(key)) {
        wallsByKey.set(key, {
          id: `wall-ai-edit-${nextWallNumber}`,
          ...segment,
          thickness: PARTITION_THICKNESS
        });
        nextWallNumber += 1;
      }
    }

    nextRoom.areaSqFt = calculateAreaSqFt(nextRoom, scale);
    return nextRoom;
  });

  const walls = Array.from(wallsByKey.values()).map((wall) => ({ ...wall }));
  for (const wall of walls) {
    const matchingEdges = [...roomEdgeKeys.values()].filter((key) => {
      const source = wallsByKey.get(key);
      return source?.id === wall.id;
    }).length;
    wall.thickness = matchingEdges <= 1 ? WALL_THICKNESS : PARTITION_THICKNESS;
  }

  const doorItems: Door[] = [];
  for (const opening of openings.slice(0, 5)) {
    const room = rooms.find((candidate) => candidate.label.toLowerCase() === normalizeLabel(opening.roomLabel).toLowerCase());
    if (!room) continue;

    const key = roomEdgeKeys.get(`${room.label}:${opening.edge}`);
    const wall = key ? wallsByKey.get(key) : null;
    if (!wall) continue;

    doorItems.push({
      id: `door-ai-edit-${doorItems.length + 1}`,
      wallId: wall.id,
      position: clamp(opening.position, 0.12, 0.88),
      width: /patio|porch|deck|outdoor/i.test(room.label) ? 60 : 36,
      type: /patio|porch|deck|outdoor/i.test(room.label) ? "sliding" : "standard",
      rotation: 0
    });
  }

  if (doorItems.length === 0 && walls.length > 0) {
    doorItems.push({
      id: "door-ai-edit-1",
      wallId: walls[0].id,
      position: 0.5,
      width: 36,
      type: "standard",
      rotation: 0
    });
  }

  const windowItems: Window[] = [];
  for (const window of windows.slice(0, 14)) {
    const room = rooms.find((candidate) => candidate.label.toLowerCase() === normalizeLabel(window.roomLabel).toLowerCase());
    if (!room) continue;

    const key = roomEdgeKeys.get(`${room.label}:${window.edge}`);
    const wall = key ? wallsByKey.get(key) : null;
    if (!wall) continue;

    windowItems.push({
      id: `window-ai-edit-${windowItems.length + 1}`,
      wallId: wall.id,
      position: clamp(window.position, 0.12, 0.88),
      width: /great|living|kitchen/i.test(room.label) ? 60 : 48,
      height: 48
    });
  }

  return {
    walls,
    rooms,
    doors: doorItems,
    windows: windowItems,
    dimensions: [],
    annotations: [],
    furniture: [],
    scale,
    gridSize
  };
}

function normalizeAiEdit(sourceData: FloorPlanData, proposal: AiPlanEdit, index: number) {
  const data = createFloorPlanData(sourceData, proposal.rooms, proposal.exteriorDoors, proposal.windows);

  return {
    title: normalizeLabel(proposal.title).slice(0, 72) || `OpenAI Option ${index + 1}`,
    focus: normalizeLabel(proposal.focus).slice(0, 32) || "OpenAI",
    summary: normalizeLabel(proposal.summary).slice(0, 260),
    data,
    changes: proposal.changes.map(normalizeLabel).filter(Boolean).slice(0, 6),
    checks: proposal.checks.map(normalizeLabel).filter(Boolean).slice(0, 5),
    confidence: Math.round(clamp(proposal.confidence, 0, 100))
  };
}

export const generateWithAI = action({
  args: {
    projectId: v.id("projects"),
    floor: v.number(),
    sourceData: floorPlanDataValidator,
    prompt: v.string(),
    constraints: planEditConstraintSettingsValidator
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.members.requireCurrentUserProjectEditor, {
      projectId: args.projectId
    });

    const trimmedPrompt = args.prompt.trim();
    if (!trimmedPrompt) {
      throw new Error("Plan edit prompt is required");
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const model = process.env.OPENAI_PLAN_EDIT_MODEL ?? process.env.OPENAI_FLOOR_PLAN_MODEL ?? "gpt-5.4";
    const client = new OpenAI({ apiKey });
    const sourceData: FloorPlanData = {
      ...args.sourceData,
      annotations: args.sourceData.annotations ?? []
    };
    const sourceSummary = summarizeSourcePlan(sourceData);
    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                task: "Revise the existing floor plan into three editable plan options.",
                floor: args.floor,
                request: trimmedPrompt,
                sourcePlan: sourceSummary,
                lockedConstraints: args.constraints.lockedIds.map((id) => constraintLabels[id]),
                maxSqFt: args.constraints.maxSqFt ?? null,
                outputRequirements: [
                  "Return exactly three options.",
                  "Use room rectangles in feet.",
                  "Keep the plan coherent enough to edit in a floor plan editor.",
                  "Every proposal must include rooms, exteriorDoors, windows, changes, checks, and confidence.",
                  "Make changes specific to the user's request, not generic restyling."
                ]
              })
            }
          ]
        }
      ],
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "plan_edit_options",
          schema: planEditSchema,
          description: "Three structured editable floor plan revision options.",
          strict: true
        }
      }
    });

    const parsed = JSON.parse(extractTextOutput(response)) as AiPlanEditResponse;
    const proposals = parsed.proposals
      .map((proposal, index) => normalizeAiEdit(sourceData, proposal, index))
      .filter((proposal) => proposal.data.rooms.length >= 4);

    if (proposals.length === 0) {
      throw new Error("OpenAI did not return any usable plan edit options");
    }

    return proposals.sort((left, right) => right.confidence - left.confidence);
  }
});
