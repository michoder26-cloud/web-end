import type { FormField } from './types'

const limits: Record<string, number> = { email: 254, phone: 30, text: 500, textarea: 5000 }

const clean = (field: FormField, value: string): null | number | string => {
  const limit = limits[field.type]
  if (limit && value.length > limit) return null
  switch (field.type) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null
    case 'phone':
      return /^[+\d][\d\s()-]{4,29}$/.test(value) ? value : null
    case 'number': {
      const number = Number(value)
      return Number.isFinite(number) ? number : null
    }
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : null
    case 'time':
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null
    case 'select':
      return field.options?.includes(value) ? value : null
    default:
      return value
  }
}

/** Keeps only the fields the form defines. Anything else sent by a browser is dropped. */
export function validateEntry(fields: FormField[], input: FormData) {
  const data: Record<string, unknown> = {}
  for (const field of fields) {
    const raw = input.get(field.name)
    if (field.type === 'checkbox') {
      if (field.required && raw !== 'on') return null
      data[field.name] = raw === 'on'
      continue
    }
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) {
      if (field.required) return null
      continue
    }
    const cleaned = clean(field, value)
    if (cleaned === null) return null
    data[field.name] = cleaned
  }
  return data
}
