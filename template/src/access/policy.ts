/**
 * Who may do what, written down once and enforced by tests/int/access.int.spec.ts.
 * Every collection must be listed here, so nobody can add one without deciding its access.
 *
 * yes: allowed for every document
 * no: never allowed
 * own: allowed only for documents that belong to that person
 */
export type Rule = 'yes' | 'no' | 'own'
export type Operations = { create: Rule; read: Rule; update: Rule; delete: Rule }
export type CollectionPolicy = { anonymous: Operations; member: Operations }

export const accessPolicy: Record<string, CollectionPolicy> = {
  users: {
    anonymous: { create: 'no', read: 'no', update: 'no', delete: 'no' },
    member: { create: 'no', read: 'own', update: 'own', delete: 'no' },
  },
  media: {
    anonymous: { create: 'no', read: 'yes', update: 'no', delete: 'no' },
    member: { create: 'no', read: 'yes', update: 'no', delete: 'no' },
  },
}
