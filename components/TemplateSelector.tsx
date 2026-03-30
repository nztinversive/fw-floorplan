"use client"

import { LayoutGrid } from "lucide-react"

import { FLOOR_PLAN_TEMPLATES } from "@/lib/floor-plan-templates"

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
      <div className="template-grid">
        {FLOOR_PLAN_TEMPLATES.map((template) => {
          const isActive = selected === template.id
          return (
            <button
              key={template.id}
              type="button"
              className={`template-card${isActive ? " is-selected" : ""}`}
              onClick={() => onSelect(isActive ? null : template.id)}
            >
              <div className="template-card-icon">
                <LayoutGrid size={20} />
              </div>
              <div className="template-card-content">
                <div className="template-card-name">{template.name}</div>
                <div className="template-card-desc">{template.description}</div>
              </div>
              {isActive && <div className="template-card-check">✓</div>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
