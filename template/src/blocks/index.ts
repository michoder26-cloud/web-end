import type { Block, Validate } from 'payload'

import { isSafeHref } from '../lib/theme'

const validateHref: Validate = (value) =>
  !value || isSafeHref(value) || 'Use a path like /about, or a full https:, mailto: or tel: link.'

const heading = { name: 'heading', type: 'text', maxLength: 160 } as const
const button = [
  { name: 'buttonLabel', type: 'text', maxLength: 60 },
  { name: 'buttonHref', type: 'text', maxLength: 500, validate: validateHref },
] as const

export const blocks: Block[] = [
  {
    slug: 'hero',
    fields: [
      { ...heading, required: true },
      { name: 'text', type: 'textarea', maxLength: 600 },
      ...button,
      { name: 'image', type: 'upload', relationTo: 'media' },
    ],
  },
  {
    slug: 'text',
    fields: [heading, { name: 'body', type: 'textarea', maxLength: 8000, required: true }],
  },
  {
    slug: 'features',
    fields: [
      heading,
      {
        name: 'items',
        type: 'array',
        maxRows: 12,
        minRows: 1,
        required: true,
        fields: [
          { name: 'title', type: 'text', maxLength: 120, required: true },
          { name: 'text', type: 'textarea', maxLength: 600 },
        ],
      },
    ],
  },
  {
    slug: 'gallery',
    fields: [
      heading,
      {
        name: 'images',
        type: 'array',
        maxRows: 24,
        minRows: 1,
        required: true,
        fields: [
          { name: 'image', type: 'upload', relationTo: 'media', required: true },
          { name: 'caption', type: 'text', maxLength: 200 },
        ],
      },
    ],
  },
  {
    slug: 'faq',
    fields: [
      heading,
      {
        name: 'items',
        type: 'array',
        maxRows: 30,
        minRows: 1,
        required: true,
        fields: [
          { name: 'question', type: 'text', maxLength: 240, required: true },
          { name: 'answer', type: 'textarea', maxLength: 2000, required: true },
        ],
      },
    ],
  },
  {
    slug: 'cta',
    fields: [{ ...heading, required: true }, { name: 'text', type: 'textarea', maxLength: 600 }, ...button],
  },
  {
    slug: 'contact',
    fields: [
      heading,
      { name: 'text', type: 'textarea', maxLength: 600 },
      { name: 'buttonLabel', type: 'text', maxLength: 60 },
      { name: 'nameLabel', type: 'text', maxLength: 60 },
      { name: 'emailLabel', type: 'text', maxLength: 60 },
      { name: 'messageLabel', type: 'text', maxLength: 60 },
      { name: 'sentMessage', type: 'text', maxLength: 200 },
      { name: 'errorMessage', type: 'text', maxLength: 200 },
    ],
  },
]
