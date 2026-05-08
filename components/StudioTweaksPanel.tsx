"use client"

import { useEffect, useState } from "react"
import { Settings, X } from "lucide-react"

type Theme = "studio" | "atelier" | "mono" | "blueprint"
type Density = "compact" | "regular" | "comfy"
type Layout = "classic" | "focus"

type TweakState = {
  theme: Theme
  density: Density
  dark: boolean
  layout: Layout
}

const STORAGE_KEY = "studio-tweaks"

const DEFAULTS: TweakState = {
  theme: "studio",
  density: "regular",
  dark: false,
  layout: "classic"
}

function applyToRoot(state: TweakState) {
  const html = document.documentElement
  html.setAttribute("data-studio-theme", state.theme)
  html.setAttribute("data-studio-density", state.density)
  html.setAttribute("data-studio-dark", state.dark ? "true" : "false")
  html.setAttribute("data-studio-layout", state.layout)
}

function loadState(): TweakState {
  if (typeof window === "undefined") return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<TweakState>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

export default function StudioTweaksPanel() {
  const [state, setState] = useState<TweakState>(DEFAULTS)
  const [open, setOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const initial = loadState()
    setState(initial)
    applyToRoot(initial)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    applyToRoot(state)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [state, hydrated])

  function update<K extends keyof TweakState>(key: K, value: TweakState[K]) {
    setState((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <>
      {open && (
        <div
          className="studio-tweaks-panel"
          role="dialog"
          aria-label="Studio appearance tweaks"
        >
          <div className="studio-tweaks-head">
            <b>Tweaks</b>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close tweaks"
            >
              <X size={14} />
            </button>
          </div>
          <div className="studio-tweaks-body">
            <div className="studio-tweaks-section">Aesthetic</div>

            <div className="studio-tweaks-row">
              <div className="lbl">
                <span>Theme</span>
                <span className="studio-mono studio-dim">{state.theme}</span>
              </div>
              <div className="studio-seg">
                {(["studio", "atelier", "mono", "blueprint"] as Theme[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={state.theme === v ? "is-active" : ""}
                    onClick={() => update("theme", v)}
                  >
                    {v[0].toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="studio-tweaks-row">
              <div className="lbl">
                <span>Layout</span>
                <span className="studio-mono studio-dim">{state.layout}</span>
              </div>
              <div className="studio-seg">
                {(["classic", "focus"] as Layout[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={state.layout === v ? "is-active" : ""}
                    onClick={() => update("layout", v)}
                  >
                    {v[0].toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="studio-tweaks-row"
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
            >
              <span style={{ color: "var(--studio-ink-2)", fontWeight: 500 }}>
                Dark mode
              </span>
              <button
                type="button"
                className="studio-toggle"
                data-on={state.dark ? "1" : "0"}
                onClick={() => update("dark", !state.dark)}
                aria-pressed={state.dark}
                aria-label="Toggle dark mode"
              >
                <i />
              </button>
            </div>

            <div className="studio-tweaks-section">Density</div>
            <div className="studio-tweaks-row">
              <div className="studio-seg">
                {(["compact", "regular", "comfy"] as Density[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={state.density === v ? "is-active" : ""}
                    onClick={() => update("density", v)}
                  >
                    {v[0].toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        className="studio-tweaks-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle appearance tweaks"
        aria-expanded={open}
      >
        <Settings size={18} />
      </button>
    </>
  )
}
