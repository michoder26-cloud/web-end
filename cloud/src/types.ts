export type Env = {
  ASSETS: Fetcher
  // How many automation steps led to this write, and how many runs one visitor's request may still start. Set only by automations.ts.
  automationBudget?: { left: number }
  automationDepth?: number
  DB: D1Database
  defer?: (work: Promise<unknown>) => void
  // SPIKE: serves frozen Wix pages at /frozen/<page>/<width>. See frozen-spike.ts.
  FROZEN_SPIKE?: string
  GOOGLE_API_BASE?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  RESEND_API_BASE?: string
  RESEND_API_KEY?: string
  STRIPE_API_BASE?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  WEBHOOK_ALLOW_HTTP?: string
}

export type Nav = { href: string; label: string }

export type Settings = {
  accent?: string
  accounts?: boolean
  address?: string
  allowedOrigins?: string[]
  background?: string
  bodyFont?: string
  cart?: boolean
  cartMembersOnly?: boolean
  currency?: string
  customCss?: string
  email?: string
  emailFrom?: string
  footerText?: string
  freeShippingOver?: number
  githubRepo?: string
  headerButtonHref?: string
  headerButtonLabel?: string
  headingFont?: string
  language?: string
  /** The main language first, then extra ones, such as ['th', 'en']. One or none means a single-language site. */
  languages?: string[]
  name: string
  nav?: Nav[]
  newsDailyLimit?: number
  newsletter?: boolean
  notifyEmail?: string
  officeLanguage?: string
  payCard?: boolean
  payCod?: boolean
  payPromptPay?: boolean
  payTransfer?: boolean
  phone?: string
  promptPayId?: string
  promptPayName?: string
  shippingFee?: number
  statistics?: boolean
  style?: string
  tagline?: string
  text?: string
  timeZone?: string
  transferDetails?: string
  translations?: Record<string, SiteTranslation>
  /** Set only on the copy made for visitors of an extra language, never stored. */
  viewLanguage?: string
}

/** The words of the menu, tagline, footer and similar settings in one extra language. Menu labels are keyed by their link. */
export type SiteTranslation = { footerText?: string; headerButtonLabel?: string; name?: string; nav?: Record<string, string>; tagline?: string; transferDetails?: string }

export type FormField = {
  label: string
  name: string
  options?: string[]
  optionsFrom?: string
  required?: boolean
  type: 'checkbox' | 'date' | 'email' | 'number' | 'phone' | 'select' | 'text' | 'textarea' | 'time'
}

export type Block = Record<string, any> & { type: string }

export type Customer = { email: string; id: number; name: string; role?: string }

export type Variant = {
  compare_price: string
  id: number
  item_id: number
  name: string
  price: string
  sort: number
  stock: null | number
}

export type Item = {
  body: string
  category: string
  collection: string
  compare_price: string
  id: number
  image_alt: string
  image_url: string
  link_href: string
  link_label: string
  price: string
  published: number
  site_id: number
  sort: number
  stock: null | number
  title: string
  translations?: string
  /** Set when shown in an extra language and something of it isn't translated yet. */
  untranslated?: boolean
  variants?: Variant[]
}

export type Order = {
  address: string
  created_at: string
  customer_id: null | number
  email: string
  id: number
  money_prefix: string
  money_suffix: string
  name: string
  note: string
  payment: string
  phone: string
  shipping: number
  site_id: number
  status: string
  subtotal: number
  language?: string
  total: number
}

export type OrderLine = {
  id: number
  item_id: null | number
  order_id: number
  quantity: number
  title: string
  unit_price: number
  variant: string
  variant_id: null | number
}

export type SiteRow = { id: number; live_settings?: null | string; live_version?: null | number; owner_customer_id?: null | number; settings: string; slug: string }
export type PageRow = {
  blocks: string
  description: string
  published: number
  slug: string
  title: string
  translations?: string
}
