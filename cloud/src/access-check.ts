import { office } from './cms'
import type { Desk } from './cms'
import { canCreate, listTables, readScope } from './data'
import type { Actor } from './data'
import { escapeHtml, notFound } from './http'
import { officeText } from './office-words'
import type { Customer, Env, SiteRow } from './types'

// "Who can see what": the owner checks their access rules against the same functions the site uses to answer
// visitors, so what this page says is what the server does, not a description of what it should do.

const visitor: Actor = { admin: false, customer: null }
const asCustomer = (customer: Customer): Actor => ({ admin: false, customer })
const sample = { member: asCustomer({ email: '', id: -1, name: '', role: 'member' }), staff: asCustomer({ email: '', id: -2, name: '', role: 'staff' }) }

/** How many records of a table one customer would get, and how many of those belong to the other customer. */
async function seenBy(env: Env, tableId: number, scope: 'all' | 'mine' | null, viewer: number, other: number) {
  if (!scope) return { others: 0, total: 0 }
  const row = await env.DB.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(customer_id = ?), 0) AS others FROM data_records WHERE table_id = ?${scope === 'mine' ? ' AND customer_id = ?' : ''}`)
    .bind(...(scope === 'mine' ? [other, tableId, viewer] : [other, tableId]))
    .first<{ others: number; total: number }>()
  return { others: Number(row?.others ?? 0), total: Number(row?.total ?? 0) }
}

/** The owner's access check page. Staff never reach it. */
export async function handleAccessCheck(request: Request, env: Env, url: URL, site: SiteRow, desk: Desk) {
  if (desk.staff || !desk.accountOwner || request.method !== 'GET') return notFound()
  const t = officeText(site)
  const w = t.accessCheck
  const tables = await listTables(env, site.id)
  const read = (scope: 'all' | 'mine' | null) => (scope === 'all' ? w.readAll : scope === 'mine' ? w.readOwn : w.readNone)
  const add = (allowed: boolean) => (allowed ? w.yes : w.no)
  const rules = tables
    .map((table) => {
      const row = (who: string, actor: Actor) => `<tr><th scope="row">${who}</th><td>${w.canRead}: ${read(readScope(table, actor))}</td><td>${w.canAdd}: ${add(canCreate(table, actor))}</td></tr>`
      return `<article class="card account__record"><h3>${escapeHtml(table.label || table.name)}</h3><table class="table"><thead><tr><th>${w.who}</th><th>${w.canRead}</th><th>${w.canAdd}</th></tr></thead><tbody>${row(w.visitor, visitor)}${row(w.customer, sample.member)}${row(w.staff, sample.staff)}</tbody></table></article>`
    })
    .join('')

  // Two real customers, compared with the real rules and the real records.
  const { results: customers } = await env.DB.prepare('SELECT id, email, name, role FROM customers WHERE site_id = ? ORDER BY id DESC LIMIT 200').bind(site.id).all<Customer>()
  const pick = (name: string) => customers.find((customer) => customer.id === Number(url.searchParams.get(name)))
  const [a, b] = [pick('a'), pick('b')]
  const options = (chosen?: Customer) => customers.map((customer) => `<option value="${customer.id}"${customer.id === chosen?.id ? ' selected' : ''}>${escapeHtml(customer.name)} · ${escapeHtml(customer.email)}</option>`).join('')
  let compared = ''
  if (a && b && a.id !== b.id) {
    const lines = await Promise.all(
      tables.map(async (table) => {
        const [first, second] = await Promise.all([seenBy(env, table.id, readScope(table, asCustomer(a)), a.id, b.id), seenBy(env, table.id, readScope(table, asCustomer(b)), b.id, a.id)])
        const cell = (seen: { others: number; total: number }) => `<td>${seen.total}</td><td${seen.others ? ' data-leak="1"' : ''}>${seen.others}</td>`
        return `<tr><th scope="row">${escapeHtml(table.label || table.name)}</th>${cell(first)}${cell(second)}</tr>`
      }),
    )
    const orders = await env.DB.prepare('SELECT COALESCE(SUM(customer_id = ?), 0) AS a, COALESCE(SUM(customer_id = ?), 0) AS b FROM orders WHERE site_id = ?').bind(a.id, b.id, site.id).first<{ a: number; b: number }>()
    compared = `<table class="table" id="access-compare"><thead><tr><th></th><th>${escapeHtml(w.sees(a.name))}</th><th>${escapeHtml(w.ofOther(b.name))}</th><th>${escapeHtml(w.sees(b.name))}</th><th>${escapeHtml(w.ofOther(a.name))}</th></tr></thead><tbody>${lines.join('')}
<tr><th scope="row">${t.nav.orders}</th><td>${Number(orders?.a ?? 0)}</td><td>0</td><td>${Number(orders?.b ?? 0)}</td><td>0</td></tr></tbody></table><p><small>${w.compareNote}</small></p>`
  }
  const picker = customers.length >= 2
    ? `<form action="${escapeHtml(desk.base)}/access" class="contact-form" method="get"><label>${w.first}<select name="a">${options(a)}</select></label><label>${w.second}<select name="b">${options(b ?? customers.find((customer) => customer.id !== (a ?? customers[0]).id))}</select></label><button class="button button--small" type="submit">${w.compare}</button></form>`
    : `<p>${w.needTwo}</p>`
  return office(site, desk, w.title, `<p>${w.intro}</p><h2>${w.rulesHeading}</h2>${rules || `<p>${w.noTables}</p>`}<p><small>${w.ordersRule}</small></p><h2>${w.compareHeading}</h2><p>${w.compareHelp}</p>${picker}${compared}`)
}
