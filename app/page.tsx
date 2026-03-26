"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { FolderPlus } from "lucide-react"

import ProjectCard from "@/components/ProjectCard"
import { listProjects } from "@/lib/local-data"
import type { ProjectSummary } from "@/lib/types"

export default function DashboardPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)

  useEffect(() => {
    setProjects(listProjects())
    setHasLoaded(true)
  }, [])

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div className="hero-title">Plan with precision. Prepare for renders.</div>
        <div className="hero-copy">
          Keep projects local while you trace walls, clean up room geometry, and hand off
          polished floor plans for the next rendering phase.
        </div>
        <div className="hero-actions">
          <Link href="/projects/new" className="button">
            <FolderPlus size={18} />
            New project
          </Link>
          <div className="status-line">
            <span className="status-dot" />
            Local browser storage enabled
          </div>
        </div>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <div className="page-heading">
          <div>
            <div className="page-title">Projects</div>
            <div className="muted">
              {hasLoaded ? `${projects.length} active ${projects.length === 1 ? "project" : "projects"}` : "Loading local projects"}
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
