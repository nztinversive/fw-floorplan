"use client"

import { useMemo, useState } from "react"

import {
  DEFAULT_COST_RATES,
  calculateCostEstimate,
  type CostEstimatorRates
} from "@/lib/floor-plan-analysis"
import type { FloorPlanData } from "@/lib/types"

type CostEstimatorProps = {
  data: FloorPlanData
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
})

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0
})

function formatQuantity(value: number, unit: string): string {
  if (unit === "each") {
    return numberFormatter.format(Math.round(value))
  }

  return numberFormatter.format(value)
}

export default function CostEstimator({ data }: CostEstimatorProps) {
  const [rates, setRates] = useState<CostEstimatorRates>(DEFAULT_COST_RATES)
  const estimate = useMemo(() => calculateCostEstimate(data, rates), [data, rates])

  function updateRate(key: keyof CostEstimatorRates, value: string) {
    const nextValue = Number(value)

    setRates((current) => ({
      ...current,
      [key]: Number.isFinite(nextValue) && nextValue >= 0 ? nextValue : 0
    }))
  }

  return (
    <div className="insight-stack">
      <div className="summary-stat-grid">
        <div className="summary-stat-card">
          <div className="summary-stat-label">Wall length</div>
          <div className="summary-stat-value">
            {numberFormatter.format(estimate.wallLengthFt)} LF
          </div>
          <div className="muted">Total linear feet of walls on this floor.</div>
        </div>

        <div className="summary-stat-card">
          <div className="summary-stat-label">Wall area</div>
          <div className="summary-stat-value">
            {numberFormatter.format(estimate.wallAreaSqFt)} sq ft
          </div>
          <div className="muted">Assumes 8 ft wall height and two drywall faces.</div>
        </div>

        <div className="summary-stat-card">
          <div className="summary-stat-label">Openings</div>
          <div className="summary-stat-value">
            {estimate.doorCount + estimate.windowCount}
          </div>
          <div className="muted">
            {estimate.doorCount} doors and {estimate.windowCount} windows.
          </div>
        </div>
      </div>

      <div className="cost-assumption">
        Rough material estimate only. Rates are editable and can be tuned to local pricing.
      </div>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Line item</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Unit cost</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {estimate.lineItems.map((item) => (
              <tr key={item.key}>
                <td>{item.label}</td>
                <td>{formatQuantity(item.quantity, item.unit)}</td>
                <td>{item.unit}</td>
                <td>
                  <input
                    className="field-input cost-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={rates[item.key]}
                    onChange={(event) => updateRate(item.key, event.target.value)}
                    aria-label={`${item.label} unit cost`}
                  />
                </td>
                <td>{currencyFormatter.format(item.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Grand total</td>
              <td colSpan={3} />
              <td>{currencyFormatter.format(estimate.grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
