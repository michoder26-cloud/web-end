export type Env = {
  ASSETS: Fetcher
  DB: D1Database
  defer?: (work: Promise<unknown>) => void
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
  language?: string
  name: string
  nav?: Nav[]
  notifyEmail?: string
  payCard?: boolean
  payCod?: boolean
  payTransfer?: boolean
  phone?: string
  shippingFee?: number
  style?: string
  tagline?: string
  text?: string
  transferDetails?: string
}

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

export type SiteRow = { id: number; live_settings?: null | string; live_version?: null | number; settings: string; slug: string }
export type PageRow = {
  blocks: string
  description: string
  published: number
  slug: string
  title: string
}
