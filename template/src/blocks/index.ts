import type { Block, Field, Validate } from 'payload'

import { isSafeHref } from '../lib/theme'

const validateHref: Validate = (value) =>
  !value || isSafeHref(value) || 'Use a path like /about, or a full https:, mailto: or tel: link.'

const heading = { name: 'heading', type: 'text', maxLength: 160 } as const
const intro = { name: 'intro', type: 'textarea', maxLength: 400 } as const
const button: Field[] = [
  { name: 'buttonLabel', type: 'text', maxLength: 60 },
  { name: 'buttonHref', type: 'text', maxLength: 500, validate: validateHref },
]
const tone: Field = {
  name: 'tone',
  type: 'select',
  defaultValue: 'plain',
  options: ['plain', 'tint', 'dark'],
}

export const blocks: Block[] = [
  {
    slug: 'hero',
    fields: [
      { name: 'eyebrow', type: 'text', maxLength: 80 },
      { ...heading, required: true },
      { name: 'text', type: 'textarea', maxLength: 600 },
      ...button,
      { name: 'image', type: 'upload', relationTo: 'media' },
      { name: 'layout', type: 'select', defaultValue: 'split', options: ['split', 'centered', 'cover'] },
      tone,
    ],
  },
  {
    slug: 'text',
    fields: [heading, { name: 'body', type: 'textarea', maxLength: 8000, required: true }, tone],
  },
  {
    slug: 'split',
    fields: [
      heading,
      { name: 'body', type: 'textarea', maxLength: 3000, required: true },
      { name: 'image', type: 'upload', relationTo: 'media', required: true },
      { name: 'imageSide', type: 'select', defaultValue: 'right', options: ['left', 'right'] },
      ...button,
      tone,
    ],
  },
  {
    slug: 'features',
    fields: [
      heading,
      intro,
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
      tone,
    ],
  },
  {
    slug: 'steps',
    fields: [
      heading,
      intro,
      {
        name: 'items',
        type: 'array',
        maxRows: 8,
        minRows: 1,
        required: true,
        fields: [
          { name: 'title', type: 'text', maxLength: 120, required: true },
          { name: 'text', type: 'textarea', maxLength: 600 },
        ],
      },
      tone,
    ],
  },
  {
    slug: 'stats',
    fields: [
      heading,
      {
        name: 'items',
        type: 'array',
        maxRows: 6,
        minRows: 1,
        required: true,
        fields: [
          { name: 'value', type: 'text', maxLength: 24, required: true },
          { name: 'label', type: 'text', maxLength: 120, required: true },
        ],
      },
      tone,
    ],
  },
  {
    slug: 'pricing',
    fields: [
      heading,
      intro,
      {
        name: 'plans',
        type: 'array',
        maxRows: 6,
        minRows: 1,
        required: true,
        fields: [
          { name: 'name', type: 'text', maxLength: 80, required: true },
          { name: 'price', type: 'text', maxLength: 40, required: true },
          { name: 'note', type: 'text', maxLength: 120 },
          { name: 'features', type: 'textarea', maxLength: 1000 },
          ...button,
          { name: 'highlighted', type: 'checkbox', defaultValue: false },
        ],
      },
      tone,
    ],
  },
  {
    slug: 'testimonials',
    fields: [
      heading,
      {
        name: 'items',
        type: 'array',
        maxRows: 9,
        minRows: 1,
        required: true,
        fields: [
          { name: 'quote', type: 'textarea', maxLength: 600, required: true },
          { name: 'name', type: 'text', maxLength: 80, required: true },
          { name: 'role', type: 'text', maxLength: 120 },
        ],
      },
      tone,
    ],
  },
  {
    slug: 'team',
    fields: [
      heading,
      intro,
      {
        name: 'members',
        type: 'array',
        maxRows: 24,
        minRows: 1,
        required: true,
        fields: [
          { name: 'name', type: 'text', maxLength: 80, required: true },
          { name: 'role', type: 'text', maxLength: 120 },
          { name: 'text', type: 'textarea', maxLength: 500 },
          { name: 'image', type: 'upload', relationTo: 'media' },
        ],
      },
      tone,
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
      tone,
    ],
  },
  {
    slug: 'info',
    fields: [
      heading,
      {
        name: 'items',
        type: 'array',
        maxRows: 12,
        minRows: 1,
        required: true,
        fields: [
          { name: 'label', type: 'text', maxLength: 80, required: true },
          { name: 'value', type: 'textarea', maxLength: 400, required: true },
        ],
      },
      ...button,
      tone,
    ],
  },
  {
    slug: 'dataForm',
    fields: [
      { name: 'dataType', type: 'text', maxLength: 80, required: true },
      heading,
      intro,
      { name: 'buttonLabel', type: 'text', maxLength: 60 },
      { name: 'sentMessage', type: 'text', maxLength: 200 },
      { name: 'errorMessage', type: 'text', maxLength: 200 },
      tone,
    ],
  },
  {
    slug: 'dataList',
    fields: [
      { name: 'dataType', type: 'text', maxLength: 80, required: true },
      heading,
      intro,
      { name: 'emptyMessage', type: 'text', maxLength: 200 },
      { name: 'limit', type: 'number', defaultValue: 24, max: 100, min: 1 },
      tone,
    ],
  },
  {
    slug: 'pageList',
    fields: [
      { name: 'category', type: 'text', maxLength: 60, required: true },
      heading,
      intro,
      { name: 'emptyMessage', type: 'text', maxLength: 200 },
      { name: 'limit', type: 'number', defaultValue: 12, max: 50, min: 1 },
      tone,
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
      tone,
    ],
  },
  {
    slug: 'cta',
    fields: [
      { ...heading, required: true },
      { name: 'text', type: 'textarea', maxLength: 600 },
      ...button,
      { ...tone, defaultValue: 'dark' } as Field,
    ],
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
      tone,
    ],
  },
]
