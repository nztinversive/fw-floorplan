"use client"

import type { ReactNode } from "react"
import { useMemo } from "react"
import { ConvexProvider as ConvexReactProvider, ConvexReactClient } from "convex/react"

type ProvidersProps = {
  children: ReactNode
}

export default function Providers({ children }: ProvidersProps) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  const convex = useMemo(() => {
    if (!convexUrl) {
      return null
    }

    return new ConvexReactClient(convexUrl)
  }, [convexUrl])

  if (!convex) {
    return <>{children}</>
  }

  return <ConvexReactProvider client={convex}>{children}</ConvexReactProvider>
}
