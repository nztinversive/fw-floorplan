"use client"

import type { ReactNode } from "react"
import { useMemo } from "react"
import { ConvexProvider as ConvexReactProvider, ConvexReactClient } from "convex/react"

type ProvidersProps = {
  children: ReactNode
}

export default function Providers({ children }: ProvidersProps) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured")
  }

  const convex = useMemo(() => new ConvexReactClient(convexUrl), [convexUrl])

  return <ConvexReactProvider client={convex}>{children}</ConvexReactProvider>
}
