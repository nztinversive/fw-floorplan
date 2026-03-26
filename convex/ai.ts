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
        required: ["from", "to", "value_ft"],
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          value_ft: { type: "number" }
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

Goals:
1. Detect primary structural walls as simplified line segments in a normalized 2D plane.
2. Infer enclosed rooms and label them conservatively using the source image text when visible.
3. Detect doors and windows relative to their host wall with position normalized from 0 to 1.
4. Extract printed measurements when readable and map them into a dimensions list.
5. Estimate scale in pixels-per-foot when dimensions are available.
6. Report an overall confidence from 0 to 1.

Constraints:
- Keep output consistent and geometrically plausible.
- Prefer fewer, cleaner wall segments over noisy micro-segments.
- Use clockwise or counterclockwise polygons, but keep them ordered.
- If an element is uncertain, omit it instead of hallucinating.
- If no reliable dimensions are visible, return an empty dimensions array and a best-effort scale.
- All coordinates should share the same image-based coordinate system.
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

