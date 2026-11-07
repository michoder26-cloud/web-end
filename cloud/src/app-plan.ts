import { z } from 'zod'

import type { Env } from './types'

const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60)
const words = (limit: number) => z.string().trim().min(1).max(limit)

const roleSchema = z.object({ name: words(80), purpose: words(400) }).strict()
const moduleSchema = z.object({ id: identifier, name: words(80), purpose: words(500) }).strict()
const tableSchema = z.object({ name: identifier, purpose: words(500) }).strict()
const pageSchema = z.object({ slug, purpose: words(500) }).strict()
const flowSchema = z.object({ name: words(80), table: identifier, purpose: words(500) }).strict()
const automationSchema = z.object({ name: words(80), purpose: words(500) }).strict()

/** The durable, plain-language contract for one app. Individual tools still create its tables and pages. */
export const appPlanSchema = z
  .object({
    title: words(120).describe('The name of the system, such as Purchase requests'),
    summary: words(1000).describe('What the system does and the business problem it solves'),
    phase: z.enum(['discovery', 'building', 'review', 'live']).describe('discovery: agreed shape; building: Claude is creating it; review: ready for owner testing; live: owner is using it'),
    roles: z.array(roleSchema).min(1).max(20).describe('People who use the system and what each must be able to do'),
    modules: z.array(moduleSchema).min(1).max(30).describe('Named parts of the system, such as requests, stock or reporting'),
    tables: z.array(tableSchema).max(50).describe('Every custom data table this system needs. Built-in shop products and orders do not need to be listed.'),
    pages: z.array(pageSchema).max(40).describe('Pages or screens people need, including staff-facing pages'),
    approvalFlows: z.array(flowSchema).max(50).describe('Tables that need multi-step approval. Leave empty when none do.'),
    automations: z.array(automationSchema).max(50).describe('Named automatic rules the system needs. Leave empty when none do.'),
    acceptanceCriteria: z.array(words(500)).min(1).max(30).describe('Observable statements the owner can use to test the system'),
    nextStep: words(500).describe('The next smallest useful build or review step'),
  })
  .strict()
  .superRefine((plan, context) => {
    const unique = (items: { [key: string]: string }[], key: string, label: string) => {
      const seen = new Set<string>()
      items.forEach((item, index) => {
        const value = item[key]
        if (seen.has(value)) context.addIssue({ code: 'custom', message: `${label} "${value}" appears twice.`, path: [label.toLowerCase(), index] })
        seen.add(value)
      })
    }
    unique(plan.modules, 'id', 'Module')
    unique(plan.tables, 'name', 'Table')
    unique(plan.pages, 'slug', 'Page')
    unique(plan.approvalFlows, 'table', 'Approval flow table')
    unique(plan.automations, 'name', 'Automation')
    for (const [index, flow] of plan.approvalFlows.entries()) {
      if (!plan.tables.some((table) => table.name === flow.table)) context.addIssue({ code: 'custom', message: `Approval flow "${flow.name}" needs table "${flow.table}" in this plan.`, path: ['approvalFlows', index, 'table'] })
    }
  })

export type AppPlan = z.infer<typeof appPlanSchema>
type StoredPlan = { created_at: string; plan: string; updated_at: string; version: number }

const parse = (row: StoredPlan) => ({ ...row, plan: JSON.parse(row.plan) as AppPlan })

export async function getAppPlan(env: Env, siteId: number, version?: number) {
  const row = version
    ? await env.DB.prepare('SELECT version, plan, created_at, created_at AS updated_at FROM app_plan_revisions WHERE site_id = ? AND version = ?').bind(siteId, version).first<StoredPlan>()
    : await env.DB.prepare('SELECT version, plan, created_at, updated_at FROM app_plans WHERE site_id = ?').bind(siteId).first<StoredPlan>()
  return row ? parse(row) : null
}

export async function saveAppPlan(env: Env, siteId: number, plan: AppPlan) {
  const stored = JSON.stringify(plan)
  if (stored.length > 60_000) throw new Error('The app plan is too large.')
  await env.DB.batch([
    env.DB
      .prepare(`INSERT INTO app_plans (site_id, plan, version) VALUES (?, ?, 1)
        ON CONFLICT(site_id) DO UPDATE SET plan = excluded.plan, version = app_plans.version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
      .bind(siteId, stored),
    env.DB.prepare('INSERT INTO app_plan_revisions (site_id, version, plan) SELECT site_id, version, plan FROM app_plans WHERE site_id = ?').bind(siteId),
  ])
  return getAppPlan(env, siteId)
}

type Missing = { kind: 'approval flow' | 'automation' | 'page' | 'table'; name: string; purpose: string }

/** Checks the real D1 configuration against the owner-approved map, never guessing from page text. */
export async function appPlanHealth(env: Env, siteId: number, stored: { plan: AppPlan; version: number }) {
  const [tableRows, pageRows, flowRows, automationRows] = await Promise.all([
    env.DB.prepare('SELECT name FROM data_tables WHERE site_id = ?').bind(siteId).all<{ name: string }>(),
    env.DB.prepare('SELECT slug FROM pages WHERE site_id = ?').bind(siteId).all<{ slug: string }>(),
    env.DB.prepare('SELECT data_tables.name FROM approval_flows JOIN data_tables ON data_tables.id = approval_flows.table_id WHERE approval_flows.site_id = ?').bind(siteId).all<{ name: string }>(),
    env.DB.prepare('SELECT name FROM automations WHERE site_id = ?').bind(siteId).all<{ name: string }>(),
  ])
  const tables = new Set(tableRows.results.map((row) => row.name))
  const pages = new Set(pageRows.results.map((row) => row.slug))
  const flows = new Set(flowRows.results.map((row) => row.name))
  const automations = new Set(automationRows.results.map((row) => row.name))
  const missing: Missing[] = [
    ...stored.plan.tables.filter((item) => !tables.has(item.name)).map((item) => ({ kind: 'table' as const, name: item.name, purpose: item.purpose })),
    ...stored.plan.pages.filter((item) => !pages.has(item.slug)).map((item) => ({ kind: 'page' as const, name: item.slug, purpose: item.purpose })),
    ...stored.plan.approvalFlows.filter((item) => !flows.has(item.table)).map((item) => ({ kind: 'approval flow' as const, name: item.name, purpose: item.purpose })),
    ...stored.plan.automations.filter((item) => !automations.has(item.name)).map((item) => ({ kind: 'automation' as const, name: item.name, purpose: item.purpose })),
  ]
  return {
    phase: stored.plan.phase,
    plan: { title: stored.plan.title, version: stored.version },
    ready: missing.length === 0,
    missing,
    next: missing.length ? `Build the next missing ${missing[0].kind}: ${missing[0].name}. ${missing[0].purpose}` : 'Run check_site, test every acceptance criterion with the owner, then move the plan to review or live.',
  }
}
