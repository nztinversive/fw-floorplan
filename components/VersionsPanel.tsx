"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"

import ConfirmDialog from "@/components/ConfirmDialog"
import { useToast } from "@/components/Toast"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { FloorPlanData } from "@/lib/types"

type VersionsPanelProps = {
  projectId: Id<"projects">
  floor: number
  floorPlanData: FloorPlanData
  onRestore: (data: FloorPlanData, versionName: string) => void
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(timestamp)
}

export default function VersionsPanel({
  projectId,
  floor,
  floorPlanData,
  onRestore
}: VersionsPanelProps) {
  const { toast } = useToast()
  const versions = useQuery(api.versions.listVersions, { projectId, floor })
  const saveVersion = useMutation(api.versions.saveVersion)
  const deleteVersion = useMutation(api.versions.deleteVersion)

  const [versionName, setVersionName] = useState("")
  const [selectedVersionId, setSelectedVersionId] = useState<Id<"versions"> | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Id<"versions"> | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const selectedVersion = useQuery(
    api.versions.getVersion,
    selectedVersionId ? { versionId: selectedVersionId } : "skip"
  )

  useEffect(() => {
    setSelectedVersionId(null)
    setDeleteTarget(null)
  }, [floor, projectId])

  useEffect(() => {
    if (versions && selectedVersionId && !versions.some((version) => version._id === selectedVersionId)) {
      setSelectedVersionId(null)
    }
  }, [selectedVersionId, versions])

  const selectedVersionSummary = useMemo(
    () => versions?.find((version) => version._id === selectedVersionId) ?? null,
    [selectedVersionId, versions]
  )

  async function handleSaveVersion() {
    const trimmedName = versionName.trim()
    if (!trimmedName || isSaving) {
      if (!trimmedName) {
        toast("Enter a version name before saving", "warning")
      }
      return
    }

    setIsSaving(true)

    try {
      const versionId = await saveVersion({
        projectId,
        floor,
        name: trimmedName,
        data: floorPlanData
      })
      setVersionName("")
      setSelectedVersionId(versionId)
      toast(`Saved version "${trimmedName}"`, "success")
    } catch (error) {
      console.error("Unable to save floor plan version.", error)
      toast("Unable to save this version right now", "error")
    } finally {
      setIsSaving(false)
    }
  }

  function handlePreview(versionId: Id<"versions">, name: string) {
    setSelectedVersionId(versionId)
    toast(`Previewing "${name}"`, "info")
  }

  function handleRestore() {
    if (!selectedVersion) {
      toast("Select a version to restore", "warning")
      return
    }

    onRestore(selectedVersion.data, selectedVersion.name)
    toast(`Restored "${selectedVersion.name}"`, "success")
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || isDeleting) {
      return
    }

    setIsDeleting(true)

    try {
      await deleteVersion({ versionId: deleteTarget })
      if (selectedVersionId === deleteTarget) {
        setSelectedVersionId(null)
      }
      toast("Version deleted", "success")
    } catch (error) {
      console.error("Unable to delete floor plan version.", error)
      toast("Unable to delete this version right now", "error")
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <>
      <section className="sidebar-card versions-panel">
        <div className="panel-header">
          <div>
            <div className="section-title">Versions</div>
            <div className="muted">Named snapshots for {floor === 1 ? "floor 1" : `floor ${floor}`}</div>
          </div>
          <div className="badge">{versions?.length ?? 0}</div>
        </div>

        <div className="versions-save-row">
          <label className="field" style={{ margin: 0 }}>
            <span className="field-label">Version name</span>
            <input
              className="field-input"
              value={versionName}
              onChange={(event) => setVersionName(event.target.value)}
              placeholder="Kitchen layout option A"
            />
          </label>
          <button type="button" className="button-secondary" onClick={handleSaveVersion} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save version"}
          </button>
        </div>

        {selectedVersionSummary ? (
          <div className="versions-selected-card">
            <div>
              <div className="versions-selected-name">{selectedVersionSummary.name}</div>
              <div className="muted">{formatTimestamp(selectedVersionSummary.createdAt)}</div>
            </div>
            <div className="versions-actions">
              <button type="button" className="button" onClick={handleRestore} disabled={!selectedVersion}>
                Restore
              </button>
              <button
                type="button"
                className="button-ghost"
                onClick={() => setDeleteTarget(selectedVersionSummary._id)}
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}

        <div className="versions-list">
          {versions === undefined ? (
            <div className="muted">Loading versions...</div>
          ) : versions.length === 0 ? (
            <div className="versions-empty">
              <div className="muted">
                Save a named snapshot before trying alternate layouts or restores.
              </div>
            </div>
          ) : (
            versions.map((version) => (
              <button
                key={version._id}
                type="button"
                className={`versions-item${selectedVersionId === version._id ? " is-selected" : ""}`}
                onClick={() => handlePreview(version._id, version.name)}
              >
                <span className="versions-item-name">{version.name}</span>
                <span className="versions-item-time">{formatTimestamp(version.createdAt)}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this version?"
        message="This removes the saved snapshot only. Your current editor state will stay in place until you restore another version."
        confirmLabel={isDeleting ? "Deleting..." : "Delete version"}
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isDeleting) {
            setDeleteTarget(null)
          }
        }}
      />
    </>
  )
}
