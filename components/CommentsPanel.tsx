"use client";

import { CheckCircle2, MessageSquare, PlayCircle, RotateCcw, Send, Trash2, X } from "lucide-react";

import { formatRelativeTime } from "@/lib/file-utils";
import type { CommentStatus, Point, ProjectComment } from "@/lib/types";

type CommentsPanelProps = {
  comments: ProjectComment[];
  floorLabelById?: Record<string, string>;
  selectedCommentId?: string | null;
  onSelectComment?: (comment: ProjectComment) => void;
  onResolveComment?: (commentId: string) => void;
  onReopenComment?: (commentId: string) => void;
  onUpdateCommentStatus?: (commentId: string, status: CommentStatus) => void;
  onDeleteComment?: (commentId: string) => void;
  onReplyComment?: (commentId: string) => void;
  draftText?: string;
  draftStatus?: CommentStatus;
  replyDrafts?: Record<string, string>;
  replyingCommentId?: string | null;
  pendingPlacement?: Point | null;
  onDraftTextChange?: (value: string) => void;
  onDraftStatusChange?: (value: CommentStatus) => void;
  onReplyDraftChange?: (commentId: string, value: string) => void;
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
  onUpdateCommentStatus,
  onDeleteComment,
  onReplyComment,
  draftText = "",
  draftStatus = "open",
  replyDrafts = {},
  replyingCommentId = null,
  pendingPlacement = null,
  onDraftTextChange,
  onDraftStatusChange,
  onReplyDraftChange,
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
              <option value="in_progress">In progress</option>
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
            const replyDraft = replyDrafts[comment._id] ?? "";
            const statusStyle = {
              open: {
                background: "rgba(212, 168, 75, 0.16)",
                color: "#8a640e"
              },
              in_progress: {
                background: "rgba(59, 130, 246, 0.14)",
                color: "#1d4ed8"
              },
              resolved: {
                background: "rgba(22, 163, 74, 0.14)",
                color: "#166534"
              }
            }[comment.status];

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
                    style={statusStyle}
                  >
                    {comment.status === "in_progress" ? "in progress" : comment.status}
                  </span>
                </div>

                <div style={{ color: "var(--slate-900, #0f172a)", lineHeight: 1.55 }}>{comment.text}</div>

                <div className="button-row" style={{ marginTop: "0.85rem" }}>
                  {comment.status === "open" && onUpdateCommentStatus ? (
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onUpdateCommentStatus(comment._id, "in_progress");
                      }}
                    >
                      <PlayCircle size={14} />
                      Start
                    </button>
                  ) : null}

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

                  {comment.status === "in_progress" && onResolveComment ? (
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

                {(comment.replies?.length ?? 0) > 0 ? (
                  <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.85rem" }}>
                    {comment.replies?.map((reply) => (
                      <div
                        key={reply._id}
                        style={{
                          borderLeft: "2px solid rgba(100, 116, 139, 0.22)",
                          paddingLeft: "0.75rem"
                        }}
                      >
                        <div className="muted" style={{ fontSize: "0.76rem", marginBottom: "0.2rem" }}>
                          <strong>{reply.authorName}</strong> • {formatRelativeTime(reply.createdAt)}
                        </div>
                        <div style={{ color: "var(--slate-900, #0f172a)", lineHeight: 1.5 }}>{reply.text}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {onReplyComment ? (
                  <div
                    style={{ display: "grid", gap: "0.5rem", marginTop: "0.85rem" }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <textarea
                      className="field-input"
                      value={replyDraft}
                      onChange={(event) => onReplyDraftChange?.(comment._id, event.target.value)}
                      placeholder="Reply with review context."
                      rows={2}
                      style={{ resize: "vertical", minHeight: "68px" }}
                    />
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => onReplyComment(comment._id)}
                      disabled={!replyDraft.trim() || replyingCommentId === comment._id}
                    >
                      <Send size={14} />
                      {replyingCommentId === comment._id ? "Replying..." : "Reply"}
                    </button>
                  </div>
                ) : null}
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
