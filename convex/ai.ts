import OpenAI from "openai";
import { actionGeneric } from "convex/server";
import { v } from "convex/values";

const floorPlanExtractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["walls", "rooms", "doors", "windows", "dimensions", "scale", "confidence"],
  properties: {
    walls: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "x1", "y1", "x2", "y2", "thickness"],
        properties: {
          id: { type: "string" },
          x1: { type: "number" },
          y1: { type: "number" },
          x2: { type: "number" },
          y2: { type: "number" },
          thickness: { type: "number" }
        }
      }
    },
    rooms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "polygon", "areaSqFt"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          polygon: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["x", "y"],
              properties: {
                x: { type: "number" },
                y: { type: "number" }
              }
            }
          },
          areaSqFt: { type: "number" }
        }
      }
    },
    doors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "wallId", "position", "width", "type", "rotation"],
        properties: {
          id: { type: "string" },
          wallId: { type: "string" },
          position: { type: "number" },
          width: { type: "number" },
          type: {
            type: "string",
            enum: ["standard", "sliding", "double", "garage"]
          },
          rotation: { type: "number" }
        }
      }
    },
    windows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "wallId", "position", "width", "height"],
        properties: {
          id: { type: "string" },
          wallId: { type: "string" },
          position: { type: "number" },
          width: { type: "number" },
          height: { type: "number" }
        }
      }
    },
    dimensions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["wallId", "lengthFt", "widthFt"],
        properties: {
          wallId: { type: "string", description: "The wall ID this measurement applies to, or a room ID for room dimensions" },
          lengthFt: { type: "number", description: "Length in feet" },
          widthFt: { type: "number", description: "Width in feet (0 if this is a single-axis wall measurement)" }
        }
      }
    },
    scale: { type: "number" },
    confidence: { type: "number" }
  }
} as const;

const systemPrompt = `
You analyze residential floor plan images for a modular home design studio.
Return structured geometry only. Do not narrate. Do not include markdown.

COORDINATE SYSTEM:
- Use a normalized 2D plane from 0 to 1000 on both axes.
- (0, 0) is the top-left corner of the image.
- All wall endpoints, room polygons, and positions use this coordinate system.

WALLS:
- Detect primary structural walls as simplified line segments.
- Prefer fewer, cleaner wall segments over noisy micro-segments.
- Snap near-axis-aligned walls to true horizontal or vertical.
- Wall thickness is in pixels (typically 6-12 for interior, 8-14 for exterior).
- Use unique IDs like "w1", "w2", etc.

ROOMS:
- Each enclosed space gets exactly one room entry.
- Every room MUST have a unique label. Never duplicate labels.
- Use specific labels: "Living Room", "Kitchen", "Dining Room", "Master Bedroom", "Bedroom 2", "Bedroom 3", "Bathroom 1", "Bathroom 2", "Hallway", "Entry", "Closet", "Laundry", "Garage", "Office", "Pantry".
- If a room's purpose is ambiguous, use "Room 1", "Room 2", etc.
- Polygons must be ordered (clockwise or counterclockwise) and closed.
- areaSqFt should be calculated from visible dimensions when available, otherwise estimate from proportions.

DOORS:
- Door type MUST be one of: "standard", "sliding", "double", "garage".
- Map swing/hinged doors to "standard". Map pocket doors to "sliding".
- Position is normalized 0-1 along the host wall (0 = wall start, 1 = wall end).
- Width is in feet.
- Reference the correct wallId from the walls array.

WINDOWS:
- Position is normalized 0-1 along the host wall.
- Width and height are in feet.
- Only place windows on exterior walls.

DIMENSIONS:
- Extract visible printed measurements from the image.
- wallId references the wall or room this dimension belongs to.
- lengthFt is the primary measurement in feet.
- widthFt is the secondary measurement (for room dimensions like "12' x 14'"), or 0 for single-axis wall measurements.
- If no dimensions are visible, return an empty array.

SCALE:
- Estimate pixels-per-foot based on extracted dimensions and wall lengths.
- If no dimensions are available, estimate based on typical residential proportions (exterior walls ~30-60 ft).

CONFIDENCE:
- 0.0 to 1.0 reflecting how well you could identify the floor plan structure.
- > 0.8: clean blueprint or CAD drawing with clear labels.
- 0.5-0.8: readable floor plan but some ambiguity in rooms or measurements.
- < 0.5: poor quality, heavy occlusion, or not clearly a floor plan.
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

  const messages = candidate.output ?? [];
  for (const message of messages) {
    for (const item of message.content ?? []) {
      if (item.type === "output_text" && item.text) {
        return item.text;
      }
    }
  }

  throw new Error("OpenAI response did not include text output");
}

export const extractFloorPlan = actionGeneric({
  args: {
    storageId: v.id("_storage")
  },
  handler: async (ctx, args) => {
    const imageUrl = await ctx.storage.getUrl(args.storageId);
    if (!imageUrl) {
      throw new Error("Unable to resolve uploaded image URL");
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: "gpt-5.4-mini",
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
              text:
                "Extract the floor plan into the required schema. Normalize geometry consistently and return only valid structured JSON."
            },
            {
              type: "input_image",
              image_url: imageUrl,
              detail: "high"
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "floor_plan_extraction",
          schema: floorPlanExtractionSchema,
          description: "Structured floor plan geometry extracted from a floor plan image."
        }
      }
    });

    return JSON.parse(extractTextOutput(response));
  }
});

