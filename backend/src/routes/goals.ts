import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, desc, sql } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '../schema'
import type { Env } from '../types'
import { callAI } from '../utils/ai-client'

const goals = new Hono<{ Bindings: Env }>()

interface GoalBody {
  title?: string
  description?: string
  icon?: string
  color?: string
  currentValue?: number
  targetValue?: number
  unit?: string
  targetDate?: string
  status?: string
}

interface CountdownBody {
  title?: string
  date?: string
  note?: string
  color?: string
  isYearly?: boolean
}

// ─────────── 目标（OKR 风格）───────────

// 目标统计
goals.get('/stats', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const all = await db.select().from(schema.goals)
    const total = all.length
    const active = all.filter((g) => g.status === 'active').length
    const done = all.filter((g) => g.status === 'done').length
    const archived = all.filter((g) => g.status === 'archived').length
    return c.json({ total, active, done, archived })
  } catch (err) {
    console.error('Goals stats error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// 目标列表
goals.get('/', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const rows = await db.select().from(schema.goals).orderBy(desc(schema.goals.createdAt))
    return c.json(rows)
  } catch (err) {
    console.error('Goals list error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

goals.post('/', async (c) => {
  try {
    let body: GoalBody
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: '请求体格式无效' }, 400)
    }
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    if (!title) return c.json({ error: '目标名称不能为空' }, 400)
    const db = drizzle(c.env.DB, { schema })
    const id = crypto.randomUUID()
    await db.insert(schema.goals).values({
      id,
      title,
      description: typeof body?.description === 'string' ? body.description : null,
      icon: typeof body?.icon === 'string' ? body.icon : null,
      color: typeof body?.color === 'string' ? body.color : null,
      currentValue:
        typeof body?.currentValue === 'number' && !isNaN(body.currentValue)
          ? body.currentValue
          : null,
      targetValue:
        typeof body?.targetValue === 'number' && !isNaN(body.targetValue)
          ? body.targetValue
          : null,
      unit: typeof body?.unit === 'string' ? body.unit : null,
      targetDate: typeof body?.targetDate === 'string' ? body.targetDate : null,
      status: body?.status === 'done' || body?.status === 'archived' ? body.status : 'active',
    })
    const [row] = await db.select().from(schema.goals).where(eq(schema.goals.id, id))
    return c.json(row, 201)
  } catch (err) {
    console.error('Goals create error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

goals.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'ID 不能为空' }, 400)
    let body: GoalBody
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: '请求体格式无效' }, 400)
    }
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.goals).where(eq(schema.goals.id, id))
    if (!existing) return c.json({ error: '目标不存在' }, 404)
    await db
      .update(schema.goals)
      .set({
        title: typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : existing.title,
        description: typeof body?.description === 'string' ? body.description : existing.description,
        icon: typeof body?.icon === 'string' ? body.icon : existing.icon,
        color: typeof body?.color === 'string' ? body.color : existing.color,
        currentValue: typeof body?.currentValue === 'number' ? body.currentValue : existing.currentValue,
        targetValue: typeof body?.targetValue === 'number' ? body.targetValue : existing.targetValue,
        unit: typeof body?.unit === 'string' ? body.unit : existing.unit,
        targetDate: typeof body?.targetDate === 'string' ? body.targetDate : existing.targetDate,
        status:
          body?.status === 'active' || body?.status === 'done' || body?.status === 'archived'
            ? body.status
            : existing.status,
        updatedAt: sql`(datetime('now'))`,
      })
      .where(eq(schema.goals.id, id))
    const [row] = await db.select().from(schema.goals).where(eq(schema.goals.id, id))
    return c.json(row)
  } catch (err) {
    console.error('Goals update error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

goals.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'ID 不能为空' }, 400)
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.goals).where(eq(schema.goals.id, id))
    if (!existing) return c.json({ error: '目标不存在' }, 404)
    await db.delete(schema.goals).where(eq(schema.goals.id, id))
    return c.json({ ok: true })
  } catch (err) {
    console.error('Goals delete error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ─────────── 倒数日 / 纪念日 ───────────

goals.get('/countdowns', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const rows = await db.select().from(schema.countdowns).orderBy(desc(schema.countdowns.date))
    return c.json(rows)
  } catch (err) {
    console.error('Countdowns list error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

goals.post('/countdowns', async (c) => {
  try {
    let body: CountdownBody
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: '请求体格式无效' }, 400)
    }
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const date = typeof body?.date === 'string' ? body.date : ''
    if (!title) return c.json({ error: '标题不能为空' }, 400)
    if (!date) return c.json({ error: '日期不能为空' }, 400)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: '日期格式无效，应为 YYYY-MM-DD' }, 400)
    const db = drizzle(c.env.DB, { schema })
    const id = crypto.randomUUID()
    await db.insert(schema.countdowns).values({
      id,
      title,
      date,
      note: typeof body?.note === 'string' ? body.note : null,
      color: typeof body?.color === 'string' ? body.color : null,
      isYearly: body?.isYearly === true,
    })
    const [row] = await db.select().from(schema.countdowns).where(eq(schema.countdowns.id, id))
    return c.json(row, 201)
  } catch (err) {
    console.error('Countdowns create error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// 更新倒数日
goals.put('/countdowns/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'ID 不能为空' }, 400)
    let body: CountdownBody
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: '请求体格式无效' }, 400)
    }
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.countdowns).where(eq(schema.countdowns.id, id))
    if (!existing) return c.json({ error: '倒数日不存在' }, 404)
    const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : existing.title
    const date = typeof body?.date === 'string' && body.date ? body.date : existing.date
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: '日期格式无效，应为 YYYY-MM-DD' }, 400)
    await db
      .update(schema.countdowns)
      .set({
        title,
        date,
        note: typeof body?.note === 'string' ? body.note : existing.note,
        color: typeof body?.color === 'string' ? body.color : existing.color,
        isYearly: body?.isYearly !== undefined ? body.isYearly : existing.isYearly,
      })
      .where(eq(schema.countdowns.id, id))
    const [row] = await db.select().from(schema.countdowns).where(eq(schema.countdowns.id, id))
    return c.json(row)
  } catch (err) {
    console.error('Countdowns update error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

goals.delete('/countdowns/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'ID 不能为空' }, 400)
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.countdowns).where(eq(schema.countdowns.id, id))
    if (!existing) return c.json({ error: '倒数日不存在' }, 404)
    await db.delete(schema.countdowns).where(eq(schema.countdowns.id, id))
    return c.json({ ok: true })
  } catch (err) {
    console.error('Countdowns delete error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ─────────── 目标 AI 分析 ───────────

goals.get('/ai-analysis', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const rows = await db.select().from(schema.goals).where(eq(schema.goals.status, 'active')).orderBy(desc(schema.goals.createdAt))
    if (rows.length === 0) {
      return c.json({
        generatedAt: new Date().toISOString(),
        fromCache: false,
        report: {
          summary: '没有活跃的目标，开始设定一个目标吧！',
          suggestions: ['设定一个可量化的目标'],
        },
      })
    }

    const prompt = `你是一个个人目标管理助手。分析以下进行中的目标数据，用中文生成简短分析。

目标列表：
${rows.map((g, i) => {
  const progress = g.targetValue && g.targetValue > 0 ? Math.round(((g.currentValue ?? 0) / g.targetValue) * 100) : 0
  return `${i + 1}. ${g.title}${g.description ? ` - ${g.description}` : ''}${g.targetValue ? ` (进度 ${progress}%)` : ''}${g.targetDate ? ` 截止 ${g.targetDate}` : ''}`
}).join('\n')}

请生成以下内容（用中文，简洁有力）：
1. 一句话总结目标进度状况（30 字以内）
2. 针对每个目标给出简短建议
3. 一句鼓励的话`

    const reportText = await callAI(c.env, [{ role: 'user', content: prompt }], { maxTokens: 1024, timeoutMs: 30000 })
    const lines = reportText.split('\n').filter(l => l.trim())
    const summary = lines[0] || '目标分析完成'
    const suggestions = lines.filter(l => l.match(/^\d+[.、]|[-*]/)).map(l => l.replace(/^\d+[.、]\s*|[-*]\s*/, ''))
    const encouragement = lines.filter(l => !l.match(/^\d+[.、]|[-*]/) && l !== lines[0]).join(' ') || '继续加油！'

    const result = {
      generatedAt: new Date().toISOString(),
      fromCache: false,
      report: { summary, suggestions, encouragement },
    }
    return c.json(result)
  } catch (err) {
    console.error('Goals AI analysis error:', err)
    return c.json({ error: 'AI 分析失败' }, 500)
  }
})

export default goals
