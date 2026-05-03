"use client"

import { AlertTriangle, CheckCircle2, Info, Sofa } from "lucide-react"

import { getDesignReview, type DesignReviewItem, type DesignReviewSeverity } from "@/lib/floor-plan-analysis"
import type { FloorPlanData } from "@/lib/types"

type DesignReviewPanelProps = {
  data: FloorPlanData
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0
})

function getItemIcon(item: DesignReviewItem) {
  if (item.severity === "good") return CheckCircle2
  if (item.severity === "warning") return AlertTriangle
  return Info
}

function DesignReviewItemRow({ item }: { item: DesignReviewItem }) {
  const Icon = getItemIcon(item)

  return (
    <div className={`design-review-item is-${item.severity}`}>
      <div className={`compliance-icon-shell is-${item.severity === "good" ? "success" : item.severity}`}>
        <Icon size={16} />
      </div>
      <div className="compliance-copy">
        <div className="compliance-title">
          <strong>{item.subject}</strong>
          <span className={`badge design-review-badge is-${item.severity}`}>
            {item.severity === "good" ? "strong" : item.severity}
          </span>
        </div>
        <div>{item.message}</div>
        <div className="muted">{item.recommendation}</div>
      </div>
    </div>
  )
}

function getRoomSignalCounts(items: DesignReviewItem[]) {
  return items.reduce<Record<DesignReviewSeverity, number>>(
    (counts, item) => ({
      ...counts,
      [item.severity]: counts[item.severity] + 1
    }),
    { good: 0, info: 0, warning: 0 }
  )
}

function RoomSignalBadges({ items }: { items: DesignReviewItem[] }) {
  const counts = getRoomSignalCounts(items)

  if (items.length === 0) {
    return <span className="badge design-review-badge is-good">clear</span>
  }

  return (
    <div className="room-signal-badges">
      {counts.warning > 0 && (
        <span className="badge design-review-badge is-warning">
          {counts.warning} warning{counts.warning === 1 ? "" : "s"}
        </span>
      )}
      {counts.info > 0 && (
        <span className="badge design-review-badge is-info">
          {counts.info} info
        </span>
      )}
      {counts.good > 0 && (
        <span className="badge design-review-badge is-good">
          {counts.good} strong
        </span>
      )}
    </div>
  )
}

export default function DesignReviewPanel({ data }: DesignReviewPanelProps) {
  const review = getDesignReview(data)
  const priorityItems = review.warnings.slice(0, 6)
  const positiveItems = review.positives.slice(0, 4)

  if (data.rooms.length === 0) {
    return (
      <div className="empty-state compact-empty-state">
        <div className="section-title">No design review yet</div>
        <div className="muted">Draw or detect room polygons before running home-design intelligence.</div>
      </div>
    )
  }

  return (
    <div className="insight-stack">
      <div className="summary-stat-grid">
        <div className="summary-stat-card">
          <div className="summary-stat-label">Design readiness</div>
          <div className="summary-stat-value">{review.score}/100</div>
          <div className="muted">{review.summary}</div>
        </div>

        <div className="summary-stat-card">
          <div className="summary-stat-label">Rooms reviewed</div>
          <div className="summary-stat-value">{review.roomAssessments.length}</div>
          <div className="muted">
            {review.warnings.length} note{review.warnings.length === 1 ? "" : "s"} and {review.positives.length} strength
            {review.positives.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <section className="insight-card">
        <div className="insight-card-header">
          <div>
            <div className="section-title">Priority design notes</div>
            <div className="muted">Room sizing, access, daylight, circulation, and furniture-readiness checks.</div>
          </div>
        </div>

        {priorityItems.length > 0 ? (
          <div className="design-review-list">
            {priorityItems.map((item) => (
              <DesignReviewItemRow key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="compliance-success">
            <div className="compliance-icon-shell is-success">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <strong>No priority design warnings.</strong>
              <div className="muted">Add furniture and fixture references to deepen the review.</div>
            </div>
          </div>
        )}
      </section>

      <section className="insight-card">
        <div className="insight-card-header">
          <div>
            <div className="section-title">Room-by-room intelligence</div>
            <div className="muted">Quick quality signals for the selected floor.</div>
          </div>
        </div>

        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Type</th>
                <th>Area</th>
                <th>Envelope</th>
                <th>Openings</th>
                <th>Signals</th>
              </tr>
            </thead>
            <tbody>
              {review.roomAssessments.map((room) => (
                <tr key={room.roomId}>
                  <td>{room.label}</td>
                  <td>{room.category}</td>
                  <td>{numberFormatter.format(room.areaSqFt)} sq ft</td>
                  <td>{numberFormatter.format(room.widthFt)} x {numberFormatter.format(room.depthFt)} ft</td>
                  <td>{room.doorCount} doors / {room.windowCount} windows</td>
                  <td>
                    <RoomSignalBadges items={room.items} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="summary-grid-2">
        <section className="insight-card">
          <div className="insight-card-header">
            <div>
              <div className="section-title">Strengths</div>
              <div className="muted">Positive design signals already detected.</div>
            </div>
          </div>
          {positiveItems.length > 0 ? (
            <div className="design-review-list">
              {positiveItems.map((item) => (
                <DesignReviewItemRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="empty-state compact-empty-state">
              <div className="muted">Add windows, doors, and furniture to surface strengths.</div>
            </div>
          )}
        </section>

        <section className="insight-card">
          <div className="insight-card-header">
            <div>
              <div className="section-title">Furniture readiness</div>
              <div className="muted">Clearance notes improve as furniture is placed.</div>
            </div>
          </div>
          {review.furnitureItems.length > 0 ? (
            <div className="design-review-list">
              {review.furnitureItems.map((item) => (
                <DesignReviewItemRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="cost-assumption">
              <Sofa size={16} />
              Place beds, dining tables, bath fixtures, and kitchen appliances to check real-use clearance.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
