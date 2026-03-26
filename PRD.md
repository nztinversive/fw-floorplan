# FW Floor Plan Studio — Product Requirements Document

## Overview

A web-based tool for Fading West that lets users upload a floor plan image (photo, scan, or sketch), converts it into an editable digital floor plan, and generates photorealistic exterior house renders in FW's signature styles. The tool serves both internal FW teams (sales, design) and clients.

**Core value prop:** Go from a napkin sketch or blueprint photo to "here's what your house looks like" in minutes, not days.

---

## Phase 1: Floor Plan Editor

### 1.1 Image Upload & AI Extraction

**Goal:** User uploads a photo/scan of a floor plan → AI extracts structured geometry → renders as editable floor plan on a canvas.

**Upload Flow:**
- Accept JPG, PNG, PDF (single page), HEIC
- Max file size: 25MB
- Drag-and-drop or file picker
- Show upload progress + "Analyzing your floor plan..." loading state

**AI Extraction Pipeline:**
1. Send image to OpenAI Vision API (GPT-4o or latest) with a structured prompt
2. The prompt should instruct the model to return JSON with:
   - `walls`: array of line segments `{x1, y1, x2, y2, thickness}` in a normalized coordinate system
   - `rooms`: array of `{label, polygon: [{x, y}], area_sqft}`
   - `doors`: array of `{x, y, width, rotation, type: "standard"|"sliding"|"double"}`
   - `windows`: array of `{x, y, width, rotation}`
   - `dimensions`: array of `{from, to, value_ft}` (extracted measurements if visible)
   - `scale`: estimated pixels-per-foot if dimensions are detected
3. If extraction confidence is low, show the original image as a background layer and let the user trace over it manually
4. Store the structured JSON as the canonical floor plan data model

**Fallback:** If AI extraction fails or produces garbage, allow the user to start from a blank canvas with the uploaded image as a trace layer (opacity slider).

### 1.2 Interactive Floor Plan Editor

**Canvas Engine:** Konva.js (React-Konva) — lightweight, good performance, well-documented for this type of 2D editor work. Alternative: Fabric.js.

