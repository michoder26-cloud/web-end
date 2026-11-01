import type { DataType } from '@/payload-types'

export const fieldTypes = ['text', 'textarea', 'email', 'phone', 'number', 'date', 'time', 'select', 'checkbox', 'url'] as const
export type FieldType = (typeof fieldTypes)[number]
export type FieldDefinition = NonNullable<DataType['fields']>[number]

const reservedFieldNames = new Set(['website', 'page', 'constructor', 'prototype'])

export const isValidFieldName = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(value) && !reservedFieldNames.has(value)

export const optionsOf = (field: Pick<FieldDefinition, 'options'>) =>
  (field.options ?? '').split('\n').map((option) => option.trim()).filter(Boolean)

const limits: Partial<Record<FieldType, number>> = { email: 254, phone: 30, text: 500, textarea: 5000, url: 500 }

const isValidDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))

/** The checks for one value. Returns the clean value, or null when it isn't acceptable. */
const clean = (field: FieldDefinition, value: string): boolean | null | number | string => {
  const limit = limits[field.type as FieldType]
  if (limit && value.length > limit) return null
  switch (field.type) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null
    case 'phone':
      return /^[+\d][\d\s()-]{4,29}$/.test(value) ? value : null
    case 'number': {
      const number = Number(value)
      return value !== '' && Number.isFinite(number) ? number : null
    }
    case 'date':
      return isValidDate(value) ? value : null
    case 'time':
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null
    case 'select':
      return optionsOf(field).includes(value) ? value : null
    case 'url':
      return /^https:\/\/\S+$/.test(value) ? value : null
    default:
      return value
  }
}

export type ValidationResult =
  | { data: Record<string, unknown>; errors: []; ok: true }
  | { data?: undefined; errors: string[]; ok: false }

/** Keeps only the fields the data type defines. Anything else sent by a browser is dropped. */
export function validateRecord(fields: FieldDefinition[], input: Record<string, unknown>): ValidationResult {
  const data: Record<string, unknown> = {}
  const errors: string[] = []
  for (const field of fields) {
    const raw = Object.hasOwn(input, field.name) ? input[field.name] : undefined
    if (field.type === 'checkbox') {
      const checked = raw === true || raw === 'on' || raw === 'true'
      if (field.required && !checked) errors.push(`${field.label} is required.`)
      data[field.name] = checked
      continue
    }
    const value = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : ''
    if (!value) {
      if (field.required) errors.push(`${field.label} is required.`)
      continue
    }
    const cleaned = clean(field, value)
    if (cleaned === null) errors.push(`${field.label} is not valid.`)
    else data[field.name] = cleaned
  }
  return errors.length ? { errors, ok: false } : { data, errors: [], ok: true }
}

export const formatValue = (value: unknown) => {
  if (value === true) return '✓'
  if (value === false || value === undefined || value === null) return ''
  return String(value)
}

/** Refuses form posts sent from another website while someone is logged in here. */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
