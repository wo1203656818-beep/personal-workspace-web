import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc, gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '../schema'
import type { Env } from '../types'
import { todayCST, nowBeijing } from '../time'
import { callAI } from '../utils/ai-client'

const habits = new Hono<{ Bindings: Env }>()

interface HabitBody {
  name?: string
  icon?: string
  color?: string
  description?: string
}

interface CheckinBody {
  date?: string
  note?: string
}

// 习惯列表（含今日打卡状态与统计）
habits.get('/', async (c) => {
  try {
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
  } catch (err) {
    console.error('Habits list error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// 创建习惯
habits.post('/', async (c) => {
  try {
    let body: HabitBody
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: '请求体格式无效' }, 400)
    }
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
  } catch (err) {
    console.error('Habits create error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// 更新习惯
habits.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'ID 不能为空' }, 400)
    let body: HabitBody
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: '请求体格式无效' }, 400)
    }
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
  } catch (err) {
    console.error('Habits update error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// 删除习惯（连带打卡记录）
habits.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'ID 不能为空' }, 400)
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.habits).where(eq(schema.habits.id, id))
    if (!existing) return c.json({ error: '习惯不存在' }, 404)
    await db.delete(schema.habitCheckins).where(eq(schema.habitCheckins.habitId, id))
    await db.delete(schema.habits).where(eq(schema.habits.id, id))
    return c.json({ ok: true })
  } catch (err) {
    console.error('Habits delete error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// 打卡/取消打卡（date 可选，默认今天，支持补卡）
habits.post('/:id/checkin', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'ID 不能为空' }, 400)
    let body: CheckinBody
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }
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
  } catch (err) {
    console.error('Habits checkin error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// 热力图数据（最近 N 天每天完成了几次打卡）
habits.get('/calendar', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const days = Math.min(parseInt(c.req.query('days') || '365'), 365)
    const from = prevDate(todayCST(), days - 1)
    if (isNaN(days) || days < 1) return c.json({ error: 'days 参数无效' }, 400)

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
  } catch (err) {
    console.error('Habits calendar error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// 习惯关联分析（最近 90 天）
habits.get('/correlation', async (c) => {
  try {
    // 1. 检查 KV 缓存
    const cached = await c.env.CACHE.get('habits_correlation')
    if (cached) {
      return c.json({ ...JSON.parse(cached), fromCache: true })
    }

    const db = drizzle(c.env.DB, { schema })
    const today = todayCST()
    const from = prevDate(today, 89)

    // 2. 读取所有习惯和打卡记录
    const [habitRows, checkinRows] = await Promise.all([
      db.select().from(schema.habits),
      db
        .select()
        .from(schema.habitCheckins)
        .where(gte(schema.habitCheckins.date, from)),
    ])

    if (habitRows.length === 0 || checkinRows.length === 0) {
      const emptyResult = {
        generatedAt: nowBeijing(),
        fromCache: false,
        pairs: [],
        report: '暂无足够的打卡数据进行分析，开始打卡后会自动生成习惯关联分析。',
      }
      await c.env.CACHE.put('habits_correlation', JSON.stringify(emptyResult), {
        expirationTtl: 3600,
      })
      return c.json(emptyResult)
    }

    // 3. 按日期分组，计算习惯对共现次数
    const habitNameMap = new Map(habitRows.map((h) => [h.id, h.name]))
    const checkinsByDate = new Map<string, string[]>()
    for (const ck of checkinRows) {
      const arr = checkinsByDate.get(ck.date) ?? []
      arr.push(ck.habitId)
      checkinsByDate.set(ck.date, arr)
    }

    const pairCount = new Map<string, number>()
    for (const ids of checkinsByDate.values()) {
      // 去重（同一天同一个习惯只能打卡一次，所以 ids 不会有重复）
      const unique = [...new Set(ids)]
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const a = unique[i]
          const b = unique[j]
          const key = a < b ? `${a}::${b}` : `${b}::${a}`
          pairCount.set(key, (pairCount.get(key) ?? 0) + 1)
        }
      }
    }

    // 4. 排序取前 15 个高频组合
    const sorted = [...pairCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([key, count]) => {
        const [idA, idB] = key.split('::')
        return [habitNameMap.get(idA) ?? idA, habitNameMap.get(idB) ?? idB, count] as [string, string, number]
      })

    // 5. 调用 AI 分析
    const pairsText = sorted
      .map(([a, b, count], i) => `${i + 1}. ${a} + ${b}: ${count}次`)
      .join('\n')
    const prompt = `你是一个习惯分析助手。以下是用户近 90 天习惯打卡的共现频率数据（习惯对同时出现的次数），用中文生成一段简短的分析报告。

习惯共现频率（前 15）：
${pairsText}

请生成以下内容（用中文，80 字以内）：
1. 一句话总结这些习惯之间的关联模式
2. 指出最值得关注的组合及其可能的原因`

    let report = '暂无分析'
    try {
      report = await callAI(c.env, [{ role: 'user', content: prompt }], {
        maxTokens: 512,
        timeoutMs: 30000,
      })
    } catch (err) {
      console.error('Habits correlation AI error:', err)
      report = 'AI 分析暂时不可用，请稍后重试。'
    }

    // 6. 缓存
    const result = { generatedAt: nowBeijing(), fromCache: false, pairs: sorted, report }
    await c.env.CACHE.put('habits_correlation', JSON.stringify(result), { expirationTtl: 3600 })

    return c.json(result)
  } catch (err) {
    console.error('Habits correlation error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

function prevDate(dateStr: string, n = 1): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export default habits
