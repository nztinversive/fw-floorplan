"use client"

import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { useQuery } from "convex/react"
import { DraftingCompass, Eye, Image as ImageIcon, Link2 } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"

export default function HeaderNav() {
  const pathname = usePathname()
  const params = useParams<{ id: string }>()
  const projectId = (Array.isArray(params?.id) ? params.id[0] : params?.id) as
    | Id<"projects">
    | undefined

  const isProjectPage = pathname?.startsWith("/projects/") && projectId
  const project = useQuery(
    api.projects.get,
    isProjectPage ? { id: projectId! } : "skip"
  )

  if (!isProjectPage || !project) return null

  const base = `/projects/${projectId}`
  const isOverview = pathname === base
  const isEdit = pathname?.startsWith(`${base}/edit`)
  const isRenders = pathname?.startsWith(`${base}/renders`)
  const isShare = pathname?.startsWith(`${base}/share`)

  return (
    <nav className="header-nav-v2">
      <span className="header-nav-project">{project.name}</span>
      <span className="header-nav-divider" />
      <Link href={base} className={`header-nav-link${isOverview ? " is-active" : ""}`}>
        <Eye size={14} />
        Overview
      </Link>
      <Link href={`${base}/edit`} className={`header-nav-link${isEdit ? " is-active" : ""}`}>
        <DraftingCompass size={14} />
        Editor
      </Link>
      <Link href={`${base}/renders`} className={`header-nav-link${isRenders ? " is-active" : ""}`}>
        <ImageIcon size={14} />
        Renders
      </Link>
      <Link href={`${base}/share`} className={`header-nav-link${isShare ? " is-active" : ""}`}>
        <Link2 size={14} />
        Share
      </Link>
    </nav>
  )
}