**Core Editing Features:**
- **Select & move** walls, doors, windows, room labels
- **Drag wall endpoints** to resize rooms (connected walls should move together — snap to grid)
- **Add walls** — click to place start point, click again for end point, walls snap to 90° by default (hold shift for free angle)
- **Add doors/windows** — click a wall segment, choose door/window type from a toolbar, place along the wall
- **Delete** any element (select + delete key or toolbar button)
- **Room labels** — auto-detected or manually editable text labels ("Kitchen", "Bedroom 1", etc.)
- **Dimension lines** — auto-calculated from wall geometry, displayed in feet/inches, editable (editing a dimension resizes the wall)
- **Grid & snapping** — configurable grid (default 6"), snap-to-grid toggle, snap-to-wall-endpoint
- **Undo/Redo** — full history stack (Ctrl+Z / Ctrl+Shift+Z)
- **Zoom & pan** — scroll to zoom, middle-click or space+drag to pan, zoom-to-fit button
- **Multi-floor** — tabs for Floor 1, Floor 2, etc. Add/remove floors.

**Object Library Sidebar:**
- Furniture & fixtures (drag onto canvas): couch, bed, dining table, toilet, sink, tub, shower, kitchen island, refrigerator, stove, washer/dryer
- Each object has a standard footprint size, resizable
- Objects are cosmetic (for visualization) — they don't affect wall geometry

**Toolbar:**
- Select tool (default)
- Wall draw tool
- Door tool
- Window tool
- Room label tool
- Dimension tool
- Furniture tool (opens library sidebar)
- Eraser / delete tool

**Properties Panel (right sidebar):**
- When a wall is selected: length, thickness, angle
- When a room is selected: label, calculated area (auto from polygon), floor material
- When a door/window is selected: type, width
- When furniture is selected: type, dimensions, rotation

### 1.3 Export

- **PDF** — clean 2D floor plan with dimensions, room labels, FW branding header/footer
- **PNG/SVG** — high-res image export
- **JSON** — structured data (for feeding into Phase 2 or other tools)
- **Share link** — generates a read-only view URL (no login required)

### 1.4 Project Management

- Each floor plan is a "project" with a name, address, client name, creation date
- Auto-save to backend (debounced, every 5s of inactivity after a change)
- Project list / dashboard with thumbnails
- Duplicate project (for iterating on variations)

---

## Phase 2: AI House Renders

### 2.1 Style Selection

**Goal:** User picks an architectural style, and the system generates photorealistic exterior renders of the house based on the floor plan.

**Style Presets (FW-specific):**
- Craftsman
- Modern Farmhouse
- Contemporary
- Mountain Modern
- Classic Ranch
- Custom (user describes in text)

Each style preset includes:
- A reference description for the image generation prompt
- 2-3 reference images from FW's portfolio (used as style conditioning)
- Default material palette (siding type, roof color, trim style)

### 2.2 Render Generation Pipeline

1. **Floor plan → text description**: Convert the structured JSON floor plan into a natural language architectural description:
   - Square footage, number of bedrooms/bathrooms
   - Room layout and flow
   - Number of floors
   - Key features (garage, porch, etc.)
2. **Compose generation prompt**: Combine the architectural description + selected style + material preferences into an image generation prompt
3. **Generate renders**: Call image generation API (GPT Image 1 or Flux via Replicate) to produce:
   - Front elevation render
   - Rear elevation render  
   - 3/4 angle perspective (hero shot)
   - Optional: aerial/bird's eye view
4. **Display results**: Show all renders in a gallery view with download buttons

**Generation Settings (user-adjustable):**
- Style (from presets above)
- Siding material: wood, stone, stucco, mixed
- Roof style: gable, hip, flat, shed
- Color palette: warm, cool, neutral, custom
- Landscaping: none, minimal, full
- Time of day: daylight, golden hour, dusk
- Season: summer, fall, winter

### 2.3 Iteration & Refinement

- "Regenerate" button (new seed, same settings)
- "Tweak" — adjust one setting and regenerate
- "Favorites" — star renders to save them to the project
- Side-by-side comparison view (compare 2 renders)

### 2.4 Render Export

- High-res PNG download (each render)
- PDF presentation: all renders + floor plan on branded pages
- "Client package" — one-click export of floor plan + all favorited renders as a branded PDF

---

## Technical Architecture

### Stack
- **Frontend:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS
- **Canvas:** react-konva (Konva.js) for the floor plan editor
- **Backend/DB:** Convex (real-time sync, file storage, auth)
- **AI - Vision:** OpenAI API (GPT-4o vision for floor plan extraction)
- **AI - Image Gen:** OpenAI GPT Image 1 (primary) or Replicate Flux (fallback)
- **Auth:** Convex Auth (email + password, optional Google OAuth)
- **Hosting:** Render (free tier to start, same as other FW tools)

### Data Model (Convex)

```
projects {
  _id: Id<"projects">
  name: string
  address?: string
  clientName?: string
  createdBy: Id<"users">
  createdAt: number
  updatedAt: number
  thumbnail?: Id<"_storage">
}

floorPlans {
  _id: Id<"floorPlans">
  projectId: Id<"projects">
  floor: number  // 1, 2, etc.
  sourceImage?: Id<"_storage">  // original uploaded image
  data: {  // the structured floor plan JSON
    walls: Wall[]
    rooms: Room[]
    doors: Door[]
    windows: Window[]
    dimensions: Dimension[]
    furniture: Furniture[]
    scale: number  // pixels per foot
    gridSize: number  // inches
  }
  version: number  // incremented on save
}

renders {
  _id: Id<"renders">
  projectId: Id<"projects">
  style: string
  settings: RenderSettings
  imageUrl: Id<"_storage">
  prompt: string  // stored for debugging/iteration
  isFavorite: boolean
  createdAt: number
}

users {
  _id: Id<"users">
  email: string
  name: string
  role: "admin" | "designer" | "client"
}
```

### Key Type Definitions

```typescript
type Wall = {
  id: string
  x1: number; y1: number
  x2: number; y2: number
  thickness: number  // in inches
}

type Room = {
  id: string
  label: string
  polygon: { x: number; y: number }[]
  areaSqFt: number
}

type Door = {
  id: string
  wallId: string
  position: number  // 0-1 along the wall
  width: number  // inches
  type: "standard" | "sliding" | "double" | "garage"
  rotation: number
}

type Window = {
  id: string
  wallId: string
  position: number
  width: number
  height: number
}

type Furniture = {
  id: string
  type: string  // "couch", "bed_queen", etc.
  x: number; y: number
  width: number; depth: number
  rotation: number
}

type RenderSettings = {
  style: string
  sidingMaterial: string
  roofStyle: string
  colorPalette: string
  landscaping: string
  timeOfDay: string
  season: string
}
```

### API Routes / Convex Functions

**Mutations:**
- `projects.create` — new project
- `projects.update` — update name/address/client
- `projects.delete` — soft delete
- `floorPlans.save` — upsave floor plan data (debounced from editor)
- `floorPlans.uploadSource` — store original image
- `renders.save` — store a generated render
- `renders.toggleFavorite` — star/unstar

**Queries:**
- `projects.list` — all projects for current user
- `projects.get` — single project with floor plans
- `floorPlans.get` — floor plan data for editor
- `renders.listByProject` — all renders for a project

**Actions (server-side, call external APIs):**
- `ai.extractFloorPlan` — send image to OpenAI Vision, return structured JSON
- `ai.generateRender` — compose prompt from floor plan + settings, call image gen API, store result

### Pages

```
/                        → Dashboard (project list)
/projects/new            → Create project + upload floor plan
/projects/[id]           → Project overview (floor plans + renders)
/projects/[id]/edit      → Floor plan editor (full canvas)
/projects/[id]/renders   → Render gallery + generation UI
/projects/[id]/share     → Public read-only view
```

---

## UI/UX Notes

- **Brand:** Fading West colors — navy (#1B2A4A), amber/gold (#D4A84B), warm white (#FAF7F2), slate gray (#64748B)
- **Editor layout:** Toolbar (top) + Canvas (center) + Properties panel (right) + Object library (left, collapsible)
- **Mobile:** The editor is desktop-first. On mobile, show read-only floor plan view and render gallery. Editor shows a "best on desktop" message.
- **Loading states:** Skeleton screens for project list. "Analyzing..." animation during AI extraction. Render generation shows a progress indicator (expect 15-30s per image).
- **Empty states:** Clear CTAs — "Upload your first floor plan" on empty dashboard, "Generate your first render" on empty renders page.

---

## MVP Scope (What to Build First)

**Phase 1 MVP (Editor):**
1. Upload image → AI extraction → editable canvas
2. Move/resize walls, add/remove doors and windows
3. Room labels and auto-calculated areas
4. Dimension display
5. Undo/redo
6. Save/load projects
7. PNG export

**Skip for MVP:** Furniture library, PDF export, share links, multi-floor, DXF export

**Phase 2 MVP (Renders):**
1. Style selection from 3 presets (Craftsman, Modern Farmhouse, Contemporary)
2. Generate front elevation + 3/4 angle renders
3. Regenerate with new seed
4. Download PNG
5. Save favorites to project

**Skip for MVP:** Custom style text input, all render settings, PDF client package, side-by-side comparison

---

## Success Metrics

- Time from upload to editable floor plan: < 30 seconds
- AI extraction accuracy: walls detected correctly > 80% of the time (user fixes the rest)
- Time from floor plan to first render: < 2 minutes
- Client engagement: do clients actually use the share links / look at renders?

---

## Open Questions

1. **Fine-tuning on FW portfolio**: Should we fine-tune an image model on FW's past builds for more authentic renders? This would be a significant moat but adds 1-2 weeks.
2. **Interior renders**: Phase 2 focuses on exteriors. Do clients want interior room renders too? (Could add later with the same pipeline.)
3. **Matterport integration**: FW already uses Matterport scans. Should this tool accept Matterport floor plan exports as input?
4. **Pricing/access**: Is this a client-facing tool (need auth, project sharing) or internal-only (simpler, just FW team login)?
