"use client"

import type Konva from "konva"
import type { ComponentType, RefObject } from "react"
import { useEffect } from "react"
import {
  Download,
  DoorOpen,
  Eraser,
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
  const selectedId = useEditorStore((state) => state.selectedId)
  const setTool = useEditorStore((state) => state.setTool)
  const setZoom = useEditorStore((state) => state.setZoom)
  const deleteElement = useEditorStore((state) => state.deleteElement)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)

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
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [deleteElement, redo, selectedId, setTool, undo])

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
          <button type="button" className="button-secondary" onClick={handleExport}>
            <Download size={18} />
            Export PNG
          </button>
        </div>
      </div>
    </div>
  )
}
