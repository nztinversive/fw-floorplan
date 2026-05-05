"use client";

import { AlertTriangle, Dna, RefreshCw, Star } from "lucide-react";

import type { DesignDNADriftRender, DesignDNAReport } from "@/lib/design-dna";

type DesignDNAPanelProps = {
  report: DesignDNAReport;
  disabled?: boolean;
  isRegenerating?: boolean;
  onApplyDNA: (dnaText: string) => void;
  onFocusRender?: (renderId: string) => void;
  onRegenerateDrift?: (driftRender: DesignDNADriftRender) => void;
};

export default function DesignDNAPanel({
  report,
  disabled = false,
  isRegenerating = false,
  onApplyDNA,
  onFocusRender,
  onRegenerateDrift
}: DesignDNAPanelProps) {
  const isReady = report.status === "ready";

  return (
    <section className={`panel design-dna-panel is-${report.status}`}>
      <div className="panel-header">
        <div>
          <div className="section-title">Project Design DNA</div>
          <div className="muted">
            Favorite renders become the reusable baseline for future design output.
          </div>
        </div>
        <span className={`badge design-dna-status is-${report.status}`}>
          <Dna size={14} />
          {isReady ? `${report.sourceCount} source${report.sourceCount === 1 ? "" : "s"}` : "waiting"}
        </span>
      </div>

      <div className="design-dna-summary">
        <div className="design-dna-icon">
          {isReady ? <Star size={18} /> : <AlertTriangle size={18} />}
        </div>
        <div>
          <div className="design-dna-copy">{report.summary}</div>
          <div className="muted">
            {isReady
              ? "Apply this once to make new prompts inherit the strongest project direction."
              : "Mark one or more strong renders as favorites, then this panel will build a baseline automatically."}
          </div>
        </div>
      </div>

      {isReady ? (
        <>
          <div className="design-dna-trait-grid">
            {report.traits.map((trait) => (
              <div key={trait.key} className="design-dna-trait">
                <span>{trait.label}</span>
                <strong>{trait.value}</strong>
                <small>{trait.confidence}% confidence</small>
              </div>
            ))}
          </div>

          {report.strengths.length > 0 ? (
            <div className="design-dna-strengths">
              <div className="field-label">Repeated strengths</div>
              <div className="design-dna-strength-list">
                {report.strengths.map((strength) => (
                  <span key={strength} className="design-dna-strength">
                    {strength}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {report.driftRenders.length > 0 ? (
            <div className="design-dna-drift">
              <div>
                <div className="field-label">DNA drift watch</div>
                <div className="muted">Recent non-favorite renders that moved away from the favorite baseline.</div>
              </div>
              <div className="design-dna-drift-list">
                {report.driftRenders.map((render) => (
                  <div key={render.renderId} className="design-dna-drift-item">
                    <div>
                      <strong>{render.label}</strong>
                      <span>{render.score}% DNA match</span>
                    </div>
                    <div className="design-dna-drift-traits">
                      {render.driftTraits.map((trait) => (
                        <span key={trait.label}>
                          {trait.label}: {trait.actual}
                        </span>
                      ))}
                    </div>
                    <div className="design-dna-drift-actions">
                      {onFocusRender ? (
                        <button
                          type="button"
                          className="design-dna-action"
                          onClick={() => onFocusRender(render.renderId)}
                          disabled={disabled || isRegenerating}
                        >
                          Review render
                        </button>
                      ) : null}
                      {onRegenerateDrift ? (
                        <button
                          type="button"
                          className="design-dna-action"
                          onClick={() => onRegenerateDrift(render)}
                          disabled={disabled || isRegenerating}
                        >
                          <RefreshCw size={14} />
                          {isRegenerating ? "Regenerating..." : "Regenerate back to DNA"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="design-dna-drift-empty">
              <div className="field-label">DNA drift watch</div>
              <div className="muted">All non-favorite render settings currently match the favorite baseline.</div>
            </div>
          )}

          <div className="design-dna-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => onApplyDNA(report.dnaText)}
              disabled={disabled || !report.dnaText}
            >
              <Dna size={16} />
              Apply DNA to brief
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
