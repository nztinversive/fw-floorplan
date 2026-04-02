import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react"

import { getComplianceIssues } from "@/lib/floor-plan-analysis"
import type { FloorPlanData } from "@/lib/types"

type ComplianceCheckerProps = {
  data: FloorPlanData
}

export default function ComplianceChecker({ data }: ComplianceCheckerProps) {
  const issues = getComplianceIssues(data)

  if (issues.length === 0) {
    return (
      <div className="compliance-success">
        <div className="compliance-icon-shell is-success">
          <CheckCircle2 size={18} />
        </div>
        <div>
          <strong>All checks passed.</strong>
          <div className="muted">No room or wall issues were detected on this floor.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="insight-stack">
      <div className="muted">
        {issues.length} issue{issues.length === 1 ? "" : "s"} detected on the selected floor.
      </div>

      <div className="compliance-list">
        {issues.map((issue) => {
          const isError = issue.severity === "error"
          const Icon = isError ? CircleAlert : AlertTriangle

          return (
            <div key={issue.id} className={`compliance-item${isError ? " is-error" : " is-warning"}`}>
              <div className={`compliance-icon-shell${isError ? " is-error" : " is-warning"}`}>
                <Icon size={16} />
              </div>
              <div className="compliance-copy">
                <div className="compliance-title">
                  <strong>{issue.subject}</strong>
                  <span className={`badge compliance-badge${isError ? " is-error" : " is-warning"}`}>
                    {issue.severity}
                  </span>
                </div>
                <div>{issue.message}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
