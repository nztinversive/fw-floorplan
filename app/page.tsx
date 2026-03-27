"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useQuery } from "convex/react"
import { FolderPlus, Search, X } from "lucide-react"

import ProjectCard from "@/components/ProjectCard"
import { SkeletonProjectCard } from "@/components/Skeleton"
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

const HERO_DISMISSED_KEY = "fw-hero-dismissed"

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

  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"updated" | "created" | "name">("updated")
  const [heroDismissed, setHeroDismissed] = useState(false)

  useEffect(() => {
    setHeroDismissed(localStorage.getItem(HERO_DISMISSED_KEY) === "1")
  }, [])

  function dismissHero() {
    setHeroDismissed(true)
    localStorage.setItem(HERO_DISMISSED_KEY, "1")
  }

  const filteredProjects = useMemo(() => {
    let result = projects

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.address && p.address.toLowerCase().includes(q)) ||
          (p.clientName && p.clientName.toLowerCase().includes(q))
      )
    }

    return [...result].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name)
      if (sortBy === "created") return b.createdAt - a.createdAt
      return b.updatedAt - a.updatedAt
    })
  }, [projects, searchQuery, sortBy])

  const showCompactHero = heroDismissed && projects.length > 0

  return (
    <main className="page-shell">
      {!heroDismissed ? (
        <section className="hero-panel" style={{ position: "relative" }}>
          <button type="button" className="hero-dismiss" onClick={dismissHero} aria-label="Dismiss" style={{ position: "absolute", top: "1rem", right: "1rem" }}>
            <X size={14} />
          </button>
          <div className="hero-title">Plan with precision. Prepare for renders.</div>
          <div className="hero-copy">
            Upload floor plans, trace walls, clean up room geometry, and generate
            photorealistic exterior renders — all in one place.
          </div>
          <div className="hero-actions">
            <Link href="/projects/new" className="button">
              <FolderPlus size={18} />
              New project
            </Link>
          </div>
        </section>
      ) : showCompactHero ? (
        <section className="hero-panel is-compact">
          <div className="hero-title">Floor Plan Studio</div>
          <Link href="/projects/new" className="button">
            <FolderPlus size={18} />
            New project
          </Link>
        </section>
      ) : null}

      <section style={{ marginTop: "1.5rem" }}>
        <div className="page-heading">
          <div>
            <div className="page-title">Projects</div>
            <div className="muted">
              {hasLoaded ? `${projects.length} active ${projects.length === 1 ? "project" : "projects"}` : "Loading projects..."}
            </div>
          </div>
          <Link href="/projects/new" className="button-secondary">
            <FolderPlus size={16} />
            Create project
          </Link>
        </div>

        {hasLoaded && projects.length > 0 && (
          <div className="search-sort-row" style={{ marginBottom: "1rem" }}>
            <div className="search-bar" style={{ flex: 1, maxWidth: "400px" }}>
              <Search size={16} className="search-bar-icon" />
              <input
                type="text"
                className="search-bar-input"
                placeholder="Search projects by name, address, or client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "updated" | "created" | "name")}
            >
              <option value="updated">Recently updated</option>
              <option value="created">Recently created</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
        )}

        {!hasLoaded ? (
          <div className="project-grid">
            <SkeletonProjectCard />
            <SkeletonProjectCard />
            <SkeletonProjectCard />
          </div>
        ) : projects.length > 0 ? (
          filteredProjects.length > 0 ? (
            <div className="project-grid">
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="section-title">No matching projects</div>
              <div className="muted">
                No projects match &ldquo;{searchQuery}&rdquo;. Try a different search term.
              </div>
            </div>
          )
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
