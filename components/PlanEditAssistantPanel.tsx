"use client"

import { ArrowRight, Bot, CheckCircle2, MessageSquareText, Plus, RefreshCw, Trophy, WandSparkles } from "lucide-react"
import { useState } from "react"

import FloorPlanPreviewSvg from "@/components/FloorPlanPreviewSvg"
import { generatePlanEditProposals, type PlanEditProposal } from "@/lib/plan-edit-assistant"
import type { FloorPlanData } from "@/lib/types"

type PlanEditAssistantPanelProps = {
  floorLabel: string
  sourceData: FloorPlanData | null
  isSaving?: boolean
  isApplying?: boolean
  onSaveProposal: (proposal: PlanEditProposal) => Promise<void> | void
  onApplyProposal?: (proposal: PlanEditProposal) => Promise<void> | void
}

const EXAMPLE_PROMPTS = [
  "Make the kitchen bigger and add a walk-in pantry",
  "Add a private office near the entry",
  "Create a split-bedroom layout with more privacy",
  "Add a mudroom and outdoor patio connection"
]

const SCORE_LABELS = [
  { key: "programFit", label: "Program" },
  { key: "flow", label: "Flow" },
  { key: "privacy", label: "Privacy" },
  { key: "outdoorConnection", label: "Outdoor" },
  { key: "renderReadiness", label: "Render ready" }
] as const

const FOLLOW_UP_ACTIONS = [
  { label: "Make smaller", instruction: "Make the selected direction more compact and reduce unnecessary area." },
  { label: "Improve privacy", instruction: "Improve bedroom privacy and separate the primary suite from shared living spaces." },
  { label: "Better for renders", instruction: "Strengthen facade logic, entry cues, window rhythm, and plan-to-render readiness." },
  { label: "Add outdoor living", instruction: "Add or improve a patio, porch, deck, or indoor-outdoor living connection." }
]

