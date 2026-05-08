"use client"

import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { useAuthActions } from "@convex-dev/auth/react"
import { useConvexAuth, useQuery } from "convex/react"
import { Check, ChevronLeft, CircleHelp, Search } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

type StepState = "done" | "current" | "future"

const STEPS = [
  { id: "overview", num: "01", label: "Describe" },
  { id: "edit", num: "02", label: "Refine" },
  { id: "renders", num: "03", label: "Visualize" },
  { id: "share", num: "04", label: "Share" }
] as const

function Step({
  num,
  label,
  state,
  href
}: {
  num: string
  label: string
  state: StepState
  href: string
}) {
  const cls = ["studio-step"]
  if (state === "current") cls.push("is-current")
  if (state === "done") cls.push("is-done")

  return (
    <Link href={href} className={cls.join(" ")}>
      <span className="step-num">
        {state === "done" ? <Check size={11} strokeWidth={2.6} /> : num}
      </span>
      <span>{label}</span>
    </Link>
  )
}

export default function HeaderNav() {
  const { signOut } = useAuthActions()
  const { isAuthenticated } = useConvexAuth()
  const pathname = usePathname()
  const params = useParams<{ id: string }>()
  const projectId = (Array.isArray(params?.id) ? params.id[0] : params?.id) as
    | Id<"projects">
    | undefined

  const isProjectPage = pathname?.startsWith("/projects/") && projectId
  const isHelp = pathname === "/help"
  const isShare = pathname?.startsWith(`/projects/${projectId}/share`)
  function openCommandPalette() {
    const evt = new KeyboardEvent("keydown", { key: "k", metaKey: true })
    window.dispatchEvent(evt)
  }
  const project = useQuery(
    api.projects.get,
    isProjectPage && (isAuthenticated || !isShare) ? { id: projectId! } : "skip"
  )

  if (isShare && !isAuthenticated) {
    return (
      <nav className="header-nav-v2">
        <span className="header-nav-project">Shared presentation</span>
      </nav>
    )
  }

  if (!isProjectPage || !project) {
    return (
      <nav className="header-nav-v2">
        <button
          type="button"
          className="studio-searchpill"
          aria-label="Search"
          onClick={openCommandPalette}
        >
          <Search size={14} />
          <span>Search</span>
          <span className="studio-kbd">⌘K</span>
        </button>
        <Link href="/help" className={`header-nav-link${isHelp ? " is-active" : ""}`}>
          <CircleHelp size={14} />
          Help
        </Link>
        <button
          type="button"
          className="header-nav-link header-nav-button"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
        <div className="studio-avatar" aria-hidden>
          FW
        </div>
      </nav>
    )
  }

  const base = `/projects/${projectId}`
  const isOverview = pathname === base
  const isEdit = pathname?.startsWith(`${base}/edit`)
  const isRenders = pathname?.startsWith(`${base}/renders`)
  const isShareActive = pathname?.startsWith(`${base}/share`)
  const stepIdx = isShareActive
    ? 3
    : isRenders
      ? 2
      : isEdit
        ? 1
        : isOverview
          ? 0
          : 0

  const stepHref = (id: string) => {
    if (id === "overview") return base
    return `${base}/${id}`
  }

  return (
    <nav
      className="header-nav-v2"
      style={{ gap: 16, justifyContent: "center", flexWrap: "wrap" }}
    >
      <Link
        href="/"
        className="studio-btn is-ghost is-sm"
        style={{ textDecoration: "none" }}
      >
        <ChevronLeft size={14} />
        Projects
      </Link>
      <span className="studio-dim" aria-hidden>
        /
      </span>
      <span style={{ fontWeight: 500, color: "var(--studio-ink)" }}>{project.name}</span>
      <div className="studio-steps" role="tablist" aria-label="Project pipeline">
        {STEPS.map((s, i) => {
          const state: StepState =
            i < stepIdx ? "done" : i === stepIdx ? "current" : "future"
          return (
            <Step
              key={s.id}
              num={s.num}
              label={s.label}
              state={state}
              href={stepHref(s.id)}
            />
          )
        })}
      </div>
      <span className="studio-dim" aria-hidden style={{ marginLeft: "auto" }} />
      <button
        type="button"
        className="studio-searchpill"
        aria-label="Search"
        onClick={openCommandPalette}
      >
        <Search size={14} />
        <span>Search</span>
        <span className="studio-kbd">⌘K</span>
      </button>
      <Link href="/help" className={`header-nav-link${isHelp ? " is-active" : ""}`}>
        <CircleHelp size={14} />
        Help
      </Link>
      <button
        type="button"
        className="header-nav-link header-nav-button"
        onClick={() => void signOut()}
      >
        Sign out
      </button>
      <div className="studio-avatar" aria-hidden>
        FW
      </div>
    </nav>
  )
}
