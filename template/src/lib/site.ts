import config from '@payload-config'
import { getPayload } from 'payload'

import type { Site } from '@/payload-types'

import { defaultTheme } from './theme'

export const fallbackSite = {
  ...defaultTheme,
  font: 'modern',
  language: 'en',
  name: 'New website',
} as Site

/** The site settings, or safe defaults while the database is not set up (such as during a build). */
export async function getSite(): Promise<Site> {
  try {
    const payload = await getPayload({ config: await config })
    return await payload.findGlobal({ slug: 'site', overrideAccess: false })
  } catch {
    return fallbackSite
  }
}
