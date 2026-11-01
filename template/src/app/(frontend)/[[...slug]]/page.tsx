import config from '@payload-config'
import type { Metadata } from 'next'
import { headers } from 'next/headers.js'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import { PageBlocks } from '@/components/PageBlocks'
import { getSessionUser, labelsFrom } from '@/lib/session'
import { getSite } from '@/lib/site'

type Props = {
  params: Promise<{ slug?: string[] }>
  searchParams: Promise<{ error?: string; sent?: string }>
}

const findPage = async (segments: string[] = [], access?: { user: Awaited<ReturnType<typeof getSessionUser>> }) => {
  if (segments.length > 1) return null
  const payload = await getPayload({ config: await config })
  const { docs } = await payload.find({
    collection: 'pages',
    depth: 2,
    limit: 1,
    overrideAccess: !access,
    user: access?.user,
    where: { slug: { equals: segments[0] || 'home' } },
  })
  return docs[0] ?? null
}

const canonicalFor = async (segments: string[] = []) => {
  const list = await headers()
  const host = list.get('x-forwarded-host') || list.get('host')
  const protocol = list.get('x-forwarded-proto') || (host?.startsWith('localhost') ? 'http' : 'https')
  return `${protocol}://${host}/${segments.join('/')}`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = await findPage(slug, { user: await getSessionUser() })
  if (!page) return {}
  const site = await getSite()
  const canonical = await canonicalFor(slug)
  return {
    alternates: { canonical },
    description: page.description,
    openGraph: {
      description: page.description,
      siteName: site.name,
      title: page.title,
      type: 'website',
      url: canonical,
    },
    robots: page.visibility === 'members' ? { index: false } : undefined,
    title: slug?.length ? page.title : { absolute: page.title },
  }
}

export default async function SitePage({ params, searchParams }: Props) {
  const { slug } = await params
  const user = await getSessionUser()
  const page = await findPage(slug, { user })

  if (!page) {
    // A members-only page sends visitors to log in. A draft stays a plain 404.
    if (!user) {
      const hidden = await findPage(slug)
      if (hidden?.published && hidden.visibility === 'members') redirect('/login')
    }
    if (slug?.length) notFound()
    return (
      <section className="block block--hero tone-plain">
        <div className="wrap">
          <h1>Your website is ready.</h1>
          <p className="lead">Connect it to Claude and describe what you want. Your pages appear here.</p>
        </div>
      </section>
    )
  }

  const site = await getSite()
  const { error, sent } = await searchParams
  const pagePath = `/${slug?.join('/') || ''}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    description: page.description,
    isPartOf: { '@type': 'WebSite', name: site.name },
    name: page.title,
    url: await canonicalFor(slug),
  }

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        type="application/ld+json"
      />
      <PageBlocks
        contactState={sent === '1' ? 'sent' : error === '1' ? 'error' : undefined}
        error={error}
        labels={labelsFrom(site.labels)}
        language={site.language}
        page={page}
        pagePath={pagePath}
        sent={sent}
        user={user}
      />
    </>
  )
}
