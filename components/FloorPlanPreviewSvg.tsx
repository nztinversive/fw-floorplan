"use client"

import { useMemo } from "react"

import type { FloorPlanData } from "@/lib/types"

type FloorPlanPreviewSvgProps = {
  data: FloorPlanData
  className?: string
  label?: string
}

function getPlanBounds(data: FloorPlanData) {
  const points = [
    ...data.walls.flatMap((wall) => [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 }
    ]),
    ...data.rooms.flatMap((room) => room.polygon)
  ]

  if (points.length === 0) {
    return { minX: 0, minY: 0, width: 1, height: 1 }
  }

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    minX,
    minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1)
  }
}

export default function FloorPlanPreviewSvg({
  data,
  className = "concept-preview",
  label = "Floor plan preview"
}: FloorPlanPreviewSvgProps) {
  const bounds = useMemo(() => getPlanBounds(data), [data])
  const viewBoxPadding = 42

  return (
    <svg
      className={className}
      viewBox={`${bounds.minX - viewBoxPadding} ${bounds.minY - viewBoxPadding} ${bounds.width + viewBoxPadding * 2} ${bounds.height + viewBoxPadding * 2}`}
      role="img"
      aria-label={label}
    >
      <rect
        x={bounds.minX - viewBoxPadding}
        y={bounds.minY - viewBoxPadding}
        width={bounds.width + viewBoxPadding * 2}
        height={bounds.height + viewBoxPadding * 2}
        fill="#f8fafc"
      />
      {data.rooms.map((room, index) => (
        <polygon
          key={room.id}
          points={room.polygon.map((point) => `${point.x},${point.y}`).join(" ")}
          fill={index % 2 === 0 ? "rgba(212, 168, 75, 0.18)" : "rgba(27, 42, 74, 0.08)"}
          stroke="rgba(27, 42, 74, 0.16)"
          strokeWidth={2}
        />
      ))}
      {data.walls.map((wall) => (
        <line
          key={wall.id}
          x1={wall.x1}
          y1={wall.y1}
          x2={wall.x2}
          y2={wall.y2}
          stroke="#1b2a4a"
          strokeWidth={wall.thickness}
          strokeLinecap="round"
        />
      ))}
      {data.doors.map((door) => {
        const wall = data.walls.find((entry) => entry.id === door.wallId)
        if (!wall) return null
        const x = wall.x1 + (wall.x2 - wall.x1) * door.position
        const y = wall.y1 + (wall.y2 - wall.y1) * door.position

        return (
          <circle
            key={door.id}
            cx={x}
            cy={y}
            r={7}
            fill="#ffffff"
            stroke="#d4a84b"
            strokeWidth={4}
          />
        )
      })}
      {data.windows.map((windowEntry) => {
        const wall = data.walls.find((entry) => entry.id === windowEntry.wallId)
        if (!wall) return null
        const x = wall.x1 + (wall.x2 - wall.x1) * windowEntry.position
        const y = wall.y1 + (wall.y2 - wall.y1) * windowEntry.position

        return (
          <circle
            key={windowEntry.id}
            cx={x}
            cy={y}
            r={9}
            fill="#ffffff"
            stroke="#6aa7d8"
            strokeWidth={4}
          />
        )
      })}
    </svg>
  )
}
