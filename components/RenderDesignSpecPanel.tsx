"use client";

import { AlertTriangle, CheckCircle2, FileText, ShieldCheck } from "lucide-react";

import type { RenderDesignSpecAction, RenderDesignSpecReport } from "@/lib/render-design-spec";

type RenderDesignSpecPanelProps = {
  report: RenderDesignSpecReport;
  disabled?: boolean;
  onApplyAction: (action: RenderDesignSpecAction) => void;
};

function getStatusIcon(status: RenderDesignSpecReport["status"]) {
  if (status === "ready") return <CheckCircle2 size={16} />;
  if (status === "blocked") return <AlertTriangle size={16} />;
  return <ShieldCheck size={16} />;
}

export default function RenderDesignSpecPanel({
  report,
  disabled = false,
  onApplyAction
}: RenderDesignSpecPanelProps) {
  return (
    <section className={`panel render-design-spec-panel is-${report.status}`}>
      <div className="panel-header">
        <div>
          <div className="section-title">Render-ready design spec</div>
          <div className="muted">
            A locked summary of plan assumptions, exterior constraints, and missing information used before generation.
          </div>
        </div>
        <span className={`badge render-design-spec-status is-${report.status}`}>
          {getStatusIcon(report.status)}
          {report.label}
        </span>
      </div>

      <div className="render-design-spec-summary">
        <div>
          <div className="render-design-spec-score">{report.score}</div>
          <div className="render-design-spec-score-label">spec score</div>
        </div>
        <div>
          <div className="render-design-spec-copy">{report.summary}</div>
          <div className="render-design-spec-massing">{report.massing}</div>
        </div>
      </div>

      <div className="render-design-spec-grid">
        <div className="render-design-spec-section">
          <div className="render-design-spec-heading">
            <FileText size={14} />
            Room and window assumptions
          </div>
          <div className="render-design-spec-list">
            {report.roomWindowAssumptions.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>

        <div className="render-design-spec-section">
          <div className="render-design-spec-heading">
            <ShieldCheck size={14} />
            Generation constraints
          </div>
          <div className="render-design-spec-list">
            {report.constraints.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </div>

      {report.missingInfo.length > 0 ? (
        <div className="render-design-spec-missing">
          <div className="render-design-spec-heading">
            <AlertTriangle size={14} />
            Missing information
          </div>
          <div className="render-design-spec-list">
            {report.missingInfo.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      ) : null}

      {report.actions.length > 0 ? (
        <div className="render-design-spec-actions">
          {report.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="render-design-spec-action"
              onClick={() => onApplyAction(action)}
              disabled={disabled}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
