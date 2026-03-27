"use client"

type SkeletonProps = {
  className?: string
  style?: React.CSSProperties
}

export function Skeleton({ className = "", style }: SkeletonProps) {
  return <div className={`skeleton ${className}`} style={style} />
}

export function SkeletonText({ variant = "default" }: { variant?: "default" | "short" | "wide" }) {
  const modifier = variant === "short" ? " is-short" : variant === "wide" ? " is-wide" : ""
  return <div className={`skeleton skeleton-text${modifier}`} />
}

export function SkeletonProjectCard() {
  return (
    <div className="project-card" style={{ pointerEvents: "none" }}>
      <div className="skeleton skeleton-thumb" />
      <div className="project-meta" style={{ gap: "0.6rem" }}>
        <div className="skeleton skeleton-text is-wide" />
        <div className="skeleton skeleton-text is-short" />
        <div className="skeleton skeleton-text" style={{ width: "25%", height: "1.6rem", borderRadius: "999px" }} />
        <div className="skeleton skeleton-text" />
      </div>
    </div>
  )
}

export function SkeletonPanel({ height = "360px" }: { height?: string }) {
  return (
    <div className="panel" style={{ pointerEvents: "none" }}>
      <div style={{ display: "grid", gap: "0.8rem" }}>
        <div className="skeleton skeleton-text is-wide" style={{ height: "1.3rem" }} />
        <div className="skeleton skeleton-text is-short" />
        <div className="skeleton" style={{ height, borderRadius: "1rem" }} />
      </div>
    </div>
  )
}
