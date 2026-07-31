import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, desc, sql, and, gte } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'

const decisionLogs = new Hono<{ Bindings: Env }>()

decisionLogs.get('/', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const logs = await db.select().from(schema.decisionLogs).orderBy(desc(schema.decisionLogs.createdAt)).limit(50)
  return c.json(logs)
})

decisionLogs.post('/', async (c) => {
  const { taskId, category, title, options, chosenOption, durationSec, satisfaction, ruleApplied } = await c.req.json()
  if (!category || !title) {
    return c.json({ error: '缺少必填字段' }, 400)
  }
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()
  await db.insert(schema.decisionLogs).values({
    id,
    taskId: taskId || null,
    category,
    title,
    options: options ? JSON.stringify(options) : null,
    chosenOption: chosenOption || null,
    durationSec: durationSec || null,
    satisfaction: satisfaction || null,
    ruleApplied: ruleApplied || null,
  })
  return c.json({ id }, 201)
})

decisionLogs.put('/:id/satisfaction', async (c) => {
  const { id } = c.req.param()
  const { satisfaction } = await c.req.json() as { satisfaction: number }
  if (satisfaction < 1 || satisfaction > 5) {
    return c.json({ error: '满意度范围 1-5' }, 400)
  }
  const db = drizzle(c.env.DB, { schema })
  await db.update(schema.decisionLogs).set({ satisfaction }).where(eq(schema.decisionLogs.id, id))
  return c.json({ ok: true })
})

decisionLogs.get('/patterns', async (c) => {
  const db = drizzle(c.env.DB, { schema })

  const byCategory = await db.select({
    category: schema.decisionLogs.category,
    count: sql<number>`count(*)`,
    avgDuration: sql<number>`avg(${schema.decisionLogs.durationSec})`,
    avgSatisfaction: sql<number>`avg(${schema.decisionLogs.satisfaction})`,
  }).from(schema.decisionLogs).groupBy(schema.decisionLogs.category)

  const recentWeek = await db.select({
    date: sql<string>`date(${schema.decisionLogs.createdAt})`,
    count: sql<number>`count(*)`,
    avgDuration: sql<number>`avg(${schema.decisionLogs.durationSec})`,
  }).from(schema.decisionLogs)
    .where(gte(schema.decisionLogs.createdAt, sql`(datetime('now', '-7 days'))`))
    .groupBy(sql`date(${schema.decisionLogs.createdAt})`)

  const ruleUsage = await db.select({
    ruleApplied: schema.decisionLogs.ruleApplied,
    count: sql<number>`count(*)`,
    avgSatisfaction: sql<number>`avg(${schema.decisionLogs.satisfaction})`,
  }).from(schema.decisionLogs)
    .where(sql`${schema.decisionLogs.ruleApplied} IS NOT NULL`)
    .groupBy(schema.decisionLogs.ruleApplied)

  return c.json({ byCategory, recentWeek, ruleUsage })
})

export default decisionLogs
