"use client"

import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from "lucide-react"
import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"

type LightboxImage = {
  src: string
  alt: string
  caption?: string
  badge?: string
}

type LightboxProps = {
  images: LightboxImage[]
  startIndex?: number
  open: boolean
  onClose: () => void
}

export default function Lightbox({ images, startIndex = 0, open, onClose }: LightboxProps) {
  const [index, setIndex] = useState(startIndex)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const panStart = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (open) {
      setIndex(startIndex)
      setZoom(1)
      setPan({ x: 0, y: 0 })
    }
  }, [open, startIndex])

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const goNext = useCallback(() => {
    if (images.length <= 1) return
    setIndex((i) => (i + 1) % images.length)
    resetView()
  }, [images.length, resetView])

  const goPrev = useCallback(() => {
    if (images.length <= 1) return
    setIndex((i) => (i - 1 + images.length) % images.length)
    resetView()
  }, [images.length, resetView])

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(z * 1.4, 5))
  }, [])

  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const next = z / 1.4
      if (next <= 1.05) {
        setPan({ x: 0, y: 0 })
        return 1
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (!open) return

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowRight") goNext()
      else if (e.key === "ArrowLeft") goPrev()
      else if (e.key === "+" || e.key === "=") zoomIn()
      else if (e.key === "-") zoomOut()
    }

    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [open, onClose, goNext, goPrev, zoomIn, zoomOut])

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    if (e.deltaY < 0) zoomIn()
    else zoomOut()
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (zoom <= 1) return
    isDragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY }
    panStart.current = { ...pan }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!isDragging.current) return
    setPan({
      x: panStart.current.x + (e.clientX - dragStart.current.x),
      y: panStart.current.y + (e.clientY - dragStart.current.y)
    })
  }

  function handlePointerUp() {
    isDragging.current = false
  }

  function handleDownload() {
    const img = images[index]
    if (!img) return
    window.open(img.src, "_blank", "noopener,noreferrer")
  }

  if (!open || images.length === 0) return null

  const current = images[index]

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div className="lightbox-chrome" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-toolbar">
          <div className="lightbox-counter">
            {images.length > 1 ? `${index + 1} / ${images.length}` : ""}
            {current.badge ? <span className="badge" style={{ marginLeft: "0.5rem" }}>{current.badge}</span> : null}
          </div>
          <div className="lightbox-actions">
            <button type="button" className="lightbox-btn" onClick={zoomOut} aria-label="Zoom out" title="Zoom out">
              <ZoomOut size={18} />
            </button>
            <span className="lightbox-zoom-label">{Math.round(zoom * 100)}%</span>
            <button type="button" className="lightbox-btn" onClick={zoomIn} aria-label="Zoom in" title="Zoom in">
              <ZoomIn size={18} />
            </button>
            <button type="button" className="lightbox-btn" onClick={handleDownload} aria-label="Download" title="Download image">
              <Download size={18} />
            </button>
            <button type="button" className="lightbox-btn" onClick={onClose} aria-label="Close lightbox" title="Close (Esc)">
              <X size={18} />
            </button>
          </div>
        </div>

        <div
          className="lightbox-stage"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ cursor: zoom > 1 ? (isDragging.current ? "grabbing" : "grab") : "default" }}
        >
          {images.length > 1 ? (
            <button type="button" className="lightbox-nav lightbox-nav-prev" onClick={goPrev} aria-label="Previous image">
              <ChevronLeft size={28} />
            </button>
          ) : null}

          <div
            className="lightbox-image-wrap"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: isDragging.current ? "none" : "transform 200ms ease"
            }}
          >
            <Image
              src={current.src}
              alt={current.alt}
              fill
              sizes="100vw"
              unoptimized
              style={{ objectFit: "contain" }}
              draggable={false}
            />
          </div>

          {images.length > 1 ? (
            <button type="button" className="lightbox-nav lightbox-nav-next" onClick={goNext} aria-label="Next image">
              <ChevronRight size={28} />
            </button>
          ) : null}
        </div>

        {current.caption ? (
          <div className="lightbox-caption">{current.caption}</div>
        ) : null}
      </div>
    </div>
  )
}
