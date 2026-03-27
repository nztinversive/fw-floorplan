"use client"

import type { ReactNode } from "react"
import { useMemo } from "react"
import { ConvexProvider as ConvexReactProvider, ConvexReactClient } from "convex/react"
import { ToastProvider } from "@/components/Toast"

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
      <ToastProvider>
        <main className="page-shell">
          <div className="empty-state">
            <div className="section-title">Configuration required</div>
            <div className="muted">Set `NEXT_PUBLIC_CONVEX_URL` to connect the app to Convex.</div>
          </div>
        </main>
      </ToastProvider>
    )
  }

  return (
    <ConvexReactProvider client={convex}>
      <ToastProvider>{children}</ToastProvider>
    </ConvexReactProvider>
  )
}
