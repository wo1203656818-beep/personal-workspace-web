import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, desc } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'

const decisionTemplates = new Hono<{ Bindings: Env }>()

decisionTemplates.get('/', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const templates = await db.select().from(schema.decisionTemplates).orderBy(schema.decisionTemplates.sortOrder)
  return c.json(templates)
})

decisionTemplates.get('/:category', async (c) => {
  const { category } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const templates = await db.select().from(schema.decisionTemplates)
    .where(eq(schema.decisionTemplates.category, category))
    .orderBy(schema.decisionTemplates.sortOrder)
  return c.json(templates)
})

decisionTemplates.post('/apply/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })

  const [template] = await db.select().from(schema.decisionTemplates).where(eq(schema.decisionTemplates.id, id))
  if (!template) {
    return c.json({ error: '模板不存在' }, 404)
  }

  const ruleId = crypto.randomUUID()
  await db.insert(schema.decisionRules).values({
    id: ruleId,
    category: template.category,
    title: template.title,
    condition: template.condition,
    action: template.action,
  })

  return c.json({ ruleId, message: '模板已套用到决策规则库' }, 201)
})

decisionTemplates.post('/batch-apply', async (c) => {
  const { ids } = await c.req.json() as { ids: string[] }
  if (!ids?.length) {
    return c.json({ error: '请选择至少一个模板' }, 400)
  }

  const db = drizzle(c.env.DB, { schema })
  const applied: string[] = []

  for (const id of ids) {
    const [template] = await db.select().from(schema.decisionTemplates).where(eq(schema.decisionTemplates.id, id))
    if (template) {
      const ruleId = crypto.randomUUID()
      await db.insert(schema.decisionRules).values({
        id: ruleId,
        category: template.category,
        title: template.title,
        condition: template.condition,
        action: template.action,
      })
      applied.push(ruleId)
    }
  }

  return c.json({ applied, count: applied.length }, 201)
})

export default decisionTemplates
