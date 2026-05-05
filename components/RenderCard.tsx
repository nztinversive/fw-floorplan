"use client";

import { Brain, Copy, Download, Expand, FileText, RefreshCw, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import ProgressiveImage from "@/components/ProgressiveImage";
import { RENDER_VIEW_ANGLE_LABELS } from "@/lib/render-angles";
import type { RenderQualityReport } from "@/lib/render-quality";
import { RENDER_REVIEW_ISSUES, getRenderReviewIssueLabel } from "@/lib/render-review";
import { STYLE_PRESET_MAP } from "@/lib/style-presets";
import { formatRelativeTime } from "@/lib/file-utils";
import type { StoredRender } from "@/lib/types";

type RenderCardProps = {
  render: StoredRender;
  isFavoriting: boolean;
  isDeleting: boolean;
  isRegenerating: boolean;
  onToggleFavorite: (renderId: string) => Promise<void> | void;
  onDelete: (renderId: string) => Promise<void> | void;
  onRegenerate: (render: StoredRender) => Promise<void> | void;
  onCritique?: (render: StoredRender) => Promise<void> | void;
  isCritiquing?: boolean;
  onApplyFeedback?: (render: StoredRender, feedback: string) => void;
  onCopyPrompt?: (prompt: string) => Promise<void> | void;
  onUsePromptAsBaseline?: (render: StoredRender) => void;
  onSaveReview?: (render: StoredRender, review: { issueKeys: string[]; notes: string }) => Promise<unknown> | void;
  onRegenerateWithReview?: (render: StoredRender, review: { issueKeys: string[]; notes: string }) => Promise<void> | void;
  onRegenerateWithCritique?: (render: StoredRender) => Promise<void> | void;
  isSavingReview?: boolean;
  parentRender?: StoredRender;
  childRenders?: StoredRender[];
  onCompareLineage?: (parentRenderId: string, childRenderId: string) => void;
  qualityReport?: RenderQualityReport;
  parentQualityReport?: RenderQualityReport;
  comparisonMode?: boolean;
  isSelectedForComparison?: boolean;
  onSelectForComparison?: (renderId: string) => void;
  onImageClick?: (renderId: string) => void;
};

const FEEDBACK_OPTIONS = [
  {
    label: "Too plain",
    feedback: "add more architectural character, depth, trim detail, and intentional material contrast"
  },
  {
    label: "Too modern",
    feedback: "make the next version warmer, softer, and more traditional"
  },
  {
    label: "More porch",
    feedback: "emphasize a deeper covered porch with a stronger, more inviting entry sequence"
  },
  {
    label: "Warmer",
    feedback: "use warmer exterior tones, softer lighting, and a more welcoming residential feel"
  },
  {
    label: "Simpler roof",
    feedback: "simplify the roof geometry while keeping the home realistic and well-proportioned"
  },
  {
    label: "Better landscape",
    feedback: "improve the landscaping with native plantings, cleaner beds, and stronger curb appeal"
  }
];

function getStyleLabel(style: string) {
  return STYLE_PRESET_MAP[style as keyof typeof STYLE_PRESET_MAP]?.name ?? style;
}

function getQualityComparison(parentReport?: RenderQualityReport, childReport?: RenderQualityReport) {
  if (!parentReport || !childReport) {
    return null;
  }

  const childChecksById = new Map(childReport.checks.map((check) => [check.id, check]));
  const improvedChecks = parentReport.checks
    .map((parentCheck) => {
      const childCheck = childChecksById.get(parentCheck.id);
      if (!childCheck || childCheck.score <= parentCheck.score) {
        return null;
      }

      return {
        id: parentCheck.id,
        title: childCheck.title,
        delta: childCheck.score - parentCheck.score
      };
    })
    .filter(Boolean) as Array<{ id: string; title: string; delta: number }>;
  const openChecks = childReport.checks.filter((check) => check.status !== "strong");

  return {
    scoreDelta: childReport.score - parentReport.score,
    improvedChecks,
    openChecks
  };
}

export default function RenderCard({
  render,
  isFavoriting,
  isDeleting,
  isRegenerating,
  onToggleFavorite,
  onDelete,
  onRegenerate,
  onCritique,
  isCritiquing = false,
  onApplyFeedback,
  onCopyPrompt,
  onUsePromptAsBaseline,
  onSaveReview,
  onRegenerateWithReview,
  onRegenerateWithCritique,
  isSavingReview = false,
  parentRender,
  childRenders = [],
  onCompareLineage,
  qualityReport,
  parentQualityReport,
  comparisonMode = false,
  isSelectedForComparison = false,
  onSelectForComparison,
  onImageClick
}: RenderCardProps) {
  const [selectedReviewIssues, setSelectedReviewIssues] = useState<string[]>([]);
  const [reviewNotes, setReviewNotes] = useState("");
  const hasReviewDraft = selectedReviewIssues.length > 0 || reviewNotes.trim().length > 0;
  const isCardBusy = isDeleting || isRegenerating || isCritiquing;
  const isReviewBusy = comparisonMode || isCardBusy || isSavingReview;
  const reviewHistory = render.reviewHistory ?? [];
  const sourceReview = render.sourceReview ?? null;
  const sourceCritique = render.sourceCritique ?? null;
  const latestCritique = render.latestCritique ?? null;
  const qualityComparison = useMemo(
    () => getQualityComparison(parentQualityReport, qualityReport),
    [parentQualityReport, qualityReport]
  );
  const reviewSummary = useMemo(
    () =>
      selectedReviewIssues
        .map(getRenderReviewIssueLabel)
        .concat(reviewNotes.trim() ? [reviewNotes.trim()] : [])
        .join("; "),
    [reviewNotes, selectedReviewIssues]
  );

  function handleDelete() {
    onDelete(render.id);
  }

  function handleDownload() {
    if (!render.imageUrl) {
      return;
    }

    window.open(render.imageUrl, "_blank", "noopener,noreferrer");
  }

  function handleCardClick() {
    if (!comparisonMode || !onSelectForComparison) {
      return;
    }

    onSelectForComparison(render.id);
  }

  function handleCardKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (!comparisonMode || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    handleCardClick();
  }

  function handleImageClick(event: React.MouseEvent) {
    event.stopPropagation();
    if (comparisonMode || !onImageClick || !render.imageUrl) return;
    onImageClick(render.id);
  }

  function toggleReviewIssue(issueKey: string) {
    setSelectedReviewIssues((current) =>
      current.includes(issueKey)
        ? current.filter((key) => key !== issueKey)
        : [...current, issueKey]
    );
  }

  async function handleSaveReview() {
    if (!onSaveReview || !hasReviewDraft) return;

    await onSaveReview(render, {
      issueKeys: selectedReviewIssues,
      notes: reviewNotes
    });
    setSelectedReviewIssues([]);
    setReviewNotes("");
  }

  async function handleRegenerateWithReview() {
    if (!onRegenerateWithReview || !hasReviewDraft) return;

    await onRegenerateWithReview(render, {
      issueKeys: selectedReviewIssues,
      notes: reviewNotes
    });
    setSelectedReviewIssues([]);
    setReviewNotes("");
  }

  return (
    <article
      id={`render-${render.id}`}
      className={`render-card${comparisonMode ? " is-comparison-mode" : ""}${isSelectedForComparison ? " is-selected" : ""}`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      role={comparisonMode ? "button" : undefined}
      tabIndex={comparisonMode ? 0 : undefined}
    >
      <div className="render-toolbar">
        <div className="render-toolbar-badges">
          <span className="badge">{getStyleLabel(render.style)}</span>
          <span className="badge">{RENDER_VIEW_ANGLE_LABELS[render.settings.viewAngle]}</span>
          {comparisonMode && isSelectedForComparison ? <span className="badge">Selected</span> : null}
        </div>
        <div className="render-actions">
          <button
            type="button"
            className="icon-button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(render.id);
            }}
            disabled={comparisonMode || isFavoriting || isCardBusy}
            aria-label={render.isFavorite ? "Remove favorite" : "Mark favorite"}
            title={render.isFavorite ? "Remove favorite" : "Favorite"}
            style={render.isFavorite ? { color: "#d4a84b" } : undefined}
          >
            <Star size={18} fill={render.isFavorite ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={(event) => {
              event.stopPropagation();
              handleDownload();
            }}
            disabled={comparisonMode || !render.imageUrl || isCardBusy}
            aria-label="Download render"
            title="Download render"
          >
            <Download size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={(event) => {
              event.stopPropagation();
              void handleDelete();
            }}
            disabled={comparisonMode || isCardBusy}
            aria-label="Delete render"
            title="Delete render"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div
        className={`render-media${onImageClick && render.imageUrl && !comparisonMode ? " render-media-clickable" : ""}`}
        onClick={handleImageClick}
      >
        {render.imageUrl ? (
          <>
            <ProgressiveImage
              src={render.imageUrl}
              alt={`${getStyleLabel(render.style)} render`}
              sizes="(max-width: 760px) 100vw, (max-width: 1280px) 50vw, 33vw"
            />
            {onImageClick && !comparisonMode ? (
              <span className="render-media-zoom-hint">
                <Expand size={12} />
                View full size
              </span>
            ) : null}
          </>
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              color: "rgba(255, 255, 255, 0.86)"
            }}
          >
            Render image unavailable
          </div>
        )}
      </div>

      <div className="render-card-body">
        <div className="render-meta">
          <div className="section-title">{getStyleLabel(render.style)}</div>
          <div className="render-meta-time">Generated {formatRelativeTime(render.createdAt)}</div>
        </div>

        {qualityReport ? (
          <div className={`render-quality-panel is-${qualityReport.status}`} onClick={(event) => event.stopPropagation()}>
            <div className="render-quality-summary">
              <div>
                <div className="render-quality-score">{qualityReport.score}</div>
                <div className="render-quality-score-label">quality</div>
              </div>
              <div>
                <div className="render-quality-heading">
                  <span className={`badge render-quality-badge is-${qualityReport.status}`}>
                    {qualityReport.label}
                  </span>
                  <span>Render quality</span>
                </div>
                <div className="render-quality-copy">{qualityReport.summary}</div>
              </div>
            </div>

            <div className="render-quality-checks">
              {qualityReport.checks.map((check) => (
                <div key={check.id} className="render-quality-check">
                  <div className="render-quality-check-main">
                    <span className={`badge render-quality-badge is-${check.status}`}>
                      {check.score}
                    </span>
                    <div>
                      <div className="render-quality-title">{check.title}</div>
                      <div className="render-quality-detail">{check.detail}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {qualityReport.suggestion && onApplyFeedback ? (
              <button
                type="button"
                className="render-quality-action"
                onClick={() => onApplyFeedback(render, qualityReport.suggestion)}
                disabled={comparisonMode || isCardBusy}
              >
                Add suggested fixes
              </button>
            ) : null}
          </div>
        ) : null}

        {parentRender && parentQualityReport && qualityReport && qualityComparison ? (
          <div className="render-qa-compare-panel" onClick={(event) => event.stopPropagation()}>
            <div className="render-qa-compare-header">
              <div>
                <div className="field-label">Before/after QA</div>
                <div className="render-qa-compare-hint">
                  Compared with parent generated {formatRelativeTime(parentRender.createdAt)}
                </div>
              </div>
              <span className={`badge render-qa-compare-badge${qualityComparison.scoreDelta >= 0 ? " is-positive" : " is-negative"}`}>
                {qualityComparison.scoreDelta >= 0 ? "+" : ""}
                {qualityComparison.scoreDelta}
              </span>
            </div>

            <div className="render-qa-score-row">
              <div>
                <span>{parentQualityReport.score}</span>
                <small>parent QA</small>
              </div>
              <div>
                <span>{qualityReport.score}</span>
                <small>child QA</small>
              </div>
            </div>

            <div className="render-qa-compare-grid">
              <div>
                <div className="render-qa-compare-title">Improved</div>
                {qualityComparison.improvedChecks.length > 0 ? (
                  <div className="render-qa-chip-list">
                    {qualityComparison.improvedChecks.slice(0, 3).map((check) => (
                      <span key={check.id} className="badge render-qa-chip is-improved">
                        {check.title} +{check.delta}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="render-qa-compare-empty">No QA checks improved yet.</div>
                )}
              </div>

              <div>
                <div className="render-qa-compare-title">Still open</div>
                {qualityComparison.openChecks.length > 0 ? (
                  <div className="render-qa-chip-list">
                    {qualityComparison.openChecks.slice(0, 3).map((check) => (
                      <span key={check.id} className={`badge render-qa-chip is-${check.status}`}>
                        {check.title}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="render-qa-compare-empty">All QA checks are strong.</div>
                )}
              </div>
            </div>

            <div className="render-qa-compare-actions">
              {onCompareLineage ? (
                <button
                  type="button"
                  className="render-lineage-action"
                  onClick={() => onCompareLineage(parentRender.id, render.id)}
                  disabled={isCardBusy}
                >
                  Compare before/after
                </button>
              ) : null}
              {!render.isFavorite ? (
                <button
                  type="button"
                  className="render-lineage-action"
                  onClick={() => onToggleFavorite(render.id)}
                  disabled={comparisonMode || isCardBusy || isFavoriting}
                >
                  Promote child to favorite
                </button>
              ) : (
                <span className="badge render-qa-chip is-improved">Favorited</span>
              )}
            </div>
          </div>
        ) : null}

        {onCritique ? (
          <div
            className={`render-ai-critique-panel is-${latestCritique?.recommendation ?? "empty"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="render-ai-critique-header">
              <div>
                <div className="field-label">AI render critique</div>
                <div className="render-ai-critique-hint">
                  {latestCritique
                    ? `${latestCritique.score}/100 | ${Math.round(latestCritique.confidence * 100)}% confidence`
                    : "Inspect image quality against the saved brief."}
                </div>
              </div>
              <button
                type="button"
                className="render-ai-critique-button"
                onClick={() => void onCritique(render)}
                disabled={comparisonMode || isCardBusy || !render.imageUrl}
              >
                <Brain size={15} />
                {isCritiquing ? "Critiquing..." : latestCritique ? "Refresh critique" : "Run critique"}
              </button>
            </div>

            {latestCritique ? (
              <>
                <div className="render-ai-critique-summary">
                  <span className={`badge render-ai-critique-badge is-${latestCritique.recommendation}`}>
                    {latestCritique.recommendation}
                  </span>
                  <span>{latestCritique.summary}</span>
                </div>

                {latestCritique.issues.length > 0 ? (
                  <div className="render-ai-critique-issues">
                    {latestCritique.issues.map((issue, index) => (
                      <div key={`${issue.category}-${index}`} className="render-ai-critique-issue">
                        <span className={`badge render-ai-critique-badge is-${issue.severity}`}>
                          {issue.severity}
                        </span>
                        <div>
                          <div className="render-ai-critique-title">{issue.category}</div>
                          <div className="render-ai-critique-detail">{issue.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {latestCritique.suggestedFixes && onApplyFeedback ? (
                  <div className="render-ai-critique-actions">
                    <button
                      type="button"
                      className="render-ai-critique-action"
                      onClick={() => onApplyFeedback(render, latestCritique.suggestedFixes)}
                      disabled={comparisonMode || isCardBusy}
                    >
                      Add critique fixes
                    </button>
                    {onRegenerateWithCritique ? (
                      <button
                        type="button"
                        className="render-ai-critique-action"
                        onClick={() => void onRegenerateWithCritique(render)}
                        disabled={comparisonMode || isCardBusy}
                      >
                        <RefreshCw size={15} />
                        Regenerate from critique
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {render.critiqueHistory.length > 1 ? (
                  <div className="render-ai-critique-hint">
                    {render.critiqueHistory.length} critique runs saved
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {parentRender || childRenders.length > 0 ? (
          <div className="render-lineage-panel" onClick={(event) => event.stopPropagation()}>
            <div className="field-label">Version lineage</div>
            {parentRender ? (
              <div className="render-lineage-item">
                <span className="badge">Created from</span>
                <div>
                  <div className="render-lineage-title">
                    {getStyleLabel(parentRender.style)} | {RENDER_VIEW_ANGLE_LABELS[parentRender.settings.viewAngle]}
                  </div>
                  <div className="render-lineage-meta">Parent generated {formatRelativeTime(parentRender.createdAt)}</div>
                </div>
                {onCompareLineage ? (
                  <button
                    type="button"
                    className="render-lineage-action"
                    onClick={() => onCompareLineage(parentRender.id, render.id)}
                    disabled={isCardBusy}
                  >
                    Compare parent
                  </button>
                ) : null}
              </div>
            ) : null}

            {sourceReview ? (
              <div className="render-lineage-review">
                <div className="render-lineage-meta">Review that produced this version</div>
                {sourceReview.issueKeys.length > 0 ? (
                  <div className="render-review-history-chips">
                    {sourceReview.issueKeys.map((issueKey) => (
                      <span key={issueKey} className="badge">
                        {getRenderReviewIssueLabel(issueKey)}
                      </span>
                    ))}
                  </div>
                ) : null}
                {sourceReview.notes ? <div className="render-lineage-notes">{sourceReview.notes}</div> : null}
              </div>
            ) : null}

            {sourceCritique ? (
              <div className="render-lineage-review">
                <div className="render-lineage-meta">AI critique that produced this version</div>
                <div className="render-ai-critique-summary">
                  <span className={`badge render-ai-critique-badge is-${sourceCritique.recommendation}`}>
                    {sourceCritique.score}/100
                  </span>
                  <span>{sourceCritique.summary}</span>
                </div>
                {sourceCritique.suggestedFixes ? (
                  <div className="render-lineage-notes">{sourceCritique.suggestedFixes}</div>
                ) : null}
              </div>
            ) : null}

            {childRenders.length > 0 ? (
              <div className="render-lineage-children">
                <div className="render-lineage-meta">
                  {childRenders.length} regenerated version{childRenders.length === 1 ? "" : "s"} from this render
                </div>
                <div className="render-lineage-child-list">
                  {childRenders.slice(0, 3).map((childRender) => (
                    <button
                      key={childRender.id}
                      type="button"
                      className="render-lineage-child"
                      onClick={() => onCompareLineage?.(render.id, childRender.id)}
                      disabled={!onCompareLineage || isCardBusy}
                    >
                      {getStyleLabel(childRender.style)} | {formatRelativeTime(childRender.createdAt)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          className="button-ghost"
          onClick={(event) => {
            event.stopPropagation();
            onRegenerate(render);
          }}
          disabled={comparisonMode || isCardBusy}
        >
          <RefreshCw size={18} />
          {isRegenerating ? "Generating..." : "Regenerate"}
        </button>

        {onApplyFeedback ? (
          <div className="render-feedback">
            <div className="field-label">Quick tweaks</div>
            <div className="render-feedback-options">
              {FEEDBACK_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className="render-feedback-chip"
                  onClick={(event) => {
                    event.stopPropagation();
                    onApplyFeedback(render, option.feedback);
                  }}
                  disabled={comparisonMode || isCardBusy}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {onSaveReview || onRegenerateWithReview ? (
          <div className="render-review-panel" onClick={(event) => event.stopPropagation()}>
            <div>
              <div className="field-label">Render review</div>
              <div className="render-review-hint">Flag what needs to change, then save it or regenerate with the fixes.</div>
            </div>

            <div className="render-review-chip-grid">
              {RENDER_REVIEW_ISSUES.map((issue) => {
                const isSelected = selectedReviewIssues.includes(issue.key);

                return (
                  <button
                    key={issue.key}
                    type="button"
                    className={`render-review-chip${isSelected ? " is-selected" : ""}`}
                    onClick={() => toggleReviewIssue(issue.key)}
                    disabled={isReviewBusy}
                    aria-pressed={isSelected}
                  >
                    {issue.label}
                  </button>
                );
              })}
            </div>

            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Reviewer notes</span>
              <textarea
                className="field-textarea render-review-notes"
                value={reviewNotes}
                onChange={(event) => setReviewNotes(event.target.value)}
                placeholder="Example: keep this facade, but make the porch deeper and align the windows to the bedrooms."
                disabled={isReviewBusy}
              />
            </label>

            {reviewSummary ? <div className="render-review-summary">{reviewSummary}</div> : null}

            <div className="render-review-actions">
              {onSaveReview ? (
                <button
                  type="button"
                  className="button-ghost"
                  onClick={() => void handleSaveReview()}
                  disabled={!hasReviewDraft || isReviewBusy}
                >
                  {isSavingReview ? "Saving..." : "Save review"}
                </button>
              ) : null}
              {onRegenerateWithReview ? (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => void handleRegenerateWithReview()}
                  disabled={!hasReviewDraft || isReviewBusy}
                >
                  {isRegenerating ? "Generating..." : "Regenerate with fixes"}
                </button>
              ) : null}
            </div>

            {reviewHistory.length > 0 ? (
              <details className="render-review-history">
                <summary>Review history ({reviewHistory.length})</summary>
                <div className="render-review-history-list">
                  {reviewHistory.map((review) => (
                    <div key={review.id} className="render-review-history-item">
                      <div className="render-review-history-meta">
                        {formatRelativeTime(review.createdAt)}
                        {review.authorEmail ? ` by ${review.authorEmail}` : ""}
                      </div>
                      {review.issueKeys.length > 0 ? (
                        <div className="render-review-history-chips">
                          {review.issueKeys.map((issueKey) => (
                            <span key={issueKey} className="badge">
                              {getRenderReviewIssueLabel(issueKey)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {review.notes ? <div className="render-review-history-notes">{review.notes}</div> : null}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}

        {render.prompt ? (
          <details className="render-prompt-details" onClick={(event) => event.stopPropagation()}>
            <summary>
              <FileText size={15} />
              Saved prompt
            </summary>
            <pre className="render-prompt-text">{render.prompt}</pre>
            <div className="render-prompt-actions">
              {onCopyPrompt ? (
                <button
                  type="button"
                  className="button-ghost"
                  onClick={() => onCopyPrompt(render.prompt)}
                >
                  <Copy size={15} />
                  Copy prompt
                </button>
              ) : null}
              {onUsePromptAsBaseline ? (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => onUsePromptAsBaseline(render)}
                  disabled={comparisonMode || isCardBusy}
                >
                  Use as baseline
                </button>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </article>
  );
}
