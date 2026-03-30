"use client"

import { X } from "lucide-react"
import { useMemo } from "react"

import { useEditorStore } from "@/lib/editor-store"

type HistoryPanelProps = {
  open: boolean
  onClose: () => void
}

export default function HistoryPanel({ open, onClose }: HistoryPanelProps) {
  const historyLabels = useEditorStore((state) => state.historyLabels)
  const historyIndex = useEditorStore((state) => state.historyIndex)
  const jumpToHistory = useEditorStore((state) => state.jumpToHistory)

  const entries = useMemo(
    () =>
      historyLabels
        .map((label, index) => ({
          index,
          label: label || `Step ${index + 1}`
        }))
        .reverse(),
    [historyLabels]
  )

  return (
    <aside
      className={`history-panel${open ? " is-open" : ""}`}
      aria-hidden={!open}
    >
      <div className="history-panel-header">
        <div>
          <div className="section-title">History</div>
          <div className="muted">{historyLabels.length} saved states</div>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close history panel"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      <div className="history-panel-list">
        {entries.map((entry) => {
          const isCurrent = entry.index === historyIndex

          return (
            <button
              key={entry.index}
              type="button"
              className={`history-entry${isCurrent ? " is-current" : ""}`}
              onClick={() => jumpToHistory(entry.index)}
            >
              <span className="history-entry-index">#{entry.index + 1}</span>
              <span className="history-entry-label">{entry.label}</span>
              {isCurrent ? <span className="history-entry-badge">Current</span> : null}
            </button>
          )
        })}
      </div>
    </aside>
  )
}
