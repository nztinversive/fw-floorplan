"use client"

import { useMemo } from "react"

import { formatFeetInches, getWallAngle, getWallLength } from "@/lib/geometry"
import { useEditorStore } from "@/lib/editor-store"

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

    return null
  }, [floorPlanData.doors, floorPlanData.rooms, floorPlanData.walls, floorPlanData.windows, selectedId])

  const selectionLabel =
    selectedIds.length > 1
      ? `${selectedIds.length} items selected`
      : selection
        ? selection.type
        : "No selection"

  function updateWallLength(nextLength: number) {
    if (!selection || selection.type !== "wall") {
      return
    }

    const wall = selection.item
    const angle = (getWallAngle(wall) * Math.PI) / 180
    updateElement(wall.id, {
      x2: wall.x1 + Math.cos(angle) * nextLength,
      y2: wall.y1 + Math.sin(angle) * nextLength
    })
  }

  function updateWallAngle(nextAngle: number) {
    if (!selection || selection.type !== "wall") {
      return
    }

    const wall = selection.item
    const length = getWallLength(wall)
    const radians = (nextAngle * Math.PI) / 180
    updateElement(wall.id, {
      x2: wall.x1 + Math.cos(radians) * length,
      y2: wall.y1 + Math.sin(radians) * length
    })
  }

  return (
    <aside className="editor-sidebar">
      <div className="sidebar-card">
        <div className="panel-header">
          <div className="section-title">Properties</div>
          <div className="muted">{selectionLabel}</div>
        </div>

        {selectedIds.length > 0 ? (
          <div style={{ marginBottom: "1rem" }}>
            <button
              type="button"
              className="button-secondary"
              onClick={() => deleteElement(selectedIds)}
            >
              Delete selected
            </button>
          </div>
        ) : null}

        {selectedIds.length > 1 ? (
          <div className="empty-state" style={{ padding: "1.5rem" }}>
            <div className="muted">
              Multi-selection supports bulk delete. Select a single wall, room, door, or window to edit details.
            </div>
          </div>
        ) : null}

        {!selection && selectedIds.length === 0 ? (
          <div className="empty-state" style={{ padding: "1.5rem" }}>
            <div className="muted">
              Select a wall, room, door, or window to inspect and edit its details.
            </div>
          </div>
        ) : null}

        {selection?.type === "wall" ? (
          <div className="property-list">
            <div className="property-card">
              <div className="property-title">
                <strong>Wall</strong>
                <span className="badge">#{selection.item.id.slice(-4)}</span>
              </div>
              <div className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.5rem" }}>
                {formatFeetInches(getWallLength(selection.item), floorPlanData.scale)}
              </div>
              <NumericField
                label="Length (ft)"
                value={Number(pxToFeet(getWallLength(selection.item), floorPlanData.scale).toFixed(2))}
                onChange={(ft) => updateWallLength(feetToPx(ft, floorPlanData.scale))}
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
                onChange={updateWallAngle}
                step={0.5}
              />
              <dl className="key-value">
                <dt>Start</dt>
                <dd>{pxToFeet(selection.item.x1, floorPlanData.scale)} ft, {pxToFeet(selection.item.y1, floorPlanData.scale)} ft</dd>
                <dt>End</dt>
                <dd>{pxToFeet(selection.item.x2, floorPlanData.scale)} ft, {pxToFeet(selection.item.y2, floorPlanData.scale)} ft</dd>
              </dl>
            </div>
          </div>
        ) : null}

        {selection?.type === "room" ? (
          <div className="property-list">
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
              <dl className="key-value">
                <dt>Area</dt>
                <dd>{selection.item.areaSqFt} sq ft</dd>
              </dl>
            </div>
          </div>
        ) : null}

        {selection?.type === "door" ? (
          <div className="property-list">
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
          <div className="property-list">
            <div className="property-card">
              <div className="property-title">
                <strong>Window</strong>
                <span className="badge">{selection.item.width} in wide</span>
              </div>
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
        ) : null}
      </div>
    </aside>
  )
}
