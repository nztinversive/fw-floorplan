import { formatFloorLabel } from "@/lib/floor-utils"
import { getRoomMetrics, getRoomNotes } from "@/lib/floor-plan-analysis"
import type { FloorPlanData } from "@/lib/types"

type RoomScheduleProps = {
  data: FloorPlanData
  floor: number
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0
})

export default function RoomSchedule({ data, floor }: RoomScheduleProps) {
  const roomMetrics = getRoomMetrics(data)
  const totals = roomMetrics.reduce(
    (summary, metric) => ({
      areaSqFt: summary.areaSqFt + metric.room.areaSqFt,
      wallCount: summary.wallCount + metric.wallCount,
      doorCount: summary.doorCount + metric.doorCount,
      windowCount: summary.windowCount + metric.windowCount
    }),
    {
      areaSqFt: 0,
      wallCount: 0,
      doorCount: 0,
      windowCount: 0
    }
  )

  if (roomMetrics.length === 0) {
    return (
      <div className="empty-state compact-empty-state">
        <div className="section-title">No rooms on {formatFloorLabel(floor).toLowerCase()}</div>
        <div className="muted">Draw room polygons on the selected floor to generate a schedule.</div>
      </div>
    )
  }

  return (
    <div className="insight-stack">
      <div className="muted">
        Architectural schedule for {formatFloorLabel(floor).toLowerCase()}.
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Room name</th>
              <th>Area (sq ft)</th>
              <th>Wall count</th>
              <th>Door count</th>
              <th>Window count</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {roomMetrics.map((metric) => {
              const notes = getRoomNotes(metric)

              return (
                <tr key={metric.room.id}>
                  <td>{metric.room.label.trim() || "Unlabeled Room"}</td>
                  <td>{numberFormatter.format(metric.room.areaSqFt)}</td>
                  <td>{metric.wallCount}</td>
                  <td>{metric.doorCount}</td>
                  <td>{metric.windowCount}</td>
                  <td>{notes.length > 0 ? notes.join(" | ") : "Clear"}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>{numberFormatter.format(totals.areaSqFt)}</td>
              <td>{totals.wallCount}</td>
              <td>{totals.doorCount}</td>
              <td>{totals.windowCount}</td>
              <td>{roomMetrics.length} rooms</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
