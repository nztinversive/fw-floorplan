"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import type { FormEvent } from "react"
import { useMemo, useState } from "react"

import UploadZone, { type UploadAsset } from "@/components/UploadZone"
import { createProject } from "@/lib/local-data"

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

export default function NewProjectPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [upload, setUpload] = useState<UploadAsset | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isValid = useMemo(() => form.name.trim().length > 0, [form.name])

  function updateField(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValid || isSaving) {
      return
    }

    setIsSaving(true)

    const project = createProject({
      name: form.name.trim(),
      address: form.address.trim() || undefined,
      clientName: form.clientName.trim() || undefined,
      sourceImage: upload?.dataUrl,
      thumbnail: upload?.previewUrl ?? (upload?.mimeType.startsWith("image/") ? upload.dataUrl : undefined)
    })

    router.push(`/projects/${project.id}`)
  }

  return (
    <main className="page-shell">
      <div className="page-heading">
        <div>
          <div className="page-title">Create Project</div>
          <div className="muted">Capture client details and attach the floor plan source.</div>
        </div>
        <Link href="/" className="button-ghost">
          Back to dashboard
        </Link>
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

        <div className="button-row" style={{ marginTop: "1.25rem" }}>
          <button type="submit" className="button" disabled={!isValid || isSaving}>
            {isSaving ? "Creating..." : "Create project"}
          </button>
          <Link href="/" className="button-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  )
}
