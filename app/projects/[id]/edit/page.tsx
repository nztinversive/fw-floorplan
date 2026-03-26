"use client"

import Link from "next/link"
import type Konva from "konva"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { useDebouncedCallback } from "use-debounce"

import FloorPlanCanvas from "@/components/FloorPlanCanvas"
import PropertiesPanel from "@/components/PropertiesPanel"
import Toolbar from "@/components/Toolbar"
import { useEditorStore } from "@/lib/editor-store"
import { getProject, saveFloorPlan } from "@/lib/local-data"
import type { StoredFloorPlan, StoredProject } from "@/lib/types"

export default function ProjectEditorPage() {
  const params = useParams<{ id: string }>()
  const projectId = Array.isArray(params?.id) ? params.id[0] : params?.id
  const stageRef = useRef<Konva.Stage>(null)
  const [project, setProject] = useState<StoredProject | null>(null)
  const [activeFloorPlan, setActiveFloorPlan] = useState<StoredFloorPlan | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")

  const floorPlanData = useEditorStore((state) => state.floorPlanData)
  const setFloorPlanData = useEditorStore((state) => state.setFloorPlanData)

  useEffect(() => {
    if (!projectId) {
      setIsReady(true)
      return
    }

    const record = getProject(projectId)
    setProject(record)
    const floorPlan = record?.floorPlans.find((entry) => entry.floor === 1) ?? null
    setActiveFloorPlan(floorPlan)
    if (floorPlan) {
      setFloorPlanData(floorPlan.data, true)
    }
    setIsReady(true)
  }, [projectId, setFloorPlanData])

  const debouncedSave = useDebouncedCallback((nextData: typeof floorPlanData) => {
    if (!projectId || !activeFloorPlan) {
      return
    }

    saveFloorPlan(projectId, activeFloorPlan.floor, {
      data: nextData,
      sourceImage: activeFloorPlan.sourceImage
    })
    setSaveState("saved")
  }, 700)

  useEffect(() => {
    if (!isReady || !projectId || !activeFloorPlan) {
      return
    }

    setSaveState("saving")
    debouncedSave(floorPlanData)
  }, [activeFloorPlan, debouncedSave, floorPlanData, isReady, projectId])

  useEffect(() => () => debouncedSave.cancel(), [debouncedSave])

  const statusLabel = useMemo(() => {
    if (saveState === "saving") {
      return "Saving locally..."
    }

    if (saveState === "saved") {
      return "Saved locally"
    }

    return "Local autosave ready"
  }, [saveState])

  if (isReady && (!project || !activeFloorPlan)) {
    return (
      <main className="page-shell">
        <div className="empty-state">
          <div className="section-title">Project not found</div>
          <div className="muted">This editor session requires a locally stored project.</div>
          <Link href="/" className="button-secondary">
            Return to dashboard
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <div className="mobile-note">
        <div className="muted">
          The editor is optimized for larger screens. Tablet and desktop provide the best drafting space.
        </div>
      </div>

      <div className="page-heading">
        <div>
          <div className="page-title">{project?.name ?? "Loading editor"}</div>
          <div className="muted">{statusLabel}</div>
        </div>
        <Link href={`/projects/${projectId}`} className="button-ghost">
          Back to overview
        </Link>
      </div>

      <div className="editor-shell">
        <Toolbar stageRef={stageRef} />
        <div className="editor-grid">
          <FloorPlanCanvas stageRef={stageRef} />
          <PropertiesPanel />
        </div>
      </div>
    </main>
  )
}
