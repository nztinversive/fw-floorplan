"use client"

import { X } from "lucide-react"
import { useEffect } from "react"

type ShortcutsPanelProps = {
  open: boolean
  onClose: () => void
}

const SHORTCUT_GROUPS = [
  {
    title: "Tools",
    shortcuts: [
      { keys: ["Esc"], label: "Select tool" },
      { keys: ["W"], label: "Wall tool" },
      { keys: ["M"], label: "Measure tool" },
      { keys: ["A"], label: "Annotation tool" },
      { keys: ["C"], label: "Scale calibration tool" },
      { keys: ["R"], label: "Room tool" },
      { keys: ["D"], label: "Door tool" },
      { keys: ["N"], label: "Window tool" },
      { keys: ["T"], label: "Furniture tool" },
    ],
  },
  {
    title: "Editing",
    shortcuts: [
      { keys: ["Shift", "Click"], label: "Add or remove from selection" },
      { keys: ["Del"], label: "Delete selected items" },
      { keys: ["Ctrl", "D"], label: "Duplicate selection" },
      { keys: ["Ctrl", "Z"], label: "Undo" },
      { keys: ["Ctrl", "Shift", "Z"], label: "Redo" },
    ],
  },
  {
    title: "Canvas",
    shortcuts: [
      { keys: ["Scroll"], label: "Zoom in / out" },
      { keys: ["Space", "Drag"], label: "Pan canvas" },
      { keys: ["F"], label: "Zoom to fit" },
      { keys: ["?"], label: "Toggle this panel" },
    ],
  },
]

export default function ShortcutsPanel({ open, onClose }: ShortcutsPanelProps) {
  useEffect(() => {
    if (!open) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="shortcuts-backdrop" onClick={onClose}>
      <div className="shortcuts-panel" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <div className="shortcuts-title">Keyboard shortcuts</div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="shortcuts-body">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="shortcuts-section">
              <div className="shortcuts-section-title">{group.title}</div>
              <div className="shortcuts-list">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.label} className="shortcut-row">
                    <div className="shortcut-keys">
                      {shortcut.keys.map((key, i) => (
                        <span key={key}>
                          {i > 0 && <span className="shortcut-plus">+</span>}
                          <kbd className="shortcut-key">{key}</kbd>
                        </span>
                      ))}
                    </div>
                    <span className="shortcut-label">{shortcut.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
