"use client"

import Image from "next/image"
import { useState } from "react"

type ProgressiveImageProps = {
  src: string
  alt: string
  fill?: boolean
  sizes?: string
  className?: string
  onClick?: () => void
  style?: React.CSSProperties
}

export default function ProgressiveImage({
  src,
  alt,
  fill = true,
  sizes,
  className,
  onClick,
  style
}: ProgressiveImageProps) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className={`progressive-image${loaded ? " is-loaded" : ""}${className ? ` ${className}` : ""}`} onClick={onClick} style={style}>
      <div className="progressive-image-skeleton" />
      <Image
        src={src}
        alt={alt}
        fill={fill}
        sizes={sizes}
        unoptimized
        onLoad={() => setLoaded(true)}
        style={{ objectFit: "cover" }}
        draggable={false}
      />
    </div>
  )
}
