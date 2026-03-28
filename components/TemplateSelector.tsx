"use client"

import { FLOOR_PLAN_TEMPLATES, type FloorPlanTemplate } from "@/lib/floor-plan-templates"

type TemplateSelectorProps = {
  selected: string | null
  onSelect: (templateId: string | null) => void
}

export default function TemplateSelector({ selected, onSelect }: TemplateSelectorProps) {
  return (
    <div className="field" style={{ gap: "0.75rem" }}>
      <span className="field-label">Or start from a template</span>
      <div className="muted" style={{ fontSize: "0.85rem" }}>
        Choose a starter layout. If you also upload an image, the upload takes priority.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", marginTop: "0.5rem" }}>
        {FLOOR_PLAN_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            className={`panel${selected === template.id ? " is-active" : ""}`}
            style={{
              cursor: "pointer",
              textAlign: "left",
              padding: "1rem",
              border: selected === template.id ? "2px solid var(--fw-amber, #d4a84b)" : undefined,
              background: selected === template.id ? "rgba(212, 168, 75, 0.08)" : undefined
            }}
            onClick={() => onSelect(selected === template.id ? null : template.id)}
          >
            <div className="section-title" style={{ fontSize: "0.95rem" }}>{template.name}</div>
            <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>{template.description}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
