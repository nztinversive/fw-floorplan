"use client";

import { Layers3, RefreshCw, Star, Target, Trophy } from "lucide-react";

import type { RenderDecisionReport } from "@/lib/render-decision";
import { RENDER_WINNER_VARIANTS, type RenderWinnerVariantKey } from "@/lib/render-variants";

type RenderDecisionPanelProps = {
  report: RenderDecisionReport;
  isBusy?: boolean;
  onFavoriteWinner?: () => void;
  onRegenerateWeaker?: () => void;
  onUseWinnerAsBaseline?: () => void;
  onGenerateWinnerVariant?: (variantKey: RenderWinnerVariantKey) => void;
};

function getRecommendationLabel(report: RenderDecisionReport) {
  if (report.recommendation === "needs-another-pass") {
    return "Needs another pass";
  }

  return `Use ${report.winner?.label}`;
}

export default function RenderDecisionPanel({
  report,
  isBusy = false,
  onFavoriteWinner,
  onRegenerateWeaker,
  onUseWinnerAsBaseline,
  onGenerateWinnerVariant
}: RenderDecisionPanelProps) {
  const canGenerateWinnerVariants = Boolean(report.winner && onGenerateWinnerVariant);

  return (
    <section className={`render-decision-panel is-${report.recommendation}`}>
      <div className="render-decision-header">
        <div>
          <div className="field-label">A/B decision</div>
          <div className="render-decision-title">
            <Trophy size={18} />
            {getRecommendationLabel(report)}
          </div>
        </div>
        <span className="badge render-decision-badge">
          {report.margin} pt margin
        </span>
      </div>

      <div className="render-decision-summary">{report.summary}</div>

      <div className="render-decision-score-grid">
        {report.candidates.map((candidate) => (
          <div
            key={candidate.renderId}
            className={`render-decision-score-card${report.winner?.renderId === candidate.renderId ? " is-winner" : ""}`}
          >
            <div className="render-decision-score-top">
              <span>Render {candidate.label}</span>
              <strong>{candidate.totalScore}</strong>
            </div>
            <div className="render-decision-score-name">{candidate.name}</div>
            <div className="render-decision-meter">
              <span style={{ width: `${Math.min(candidate.totalScore, 100)}%` }} />
            </div>
            <div className="render-decision-reasons">
              {candidate.reasons.slice(0, 4).map((reason) => (
                <span key={reason}>{reason}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="render-decision-actions">
        {onFavoriteWinner && report.winner ? (
          <button
            type="button"
            className="render-decision-action"
            onClick={onFavoriteWinner}
            disabled={isBusy}
          >
            <Star size={15} />
            Favorite recommended
          </button>
        ) : null}
        {onRegenerateWeaker && report.weaker ? (
          <button
            type="button"
            className="render-decision-action"
            onClick={onRegenerateWeaker}
            disabled={isBusy}
          >
            <RefreshCw size={15} />
            Regenerate weaker
          </button>
        ) : null}
        {onUseWinnerAsBaseline && report.winner ? (
          <button
            type="button"
            className="render-decision-action"
            onClick={onUseWinnerAsBaseline}
            disabled={isBusy}
          >
            <Target size={15} />
            Apply winner as baseline
          </button>
        ) : null}
      </div>

      {canGenerateWinnerVariants ? (
        <div className="render-decision-variants">
          <div className="render-decision-variant-heading">
            <Layers3 size={16} />
            <span>Generate winner variants</span>
          </div>
          <div className="render-decision-variant-grid">
            {RENDER_WINNER_VARIANTS.map((variant) => (
              <button
                key={variant.key}
                type="button"
                className="render-decision-variant"
                onClick={() => onGenerateWinnerVariant?.(variant.key)}
                disabled={isBusy}
              >
                <strong>{variant.label}</strong>
                <span>{variant.description}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
