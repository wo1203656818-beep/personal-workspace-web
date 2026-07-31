import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, desc, sql, and, gte } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'

const mood = new Hono<{ Bindings: Env }>()

mood.get('/', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const logs = await db.select().from(schema.moodLogs).orderBy(desc(schema.moodLogs.createdAt)).limit(30)
  return c.json(logs)
})

mood.get('/today', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const today = new Date().toISOString().slice(0, 10)
  const [log] = await db.select().from(schema.moodLogs)
    .where(gte(schema.moodLogs.createdAt, today))
    .orderBy(desc(schema.moodLogs.createdAt))
    .limit(1)
  return c.json(log || null)
})

mood.post('/', async (c) => {
  const { weather, note } = await c.req.json()
  if (!weather) {
    return c.json({ error: '请选择今天的心情天气' }, 400)
  }
  const validWeathers = ['sunny', 'cloudy', 'rainy', 'stormy', 'snowy']
  if (!validWeathers.includes(weather)) {
    return c.json({ error: '无效的天气类型' }, 400)
  }
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()
  await db.insert(schema.moodLogs).values({
    id,
    weather,
    note: note || null,
  })
  return c.json({ id }, 201)
})

mood.get('/trends', async (c) => {
  const db = drizzle(c.env.DB, { schema })

  const byWeather = await db.select({
    weather: schema.moodLogs.weather,
    count: sql<number>`count(*)`,
  }).from(schema.moodLogs).groupBy(schema.moodLogs.weather)

  const last7Days = await db.select({
    date: sql<string>`date(${schema.moodLogs.createdAt})`,
    weather: schema.moodLogs.weather,
    count: sql<number>`count(*)`,
  }).from(schema.moodLogs)
    .where(gte(schema.moodLogs.createdAt, sql`(datetime('now', '-7 days'))`))
    .groupBy(sql`date(${schema.moodLogs.createdAt})`, schema.moodLogs.weather)

  const streak = await db.select({
    date: sql<string>`date(${schema.moodLogs.createdAt})`,
  }).from(schema.moodLogs)
    .groupBy(sql`date(${schema.moodLogs.createdAt})`)
    .orderBy(desc(sql`date(${schema.moodLogs.createdAt})`))
    .limit(30)

  return c.json({ byWeather, last7Days, streak })
})

export default mood
