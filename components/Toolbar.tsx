"use client"

import type Konva from "konva"
import type { ChangeEvent, ComponentType, RefObject } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Armchair,
  Download,
  DoorOpen,
  Eraser,
  Image as ImageIcon,
  Maximize,
  MessageSquare,
  Minus,
  MousePointer2,
  PanelTop,
  PencilRuler,
  Plus,
  Ruler,
  Redo2,
  Scaling,
  SquareDashedBottom,
  SquareStack,
  Undo2
} from "lucide-react"

import ShortcutsPanel from "@/components/ShortcutsPanel"
import { generateDxf } from "@/lib/dxf-export"
import { clamp } from "@/lib/geometry"
import { downloadSvg, generateSvg } from "@/lib/svg-export"
import { useEditorStore, type EditorTool } from "@/lib/editor-store"

type ToolbarProps = {
  projectName: string
  exportFileName?: string
  stageRef: RefObject<Konva.Stage | null>
  sourceImageUrl?: string | null
  overlayVisible: boolean
  overlayOpacity: number
  onToggleOverlay: () => void
  onOverlayOpacityChange: (opacity: number) => void
  onSourceImageSelected: (file: File) => void
  isUploadingSourceImage?: boolean
}

const TOOLS: Array<{
  id: EditorTool
  label: string
  shortcut: string
  icon: ComponentType<{ size?: number }>
}> = [
  { id: "select", label: "Select", shortcut: "Esc", icon: MousePointer2 },
  { id: "wall", label: "Wall", shortcut: "W", icon: SquareStack },
  { id: "measure", label: "Measure", shortcut: "M", icon: Ruler },
  { id: "annotate", label: "Annotate", shortcut: "A", icon: PencilRuler },
  { id: "comment", label: "Comment", shortcut: "K", icon: MessageSquare },
  { id: "calibrate", label: "Calibrate", shortcut: "C", icon: Scaling },
  { id: "room", label: "Room", shortcut: "R", icon: SquareDashedBottom },
  { id: "door", label: "Door", shortcut: "D", icon: DoorOpen },
  { id: "window", label: "Window", shortcut: "N", icon: PanelTop },
  { id: "furniture", label: "Furniture", shortcut: "T", icon: Armchair }
]

function sanitizeFileStem(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "floor-plan"
  )
}

function downloadTextFile(contents: string, fileName: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = fileName
  link.click()
  URL.revokeObjectURL(objectUrl)
}

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

export default function Toolbar({
  projectName,
  exportFileName,
  stageRef,
  sourceImageUrl,
  overlayVisible,
  overlayOpacity,
  onToggleOverlay,
  onOverlayOpacityChange,
  onSourceImageSelected,
  isUploadingSourceImage = false
}: ToolbarProps) {
  const tool = useEditorStore((state) => state.tool)
  const zoom = useEditorStore((state) => state.zoom)
  const floorPlanData = useEditorStore((state) => state.floorPlanData)
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const setTool = useEditorStore((state) => state.setTool)
  const setZoom = useEditorStore((state) => state.setZoom)
  const setPan = useEditorStore((state) => state.setPan)
  const deleteElement = useEditorStore((state) => state.deleteElement)
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const sourceImageInputRef = useRef<HTMLInputElement>(null)
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

      if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.length > 0) {
        event.preventDefault()
        deleteElement(selectedIds)
        return
      }

      if (hasCommandModifier && key === "d") {
        event.preventDefault()
        duplicateSelected()
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
        } else if (key === "a") {
          event.preventDefault()
          setTool("annotate")
        } else if (key === "k") {
          event.preventDefault()
          setTool("comment")
        } else if (key === "c") {
          event.preventDefault()
          setTool("calibrate")
        } else if (key === "m") {
          event.preventDefault()
          setTool("measure")
        } else if (key === "r") {
          event.preventDefault()
          setTool("room")
        } else if (key === "d") {
          event.preventDefault()
          setTool("door")
        } else if (key === "n") {
          event.preventDefault()
          setTool("window")
        } else if (key === "t") {
          event.preventDefault()
          setTool("furniture")
        } else if (key === "f") {
          event.preventDefault()
          handleZoomToFit()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [deleteElement, duplicateSelected, handleZoomToFit, redo, selectedIds, setTool, undo])

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

  function handleDxfExport() {
    const dxf = generateDxf(floorPlanData, projectName)
    const fileStem = sanitizeFileStem(exportFileName ?? projectName)
    downloadTextFile(dxf, `${fileStem}.dxf`, "application/dxf;charset=utf-8")
  }

  function handleSvgExport() {
    const svg = generateSvg(floorPlanData, { showGrid: true })
    const fileStem = sanitizeFileStem(exportFileName ?? projectName)
    downloadSvg(svg, `${fileStem}.svg`)
  }

  function handleSourceImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    onSourceImageSelected(file)
    event.target.value = ""
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
              data-onboarding={`tool-${id}`}
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
            aria-label="Delete selected items"
            onClick={() => {
              if (selectedIds.length > 0) {
                deleteElement(selectedIds)
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
          <input
            ref={sourceImageInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleSourceImageChange}
          />
          <button
            type="button"
            className="toolbar-btn-labeled"
            data-onboarding="upload-image"
            title={sourceImageUrl ? "Replace source image" : "Upload source image"}
            aria-label={sourceImageUrl ? "Replace source image" : "Upload source image"}
            onClick={() => sourceImageInputRef.current?.click()}
            disabled={isUploadingSourceImage}
          >
            <ImageIcon size={16} />
            <span>
              {isUploadingSourceImage
                ? sourceImageUrl
                  ? "Replacing..."
                  : "Uploading..."
                : sourceImageUrl
                  ? "Replace image"
                  : "Upload image"}
            </span>
          </button>
          {sourceImageUrl ? (
            <>
              <button
                type="button"
                className={`toolbar-btn-labeled${overlayVisible ? " is-active" : ""}`}
                title={overlayVisible ? "Hide source image overlay" : "Show source image overlay"}
                aria-label={overlayVisible ? "Hide source image overlay" : "Show source image overlay"}
                onClick={onToggleOverlay}
              >
                <ImageIcon size={16} />
                <span>{overlayVisible ? "Hide overlay" : "Show overlay"}</span>
              </button>
              <label className="toolbar-slider-group">
                <span className="toolbar-slider-label">Opacity</span>
                <input
                  className="toolbar-slider"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(overlayOpacity * 100)}
                  aria-label="Source image overlay opacity"
                  onChange={(event) => onOverlayOpacityChange(Number(event.target.value) / 100)}
                />
                <span className="toolbar-slider-value">{Math.round(overlayOpacity * 100)}%</span>
              </label>
            </>
          ) : null}

          <button
            type="button"
            className="icon-button"
            title="Zoom to fit (F)"
            aria-label="Zoom to fit"
            onClick={handleZoomToFit}
          >
            <Maximize size={16} />
          </button>
          <button
            type="button"
            className="button-secondary"
            data-onboarding="export-png"
            onClick={handleExport}
          >
            <Download size={18} />
            Export PNG
          </button>
          <button
            type="button"
            className="button-secondary"
            data-onboarding="export-dxf"
            onClick={handleDxfExport}
          >
            <Download size={18} />
            Export DXF
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={handleSvgExport}
          >
            <Download size={18} />
            Export SVG
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
