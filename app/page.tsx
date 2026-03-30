"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useQuery } from "convex/react"
import { FolderPlus, Search, X, Upload, PenTool, Image as ImageIcon, ArrowRight } from "lucide-react"

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

function HeroIllustration() {
  return (
    <svg viewBox="0 0 320 240" fill="none" className="hero-illustration" aria-hidden="true">
      {/* Floor plan outline */}
      <rect x="40" y="60" width="240" height="140" rx="4" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
      {/* Interior walls */}
      <line x1="160" y1="60" x2="160" y2="140" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      <line x1="160" y1="140" x2="280" y2="140" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      <line x1="40" y1="140" x2="120" y2="140" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      {/* Door arcs */}
      <path d="M120 140 Q120 120 140 120" stroke="rgba(212,168,75,0.5)" strokeWidth="1" fill="none" strokeDasharray="3 3" />
      <path d="M160 120 Q180 120 180 140" stroke="rgba(212,168,75,0.5)" strokeWidth="1" fill="none" strokeDasharray="3 3" />
      {/* Room labels */}
      <text x="90" y="110" fill="rgba(255,255,255,0.35)" fontSize="10" textAnchor="middle" fontFamily="inherit">Living</text>
      <text x="220" y="110" fill="rgba(255,255,255,0.35)" fontSize="10" textAnchor="middle" fontFamily="inherit">Kitchen</text>
      <text x="80" y="170" fill="rgba(255,255,255,0.35)" fontSize="9" textAnchor="middle" fontFamily="inherit">Bedroom</text>
      <text x="220" y="170" fill="rgba(255,255,255,0.35)" fontSize="9" textAnchor="middle" fontFamily="inherit">Bath</text>
      {/* Dimension lines */}
      <line x1="40" y1="48" x2="280" y2="48" stroke="rgba(212,168,75,0.35)" strokeWidth="0.75" />
      <line x1="40" y1="45" x2="40" y2="51" stroke="rgba(212,168,75,0.35)" strokeWidth="0.75" />
      <line x1="280" y1="45" x2="280" y2="51" stroke="rgba(212,168,75,0.35)" strokeWidth="0.75" />
      <text x="160" y="44" fill="rgba(212,168,75,0.45)" fontSize="8" textAnchor="middle" fontFamily="inherit">24&apos;-0&quot;</text>
      {/* Decorative dots at corners */}
      <circle cx="40" cy="60" r="2.5" fill="rgba(212,168,75,0.4)" />
      <circle cx="280" cy="60" r="2.5" fill="rgba(212,168,75,0.4)" />
      <circle cx="40" cy="200" r="2.5" fill="rgba(212,168,75,0.4)" />
      <circle cx="280" cy="200" r="2.5" fill="rgba(212,168,75,0.4)" />
    </svg>
  )
}

const STEPS = [
  {
    icon: Upload,
    title: "Upload",
    description: "Drop a floor plan image or PDF. We extract walls and rooms automatically.",
  },
  {
    icon: PenTool,
    title: "Edit",
    description: "Refine geometry, label rooms, add furniture. Professional editor with dark mode.",
  },
  {
    icon: ImageIcon,
    title: "Render",
    description: "Generate photorealistic exterior renders in Craftsman, Farmhouse, or Contemporary styles.",
  },
]

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
  const showSteps = !heroDismissed && projects.length === 0

  return (
    <main className="page-shell">
      {/* ── Hero ── */}
      {!heroDismissed ? (
        <section className="hero-panel hero-panel-v2">
          <button type="button" className="hero-dismiss" onClick={dismissHero} aria-label="Dismiss" style={{ position: "absolute", top: "1rem", right: "1rem" }}>
            <X size={14} />
          </button>
          <div className="hero-content">
            <div className="hero-eyebrow">Floor Plan Studio</div>
            <div className="hero-title">Plan with precision.<br />Prepare for renders.</div>
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
          </div>
          <div className="hero-visual">
            <HeroIllustration />
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

      {/* ── How it works ── */}
      {showSteps && (
        <section className="steps-section">
          <div className="steps-header">
            <div className="section-title">How it works</div>
            <div className="muted">Three steps from plan to render</div>
          </div>
          <div className="steps-grid">
            {STEPS.map((step, i) => (
              <div key={step.title} className="step-card">
                <div className="step-number">{i + 1}</div>
                <div className="step-icon">
                  <step.icon size={24} />
                </div>
                <div className="step-title">{step.title}</div>
                <div className="step-description">{step.description}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Projects ── */}
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
          <div className="empty-state empty-state-v2">
            <div className="empty-state-icon">
              <FolderPlus size={36} />
            </div>
            <div className="section-title">No projects yet</div>
            <div className="muted" style={{ maxWidth: "28rem" }}>
              Create your first project to upload a floor plan, refine room geometry in the editor, and generate photorealistic exterior renders.
            </div>
            <Link href="/projects/new" className="button">
              <FolderPlus size={18} />
              Create your first project
            </Link>
          </div>
        )}
      </section>

      {/* ── Footer ── */}
      <footer className="site-footer">
        <div className="footer-brand">
          <div className="brand-mark" style={{ width: "2rem", height: "2rem", fontSize: "0.85rem" }}>FW</div>
          <span className="footer-brand-text">Fading West &middot; Floor Plan Studio</span>
        </div>
        <div className="footer-links">
          <Link href="/projects/new">New Project</Link>
          <span className="footer-sep">&middot;</span>
          <span className="footer-copy">&copy; {new Date().getFullYear()} Fading West</span>
        </div>
      </footer>
    </main>
  )
}