function formatDelta(value: number, suffix = "") {
  if (value === 0) return `0${suffix}`
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}${suffix}`
}

function joinPrompt(basePrompt: string, instruction: string) {
  const trimmedBase = basePrompt.trim()
  return `${trimmedBase}${trimmedBase ? "\n" : ""}${instruction}`
}

export default function PlanEditAssistantPanel({
  floorLabel,
  sourceData,
  isSaving = false,
  isApplying = false,
  onSaveProposal,
  onApplyProposal
}: PlanEditAssistantPanelProps) {
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPTS[0])
  const [proposals, setProposals] = useState<PlanEditProposal[]>([])
  const [selectedProposalId, setSelectedProposalId] = useState("")
  const selectedProposal = proposals.find((proposal) => proposal.id === selectedProposalId) ?? proposals[0] ?? null
  const recommendedProposal = proposals.find((proposal) => proposal.isRecommended) ?? proposals[0] ?? null

  function handlePreview(promptOverride?: string) {
    const request = promptOverride ?? prompt

    if (!sourceData || !request.trim()) {
      return
    }

    const nextProposals = generatePlanEditProposals(sourceData, request)
    setProposals(nextProposals)
    setSelectedProposalId(nextProposals[0]?.id ?? "")
  }

  function handleFollowUp(instruction: string) {
    const nextPrompt = joinPrompt(prompt, instruction)
    setPrompt(nextPrompt)
    handlePreview(nextPrompt)
  }

  const canPreview = Boolean(sourceData && prompt.trim())
  const baseStats = sourceData
    ? `${sourceData.rooms.length} rooms · ${sourceData.walls.length} walls · ${sourceData.doors.length} doors`
    : "Select or create a floor first"

  return (
    <section className="panel plan-edit-assistant-panel">
      <div className="plan-edit-assistant-header">
        <div>
          <div className="plan-edit-kicker">
            <Bot size={16} />
            Plan edit assistant
          </div>
          <div className="section-title">Tell the plan what to change.</div>
          <div className="muted">
            Generate multiple AI-style edit options against {floorLabel}; compare them, then save the winner as a new floor.
          </div>
        </div>
        <span className="badge">{baseStats}</span>
      </div>

      <div className="plan-edit-assistant-grid">
        <div className="plan-edit-chat">
          <label className="field">
            <span className="field-label">Edit request</span>
            <textarea
              className="field-textarea plan-edit-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Example: Make the kitchen bigger, add an office, and keep the bedrooms more private."
              rows={5}
            />
          </label>

          <div className="plan-edit-prompt-chips" aria-label="Example plan edit prompts">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                type="button"
                className="plan-edit-chip"
                onClick={() => setPrompt(example)}
              >
                <MessageSquareText size={14} />
                {example}
              </button>
            ))}
          </div>

          <div className="button-row plan-edit-actions">
            <button type="button" className="button" onClick={() => handlePreview()} disabled={!canPreview}>
              <WandSparkles size={17} />
              Generate 3 options
            </button>
            {onApplyProposal ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => selectedProposal && onApplyProposal(selectedProposal)}
                disabled={!selectedProposal || isSaving || isApplying}
              >
                <CheckCircle2 size={17} />
                {isApplying ? "Applying..." : `Apply to ${floorLabel.toLowerCase()}`}
              </button>
            ) : null}
            <button
              type="button"
              className="button-ghost"
              onClick={() => selectedProposal && onSaveProposal(selectedProposal)}
              disabled={!selectedProposal || isSaving || isApplying}
            >
              <Plus size={17} />
              {isSaving ? "Saving..." : "Save as new floor"}
            </button>
            <button
              type="button"
              className="button-ghost"
              onClick={() => recommendedProposal && onSaveProposal(recommendedProposal)}
              disabled={!recommendedProposal || isSaving || isApplying}
            >
              <Trophy size={17} />
              Save recommended
            </button>
          </div>

          {selectedProposal && onApplyProposal ? (
            <div className="plan-edit-apply-note">
              Applying in place saves the current {floorLabel.toLowerCase()} as a named version first, so it can be restored from the editor.
            </div>
          ) : null}

          {selectedProposal ? (
            <div className="plan-edit-iterate-card">
              <div>
                <strong>Keep iterating</strong>
                <span>Use the selected option as direction, then regenerate another set.</span>
              </div>
              <div className="plan-edit-followups">
                <button type="button" className="plan-edit-chip" onClick={() => handlePreview()}>
                  <RefreshCw size={14} />
                  Try again
                </button>
                {FOLLOW_UP_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className="plan-edit-chip"
                    onClick={() => handleFollowUp(action.instruction)}
                  >
                    <MessageSquareText size={14} />
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="plan-edit-preview-card">
          {selectedProposal ? (
            <>
              {recommendedProposal ? (
                <div className="plan-edit-recommendation">
                  <div className="plan-edit-recommendation-icon">
                    <Trophy size={18} />
                  </div>
                  <div>
                    <strong>Recommended: {recommendedProposal.title}</strong>
                    <span>{recommendedProposal.recommendationReason}</span>
                  </div>
                  <button
                    type="button"
                    className="plan-edit-recommendation-button"
                    onClick={() => setSelectedProposalId(recommendedProposal.id)}
                  >
                    View winner
                  </button>
                </div>
              ) : null}

              <div className="plan-edit-options-grid" aria-label="Generated plan edit options">
                {proposals.map((proposal) => {
                  const isSelected = proposal.id === selectedProposal.id

                  return (
                    <button
                      key={proposal.id}
                      type="button"
                      className={`plan-edit-option${isSelected ? " is-selected" : ""}`}
                      onClick={() => setSelectedProposalId(proposal.id)}
                    >
                      <div className="plan-edit-option-preview">
                        <FloorPlanPreviewSvg data={proposal.data} label={`${proposal.title} preview`} />
                      </div>
                      <div className="plan-edit-option-meta">
                        <div className="plan-edit-option-badges">
                          <span className="badge">{proposal.focus}</span>
                          {proposal.isRecommended ? <span className="badge is-success">winner</span> : null}
                        </div>
                        <strong>{proposal.title}</strong>
                        <span>{proposal.scores.overall}% score · {proposal.confidence}% match</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="plan-edit-preview-body">
                {sourceData ? (
                  <div className="plan-edit-before-after">
                    <article>
                      <div className="comparison-side-label">Before</div>
                      <FloorPlanPreviewSvg data={sourceData} label={`${floorLabel} before edit`} />
                    </article>
                    <article>
                      <div className="comparison-side-label">After</div>
                      <FloorPlanPreviewSvg data={selectedProposal.data} label={`${selectedProposal.title} after edit`} />
                    </article>
                  </div>
                ) : null}

                <div className="plan-edit-preview-title-row">
                  <div>
                    <div className="plan-edit-preview-title">{selectedProposal.title}</div>
                    <div className="muted">{selectedProposal.summary}</div>
                  </div>
                  <span className="badge">{selectedProposal.scores.overall}% score</span>
                </div>

                <div className="plan-edit-delta-grid" aria-label="Before and after plan delta">
                  <div className="plan-edit-delta-item">
                    <span>Area</span>
                    <strong>{formatDelta(selectedProposal.delta.areaDeltaSqFt, " sq ft")}</strong>
                    <small>
                      {selectedProposal.delta.before.totalAreaSqFt.toLocaleString()} to{" "}
                      {selectedProposal.delta.after.totalAreaSqFt.toLocaleString()} sq ft
                    </small>
                  </div>
                  <div className="plan-edit-delta-item">
                    <span>Rooms</span>
                    <strong>{formatDelta(selectedProposal.delta.roomDelta)}</strong>
                    <small>
                      {selectedProposal.delta.before.roomCount} to {selectedProposal.delta.after.roomCount}
                    </small>
                  </div>
                  <div className="plan-edit-delta-item">
                    <span>Beds / baths</span>
                    <strong>
                      {formatDelta(selectedProposal.delta.bedroomDelta)} / {formatDelta(selectedProposal.delta.bathroomDelta)}
                    </strong>
                    <small>
                      {selectedProposal.delta.after.bedroomCount} beds, {selectedProposal.delta.after.bathroomCount} baths
                    </small>
                  </div>
                  <div className="plan-edit-delta-item">
                    <span>Openings</span>
                    <strong>
                      {formatDelta(selectedProposal.delta.doorDelta)} / {formatDelta(selectedProposal.delta.windowDelta)}
                    </strong>
                    <small>doors / windows</small>
                  </div>
                </div>

                <div className="plan-edit-list is-delta">
                  <strong>Before / after diff</strong>
                  {selectedProposal.delta.summary.map((item) => (
                    <div key={item} className="plan-edit-list-item">
                      <ArrowRight size={15} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                <div className="plan-edit-score-grid" aria-label="Selected option scores">
                  {SCORE_LABELS.map((score) => (
                    <div key={score.key} className="plan-edit-score-item">
                      <div className="plan-edit-score-meta">
                        <span>{score.label}</span>
                        <strong>{selectedProposal.scores[score.key]}</strong>
                      </div>
                      <div className="plan-edit-score-bar">
                        <span style={{ width: `${selectedProposal.scores[score.key]}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="plan-edit-list">
                  <strong>Proposed changes</strong>
                  {selectedProposal.changes.map((change) => (
                    <div key={change} className="plan-edit-list-item">
                      <CheckCircle2 size={15} />
                      <span>{change}</span>
                    </div>
                  ))}
                </div>

                <div className="plan-edit-list is-review">
                  <strong>Review before render</strong>
                  {selectedProposal.checks.map((check) => (
                    <div key={check} className="plan-edit-list-item">
                      <ArrowRight size={15} />
                      <span>{check}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="plan-edit-empty">
              <WandSparkles size={24} />
              <strong>Options appear here</strong>
              <span>Ask for a layout change, then compare three proposed plans before saving one.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
