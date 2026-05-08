"use client"

import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowRight,
  Check,
  ChevronRight,
  History,
  Sparkles,
  Upload
} from "lucide-react"

import FloorPlanPreviewSvg from "@/components/FloorPlanPreviewSvg"
import { useToast } from "@/components/Toast"
import { api } from "@/convex/_generated/api"
import {
  generateFloorPlanConcepts,
  type FloorPlanConcept,
  type FloorPlanConceptBrief
} from "@/lib/floor-plan-concepts"
import type { RenderBrief } from "@/lib/types"

const PROMPT_SUGGESTIONS = [
  "3-bed mountain cabin, open kitchen, mudroom, 1800 sqft",
  "Single-story ranch, 2 beds, walk-in closets, big front porch",
  "ADU above garage, 1 bed + office, 650 sqft",
  "4-bed family home, primary on main, kids upstairs, 2400 sqft"
]

const STYLES = [
  { id: "modfarm", label: "Modern Farmhouse" },
  { id: "mtnmod", label: "Mountain Modern" },
  { id: "craft", label: "Craftsman" },
  { id: "contemp", label: "Contemporary" },
  { id: "ranch", label: "Classic Ranch" }
] as const

type StyleId = (typeof STYLES)[number]["id"]

const TEMPLATES = [
  {
    id: "cabin-2",
    name: "Mountain Cabin",
    sub: "Compact + cozy",
    beds: 2,
    baths: 1,
    sqft: 1100,
    accent: "#5b6b75",
    desc: "Open great room, sleeping loft, big windows north."
  },
  {
    id: "farmhouse-3",
    name: "Modern Farmhouse",
    sub: "3-bed family",
    beds: 3,
    baths: 2.5,
    sqft: 2200,
    accent: "#c66e3d",
    desc: "Open kitchen-living, primary on main, kids upstairs."
  },
  {
    id: "ranch-3",
    name: "Classic Ranch",
    sub: "Single-story",
    beds: 3,
    baths: 2,
    sqft: 1750,
    accent: "#a8966c",
    desc: "Long horizontal lines, central living, two-car garage."
  },
  {
    id: "adu-1",
    name: "Backyard ADU",
    sub: "1-bed + office",
    beds: 1,
    baths: 1,
    sqft: 650,
    accent: "#7d6c4f",
    desc: "Studio-ish, kitchen + bath compact, office nook."
  },
  {
    id: "craftsman-4",
    name: "Craftsman",
    sub: "4-bed two-story",
    beds: 4,
    baths: 2.5,
    sqft: 2600,
    accent: "#8b6f4c",
    desc: "Front porch, formal dining, kids upstairs."
  },
  {
    id: "contemp-2",
    name: "Contemporary",
    sub: "2-bed glass box",
    beds: 2,
    baths: 2,
    sqft: 1400,
    accent: "#3b5063",
    desc: "Flat roof, big glazing south, open everything."
  }
] as const

const REFINEMENTS = [
  "Open concept",
  "Primary on main",
  "Pantry",
  "Mudroom",
  "Walk-in closet",
  "Office",
  "Two-car garage",
  "Covered porch",
  "Double vanity",
  "Laundry on main",
  "Vaulted ceilings"
]

const PROGRESS_STEPS = [
  "Parsing brief",
  "Sketching layouts",
  "Placing rooms",
  "Checking dimensions",
  "Finalizing candidates"
] as const

type BriefSnapshot = {
  prompt: string
  beds: number
  baths: number
  sqft: number
  styleId: StyleId
  styleLabel: string
  refinements: string[]
  conceptBrief: FloorPlanConceptBrief
}

type BriefInput = {
  prompt: string
  beds: number
  baths: number
  sqft: number
  styleId: StyleId
  refinements: string[]
}

function getStyleLabel(styleId: StyleId) {
  return STYLES.find((style) => style.id === styleId)?.label ?? "Any style"
}

