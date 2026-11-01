import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access'
import { fieldTypes, isValidFieldName } from '../lib/data'

/** A kind of data the site owner needs, such as bookings. Claude defines these through MCP. */
export const DataTypes: CollectionConfig = {
  slug: 'data-types',
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: isAdmin,
    update: isAdmin,
  },
  admin: {
    defaultColumns: ['name', 'slug', 'whoCanSubmit', 'whoCanSee'],
    useAsTitle: 'name',
  },
  fields: [
    { name: 'name', type: 'text', maxLength: 80, required: true },
    {
      name: 'slug',
      type: 'text',
      index: true,
      required: true,
      unique: true,
      validate: (value: unknown) =>
        (typeof value === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) ||
        'Use lowercase letters, numbers and dashes.',
    },
    {
      name: 'whoCanSubmit',
      type: 'select',
      defaultValue: 'nobody',
      options: ['nobody', 'anyone', 'members'],
      required: true,
    },
    {
      name: 'whoCanSee',
      type: 'select',
      defaultValue: 'owner',
      options: ['owner', 'members', 'public'],
      required: true,
    },
    {
      name: 'fields',
      type: 'array',
      maxRows: 30,
      minRows: 1,
      required: true,
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          validate: (value: unknown) =>
            isValidFieldName(value) || 'Use lowercase letters, numbers and underscores.',
        },
        { name: 'label', type: 'text', maxLength: 80, required: true },
        { name: 'type', type: 'select', defaultValue: 'text', options: [...fieldTypes], required: true },
        { name: 'required', type: 'checkbox', defaultValue: false },
        { name: 'options', type: 'textarea', maxLength: 2000 },
        { name: 'public', type: 'checkbox', defaultValue: false },
      ],
    },
  ],
}
