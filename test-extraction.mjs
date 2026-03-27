import OpenAI from "openai";
import { readFileSync } from "fs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const imgPath = "C:\\Users\\Atlas-playground\\.openclaw\\media\\tool-image-generation\\test-floorplan---c47785a7-ff2b-4ade-a752-de73b6c3a68b.png";
const imgBase64 = readFileSync(imgPath).toString("base64");
const testImageUrl = `data:image/png;base64,${imgBase64}`;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["walls", "rooms", "doors", "windows", "dimensions", "scale", "confidence"],
  properties: {
    walls: { type: "array", items: { type: "object", additionalProperties: false, required: ["id","x1","y1","x2","y2","thickness"], properties: { id: {type:"string"}, x1: {type:"number"}, y1: {type:"number"}, x2: {type:"number"}, y2: {type:"number"}, thickness: {type:"number"} } } },
    rooms: { type: "array", items: { type: "object", additionalProperties: false, required: ["id","label","polygon","areaSqFt"], properties: { id: {type:"string"}, label: {type:"string"}, polygon: { type: "array", items: { type: "object", additionalProperties: false, required: ["x","y"], properties: { x: {type:"number"}, y: {type:"number"} } } }, areaSqFt: {type:"number"} } } },
    doors: { type: "array", items: { type: "object", additionalProperties: false, required: ["id","wallId","position","width","type","rotation"], properties: { id: {type:"string"}, wallId: {type:"string"}, position: {type:"number"}, width: {type:"number"}, type: {type:"string"}, rotation: {type:"number"} } } },
    windows: { type: "array", items: { type: "object", additionalProperties: false, required: ["id","wallId","position","width","height"], properties: { id: {type:"string"}, wallId: {type:"string"}, position: {type:"number"}, width: {type:"number"}, height: {type:"number"} } } },
    dimensions: { type: "array", items: { type: "object", additionalProperties: false, required: ["wallId","lengthFt","widthFt"], properties: { wallId: {type:"string"}, lengthFt: {type:"number"}, widthFt: {type:"number"} } } },
    scale: { type: "number" },
    confidence: { type: "number" }
  }
};

console.log("Sending floor plan to GPT-5.4-mini with structured outputs...\n");

const response = await client.responses.create({
  model: "gpt-5.4-mini",
  input: [
    {
      role: "system",
      content: [{ type: "input_text", text: "You analyze residential floor plan images for a modular home design studio. Return structured geometry only. Do not narrate. COORDINATE SYSTEM: Normalized 0-1000 on both axes, (0,0) is top-left. WALLS: Simplified line segments, snap near-axis-aligned to true H/V, unique IDs w1/w2/etc, thickness in pixels (6-12 interior, 8-14 exterior). ROOMS: Each enclosed space gets exactly one entry with a UNIQUE label (never duplicate). Use specific labels: Living Room, Kitchen, Dining Room, Master Bedroom, Bedroom 2, Bathroom 1, Hallway, Entry, etc. Ordered polygons. DOORS: type MUST be one of: standard, sliding, double, garage. Map swing/hinged to standard. Position 0-1 along host wall. Width in feet. WINDOWS: Position 0-1 along host wall, width/height in feet, exterior walls only. DIMENSIONS: wallId references wall or room, lengthFt is primary measurement, widthFt is secondary (or 0 for single-axis). SCALE: pixels-per-foot estimate. CONFIDENCE: 0-1." }]
    },
    {
      role: "user",
      content: [
        { type: "input_text", text: "Extract the floor plan into structured JSON." },
        { type: "input_image", image_url: testImageUrl, detail: "high" }
      ]
    }
  ],
  text: {
    format: {
      type: "json_schema",
      name: "floor_plan_extraction",
      schema,
      description: "Structured floor plan geometry extracted from a floor plan image."
    }
  }
});

const output = response.output_text || response.output?.find(m => m.content)?.content?.find(c => c.type === "output_text")?.text;
const parsed = JSON.parse(output);

console.log("=== EXTRACTION RESULT ===\n");
console.log(`Confidence: ${parsed.confidence}`);
console.log(`Scale: ${parsed.scale} px/ft`);
console.log(`Walls: ${parsed.walls.length}`);
console.log(`Rooms: ${parsed.rooms.length} — ${parsed.rooms.map(r => r.label).join(", ")}`);
console.log(`Doors: ${parsed.doors.length}`);
console.log(`Windows: ${parsed.windows.length}`);
console.log(`Dimensions: ${parsed.dimensions.length}`);
console.log("\n=== FULL JSON ===\n");
console.log(JSON.stringify(parsed, null, 2));
