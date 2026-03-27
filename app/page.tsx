"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useQuery } from "convex/react"
import { FolderPlus } from "lucide-react"

import ProjectCard from "@/components/ProjectCard"
import { api } from "@/convex/_generated/api"
import type { ProjectSummary } from "@/lib/types"

type ProjectListItemWithThumbnailUrl = {
  thumbnail?: string
  thumbnailUrl?: string | null
  floorCount?: number
}

function getDisplayImage(src?: string) {
  return src?.startsWith("http") || src?.startsWith("data:") ? src : undefined
}

export default function DashboardPage() {
  const projectsQuery = useQuery(api.projects.list)
  const hasLoaded = projectsQuery !== undefined
  const projects = useMemo<ProjectSummary[]>(
    () =>
      (projectsQuery ?? []).map((project) => {
        const projectWithThumbnail = project as typeof project & ProjectListItemWithThumbnailUrl

        return {
          id: project._id,
          name: project.name,
          address: project.address,
          clientName: project.clientName,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          thumbnail: getDisplayImage(
            projectWithThumbnail.thumbnailUrl ?? projectWithThumbnail.thumbnail
          ),
          floorCount: projectWithThumbnail.floorCount ?? 0
        }
      }),
    [projectsQuery]
  )

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div className="hero-title">Plan with precision. Prepare for renders.</div>
        <div className="hero-copy">
          Keep projects in sync while you trace walls, clean up room geometry, and hand off
          polished floor plans for the next rendering phase.
        </div>
        <div className="hero-actions">
          <Link href="/projects/new" className="button">
            <FolderPlus size={18} />
            New project
          </Link>
          <div className="status-line">
            <span className="status-dot" />
            Convex backend connected
          </div>
        </div>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <div className="page-heading">
          <div>
            <div className="page-title">Projects</div>
            <div className="muted">
              {hasLoaded ? `${projects.length} active ${projects.length === 1 ? "project" : "projects"}` : "Loading projects"}
            </div>
          </div>
          <Link href="/projects/new" className="button-secondary">
            Create project
          </Link>
        </div>

        {hasLoaded && projects.length > 0 ? (
          <div className="project-grid">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="section-title">No projects yet</div>
            <div className="muted">
              Start a project, upload the source plan, and continue into the editor.
            </div>
            <Link href="/projects/new" className="button">
              Create the first project
            </Link>
          </div>
        )}
      </section>
    </main>
  )
}
