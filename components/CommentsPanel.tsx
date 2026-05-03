"use client";

import { CheckCircle2, MessageSquare, RotateCcw, Trash2, X } from "lucide-react";

import { formatRelativeTime } from "@/lib/file-utils";
import type { CommentStatus, Point, ProjectComment } from "@/lib/types";

type CommentsPanelProps = {
  comments: ProjectComment[];
  floorLabelById?: Record<string, string>;
  selectedCommentId?: string | null;
  onSelectComment?: (comment: ProjectComment) => void;
  onResolveComment?: (commentId: string) => void;
  onReopenComment?: (commentId: string) => void;
  onDeleteComment?: (commentId: string) => void;
  draftText?: string;
  draftStatus?: CommentStatus;
  pendingPlacement?: Point | null;
  onDraftTextChange?: (value: string) => void;
  onDraftStatusChange?: (value: CommentStatus) => void;
  onSubmitComment?: () => void;
  onCancelPlacement?: () => void;
  isSubmitting?: boolean;
  showComposer?: boolean;
  title?: string;
  subtitle?: string;
};

export default function CommentsPanel({
  comments,
  floorLabelById,
  selectedCommentId = null,
  onSelectComment,
  onResolveComment,
  onReopenComment,
  onDeleteComment,
  draftText = "",
  draftStatus = "open",
  pendingPlacement = null,
  onDraftTextChange,
  onDraftStatusChange,
  onSubmitComment,
  onCancelPlacement,
  isSubmitting = false,
  showComposer = true,
  title = "Comments",
  subtitle = "Drop pins on the plan, then capture context here."
}: CommentsPanelProps) {
  return (
    <div className="sidebar-card">
      <div className="panel-header">
        <div>
          <div className="section-title">{title}</div>
          <div className="muted">{subtitle}</div>
        </div>
        <span className="badge">{comments.length}</span>
      </div>

      {showComposer ? (
        <div className="settings-group">
          <div className="settings-group-header">
            <div className="section-title" style={{ fontSize: "0.92rem" }}>
              New comment
            </div>
            {pendingPlacement ? (
              <button type="button" className="button-ghost" onClick={onCancelPlacement}>
                <X size={14} />
                Clear pin
              </button>
            ) : null}
          </div>

          <div className="muted" style={{ marginBottom: "0.75rem" }}>
            {pendingPlacement
              ? `Pin set at ${Math.round(pendingPlacement.x)}, ${Math.round(pendingPlacement.y)}.`
              : "Select the comment tool, then click the canvas to place a pin."}
          </div>

          <label className="field">
            <span className="field-label">Comment</span>
            <textarea
              className="field-input"
              value={draftText}
              onChange={(event) => onDraftTextChange?.(event.target.value)}
              placeholder="Need to verify this doorway clearance."
              rows={4}
              style={{ resize: "vertical", minHeight: "96px" }}
            />
          </label>

          <label className="field">
            <span className="field-label">Status</span>
            <select
              className="field-select"
              value={draftStatus}
              onChange={(event) => onDraftStatusChange?.(event.target.value as CommentStatus)}
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>

          <button
            type="button"
            className="button-secondary"
            onClick={onSubmitComment}
            disabled={isSubmitting || !pendingPlacement || !draftText.trim()}
          >
            <MessageSquare size={16} />
            {isSubmitting ? "Saving..." : "Save comment"}
          </button>
        </div>
      ) : null}

      <div className="property-list" style={{ marginTop: showComposer ? "1rem" : 0 }}>
        {comments.length > 0 ? (
          comments.map((comment) => {
            const floorLabel = comment.floorPlanId ? floorLabelById?.[comment.floorPlanId] ?? "Pinned floor" : "Project";

            return (
              <article
                key={comment._id}
                className="property-card"
                onClick={() => onSelectComment?.(comment)}
                style={{
                  cursor: onSelectComment ? "pointer" : "default",
                  borderColor: selectedCommentId === comment._id ? "rgba(59, 130, 246, 0.4)" : undefined
                }}
              >
                <div className="property-title" style={{ alignItems: "flex-start" }}>
                  <div>
                    <strong>{comment.authorName}</strong>
                    <div className="muted" style={{ fontSize: "0.78rem", marginTop: "0.18rem" }}>
                      {floorLabel} • {formatRelativeTime(comment.createdAt)}
                    </div>
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: comment.status === "resolved" ? "rgba(22, 163, 74, 0.14)" : "rgba(212, 168, 75, 0.16)",
                      color: comment.status === "resolved" ? "#166534" : "#8a640e"
                    }}
                  >
                    {comment.status}
                  </span>
                </div>

                <div style={{ color: "var(--slate-900, #0f172a)", lineHeight: 1.55 }}>{comment.text}</div>

                <div className="button-row" style={{ marginTop: "0.85rem" }}>
                  {comment.status === "open" && onResolveComment ? (
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onResolveComment(comment._id);
                      }}
                    >
                      <CheckCircle2 size={14} />
                      Resolve
                    </button>
                  ) : null}

                  {comment.status === "resolved" && onReopenComment ? (
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onReopenComment(comment._id);
                      }}
                    >
                      <RotateCcw size={14} />
                      Reopen
                    </button>
                  ) : null}

                  {onDeleteComment ? (
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteComment(comment._id);
                      }}
                      style={{ color: "#b42318" }}
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : (
          <div className="empty-state compact-empty-state">
            <div className="section-title">No comments yet</div>
            <div className="muted">
              Place a pin on the floor plan to start a review thread.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
