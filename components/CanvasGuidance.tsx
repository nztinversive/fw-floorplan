"use client"

import { useEditorStore } from "@/lib/editor-store"

export default function CanvasGuidance() {
  const floorPlanData = useEditorStore((state) => state.floorPlanData)

  const hasContent =
    floorPlanData.walls.length > 0 ||
    floorPlanData.rooms.length > 0 ||
    floorPlanData.doors.length > 0 ||
    floorPlanData.windows.length > 0

  if (hasContent) return null

  return (
    <div className="canvas-guidance">
      <div className="canvas-guidance-inner">
        <div className="canvas-guidance-title">Empty canvas</div>
        <div className="canvas-guidance-hint">
          Start drawing your floor plan by selecting a tool from the toolbar above, or press a shortcut key to get started.
        </div>
        <div className="canvas-guidance-keys">
          <span className="canvas-guidance-key">
            <kbd>W</kbd> Wall
          </span>
          <span className="canvas-guidance-key">
            <kbd>D</kbd> Door
          </span>
          <span className="canvas-guidance-key">
            <kbd>N</kbd> Window
          </span>
          <span className="canvas-guidance-key">
            <kbd>?</kbd> All shortcuts
          </span>
        </div>
      </div>
    </div>
  )
}
