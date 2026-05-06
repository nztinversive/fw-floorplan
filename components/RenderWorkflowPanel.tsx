"use client"

import { ArrowRight, CheckCircle2, CircleDot, Lock } from "lucide-react"

export type RenderWorkflowStepStatus = "ready" | "review" | "blocked" | "idle"

export type RenderWorkflowStep = {
  id: string
  label: string
  detail: string
  status: RenderWorkflowStepStatus
  actionLabel: string
  onClick: () => void
  disabled?: boolean
}

type RenderWorkflowPanelProps = {
  steps: RenderWorkflowStep[]
}

function getStepIcon(status: RenderWorkflowStepStatus) {
  if (status === "ready") return <CheckCircle2 size={16} />
  if (status === "blocked") return <Lock size={16} />
  return <CircleDot size={16} />
}

function getStepStatusLabel(status: RenderWorkflowStepStatus) {
  if (status === "ready") return "ready"
  if (status === "blocked") return "blocked"
  if (status === "idle") return "waiting"
  return "review"
}

export default function RenderWorkflowPanel({ steps }: RenderWorkflowPanelProps) {
  return (
    <section className="panel render-workflow-panel" aria-label="Render workflow">
      <div className="render-workflow-header">
        <div>
          <div className="section-title">Generation workflow</div>
          <div className="muted">Follow the path from plan quality to final package without hunting through every tool.</div>
        </div>
      </div>

      <div className="render-workflow-steps">
        {steps.map((step, index) => (
          <div key={step.id} className={`render-workflow-step is-${step.status}`}>
            <div className="render-workflow-step-main">
              <span className="render-workflow-step-icon">{getStepIcon(step.status)}</span>
              <div>
                <div className="render-workflow-step-kicker">
                  Step {index + 1}
                  <span>{getStepStatusLabel(step.status)}</span>
                </div>
                <div className="render-workflow-step-title">{step.label}</div>
                <div className="render-workflow-step-detail">{step.detail}</div>
              </div>
            </div>
            <button
              type="button"
              className="render-workflow-action"
              onClick={step.onClick}
              disabled={step.disabled}
            >
              {step.actionLabel}
              <ArrowRight size={14} />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
