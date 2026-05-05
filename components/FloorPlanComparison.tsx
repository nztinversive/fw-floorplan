"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"

import { formatDate } from "@/lib/file-utils"
import { summarizeRoomAreas } from "@/lib/floor-plan-analysis"
import { formatFloorLabel } from "@/lib/floor-utils"
import type { FloorPlanData, PersistedFloorPlan } from "@/lib/types"

type ProjectVersion = {
  _id: string
  floor: number
  name: string
  data: FloorPlanData
  createdAt: number
}

type FloorPlanComparisonProps = {
  orderedFloorPlans: PersistedFloorPlan[]
  versions: ProjectVersion[]
}

type ComparisonOption = {
  id: string
  floor: number
  data: FloorPlanData
  floorLabel: string
  versionLabel: string
  selectorLabel: string
  createdAt?: number
}

type FloorPlanStats = {
  roomCount: number
  wallCount: number
  totalAreaSqFt: number
}

const ReadOnlyFloorPlanCanvas = dynamic(() => import("@/components/ReadOnlyFloorPlanCanvas"), {
  ssr: false
})

function getOptionStats(option: ComparisonOption): FloorPlanStats {
  const summary = summarizeRoomAreas([{ floor: option.floor, data: option.data }])

  return {
    roomCount: summary.totalRoomCount,
    wallCount: option.data.walls.length,
    totalAreaSqFt: summary.totalAreaSqFt
  }
}

function formatArea(value: number) {
  return `${Math.round(value).toLocaleString()} sq ft`
}

function formatDifference(value: number, label: string) {
  const difference = Math.abs(value)
  return `${difference.toLocaleString()} ${label}`
}

function buildDiffSummary(left: FloorPlanStats, right: FloorPlanStats) {
  const summary: string[] = []
  const roomDelta = left.roomCount - right.roomCount
  const wallDelta = left.wallCount - right.wallCount
  const areaDelta = Math.round(left.totalAreaSqFt - right.totalAreaSqFt)

  if (roomDelta !== 0) {
    summary.push(
      roomDelta > 0
        ? `Left has ${formatDifference(roomDelta, roomDelta === 1 ? "more room" : "more rooms")}.`
        : `Right has ${formatDifference(roomDelta, roomDelta === -1 ? "more room" : "more rooms")}.`
    )
  }

  if (wallDelta !== 0) {
    summary.push(
      wallDelta > 0
        ? `Left has ${formatDifference(wallDelta, wallDelta === 1 ? "more wall" : "more walls")}.`
        : `Right has ${formatDifference(wallDelta, wallDelta === -1 ? "more wall" : "more walls")}.`
    )
  }

  if (areaDelta !== 0) {
    summary.push(
      areaDelta > 0
        ? `Left is ${formatDifference(areaDelta, "sq ft larger")}.`
        : `Right is ${formatDifference(areaDelta, "sq ft larger")}.`
    )
  }

  if (summary.length === 0) {
    summary.push("Both selections currently have the same room count, wall count, and total area.")
  }

  return summary
}

function buildOptions(
  orderedFloorPlans: PersistedFloorPlan[],
  versions: ProjectVersion[]
): ComparisonOption[] {
  const currentOptions = orderedFloorPlans.map((floorPlan) => ({
    id: `current:${floorPlan.floor}`,
    floor: floorPlan.floor,
    data: floorPlan.data,
    floorLabel: formatFloorLabel(floorPlan.floor),
    versionLabel: "Current state",
    selectorLabel: `${formatFloorLabel(floorPlan.floor)} - Current state`
  }))

  const versionOptions = versions.map((version) => ({
    id: `version:${version._id}`,
    floor: version.floor,
    data: version.data,
    floorLabel: formatFloorLabel(version.floor),
    versionLabel: version.name,
    selectorLabel: `${formatFloorLabel(version.floor)} - ${version.name}`,
    createdAt: version.createdAt
  }))

  return [...currentOptions, ...versionOptions]
}

function getInitialRightOptionId(options: ComparisonOption[], leftId: string) {
  return options.find((option) => option.id !== leftId)?.id ?? leftId
}

