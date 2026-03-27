"use client"

import type Konva from "konva"
import type { ComponentType, RefObject } from "react"
import { useCallback, useEffect, useState } from "react"
import {
  Download,
  DoorOpen,
  Eraser,
  Maximize,
  Minus,
  MousePointer2,
  PanelTop,
  Plus,
  Redo2,
  SquareStack,
  Undo2
} from "lucide-react"

import { clamp } from "@/lib/geometry"
import { useEditorStore, type EditorTool } from "@/lib/editor-store"
import ShortcutsPanel from "@/components/ShortcutsPanel"

type ToolbarProps = {
  stageRef: RefObject<Konva.Stage | null>
}

const TOOLS: Array<{
  id: EditorTool
  label: string
  shortcut: string
  icon: ComponentType<{ size?: number }>
}> = [
  { id: "select", label: "Select", shortcut: "Esc", icon: MousePointer2 },
  { id: "wall", label: "Wall", shortcut: "W", icon: SquareStack },
  { id: "door", label: "Door", shortcut: "D", icon: DoorOpen },
  { id: "window", label: "Window", shortcut: "N", icon: PanelTop }
]

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

export default function Toolbar({ stageRef }: ToolbarProps) {
  const tool = useEditorStore((state) => state.tool)
  const zoom = useEditorStore((state) => state.zoom)
  const pan = useEditorStore((state) => state.pan)
  const floorPlanData = useEditorStore((state) => state.floorPlanData)
  const selectedId = useEditorStore((state) => state.selectedId)
  const setTool = useEditorStore((state) => state.setTool)
  const setZoom = useEditorStore((state) => state.setZoom)
  const setPan = useEditorStore((state) => state.setPan)
  const deleteElement = useEditorStore((state) => state.deleteElement)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const handleZoomToFit = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return

    const { walls, rooms } = floorPlanData
    const points: Array<{ x: number; y: number }> = []

    for (const w of walls) {
      points.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 })
    }
    for (const r of rooms) {
      for (const p of r.polygon) {
        points.push({ x: p.x, y: p.y })
      }
    }

    if (points.length === 0) return

    const minX = Math.min(...points.map((p) => p.x))
    const maxX = Math.max(...points.map((p) => p.x))
    const minY = Math.min(...points.map((p) => p.y))
    const maxY = Math.max(...points.map((p) => p.y))

    const contentWidth = maxX - minX || 100
    const contentHeight = maxY - minY || 100
    const stageWidth = stage.width()
    const stageHeight = stage.height()
    const padding = 60

    const scaleX = (stageWidth - padding * 2) / contentWidth
    const scaleY = (stageHeight - padding * 2) / contentHeight
    const nextZoom = clamp(Math.min(scaleX, scaleY), 0.4, 3)

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    setZoom(Number(nextZoom.toFixed(2)))
    setPan({
      x: stageWidth / 2 - centerX * nextZoom,
      y: stageHeight / 2 - centerY * nextZoom,
    })
  }, [floorPlanData, setPan, setZoom, stageRef])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return
      }

      const key = event.key.toLowerCase()
      const hasCommandModifier = event.ctrlKey || event.metaKey

      if (key === "escape") {
        event.preventDefault()
        setTool("select")
        return
      }

      if (event.key === "?" || (event.shiftKey && key === "/")) {
        event.preventDefault()
        setShortcutsOpen((prev) => !prev)
        return
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault()
        deleteElement(selectedId)
        return
      }

      if (hasCommandModifier && key === "z") {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }

      // Tool shortcuts
      if (!hasCommandModifier && !event.shiftKey) {
        if (key === "w") {
          event.preventDefault()
          setTool("wall")
        } else if (key === "d") {
          event.preventDefault()
          setTool("door")
        } else if (key === "n") {
          event.preventDefault()
          setTool("window")
        } else if (key === "f") {
          event.preventDefault()
          handleZoomToFit()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [deleteElement, handleZoomToFit, redo, selectedId, setTool, undo])

  function handleExport() {
    const stage = stageRef.current
    if (!stage) {
      return
    }

    const dataUrl = stage.toDataURL({ pixelRatio: 2 })
    const link = document.createElement("a")
    link.href = dataUrl
    link.download = "floor-plan.png"
    link.click()
  }

  return (
    <div className="toolbar-shell">
      <div className="toolbar-row">
        <div className="toolbar-group">
          {TOOLS.map(({ id, label, shortcut, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`toolbar-btn-labeled${tool === id ? " is-active" : ""}`}
              title={`${label} (${shortcut})`}
              aria-label={label}
              onClick={() => setTool(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
              <span className="toolbar-shortcut">{shortcut}</span>
            </button>
          ))}
          <button
            type="button"
            className="toolbar-btn-labeled"
            title="Delete selected (Del)"
            aria-label="Delete selected element"
            onClick={() => {
              if (selectedId) {
                deleteElement(selectedId)
              }
            }}
          >
            <Eraser size={16} />
            <span>Delete</span>
            <span className="toolbar-shortcut">Del</span>
          </button>
        </div>

        <div className="toolbar-group">
          <button type="button" className="icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" onClick={undo}>
            <Undo2 size={16} />
          </button>
          <button type="button" className="icon-button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onClick={redo}>
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => setZoom(clamp(Number((zoom - 0.1).toFixed(2)), 0.4, 3))}
          >
            <Minus size={16} />
          </button>
          <div className="header-pill">{Math.round(zoom * 100)}%</div>
          <button
            type="button"
            className="icon-button"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => setZoom(clamp(Number((zoom + 0.1).toFixed(2)), 0.4, 3))}
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className="icon-button"
            title="Zoom to fit (F)"
            aria-label="Zoom to fit"
            onClick={handleZoomToFit}
          >
            <Maximize size={16} />
          </button>
          <button type="button" className="button-secondary" onClick={handleExport}>
            <Download size={18} />
            Export PNG
          </button>
          <button
            type="button"
            className="toolbar-help-btn"
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
            onClick={() => setShortcutsOpen(true)}
          >
            ?
          </button>
        </div>
      </div>
      <ShortcutsPanel open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}
