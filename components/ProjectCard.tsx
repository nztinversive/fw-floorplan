"use client"

import Image from "next/image"
import Link from "next/link"
import { PenTool, Image as ImageIcon, ArrowRight } from "lucide-react"

import { formatDate, formatRelativeTime } from "@/lib/file-utils"
import type { ProjectSummary } from "@/lib/types"

type ProjectCardProps = {
  project: ProjectSummary
}

export default function ProjectCard({ project }: ProjectCardProps) {
  return (
    <div className="project-card project-card-v2">
      <Link href={`/projects/${project.id}`} className="project-thumb">
        {project.thumbnail ? (
          <Image
            src={project.thumbnail}
            alt={`${project.name} thumbnail`}
            fill
            sizes="(max-width: 760px) 100vw, 33vw"
            unoptimized
          />
        ) : null}
        <div className="project-thumb-label">{project.address || "Floor plan ready"}</div>
        {/* Quick action overlay */}
        <div className="project-card-overlay">
          <span className="project-card-overlay-text">
            Open project <ArrowRight size={14} />
          </span>
        </div>
      </Link>
      <div className="project-meta">
        <div className="project-meta-top">
          <div>
            <div className="section-title">{project.name}</div>
            <div className="muted">{project.clientName || "No client assigned"}</div>
          </div>
          <div className="badge">{project.floorCount} floor{project.floorCount === 1 ? "" : "s"}</div>
        </div>
        <div className="muted project-meta-time">
          Updated {formatRelativeTime(project.updatedAt)}
        </div>
        <div className="project-card-actions">
          <Link href={`/projects/${project.id}/edit`} className="project-card-action" onClick={(e) => e.stopPropagation()}>
            <PenTool size={14} />
            Edit
          </Link>
          <Link href={`/projects/${project.id}/renders`} className="project-card-action" onClick={(e) => e.stopPropagation()}>
            <ImageIcon size={14} />
            Renders
          </Link>
        </div>
      </div>
    </div>
  )
}
