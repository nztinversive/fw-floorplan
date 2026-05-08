"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQuery } from "convex/react"
import { FolderPlus, Search, Sparkles, Upload } from "lucide-react"

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

const TABS = [
  { id: "recent", label: "Recent" },
  { id: "new", label: "New" },
  { id: "withPlans", label: "With plans" },
  { id: "needsPlan", label: "Needs plan" }
] as const

type TabId = (typeof TABS)[number]["id"]

export default function DashboardPage() {
  const projectsQuery = useQuery(api.projects.list)
  const hasLoaded = projectsQuery !== undefined

  const projects = useMemo<ProjectSummary[]>(
    () =>
      (projectsQuery ?? []).map((project) => {
        const projectWithThumbnail = project as typeof project &
          ProjectListItemWithThumbnailUrl
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
  const [tab, setTab] = useState<TabId>("recent")
  const [sortBy, setSortBy] = useState<"updated" | "created" | "name">("updated")
  const activeTabLabel = TABS.find((item) => item.id === tab)?.label ?? "Recent"

  const filteredProjects = useMemo(() => {
    let result = projects
    if (tab === "new") {
      result = result.filter((project) => Date.now() - project.createdAt < 30 * 86400000)
    } else if (tab === "withPlans") {
      result = result.filter((project) => project.floorCount > 0)
    } else if (tab === "needsPlan") {
      result = result.filter((project) => project.floorCount === 0)
    }

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
  }, [projects, searchQuery, sortBy, tab])

  const totalFloors = projects.reduce((sum, p) => sum + (p.floorCount ?? 0), 0)
  const avgUpdate = useMemo(() => {
    if (projects.length === 0) return "—"
    const recent = projects
      .map((p) => p.updatedAt)
      .sort((a, b) => b - a)
      .slice(0, 3)
    if (recent.length === 0) return "—"
    const ms = Date.now() - recent[0]
    const days = Math.floor(ms / 86400000)
    if (days < 1) return "Today"
    if (days === 1) return "Yesterday"
    if (days < 7) return `${days}d ago`
    return `${Math.floor(days / 7)}w ago`
  }, [projects])

  return (
    <main className="studio-page">
      <div className="studio-page-inner">
        {/* ── Hero ── */}
        <section className="studio-hero">
          <div>
            <div className="studio-hero-eyebrow">Floor Plan Studio</div>
            <h1>
              Your <em>projects</em>
            </h1>
            <p>From a napkin sketch to a finished render — one workspace.</p>
          </div>
          <div className="studio-hero-actions">
            <Link href="/projects/new" className="studio-btn is-ghost">
              <Upload size={14} />
              Import plan
            </Link>
            <Link href="/projects/new" className="studio-btn is-ghost">
              <FolderPlus size={14} />
              Blank canvas
            </Link>
            <Link href="/generate" className="studio-btn is-accent">
              <Sparkles size={14} />
              New from prompt
            </Link>
          </div>
        </section>

        {/* ── KPIs ── */}
        <section className="studio-kpi-row" aria-label="Project metrics">
          <div className="studio-kpi">
            <div className="studio-kpi-lbl">Active projects</div>
            <div className="studio-kpi-val">{hasLoaded ? projects.length : "—"}</div>
            <div className="studio-kpi-meta">
              {hasLoaded
                ? `${totalFloors} floor${totalFloors === 1 ? "" : "s"} across plans`
                : "Loading…"}
            </div>
          </div>
          <div className="studio-kpi">
            <div className="studio-kpi-lbl">Plans this month</div>
            <div className="studio-kpi-val">
              {hasLoaded
                ? projects.filter(
                    (p) => Date.now() - p.createdAt < 30 * 86400000
                  ).length
                : "—"}
            </div>
            <div className="studio-kpi-meta">New since 30 days</div>
          </div>
          <div className="studio-kpi">
            <div className="studio-kpi-lbl">Saved floors</div>
            <div className="studio-kpi-val">{hasLoaded ? totalFloors : "—"}</div>
            <div className="studio-kpi-meta">Editable plan levels</div>
          </div>
          <div className="studio-kpi">
            <div className="studio-kpi-lbl">Last update</div>
            <div className="studio-kpi-val is-mono">{avgUpdate}</div>
            <div className="studio-kpi-meta">Most recent edit</div>
          </div>
        </section>

        {/* ── Recent plans ── */}
        <div className="studio-section-h">
          <h2>
            Recent <em>plans</em>
          </h2>
          <div className="studio-tab-row" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? "is-active" : ""}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {hasLoaded && projects.length > 0 && (
          <div className="studio-search-row">
            <div className="studio-search">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search projects by name, address, or client…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="studio-sort"
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "updated" | "created" | "name")
              }
              aria-label="Sort projects"
            >
              <option value="updated">Recently updated</option>
              <option value="created">Recently created</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
        )}

        {!hasLoaded ? (
          <div className="studio-proj-grid">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : projects.length > 0 ? (
          filteredProjects.length > 0 ? (
            <div className="studio-proj-grid">
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <div className="studio-empty">
              <h3>
                {searchQuery.trim() ? (
                  <>
                    Nothing matches <em>“{searchQuery}”</em>
                  </>
                ) : (
                  <>
                    No <em>{activeTabLabel.toLowerCase()}</em> projects
                  </>
                )}
              </h3>
              <p>
                {searchQuery.trim()
                  ? "Try a different search term or clear the filter."
                  : "Switch filters or create another project to fill this view."}
              </p>
            </div>
          )
        ) : (
          <div className="studio-empty">
            <h3>
              No projects <em>yet</em>
            </h3>
            <p>
              Create your first project to upload a floor plan, refine geometry, and
              generate photorealistic exterior renders.
            </p>
            <Link href="/generate" className="studio-btn is-accent">
              <Sparkles size={14} />
              New from prompt
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}

function SkeletonCard() {
  return (
    <div className="studio-proj-card" aria-hidden>
      <div className="studio-skeleton" style={{ height: 180, borderRadius: 0 }} />
      <div className="studio-proj-body">
        <div className="studio-skeleton" style={{ height: 16, width: "60%" }} />
        <div
          className="studio-skeleton"
          style={{ height: 12, width: "40%", marginTop: 8 }}
        />
      </div>
    </div>
  )
}
