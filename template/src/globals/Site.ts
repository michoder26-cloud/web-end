import type { GlobalConfig, Validate } from 'payload'

import { anyone, isAdmin } from '../access'
import { defaultTheme, isHexColor, isSafeHref, siteStyles } from '../lib/theme'

const validateColor: Validate = (value) => !value || isHexColor(value) || 'Use a colour like #1f4d3a.'
const validateHref: Validate = (value) =>
  !value || isSafeHref(value) || 'Use a path like /about or a full https: link.'

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
    { name: 'style', type: 'select', defaultValue: 'studio', options: [...siteStyles] },
    { name: 'accent', type: 'text', defaultValue: defaultTheme.accent, validate: validateColor },
    { name: 'background', type: 'text', defaultValue: defaultTheme.background, validate: validateColor },
    { name: 'text', type: 'text', defaultValue: defaultTheme.text, validate: validateColor },
    {
      name: 'nav',
      type: 'array',
      maxRows: 8,
      fields: [
        { name: 'label', type: 'text', maxLength: 40, required: true },
        { name: 'href', type: 'text', maxLength: 500, required: true, validate: validateHref },
      ],
    },
    { name: 'headerButtonLabel', type: 'text', maxLength: 40 },
    { name: 'headerButtonHref', type: 'text', maxLength: 500, validate: validateHref },
    { name: 'footerText', type: 'textarea', maxLength: 500 },
    { name: 'email', type: 'email' },
    { name: 'phone', type: 'text', maxLength: 40 },
    { name: 'address', type: 'textarea', maxLength: 300 },
    { name: 'allowSignup', type: 'checkbox', defaultValue: false },
    {
      name: 'labels',
      type: 'group',
      fields: [
        'account',
        'login',
        'signup',
        'logout',
        'email',
        'password',
        'loginFirst',
        'loginError',
        'signupError',
        'myRecords',
        'noRecords',
        'deleteAccount',
        'deleteConfirm',
      ].map((name) => ({ name, type: 'text' as const, maxLength: 200 })),
    },
  ],
}
