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

const PDF_WORKER_SRC = "/pdf.worker.min.mjs"

function buildUploadAsset(fileName: string, dataUrl: string, mimeType: string, previewUrl: string | null) {
  return {
    fileName,
    dataUrl,
    previewUrl,
    mimeType
  } satisfies UploadAsset
}

async function convertHeicToJpeg(file: File): Promise<UploadAsset> {
  const heic2any = (await import("heic2any")).default
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92
  })
  const blob = Array.isArray(converted) ? converted[0] : converted
  const previewFile = new File([blob], file.name.replace(/\.hei[cf]$/i, ".jpg"), {
    type: "image/jpeg"
  })
  const dataUrl = await readFileAsDataUrl(previewFile)
  return buildUploadAsset(previewFile.name, dataUrl, "image/jpeg", dataUrl)
}

async function renderPdfFirstPage(file: File): Promise<UploadAsset> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC

  const pdfDocument = await pdfjs.getDocument({
    data: await file.arrayBuffer()
  }).promise

  try {
    const page = await pdfDocument.getPage(1)
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = Math.min(2, Math.max(1, 1800 / Math.max(baseViewport.width, 1)))
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement("canvas")

    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)

    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("Canvas context unavailable")
    }

    await page.render({
      canvas,
      canvasContext: context,
      viewport
    }).promise

    const dataUrl = canvas.toDataURL("image/png")
    page.cleanup()

    return buildUploadAsset(file.name.replace(/\.pdf$/i, ".png"), dataUrl, "image/png", dataUrl)
  } finally {
    await pdfDocument.destroy()
  }
}

async function normalizeFile(file: File): Promise<UploadAsset> {
  const isHeic = file.type === "image/heic" || /\.hei[cf]$/i.test(file.name)
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name)

  if (isHeic) {
    return convertHeicToJpeg(file)
  }

  if (isPdf) {
    return renderPdfFirstPage(file)
  }

  const dataUrl = await readFileAsDataUrl(file)
  return buildUploadAsset(
    file.name,
    dataUrl,
    file.type || "application/octet-stream",
    file.type.startsWith("image/") ? dataUrl : null
  )
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
        <div className="field-hint">
          Maximum size 25MB. PDFs convert to a PNG preview of page 1, and HEIC files convert to JPEG.
        </div>
        {isReading ? (
          <div className="progress-bar is-indeterminate">
            <span />
          </div>
        ) : null}
      </div>

      {value?.previewUrl ? (
        <div className="upload-preview-wrap">
          <Image
            className="upload-preview upload-preview-enter"
            src={value.previewUrl}
            alt={value.fileName}
            width={1200}
            height={800}
            unoptimized
          />
          <div className="upload-preview-filename">{value.fileName}</div>
        </div>
      ) : value ? (
        <div className="panel upload-file-card">
          <div className="section-title">{value.fileName}</div>
          <div className="muted">Preview unavailable for this file type, but the data was captured.</div>
        </div>
      ) : null}

      {error ? (
        <div className="error-banner" style={{ marginTop: 0 }}>
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  )
}
