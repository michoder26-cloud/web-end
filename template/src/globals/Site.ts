import type { GlobalConfig, Validate } from 'payload'

import { anyone, isAdmin } from '../access'
import { defaultTheme, isHexColor, isSafeHref } from '../lib/theme'

const validateColor: Validate = (value) => !value || isHexColor(value) || 'Use a colour like #1f4d3a.'

export const Site: GlobalConfig = {
  slug: 'site',
  access: {
    read: anyone,
    update: isAdmin,
  },
  fields: [
    { name: 'name', type: 'text', defaultValue: 'New website', maxLength: 80, required: true },
    { name: 'tagline', type: 'text', maxLength: 160 },
    { name: 'language', type: 'text', defaultValue: 'en', maxLength: 12, required: true },
    { name: 'accent', type: 'text', defaultValue: defaultTheme.accent, validate: validateColor },
    { name: 'background', type: 'text', defaultValue: defaultTheme.background, validate: validateColor },
    { name: 'text', type: 'text', defaultValue: defaultTheme.text, validate: validateColor },
    {
      name: 'font',
      type: 'select',
      defaultValue: 'modern',
      options: ['modern', 'editorial', 'friendly'],
    },
    {
      name: 'nav',
      type: 'array',
      maxRows: 8,
      fields: [
        { name: 'label', type: 'text', maxLength: 40, required: true },
        {
          name: 'href',
          type: 'text',
          maxLength: 500,
          required: true,
          validate: ((value) => isSafeHref(value) || 'Use a path like /about or a full https: link.') as Validate,
        },
      ],
    },
    { name: 'footerText', type: 'textarea', maxLength: 500 },
    { name: 'email', type: 'email' },
  ],
}