export default function FloorPlanComparison({
  orderedFloorPlans,
  versions
}: FloorPlanComparisonProps) {
  const options = useMemo(
    () => buildOptions(orderedFloorPlans, versions),
    [orderedFloorPlans, versions]
  )

  const [leftSelectionId, setLeftSelectionId] = useState<string>(() => options[0]?.id ?? "")
  const [rightSelectionId, setRightSelectionId] = useState<string>(() =>
    getInitialRightOptionId(options, options[0]?.id ?? "")
  )

  useEffect(() => {
    const nextLeftId = options.find((option) => option.id === leftSelectionId)?.id ?? options[0]?.id ?? ""
    const nextRightId =
      options.find((option) => option.id === rightSelectionId)?.id ??
      getInitialRightOptionId(options, nextLeftId)

    if (nextLeftId !== leftSelectionId) {
      setLeftSelectionId(nextLeftId)
    }

    if (nextRightId !== rightSelectionId) {
      setRightSelectionId(nextRightId)
    }
  }, [leftSelectionId, options, rightSelectionId])

  const leftOption = options.find((option) => option.id === leftSelectionId) ?? null
  const rightOption = options.find((option) => option.id === rightSelectionId) ?? null
  const leftStats = leftOption ? getOptionStats(leftOption) : null
  const rightStats = rightOption ? getOptionStats(rightOption) : null
  const diffSummary =
    leftStats && rightStats ? buildDiffSummary(leftStats, rightStats) : ["Select two floor states to compare."]

  if (options.length === 0) {
    return (
      <section className="panel floor-plan-comparison-panel">
        <div className="empty-state compact-empty-state">
          <div className="section-title">No floor plans available</div>
          <div className="muted">Create a floor plan or save a version before opening comparison mode.</div>
        </div>
      </section>
    )
  }

  return (
    <section className="panel floor-plan-comparison-panel">
      <div className="panel-header">
        <div>
          <div className="section-title">Floor plan comparison</div>
          <div className="muted">Compare current floors and saved versions side by side.</div>
        </div>
        <span className="badge">{options.length} options</span>
      </div>

      <div className="floor-plan-comparison-grid">
        {[
          {
            side: "Left",
            selectionId: leftSelectionId,
            setSelectionId: setLeftSelectionId,
            option: leftOption,
            stats: leftStats
          },
          {
            side: "Right",
            selectionId: rightSelectionId,
            setSelectionId: setRightSelectionId,
            option: rightOption,
            stats: rightStats
          }
        ].map((entry) => (
          <article key={entry.side} className="floor-plan-compare-card">
            <div className="floor-plan-compare-header">
              <div>
                <div className="comparison-side-label">{entry.side}</div>
                <label className="field" style={{ margin: "0.5rem 0 0" }}>
                  <span className="field-label">Floor or version</span>
                  <select
                    className="field-select"
                    value={entry.selectionId}
                    onChange={(event) => entry.setSelectionId(event.target.value)}
                  >
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.selectorLabel}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {entry.option ? <span className="badge">{entry.option.versionLabel}</span> : null}
            </div>

            {entry.option ? (
              <>
                <div className="floor-plan-compare-title">
                  <strong>{entry.option.floorLabel}</strong>
                  <span className="muted">
                    {entry.option.createdAt
                      ? `Saved ${formatDate(entry.option.createdAt)}`
                      : "Live project state"}
                  </span>
                </div>

                <ReadOnlyFloorPlanCanvas data={entry.option.data} />

                {entry.stats ? (
                  <div className="floor-plan-compare-stats">
                    <div className="floor-plan-compare-stat">
                      <span className="floor-plan-compare-stat-value">{entry.stats.roomCount}</span>
                      <span className="floor-plan-compare-stat-label">Rooms</span>
                    </div>
                    <div className="floor-plan-compare-stat">
                      <span className="floor-plan-compare-stat-value">{entry.stats.wallCount}</span>
                      <span className="floor-plan-compare-stat-label">Walls</span>
                    </div>
                    <div className="floor-plan-compare-stat">
                      <span className="floor-plan-compare-stat-value">
                        {formatArea(entry.stats.totalAreaSqFt)}
                      </span>
                      <span className="floor-plan-compare-stat-label">Total area</span>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty-state compact-empty-state">
                <div className="section-title">Selection unavailable</div>
                <div className="muted">Choose a current floor or a saved version.</div>
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="floor-plan-diff-panel">
        <div className="section-title">Diff summary</div>
        <div className="floor-plan-diff-list">
          {diffSummary.map((item, index) => (
            <div key={`${index}-${item}`} className="floor-plan-diff-item">
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
