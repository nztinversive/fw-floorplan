"use client";

import { Mail, Shield, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";

import type { ProjectMember, ProjectMemberRole } from "@/lib/types";

type SharePermissionsPanelProps = {
  members: ProjectMember[];
  onInvite: (email: string, role: ProjectMemberRole) => Promise<void>;
  onRemove: (memberId: string) => Promise<void>;
  onUpdateRole: (memberId: string, role: ProjectMemberRole) => Promise<void>;
};

export default function SharePermissionsPanel({
  members,
  onInvite,
  onRemove,
  onUpdateRole
}: SharePermissionsPanelProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectMemberRole>("viewer");
  const [isInviting, setIsInviting] = useState(false);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);

  async function handleInvite() {
    if (!email.trim() || isInviting) {
      return;
    }

    setIsInviting(true);
    try {
      await onInvite(email, role);
      setEmail("");
      setRole("viewer");
    } catch {
      // Parent handlers surface the user-facing error toast.
    } finally {
      setIsInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, nextRole: ProjectMemberRole) {
    setActiveMemberId(memberId);
    try {
      await onUpdateRole(memberId, nextRole);
    } catch {
      // Parent handlers surface the user-facing error toast.
    } finally {
      setActiveMemberId(null);
    }
  }

  async function handleRemove(memberId: string) {
    setActiveMemberId(memberId);
    try {
      await onRemove(memberId);
    } catch {
      // Parent handlers surface the user-facing error toast.
    } finally {
      setActiveMemberId(null);
    }
  }

  return (
    <section className="panel" style={{ marginTop: "1.5rem" }}>
      <div className="panel-header">
        <div>
          <div className="section-title">Project permissions</div>
          <div className="muted">Invite collaborators and assign project roles.</div>
        </div>
        <span className="badge">{members.length} members</span>
      </div>

      <div className="settings-group">
        <div className="settings-group-header">
          <div className="section-title" style={{ fontSize: "0.92rem" }}>
            Invite member
          </div>
        </div>

        <div className="form-grid">
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="field-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@company.com"
            />
          </label>

          <label className="field">
            <span className="field-label">Role</span>
            <select
              className="field-select"
              value={role}
              onChange={(event) => setRole(event.target.value as ProjectMemberRole)}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
              <option value="owner">Owner</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          className="button-primary"
          onClick={handleInvite}
          disabled={isInviting || !email.trim()}
        >
          <UserPlus size={16} />
          {isInviting ? "Inviting..." : "Invite member"}
        </button>
      </div>

      <div className="property-list" style={{ marginTop: "1rem" }}>
        {members.length > 0 ? (
          members.map((member) => (
            <article key={member._id} className="property-card">
              <div className="property-title" style={{ alignItems: "flex-start" }}>
                <div>
                  <strong>{member.email}</strong>
                  <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.15rem" }}>
                    {member.acceptedAt ? "Accepted invite" : "Invitation pending"}
                  </div>
                </div>
                <span
                  className="badge"
                  style={{
                    background:
                      member.role === "owner"
                        ? "rgba(212, 168, 75, 0.16)"
                        : member.role === "editor"
                          ? "rgba(59, 130, 246, 0.14)"
                          : "rgba(100, 116, 139, 0.14)",
                    color:
                      member.role === "owner"
                        ? "#8a640e"
                        : member.role === "editor"
                          ? "#1d4ed8"
                          : "#475569"
                  }}
                >
                  {member.role}
                </span>
              </div>

              <div className="button-row" style={{ alignItems: "center" }}>
                <div className="muted" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  {member.role === "owner" ? <Shield size={14} /> : <Mail size={14} />}
                  {member.acceptedAt ? "Can access now" : "Awaiting acceptance"}
                </div>

                <select
                  className="field-select"
                  value={member.role}
                  onChange={(event) =>
                    handleRoleChange(member._id, event.target.value as ProjectMemberRole)
                  }
                  disabled={activeMemberId === member._id}
                  style={{ width: "9rem" }}
                >
                  <option value="owner">Owner</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>

                <button
                  type="button"
                  className="button-ghost"
                  onClick={() => handleRemove(member._id)}
                  disabled={activeMemberId === member._id}
                  style={{ color: "#b42318" }}
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state compact-empty-state">
            <div className="section-title">No members yet</div>
            <div className="muted">Invite an owner, editor, or viewer to start sharing this project.</div>
          </div>
        )}
      </div>
    </section>
  );
}
