"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import {
  CircleHelp,
  FolderOpen,
  Home,
  Image as ImageIcon,
  PenTool,
  Search,
  Sparkles
} from "lucide-react"

import { api } from "@/convex/_generated/api"

type Command = {
  id: string
  label: string
  group: "Navigate" | "Create" | "Project" | "Help"
  href: string
  icon: typeof Home
  keywords?: string
}

export default function StudioCommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const router = useRouter()
  const projectsQuery = useQuery(api.projects.list, open ? {} : "skip")

  useEffect(() => {
    function handler(event: KeyboardEvent) {
      const isMod = event.metaKey || event.ctrlKey
      if (isMod && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((o) => !o)
        return
      }
      if (event.key === "Escape" && open) {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIdx(0)
      const t = window.setTimeout(() => inputRef.current?.focus(), 30)
      return () => window.clearTimeout(t)
    }
  }, [open])

  const baseCommands = useMemo<Command[]>(
    () => [
      {
        id: "home",
        label: "Go to projects",
        group: "Navigate",
        href: "/",
        icon: Home,
        keywords: "dashboard projects home"
      },
      {
        id: "generate",
        label: "New from prompt",
        group: "Create",
        href: "/generate",
        icon: Sparkles,
        keywords: "generate ai prompt new project create"
      },
      {
        id: "new",
        label: "New blank project",
        group: "Create",
        href: "/projects/new",
        icon: FolderOpen,
        keywords: "new project blank canvas"
      },
      {
        id: "help",
        label: "Help & shortcuts",
        group: "Help",
        href: "/help",
        icon: CircleHelp,
        keywords: "help docs shortcuts"
      }
    ],
    []
  )

  const projectCommands = useMemo<Command[]>(() => {
    const list = projectsQuery ?? []
    return list.flatMap((p) => [
      {
        id: `open-${p._id}`,
        label: `Open ${p.name}`,
        group: "Project" as const,
        href: `/projects/${p._id}`,
        icon: FolderOpen,
        keywords: `${p.name} ${p.address ?? ""} ${p.clientName ?? ""}`
      },
      {
        id: `edit-${p._id}`,
        label: `Edit ${p.name}`,
        group: "Project" as const,
        href: `/projects/${p._id}/edit`,
        icon: PenTool,
        keywords: `edit ${p.name}`
      },
      {
        id: `renders-${p._id}`,
        label: `Renders for ${p.name}`,
        group: "Project" as const,
        href: `/projects/${p._id}/renders`,
        icon: ImageIcon,
        keywords: `renders visualize ${p.name}`
      }
    ])
  }, [projectsQuery])

  const allCommands = useMemo(
    () => [...baseCommands, ...projectCommands],
    [baseCommands, projectCommands]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allCommands
    return allCommands.filter((c) =>
      [c.label, c.group, c.keywords ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
  }, [allCommands, query])

  const grouped = useMemo(() => {
    const map = new Map<Command["group"], Command[]>()
    for (const cmd of filtered) {
      const arr = map.get(cmd.group) ?? []
      arr.push(cmd)
      map.set(cmd.group, arr)
    }
    return Array.from(map.entries())
  }, [filtered])

  function run(cmd: Command) {
    router.push(cmd.href)
    setOpen(false)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIdx((i) => Math.max(0, i - 1))
    } else if (event.key === "Enter") {
      event.preventDefault()
      const cmd = filtered[activeIdx]
      if (cmd) run(cmd)
    }
  }

  if (!open) return null

  let runningIdx = -1
  return (
    <div
      className="studio-cmdk-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="studio-cmdk" role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          value={query}
          placeholder="Search projects, jump to a screen, run a command…"
          onChange={(e) => {
            setQuery(e.target.value)
            setActiveIdx(0)
          }}
          onKeyDown={onKeyDown}
        />
        <div className="studio-cmdk-list">
          {grouped.length === 0 && (
            <div className="studio-cmdk-empty">No results for “{query}”.</div>
          )}
          {grouped.map(([group, items]) => (
            <div key={group}>
              <div className="studio-cmdk-section">{group}</div>
              {items.map((cmd) => {
                runningIdx += 1
                const itemIdx = runningIdx
                const isActive = itemIdx === activeIdx
                const Icon = cmd.icon
                return (
                  <div
                    key={cmd.id}
                    className={`studio-cmdk-item${isActive ? " is-active" : ""}`}
                    onMouseEnter={() => setActiveIdx(itemIdx)}
                    onClick={() => run(cmd)}
                    role="option"
                    aria-selected={isActive}
                  >
                    <span className="ic">
                      <Icon size={14} />
                    </span>
                    <span className="grow">{cmd.label}</span>
                    <span className="grp">{cmd.group}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CommandPaletteHotkey() {
  // Convenience: ensures Search-pill in topbar can open palette via custom event
  useEffect(() => {
    function open() {
      const e = new KeyboardEvent("keydown", { key: "k", metaKey: true })
      window.dispatchEvent(e)
    }
    window.addEventListener("studio:open-cmdk", open)
    return () => window.removeEventListener("studio:open-cmdk", open)
  }, [])
  return null
}
