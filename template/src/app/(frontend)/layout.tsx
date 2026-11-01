import type { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

import { getSite } from '@/lib/site'
import { defaultTheme, fontStacks, isHexColor, isSafeHref, readableOn, type FontStyle } from '@/lib/theme'

import './styles.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite()
  return {
    description: site.tagline || undefined,
    title: { default: site.name, template: `%s | ${site.name}` },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite()
  const accent = isHexColor(site.accent) ? site.accent : defaultTheme.accent
  const background = isHexColor(site.background) ? site.background : defaultTheme.background
  const text = isHexColor(site.text) ? site.text : defaultTheme.text
  const theme = {
    '--accent': accent,
    '--on-accent': readableOn(accent),
    '--bg': background,
    '--font': fontStacks[(site.font as FontStyle) || 'modern'] || fontStacks.modern,
    '--ink': text,
  } as React.CSSProperties
  const lang = /^[a-zA-Z-]{2,12}$/.test(site.language) ? site.language : 'en'

  return (
    <html lang={lang}>
      <body style={theme}>
        <header className="site-header">
          <div className="wrap site-header__inner">
            <Link className="site-name" href="/">
              {site.name}
            </Link>
            {site.nav && site.nav.length > 0 && (
              <nav aria-label="Main">
                {site.nav
                  .filter((item) => isSafeHref(item.href))
                  .map((item) => (
                    <a href={item.href} key={item.id || item.href}>
                      {item.label}
                    </a>
                  ))}
              </nav>
            )}
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <strong>{site.name}</strong>
            {site.footerText && <p>{site.footerText}</p>}
            {site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}
          </div>
        </footer>
      </body>
    </html>
  )
}
