import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, desc, sql, and, gte } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'

const mood = new Hono<{ Bindings: Env }>()

mood.get('/', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const logs = await db
      .select()
      .from(schema.moodLogs)
      .orderBy(desc(schema.moodLogs.createdAt))
      .limit(30)
    return c.json(logs)
  } catch (err) {
    console.error('Mood list error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

mood.get('/today', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const today = new Date().toISOString().slice(0, 10)
    const [log] = await db
      .select()
      .from(schema.moodLogs)
      .where(gte(schema.moodLogs.createdAt, today))
      .orderBy(desc(schema.moodLogs.createdAt))
      .limit(1)
    return c.json(log || null)
  } catch (err) {
    console.error('Mood today error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

mood.post('/', async (c) => {
  try {
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
  } catch (err) {
    console.error('Mood create error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

mood.get('/trends', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })

    const byWeather = await db
      .select({
        weather: schema.moodLogs.weather,
        count: sql<number>`count(*)`,
      })
      .from(schema.moodLogs)
      .groupBy(schema.moodLogs.weather)

    const last7Days = await db
      .select({
        date: sql<string>`date(${schema.moodLogs.createdAt})`,
        weather: schema.moodLogs.weather,
        count: sql<number>`count(*)`,
      })
      .from(schema.moodLogs)
      .where(gte(schema.moodLogs.createdAt, sql`(datetime('now', '-7 days'))`))
      .groupBy(sql`date(${schema.moodLogs.createdAt})`, schema.moodLogs.weather)

    const streak = await db
      .select({
        date: sql<string>`date(${schema.moodLogs.createdAt})`,
      })
      .from(schema.moodLogs)
      .groupBy(sql`date(${schema.moodLogs.createdAt})`)
      .orderBy(desc(sql`date(${schema.moodLogs.createdAt})`))
      .limit(30)

    return c.json({ byWeather, last7Days, streak })
  } catch (err) {
    console.error('Mood trends error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// 更新心情记录
mood.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { weather, note } = await c.req.json()
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.moodLogs).where(eq(schema.moodLogs.id, id))
    if (!existing) return c.json({ error: '记录不存在' }, 404)
    if (weather !== undefined) {
      const validWeathers = ['sunny', 'cloudy', 'rainy', 'stormy', 'snowy']
      if (!validWeathers.includes(weather)) return c.json({ error: '无效的天气类型' }, 400)
    }
    const updates: Record<string, any> = {}
    if (weather !== undefined) updates.weather = weather
    if (note !== undefined) updates.note = note
    await db.update(schema.moodLogs).set(updates).where(eq(schema.moodLogs.id, id))
    const [row] = await db.select().from(schema.moodLogs).where(eq(schema.moodLogs.id, id))
    return c.json(row)
  } catch (err) {
    console.error('Mood update error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// 删除心情记录
mood.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.moodLogs).where(eq(schema.moodLogs.id, id))
    if (!existing) return c.json({ error: '记录不存在' }, 404)
    await db.delete(schema.moodLogs).where(eq(schema.moodLogs.id, id))
    return c.json({ ok: true })
  } catch (err) {
    console.error('Mood delete error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

export default mood
