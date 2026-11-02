export type Env = {
  ASSETS: Fetcher
  DB: D1Database
  STRIPE_API_BASE?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
}

export type Nav = { href: string; label: string }

export type Settings = {
  accent?: string
  accounts?: boolean
  address?: string
  background?: string
  cart?: boolean
  cartMembersOnly?: boolean
  currency?: string
  customCss?: string
  email?: string
  footerText?: string
  freeShippingOver?: number
  headerButtonHref?: string
  headerButtonLabel?: string
  language?: string
  name: string
  nav?: Nav[]
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

export type Customer = { email: string; id: number; name: string }

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

export type SiteRow = { id: number; settings: string; slug: string }
export type PageRow = {
  blocks: string
  description: string
  published: number
  slug: string
  title: string
}
