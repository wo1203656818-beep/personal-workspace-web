import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, desc } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'

const decisionRules = new Hono<{ Bindings: Env }>()

decisionRules.get('/', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rules = await db.select().from(schema.decisionRules).orderBy(desc(schema.decisionRules.createdAt))
  return c.json(rules)
})

decisionRules.post('/', async (c) => {
  const { category, title, condition, action } = await c.req.json()
  if (!category || !title || !condition || !action) {
    return c.json({ error: '缺少必填字段' }, 400)
  }
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()
  await db.insert(schema.decisionRules).values({ id, category, title, condition, action })
  return c.json({ id }, 201)
})

decisionRules.delete('/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  await db.delete(schema.decisionRules).where(eq(schema.decisionRules.id, id))
  return c.json({ ok: true })
})

export default decisionRules
