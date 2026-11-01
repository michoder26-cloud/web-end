export type Env = {
  ASSETS: Fetcher
  DB: D1Database
}

export type Nav = { href: string; label: string }

export type Settings = {
  accent?: string
  address?: string
  background?: string
  customCss?: string
  email?: string
  footerText?: string
  headerButtonHref?: string
  headerButtonLabel?: string
  language?: string
  name: string
  nav?: Nav[]
  phone?: string
  style?: string
  tagline?: string
  text?: string
}

export type FormField = {
  label: string
  name: string
  options?: string[]
  required?: boolean
  type: 'checkbox' | 'date' | 'email' | 'number' | 'phone' | 'select' | 'text' | 'textarea' | 'time'
}

export type Block = Record<string, any> & { type: string }

export type SiteRow = { id: number; settings: string; slug: string }
export type PageRow = {
  blocks: string
  description: string
  published: number
  slug: string
  title: string
}
