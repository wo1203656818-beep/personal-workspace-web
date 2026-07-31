import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, or, isNotNull, isNull, sql, desc } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'

const declutter = new Hono<{ Bindings: Env }>()

declutter.get('/stale-tasks', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const staleThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  const staleTasks = await db.select({
    id: schema.tasks.id,
    title: schema.tasks.title,
    createdAt: schema.tasks.createdAt,
    updatedAt: schema.tasks.updatedAt,
    status: schema.tasks.status,
    listId: schema.tasks.listId,
  }).from(schema.tasks)
    .where(and(
      eq(schema.tasks.isCompleted, false),
      isNull(schema.tasks.msTodoDeletedAt),
      sql`${schema.tasks.updatedAt} < ${staleThreshold}`,
      or(
        eq(schema.tasks.status, 'planned'),
        isNull(schema.tasks.status),
      ),
    ))
    .orderBy(schema.tasks.updatedAt)

  return c.json(staleTasks)
})

declutter.get('/orphaned-rules', async (c) => {
  const db = drizzle(c.env.DB, { schema })

  const rules = await db.select().from(schema.decisionRules)
  const logs = await db.select({ ruleApplied: schema.decisionLogs.ruleApplied })
    .from(schema.decisionLogs)
    .where(isNotNull(schema.decisionLogs.ruleApplied))

  const usedRuleIds = new Set(logs.map(l => l.ruleApplied))
  const orphaned = rules.filter(r => !usedRuleIds.has(r.id))

  return c.json(orphaned)
})

declutter.get('/stats', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const staleThreshold = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  const [totalTasks] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.tasks)
    .where(eq(schema.tasks.isCompleted, false))

  const [staleCount] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.tasks)
    .where(and(
      eq(schema.tasks.isCompleted, false),
      isNull(schema.tasks.msTodoDeletedAt),
      sql`${schema.tasks.updatedAt} < ${staleThreshold}`,
      or(eq(schema.tasks.status, 'planned'), isNull(schema.tasks.status)),
    ))

  const [quickCount] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.tasks)
    .where(and(
      eq(schema.tasks.isQuick, true),
      eq(schema.tasks.isCompleted, false),
    ))

  const [totalRules] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.decisionRules)

  const [totalNotes] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.imaNotes)

  const [totalKb] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.kbDocuments)

  return c.json({
    totalTasks: totalTasks?.count || 0,
    staleTasks: staleCount?.count || 0,
    quickTasks: quickCount?.count || 0,
    totalRules: totalRules?.count || 0,
    totalNotes: totalNotes?.count || 0,
    totalKb: totalKb?.count || 0,
  })
})

declutter.post('/cleanup', async (c) => {
  const { ids } = await c.req.json() as { ids: string[] }
  if (!ids?.length) {
    return c.json({ error: '请选择要清理的任务' }, 400)
  }
  const db = drizzle(c.env.DB, { schema })
  await db.update(schema.tasks).set({
    isCompleted: true,
    updatedAt: new Date().toISOString(),
  }).where(sql`${schema.tasks.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`)
  return c.json({ cleaned: ids.length })
})

export default declutter
