"use client"

import { useMemo } from "react"
import { Box, DoorOpen, Grid3x3, Move, RulerDimensionLine, Sofa, Trash2 } from "lucide-react"

import { formatFeetInches, getWallAngle, getWallLength, pointDistance } from "@/lib/geometry"
import { useEditorStore } from "@/lib/editor-store"
import type { Wall } from "@/lib/types"

function NumericField({
  label,
  value,
  onChange,
  step = 1
}: {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function pxToFeet(px: number, scale: number): number {
  return Number((px / (scale || 1)).toFixed(2))
}

function feetToPx(feet: number, scale: number): number {
  return feet * (scale || 1)
}

const TYPE_META: Record<string, { icon: typeof Box; color: string; label: string }> = {
  wall: { icon: Move, color: "blue", label: "Wall" },
  room: { icon: Grid3x3, color: "green", label: "Room" },
  door: { icon: DoorOpen, color: "amber", label: "Door" },
  window: { icon: Box, color: "purple", label: "Window" },
  furniture: { icon: Sofa, color: "amber", label: "Furniture" },
  annotation: { icon: RulerDimensionLine, color: "blue", label: "Annotation" },
}

export default function PropertiesPanel() {
  const floorPlanData = useEditorStore((state) => state.floorPlanData)
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const updateElement = useEditorStore((state) => state.updateElement)
  const deleteElement = useEditorStore((state) => state.deleteElement)
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null

  const selection = useMemo(() => {
    if (!selectedId) {
      return null
    }

    const wall = floorPlanData.walls.find((entry) => entry.id === selectedId)
    if (wall) {
      return { type: "wall" as const, item: wall }
    }

    const room = floorPlanData.rooms.find((entry) => entry.id === selectedId)
    if (room) {
      return { type: "room" as const, item: room }
    }

    const door = floorPlanData.doors.find((entry) => entry.id === selectedId)
    if (door) {
      return { type: "door" as const, item: door }
    }

    const window = floorPlanData.windows.find((entry) => entry.id === selectedId)
    if (window) {
      return { type: "window" as const, item: window }
    }

    const furniture = floorPlanData.furniture.find((entry) => entry.id === selectedId)
    if (furniture) {
      return { type: "furniture" as const, item: furniture }
    }

    const annotation = floorPlanData.annotations.find((entry) => entry.id === selectedId)
    if (annotation) {
      return { type: "annotation" as const, item: annotation }
    }

    return null
  }, [
    floorPlanData.annotations,
    floorPlanData.doors,
    floorPlanData.furniture,
    floorPlanData.rooms,
    floorPlanData.walls,
    floorPlanData.windows,
    selectedId
  ])

  const meta = selection ? TYPE_META[selection.type] : null

  return (
    <div className="sidebar-card">
        <div className="panel-header">
          <div className="section-title">Properties</div>
          {selection && meta ? (
            <div className={`prop-type-badge prop-type-${meta.color}`}>
              <meta.icon size={12} />
              {meta.label}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: "0.82rem" }}>
              {selectedIds.length > 1 ? `${selectedIds.length} items` : "No selection"}
            </div>
          )}
        </div>

        {selectedIds.length > 0 ? (
          <div style={{ marginBottom: "1rem" }}>
            <button
              type="button"
              className="button-ghost prop-delete-btn"
              onClick={() => deleteElement(selectedIds)}
            >
              <Trash2 size={14} />
              Delete selected
            </button>
          </div>
        ) : null}

        {selectedIds.length > 1 ? (
          <div className="prop-empty" style={{ animation: "fadeIn 200ms ease" }}>
            <div className="muted">
              Multi-selection supports bulk delete. Select a single element to edit details.
            </div>
          </div>
        ) : null}

        {!selection && selectedIds.length === 0 ? (
          <div className="prop-empty" style={{ animation: "fadeIn 200ms ease" }}>
            <Move size={24} style={{ opacity: 0.3 }} />
            <div className="muted">
              Select a wall, room, door, window, furniture item, or annotation to inspect and edit its properties.
            </div>
          </div>
        ) : null}

        {selection?.type === "wall" ? (
          <div className="property-list prop-enter">
            <div className="property-card">
              <div className="property-title">
                <strong>Wall</strong>
                <span className="badge">#{selection.item.id.slice(-4)}</span>
              </div>
              <div className="prop-measurement">
                {formatFeetInches(getWallLength(selection.item), floorPlanData.scale)}
              </div>
              <div className="form-grid">
                <NumericField
                  label="Length (ft)"
                  value={Number(pxToFeet(getWallLength(selection.item), floorPlanData.scale).toFixed(2))}
                  onChange={(ft) => updateWallLength(selection.item, ft, floorPlanData.scale)}
                  step={0.5}
                />
                <NumericField
                  label="Thickness"
                  value={selection.item.thickness}
                  onChange={(value) => updateElement(selection.item.id, { thickness: value })}
                />
                <NumericField
                  label="Angle (°)"
                  value={Number(getWallAngle(selection.item).toFixed(1))}
                  onChange={(nextAngle) => updateWallAngleHelper(selection.item, nextAngle)}
                  step={0.5}
                />
              </div>
              <div className="prop-coords">
                <span>Start: {pxToFeet(selection.item.x1, floorPlanData.scale)}′, {pxToFeet(selection.item.y1, floorPlanData.scale)}′</span>
                <span>End: {pxToFeet(selection.item.x2, floorPlanData.scale)}′, {pxToFeet(selection.item.y2, floorPlanData.scale)}′</span>
              </div>
            </div>
          </div>
        ) : null}

        {selection?.type === "room" ? (
          <div className="property-list prop-enter">
            <div className="property-card">
              <div className="property-title">
                <strong>Room</strong>
                <span className="badge">{selection.item.areaSqFt} sq ft</span>
              </div>
              <label className="field">
                <span className="field-label">Label</span>
                <input
                  className="field-input"
                  value={selection.item.label}
                  onChange={(event) => updateElement(selection.item.id, { label: event.target.value })}
                />
              </label>
              <div className="prop-measurement">{selection.item.areaSqFt} sq ft</div>
            </div>
          </div>
        ) : null}

        {selection?.type === "door" ? (
          <div className="property-list prop-enter">
            <div className="property-card">
              <div className="property-title">
                <strong>Door</strong>
                <span className="badge">{selection.item.type}</span>
              </div>
              <label className="field">
                <span className="field-label">Type</span>
                <select
                  className="field-select"
                  value={selection.item.type}
                  onChange={(event) => updateElement(selection.item.id, { type: event.target.value })}
                >
                  <option value="standard">Standard</option>
                  <option value="sliding">Sliding</option>
                  <option value="double">Double</option>
                  <option value="garage">Garage</option>
                </select>
              </label>
              <NumericField
                label="Width"
                value={selection.item.width}
                onChange={(value) => updateElement(selection.item.id, { width: value })}
              />
            </div>
          </div>
        ) : null}

        {selection?.type === "window" ? (
          <div className="property-list prop-enter">
            <div className="property-card">
              <div className="property-title">
                <strong>Window</strong>
                <span className="badge">{selection.item.width} in wide</span>
              </div>
              <div className="form-grid">
                <NumericField
                  label="Width"
                  value={selection.item.width}
                  onChange={(value) => updateElement(selection.item.id, { width: value })}
                />
                <NumericField
                  label="Height"
                  value={selection.item.height}
                  onChange={(value) => updateElement(selection.item.id, { height: value })}
                />
              </div>
            </div>
          </div>
        ) : null}

        {selection?.type === "furniture" ? (
          <div className="property-list prop-enter">
            <div className="property-card">
              <div className="property-title">
                <strong>Furniture</strong>
                <span className="badge">{selection.item.type}</span>
              </div>
              <div className="form-grid">
                <NumericField
                  label="Width"
                  value={selection.item.width}
                  onChange={(value) => updateElement(selection.item.id, { width: value })}
                />
                <NumericField
                  label="Depth"
                  value={selection.item.depth}
                  onChange={(value) => updateElement(selection.item.id, { depth: value })}
                />
                <NumericField
                  label="Rotation"
                  value={selection.item.rotation}
                  onChange={(value) => updateElement(selection.item.id, { rotation: value })}
                />
              </div>
            </div>
          </div>
        ) : null}

        {selection?.type === "annotation" ? (
          <div className="property-list prop-enter">
            <div className="property-card">
              <div className="property-title">
                <strong>Annotation</strong>
                <span className="badge">
                  {formatFeetInches(
                    pointDistance(selection.item.from, selection.item.to),
                    floorPlanData.scale
                  )}
                </span>
              </div>
              <label className="field">
                <span className="field-label">Label</span>
                <input
                  className="field-input"
                  value={selection.item.label}
                  onChange={(event) => updateElement(selection.item.id, { label: event.target.value })}
                />
              </label>
              <div className="prop-coords">
                <span>
                  Start: {pxToFeet(selection.item.from.x, floorPlanData.scale)}′, {pxToFeet(selection.item.from.y, floorPlanData.scale)}′
                </span>
                <span>
                  End: {pxToFeet(selection.item.to.x, floorPlanData.scale)}′, {pxToFeet(selection.item.to.y, floorPlanData.scale)}′
                </span>
              </div>
            </div>
          </div>
        ) : null}
    </div>
  )

  function updateWallLength(wall: Wall, ft: number, scale: number) {
    const nextLength = feetToPx(ft, scale)
    const angle = (getWallAngle(wall) * Math.PI) / 180
    updateElement(wall.id, {
      x2: wall.x1 + Math.cos(angle) * nextLength,
      y2: wall.y1 + Math.sin(angle) * nextLength
    })
  }

  function updateWallAngleHelper(wall: Wall, nextAngle: number) {
    const length = getWallLength(wall)
    const radians = (nextAngle * Math.PI) / 180
    updateElement(wall.id, {
      x2: wall.x1 + Math.cos(radians) * length,
      y2: wall.y1 + Math.sin(radians) * length
    })
  }
}
