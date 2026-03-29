"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, X } from "lucide-react"

import {
  FURNITURE_BY_ID,
  FURNITURE_CATEGORIES,
  FURNITURE_LIBRARY
} from "@/lib/furniture-library"
import { useEditorStore } from "@/lib/editor-store"

type FurnitureLibraryProps = {
  isOpen: boolean
  onClose: () => void
}

export default function FurnitureLibrary({ isOpen, onClose }: FurnitureLibraryProps) {
  const pendingFurniture = useEditorStore((state) => state.pendingFurniture)
  const setPendingFurniture = useEditorStore((state) => state.setPendingFurniture)
  const setTool = useEditorStore((state) => state.setTool)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    "Living Room": true,
    Bedroom: true,
    Bathroom: false,
    Kitchen: true,
    Dining: false,
    Office: false
  })

  const groupedFurniture = useMemo(
    () =>
      Object.fromEntries(
        FURNITURE_CATEGORIES.map((category) => [
          category,
          FURNITURE_LIBRARY.filter((item) => item.category === category)
        ])
      ),
    []
  )

  if (!isOpen) {
    return null
  }

  function handlePickFurniture(itemId: string) {
    const item = FURNITURE_BY_ID[itemId]
    if (!item) {
      return
    }

    setTool("select")
    setPendingFurniture({
      type: item.id,
      width: item.width,
      depth: item.depth,
      rotation: 0
    })
  }

  return (
    <aside className="sidebar-card furniture-library">
      <div className="panel-header">
        <div>
          <div className="section-title">Furniture Library</div>
          <div className="muted">
            {pendingFurniture
              ? `Placing ${FURNITURE_BY_ID[pendingFurniture.type]?.label ?? pendingFurniture.type}`
              : "Pick an item, then click the canvas to place it."}
          </div>
        </div>
        <button type="button" className="icon-button" aria-label="Close furniture library" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {pendingFurniture ? (
        <div className="library-mode-note">
          <strong>Furniture mode</strong>
          <span>Click the canvas to keep placing this item. Press ESC or close the panel to exit.</span>
        </div>
      ) : null}

      <div className="furniture-sections">
        {FURNITURE_CATEGORIES.map((category) => {
          const items = groupedFurniture[category]
          const isExpanded = expandedCategories[category] ?? false

          return (
            <section key={category} className="furniture-section">
              <button
                type="button"
                className="furniture-section-toggle"
                onClick={() =>
                  setExpandedCategories((current) => ({
                    ...current,
                    [category]: !isExpanded
                  }))
                }
              >
                <span>{category}</span>
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>

              {isExpanded ? (
                <div className="furniture-list">
                  {items.map((item) => {
                    const isActive = pendingFurniture?.type === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`furniture-item${isActive ? " is-active" : ""}`}
                        onClick={() => handlePickFurniture(item.id)}
                      >
                        <span className="furniture-item-preview" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="furniture-item-meta">
                          <strong>{item.label}</strong>
                          <span>{item.width}&quot; x {item.depth}&quot;</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
    </aside>
  )
}
