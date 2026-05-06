"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDot, ShieldCheck } from "lucide-react";

import type {
  PlanQualityGateAction,
  PlanQualityGateReport,
  PlanQualityGateStatus
} from "@/lib/plan-quality-gates";

type PlanQualityGatesPanelProps = {
  report: PlanQualityGateReport;
  disabled?: boolean;
  onAction: (action: PlanQualityGateAction) => void;
};

function getStatusIcon(status: PlanQualityGateStatus) {
  if (status === "ready") return <CheckCircle2 size={16} />;
  if (status === "blocked") return <AlertTriangle size={16} />;
  return <ShieldCheck size={16} />;
}

function getGateIcon(status: PlanQualityGateStatus) {
  if (status === "ready") return <CheckCircle2 size={16} />;
  if (status === "blocked") return <AlertTriangle size={16} />;
  return <CircleDot size={16} />;
}

export default function PlanQualityGatesPanel({
  report,
  disabled = false,
  onAction
}: PlanQualityGatesPanelProps) {
  return (
    <section id="plan-quality-gates-section" className={`panel plan-quality-gates-panel is-${report.status}`}>
      <div className="panel-header">
        <div>
          <div className="section-title">Plan quality gates</div>
          <div className="muted">
            Pre-generation checks that keep floor-plan inputs, design intent, and render controls aligned.
          </div>
        </div>
        <span className={`badge plan-quality-gates-status is-${report.status}`}>
          {getStatusIcon(report.status)}
          {report.label}
        </span>
      </div>

      <div className="plan-quality-gates-summary">
        <div>
          <div className="plan-quality-gates-score">{report.score}</div>
          <div className="plan-quality-gates-score-label">quality</div>
        </div>
        <div>
          <div className="plan-quality-gates-copy">{report.summary}</div>
          <div className="plan-quality-gates-counts">
            {report.readyCount} ready / {report.reviewCount} review / {report.blockedCount} blocked
          </div>
        </div>
      </div>

      <div className="plan-quality-gates-list">
        {report.gates.map((gate) => (
          <div key={gate.id} className={`plan-quality-gate is-${gate.status}`}>
            <div className="plan-quality-gate-main">
              <span className="plan-quality-gate-icon">{getGateIcon(gate.status)}</span>
              <div>
                <div className="plan-quality-gate-title">{gate.label}</div>
                <div className="plan-quality-gate-detail">{gate.detail}</div>
              </div>
            </div>

            {gate.actions.length > 0 ? (
              <div className="plan-quality-gate-actions">
                {gate.actions.map((action) =>
                  action.kind === "link" ? (
                    <Link key={action.id} href={action.href} className="plan-quality-gate-action">
                      {action.label}
                    </Link>
                  ) : (
                    <button
                      key={action.id}
                      type="button"
                      className="plan-quality-gate-action"
                      onClick={() => onAction(action)}
                      disabled={disabled}
                    >
                      {action.label}
                    </button>
                  )
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
