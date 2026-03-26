"use client"

import Image from "next/image"
import { useCallback, useMemo, useState } from "react"
import { useDropzone } from "react-dropzone"

import { readFileAsDataUrl } from "@/lib/file-utils"

export type UploadAsset = {
  fileName: string
  dataUrl: string
  previewUrl: string | null
  mimeType: string
}

type UploadZoneProps = {
  value?: UploadAsset | null
  onChange: (asset: UploadAsset | null) => void
}

async function normalizeFile(file: File): Promise<UploadAsset> {
  const isHeic = file.type === "image/heic" || /\.heic$/i.test(file.name)

  if (isHeic) {
    const heic2any = (await import("heic2any")).default
    const converted = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.92
    })
    const blob = Array.isArray(converted) ? converted[0] : converted
    const previewFile = new File([blob], file.name.replace(/\.heic$/i, ".jpg"), {
      type: "image/jpeg"
    })
    const previewUrl = await readFileAsDataUrl(previewFile)
    const dataUrl = await readFileAsDataUrl(file)
    return {
      fileName: file.name,
      dataUrl,
      previewUrl,
      mimeType: file.type || "image/heic"
    }
  }

  const dataUrl = await readFileAsDataUrl(file)
  return {
    fileName: file.name,
    dataUrl,
    previewUrl: file.type.startsWith("image/") ? dataUrl : null,
    mimeType: file.type || "application/octet-stream"
  }
}

export default function UploadZone({ value, onChange }: UploadZoneProps) {
  const [isReading, setIsReading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (!file) {
        return
      }

      setError(null)
      setIsReading(true)

      try {
        const asset = await normalizeFile(file)
        onChange(asset)
      } catch {
        setError("Unable to read that file.")
      } finally {
        setIsReading(false)
      }
    },
    [onChange]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: 25 * 1024 * 1024,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "application/pdf": [".pdf"],
      "image/heic": [".heic", ".heif"]
    }
  })

  const statusCopy = useMemo(() => {
    if (isReading) {
      return "Reading file..."
    }

    if (value) {
      return value.fileName
    }

    return "Drag and drop JPG, PNG, PDF, or HEIC files here"
  }, [isReading, value])

  return (
    <div className="field" style={{ gap: "0.75rem" }}>
      <div {...getRootProps()} className={`dropzone${isDragActive ? " is-active" : ""}`}>
        <input {...getInputProps()} />
        <div className="section-title">{isDragActive ? "Drop to upload" : "Upload floor plan source"}</div>
        <div className="muted">{statusCopy}</div>
        <div className="field-hint">Maximum size 25MB. HEIC files are previewed as JPEG.</div>
        {isReading ? (
          <div className="progress-bar">
            <span style={{ width: "72%" }} />
          </div>
        ) : null}
      </div>

      {value?.previewUrl ? (
        <Image
          className="upload-preview"
          src={value.previewUrl}
          alt={value.fileName}
          width={1200}
          height={800}
          unoptimized
        />
      ) : value ? (
        <div className="panel">
          <div className="section-title">{value.fileName}</div>
          <div className="muted">Preview unavailable for this file type, but the data was captured.</div>
        </div>
      ) : null}

      {error ? (
        <div className="field-hint" style={{ color: "#b42318" }}>
          {error}
        </div>
      ) : null}
    </div>
  )
}
