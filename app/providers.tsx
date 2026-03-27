"use client"

import type { ReactNode } from "react"
import { useMemo } from "react"
import { ConvexProvider as ConvexReactProvider, ConvexReactClient } from "convex/react"

type ProvidersProps = {
  children: ReactNode
}

export default function Providers({ children }: ProvidersProps) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  const convex = useMemo(
    () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
    [convexUrl]
  )

  if (!convex) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <div className="section-title">Configuration required</div>
          <div className="muted">Set `NEXT_PUBLIC_CONVEX_URL` to connect the app to Convex.</div>
        </div>
      </main>
    )
  }

  return <ConvexReactProvider client={convex}>{children}</ConvexReactProvider>
}
