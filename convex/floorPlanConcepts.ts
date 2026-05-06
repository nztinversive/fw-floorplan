import OpenAI from "openai";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import type { Door, FloorPlanData, Room, Wall, Window } from "../lib/types";

type FloorPlanConceptBrief = {
  targetSqFt: number;
  bedrooms: number;
  bathrooms: number;
  stories: number;
  lotShape: "standard" | "wide" | "narrow" | "corner";
  lifestyle: "open" | "private" | "compact" | "entertaining";
  mustHaves: string;
};

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

type AiConcept = {
  name: string;
  summary: string;
  score: number;
  highlights: string[];
  tradeoffs: string[];
  rooms: AiRoomRect[];
  exteriorDoors: AiOpening[];
  windows: AiOpening[];
};

type AiConceptResponse = {
  concepts: AiConcept[];
};

const SCALE = 18;
const ORIGIN_X = 90;
const ORIGIN_Y = 82;
const WALL_THICKNESS = 8;
const PARTITION_THICKNESS = 6;

const floorPlanConceptBriefValidator = v.object({
  targetSqFt: v.number(),
  bedrooms: v.number(),
  bathrooms: v.number(),
  stories: v.number(),
  lotShape: v.union(v.literal("standard"), v.literal("wide"), v.literal("narrow"), v.literal("corner")),
  lifestyle: v.union(v.literal("open"), v.literal("private"), v.literal("compact"), v.literal("entertaining")),
  mustHaves: v.string()
});

