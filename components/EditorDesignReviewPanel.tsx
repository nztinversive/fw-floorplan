"use client"

import { AlertTriangle, CheckCircle2, Crosshair, Info } from "lucide-react"
import { useMemo } from "react"

import {
  getDesignReview,
  type DesignReviewItem,
  type DesignReviewSeverity
} from "@/lib/floor-plan-analysis"
import { pointOnWall, polygonCentroid } from "@/lib/geometry"
import { useEditorStore } from "@/lib/editor-store"
import type { FloorPlanData, Point } from "@/lib/types"

type TargetKind = NonNullable<DesignReviewItem["targetKind"]>

type FocusTarget = {
  id?: string
  kind?: TargetKind
  point?: Point
}

const SCORE_LABELS = [
  { threshold: 82, label: "Strong" },
  { threshold: 64, label: "Needs tuning" },
  { threshold: 0, label: "Needs review" }
]

function getItemIcon(severity: DesignReviewSeverity) {
  if (severity === "warning") return AlertTriangle
  if (severity === "good") return CheckCircle2
  return Info
}

function getScoreLabel(score: number) {
  return SCORE_LABELS.find((entry) => score >= entry.threshold)?.label ?? "Needs review"
}

function getTargetPoint(data: FloorPlanData, item: DesignReviewItem): FocusTarget {
  if (!item.targetId || !item.targetKind || item.targetKind === "general") {
    return { kind: item.targetKind }
  }

  if (item.targetKind === "room") {
    const room = data.rooms.find((entry) => entry.id === item.targetId)
    return room ? { id: room.id, kind: "room", point: polygonCentroid(room.polygon) } : {}
  }

  if (item.targetKind === "door") {
    const door = data.doors.find((entry) => entry.id === item.targetId)
    const wall = door ? data.walls.find((entry) => entry.id === door.wallId) : null
    return door && wall ? { id: door.id, kind: "door", point: pointOnWall(wall, door.position) } : {}
  }

  if (item.targetKind === "furniture") {
    const furniture = data.furniture.find((entry) => entry.id === item.targetId)
    return furniture ? { id: furniture.id, kind: "furniture", point: { x: furniture.x, y: furniture.y } } : {}
  }

  return {}
}

export default function EditorDesignReviewPanel() {
  const floorPlanData = useEditorStore((state) => state.floorPlanData)
  const setSelectedIds = useEditorStore((state) => state.setSelectedIds)
  const setTool = useEditorStore((state) => state.setTool)
  const setZoom = useEditorStore((state) => state.setZoom)
  const setPan = useEditorStore((state) => state.setPan)

  const review = useMemo(() => getDesignReview(floorPlanData), [floorPlanData])
  const priorityItems = useMemo(
    () => review.warnings.filter((item) => item.severity === "warning").slice(0, 5),
    [review.warnings]
  )
  const scoreLabel = getScoreLabel(review.score)

  function focusItem(item: DesignReviewItem) {
    const target = getTargetPoint(floorPlanData, item)

    if (target.id) {
      setTool("select")
      setSelectedIds([target.id])
    }

    if (target.point) {
      const nextZoom = 1.35
      setZoom(nextZoom)
      setPan({
        x: 320 - target.point.x * nextZoom,
        y: 320 - target.point.y * nextZoom
      })
    }
  }

  return (
    <section className="sidebar-card editor-design-review">
      <div className="panel-header">
        <div>
          <div className="section-title">Design review</div>
          <div className="muted">Live floor-plan intelligence.</div>
        </div>
        <span className={`badge design-review-badge ${review.warnings.length > 0 ? "is-warning" : "is-good"}`}>
          {scoreLabel}
        </span>
      </div>

      <div className="editor-design-score">
        <div>
          <span className="editor-design-score-value">{review.score}</span>
          <span className="muted">/100</span>
        </div>
        <div className="muted">{review.summary}</div>
      </div>

      {priorityItems.length > 0 ? (
        <div className="editor-design-issue-list">
          {priorityItems.map((item) => {
            const Icon = getItemIcon(item.severity)
            const target = getTargetPoint(floorPlanData, item)
            const canFocus = Boolean(target.id && target.point)

            return (
              <button
                key={item.id}
                type="button"
                className={`editor-design-issue is-${item.severity}`}
                onClick={() => focusItem(item)}
                disabled={!canFocus}
              >
                <span className={`compliance-icon-shell is-${item.severity}`}>
                  <Icon size={15} />
                </span>
                <span className="editor-design-issue-copy">
                  <strong>{item.subject}</strong>
                  <span>{item.message}</span>
                </span>
                {canFocus ? <Crosshair size={14} /> : null}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="editor-design-empty">
          <CheckCircle2 size={18} />
          <span>No priority warnings on this floor.</span>
        </div>
      )}

      <div className="editor-design-footnote">
        Furniture buffers are shown on the canvas; warnings tint affected rooms and objects.
      </div>
    </section>
  )
}
