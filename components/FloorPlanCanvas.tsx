"use client"

import type Konva from "konva"
import { Arc, Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva"
import type { RefObject } from "react"
import { useEffect, useMemo, useRef, useState } from "react"

import { FURNITURE_BY_ID } from "@/lib/furniture-library"
import {
  calculateRoomAreaSqFt,
  clamp,
  findNearestWall,
  formatFeetInches,
  getWallAngle,
  getWallLength,
  pointDistance,
  pointOnWall,
  polygonCentroid,
  projectPointToWall,
  snapPoint,
  snapToNearestEndpoint
} from "@/lib/geometry"
import { useEditorStore } from "@/lib/editor-store"
import type { Point } from "@/lib/types"

type FloorPlanCanvasProps = {
  stageRef: RefObject<Konva.Stage | null>
  sourceImageUrl?: string | null
  overlayVisible?: boolean
  overlayOpacity?: number
}

type CanvasSize = {
  width: number
  height: number
}

const ROOM_COLORS = ["rgba(212, 168, 75, 0.18)", "rgba(100, 116, 139, 0.12)", "rgba(27, 42, 74, 0.08)"]
const ORTHOGONAL_SNAP_THRESHOLD = 15
const WALL_PLACEMENT_THRESHOLD = 40
const ROOM_CLOSE_THRESHOLD = 15

function snapWallEndpoint(start: Point, point: Point, scale: number, gridSize: number): Point {
  const snapped = snapPoint(point, scale, gridSize)
  const dx = snapped.x - start.x
  const dy = snapped.y - start.y

  if (dx === 0 && dy === 0) {
    return snapped
  }

  const angle = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI)
  const horizontalDelta = Math.min(angle, Math.abs(180 - angle))
  const verticalDelta = Math.abs(90 - angle)

  if (horizontalDelta <= ORTHOGONAL_SNAP_THRESHOLD) {
    return { x: snapped.x, y: start.y }
  }

  if (verticalDelta <= ORTHOGONAL_SNAP_THRESHOLD) {
    return { x: start.x, y: snapped.y }
  }

  return snapped
}

