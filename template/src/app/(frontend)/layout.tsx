import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/fredoka'
import '@fontsource-variable/inter'
import '@fontsource-variable/manrope'
import '@fontsource-variable/noto-sans-thai'
import '@fontsource-variable/noto-sans-thai-looped'
import '@fontsource-variable/noto-serif-thai'
import '@fontsource-variable/nunito'
import '@fontsource-variable/source-serif-4'
import '@fontsource-variable/space-grotesk'
import type { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

import { labelsFrom } from '@/lib/session'
import { getSite } from '@/lib/site'
import { contrast, defaultTheme, isHexColor, isSafeHref, isSiteStyle, readableOn } from '@/lib/theme'

import './styles.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite()
  return {
    description: site.tagline || site.name,
    title: { default: site.name, template: `%s | ${site.name}` },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite()
  const accent = isHexColor(site.accent) ? site.accent : defaultTheme.accent
  const background = isHexColor(site.background) ? site.background : defaultTheme.background
  const text = isHexColor(site.text) ? site.text : defaultTheme.text
  const accentOnDark = contrast(accent, text) >= 3 ? accent : background
  // Small coloured words need more contrast than buttons, so they fall back to the text colour.
  const theme = {
    '--accent': accent,
    '--accent-dark': accentOnDark,
    '--accent-text': contrast(accent, background) >= 5 ? accent : text,
    '--accent-text-dark': contrast(accent, text) >= 5 ? accent : background,
    '--base-bg': background,
    '--base-ink': text,
    '--on-accent': readableOn(accent),
    '--on-accent-dark': readableOn(accentOnDark),
  } as React.CSSProperties
  const lang = /^[a-zA-Z-]{2,12}$/.test(site.language) ? site.language : 'en'
  const nav = (site.nav ?? []).filter((item) => isSafeHref(item.href))

  return (
    <html lang={lang}>
      <body data-style={isSiteStyle(site.style) ? site.style : 'studio'} style={theme}>
        <header className="site-header">
          <div className="wrap site-header__inner">
            <Link className="site-name" href="/">
              {site.name}
            </Link>
            {nav.length > 0 && (
              <nav aria-label="Main">
                {nav.map((item) => (
                  <a href={item.href} key={item.id || item.href}>
                    {item.label}
                  </a>
                ))}
              </nav>
            )}
            {site.allowSignup && (
              <Link className="site-account" href="/account">
                {labelsFrom(site.labels).account}
              </Link>
            )}
            {site.headerButtonLabel && isSafeHref(site.headerButtonHref) && (
              <a className="button button--small" href={site.headerButtonHref}>
                {site.headerButtonLabel}
              </a>
            )}
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="wrap site-footer__grid">
            <div>
              <p className="site-footer__name">{site.name}</p>
              {site.tagline && <p>{site.tagline}</p>}
              {site.footerText && <p className="pre-line">{site.footerText}</p>}
            </div>
            {nav.length > 0 && (
              <nav aria-label="Footer">
                {nav.map((item) => (
                  <a href={item.href} key={item.id || item.href}>
                    {item.label}
                  </a>
                ))}
              </nav>
            )}
            {(site.email || site.phone || site.address) && (
              <address>
                {site.address && <p className="pre-line">{site.address}</p>}
                {site.phone && <a href={`tel:${site.phone.replace(/[^\d+]/g, '')}`}>{site.phone}</a>}
                {site.email && <a href={`mailto:${site.email}`}>{site.email}</a>}
              </address>
            )}
          </div>
        </footer>
      </body>
    </html>
  )
}
