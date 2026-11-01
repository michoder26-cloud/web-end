import type { CollectionConfig } from 'payload'

import { anyone, isAdmin } from '../access'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: anyone,
    update: isAdmin,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    // These are not supported on Workers yet due to lack of sharp
    crop: false,
    focalPoint: false,
    mimeTypes: ['image/*'],
  },
}
