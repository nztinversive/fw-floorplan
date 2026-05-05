"use client";

import type Konva from "konva";
import { Arc, Group, Layer, Line, Stage, Text } from "react-konva";
import { useEffect, useMemo, useRef, useState } from "react";

import CommentPin from "@/components/CommentPin";
import { clamp, getWallAngle, pointOnWall, polygonCentroid } from "@/lib/geometry";
import type { FloorPlanData, Point, ProjectComment } from "@/lib/types";

type ReadOnlyFloorPlanCanvasProps = {
  data: FloorPlanData;
  comments?: ProjectComment[];
};

type CanvasSize = {
  width: number;
  height: number;
};

const ROOM_COLORS = ["rgba(212, 168, 75, 0.18)", "rgba(100, 116, 139, 0.12)", "rgba(27, 42, 74, 0.08)"];
const EMPTY_COMMENTS: ProjectComment[] = [];

function getContentBounds(data: FloorPlanData, comments: ProjectComment[]) {
  const points = [
    ...data.walls.flatMap((wall) => [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 }
    ]),
    ...data.rooms.flatMap((room) => room.polygon),
    ...comments.map((comment) => ({ x: comment.x, y: comment.y }))
  ];

  if (points.length === 0) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

export default function ReadOnlyFloorPlanCanvas({ data, comments = EMPTY_COMMENTS }: ReadOnlyFloorPlanCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<CanvasSize>({ width: 960, height: 640 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const sizeRef = useRef<CanvasSize>({ width: 960, height: 640 });
  const zoomRef = useRef(1);
  const panRef = useRef<Point>({ x: 0, y: 0 });
  const resizeFrameRef = useRef<number | null>(null);
  const contentBounds = useMemo(() => getContentBounds(data, comments), [comments, data]);
  const contentMinX = contentBounds?.minX ?? null;
  const contentMaxX = contentBounds?.maxX ?? null;
  const contentMinY = contentBounds?.minY ?? null;
  const contentMaxY = contentBounds?.maxY ?? null;

  useEffect(() => {
    const element = frameRef.current;
    if (!element) {
      return;
    }

    const applySize = () => {
      const nextSize = {
        width: Math.max(320, element.clientWidth),
        height: Math.max(360, element.clientHeight)
      };

      if (sizeRef.current.width === nextSize.width && sizeRef.current.height === nextSize.height) {
        return;
      }

      sizeRef.current = nextSize;
      setSize(nextSize);
    };

    const updateSize = () => {
      if (resizeFrameRef.current !== null) {
        return;
      }

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        applySize();
      });
    };

    applySize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (contentMinX === null || contentMaxX === null || contentMinY === null || contentMaxY === null) {
      if (zoomRef.current !== 1) {
        zoomRef.current = 1;
        setZoom(1);
      }
      if (panRef.current.x !== 0 || panRef.current.y !== 0) {
        panRef.current = { x: 0, y: 0 };
        setPan(panRef.current);
      }
      return;
    }

    const width = Math.max(contentMaxX - contentMinX, 1);
    const height = Math.max(contentMaxY - contentMinY, 1);
    const padding = 48;
    const nextZoom = clamp(
      Math.min((size.width - padding * 2) / width, (size.height - padding * 2) / height),
      0.35,
      2.5
    );

    const nextPan = {
      x: size.width / 2 - ((contentMinX + contentMaxX) / 2) * nextZoom,
      y: size.height / 2 - ((contentMinY + contentMaxY) / 2) * nextZoom
    };

    if (Math.abs(zoomRef.current - nextZoom) >= 0.001) {
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
    }

    if (Math.abs(panRef.current.x - nextPan.x) >= 0.001 || Math.abs(panRef.current.y - nextPan.y) >= 0.001) {
      panRef.current = nextPan;
      setPan(nextPan);
    }
  }, [contentMaxX, contentMaxY, contentMinX, contentMinY, size.height, size.width]);

  const gridSpacing = useMemo(
    () => (data.scale * data.gridSize) / 12,
    [data.gridSize, data.scale]
  );

  function handleWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();

    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) {
      return;
    }

    const scaleBy = 1.06;
    const oldZoom = zoom;
    const mousePointTo = {
      x: (pointer.x - pan.x) / oldZoom,
      y: (pointer.y - pan.y) / oldZoom
    };
    const nextZoom = clamp(event.evt.deltaY > 0 ? oldZoom / scaleBy : oldZoom * scaleBy, 0.3, 4);

    const roundedZoom = Number(nextZoom.toFixed(3));
    const nextPan = {
      x: pointer.x - mousePointTo.x * nextZoom,
      y: pointer.y - mousePointTo.y * nextZoom
    };

    zoomRef.current = roundedZoom;
    panRef.current = nextPan;
    setZoom(roundedZoom);
    setPan(nextPan);
  }

  return (
    <section className="canvas-panel share-canvas-panel">
      <div ref={frameRef} className="canvas-frame share-canvas-frame">
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={pan.x}
          y={pan.y}
          scaleX={zoom}
          scaleY={zoom}
          draggable
          onDragEnd={(event) => {
            const nextPan = { x: event.target.x(), y: event.target.y() };
            panRef.current = nextPan;
            setPan(nextPan);
          }}
          onWheel={handleWheel}
        >
          <Layer listening={false}>
            {Array.from({ length: Math.ceil(size.width / gridSpacing) + 4 }).map((_, index) => {
              const position = index * gridSpacing;
              return (
                <Line
                  key={`grid-v-${index}`}
                  points={[position, 0, position, size.height * 2]}
                  stroke="rgba(100, 116, 139, 0.12)"
                  strokeWidth={1 / zoom}
                />
              );
            })}
            {Array.from({ length: Math.ceil(size.height / gridSpacing) + 4 }).map((_, index) => {
              const position = index * gridSpacing;
              return (
                <Line
                  key={`grid-h-${index}`}
                  points={[0, position, size.width * 2, position]}
                  stroke="rgba(100, 116, 139, 0.12)"
                  strokeWidth={1 / zoom}
                />
              );
            })}
          </Layer>

          <Layer listening={false}>
            {data.rooms.map((room, index) => {
              const labelPosition = polygonCentroid(room.polygon);

              return (
                <Group key={room.id}>
                  <Line
                    closed
                    points={room.polygon.flatMap((point) => [point.x, point.y])}
                    fill={ROOM_COLORS[index % ROOM_COLORS.length]}
                    stroke="rgba(27, 42, 74, 0.24)"
                    strokeWidth={1.5}
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
              );
            })}

            {data.walls.map((wall) => (
              <Line
                key={wall.id}
                points={[wall.x1, wall.y1, wall.x2, wall.y2]}
                stroke="#1B2A4A"
                strokeWidth={wall.thickness}
                lineCap="round"
                lineJoin="round"
              />
            ))}

            {data.doors.map((door) => {
              const wall = data.walls.find((entry) => entry.id === door.wallId);
              if (!wall) {
                return null;
              }

              const center = pointOnWall(wall, door.position);
              const radius = (door.width / 12) * data.scale * 0.5;
              return (
                <Arc
                  key={door.id}
                  x={center.x}
                  y={center.y}
                  innerRadius={Math.max(radius - 1.5, 1)}
                  outerRadius={radius + 1.5}
                  angle={90}
                  rotation={getWallAngle(wall) - 45}
                  fill="#B58B31"
                  opacity={0.85}
                />
              );
            })}

            {data.windows.map((window) => {
              const wall = data.walls.find((entry) => entry.id === window.wallId);
              if (!wall) {
                return null;
              }

              const center = pointOnWall(wall, window.position);
              const widthPx = (window.width / 12) * data.scale;
              const rotation = getWallAngle(wall);

              return (
                <Group key={window.id} x={center.x} y={center.y} rotation={rotation}>
                  <Line points={[-widthPx / 2, -4, widthPx / 2, -4]} stroke="#64748b" strokeWidth={3} />
                  <Line points={[-widthPx / 2, 4, widthPx / 2, 4]} stroke="#64748b" strokeWidth={3} />
                </Group>
              );
            })}

            {comments.map((comment) => (
              <CommentPin
                key={comment._id}
                x={comment.x}
                y={comment.y}
                zoom={zoom}
                status={comment.status}
              />
            ))}
          </Layer>
        </Stage>
      </div>

      <div className="canvas-caption">
        <span>Read-only floor plan view with zoom and pan enabled.</span>
        <span>
          {data.walls.length} walls • {data.rooms.length} rooms • {data.doors.length} doors • {data.windows.length} windows
          {comments.length > 0 ? ` • ${comments.length} comments` : ""}
        </span>
      </div>
    </section>
  );
}
