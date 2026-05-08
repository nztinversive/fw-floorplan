"use client"

import Image from "next/image"
import Link from "next/link"

import { formatRelativeTime } from "@/lib/file-utils"
import type { ProjectSummary } from "@/lib/types"

type ProjectCardProps = {
  project: ProjectSummary
}

function PlanThumb({ accent = "#c66e3d" }: { accent?: string }) {
  return (
    <svg viewBox="0 0 50 36" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="50" height="36" fill="var(--studio-bg-2)" />
      <g transform="translate(8 6)">
        <rect
          width="34"
          height="24"
          fill="var(--studio-panel)"
          stroke="var(--studio-ink)"
          strokeWidth="1.2"
        />
        <line x1="0" y1="9" x2="34" y2="9" stroke="var(--studio-ink)" strokeWidth="0.8" />
        <line x1="0" y1="17" x2="22" y2="17" stroke="var(--studio-ink)" strokeWidth="0.8" />
        <line x1="14" y1="0" x2="14" y2="9" stroke="var(--studio-ink)" strokeWidth="0.8" />
        <line x1="22" y1="0" x2="22" y2="17" stroke="var(--studio-ink)" strokeWidth="0.8" />
        <line x1="22" y1="17" x2="22" y2="24" stroke="var(--studio-ink)" strokeWidth="0.8" />
        <line x1="10" y1="17" x2="10" y2="24" stroke="var(--studio-ink)" strokeWidth="0.8" />
        <circle cx="6" cy="22" r="1" fill={accent} />
        <circle cx="28" cy="5" r="1" fill={accent} />
      </g>
    </svg>
  )
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const floorLabel = `${project.floorCount} floor${project.floorCount === 1 ? "" : "s"}`
  const isReady = project.floorCount > 0
  const statusLabel = isReady ? "✓ ready" : "editing"
  const statusClass = isReady
    ? "studio-proj-status is-ready"
    : "studio-proj-status"

  return (
    <Link href={`/projects/${project.id}`} className="studio-proj-card">
      <div className="studio-proj-thumb">
        {project.thumbnail ? (
          <Image
            src={project.thumbnail}
            alt={`${project.name} thumbnail`}
            fill
            sizes="(max-width: 1000px) 50vw, 33vw"
            unoptimized
          />
        ) : (
          <PlanThumb />
        )}
        <span className={statusClass}>{statusLabel}</span>
      </div>
      <div className="studio-proj-body">
        <div className="studio-proj-name">{project.name}</div>
        <div className="studio-proj-meta">
          {project.clientName ? (
            <>
              <span>{project.clientName}</span>
              <span className="dot">·</span>
            </>
          ) : null}
          <span>{floorLabel}</span>
          <span className="dot">·</span>
          <span>Updated {formatRelativeTime(project.updatedAt)}</span>
        </div>
      </div>
    </Link>
  )
}
