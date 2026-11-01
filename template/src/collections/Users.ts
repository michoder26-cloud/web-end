import type { CollectionConfig } from 'payload'

import { adminOnlyField, canUseAdminPanel, isAdmin, isAdminOrSelf } from '../access'

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: canUseAdminPanel,
    create: isAdmin,
    delete: isAdmin,
    read: isAdminOrSelf,
    unlock: isAdmin,
    update: isAdminOrSelf,
  },
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    lockTime: 15 * 60 * 1000,
    maxLoginAttempts: 5,
    // Lets the owner connect Claude with a key instead of their password.
    useAPIKey: true,
  },
  fields: [
    // Email added by default
    {
      name: 'roles',
      type: 'select',
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
      defaultValue: ['member'],
      hasMany: true,
      options: ['admin', 'member'],
      required: true,
      saveToJWT: true,
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        if (operation !== 'create') return data
        // The very first account owns the site.
        const { totalDocs } = await req.payload.count({ collection: 'users', req })
        return totalDocs === 0 ? { ...data, roles: ['admin'] } : data
      },
    ],
  },
}
