/**
 * Who may do what, written down once and enforced by tests/int/access.int.spec.ts.
 * Every collection must be listed here, so nobody can add one without deciding its access.
 *
 * yes: allowed for every document
 * no: never allowed
 * some: allowed only for some documents, such as their own or published ones
 */
export type Rule = 'yes' | 'no' | 'some'
export type Operations = { create: Rule; read: Rule; update: Rule; delete: Rule }
export type CollectionPolicy = { anonymous: Operations; member: Operations }

const nothing: Operations = { create: 'no', read: 'no', update: 'no', delete: 'no' }

export const accessPolicy: Record<string, CollectionPolicy> = {
  users: {
    anonymous: nothing,
    member: { create: 'no', read: 'some', update: 'some', delete: 'no' },
  },
  media: {
    anonymous: { ...nothing, read: 'yes' },
    member: { ...nothing, read: 'yes' },
  },
  pages: {
    anonymous: { ...nothing, read: 'some' },
    member: { ...nothing, read: 'some' },
  },
  messages: {
    anonymous: nothing,
    member: nothing,
  },
}
