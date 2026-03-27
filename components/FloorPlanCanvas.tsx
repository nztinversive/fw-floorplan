"use client"

import type Konva from "konva"
import { Arc, Circle, Group, Layer, Line, Stage, Text } from "react-konva"
import type { RefObject } from "react"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  clamp,
  findNearestWall,
  getWallAngle,
  pointDistance,
  pointOnWall,
  polygonCentroid,
  projectPointToWall,
  snapPoint
} from "@/lib/geometry"
import { useEditorStore } from "@/lib/editor-store"
import type { Point } from "@/lib/types"

type FloorPlanCanvasProps = {
  stageRef: RefObject<Konva.Stage | null>
}

type CanvasSize = {
  width: number
  height: number
}

const ROOM_COLORS = ["rgba(212, 168, 75, 0.18)", "rgba(100, 116, 139, 0.12)", "rgba(27, 42, 74, 0.08)"]
const ORTHOGONAL_SNAP_THRESHOLD = 15
const WALL_PLACEMENT_THRESHOLD = 40

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

export default function FloorPlanCanvas({ stageRef }: FloorPlanCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<CanvasSize>({ width: 960, height: 720 })
  const [mousePosition, setMousePosition] = useState<Point | null>(null)

  const floorPlanData = useEditorStore((state) => state.floorPlanData)
  const selectedId = useEditorStore((state) => state.selectedId)
  const tool = useEditorStore((state) => state.tool)
  const zoom = useEditorStore((state) => state.zoom)
  const pan = useEditorStore((state) => state.pan)
  const pendingWallStart = useEditorStore((state) => state.pendingWallStart)
  const setSelectedId = useEditorStore((state) => state.setSelectedId)
  const setZoom = useEditorStore((state) => state.setZoom)
  const setPan = useEditorStore((state) => state.setPan)
  const setPendingWallStart = useEditorStore((state) => state.setPendingWallStart)
  const addWall = useEditorStore((state) => state.addWall)
  const addDoor = useEditorStore((state) => state.addDoor)
  const addWindow = useEditorStore((state) => state.addWindow)
  const moveElement = useEditorStore((state) => state.moveElement)

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

  function handleElementSelect(id: string) {
    if (tool === "select") {
      setSelectedId(id)
    }
  }

  function handleStageClick(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const pointer = getPointerPosition()
    if (!pointer) {
      return
    }

    const clickedOnEmpty = event.target === event.target.getStage()

    if (tool === "select") {
      if (clickedOnEmpty) {
        setSelectedId(null)
      }
      return
    }

    if (tool === "wall") {
      if (!pendingWallStart) {
        setPendingWallStart(snapPoint(pointer, floorPlanData.scale, floorPlanData.gridSize))
        return
      }

      const endpoint = snapWallEndpoint(
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
                  onClick={() => handleElementSelect(room.id)}
                  onTap={() => handleElementSelect(room.id)}
                  onDragEnd={(event) => {
                    moveElement(room.id, { x: event.target.x(), y: event.target.y() })
                    event.target.position({ x: 0, y: 0 })
                  }}
                >
                  <Line
                    closed
                    points={room.polygon.flatMap((point) => [point.x, point.y])}
                    fill={ROOM_COLORS[index % ROOM_COLORS.length]}
                    stroke={selectedId === room.id ? "#d4a84b" : "rgba(27, 42, 74, 0.24)"}
                    strokeWidth={selectedId === room.id ? 3 : 1.5}
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
                onClick={() => handleElementSelect(wall.id)}
                onTap={() => handleElementSelect(wall.id)}
                onDragEnd={(event) => {
                  moveElement(wall.id, { x: event.target.x(), y: event.target.y() })
                  event.target.position({ x: 0, y: 0 })
                }}
                shadowBlur={selectedId === wall.id ? 8 : 0}
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
                  onClick={() => handleElementSelect(door.id)}
                  onTap={() => handleElementSelect(door.id)}
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
                    fill={selectedId === door.id ? "#d4a84b" : "#B58B31"}
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
                  onClick={() => handleElementSelect(window.id)}
                  onTap={() => handleElementSelect(window.id)}
                  onDragEnd={(event) => {
                    moveElement(window.id, { x: event.target.x(), y: event.target.y() })
                    event.target.position({ x: 0, y: 0 })
                  }}
                >
                  <Group x={center.x} y={center.y} rotation={rotation}>
                    <Line
                      points={[-widthPx / 2, -4, widthPx / 2, -4]}
                      stroke={selectedId === window.id ? "#d4a84b" : "#64748b"}
                      strokeWidth={3}
                    />
                    <Line
                      points={[-widthPx / 2, 4, widthPx / 2, 4]}
                      stroke={selectedId === window.id ? "#d4a84b" : "#64748b"}
                      strokeWidth={3}
                    />
                  </Group>
                </Group>
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
                  <Line
                    points={[pendingWallStart.x, pendingWallStart.y, pendingWallEnd.x, pendingWallEnd.y]}
                    stroke="#d4a84b"
                    strokeWidth={2 / zoom}
                    dash={[10 / zoom, 8 / zoom]}
                    listening={false}
                  />
                ) : null}
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
          {floorPlanData.walls.length} walls • {floorPlanData.rooms.length} rooms • {floorPlanData.doors.length} doors • {floorPlanData.windows.length} windows
        </span>
      </div>
    </section>
  )
}
