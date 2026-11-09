// Declarative descriptions only: no tool names, code, URLs, HTML or actions from a model.
import { z } from 'zod'

const text = (max) => z.string().min(1).max(max).refine((s) => s.trim().length > 0 && !/[\x00-\x1f\x7f<>]/u.test(s))
const schema = z.object({
  site_name: text(100), summary: text(500),
  pages: z.array(z.object({ name: text(100), purpose: text(300) }).strict()).min(1).max(8),
  features: z.array(text(200)).min(1).max(10),
}).strict()

export function planDraft(input, id) {
  const plan = schema.parse(input)
  return { plan, pages: plan.pages.map((page, index) => ({
    slug: `draft-${id}-${index + 1}`, title: page.name, description: page.purpose,
    published: false, blocks: [{ type: 'hero', heading: page.name }, { type: 'text', body: page.purpose }],
  })) }
}
