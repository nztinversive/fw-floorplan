"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import type { FormEvent } from "react"
import { useMemo, useState } from "react"
import { useAction, useMutation } from "convex/react"

import Breadcrumb from "@/components/Breadcrumb"
import TemplateSelector from "@/components/TemplateSelector"
import { useToast } from "@/components/Toast"
import UploadZone, { type UploadAsset } from "@/components/UploadZone"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { FLOOR_PLAN_TEMPLATES } from "@/lib/floor-plan-templates"
import { cloneFloorPlanData, createSeedFloorPlan, syncDerivedData } from "@/lib/geometry"
import type { FloorPlanData } from "@/lib/types"

type FormState = {
  name: string
  address: string
  clientName: string
}

const INITIAL_FORM: FormState = {
  name: "",
  address: "",
  clientName: ""
}

type UploadResponse = {
  storageId: Id<"_storage">
}

type ExtractedFloorPlan = {
  walls: FloorPlanData["walls"]
  rooms: FloorPlanData["rooms"]
  doors: FloorPlanData["doors"]
  windows: FloorPlanData["windows"]
  dimensions: Array<{ wallId: string; lengthFt: number; widthFt: number }>
  scale: number
  confidence: number
}

function feetToInches(value: number) {
  return Number.isFinite(value) ? Number((value * 12).toFixed(2)) : value
}

async function uploadAssetToStorage(uploadUrl: string, asset: UploadAsset): Promise<Id<"_storage">> {
  const blob = await fetch(asset.dataUrl).then((response) => response.blob())
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": asset.mimeType
    },
    body: blob
  })

  if (!response.ok) {
    throw new Error("Upload failed")
  }

  const payload = (await response.json()) as UploadResponse
  return payload.storageId
}

export default function NewProjectPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [upload, setUpload] = useState<UploadAsset | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState("")
  const [extractionFailed, setExtractionFailed] = useState(false)
  const createProject = useMutation(api.projects.createWithInitialFloorPlan)
  const uploadSource = useMutation(api.floorPlans.uploadSource)
  const extractFloorPlan = useAction(api.ai.extractFloorPlan)

  const isValid = useMemo(() => form.name.trim().length > 0, [form.name])

  function updateField(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValid || isSaving) {
      return
    }

    setIsSaving(true)
    setExtractionFailed(false)

    try {
      let didExtractionFail = false
      let sourceImage: Id<"_storage"> | undefined

      if (upload) {
        setStatus("Uploading floor plan...")
        const uploadUrl = await uploadSource({})
        sourceImage = await uploadAssetToStorage(uploadUrl, upload)
      }

      const templateMatch = selectedTemplate
        ? FLOOR_PLAN_TEMPLATES.find((template) => template.id === selectedTemplate)
        : null
      let floorPlanData = templateMatch
        ? cloneFloorPlanData(templateMatch.data)
        : createSeedFloorPlan(sourceImage).data

      if (sourceImage) {
        try {
          setStatus("Analyzing floor plan with AI...")
          const extracted = (await extractFloorPlan({ storageId: sourceImage })) as ExtractedFloorPlan
          floorPlanData = syncDerivedData({
            walls: extracted.walls,
            rooms: extracted.rooms,
            doors: extracted.doors.map((door) => ({
              ...door,
              width: feetToInches(door.width)
            })),
            windows: extracted.windows.map((window) => ({
              ...window,
              width: feetToInches(window.width),
              height: feetToInches(window.height)
            })),
            dimensions: [],
            furniture: [],
            scale: extracted.scale > 0 ? extracted.scale : 24,
            gridSize: 6
          })
          setStatus(`Extraction complete - confidence ${Math.round(extracted.confidence * 100)}%`)
        } catch (error) {
          didExtractionFail = true
          setExtractionFailed(true)
          console.error("AI extraction failed, using seed floor plan instead.", error)
          setStatus("AI extraction failed - using starter layout")
          toast("AI extraction failed - using starter layout", "warning")
        }
      }

      setStatus("Creating project...")
      const projectId = await createProject({
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        clientName: form.clientName.trim() || undefined,
        thumbnail: sourceImage,
        sourceImage,
        floor: 1,
        data: floorPlanData
      })

      toast("Project created successfully", "success")
      router.push(`/projects/${projectId}${didExtractionFail || extractionFailed ? "?extraction=failed" : ""}`)
    } catch (error) {
      console.error("Unable to create project.", error)
      toast("Unable to create project", "error")
      setIsSaving(false)
    }
  }

  return (
    <main className="page-shell">
      <Breadcrumb items={[
        { label: "Projects", href: "/" },
        { label: "New project" }
      ]} />

      <div className="page-heading">
        <div>
          <div className="page-title">Create Project</div>
          <div className="muted">Capture client details and attach the floor plan source.</div>
        </div>
      </div>

      <form className="panel" onSubmit={handleSubmit}>
        <div className="panel-header">
          <div className="section-title">Project details</div>
          <div className="muted">Floor 1 seed data will be created automatically.</div>
        </div>

        <div className="form-grid">
          <label className="field">
            <span className="field-label">Project name</span>
            <input
              className="field-input"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Briarwood residence"
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Client name</span>
            <input
              className="field-input"
              value={form.clientName}
              onChange={(event) => updateField("clientName", event.target.value)}
              placeholder="Avery Carter"
            />
          </label>

          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span className="field-label">Address</span>
            <input
              className="field-input"
              value={form.address}
              onChange={(event) => updateField("address", event.target.value)}
              placeholder="123 Cedar Lane, Franklin, TN"
            />
          </label>
        </div>

        <div style={{ marginTop: "1.25rem" }}>
          <div className="field" style={{ gap: "0.75rem" }}>
            <span className="field-label">Floor plan upload</span>
            <UploadZone value={upload} onChange={setUpload} />
          </div>
        </div>

        <div style={{ marginTop: "1.25rem" }}>
          <TemplateSelector selected={selectedTemplate} onSelect={setSelectedTemplate} />
        </div>

        {isSaving && status && (
          <div className="creation-progress" style={{ marginTop: "1.25rem" }}>
            <div className="creation-progress-bar">
              <span style={{ width: status.includes("Uploading") ? "25%" : status.includes("Analyzing") ? "55%" : status.includes("Extraction") ? "75%" : status.includes("Creating") ? "90%" : "10%" }} />
            </div>
            <div className="creation-progress-label">{status}</div>
          </div>
        )}

        <div className="button-row" style={{ marginTop: "1.25rem" }}>
          <button type="submit" className="button" disabled={!isValid || isSaving}>
            {isSaving ? (status || "Creating...") : "Create project"}
          </button>
          <Link href="/" className="button-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  )
}
