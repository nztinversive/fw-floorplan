"use client"

import { ArrowRight, Bot, CheckCircle2, MessageSquareText, Plus, RefreshCw, Trophy, WandSparkles } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import FloorPlanPreviewSvg from "@/components/FloorPlanPreviewSvg"
import {
  generatePlanEditProposals,
  type PlanEditConstraintId,
  type PlanEditConstraintSettings,
  type PlanEditConstraintStatus,
  type PlanEditProposal
} from "@/lib/plan-edit-assistant"
import type { FloorPlanData } from "@/lib/types"

type PlanEditAssistantPanelProps = {
  floorLabel: string
  sourceData: FloorPlanData | null
  isSaving?: boolean
  isApplying?: boolean
  onGenerateWithAI?: (request: {
    prompt: string
    constraints: PlanEditConstraintSettings
    sourceData: FloorPlanData
  }) => Promise<PlanEditProposal[]>
  onSaveProposal: (proposal: PlanEditProposal) => Promise<void> | void
  onApplyProposal?: (proposal: PlanEditProposal) => Promise<void> | void
}

type PlanEditSourceContext = {
  label: string
  data: FloorPlanData
  proposalId?: string
}

type PlanEditRevisionThread = {
  id: string
  prompt: string
  sourceLabel: string
  sourceData: FloorPlanData
  proposals: PlanEditProposal[]
  selectedProposalId: string
  mode: "openai" | "local" | "fallback"
  createdAt: string
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

const CONSTRAINT_OPTIONS: Array<{
  id: PlanEditConstraintId
  label: string
  detail: string
}> = [
  { id: "keep-bedroom-count", label: "Keep bedrooms", detail: "Do not add or remove bedrooms." },
  { id: "keep-bathroom-count", label: "Keep baths", detail: "Do not add or remove bathrooms." },
  { id: "keep-kitchen", label: "Do not move kitchen", detail: "Keep the kitchen in roughly the same zone." },
  { id: "must-have-mudroom", label: "Must include mudroom", detail: "Require mudroom, laundry, or drop zone." },
  { id: "improve-privacy", label: "Improve privacy", detail: "Prefer separated bedroom and suite logic." },
  { id: "improve-render-readiness", label: "Improve render readiness", detail: "Prefer stronger exterior/render cues." }
]

function formatDelta(value: number, suffix = "") {
  if (value === 0) return `0${suffix}`
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}${suffix}`
}

function joinPrompt(basePrompt: string, instruction: string) {
  const trimmedBase = basePrompt.trim()
  return `${trimmedBase}${trimmedBase ? "\n" : ""}${instruction}`
}

function getConstraintStatusLabel(status: PlanEditConstraintStatus) {
  if (status === "met") return "met"
  if (status === "missed") return "missed"
  return "review"
}

function getSourceFingerprint(data: FloorPlanData | null, floorLabel: string) {
  if (!data) return `${floorLabel}:empty`
  return [
    floorLabel,
    data.rooms.length,
    data.walls.length,
    data.doors.length,
    data.windows.length,
    Math.round(data.rooms.reduce((total, room) => total + Math.max(room.areaSqFt, 0), 0))
  ].join(":")
}

export default function PlanEditAssistantPanel({
  floorLabel,
  sourceData,
  isSaving = false,
  isApplying = false,
  onGenerateWithAI,
  onSaveProposal,
  onApplyProposal
}: PlanEditAssistantPanelProps) {
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPTS[0])
  const [lockedConstraintIds, setLockedConstraintIds] = useState<PlanEditConstraintId[]>([
    "keep-bedroom-count",
    "keep-kitchen"
  ])
  const [maxSqFt, setMaxSqFt] = useState("")
  const [proposals, setProposals] = useState<PlanEditProposal[]>([])
  const [selectedProposalId, setSelectedProposalId] = useState("")
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [generationMessage, setGenerationMessage] = useState("")
  const [iterationSource, setIterationSource] = useState<PlanEditSourceContext | null>(null)
  const [revisionThreads, setRevisionThreads] = useState<PlanEditRevisionThread[]>([])
  const [activeRevisionId, setActiveRevisionId] = useState("")
  const sourceFingerprint = useMemo(() => getSourceFingerprint(sourceData, floorLabel), [floorLabel, sourceData])
  const workingSource = iterationSource ?? (sourceData ? { label: floorLabel, data: sourceData } : null)
  const selectedProposal = proposals.find((proposal) => proposal.id === selectedProposalId) ?? proposals[0] ?? null
  const recommendedProposal = proposals.find((proposal) => proposal.isRecommended) ?? proposals[0] ?? null
  const selectedHardConstraintMiss = Boolean(selectedProposal?.hasHardConstraintMiss)
  const activeRevision = revisionThreads.find((thread) => thread.id === activeRevisionId) ?? null
  const previewSource = activeRevision
    ? { label: activeRevision.sourceLabel, data: activeRevision.sourceData }
    : workingSource

  useEffect(() => {
    setProposals([])
    setSelectedProposalId("")
    setIsGeneratingAI(false)
    setGenerationMessage("")
    setIterationSource(null)
    setRevisionThreads([])
    setActiveRevisionId("")
  }, [sourceFingerprint])

  function getConstraints(): PlanEditConstraintSettings {
    const parsedMaxSqFt = Number(maxSqFt)
    return {
      lockedIds: lockedConstraintIds,
      maxSqFt: Number.isFinite(parsedMaxSqFt) && parsedMaxSqFt > 0 ? parsedMaxSqFt : null
    }
  }

  function selectProposal(proposalId: string) {
    setSelectedProposalId(proposalId)
    setRevisionThreads((current) =>
      current.map((thread) =>
        thread.id === activeRevisionId ? { ...thread, selectedProposalId: proposalId } : thread
      )
    )
  }

  function recordRevision(args: {
    request: string
    source: PlanEditSourceContext
    nextProposals: PlanEditProposal[]
    mode: PlanEditRevisionThread["mode"]
  }) {
    const selectedId = args.nextProposals[0]?.id ?? ""
    const thread: PlanEditRevisionThread = {
      id: `plan-edit-thread-${Date.now()}`,
      prompt: args.request,
      sourceLabel: args.source.label,
      sourceData: args.source.data,
      proposals: args.nextProposals,
      selectedProposalId: selectedId,
      mode: args.mode,
      createdAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    }

    setProposals(args.nextProposals)
    setSelectedProposalId(selectedId)
    setActiveRevisionId(thread.id)
    setRevisionThreads((current) => [thread, ...current].slice(0, 8))
  }

  function loadRevision(thread: PlanEditRevisionThread) {
    setPrompt(thread.prompt)
    setIterationSource({
      label: thread.sourceLabel,
      data: thread.sourceData
    })
    setProposals(thread.proposals)
    setSelectedProposalId(thread.selectedProposalId)
    setActiveRevisionId(thread.id)
    setGenerationMessage(
      `Loaded ${thread.mode === "openai" ? "OpenAI" : thread.mode === "fallback" ? "fallback" : "local"} revision from ${thread.createdAt}.`
    )
  }

  function handlePreview(promptOverride?: string, sourceOverride?: PlanEditSourceContext) {
    const request = promptOverride ?? prompt
    const source = sourceOverride ?? workingSource

    if (!source || !request.trim()) {
      return
    }

    const nextProposals = generatePlanEditProposals(source.data, request, getConstraints())
    recordRevision({
      request,
      source,
      nextProposals,
      mode: "local"
    })
    setGenerationMessage(`Generated local editable options from ${source.label}.`)
  }

  async function handleOpenAIPreview(promptOverride?: string, sourceOverride?: PlanEditSourceContext) {
    const request = (promptOverride ?? prompt).trim()
    const source = sourceOverride ?? workingSource

    if (!source || !request || isGeneratingAI) {
      return
    }

    if (!onGenerateWithAI) {
      handlePreview(request, source)
      return
    }

    setIsGeneratingAI(true)
    setGenerationMessage(`OpenAI is generating editable plan options from ${source.label}...`)

    try {
      const nextProposals = await onGenerateWithAI({
        prompt: request,
        constraints: getConstraints(),
        sourceData: source.data
      })
      recordRevision({
        request,
        source,
        nextProposals,
        mode: "openai"
      })
      setGenerationMessage(`OpenAI generated editable options from ${source.label}.`)
    } catch (error) {
      const fallbackProposals = generatePlanEditProposals(source.data, request, getConstraints())
      recordRevision({
        request,
        source,
        nextProposals: fallbackProposals,
        mode: "fallback"
      })
      setGenerationMessage(
        error instanceof Error
          ? `OpenAI was unavailable (${error.message}); generated local fallback options.`
          : "OpenAI was unavailable; generated local fallback options."
      )
    } finally {
      setIsGeneratingAI(false)
    }
  }

  function toggleConstraint(id: PlanEditConstraintId) {
    setLockedConstraintIds((current) =>
      current.includes(id)
        ? current.filter((constraintId) => constraintId !== id)
        : [...current, id]
    )
  }

  function handleFollowUp(instruction: string) {
    if (!selectedProposal) {
      return
    }

    const nextPrompt = joinPrompt(prompt, instruction)
    const nextSource = {
      label: selectedProposal.title,
      data: selectedProposal.data,
      proposalId: selectedProposal.id
    }
    setPrompt(nextPrompt)
    setIterationSource(nextSource)
    setGenerationMessage(`${selectedProposal.title} is now the source. Run OpenAI or local generation to continue the revision.`)
  }

  function handleUseSelectedAsSource() {
    if (!selectedProposal) {
      return
    }

    setIterationSource({
      label: selectedProposal.title,
      data: selectedProposal.data,
      proposalId: selectedProposal.id
    })
    setGenerationMessage(`${selectedProposal.title} is now the source for the next edit.`)
  }

  const canPreview = Boolean(workingSource && prompt.trim())
  const baseStats = workingSource
    ? `${workingSource.data.rooms.length} rooms · ${workingSource.data.walls.length} walls · ${workingSource.data.doors.length} doors`
    : "Select or create a floor first"
  const sourceLabel = workingSource?.label ?? floorLabel

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
            Generate editable plan options against {sourceLabel}; compare them, then keep iterating from the winner.
          </div>
        </div>
        <div className="plan-edit-source-badges">
          {iterationSource ? (
            <button type="button" className="badge plan-edit-source-reset" onClick={() => setIterationSource(null)}>
              Source: {sourceLabel} · reset
            </button>
          ) : (
            <span className="badge">Source: {sourceLabel}</span>
          )}
          <span className="badge">{baseStats}</span>
        </div>
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

          <div className="plan-edit-constraints-card">
            <div>
              <strong>Plan constraints</strong>
              <span>Lock what the assistant should protect before generating options.</span>
            </div>

            <div className="plan-edit-constraints-grid">
              {CONSTRAINT_OPTIONS.map((constraint) => {
                const isActive = lockedConstraintIds.includes(constraint.id)

                return (
                  <button
                    key={constraint.id}
                    type="button"
                    className={`plan-edit-constraint-chip${isActive ? " is-active" : ""}`}
                    onClick={() => toggleConstraint(constraint.id)}
                    aria-pressed={isActive}
                  >
                    <CheckCircle2 size={14} />
                    <span>{constraint.label}</span>
                    <small>{constraint.detail}</small>
                  </button>
                )
              })}
            </div>

            <label className="field plan-edit-max-area-field">
              <span className="field-label">Max square footage</span>
              <input
                className="field-input"
                type="number"
                min={0}
                step={25}
                value={maxSqFt}
                onChange={(event) => setMaxSqFt(event.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>

          <div className="button-row plan-edit-actions">
            <button type="button" className="button" onClick={() => handleOpenAIPreview()} disabled={!canPreview || isGeneratingAI}>
              <Bot size={17} />
              {isGeneratingAI ? "Generating..." : "Generate plan edits with OpenAI"}
            </button>
            <button type="button" className="button-secondary" onClick={() => handlePreview()} disabled={!canPreview || isGeneratingAI}>
              <WandSparkles size={17} />
              Generate local options
            </button>
            {onApplyProposal ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => selectedProposal && onApplyProposal(selectedProposal)}
                disabled={!selectedProposal || isSaving || isApplying || selectedHardConstraintMiss}
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

          {generationMessage ? <div className="plan-edit-generation-note">{generationMessage}</div> : null}

          {selectedProposal && onApplyProposal ? (
            <div className="plan-edit-apply-note">
              {selectedHardConstraintMiss
                ? "Resolve missed hard constraints before applying in place. Saving as a new floor is still available for exploration."
                : `Applying in place saves the current ${floorLabel.toLowerCase()} as a named version first, so it can be restored from the editor.`}
            </div>
          ) : null}

          {selectedProposal ? (
            <div className="plan-edit-iterate-card">
              <div>
                <strong>Keep iterating</strong>
                <span>Use the selected option as the next source, then ask for another refinement.</span>
              </div>
              <div className="plan-edit-followups">
                <button type="button" className="plan-edit-chip" onClick={handleUseSelectedAsSource}>
                  <CheckCircle2 size={14} />
                  Use selected as source
                </button>
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

          {revisionThreads.length > 0 ? (
            <div className="plan-edit-history-card">
              <div>
                <strong>Edit history</strong>
                <span>Reload a prior generation, then continue from any option.</span>
              </div>
              <div className="plan-edit-history-list">
                {revisionThreads.map((thread, index) => {
                  const isActive = thread.id === activeRevisionId

                  return (
                    <button
                      key={thread.id}
                      type="button"
                      className={`plan-edit-history-item${isActive ? " is-active" : ""}`}
                      onClick={() => loadRevision(thread)}
                    >
                      <span>{index === 0 ? "Latest" : `Rev ${revisionThreads.length - index}`}</span>
                      <strong>{thread.prompt.split("\n").slice(-1)[0]}</strong>
                      <small>
                        {thread.mode === "openai" ? "OpenAI" : thread.mode === "fallback" ? "Fallback" : "Local"} · {thread.sourceLabel} · {thread.createdAt}
                      </small>
                    </button>
                  )
                })}
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
                    onClick={() => selectProposal(recommendedProposal.id)}
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
                      onClick={() => selectProposal(proposal.id)}
                    >
                      <div className="plan-edit-option-preview">
                        <FloorPlanPreviewSvg data={proposal.data} label={`${proposal.title} preview`} />
                      </div>
                      <div className="plan-edit-option-meta">
                        <div className="plan-edit-option-badges">
                          <span className="badge">{proposal.focus}</span>
                          {proposal.isRecommended ? <span className="badge is-success">winner</span> : null}
                          {proposal.constraints.length > 0 ? (
                            <span className={`badge plan-edit-constraint-summary${proposal.hasHardConstraintMiss ? " is-missed" : " is-met"}`}>
                              {proposal.constraintSummary}
                            </span>
                          ) : null}
                        </div>
                        <strong>{proposal.title}</strong>
                        <span>{proposal.scores.overall}% score · {proposal.confidence}% match</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="plan-edit-preview-body">
                {previewSource ? (
                  <div className="plan-edit-before-after">
                    <article>
                      <div className="comparison-side-label">Before</div>
                      <FloorPlanPreviewSvg data={previewSource.data} label={`${previewSource.label} before edit`} />
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

                {selectedProposal.constraints.length > 0 ? (
                  <div className="plan-edit-constraint-results">
                    <strong>Constraint check</strong>
                    <div className="plan-edit-constraint-results-list">
                      {selectedProposal.constraints.map((constraint) => (
                        <div
                          key={constraint.id}
                          className={`plan-edit-constraint-result is-${constraint.status}${constraint.isHard ? " is-hard" : ""}`}
                        >
                          <span>{getConstraintStatusLabel(constraint.status)}</span>
                          <div>
                            <strong>{constraint.label}</strong>
                            <small>{constraint.detail}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

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
