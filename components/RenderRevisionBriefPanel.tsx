"use client";

import { ClipboardCheck, LocateFixed, RefreshCw, X } from "lucide-react";

export type RenderRevisionBriefDraft = {
  renderId: string;
  title: string;
  sourceLabel: string;
  scoreLabel?: string;
  failureSummary: string;
  preserveNotes: string;
  changeNotes: string;
  expectedResult: string;
};

type RenderRevisionBriefPanelProps = {
  draft: RenderRevisionBriefDraft;
  isBusy?: boolean;
  onChange: (draft: RenderRevisionBriefDraft) => void;
  onCancel: () => void;
  onFocusRender?: (renderId: string) => void;
  onApplyToBrief?: () => void;
  onRegenerate: () => void;
};

export default function RenderRevisionBriefPanel({
  draft,
  isBusy = false,
  onChange,
  onCancel,
  onFocusRender,
  onApplyToBrief,
  onRegenerate
}: RenderRevisionBriefPanelProps) {
  const updateField = (key: keyof RenderRevisionBriefDraft, value: string) => {
    onChange({
      ...draft,
      [key]: value
    });
  };

  return (
    <section id="render-revision-brief-panel" className="panel render-revision-brief-panel">
      <div className="panel-header">
        <div>
          <div className="section-title">Targeted revision brief</div>
          <div className="muted">Edit the fix instructions before regenerating this render.</div>
        </div>
        <div className="render-revision-brief-actions">
          {onFocusRender ? (
            <button
              type="button"
              className="render-revision-brief-button"
              onClick={() => onFocusRender(draft.renderId)}
            >
              <LocateFixed size={14} />
              Focus
            </button>
          ) : null}
          <button
            type="button"
            className="render-revision-brief-icon-button"
            onClick={onCancel}
            aria-label="Close revision brief"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="render-revision-brief-summary">
        <div>
          <div className="field-label">Source render</div>
          <div className="render-revision-brief-title">{draft.title}</div>
        </div>
        <div className="render-revision-brief-source">
          <span>{draft.sourceLabel}</span>
          {draft.scoreLabel ? <strong>{draft.scoreLabel}</strong> : null}
        </div>
      </div>

      <div className="render-revision-brief-grid">
        <label className="field">
          <span className="field-label">What failed</span>
          <textarea
            className="field-textarea render-revision-brief-textarea"
            value={draft.failureSummary}
            onChange={(event) => updateField("failureSummary", event.target.value)}
            disabled={isBusy}
          />
        </label>
        <label className="field">
          <span className="field-label">What to preserve</span>
          <textarea
            className="field-textarea render-revision-brief-textarea"
            value={draft.preserveNotes}
            onChange={(event) => updateField("preserveNotes", event.target.value)}
            disabled={isBusy}
          />
        </label>
        <label className="field">
          <span className="field-label">What to change</span>
          <textarea
            className="field-textarea render-revision-brief-textarea"
            value={draft.changeNotes}
            onChange={(event) => updateField("changeNotes", event.target.value)}
            disabled={isBusy}
          />
        </label>
        <label className="field">
          <span className="field-label">Expected result</span>
          <textarea
            className="field-textarea render-revision-brief-textarea"
            value={draft.expectedResult}
            onChange={(event) => updateField("expectedResult", event.target.value)}
            disabled={isBusy}
          />
        </label>
      </div>

      <div className="render-revision-brief-footer">
        {onApplyToBrief ? (
          <button
            type="button"
            className="render-revision-brief-button"
            onClick={onApplyToBrief}
            disabled={isBusy}
          >
            <ClipboardCheck size={15} />
            Add to main brief
          </button>
        ) : null}
        <button
          type="button"
          className="render-revision-brief-button is-primary"
          onClick={onRegenerate}
          disabled={isBusy}
        >
          <RefreshCw size={15} />
          {isBusy ? "Regenerating..." : "Regenerate with brief"}
        </button>
      </div>
    </section>
  );
}
