import type { FloorPlanData } from "@/lib/types"

type FloorPlanJsonExportInput = {
  projectName: string
  floorLabel: string
  data: FloorPlanData
}

export function generateFloorPlanJson({ projectName, floorLabel, data }: FloorPlanJsonExportInput) {
  return JSON.stringify(
    {
      schema: "fw-floorplan.floor-plan.v1",
      exportedAt: new Date().toISOString(),
      projectName,
      floorLabel,
      data
    },
    null,
    2
  )
}

export function downloadJson(json: string, fileName: string) {
  const blob = new Blob([json], { type: "application/json;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
