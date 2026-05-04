"use client"

import type { FormEvent, ReactNode } from "react"
import { useMemo, useState } from "react"
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react"
import { Authenticated, AuthLoading, ConvexReactClient, Unauthenticated } from "convex/react"
import { usePathname } from "next/navigation"
import { ToastProvider } from "@/components/Toast"

type ProvidersProps = {
  children: ReactNode
}

function AuthScreen() {
  const { signIn } = useAuthActions()
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const formData = new FormData(event.currentTarget)
      formData.set("flow", flow)
      await signIn("password", formData)
    } catch (error) {
      console.error("Unable to authenticate.", error)
      setError(flow === "signIn" ? "Unable to sign in with those credentials." : "Unable to create that account.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-panel is-compact">
        <div>
          <div className="hero-title">Floor Plan Studio</div>
          <div className="hero-copy">Sign in to manage projects, floor plans, renders, and shared access.</div>
        </div>
      </section>

      <form className="panel auth-panel" onSubmit={handleSubmit}>
        <div className="panel-header">
          <div>
            <div className="section-title">{flow === "signIn" ? "Sign in" : "Create account"}</div>
            <div className="muted">Use your work email and password to continue.</div>
          </div>
        </div>

        <div className="form-grid">
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Email</span>
            <input className="field-input" name="email" type="email" autoComplete="email" required />
          </label>
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Password</span>
            <input
              className="field-input"
              name="password"
              type="password"
              autoComplete={flow === "signIn" ? "current-password" : "new-password"}
              minLength={8}
              required
            />
          </label>
        </div>

        {error ? <div className="info-banner auth-error">{error}</div> : null}

        <div className="button-row" style={{ marginTop: "1rem" }}>
          <button type="submit" className="button" disabled={isSubmitting}>
            {isSubmitting ? "Working..." : flow === "signIn" ? "Sign in" : "Create account"}
          </button>
          <button
            type="button"
            className="button-ghost"
            onClick={() => {
              setFlow((current) => (current === "signIn" ? "signUp" : "signIn"))
              setError(null)
            }}
            disabled={isSubmitting}
          >
            {flow === "signIn" ? "Create account" : "Sign in instead"}
          </button>
        </div>
      </form>
    </main>
  )
}

export default function Providers({ children }: ProvidersProps) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  const pathname = usePathname()
  const isPublicShareRoute = /^\/projects\/[^/]+\/share\/?$/.test(pathname ?? "")
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
    <ConvexAuthProvider client={convex}>
      <ToastProvider>
        <AuthLoading>
          <main className="page-shell">
            <div className="empty-state">
              <div className="section-title">Checking session...</div>
            </div>
          </main>
        </AuthLoading>
        <Unauthenticated>
          {isPublicShareRoute ? children : <AuthScreen />}
        </Unauthenticated>
        <Authenticated>{children}</Authenticated>
      </ToastProvider>
    </ConvexAuthProvider>
  )
}
