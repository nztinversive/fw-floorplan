"use client";

import { ArrowRight, CheckCircle2, ClipboardList, ImagePlus, Sparkles, Target, Trophy } from "lucide-react";

export type DesignControlCenterSignal = {
  label: string;
  value: string;
  detail: string;
  status: "ready" | "review" | "blocked" | "idle";
};

export type DesignControlCenterAction = {
  label: string;
  detail: string;
  onClick: () => void;
  disabled?: boolean;
};

type DesignControlCenterPanelProps = {
  packageScore: number;
  packageLabel: string;
  packageSummary: string;
  finalRenderLabel?: string;
  nextIssueLabel?: string;
  nextIssueDetail?: string;
  queueSummary: string;
  signals: DesignControlCenterSignal[];
  primaryAction: DesignControlCenterAction;
  secondaryActions: DesignControlCenterAction[];
};

function getSignalIcon(status: DesignControlCenterSignal["status"]) {
  if (status === "ready") return <CheckCircle2 size={16} />;
  if (status === "blocked") return <Target size={16} />;
  if (status === "review") return <ClipboardList size={16} />;
  return <Sparkles size={16} />;
}

export default function DesignControlCenterPanel({
  packageScore,
  packageLabel,
  packageSummary,
  finalRenderLabel,
  nextIssueLabel,
  nextIssueDetail,
  queueSummary,
  signals,
  primaryAction,
  secondaryActions
}: DesignControlCenterPanelProps) {
  return (
    <section className="panel design-control-center-panel">
      <div className="design-control-center-main">
        <div className="design-control-center-score">
          <span>{packageScore}</span>
          <small>package</small>
        </div>

        <div className="design-control-center-copy">
          <div className="section-title">Design control center</div>
          <div className="design-control-center-status">{packageLabel}</div>
          <div className="muted">{packageSummary}</div>

          <div className="design-control-center-focus">
            <div>
              <div className="field-label">Current final</div>
              <strong>{finalRenderLabel ?? "No final render selected"}</strong>
            </div>
            <div>
              <div className="field-label">Next best action</div>
              <strong>{nextIssueLabel ?? "Generate or select a render to review"}</strong>
              {nextIssueDetail ? <span>{nextIssueDetail}</span> : null}
            </div>
          </div>
        </div>

        <div className="design-control-center-action-card">
          <button
            type="button"
            className="button design-control-center-primary"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
          >
            <ImagePlus size={18} />
            {primaryAction.label}
          </button>
          <div className="muted">{primaryAction.detail}</div>
        </div>
      </div>

      <div className="design-control-center-signals">
        {signals.map((signal) => (
          <article key={signal.label} className={`design-control-center-signal is-${signal.status}`}>
            <div className="design-control-center-signal-icon">{getSignalIcon(signal.status)}</div>
            <div>
              <div className="design-control-center-signal-label">{signal.label}</div>
              <strong>{signal.value}</strong>
              <span>{signal.detail}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="design-control-center-footer">
        <div className="design-control-center-queue">
          <Trophy size={15} />
          <span>{queueSummary}</span>
        </div>
        <div className="design-control-center-secondary">
          {secondaryActions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="design-control-center-secondary-action"
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.detail}
            >
              {action.label}
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
