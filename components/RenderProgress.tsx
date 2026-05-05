"use client"

import { useEffect, useState } from "react"

const STEPS = [
  { label: "Analyzing floor plan geometry", duration: 3000 },
  { label: "Composing architectural description", duration: 4000 },
  { label: "Generating exterior image", duration: 18000 },
  { label: "Storing render", duration: 3000 },
  { label: "Running image-based visual QA", duration: 12000 },
]

const TOTAL_DURATION = STEPS.reduce((sum, s) => sum + s.duration, 0)

export default function RenderProgress({ isGenerating }: { isGenerating: boolean }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!isGenerating) {
      setElapsed(0)
      return
    }

    const start = Date.now()
    const interval = setInterval(() => {
      setElapsed(Date.now() - start)
    }, 200)

    return () => clearInterval(interval)
  }, [isGenerating])

  if (!isGenerating) return null

  let accumulated = 0
  let activeIndex = 0
  for (let i = 0; i < STEPS.length; i++) {
    if (elapsed >= accumulated + STEPS[i].duration) {
      accumulated += STEPS[i].duration
      activeIndex = Math.min(i + 1, STEPS.length - 1)
    } else {
      activeIndex = i
      break
    }
  }

  const progress = Math.min((elapsed / TOTAL_DURATION) * 100, 95)

  return (
    <div className="render-progress">
      <div className="render-progress-bar">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="render-progress-steps">
        {STEPS.map((step, i) => {
          let state: "pending" | "active" | "done" = "pending"
          if (i < activeIndex) state = "done"
          else if (i === activeIndex) state = "active"

          return (
            <div
              key={step.label}
              className={`render-progress-step${state === "active" ? " is-active" : ""}${state === "done" ? " is-done" : ""}`}
            >
              <span className="render-progress-dot" />
              <span>{step.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
