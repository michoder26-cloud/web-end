import type { CollectionConfig } from 'payload'
import { ValidationError } from 'payload'

import { isAdmin, isAdminOrOwner } from '../access'
import { formatValue, validateRecord, type FieldDefinition } from '../lib/data'

/**
 * One entry of a data type. Visitors only reach these through /api/data/[slug] and server-rendered
 * pages, which show just the fields marked public. Direct API access is limited to a person's own.
 */
export const Records: CollectionConfig = {
  slug: 'records',
  labels: { plural: 'Entries', singular: 'Entry' },
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: isAdminOrOwner,
    update: isAdmin,
  },
  admin: {
    defaultColumns: ['summary', 'dataType', 'status', 'createdAt'],
    useAsTitle: 'summary',
  },
  fields: [
    { name: 'dataType', type: 'relationship', index: true, relationTo: 'data-types', required: true },
    {
      name: 'details',
      type: 'ui',
      admin: { components: { Field: '@/components/RecordSummary#RecordSummary' } },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'new',
      index: true,
      options: ['new', 'confirmed', 'published', 'archived'],
      required: true,
    },
    { name: 'summary', type: 'text', admin: { hidden: true } },
    { name: 'owner', type: 'relationship', admin: { position: 'sidebar' }, index: true, relationTo: 'users' },
    {
      name: 'data',
      type: 'json',
      admin: {
        description: 'The same details as stored. You only need this to correct an entry by hand.',
        position: 'sidebar',
      },
      required: true,
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        const typeId = data.dataType ?? originalDoc?.dataType
        const definition = await req.payload.findByID({
          collection: 'data-types',
          depth: 0,
          id: typeof typeId === 'object' ? typeId.id : typeId,
          req,
        })
        const fields = (definition.fields ?? []) as FieldDefinition[]
        const result = validateRecord(fields, (data.data ?? originalDoc?.data ?? {}) as Record<string, unknown>)
        if (!result.ok) {
          throw new ValidationError({
            collection: 'records',
            errors: result.errors.map((message) => ({ message, path: 'data' })),
          })
        }
        const first = fields.find((field) => result.data[field.name] !== undefined)
        return {
          ...data,
          data: result.data,
          summary: first ? formatValue(result.data[first.name]).slice(0, 120) : definition.name,
        }
      },
    ],
  },
}
