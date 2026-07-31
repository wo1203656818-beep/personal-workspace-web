import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc, gte, sql } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { todayCST } from '../time'

const habits = new Hono<{ Bindings: Env }>()

// 习惯列表（含今日打卡状态与统计）
habits.get('/', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const today = todayCST()

  const rows = await db.select().from(schema.habits).orderBy(desc(schema.habits.createdAt))

  // 连续打卡只回溯最近 365 天即可（避免全表扫描）
  const from = prevDate(today, 365)
  const [checkins, totals] = await Promise.all([
    db
      .select()
      .from(schema.habitCheckins)
      .where(gte(schema.habitCheckins.date, from)),
    db
      .select({
        habitId: schema.habitCheckins.habitId,
        count: sql<number>`count(*)`,
      })
      .from(schema.habitCheckins)
      .groupBy(schema.habitCheckins.habitId),
  ])
  const totalByHabit = new Map(totals.map((t) => [t.habitId, t.count]))

  const byHabit = new Map<string, typeof checkins>()
  for (const ck of checkins) {
    const arr = byHabit.get(ck.habitId) ?? []
    arr.push(ck)
    byHabit.set(ck.habitId, arr)
  }

  const result = rows.map((h) => {
    const list = byHabit.get(h.id) ?? []
    const doneToday = list.some((ck) => ck.date === today)
    // 连续打卡天数（从今天往回数）
    const doneDates = new Set(list.map((ck) => ck.date))
    let streak = 0
    let cursor = today
    while (doneDates.has(cursor)) {
      streak++
      cursor = prevDate(cursor)
    }
    return {
      ...h,
      doneToday,
      streak,
      total: totalByHabit.get(h.id) ?? 0,
    }
  })

  return c.json(result)
})

// 创建习惯
habits.post('/', async (c) => {
  const body = await c.req.json()
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return c.json({ error: '习惯名称不能为空' }, 400)

  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()
  await db.insert(schema.habits).values({
    id,
    name,
    icon: typeof body?.icon === 'string' ? body.icon : null,
    color: typeof body?.color === 'string' ? body.color : null,
    description: typeof body?.description === 'string' ? body.description : null,
  })
  const [row] = await db.select().from(schema.habits).where(eq(schema.habits.id, id))
  return c.json(row, 201)
})

// 更新习惯
habits.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const db = drizzle(c.env.DB, { schema })

  const [existing] = await db.select().from(schema.habits).where(eq(schema.habits.id, id))
  if (!existing) return c.json({ error: '习惯不存在' }, 404)

  await db
    .update(schema.habits)
    .set({
      name: typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : existing.name,
      icon: typeof body?.icon === 'string' ? body.icon : existing.icon,
      color: typeof body?.color === 'string' ? body.color : existing.color,
      description:
        typeof body?.description === 'string' ? body.description : existing.description,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(schema.habits.id, id))
  const [row] = await db.select().from(schema.habits).where(eq(schema.habits.id, id))
  return c.json(row)
})

// 删除习惯（连带打卡记录）
habits.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = drizzle(c.env.DB, { schema })
  await db.delete(schema.habitCheckins).where(eq(schema.habitCheckins.habitId, id))
  await db.delete(schema.habits).where(eq(schema.habits.id, id))
  return c.json({ ok: true })
})

// 打卡/取消打卡（date 可选，默认今天，支持补卡）
habits.post('/:id/checkin', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const db = drizzle(c.env.DB, { schema })

  const [habit] = await db.select().from(schema.habits).where(eq(schema.habits.id, id))
  if (!habit) return c.json({ error: '习惯不存在' }, 404)

  const date = typeof body?.date === 'string' && body.date ? body.date : todayCST()
  const note = typeof body?.note === 'string' ? body.note : null

  const [existing] = await db
    .select()
    .from(schema.habitCheckins)
    .where(and(eq(schema.habitCheckins.habitId, id), eq(schema.habitCheckins.date, date)))

  if (existing) {
    // 已打卡 → 取消
    await db.delete(schema.habitCheckins).where(eq(schema.habitCheckins.id, existing.id))
    return c.json({ done: false, id: existing.id })
  }

  const checkinId = crypto.randomUUID()
  await db.insert(schema.habitCheckins).values({ id: checkinId, habitId: id, date, note })
  return c.json({ done: true, id: checkinId }, 201)
})

// 热力图数据（最近 N 天每天完成了几次打卡）
habits.get('/calendar', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const days = Math.min(parseInt(c.req.query('days') || '365'), 365)
  const from = prevDate(todayCST(), days - 1)

  const rows = await db
    .select({
      date: schema.habitCheckins.date,
      count: sql<number>`count(*)`,
    })
    .from(schema.habitCheckins)
    .where(gte(schema.habitCheckins.date, from))
    .groupBy(schema.habitCheckins.date)
    .orderBy(desc(schema.habitCheckins.date))

  return c.json(rows)
})

function prevDate(dateStr: string, n = 1): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export default habits
