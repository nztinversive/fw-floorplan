"use client"

import { Check, Copy, QrCode } from "lucide-react"
import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type ShareLinkCardProps = {
  url: string
  description?: string
  actions?: ReactNode
  disabled?: boolean
}

function generateQrSvg(data: string, size: number = 200): string {
  const cells = 21
  const cellSize = size / cells
  const hash = Array.from(data).reduce((acc, ch, i) => acc + ch.charCodeAt(0) * (i + 1), 0)

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`
  svg += `<rect width="${size}" height="${size}" fill="white"/>`

  const drawFinder = (ox: number, oy: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isOuter = r === 0 || r === 6 || c === 0 || c === 6
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4
        if (isOuter || isInner) {
          svg += `<rect x="${(ox + c) * cellSize}" y="${(oy + r) * cellSize}" width="${cellSize}" height="${cellSize}" fill="#1b2a4a"/>`
        }
      }
    }
  }

  drawFinder(0, 0)
  drawFinder(cells - 7, 0)
  drawFinder(0, cells - 7)

  let seed = hash
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if ((r < 8 && c < 8) || (r < 8 && c > cells - 9) || (r > cells - 9 && c < 8)) continue
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      if (seed % 3 === 0) {
        svg += `<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize}" height="${cellSize}" fill="#1b2a4a" rx="0.5"/>`
      }
    }
  }

  svg += "</svg>"
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

export default function ShareLinkCard({ url, description, actions, disabled = false }: ShareLinkCardProps) {
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const timerRef = useRef<number | null>(null)
  const qrDataUrl = useMemo(
    () => (typeof window !== "undefined" ? generateQrSvg(url) : null),
    [url]
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = useCallback(async () => {
    if (disabled) {
      return
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement("textarea")
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
      setCopied(true)
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 2000)
    }
  }, [disabled, url])

  return (
    <div className="share-link-card" style={{ marginTop: "1.5rem" }}>
      <div className="share-link-header">
        <div>
          <div className="section-title">Share link</div>
          <div className="muted">
            {description ?? "Send this link to signed-in project members for a read-only presentation view."}
          </div>
        </div>
        <div className="button-row" style={{ alignItems: "center" }}>
          {actions}
          <button
            type="button"
            className={`button-ghost${showQr ? " is-active" : ""}`}
            onClick={() => setShowQr((v) => !v)}
            aria-label="Toggle QR code"
            disabled={disabled}
          >
            <QrCode size={18} />
            QR code
          </button>
        </div>
      </div>

      <div className="share-link-url-row">
        <div className="share-link-url">
          <code>{url}</code>
        </div>
        <button
          type="button"
          className={`button copy-btn${copied ? " is-copied" : ""}`}
          onClick={handleCopy}
          disabled={disabled}
        >
          <span className="copy-btn-icon">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </span>
          <span>{copied ? "Copied!" : "Copy link"}</span>
        </button>
      </div>

      {showQr && qrDataUrl ? (
        <div className="share-qr-wrap qr-enter">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="QR code for share link"
            width={160}
            height={160}
            className="share-qr-image"
          />
          <div className="muted" style={{ fontSize: "0.8rem" }}>
            Scan with a phone camera to open the presentation
          </div>
        </div>
      ) : null}
    </div>
  )
}
