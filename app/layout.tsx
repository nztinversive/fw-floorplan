import type { Metadata } from "next"
import Link from "next/link"
import { Cormorant_Garamond, Source_Sans_3 } from "next/font/google"
import type { ReactNode } from "react"

import "@/app/globals.css"
import Providers from "@/app/providers"

const displayFont = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700"]
})

const sansFont = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"]
})

export const metadata: Metadata = {
  title: "FW Floor Plan Studio",
  description: "Local-first floor plan drafting and review studio."
}

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${sansFont.variable}`}>
        <Providers>
          <div className="app-shell">
            <header className="site-header">
              <Link href="/" className="brand-lockup">
                <div className="brand-mark">FW</div>
                <div>
                  <div className="brand-title">FW Floor Plan Studio</div>
                  <div className="brand-subtitle">Draft, edit, and prepare homes for rendering</div>
                </div>
              </Link>
              <div className="header-pill">Local-first workflow</div>
            </header>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  )
}
