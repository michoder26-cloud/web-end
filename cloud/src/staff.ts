import type { Customer, Env } from './types'

// The parts of the back office the owner can open to staff, one by one. Settings, Connect, System, Updates,
// Move here, WordPress, table fields, customer accounts and the owner's own link are never on this list.
export const staffAreas = ['orders', 'products', 'pages', 'publish', 'data', 'messages', 'customers', 'stats', 'news'] as const
export type StaffArea = (typeof staffAreas)[number]
export type StaffMember = Customer & { permissions: StaffArea[] }

/** Reads the stored list, such as "orders,pages". Anything unknown is ignored, so an old or edited value can't widen access. */
export const readPermissions = (value: unknown): StaffArea[] => {
  const given = typeof value === 'string' ? value.split(',').map((part) => part.trim()) : []
  return staffAreas.filter((area) => given.includes(area))
}

export const writePermissions = (areas: readonly string[]) => staffAreas.filter((area) => areas.includes(area)).join(',')

/** What a staff member may use right now. A customer who is no longer staff gets nothing, whatever is stored. */
export async function staffPermissions(env: Env, customerId: number) {
  const row = await env.DB.prepare("SELECT permissions FROM customers WHERE id = ? AND role = 'staff'").bind(customerId).first<{ permissions: string }>()
  return row ? readPermissions(row.permissions) : []
}

/** Sets someone's role. Taking staff away also clears their areas, so making them staff again starts from nothing. */
export async function setStaff(env: Env, siteId: number, id: number, role: 'member' | 'staff', permissions?: readonly string[]) {
  const stored = role === 'member' ? '' : permissions === undefined ? null : writePermissions(permissions)
  const result = await env.DB.prepare('UPDATE customers SET role = ?, permissions = COALESCE(?, permissions) WHERE id = ? AND site_id = ? RETURNING permissions')
    .bind(role, stored, id, siteId)
    .first<{ permissions: string }>()
  return result ? readPermissions(result.permissions) : null
}
