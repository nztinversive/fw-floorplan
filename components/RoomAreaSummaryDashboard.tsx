import { formatFloorLabel } from "@/lib/floor-utils"
import { summarizeRoomAreas } from "@/lib/floor-plan-analysis"
import type { FloorPlanData } from "@/lib/types"

type RoomAreaSummaryDashboardProps = {
  floorPlans: Array<{
    floor: number
    data: FloorPlanData
  }>
}

const areaFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0
})

export default function RoomAreaSummaryDashboard({
  floorPlans
}: RoomAreaSummaryDashboardProps) {
  const summary = summarizeRoomAreas(floorPlans)
  const largestLabelArea = Math.max(summary.byLabel[0]?.areaSqFt ?? 0, 1)
  const largestFloorArea = Math.max(...summary.byFloor.map((item) => item.areaSqFt), 1)

  return (
    <div className="insight-stack">
      <div className="summary-stat-grid">
        <div className="summary-stat-card">
          <div className="summary-stat-label">Total area</div>
          <div className="summary-stat-value">
            {areaFormatter.format(summary.totalAreaSqFt)} sq ft
          </div>
          <div className="muted">
            {summary.totalRoomCount} rooms across {floorPlans.length} floor
            {floorPlans.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="summary-stat-card">
          <div className="summary-stat-label">Largest category</div>
          <div className="summary-stat-value">
            {summary.byLabel[0]?.label ?? "None"}
          </div>
          <div className="muted">
            {summary.byLabel[0]
              ? `${areaFormatter.format(summary.byLabel[0].areaSqFt)} sq ft`
              : "Add rooms to see a breakdown"}
          </div>
        </div>
      </div>

      <div className="summary-grid-2">
        <section className="insight-card">
          <div className="insight-card-header">
            <div>
              <div className="section-title">Room type breakdown</div>
              <div className="muted">Relative area by room label across all floors.</div>
            </div>
          </div>

          {summary.byLabel.length > 0 ? (
            <div className="metric-bars">
              {summary.byLabel.map((item) => (
                <div key={item.label} className="metric-bar-row">
                  <div className="metric-bar-meta">
                    <strong>{item.label}</strong>
                    <span>{areaFormatter.format(item.areaSqFt)} sq ft</span>
                  </div>
                  <div className="metric-bar-track">
                    <span
                      className="metric-bar-fill"
                      style={{ width: `${(item.areaSqFt / largestLabelArea) * 100}%` }}
                    />
                  </div>
                  <div className="muted">
                    {item.roomCount} room{item.roomCount === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state compact-empty-state">
              <div className="muted">No rooms available yet.</div>
            </div>
          )}
        </section>

        <section className="insight-card">
          <div className="insight-card-header">
            <div>
              <div className="section-title">Per-floor subtotals</div>
              <div className="muted">Area totals for each saved floor plan.</div>
            </div>
          </div>

          {summary.byFloor.length > 0 ? (
            <div className="metric-bars">
              {summary.byFloor.map((item) => (
                <div key={item.floor} className="metric-bar-row">
                  <div className="metric-bar-meta">
                    <strong>{formatFloorLabel(item.floor)}</strong>
                    <span>{areaFormatter.format(item.areaSqFt)} sq ft</span>
                  </div>
                  <div className="metric-bar-track is-secondary">
                    <span
                      className="metric-bar-fill is-secondary"
                      style={{ width: `${(item.areaSqFt / largestFloorArea) * 100}%` }}
                    />
                  </div>
                  <div className="muted">
                    {item.roomCount} room{item.roomCount === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state compact-empty-state">
              <div className="muted">No floor plans available yet.</div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
