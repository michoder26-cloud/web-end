import type { CollectionConfig } from 'payload'

import { isAdmin, isAdminOrPublished } from '../access'
import { blocks } from '../blocks'

const reservedSlugs = new Set(['admin', 'api', '_next'])

export const isValidSlug = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && !reservedSlugs.has(value)

export const Pages: CollectionConfig = {
  slug: 'pages',
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: isAdminOrPublished,
    update: isAdmin,
  },
  admin: {
    defaultColumns: ['title', 'slug', 'published', 'updatedAt'],
    useAsTitle: 'title',
  },
  fields: [
    { name: 'title', type: 'text', maxLength: 120, required: true },
    {
      name: 'slug',
      type: 'text',
      index: true,
      required: true,
      unique: true,
      validate: (value: unknown) =>
        isValidSlug(value) || 'Use lowercase letters, numbers and dashes. The home page is "home".',
    },
    { name: 'description', type: 'textarea', maxLength: 300, required: true },
    { name: 'published', type: 'checkbox', defaultValue: false, index: true },
    { name: 'layout', type: 'blocks', blocks, maxRows: 40 },
  ],
}
