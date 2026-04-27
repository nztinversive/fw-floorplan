"use client";

import { Circle, Group, Line } from "react-konva";

type CommentPinProps = {
  x: number;
  y: number;
  zoom: number;
  status: "open" | "resolved";
  selected?: boolean;
  pending?: boolean;
  onClick?: () => void;
};

export default function CommentPin({
  x,
  y,
  zoom,
  status,
  selected = false,
  pending = false,
  onClick
}: CommentPinProps) {
  const pinColor = pending ? "#3b82f6" : status === "resolved" ? "#16a34a" : "#d4a84b";
  const stemHeight = 16 / zoom;
  const radius = 5 / zoom;
  const haloRadius = selected ? 9 / zoom : 0;

  return (
    <Group
      x={x}
      y={y}
      onClick={(event) => {
        event.cancelBubble = true;
        onClick?.();
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        onClick?.();
      }}
    >
      {selected ? (
        <Circle x={0} y={0} radius={haloRadius} fill="rgba(59, 130, 246, 0.18)" />
      ) : null}
      <Line
        points={[0, radius, 0, stemHeight]}
        stroke={pinColor}
        strokeWidth={2 / zoom}
        lineCap="round"
      />
      <Circle x={0} y={0} radius={radius} fill={pinColor} stroke="#f8fafc" strokeWidth={1.4 / zoom} />
      <Circle x={0} y={0} radius={2 / zoom} fill="#0f172a" opacity={0.35} />
    </Group>
  );
}
