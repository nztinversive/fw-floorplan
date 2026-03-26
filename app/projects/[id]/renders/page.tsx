"use client"

import Link from "next/link"
import { useParams } from "next/navigation"

export default function ProjectRendersPage() {
  const params = useParams<{ id: string }>()
  const projectId = Array.isArray(params?.id) ? params.id[0] : params?.id

  return (
    <main className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-title">Renders</div>
          <div className="muted">Rendering controls and outputs will land in the next phase.</div>
        </div>
        <Link href={`/projects/${projectId}`} className="button-ghost">
          Back to overview
        </Link>
      </div>

      <div className="empty-state">
        <div className="section-title">Phase 2 coming soon</div>
        <div className="muted">
          This page is reserved for render presets, generation jobs, and result galleries.
        </div>
      </div>
    </main>
  )
}
