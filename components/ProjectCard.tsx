"use client"

import Image from "next/image"
import Link from "next/link"

import { formatDate, formatRelativeTime } from "@/lib/file-utils"
import type { ProjectSummary } from "@/lib/types"

type ProjectCardProps = {
  project: ProjectSummary
}

export default function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link href={`/projects/${project.id}`} className="project-card">
      <div className="project-thumb">
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
      </div>
      <div className="project-meta">
        <div className="section-title">{project.name}</div>
        <div className="muted">{project.clientName || "No client assigned"}</div>
        <div className="badge">{project.floorCount} floor{project.floorCount === 1 ? "" : "s"}</div>
        <div className="muted">
          Created {formatDate(project.createdAt)} • Updated {formatRelativeTime(project.updatedAt)}
        </div>
      </div>
    </Link>
  )
}
