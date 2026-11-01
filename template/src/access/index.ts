import type { Access, FieldAccess, PayloadRequest } from 'payload'

const hasRole = (user: PayloadRequest['user'], role: string) =>
  Boolean((user as { roles?: string[] | null } | null)?.roles?.includes(role))

export const anyone: Access = () => true

export const nobody: Access = () => false

export const isLoggedIn: Access = ({ req: { user } }) => Boolean(user)

export const isAdmin: Access = ({ req: { user } }) => hasRole(user, 'admin')

/** Admins see everything; everyone else only their own user record. */
export const isAdminOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false
  if (hasRole(user, 'admin')) return true
  return { id: { equals: user.id } }
}

/** Admins see everything; everyone else only documents in their `owner` field. */
export const isAdminOrOwner: Access = ({ req: { user } }) => {
  if (!user) return false
  if (hasRole(user, 'admin')) return true
  return { owner: { equals: user.id } }
}

export const adminOnlyField: FieldAccess = ({ req: { user } }) => hasRole(user, 'admin')

export const canUseAdminPanel = ({ req: { user } }: { req: PayloadRequest }) =>
  hasRole(user, 'admin')