const floorPlanConceptSchema = {
  type: "object",
  additionalProperties: false,
  required: ["concepts"],
  properties: {
    concepts: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "summary", "score", "highlights", "tradeoffs", "rooms", "exteriorDoors", "windows"],
        properties: {
          name: {
            type: "string",
            description: "A concise residential plan option name, such as Split Courtyard Plan."
          },
          summary: {
            type: "string",
            description: "One sentence explaining the layout direction and why it fits the brief."
          },
          score: {
            type: "number",
            minimum: 0,
            maximum: 100,
            description: "Overall fit to the user's floor plan brief."
          },
          highlights: {
            type: "array",
            minItems: 3,
            maxItems: 4,
            items: { type: "string" }
          },
          tradeoffs: {
            type: "array",
            minItems: 2,
            maxItems: 3,
            items: { type: "string" }
          },
          rooms: {
            type: "array",
            minItems: 5,
            maxItems: 18,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "x", "y", "width", "height", "role"],
              properties: {
                label: { type: "string" },
                x: {
                  type: "number",
                  description: "Room left coordinate in feet on a top-left-origin layout grid."
                },
                y: {
                  type: "number",
                  description: "Room top coordinate in feet on a top-left-origin layout grid."
                },
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
            maxItems: 4,
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
            minItems: 3,
            maxItems: 12,
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
You are an expert residential floor plan concept generator for a home design application.
Return three editable layout options as structured JSON only.

Use simple orthogonal rectangular room blocks. The backend will convert room rectangles into walls, rooms, doors, and windows.

Rules:
- Coordinates are in feet, with x/y using a top-left origin.
- Keep the full layout roughly near the requested target square footage.
- Rooms should touch or align into a coherent editable plan, not float apart.
- Include circulation and service spaces when they improve the plan.
- Name rooms clearly: Great Room, Kitchen / Dining, Primary Suite, Bedroom 2, Hall Bath, Mudroom, Pantry, Office, Laundry, Entry.
- Respect the requested bedroom, bathroom, story, lifestyle, lot shape, and must-have text.
- Return three meaningfully different options: one balanced, one privacy/efficiency focused, and one stronger design/exterior-potential direction.
- Avoid impossible layouts: no negative sizes, no tiny bedrooms, no bathrooms larger than bedrooms.
- Windows should be assigned to exterior-facing room edges. Exterior doors should usually connect Entry, Great Room, Kitchen / Dining, Mudroom, or Patio.
`;

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

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "concept"
  );
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

function calculateAreaSqFt(room: Room) {
  const [topLeft, topRight, bottomRight] = room.polygon;
  return Math.round(((topRight.x - topLeft.x) * (bottomRight.y - topRight.y)) / (SCALE * SCALE));
}

function normalizeScore(score: number) {
  if (!Number.isFinite(score)) {
    return 75;
  }

  const scaledScore = score > 0 && score <= 10 ? score * 10 : score;
  return Math.round(clamp(scaledScore, 0, 100));
}

function createFloorPlanData(rawRooms: AiRoomRect[], openings: AiOpening[], windows: AiOpening[]): FloorPlanData {
  const normalizedRooms = ensureUniqueLabels(
    rawRooms
      .filter((room) => Number.isFinite(room.x) && Number.isFinite(room.y) && room.width > 3 && room.height > 3)
      .slice(0, 18)
  );
  const minX = Math.min(...normalizedRooms.map((room) => room.x), 0);
  const minY = Math.min(...normalizedRooms.map((room) => room.y), 0);
  const wallsByKey = new Map<string, Wall>();
  const roomEdgeKeys = new Map<string, string>();
  let nextWallNumber = 1;

  const rooms: Room[] = normalizedRooms.map((room, index) => {
    const x = ORIGIN_X + (room.x - minX) * SCALE;
    const y = ORIGIN_Y + (room.y - minY) * SCALE;
    const width = clamp(room.width, 4, 42) * SCALE;
    const height = clamp(room.height, 4, 34) * SCALE;
    const polygon = [
      { x: Math.round(x), y: Math.round(y) },
      { x: Math.round(x + width), y: Math.round(y) },
      { x: Math.round(x + width), y: Math.round(y + height) },
      { x: Math.round(x), y: Math.round(y + height) }
    ];
    const nextRoom: Room = {
      id: `room-ai-${index + 1}`,
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
          id: `wall-ai-${nextWallNumber}`,
          ...segment,
          thickness: edge === "top" || edge === "right" || edge === "bottom" || edge === "left" ? PARTITION_THICKNESS : WALL_THICKNESS
        });
        nextWallNumber += 1;
      }
    }

    nextRoom.areaSqFt = calculateAreaSqFt(nextRoom);
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
  for (const opening of openings.slice(0, 4)) {
    const room = rooms.find((candidate) => candidate.label.toLowerCase() === normalizeLabel(opening.roomLabel).toLowerCase());
    if (!room) continue;

    const key = roomEdgeKeys.get(`${room.label}:${opening.edge}`);
    const wall = key ? wallsByKey.get(key) : null;
    if (!wall) continue;

    doorItems.push({
      id: `door-ai-${doorItems.length + 1}`,
      wallId: wall.id,
      position: clamp(opening.position, 0.12, 0.88),
      width: 36,
      type: "standard",
      rotation: 0
    });
  }

  if (doorItems.length === 0 && walls.length > 0) {
    doorItems.push({
      id: "door-ai-1",
      wallId: walls[0].id,
      position: 0.5,
      width: 36,
      type: "standard",
      rotation: 0
    });
  }

  const windowItems: Window[] = [];
  for (const window of windows.slice(0, 12)) {
    const room = rooms.find((candidate) => candidate.label.toLowerCase() === normalizeLabel(window.roomLabel).toLowerCase());
    if (!room) continue;

    const key = roomEdgeKeys.get(`${room.label}:${window.edge}`);
    const wall = key ? wallsByKey.get(key) : null;
    if (!wall) continue;

    windowItems.push({
      id: `window-ai-${windowItems.length + 1}`,
      wallId: wall.id,
      position: clamp(window.position, 0.12, 0.88),
      width: 54,
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
    scale: SCALE,
    gridSize: 6
  };
}

function normalizeConcept(concept: AiConcept, index: number) {
  const data = createFloorPlanData(concept.rooms, concept.exteriorDoors, concept.windows);
  const outdoorLabels = new Set(
    concept.rooms
      .filter((room) => room.role === "outdoor")
      .map((room) => normalizeLabel(room.label).toLowerCase())
  );
  const estimatedSqFt = Math.round(
    data.rooms.reduce(
      (total, room) => total + (outdoorLabels.has(room.label.toLowerCase()) ? 0 : room.areaSqFt),
      0
    )
  );

  return {
    id: `ai-${slugify(concept.name)}-${index + 1}`,
    name: normalizeLabel(concept.name).slice(0, 64),
    summary: normalizeLabel(concept.summary).slice(0, 220),
    data,
    estimatedSqFt,
    roomCount: data.rooms.length,
    score: normalizeScore(concept.score),
    highlights: concept.highlights.map(normalizeLabel).filter(Boolean).slice(0, 4),
    tradeoffs: concept.tradeoffs.map(normalizeLabel).filter(Boolean).slice(0, 3)
  };
}

export const generateWithAI = action({
  args: {
    projectId: v.id("projects"),
    brief: floorPlanConceptBriefValidator
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.members.requireCurrentUserProjectEditor, {
      projectId: args.projectId
    });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const model = process.env.OPENAI_FLOOR_PLAN_MODEL ?? "gpt-5.4";
    const client = new OpenAI({ apiKey });
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
                task: "Generate three editable residential floor plan concepts from this brief.",
                brief: args.brief,
                outputRequirements: [
                  "Use room rectangles in feet.",
                  "Keep the total room area close to targetSqFt.",
                  "Return exactly three concepts.",
                  "Every concept must be saveable as an editable floor plan."
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
          name: "floor_plan_concepts",
          schema: floorPlanConceptSchema,
          description: "Three structured editable residential floor plan concepts.",
          strict: true
        }
      }
    });

    const parsed = JSON.parse(extractTextOutput(response)) as AiConceptResponse;
    const concepts = parsed.concepts.map(normalizeConcept).filter((concept) => concept.data.rooms.length >= 5);

    if (concepts.length !== 3) {
      throw new Error("OpenAI did not return three usable floor plan concepts");
    }

    return concepts.sort((left, right) => right.score - left.score);
  }
});
