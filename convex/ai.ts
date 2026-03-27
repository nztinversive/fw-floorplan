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

CRITICAL RULE — READ LABELS FROM THE IMAGE:
- ALWAYS read the actual text labels printed on the floor plan image.
- Use the EXACT label text from the image (e.g., "Bonus Room", "WIC", "Fin. Room Over Garage").
- NEVER invent or guess room types that are not visible in the image.
- If a space has no label in the image, use a generic label like "Room 1", "Closet 1", "Space 1".
- Do NOT assume a floor contains a kitchen, living room, or dining room unless those labels are clearly visible.
- Floor plans may show any floor level (second floor, basement, attic) — do not assume ground floor.

COORDINATE SYSTEM:
- Use a normalized 2D plane from 0 to 1000 on both axes.
- (0, 0) is the top-left corner of the image.
- All wall endpoints, room polygons, and positions use this coordinate system.

WALLS:
- Detect primary structural walls as simplified line segments.
- Include interior partition walls that enclose distinct spaces (closets, bathrooms, hallways).
- Prefer fewer, cleaner wall segments over noisy micro-segments.
- Snap near-axis-aligned walls to true horizontal or vertical.
- Wall thickness is in pixels (typically 6-12 for interior, 8-14 for exterior).
- Use unique IDs like "w1", "w2", etc.

ROOMS — EVERY ENCLOSED SPACE IS A ROOM:
- Each enclosed space gets exactly one room entry, no matter how small.
- This includes: walk-in closets (WIC), regular closets, linen closets, mechanical rooms, stairwells, landings, alcoves, laundry areas, mudrooms, pantries.
- Every room MUST have a unique label. Never duplicate labels.
- Read the label from the image first. Common abbreviations: WIC = Walk-in Closet, BR = Bedroom, BA = Bathroom, Fin. = Finished, Mstr = Master.
- If multiple closets exist, number them: "WIC 1", "WIC 2", "Closet 1", "Closet 2".
- Room polygons must NOT overlap. Each polygon defines a single non-overlapping region.
- Polygons must be ordered (clockwise or counterclockwise) and closed.
- areaSqFt: calculate from printed dimensions if available (length × width). If dimensions say "13'-0\" x 17'-4\"", compute 13 × 17.33 = 225.3 sqft. Do NOT inflate areas — a 13×17 room is ~221 sqft, not 698.

AREA CALCULATION:
- When dimensions are printed on the image (like "13'-0\" x 17'-4\""), USE THEM to calculate areaSqFt.
- Convert feet-inches to decimal: 17'-4\" = 17.33 ft, 13'-0\" = 13.0 ft.
- areaSqFt = length_ft × width_ft for rectangular rooms.
- For irregular rooms, estimate from the polygon but cross-check against any visible dimensions.
- Typical residential room sizes: Bedroom 120-250 sqft, Bathroom 40-100 sqft, Closet 15-50 sqft, WIC 30-80 sqft, Master Bedroom 200-400 sqft, Hallway 40-120 sqft.
- If your calculated area is wildly outside these ranges, recheck your polygon coordinates.

DOORS:
- Door type MUST be one of: "standard", "sliding", "double", "garage".
- Map swing/hinged doors to "standard". Map pocket doors to "sliding".
- Position is normalized 0-1 along the host wall (0 = wall start, 1 = wall end).
- Width is in feet, not inches (typical interior door: 2.67 ft / 32 inches, closet: 2 ft / 24 inches).
- Reference the correct wallId from the walls array.

WINDOWS:
- Position is normalized 0-1 along the host wall.
- Width and height are in feet, not inches.
- Only place windows on exterior walls.

DIMENSIONS:
- Extract visible printed measurements from the image.
- Look for notation like: 13'-0\", 17'-4\", 10'x12', etc.
- wallId references the wall or room this dimension belongs to.
- lengthFt is the primary measurement in feet (convert inches to decimal).
- widthFt is the secondary measurement (for room dimensions), or 0 for single-axis wall measurements.
- If no dimensions are visible, return an empty array.

SCALE:
- Estimate pixels-per-foot based on extracted dimensions and wall lengths in the 0-1000 coordinate space.
- Example: if a 30-foot wall spans from x=100 to x=700 (600 units), scale = 600/30 = 20 px/ft.
- If no dimensions are available, estimate based on typical residential proportions.

CONFIDENCE:
- 0.0 to 1.0 reflecting how well you could identify the floor plan structure.
- > 0.8: clean blueprint or CAD drawing with clear labels and dimensions.
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
      model: "gpt-5.4",
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

    const parsed = JSON.parse(extractTextOutput(response));

    // Post-process: auto-number duplicate room labels
    if (parsed.rooms && Array.isArray(parsed.rooms)) {
      const labelCounts: Record<string, number> = {};
      const labelTotals: Record<string, number> = {};

      // First pass: count occurrences
      for (const room of parsed.rooms) {
        const label = room.label || "Room";
        labelTotals[label] = (labelTotals[label] || 0) + 1;
      }

      // Second pass: number duplicates
      for (const room of parsed.rooms) {
        const label = room.label || "Room";
        if (labelTotals[label] > 1) {
          labelCounts[label] = (labelCounts[label] || 0) + 1;
          room.label = `${label} ${labelCounts[label]}`;
        }
      }
    }

    return parsed;
  }
});

