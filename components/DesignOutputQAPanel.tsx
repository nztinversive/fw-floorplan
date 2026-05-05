"use client";

import { AlertTriangle, CheckCircle2, LocateFixed, PlusCircle, RefreshCw, XCircle } from "lucide-react";

import type { DesignOutputQACheck, DesignOutputQAReport, DesignOutputQAStatus } from "@/lib/design-output-qa";

type DesignOutputQAPanelProps = {
  report: DesignOutputQAReport;
  title?: string;
  subtitle?: string;
  onFocusRender?: (renderId: string) => void;
  onApplyFixes?: (fixes: string) => void;
  onRegenerateFromQA?: (renderId: string, fixes: string) => void;
  isRegenerating?: boolean;
  compact?: boolean;
};

function getStatusIcon(status: DesignOutputQAStatus) {
  if (status === "ready") return <CheckCircle2 size={16} />;
  if (status === "blocked") return <XCircle size={16} />;
  return <AlertTriangle size={16} />;
}

function getStatusLabel(status: DesignOutputQAStatus) {
  if (status === "ready") return "ready";
  if (status === "blocked") return "fix";
  return "review";
}

function hasCheckAction(check: DesignOutputQACheck, onFocusRender?: (renderId: string) => void) {
  return Boolean(check.renderId && onFocusRender);
}

export default function DesignOutputQAPanel({
  report,
  title = "Design output QA",
  subtitle = "Package-level checks for floor-plan fidelity, design quality, and share readiness.",
  onFocusRender,
  onApplyFixes,
  onRegenerateFromQA,
  isRegenerating = false,
  compact = false
}: DesignOutputQAPanelProps) {
  const visibleChecks = compact
    ? report.checks.filter((check) => check.status !== "ready").slice(0, 4)
    : report.checks;
  const checksToShow = visibleChecks.length > 0 ? visibleChecks : report.checks.slice(0, 3);

  return (
    <section className={`panel design-output-qa-panel is-${report.status}${compact ? " is-compact" : ""}`}>
      <div className="panel-header">
        <div>
          <div className="section-title">{title}</div>
          <div className="muted">{subtitle}</div>
        </div>
        <span className={`badge design-output-qa-status is-${report.status}`}>
          {getStatusIcon(report.status)}
          {report.label}
        </span>
      </div>

      <div className="design-output-qa-summary">
        <div>
          <div className="design-output-qa-score">{report.score}</div>
          <div className="design-output-qa-score-label">QA score</div>
        </div>
        <div>
          <div className="design-output-qa-copy">{report.summary}</div>
          <div className="design-output-qa-stats">
            <span>{report.stats.imageCount} images</span>
            <span>{report.stats.favoriteCount} favorites</span>
            <span>{report.stats.critiquedCount} critiqued</span>
            <span>{report.stats.averageQuality ?? "-"} avg quality</span>
          </div>
        </div>
      </div>

      <div className="design-output-qa-list">
        {checksToShow.map((check) => (
          <article key={check.id} className={`design-output-qa-check is-${check.status}`}>
            <div className="design-output-qa-check-main">
              <span className={`badge design-output-qa-badge is-${check.status}`}>
                {getStatusLabel(check.status)}
              </span>
              <div>
                <div className="design-output-qa-title">{check.title}</div>
                <div className="design-output-qa-detail">{check.detail}</div>
                {check.renderLabel ? (
                  <div className="design-output-qa-render-label">{check.renderLabel}</div>
                ) : null}
              </div>
            </div>

            {hasCheckAction(check, onFocusRender) ? (
              <button
                type="button"
                className="design-output-qa-action"
                onClick={() => onFocusRender?.(check.renderId!)}
              >
                <LocateFixed size={14} />
                Review render
              </button>
            ) : null}
          </article>
        ))}
      </div>

      {report.suggestedFixes || report.regenerationTarget ? (
        <div className="design-output-qa-actions">
          {report.regenerationTarget && onRegenerateFromQA ? (
            <button
              type="button"
              className="design-output-qa-fix-button"
              onClick={() =>
                onRegenerateFromQA(
                  report.regenerationTarget!.renderId,
                  report.regenerationTarget!.fixes
                )
              }
              disabled={isRegenerating}
            >
              <RefreshCw size={15} />
              {isRegenerating ? "Regenerating..." : "Regenerate from QA"}
            </button>
          ) : null}

          {report.suggestedFixes && onApplyFixes ? (
            <button
              type="button"
              className="design-output-qa-fix-button"
              onClick={() => onApplyFixes(report.suggestedFixes)}
              disabled={isRegenerating}
            >
              <PlusCircle size={15} />
              Add QA fixes to brief
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
