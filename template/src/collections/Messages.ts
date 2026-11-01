import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access'

/** Created only by /api/contact. Visitors never get direct access to this collection. */
export const Messages: CollectionConfig = {
  slug: 'messages',
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: isAdmin,
    update: isAdmin,
  },
  admin: {
    defaultColumns: ['name', 'email', 'createdAt'],
    useAsTitle: 'email',
  },
  fields: [
    { name: 'name', type: 'text', maxLength: 120, required: true },
    { name: 'email', type: 'email', required: true },
    { name: 'message', type: 'textarea', maxLength: 5000, required: true },
    { name: 'page', type: 'text', maxLength: 200 },
  ],
}
