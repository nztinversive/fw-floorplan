"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import type { ReactNode } from "react"

export type BreadcrumbItem = {
  label: string
  href?: string
}

type BreadcrumbProps = {
  items: BreadcrumbItem[]
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        const separator = index > 0 ? (
          <ChevronRight size={12} className="breadcrumb-sep" aria-hidden />
        ) : null

        let node: ReactNode
        if (isLast || !item.href) {
          node = <span className="breadcrumb-current">{item.label}</span>
        } else {
          node = <Link href={item.href}>{item.label}</Link>
        }

        return (
          <span key={item.href ?? item.label} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            {separator}
            {node}
          </span>
        )
      })}
    </nav>
  )
}
