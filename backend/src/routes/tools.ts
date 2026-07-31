import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'

const tools = new Hono<{ Bindings: Env }>()

// ========== 同步日志 ==========

tools.get('/sync-logs', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const source = c.req.query('source')
  const status = c.req.query('status')

  let q = db.select().from(schema.syncLogs)
  const conditions = []
  if (source) conditions.push(eq(schema.syncLogs.source, source))
  if (status) conditions.push(eq(schema.syncLogs.status, status))
  if (conditions.length > 0) q = q.where(and(...conditions)) as typeof q

  const rows = await q.orderBy(desc(schema.syncLogs.createdAt))
  return c.json(rows)
})

export default tools
