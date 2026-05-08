import type { Metadata } from "next"
import Link from "next/link"
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google"
import type { ReactNode } from "react"

import "@/app/globals.css"
import "@/app/studio.css"
import Providers from "@/app/providers"
import HeaderNav from "@/components/HeaderNav"
import StudioCommandPalette from "@/components/StudioCommandPalette"
import StudioTweaksPanel from "@/components/StudioTweaksPanel"

const displayFont = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400"],
  style: ["normal", "italic"]
})

const sansFont = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"]
})

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"]
})

export const metadata: Metadata = {
  title: "FW Floor Plan Studio",
  description: "Floor plan drafting, editing, and AI rendering studio."
}

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${sansFont.variable} ${monoFont.variable}`}>
        <Providers>
          <div className="app-shell">
            <header className="site-header topbar">
              <Link href="/" className="brand-lockup brand">
                <div className="brand-mark">F</div>
                <div className="brand-text">
                  <div className="brand-name">
                    Floor Plan <em>Studio</em>
                  </div>
                  <div className="brand-eyebrow">FADING WEST</div>
                </div>
              </Link>
              <HeaderNav />
            </header>
            {children}
            <StudioCommandPalette />
            <StudioTweaksPanel />
          </div>
        </Providers>
      </body>
    </html>
  )
}
