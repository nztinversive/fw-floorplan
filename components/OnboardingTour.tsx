"use client"

import type { CSSProperties } from "react"
import { useEffect, useMemo, useState } from "react"

const STORAGE_KEY = "fw-onboarding-complete"
const CARD_WIDTH = 360
const CARD_HEIGHT = 260
const VIEWPORT_PADDING = 16
const TARGET_PADDING = 10
const CARD_GAP = 18

type Step = {
  title: string
  description: string
  target?: string | string[]
}

type HighlightRect = {
  top: number
  left: number
  width: number
  height: number
}

const STEPS: Step[] = [
  {
    title: "Welcome to Floor Plan Studio",
    description:
      "This quick tour covers the main drafting workflow so you can move from tracing to export without hunting through the editor.",
  },
  {
    title: "Draw Walls",
    description:
      "Pick the Wall tool, click to place a start point, then click again to finish each segment. New walls keep chaining from the last endpoint until you press Esc to return to Select.",
    target: '[data-onboarding="tool-wall"]',
  },
  {
    title: "Rooms Auto-Detect",
    description:
      "Closed wall loops generate rooms automatically, and you can also use the Room tool for manual polygons when you need to refine or add a space yourself.",
    target: '[data-onboarding="tool-room"]',
  },
  {
    title: "Upload a Plan to Trace",
    description:
      "Upload or replace a source image to trace over an existing plan. Once it is attached you can toggle the overlay and adjust opacity while drafting.",
    target: '[data-onboarding="upload-image"]',
  },
  {
    title: "Measure and Annotate",
    description:
      "Use Measure for quick point-to-point dimensions and Annotate for callouts directly on the canvas. Keyboard shortcuts M and A switch between them instantly.",
    target: ['[data-onboarding="tool-measure"]', '[data-onboarding="tool-annotate"]'],
  },
  {
    title: "Export Your Work",
    description:
      "Export a PNG for quick sharing or a DXF for CAD handoff. When you need a polished client package, use Export PDF from the project overview page.",
    target: ['[data-onboarding="export-png"]', '[data-onboarding="export-dxf"]'],
  },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getTargetElements(target?: string | string[]) {
  if (!target) {
    return []
  }

  const selectors = Array.isArray(target) ? target : [target]

  return selectors.flatMap((selector) => {
    const element = document.querySelector<HTMLElement>(selector)
    return element ? [element] : []
  })
}

function getHighlightRect(target?: string | string[]): HighlightRect | null {
  const elements = getTargetElements(target)
  if (elements.length === 0) {
    return null
  }

  const rects = elements
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0)

  if (rects.length === 0) {
    return null
  }

  const top = Math.min(...rects.map((rect) => rect.top)) - TARGET_PADDING
  const left = Math.min(...rects.map((rect) => rect.left)) - TARGET_PADDING
  const right = Math.max(...rects.map((rect) => rect.right)) + TARGET_PADDING
  const bottom = Math.max(...rects.map((rect) => rect.bottom)) + TARGET_PADDING

  return {
    top,
    left,
    width: right - left,
    height: bottom - top,
  }
}

function getCardStyle(highlightRect: HighlightRect | null, viewport: { width: number; height: number }): CSSProperties {
  if (!highlightRect || viewport.width === 0 || viewport.height === 0) {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: `min(${CARD_WIDTH}px, calc(100vw - 2rem))`,
    }
  }

  const cardWidth = Math.min(CARD_WIDTH, viewport.width - VIEWPORT_PADDING * 2)
  const centeredLeft = clamp(
    highlightRect.left + highlightRect.width / 2 - cardWidth / 2,
    VIEWPORT_PADDING,
    viewport.width - cardWidth - VIEWPORT_PADDING
  )
  const centeredTop = clamp(
    highlightRect.top + highlightRect.height / 2 - CARD_HEIGHT / 2,
    VIEWPORT_PADDING,
    viewport.height - CARD_HEIGHT - VIEWPORT_PADDING
  )

  const fitsRight = highlightRect.left + highlightRect.width + CARD_GAP + cardWidth <= viewport.width - VIEWPORT_PADDING
  const fitsLeft = highlightRect.left - CARD_GAP - cardWidth >= VIEWPORT_PADDING
  const fitsBelow = highlightRect.top + highlightRect.height + CARD_GAP + CARD_HEIGHT <= viewport.height - VIEWPORT_PADDING

  if (fitsRight) {
    return {
      top: centeredTop,
      left: highlightRect.left + highlightRect.width + CARD_GAP,
      width: cardWidth,
    }
  }

  if (fitsLeft) {
    return {
      top: centeredTop,
      left: highlightRect.left - cardWidth - CARD_GAP,
      width: cardWidth,
    }
  }

  if (fitsBelow) {
    return {
      top: highlightRect.top + highlightRect.height + CARD_GAP,
      left: centeredLeft,
      width: cardWidth,
    }
  }

  return {
    top: Math.max(VIEWPORT_PADDING, highlightRect.top - CARD_HEIGHT - CARD_GAP),
    left: centeredLeft,
    width: cardWidth,
  }
}

export default function OnboardingTour() {
  const [isActive, setIsActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })

  const step = STEPS[stepIndex]

  useEffect(() => {
    const isComplete = window.localStorage.getItem(STORAGE_KEY) === "true"
    if (!isComplete) {
      setIsActive(true)
    }
  }, [])

  useEffect(() => {
    if (!isActive) {
      return
    }

    const updateLayout = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      setHighlightRect(getHighlightRect(step.target))
    }

    updateLayout()
    window.addEventListener("resize", updateLayout)
    window.addEventListener("scroll", updateLayout, true)

    return () => {
      window.removeEventListener("resize", updateLayout)
      window.removeEventListener("scroll", updateLayout, true)
    }
  }, [isActive, step.target])

  useEffect(() => {
    if (!isActive || !step.target) {
      return
    }

    const [firstTarget] = getTargetElements(step.target)
    firstTarget?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" })
  }, [isActive, step.target])

  const cardStyle = useMemo(
    () => getCardStyle(highlightRect, viewport),
    [highlightRect, viewport]
  )

  if (!isActive) {
    return null
  }

  function completeTour() {
    window.localStorage.setItem(STORAGE_KEY, "true")
    setIsActive(false)
  }

  function handleNext() {
    if (stepIndex === STEPS.length - 1) {
      completeTour()
      return
    }

    setStepIndex((current) => current + 1)
  }

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-tour-title">
      {highlightRect ? (
        <div
          className="onboarding-spotlight"
          style={{
            top: highlightRect.top,
            left: highlightRect.left,
            width: highlightRect.width,
            height: highlightRect.height,
          }}
        />
      ) : null}

      <div className="onboarding-card" style={cardStyle}>
        <div className="muted">
          Step {stepIndex + 1} of {STEPS.length}
        </div>
        <div className="section-title" id="onboarding-tour-title">
          {step.title}
        </div>
        <div className="muted onboarding-copy">{step.description}</div>

        <div className="onboarding-step-dots" aria-hidden="true">
          {STEPS.map((tourStep, index) => (
            <span
              key={tourStep.title}
              className={`onboarding-step-dot${index === stepIndex ? " is-active" : ""}`}
            />
          ))}
        </div>

        <div className="onboarding-actions">
          <button type="button" className="button-ghost" onClick={completeTour}>
            Skip tour
          </button>
          <button type="button" className="button" onClick={handleNext}>
            {stepIndex === STEPS.length - 1 ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  )
}
