"use client"

import { AlertTriangle, BedDouble, CheckCircle2, ChefHat, Crosshair, DoorOpen, Info, Sparkles } from "lucide-react"
import { useCallback, useMemo } from "react"

import {
  getDesignReview,
  type DesignReviewItem,
  type DesignReviewSeverity
} from "@/lib/floor-plan-analysis"
import { FURNITURE_BY_ID } from "@/lib/furniture-library"
import { createId, getWallLength, pointOnWall, polygonCentroid, roomTouchesWall } from "@/lib/geometry"
import { useEditorStore } from "@/lib/editor-store"
import {
  getFurnitureForRoom,
  getRoomCategory,
  getRoomLayoutPlans,
  type RoomLayoutPlan
} from "@/lib/room-layout-assistant"
import type { FloorPlanData, Point, Room } from "@/lib/types"

type TargetKind = NonNullable<DesignReviewItem["targetKind"]>

type FocusTarget = {
  id?: string
  kind?: TargetKind
  point?: Point
}

type FixAssistAction = {
  id: string
  label: string
  detail: string
  apply: () => void
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
  const setFloorPlanData = useEditorStore((state) => state.setFloorPlanData)
  const addDoor = useEditorStore((state) => state.addDoor)
  const addFurniture = useEditorStore((state) => state.addFurniture)

  const review = useMemo(() => getDesignReview(floorPlanData), [floorPlanData])
  const priorityItems = useMemo(
    () => review.warnings.filter((item) => item.severity === "warning").slice(0, 5),
    [review.warnings]
  )
  const scoreLabel = getScoreLabel(review.score)
  const layoutPlans = useMemo(() => getRoomLayoutPlans(floorPlanData).slice(0, 5), [floorPlanData])

  const focusRoom = useCallback((room: Room) => {
    const center = polygonCentroid(room.polygon)
    setTool("select")
    setSelectedIds([room.id])
    setZoom(1.35)
    setPan({
      x: 320 - center.x * 1.35,
      y: 320 - center.y * 1.35
    })
  }, [setPan, setSelectedIds, setTool, setZoom])

  const applyLayoutPlan = useCallback((plan: RoomLayoutPlan) => {
    if (plan.items.length === 0) {
      focusRoom(plan.room)
      return
    }

    const nextFurniture = plan.items.map(({ label: _label, ...item }) => ({
      id: createId("furniture"),
      ...item
    }))

    setFloorPlanData(
      {
        ...floorPlanData,
        furniture: [...floorPlanData.furniture, ...nextFurniture]
      },
      false,
      `${plan.room.label} layout applied`
    )
    focusRoom(plan.room)
  }, [floorPlanData, focusRoom, setFloorPlanData])

  const fixActions = useMemo<FixAssistAction[]>(() => {
    const actions: FixAssistAction[] = []
    const roomById = new Map(floorPlanData.rooms.map((room) => [room.id, room]))

    const placeFurniture = (room: Room, type: string, offset: Point = { x: 0, y: 0 }, rotation = 0) => {
      const catalogItem = FURNITURE_BY_ID[type]
      if (!catalogItem) return

      const center = polygonCentroid(room.polygon)
      addFurniture({
        type,
        x: center.x + offset.x * floorPlanData.scale,
        y: center.y + offset.y * floorPlanData.scale,
        width: catalogItem.width,
        depth: catalogItem.depth,
        rotation
      })
    }

    const accessWarning = review.warnings.find(
      (item) => item.id.startsWith("room-access-") && item.targetId
    )
    const accessRoom = accessWarning?.targetId ? roomById.get(accessWarning.targetId) : null
    const accessWall = accessRoom
      ? floorPlanData.walls
          .filter((wall) => roomTouchesWall(accessRoom, wall))
          .sort((left, right) => getWallLength(right) - getWallLength(left))[0]
      : null

    if (accessRoom && accessWall) {
      actions.push({
        id: `add-door-${accessRoom.id}`,
        label: "Add door",
        detail: `Place a 36 in standard door on ${accessRoom.label}.`,
        apply: () => {
          addDoor({
            wallId: accessWall.id,
            position: 0.5,
            width: 36,
            type: "standard",
            rotation: 0
          })
          focusRoom(accessRoom)
        }
      })
    }

    const bedroom = floorPlanData.rooms.find((room) => {
      if (getRoomCategory(room) !== "bedroom") return false
      const roomFurniture = getFurnitureForRoom(room, floorPlanData.furniture)
      return !roomFurniture.some((item) => ["queen-bed", "king-bed", "twin-bed"].includes(item.type))
    })

    if (bedroom) {
      actions.push({
        id: `bedroom-set-${bedroom.id}`,
        label: "Add bedroom set",
        detail: `Place a bed and nightstand in ${bedroom.label}.`,
        apply: () => {
          placeFurniture(bedroom, bedroom.areaSqFt < 75 ? "twin-bed" : "queen-bed")
          placeFurniture(bedroom, "nightstand", { x: 3, y: -2 })
          focusRoom(bedroom)
        }
      })
    }

    const kitchen = floorPlanData.rooms.find((room) => {
      if (getRoomCategory(room) !== "kitchen") return false
      const roomFurnitureTypes = getFurnitureForRoom(room, floorPlanData.furniture).map((item) => item.type)
      return !roomFurnitureTypes.includes("refrigerator") || !roomFurnitureTypes.includes("stove")
    })

    if (kitchen) {
      actions.push({
        id: `kitchen-basics-${kitchen.id}`,
        label: "Add kitchen basics",
        detail: `Place refrigerator and stove references in ${kitchen.label}.`,
        apply: () => {
          placeFurniture(kitchen, "refrigerator", { x: -1.4, y: 0 })
          placeFurniture(kitchen, "stove", { x: 1.4, y: 0 })
          focusRoom(kitchen)
        }
      })
    }

    const living = floorPlanData.rooms.find((room) => {
      if (getRoomCategory(room) !== "living") return false
      return getFurnitureForRoom(room, floorPlanData.furniture).length === 0
    })

    if (living) {
      actions.push({
        id: `living-set-${living.id}`,
        label: "Add living set",
        detail: `Place couch and coffee table references in ${living.label}.`,
        apply: () => {
          placeFurniture(living, "couch", { x: -2, y: 0 })
          placeFurniture(living, "coffee-table", { x: 2, y: 0 })
          focusRoom(living)
        }
      })
    }

    return actions.slice(0, 4)
  }, [
    addDoor,
    addFurniture,
    focusRoom,
    floorPlanData.furniture,
    floorPlanData.rooms,
    floorPlanData.scale,
    floorPlanData.walls,
    review.warnings,
  ])

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

      {fixActions.length > 0 ? (
        <div className="editor-fix-assist">
          <div className="editor-fix-assist-header">
            <Sparkles size={15} />
            <span>Fix Assist</span>
          </div>
          <div className="editor-fix-assist-list">
            {fixActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="editor-fix-action"
                onClick={action.apply}
              >
                <span className="compliance-icon-shell is-info">
                  {action.label === "Add door" ? <DoorOpen size={15} /> : <Sparkles size={15} />}
                </span>
                <span>
                  <strong>{action.label}</strong>
                  <span>{action.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {layoutPlans.length > 0 ? (
        <div className="editor-layout-assistant">
          <div className="editor-layout-assistant-header">
            <span>Room Layout Assistant</span>
            <span>{layoutPlans.length} rooms</span>
          </div>
          <div className="editor-layout-list">
            {layoutPlans.map((plan) => {
              const LayoutIcon = plan.category === "kitchen" ? ChefHat : BedDouble

              return (
                <article key={plan.room.id} className="editor-layout-card">
                  <div className="editor-layout-card-copy">
                    <span className={`compliance-icon-shell is-${plan.items.length > 0 ? "info" : "good"}`}>
                      <LayoutIcon size={15} />
                    </span>
                    <span>
                      <strong>{plan.title}</strong>
                      <span>
                        {plan.dimensions.widthFt} ft by {plan.dimensions.depthFt} ft
                      </span>
                      <span>{plan.description}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="editor-layout-action"
                    onClick={() => applyLayoutPlan(plan)}
                  >
                    {plan.items.length > 0 ? `Apply ${plan.category} layout` : "Focus room"}
                  </button>
                </article>
              )
            })}
          </div>
        </div>
      ) : null}

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
