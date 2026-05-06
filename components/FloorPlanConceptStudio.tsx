"use client"

import { CheckCircle2, Home, Plus, Sparkles } from "lucide-react"
import { useState } from "react"

import FloorPlanPreviewSvg from "@/components/FloorPlanPreviewSvg"
import {
  generateFloorPlanConcepts,
  type FloorPlanConcept,
  type FloorPlanConceptBrief
} from "@/lib/floor-plan-concepts"

type FloorPlanConceptStudioProps = {
  projectName: string
  floorCount: number
  isSaving?: boolean
  onGenerateConcepts?: (brief: FloorPlanConceptBrief) => Promise<FloorPlanConcept[]>
  onSaveConcept: (concept: FloorPlanConcept) => Promise<void> | void
}

const DEFAULT_BRIEF: FloorPlanConceptBrief = {
  targetSqFt: 1800,
  bedrooms: 3,
  bathrooms: 2,
  stories: 1,
  lotShape: "standard",
  lifestyle: "open",
  mustHaves: "covered entry, mudroom, walk-in pantry, strong indoor-outdoor connection"
}

export default function FloorPlanConceptStudio({
  projectName,
  floorCount,
  isSaving = false,
  onGenerateConcepts,
  onSaveConcept
}: FloorPlanConceptStudioProps) {
  const [brief, setBrief] = useState<FloorPlanConceptBrief>(DEFAULT_BRIEF)
  const [concepts, setConcepts] = useState<FloorPlanConcept[]>(() => generateFloorPlanConcepts(DEFAULT_BRIEF))
  const [selectedConceptId, setSelectedConceptId] = useState(concepts[0]?.id ?? "")
  const [generationSource, setGenerationSource] = useState<"template" | "openai">("template")
  const [generationMessage, setGenerationMessage] = useState("Template concepts are ready to compare.")
  const [isGeneratingConcepts, setIsGeneratingConcepts] = useState(false)
  const selectedConcept = concepts.find((concept) => concept.id === selectedConceptId) ?? concepts[0]

  function updateBrief<Key extends keyof FloorPlanConceptBrief>(key: Key, value: FloorPlanConceptBrief[Key]) {
    setBrief((current) => ({ ...current, [key]: value }))
  }

  async function handleGenerateConcepts() {
    if (isGeneratingConcepts) return

    setIsGeneratingConcepts(true)

    try {
      if (onGenerateConcepts) {
        const nextConcepts = await onGenerateConcepts(brief)
        setConcepts(nextConcepts)
        setSelectedConceptId(nextConcepts[0]?.id ?? "")
        setGenerationSource("openai")
        setGenerationMessage("OpenAI generated these editable concepts from the current brief.")
        return
      }

      const nextConcepts = generateFloorPlanConcepts(brief)
      setConcepts(nextConcepts)
      setSelectedConceptId(nextConcepts[0]?.id ?? "")
      setGenerationSource("template")
      setGenerationMessage("Template concepts are ready to compare.")
    } catch (error) {
      console.error("Unable to generate AI floor plan concepts.", error)
      const fallbackConcepts = generateFloorPlanConcepts(brief)
      setConcepts(fallbackConcepts)
      setSelectedConceptId(fallbackConcepts[0]?.id ?? "")
      setGenerationSource("template")
      setGenerationMessage("OpenAI generation was unavailable, so local editable options are shown.")
    } finally {
      setIsGeneratingConcepts(false)
    }
  }

  return (
    <section className="panel concept-studio-panel">
      <div className="concept-studio-hero">
        <div className="concept-studio-copy">
          <div className="concept-studio-kicker">
            <Sparkles size={16} />
            AI plan studio
          </div>
          <h2>Generate editable floor plan options for {projectName}.</h2>
          <p>
            Start from requirements, compare layout directions, then save the strongest concept as a new floor option for editing.
          </p>
        </div>
        <div className="concept-studio-stat">
          <Home size={18} />
          <strong>{floorCount}</strong>
          <span>saved floor{floorCount === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className="concept-studio-grid">
        <div className="concept-brief-panel">
          <div className="panel-header">
            <div>
              <div className="section-title">Plan brief</div>
              <div className="muted">Tune the core requirements before generating layout options.</div>
            </div>
          </div>

          <div className="concept-brief-fields">
            <label className="field">
              <span className="field-label">Target size</span>
              <input
                className="field-input"
                type="number"
                min={450}
                max={4200}
                value={brief.targetSqFt}
                onChange={(event) => updateBrief("targetSqFt", Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span className="field-label">Bedrooms</span>
              <input
                className="field-input"
                type="number"
                min={1}
                max={6}
                value={brief.bedrooms}
                onChange={(event) => updateBrief("bedrooms", Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span className="field-label">Bathrooms</span>
              <input
                className="field-input"
                type="number"
                min={1}
                max={5}
                value={brief.bathrooms}
                onChange={(event) => updateBrief("bathrooms", Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span className="field-label">Stories</span>
              <input
                className="field-input"
                type="number"
                min={1}
                max={3}
                value={brief.stories}
                onChange={(event) => updateBrief("stories", Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span className="field-label">Lot shape</span>
              <select
                className="field-input"
                value={brief.lotShape}
                onChange={(event) => updateBrief("lotShape", event.target.value as FloorPlanConceptBrief["lotShape"])}
              >
                <option value="standard">Standard</option>
                <option value="wide">Wide</option>
                <option value="narrow">Narrow</option>
                <option value="corner">Corner</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Priority</span>
              <select
                className="field-input"
                value={brief.lifestyle}
                onChange={(event) => updateBrief("lifestyle", event.target.value as FloorPlanConceptBrief["lifestyle"])}
              >
                <option value="open">Open living</option>
                <option value="private">Privacy</option>
                <option value="compact">Efficiency</option>
                <option value="entertaining">Entertaining</option>
              </select>
            </label>
            <label className="field concept-brief-notes">
              <span className="field-label">Must-haves</span>
              <textarea
                className="field-textarea"
                value={brief.mustHaves}
                onChange={(event) => updateBrief("mustHaves", event.target.value)}
                rows={4}
              />
            </label>
          </div>

          <div className="button-row concept-brief-actions">
            <button type="button" className="button" onClick={handleGenerateConcepts} disabled={isGeneratingConcepts}>
              <Sparkles size={17} />
              {isGeneratingConcepts ? "Generating..." : "Generate with OpenAI"}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => selectedConcept && onSaveConcept(selectedConcept)}
              disabled={!selectedConcept || isSaving || isGeneratingConcepts}
            >
              <Plus size={17} />
              {isSaving ? "Saving..." : "Save selected as new floor"}
            </button>
          </div>
          <div className={`concept-generation-status is-${generationSource}`}>
            <Sparkles size={14} />
            <span>{generationMessage}</span>
          </div>
        </div>

        <div className="concept-results-panel">
          <div className="concept-results-header">
            <div>
              <div className="section-title">Generated options</div>
              <div className="muted">Pick a direction, save it, then refine walls and rooms in the editor.</div>
            </div>
            <span className="badge">{generationSource === "openai" ? "OpenAI" : "Local"} · {concepts.length} concepts</span>
          </div>

          <div className="concept-option-list">
            {concepts.map((concept) => {
              const isSelected = concept.id === selectedConcept?.id

              return (
                <button
                  key={concept.id}
                  type="button"
                  className={`concept-option-card${isSelected ? " is-selected" : ""}`}
                  onClick={() => setSelectedConceptId(concept.id)}
                >
                  <div className="concept-option-preview">
                    <FloorPlanPreviewSvg data={concept.data} label="Generated floor plan preview" />
                  </div>
                  <div className="concept-option-body">
                    <div className="concept-option-topline">
                      <span className="badge">{concept.score}% match</span>
                      {isSelected ? <CheckCircle2 size={17} /> : null}
                    </div>
                    <div className="concept-option-title">{concept.name}</div>
                    <div className="concept-option-summary">{concept.summary}</div>
                    <div className="concept-option-stats">
                      <span>{concept.estimatedSqFt.toLocaleString()} sq ft</span>
                      <span>{concept.roomCount} rooms</span>
                    </div>
                    <div className="concept-option-tags">
                      {concept.highlights.map((highlight) => (
                        <span key={highlight}>{highlight}</span>
                      ))}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {selectedConcept ? (
            <div className="concept-selected-notes">
              <div>
                <strong>Tradeoffs to review</strong>
                <span>{selectedConcept.tradeoffs.join(" · ")}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
