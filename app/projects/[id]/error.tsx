"use client"

import Link from "next/link"
import { AlertTriangle, RefreshCw } from "lucide-react"

type ProjectErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ProjectError({ error, reset }: ProjectErrorProps) {
  const message = error.message || "This project could not be opened."
  const isAccessError =
    message.toLowerCase().includes("unauthorized") ||
    message.toLowerCase().includes("not authenticated")

  return (
    <main className="page-shell">
      <section className="empty-state">
        <AlertTriangle size={32} />
        <div className="section-title">
          {isAccessError ? "Project access required" : "Unable to open project"}
        </div>
        <div className="muted" style={{ maxWidth: "34rem" }}>
          {isAccessError
            ? "This project is private. Ask the project owner to invite this account, or sign in with an account that already has access."
            : "The project could not be loaded right now. Try again, or return to the dashboard."}
        </div>
        <div className="button-row" style={{ justifyContent: "center" }}>
          <button type="button" className="button-secondary" onClick={reset}>
            <RefreshCw size={16} />
            Try again
          </button>
          <Link href="/" className="button-ghost">
            Return to dashboard
          </Link>
        </div>
      </section>
    </main>
  )
}
