import OpenAI from "openai";
import { readFileSync } from "fs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const imgPath = "C:\\Users\\Atlas-playground\\.openclaw\\media\\inbound\\file_243---6df6516b-0864-4024-a534-76fb643c3273.jpg";
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
  model: "gpt-5.4",
  input: [
    {
      role: "system",
      content: [{ type: "input_text", text: "You analyze residential floor plan images. Return structured geometry only. Do not narrate. CRITICAL: READ LABELS FROM THE IMAGE. Use EXACT text labels printed on the floor plan. NEVER invent room types not visible in the image. If no label, use generic 'Room 1', 'Closet 1'. Do NOT assume ground floor — plans may show any level. COORDINATE SYSTEM: Normalized 0-1000 on both axes, (0,0) top-left. WALLS: Include interior partitions for closets/bathrooms/hallways. Snap near-axis to H/V. Unique IDs w1/w2. ROOMS: EVERY enclosed space is a room — including WICs, closets, stairwells, landings. Read labels from image. WIC = Walk-in Closet. Number duplicates: WIC 1, WIC 2, Closet 1. Polygons must NOT overlap. areaSqFt: calculate from printed dimensions (13'-0\" x 17'-4\" = 13 × 17.33 = 225 sqft). Typical sizes: Bedroom 120-250, Bathroom 40-100, Closet 15-50, WIC 30-80, Master 200-400. DOORS: standard/sliding/double/garage only. Width in feet. WINDOWS: exterior walls only, width/height in feet. DIMENSIONS: extract printed measurements, convert feet-inches to decimal. SCALE: px/ft from dimensions. CONFIDENCE: 0-1." }]
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
