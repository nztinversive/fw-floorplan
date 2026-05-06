"use client"

import { ArrowRight, Bot, CheckCircle2, MessageSquareText, Plus, WandSparkles } from "lucide-react"
import { useState } from "react"

import FloorPlanPreviewSvg from "@/components/FloorPlanPreviewSvg"
import { generatePlanEditProposal, type PlanEditProposal } from "@/lib/plan-edit-assistant"
import type { FloorPlanData } from "@/lib/types"

type PlanEditAssistantPanelProps = {
  floorLabel: string
  sourceData: FloorPlanData | null
  isSaving?: boolean
  onSaveProposal: (proposal: PlanEditProposal) => Promise<void> | void
}

const EXAMPLE_PROMPTS = [
  "Make the kitchen bigger and add a walk-in pantry",
  "Add a private office near the entry",
  "Create a split-bedroom layout with more privacy",
  "Add a mudroom and outdoor patio connection"
]

export default function PlanEditAssistantPanel({
  floorLabel,
  sourceData,
  isSaving = false,
  onSaveProposal
}: PlanEditAssistantPanelProps) {
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPTS[0])
  const [proposal, setProposal] = useState<PlanEditProposal | null>(null)

  function handlePreview() {
    if (!sourceData || !prompt.trim()) {
      return
    }

    setProposal(generatePlanEditProposal(sourceData, prompt))
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
            Preview AI-style edits against {floorLabel}; save the result as a new floor option before editing details.
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
            <button type="button" className="button" onClick={handlePreview} disabled={!canPreview}>
              <WandSparkles size={17} />
              Preview edit
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => proposal && onSaveProposal(proposal)}
              disabled={!proposal || isSaving}
            >
              <Plus size={17} />
              {isSaving ? "Saving..." : "Save preview as new floor"}
            </button>
          </div>
        </div>

        <div className="plan-edit-preview-card">
          {proposal ? (
            <>
              <div className="plan-edit-preview-media">
                <FloorPlanPreviewSvg data={proposal.data} label="Plan edit proposal preview" />
              </div>
              <div className="plan-edit-preview-body">
                <div className="plan-edit-preview-title-row">
                  <div>
                    <div className="plan-edit-preview-title">{proposal.title}</div>
                    <div className="muted">{proposal.summary}</div>
                  </div>
                  <span className="badge">{proposal.confidence}% match</span>
                </div>

                <div className="plan-edit-list">
                  <strong>Proposed changes</strong>
                  {proposal.changes.map((change) => (
                    <div key={change} className="plan-edit-list-item">
                      <CheckCircle2 size={15} />
                      <span>{change}</span>
                    </div>
                  ))}
                </div>

                <div className="plan-edit-list is-review">
                  <strong>Review before render</strong>
                  {proposal.checks.map((check) => (
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
              <strong>Preview appears here</strong>
              <span>Ask for a layout change, then review the proposed plan before saving it.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