function inferLifestyle(prompt: string, refinements: string[]): FloorPlanConceptBrief["lifestyle"] {
  const text = `${prompt} ${refinements.join(" ")}`.toLowerCase()
  if (/privacy|private|split bedroom|quiet|separate/.test(text)) return "private"
  if (/party|entertain|guest|hosting|large dining/.test(text)) return "entertaining"
  if (/adu|compact|efficient|small|tiny|650|700|800/.test(text)) return "compact"
  return "open"
}

function inferLotShape(prompt: string, sqft: number): FloorPlanConceptBrief["lotShape"] {
  const text = prompt.toLowerCase()
  if (/wide|ranch|single-story|single story/.test(text)) return "wide"
  if (/narrow|adu|garage/.test(text) || sqft < 900) return "narrow"
  if (/corner|courtyard|l-shape|l shape/.test(text)) return "corner"
  return "standard"
}

function makeBriefSnapshot(input: BriefInput): BriefSnapshot {
  const styleLabel = getStyleLabel(input.styleId)
  const refinements = input.refinements.filter(Boolean)
  const mustHaves = [
    input.prompt.trim(),
    ...refinements,
    `${styleLabel} exterior direction`
  ]
    .filter(Boolean)
    .join("; ")

  return {
    ...input,
    styleLabel,
    refinements,
    conceptBrief: {
      targetSqFt: input.sqft,
      bedrooms: Math.max(1, input.beds),
      bathrooms: Math.max(1, input.baths),
      stories: input.beds >= 4 || input.sqft >= 2300 ? 2 : 1,
      lotShape: inferLotShape(input.prompt, input.sqft),
      lifestyle: inferLifestyle(input.prompt, refinements),
      mustHaves
    }
  }
}

function makeProjectName(concept: FloorPlanConcept, snapshot: BriefSnapshot) {
  return `${snapshot.beds}-bed ${snapshot.styleLabel} - ${concept.name}`
}

function makeRenderBrief(concept: FloorPlanConcept, snapshot: BriefSnapshot): RenderBrief {
  const highlights = concept.highlights.join("; ")
  const tradeoffs = concept.tradeoffs.join("; ")
  return {
    designNotes: [
      `Generated from prompt: ${snapshot.prompt.trim()}`,
      `Selected editable plan: ${concept.name}. ${concept.summary}`,
      `Exterior direction: ${snapshot.styleLabel}.`,
      highlights ? `Plan strengths to express in the exterior: ${highlights}.` : ""
    ]
      .filter(Boolean)
      .join("\n"),
    mustHave: [
      `${snapshot.beds} bed, ${snapshot.baths} bath, approximately ${snapshot.sqft.toLocaleString()} sf.`,
      snapshot.refinements.length > 0 ? snapshot.refinements.join("; ") : "",
      `Preserve the saved floor plan footprint, room logic, doors, windows, and ${concept.estimatedSqFt.toLocaleString()} sf generated layout.`
    ]
      .filter(Boolean)
      .join("\n"),
    avoid: [
      "Do not invent unsupported wings, garages, porches, or extra floors unless they are visible in the saved plan.",
      tradeoffs ? `Resolve carefully: ${tradeoffs}.` : ""
    ]
      .filter(Boolean)
      .join("\n"),
    revisionNotes: ""
  }
}