export default function FloorPlanCanvas({
  stageRef,
  sourceImageUrl,
  overlayVisible = true,
  overlayOpacity = 0.3
}: FloorPlanCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<CanvasSize>({ width: 960, height: 720 })
  const [mousePosition, setMousePosition] = useState<Point | null>(null)
  const [sourceImageElement, setSourceImageElement] = useState<HTMLImageElement | null>(null)

  const floorPlanData = useEditorStore((state) => state.floorPlanData)
  const selectedIds = useEditorStore((state) => state.selectedIds)
  const tool = useEditorStore((state) => state.tool)
  const zoom = useEditorStore((state) => state.zoom)
  const pan = useEditorStore((state) => state.pan)
  const pendingWallStart = useEditorStore((state) => state.pendingWallStart)
  const pendingRoomPoints = useEditorStore((state) => state.pendingRoomPoints)
  const pendingFurniture = useEditorStore((state) => state.pendingFurniture)
  const setSelectedIds = useEditorStore((state) => state.setSelectedIds)
  const toggleSelectedId = useEditorStore((state) => state.toggleSelectedId)
  const clearSelection = useEditorStore((state) => state.clearSelection)
  const setZoom = useEditorStore((state) => state.setZoom)
  const setPan = useEditorStore((state) => state.setPan)
  const setPendingWallStart = useEditorStore((state) => state.setPendingWallStart)
  const setPendingRoomPoints = useEditorStore((state) => state.setPendingRoomPoints)
  const addWall = useEditorStore((state) => state.addWall)
  const addRoom = useEditorStore((state) => state.addRoom)
  const addDoor = useEditorStore((state) => state.addDoor)
  const addWindow = useEditorStore((state) => state.addWindow)
  const addFurniture = useEditorStore((state) => state.addFurniture)
  const moveElement = useEditorStore((state) => state.moveElement)
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

  useEffect(() => {
    const element = frameRef.current
    if (!element) {
      return
    }

    const updateSize = () => {
      const bounds = element.getBoundingClientRect()
      setSize({
        width: Math.max(320, Math.floor(bounds.width)),
        height: Math.max(420, Math.floor(bounds.height))
      })
    }

    updateSize()

    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) {
      return
    }

    stage.container().style.cursor = tool === "select" ? "grab" : "crosshair"
  }, [stageRef, tool])

  useEffect(() => {
    if (!sourceImageUrl) {
      setSourceImageElement(null)
      return
    }

    let isActive = true
    const image = new window.Image()
    image.crossOrigin = "anonymous"
    image.onload = () => {
      if (isActive) {
        setSourceImageElement(image)
      }
    }
    image.onerror = () => {
      if (isActive) {
        setSourceImageElement(null)
      }
    }
    image.src = sourceImageUrl

    return () => {
      isActive = false
      image.onload = null
      image.onerror = null
    }
  }, [sourceImageUrl])

  const gridSpacing = useMemo(
    () => (floorPlanData.scale * floorPlanData.gridSize) / 12,
    [floorPlanData.gridSize, floorPlanData.scale]
  )

  const pendingWallEnd = useMemo(() => {
    if (!pendingWallStart || !mousePosition) {
      return null
    }

    return snapWallEndpoint(
      pendingWallStart,
      mousePosition,
      floorPlanData.scale,
      floorPlanData.gridSize
    )
  }, [
    floorPlanData.gridSize,
    floorPlanData.scale,
    mousePosition,
    pendingWallStart
  ])

  const pendingRoomPreviewPoint = useMemo(() => {
    if (tool !== "room" || pendingRoomPoints.length === 0 || !mousePosition) {
      return null
    }

    return snapPoint(mousePosition, floorPlanData.scale, floorPlanData.gridSize)
  }, [
    floorPlanData.gridSize,
    floorPlanData.scale,
    mousePosition,
    pendingRoomPoints.length,
    tool
  ])

  const isClosingPendingRoom = useMemo(() => {
    if (pendingRoomPoints.length < 3 || !mousePosition) {
      return false
    }

    return pointDistance(mousePosition, pendingRoomPoints[0]) <= ROOM_CLOSE_THRESHOLD
  }, [mousePosition, pendingRoomPoints])

  const pendingRoomLinePoints = useMemo(() => {
    if (pendingRoomPoints.length === 0) {
      return []
    }

    const points = [...pendingRoomPoints]
    if (pendingRoomPreviewPoint) {
      points.push(isClosingPendingRoom ? pendingRoomPoints[0] : pendingRoomPreviewPoint)
    }

    return points.flatMap((point) => [point.x, point.y])
  }, [isClosingPendingRoom, pendingRoomPoints, pendingRoomPreviewPoint])

  function getPointerPosition() {
    const stage = stageRef.current
    const pointer = stage?.getPointerPosition()
    if (!stage || !pointer) {
      return null
    }

    return {
      x: (pointer.x - pan.x) / zoom,
      y: (pointer.y - pan.y) / zoom
    }
  }

  function hasShiftModifier(event: Event) {
    return "shiftKey" in event && Boolean(event.shiftKey)
  }

  function handleElementSelect(
    id: string,
    event: Konva.KonvaEventObject<Event>
  ) {
    if (tool === "select") {
      if (hasShiftModifier(event.evt)) {
        toggleSelectedId(id)
        return
      }

      setSelectedIds([id])
    }
  }

  function handleStageClick(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const pointer = getPointerPosition()
    if (!pointer) {
      return
    }

    const clickedOnEmpty = event.target === event.target.getStage()
    const isShiftSelection = hasShiftModifier(event.evt)

    if (tool === "select") {
      if (clickedOnEmpty && !isShiftSelection) {
        clearSelection()
      }
      return
    }

    if (tool === "wall") {
      if (!pendingWallStart) {
        const snappedToEndpoint = snapToNearestEndpoint(pointer, floorPlanData.walls, 15)
        const startPoint = snappedToEndpoint ?? snapPoint(pointer, floorPlanData.scale, floorPlanData.gridSize)
        setPendingWallStart(startPoint)
        return
      }

      const snappedToEndpoint = snapToNearestEndpoint(pointer, floorPlanData.walls, 15)
      const endpoint = snappedToEndpoint ?? snapWallEndpoint(
        pendingWallStart,
        pointer,
        floorPlanData.scale,
        floorPlanData.gridSize
      )

      if (pointDistance(pendingWallStart, endpoint) < 4) {
        setPendingWallStart(null)
        return
      }

      addWall({
        x1: pendingWallStart.x,
        y1: pendingWallStart.y,
        x2: endpoint.x,
        y2: endpoint.y,
        thickness: 8
      })
      return
    }

    if (tool === "room") {
      const snappedPoint = snapPoint(pointer, floorPlanData.scale, floorPlanData.gridSize)

      if (pendingRoomPoints.length === 0) {
        setPendingRoomPoints([snappedPoint])
        return
      }

      if (
        pendingRoomPoints.length >= 3 &&
        pointDistance(pointer, pendingRoomPoints[0]) <= ROOM_CLOSE_THRESHOLD
      ) {
        const polygon = [...pendingRoomPoints]
        if (calculateRoomAreaSqFt({ id: "preview-room", label: "Preview", polygon, areaSqFt: 0 }, floorPlanData.scale) > 0) {
          addRoom({
            label: `Room ${floorPlanData.rooms.length + 1}`,
            polygon
          })
        } else {
          setPendingRoomPoints([])
        }
        return
      }

      const lastPoint = pendingRoomPoints.at(-1)
      if (lastPoint && pointDistance(lastPoint, snappedPoint) < 4) {
        return
      }

      setPendingRoomPoints([...pendingRoomPoints, snappedPoint])
      return
    }

    if (tool === "door" || tool === "window") {
      const hostWall = findNearestWall(floorPlanData.walls, pointer, WALL_PLACEMENT_THRESHOLD)
      if (!hostWall) {
        return
      }

      const projection = projectPointToWall(hostWall, pointer)
      if (tool === "door") {
        addDoor({
          wallId: hostWall.id,
          position: projection.ratio,
          width: 36,
          type: "standard",
          rotation: 0
        })
      } else {
        addWindow({
          wallId: hostWall.id,
          position: projection.ratio,
          width: 48,
          height: 42
        })
      }
      return
    }

    if (tool === "furniture" && pendingFurniture) {
      const snappedPoint = snapPoint(pointer, floorPlanData.scale, floorPlanData.gridSize)
      addFurniture({
        type: pendingFurniture.type,
        x: snappedPoint.x,
        y: snappedPoint.y,
        width: pendingFurniture.width,
        depth: pendingFurniture.depth,
        rotation: pendingFurniture.rotation
      })
    }
  }

  function handleStageMouseMove() {
    setMousePosition(getPointerPosition())
  }

  function handleWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault()
    const stage = stageRef.current
    const pointer = stage?.getPointerPosition()
    if (!stage || !pointer) {
      return
    }

    const scaleBy = 1.06
    const oldZoom = zoom
    const mousePointTo = {
      x: (pointer.x - pan.x) / oldZoom,
      y: (pointer.y - pan.y) / oldZoom
    }
    const nextZoom = clamp(event.evt.deltaY > 0 ? oldZoom / scaleBy : oldZoom * scaleBy, 0.4, 3)

    setZoom(Number(nextZoom.toFixed(3)))
    setPan({
      x: pointer.x - mousePointTo.x * nextZoom,
      y: pointer.y - mousePointTo.y * nextZoom
    })
  }

  return (
    <section className="canvas-panel">
      <div ref={frameRef} className="canvas-frame">
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={pan.x}
          y={pan.y}
          scaleX={zoom}
          scaleY={zoom}
          draggable={tool === "select"}
          onDragEnd={(event) => setPan({ x: event.target.x(), y: event.target.y() })}
          onWheel={handleWheel}
          onClick={handleStageClick}
          onTap={handleStageClick}
          onMouseMove={handleStageMouseMove}
          onMouseLeave={() => setMousePosition(null)}
        >
          {overlayVisible && sourceImageElement ? (
            <Layer listening={false}>
              <KonvaImage
                image={sourceImageElement}
                x={0}
                y={0}
                width={sourceImageElement.naturalWidth || sourceImageElement.width}
                height={sourceImageElement.naturalHeight || sourceImageElement.height}
                opacity={overlayOpacity}
              />
            </Layer>
          ) : null}

          <Layer listening={false}>
            {Array.from({ length: Math.ceil(size.width / gridSpacing) + 4 }).map((_, index) => {
              const position = index * gridSpacing
              return (
                <Line
                  key={`grid-v-${index}`}
                  points={[position, 0, position, size.height * 2]}
                  stroke="rgba(100, 116, 139, 0.12)"
                  strokeWidth={1 / zoom}
                />
              )
            })}
            {Array.from({ length: Math.ceil(size.height / gridSpacing) + 4 }).map((_, index) => {
              const position = index * gridSpacing
              return (
                <Line
                  key={`grid-h-${index}`}
                  points={[0, position, size.width * 2, position]}
                  stroke="rgba(100, 116, 139, 0.12)"
                  strokeWidth={1 / zoom}
                />
              )
            })}
          </Layer>

          <Layer>
            {floorPlanData.rooms.map((room, index) => {
              const labelPosition = polygonCentroid(room.polygon)

              return (
                <Group
                  key={room.id}
                  draggable={tool === "select"}
                  onClick={(event) => handleElementSelect(room.id, event)}
                  onTap={(event) => handleElementSelect(room.id, event)}
                  onDragEnd={(event) => {
                    moveElement(room.id, { x: event.target.x(), y: event.target.y() })
                    event.target.position({ x: 0, y: 0 })
                  }}
                >
                  <Line
                    closed
                    points={room.polygon.flatMap((point) => [point.x, point.y])}
                    fill={ROOM_COLORS[index % ROOM_COLORS.length]}
                    stroke={selectedIdSet.has(room.id) ? "#d4a84b" : "rgba(27, 42, 74, 0.24)"}
                    strokeWidth={selectedIdSet.has(room.id) ? 3 : 1.5}
                  />
                  <Text
                    x={labelPosition.x}
                    y={labelPosition.y}
                    offsetX={44}
                    offsetY={20}
                    width={88}
                    align="center"
                    fontSize={16}
                    fill="#1B2A4A"
                    text={`${room.label}\n${room.areaSqFt} sq ft`}
                  />
                </Group>
              )
            })}

            {floorPlanData.walls.map((wall) => (
              <Line
                key={wall.id}
                points={[wall.x1, wall.y1, wall.x2, wall.y2]}
                stroke="#1B2A4A"
                strokeWidth={wall.thickness}
                lineCap="round"
                lineJoin="round"
                draggable={tool === "select"}
                onClick={(event) => handleElementSelect(wall.id, event)}
                onTap={(event) => handleElementSelect(wall.id, event)}
                onDragEnd={(event) => {
                  moveElement(wall.id, { x: event.target.x(), y: event.target.y() })
                  event.target.position({ x: 0, y: 0 })
                }}
                shadowBlur={selectedIdSet.has(wall.id) ? 8 : 0}
                shadowColor="rgba(212, 168, 75, 0.75)"
              />
            ))}

            {floorPlanData.doors.map((door) => {
              const wall = floorPlanData.walls.find((entry) => entry.id === door.wallId)
              if (!wall) {
                return null
              }

              const center = pointOnWall(wall, door.position)
              const radius = (door.width / 12) * floorPlanData.scale * 0.5
              return (
                <Group
                  key={door.id}
                  draggable={tool === "select"}
                  onClick={(event) => handleElementSelect(door.id, event)}
                  onTap={(event) => handleElementSelect(door.id, event)}
                  onDragEnd={(event) => {
                    moveElement(door.id, { x: event.target.x(), y: event.target.y() })
                    event.target.position({ x: 0, y: 0 })
                  }}
                >
                  <Arc
                    x={center.x}
                    y={center.y}
                    innerRadius={Math.max(radius - 1.5, 1)}
                    outerRadius={radius + 1.5}
                    angle={90}
                    rotation={getWallAngle(wall) - 45}
                    fill={selectedIdSet.has(door.id) ? "#d4a84b" : "#B58B31"}
                    opacity={0.85}
                  />
                </Group>
              )
            })}

            {floorPlanData.windows.map((window) => {
              const wall = floorPlanData.walls.find((entry) => entry.id === window.wallId)
              if (!wall) {
                return null
              }

              const center = pointOnWall(wall, window.position)
              const widthPx = (window.width / 12) * floorPlanData.scale
              const rotation = getWallAngle(wall)
              return (
                <Group
                  key={window.id}
                  draggable={tool === "select"}
                  onClick={(event) => handleElementSelect(window.id, event)}
                  onTap={(event) => handleElementSelect(window.id, event)}
                  onDragEnd={(event) => {
                    moveElement(window.id, { x: event.target.x(), y: event.target.y() })
                    event.target.position({ x: 0, y: 0 })
                  }}
                >
                  <Group x={center.x} y={center.y} rotation={rotation}>
                    <Line
                      points={[-widthPx / 2, -4, widthPx / 2, -4]}
                      stroke={selectedIdSet.has(window.id) ? "#d4a84b" : "#64748b"}
                      strokeWidth={3}
                    />
                    <Line
                      points={[-widthPx / 2, 4, widthPx / 2, 4]}
                      stroke={selectedIdSet.has(window.id) ? "#d4a84b" : "#64748b"}
                      strokeWidth={3}
                    />
                  </Group>
                </Group>
              )
            })}

            {floorPlanData.furniture.map((item) => {
              const widthPx = (item.width / 12) * floorPlanData.scale
              const depthPx = (item.depth / 12) * floorPlanData.scale
              const furnitureLabel = FURNITURE_BY_ID[item.type]?.label ?? item.type
              const isSelected = selectedIdSet.has(item.id)

              return (
                <Group
                  key={item.id}
                  x={item.x}
                  y={item.y}
                  rotation={item.rotation}
                  draggable={tool === "select"}
                  onClick={(event) => handleElementSelect(item.id, event)}
                  onTap={(event) => handleElementSelect(item.id, event)}
                  onDragEnd={(event) => {
                    moveElement(item.id, { x: event.target.x(), y: event.target.y() })
                    event.target.position({ x: 0, y: 0 })
                  }}
                >
                  <Rect
                    x={-widthPx / 2}
                    y={-depthPx / 2}
                    width={widthPx}
                    height={depthPx}
                    cornerRadius={Math.min(widthPx, depthPx) * 0.12}
                    fill={isSelected ? "rgba(212, 168, 75, 0.42)" : "rgba(148, 163, 184, 0.26)"}
                    stroke={isSelected ? "#d4a84b" : "#475569"}
                    strokeWidth={isSelected ? 3 : 1.5}
                  />
                  <Text
                    x={-widthPx / 2}
                    y={-8}
                    width={widthPx}
                    align="center"
                    fontSize={12}
                    fill="#1B2A4A"
                    text={furnitureLabel}
                    listening={false}
                  />
                </Group>
              )
            })}

            {/* Dimension labels on placed walls */}
            {floorPlanData.walls.map((wall) => {
              const length = getWallLength(wall)
              if (length < 10) return null
              const midX = (wall.x1 + wall.x2) / 2
              const midY = (wall.y1 + wall.y2) / 2
              const angle = getWallAngle(wall)
              const perpAngle = ((angle + 90) * Math.PI) / 180
              const offsetDist = 14
              const labelX = midX + Math.cos(perpAngle) * offsetDist
              const labelY = midY + Math.sin(perpAngle) * offsetDist
              const displayAngle = angle > 90 || angle < -90 ? angle + 180 : angle
              return (
                <Text
                  key={`dim-${wall.id}`}
                  x={labelX}
                  y={labelY}
                  text={formatFeetInches(length, floorPlanData.scale)}
                  fontSize={11 / zoom}
                  fill="#64748b"
                  rotation={displayAngle}
                  offsetX={0}
                  offsetY={6 / zoom}
                  listening={false}
                />
              )
            })}

            {pendingWallStart ? (
              <>
                <Circle
                  x={pendingWallStart.x}
                  y={pendingWallStart.y}
                  radius={4 / zoom}
                  fill="#d4a84b"
                  listening={false}
                />
                {pendingWallEnd ? (
                  <>
                    <Line
                      points={[pendingWallStart.x, pendingWallStart.y, pendingWallEnd.x, pendingWallEnd.y]}
                      stroke="#d4a84b"
                      strokeWidth={2 / zoom}
                      dash={[10 / zoom, 8 / zoom]}
                      listening={false}
                    />
                    <Text
                      x={(pendingWallStart.x + pendingWallEnd.x) / 2}
                      y={(pendingWallStart.y + pendingWallEnd.y) / 2 - 16 / zoom}
                      text={formatFeetInches(pointDistance(pendingWallStart, pendingWallEnd), floorPlanData.scale)}
                      fontSize={13 / zoom}
                      fill="#d4a84b"
                      fontStyle="bold"
                      listening={false}
                    />
                  </>
                ) : null}
              </>
            ) : null}

            {pendingRoomPoints.length > 0 ? (
              <>
                {pendingRoomLinePoints.length >= 4 ? (
                  <Line
                    points={pendingRoomLinePoints}
                    stroke="#d4a84b"
                    strokeWidth={2 / zoom}
                    dash={[10 / zoom, 8 / zoom]}
                    listening={false}
                  />
                ) : null}
                {pendingRoomPoints.map((point, index) => (
                  <Circle
                    key={`pending-room-point-${index}`}
                    x={point.x}
                    y={point.y}
                    radius={(index === 0 && isClosingPendingRoom ? 6 : 4) / zoom}
                    fill={index === 0 && isClosingPendingRoom ? "#1B2A4A" : "#d4a84b"}
                    listening={false}
                  />
                ))}
              </>
            ) : null}
          </Layer>
        </Stage>
      </div>
      <div className="canvas-caption">
        <span>
          Wheel to zoom. Drag the canvas to pan. Active tool: {tool}.
        </span>
        <span>
          {floorPlanData.walls.length} walls • {floorPlanData.rooms.length} rooms • {floorPlanData.doors.length} doors • {floorPlanData.windows.length} windows • {floorPlanData.furniture.length} furniture
        </span>
      </div>
    </section>
  )
}