export default function GeneratePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [prompt, setPrompt] = useState("")
  const [beds, setBeds] = useState(3)
  const [baths, setBaths] = useState(2)
  const [sqft, setSqft] = useState(1800)
  const [styleId, setStyleId] = useState<StyleId>("modfarm")
  const [busy, setBusy] = useState(false)
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [progressStep, setProgressStep] = useState(0)
  const [candidates, setCandidates] = useState<FloorPlanConcept[] | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [refinements, setRefinements] = useState<string[]>([])
  const [generatedBrief, setGeneratedBrief] = useState<BriefSnapshot | null>(null)
  const createProject = useMutation(api.projects.createWithInitialFloorPlan)
  const updateRenderBrief = useMutation(api.projects.updateRenderBrief)
  const setFinalPlanCandidate = useMutation(api.projects.setFinalPlanCandidate)

  const styleLabel = useMemo(
    () => getStyleLabel(styleId),
    [styleId]
  )
  const selectedCandidate = candidates?.find((candidate) => candidate.id === picked) ?? null
  const resultBrief = generatedBrief ?? makeBriefSnapshot({ prompt, beds, baths, sqft, styleId, refinements })

  const tickRef = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current)
        tickRef.current = null
      }
    }
  }, [])

  function generate(nextInput?: BriefInput) {
    const snapshot = makeBriefSnapshot(
      nextInput ?? {
        prompt,
        beds,
        baths,
        sqft,
        styleId,
        refinements
      }
    )

    if (!snapshot.prompt.trim() || busy || isCreatingProject) return
    setBusy(true)
    setProgressStep(0)
    setCandidates(null)
    setPicked(null)
    setGeneratedBrief(snapshot)

    let s = 0
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
    }
    tickRef.current = window.setInterval(() => {
      s += 1
      if (s >= PROGRESS_STEPS.length) {
        if (tickRef.current !== null) {
          window.clearInterval(tickRef.current)
          tickRef.current = null
        }
        const generated = generateFloorPlanConcepts(snapshot.conceptBrief)
        setCandidates(generated)
        setPicked(generated[0].id)
        setBusy(false)
      } else {
        setProgressStep(s)
      }
    }, 700)
  }

  function pickTemplate(t: (typeof TEMPLATES)[number]) {
    const nextPrompt = `${t.beds}-bed ${t.name.toLowerCase()}: ${t.desc.toLowerCase()} ~${t.sqft} sqft`
    const nextRefinements = [t.desc]
    const nextStyleId =
      t.name === "Mountain Cabin"
        ? "mtnmod"
        : t.name === "Craftsman"
          ? "craft"
          : t.name === "Contemporary"
            ? "contemp"
            : t.name === "Classic Ranch"
              ? "ranch"
              : "modfarm"

    setPrompt(nextPrompt)
    setBeds(t.beds)
    setBaths(t.baths)
    setSqft(t.sqft)
    setStyleId(nextStyleId)
    setRefinements(nextRefinements)
    generate({
      prompt: nextPrompt,
      beds: t.beds,
      baths: t.baths,
      sqft: t.sqft,
      styleId: nextStyleId,
      refinements: nextRefinements
    })
  }

  async function openInEditor() {
    if (!selectedCandidate || isCreatingProject) return

    setIsCreatingProject(true)
    try {
      const projectId = await createProject({
        name: makeProjectName(selectedCandidate, resultBrief),
        floor: 1,
        data: selectedCandidate.data
      })
      await Promise.all([
        updateRenderBrief({
          id: projectId,
          renderBrief: makeRenderBrief(selectedCandidate, resultBrief)
        }),
        setFinalPlanCandidate({
          id: projectId,
          floor: 1,
          label: selectedCandidate.name
        })
      ])
      toast(`${selectedCandidate.name} created as an editable project`, "success")
      router.push(`/projects/${projectId}/edit?floor=1&from=prompt`)
    } catch (error) {
      console.error("Unable to create generated project.", error)
      toast("Unable to create the generated project", "error")
      setIsCreatingProject(false)
    }
  }

  if (busy) {
    return (
      <main className="studio-generate">
        <div className="studio-gen-inner">
          <div className="studio-gen-progress">
            <div className="studio-gen-eyebrow">Generating</div>
            <h2
              className="studio-serif"
              style={{
                fontSize: 32,
                lineHeight: 1.05,
                margin: 0,
                color: "var(--studio-ink)"
              }}
            >
              Sketching <em style={{ fontStyle: "italic" }}>editable options</em> from your brief…
            </h2>
            <div className="bar">
              <span style={{ width: `${((progressStep + 1) / PROGRESS_STEPS.length) * 100}%` }} />
            </div>
            <div className="step-label">{PROGRESS_STEPS[progressStep]}…</div>
          </div>
        </div>
      </main>
    )
  }

  if (candidates) {
    return (
      <main className="studio-generate">
        <div className="studio-gen-inner">
          <div className="studio-gen-eyebrow">Step 02 · Refine</div>
          <h1
            className="studio-serif"
            style={{
              fontSize: 44,
              lineHeight: 1.05,
              margin: 0,
              color: "var(--studio-ink)",
              letterSpacing: 0
            }}
          >
            Three <em style={{ fontStyle: "italic" }}>editable options</em>
          </h1>
          <p className="studio-muted" style={{ fontSize: 14, margin: 0, maxWidth: 560 }}>
            Each plan satisfies your brief differently. Pick one to create as a real
            editable project, or tweak the inputs and regenerate.
          </p>

          <div className="studio-cand-grid">
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`studio-cand${picked === c.id ? " is-picked" : ""}`}
                onClick={() => setPicked(c.id)}
              >
                <div className="studio-cand-thumb">
                  <FloorPlanPreviewSvg
                    data={c.data}
                    className="studio-cand-preview"
                    label={`${c.name} floor plan preview`}
                  />
                  <div className="studio-cand-fit">
                    <Check size={10} strokeWidth={2.6} />
                    {c.score}% fit
                  </div>
                </div>
                <div className="studio-cand-body">
                  <div className="studio-cand-name">{c.name}</div>
                  <div className="studio-cand-meta">
                    <span>{c.estimatedSqFt.toLocaleString()} sf</span>
                    <span>·</span>
                    <span>
                      {c.roomCount} rooms
                    </span>
                  </div>
                  <div
                    style={{ fontSize: 12, color: "var(--studio-ink-2)" }}
                  >
                    {c.highlights[0] ?? c.summary}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <section
            style={{
              background: "var(--studio-panel)",
              border: "1px solid var(--studio-line)",
              borderRadius: "var(--studio-r-md)",
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}
          >
            <div className="studio-tweaks-section">Add a constraint</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {REFINEMENTS.map((t) => {
                const active = refinements.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    className={`studio-pill${active ? " is-active" : ""}`}
                    onClick={() =>
                      setRefinements((rs) =>
                        rs.includes(t) ? rs.filter((x) => x !== t) : [...rs, t]
                      )
                    }
                  >
                    {active ? <Check size={11} strokeWidth={2.6} /> : null}
                    {t}
                  </button>
                )
              })}
            </div>
            <div
              className="studio-tweaks-section"
              style={{ paddingTop: 8 }}
            >
              Your brief
            </div>
            <div
              style={{
                fontStyle: "italic",
                color: "var(--studio-ink-2)",
                fontSize: 14,
                lineHeight: 1.5
              }}
            >
              “{resultBrief.prompt}”
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className="studio-chip">{resultBrief.beds} bd</span>
              <span className="studio-chip">{resultBrief.baths} ba</span>
              <span className="studio-chip">~{resultBrief.sqft.toLocaleString()} sf</span>
              <span className="studio-chip">{resultBrief.styleLabel}</span>
            </div>
          </section>

          <div className="studio-gen-actionbar">
            <button
              type="button"
              className="studio-btn is-ghost"
              onClick={() => {
                setCandidates(null)
                setPicked(null)
              }}
            >
              <History size={14} />
              Back to brief
            </button>
            <button
              type="button"
              className="studio-btn"
              onClick={() => generate()}
              disabled={busy}
            >
              <Sparkles size={14} />
              Regenerate
            </button>
            <button
              type="button"
              className="studio-btn is-primary"
              disabled={!selectedCandidate || isCreatingProject}
              onClick={() => void openInEditor()}
            >
              {isCreatingProject ? "Creating project..." : "Create editable project"}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="studio-generate">
      <div className="studio-gen-inner">
        <div className="studio-gen-hero">
          <div className="studio-gen-eyebrow">Step 01 · Describe</div>
          <h1>
            What are we <em>building</em> today?
          </h1>
          <p>Sketch it in plain English — or pick a tested starting point below.</p>
        </div>

        <div className="studio-gen-promptbox">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. 3-bed mountain cabin with an open kitchen, mudroom off the garage, primary on main, ~1800 sqft"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                generate()
              }
            }}
          />
          <div className="studio-gen-prompt-row">
            <div className="studio-stepper" aria-label="Bedrooms">
              <span className="lbl">Bd</span>
              <button onClick={() => setBeds(Math.max(0, beds - 1))} aria-label="Decrease bedrooms">−</button>
              <span className="val">{beds}</span>
              <button onClick={() => setBeds(beds + 1)} aria-label="Increase bedrooms">+</button>
            </div>
            <div className="studio-stepper" aria-label="Bathrooms">
              <span className="lbl">Ba</span>
              <button
                onClick={() => setBaths(Math.max(0, +(baths - 0.5).toFixed(1)))}
                aria-label="Decrease bathrooms"
              >
                −
              </button>
              <span className="val">{baths}</span>
              <button
                onClick={() => setBaths(+(baths + 0.5).toFixed(1))}
                aria-label="Increase bathrooms"
              >
                +
              </button>
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "var(--studio-ink-2)"
              }}
            >
              <span>Sqft</span>
              <input
                type="range"
                min={500}
                max={5000}
                step={50}
                value={sqft}
                onChange={(e) => setSqft(Number(e.target.value))}
              />
              <span className="studio-mono" style={{ minWidth: 56 }}>
                {sqft.toLocaleString()}
              </span>
            </label>
            <div className="studio-pill-group">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`studio-pill${styleId === s.id ? " is-active" : ""}`}
                  onClick={() => setStyleId(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <span
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 8
              }}
            >
              <span className="studio-mono studio-dim" style={{ fontSize: 11 }}>
                ⌘ + ↵
              </span>
              <button
                type="button"
                className="studio-btn is-accent"
                onClick={() => generate()}
                disabled={busy || !prompt.trim()}
              >
                <Sparkles size={14} />
                Generate layouts
              </button>
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            color: "var(--studio-ink-2)"
          }}
        >
          <span style={{ fontSize: 12 }}>Try:</span>
          {PROMPT_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="studio-pill"
              onClick={() => setPrompt(s)}
            >
              <Sparkles size={11} />
              {s}
            </button>
          ))}
        </div>

        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="studio-section-h" style={{ margin: 0 }}>
            <div>
              <div className="studio-tweaks-section" style={{ paddingTop: 0 }}>
                Or start from a template
              </div>
              <h2 style={{ marginTop: 6 }}>
                Tested <em>starting points</em>
              </h2>
            </div>
          </div>

          <div className="studio-gen-templates">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="studio-tpl-card"
                onClick={() => pickTemplate(t)}
              >
                <div className="tpl-name">
                  {t.name}
                  <ChevronRight
                    size={14}
                    style={{ marginLeft: 4, verticalAlign: "middle" }}
                  />
                </div>
                <div className="tpl-meta">
                  {t.sqft.toLocaleString()} sf · {t.beds}bd · {t.baths}ba
                </div>
                <div className="tpl-desc">{t.desc}</div>
              </button>
            ))}
          </div>
        </section>

        <section style={{ display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            className="studio-btn is-ghost"
            onClick={() => router.push("/projects/new")}
          >
            <Upload size={14} />
            Or upload an existing plan
          </button>
        </section>
      </div>
    </main>
  )
}
