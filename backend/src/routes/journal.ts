import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, desc, gte, sql, count } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '../schema'
import type { Env } from '../types'
import { nowBeijing } from '../time'
import { callAI } from '../utils/ai-client'

const journal = new Hono<{ Bindings: Env }>()

interface JournalBody {
  title?: string
  content?: string
  date?: string
  mood?: string
  tags?: string[]
}

// 日记统计
journal.get('/stats', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const today = new Date().toISOString().slice(0, 10)

    // 总记录数 - 单次聚合查询
    const [totalRow] = await db
      .select({ count: count() })
      .from(schema.journalEntries)

    const total = Number(totalRow?.count ?? 0)

    // 本周记录数 - 范围聚合查询
    const weekStart = new Date(today + 'T00:00:00Z')
    const dayOfWeek = weekStart.getUTCDay()
    weekStart.setUTCDate(weekStart.getUTCDate() - ((dayOfWeek === 0 ? 7 : dayOfWeek) - 1))
    const weekStartStr = `${weekStart.getUTCFullYear()}-${String(weekStart.getUTCMonth() + 1).padStart(2, '0')}-${String(weekStart.getUTCDate()).padStart(2, '0')}`

    const [thisWeekRow] = await db
      .select({ count: count() })
      .from(schema.journalEntries)
      .where(gte(schema.journalEntries.date, weekStartStr))

    // 本月记录数 - 范围聚合查询
    const thisMonth = today.slice(0, 7)
    const [thisMonthRow] = await db
      .select({ count: count() })
      .from(schema.journalEntries)
      .where(sql`substr(${schema.journalEntries.date}, 1, 7) = ${thisMonth}`)

    // 计算连续天数 - 仅拉取日期字段
    const allDates = await db
      .select({ date: schema.journalEntries.date })
      .from(schema.journalEntries)
      .orderBy(desc(schema.journalEntries.date))

    let streak = 0
    const checkDate = new Date(today + 'T00:00:00Z')
    const dateSet = new Set(allDates.map((r) => r.date))

    while (true) {
      const dateStr = `${checkDate.getUTCFullYear()}-${String(checkDate.getUTCMonth() + 1).padStart(2, '0')}-${String(checkDate.getUTCDate()).padStart(2, '0')}`
      if (dateSet.has(dateStr)) {
        streak++
        checkDate.setUTCDate(checkDate.getUTCDate() - 1)
      } else {
        break
      }
    }

    // 最近一周情绪分布 - 单次范围查询替代 7 次逐日查询
    const recentMoods: { date: string; mood: string | null }[] = []
    const weekAgo = new Date(today + 'T00:00:00Z')
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 6)
    const weekAgoStr = `${weekAgo.getUTCFullYear()}-${String(weekAgo.getUTCMonth() + 1).padStart(2, '0')}-${String(weekAgo.getUTCDate()).padStart(2, '0')}`

    const moodRows = await db
      .select({ date: schema.journalEntries.date, mood: schema.journalEntries.mood })
      .from(schema.journalEntries)
      .where(gte(schema.journalEntries.date, weekAgoStr))
      .orderBy(schema.journalEntries.date)

    const moodMap = new Map<string, string | null>()
    for (const r of moodRows) {
      if (!moodMap.has(r.date)) {
        moodMap.set(r.date, r.mood)
      }
    }

    for (let i = 6; i >= 0; i--) {
      const dd = new Date(today + 'T00:00:00Z')
      dd.setUTCDate(dd.getUTCDate() - i)
      const dateStr = `${dd.getUTCFullYear()}-${String(dd.getUTCMonth() + 1).padStart(2, '0')}-${String(dd.getUTCDate()).padStart(2, '0')}`
      recentMoods.push({ date: dateStr, mood: moodMap.get(dateStr) ?? null })
    }

    return c.json({ total, streak, thisWeek: Number(thisWeekRow?.count ?? 0), thisMonthCount: Number(thisMonthRow?.count ?? 0), recentMoods })
  } catch (err) {
    console.error('Journal stats error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

journal.get('/', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const date = c.req.query('date')
    const month = c.req.query('month')
    
    let q: any = db.select().from(schema.journalEntries)
    
    if (date) {
      q = q.where(eq(schema.journalEntries.date, date))
    }
    if (month) {
      q = q.where(sql`substr(${schema.journalEntries.date}, 1, 7) = ${month}`)
    }
    
    const rows = await q.orderBy(desc(schema.journalEntries.date))
    return c.json(rows)
  } catch (err) {
    console.error('Journal list error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

journal.get('/:id', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'ID 不能为空' }, 400)
    const [row] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, id))
    if (!row) return c.json({ error: '记录不存在' }, 404)
    return c.json(row)
  } catch (err) {
    console.error('Journal get error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

journal.post('/', async (c) => {
  try {
    let body: JournalBody
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: '请求体格式无效' }, 400)
    }
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const content = typeof body?.content === 'string' ? body.content : ''
    const date = typeof body?.date === 'string' ? body.date : new Date().toISOString().slice(0, 10)
    if (!content) return c.json({ error: '内容不能为空' }, 400)
    
    const db = drizzle(c.env.DB, { schema })
    const id = crypto.randomUUID()
    await db.insert(schema.journalEntries).values({
      id,
      title,
      content,
      mood: typeof body?.mood === 'string' ? body.mood : null,
      tags: Array.isArray(body?.tags) ? JSON.stringify(body.tags) : null,
      date,
    })
    const [row] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, id))
    return c.json(row, 201)
  } catch (err) {
    console.error('Journal create error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

journal.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'ID 不能为空' }, 400)
    let body: JournalBody
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: '请求体格式无效' }, 400)
    }
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, id))
    if (!existing) return c.json({ error: '记录不存在' }, 404)
    
    await db.update(schema.journalEntries)
      .set({
        title: typeof body?.title === 'string' ? body.title.trim() : existing.title,
        content: typeof body?.content === 'string' ? body.content : existing.content,
        mood: typeof body?.mood === 'string' ? body.mood : existing.mood,
        tags: Array.isArray(body?.tags) ? JSON.stringify(body.tags) : existing.tags,
        date: typeof body?.date === 'string' ? body.date : existing.date,
        updatedAt: sql`(datetime('now'))`,
      })
      .where(eq(schema.journalEntries.id, id))
    
    const [row] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, id))
    return c.json(row)
  } catch (err) {
    console.error('Journal update error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

journal.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'ID 不能为空' }, 400)
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.id, id))
    if (!existing) return c.json({ error: '记录不存在' }, 404)
    await db.delete(schema.journalEntries).where(eq(schema.journalEntries.id, id))
    return c.json({ ok: true })
  } catch (err) {
    console.error('Journal delete error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// 日记情绪 AI 分析
journal.get('/ai-analysis', async (c) => {
  try {
    // 1. 检查 KV 缓存
    const cached = await c.env.CACHE.get('journal_ai_analysis')
    if (cached) {
      return c.json({ ...JSON.parse(cached), fromCache: true })
    }

    const db = drizzle(c.env.DB, { schema })
    const today = new Date().toISOString().slice(0, 10)
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 89)
    const fromDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

    // 2. 读取最近 90 天日记
    const entries = await db
      .select()
      .from(schema.journalEntries)
      .where(gte(schema.journalEntries.date, fromDate))
      .orderBy(schema.journalEntries.date)

    if (entries.length === 0) {
      return c.json({
        generatedAt: nowBeijing(),
        fromCache: false,
        report: {
          summary: '过去 90 天没有日记记录，开始写日记来生成情绪分析吧！',
          totalEntries: 0,
          moodDistribution: {},
          suggestions: ['开始记录你的第一篇日记'],
        },
      })
    }

    // 3. 统计
    const totalEntries = entries.length
    const moodMap: Record<string, number> = {}
    const tagMap: Record<string, number> = {}
    for (const e of entries) {
      if (e.mood) moodMap[e.mood] = (moodMap[e.mood] || 0) + 1
      if (e.tags) {
        try {
          const tags = JSON.parse(e.tags) as string[]
          for (const t of tags) tagMap[t] = (tagMap[t] || 0) + 1
        } catch {}
      }
    }
    const topMood = Object.entries(moodMap).sort((a, b) => b[1] - a[1]).slice(0, 3)
    const topTags = Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 5)

    // 4. 构建 AI prompt
    const prompt = `你是一个日记情绪分析助手。分析以下日记数据，用中文生成简短报告。

数据概览：
- 总篇数：${totalEntries} 篇
- 时间范围：${fromDate} 至 ${today}

情绪分布：
${topMood.length > 0 ? topMood.map(([m, c]) => `  ${m}: ${c}次`).join('\n') : '  无情绪标签'}

热门标签：
${topTags.length > 0 ? topTags.map(([t, c]) => `  ${t}: ${c}次`).join('\n') : '  无标签'}

请生成以下内容（用中文，简洁有力）：
1. 一句话总结情绪状态（30 字以内）
2. 情绪模式分析（主要情绪、变化趋势）
3. 2-3 条保持心理健康的建议`

    // 5. 调用 AI
    const reportText = await callAI(c.env, [{ role: 'user', content: prompt }], { maxTokens: 1024, timeoutMs: 30000 })

    // 6. 解析
    const lines = reportText.split('\n').filter(l => l.trim())
    const summary = lines[0] || '情绪分析完成'
    const pattern = lines.slice(1).filter(l => !l.match(/^\d+[.、]|[-*]/)).join(' ') || '请查看详细数据'
    const suggestions = lines.filter(l => l.match(/^\d+[.、]|[-*]/)).map(l => l.replace(/^\d+[.、]\s*|[-*]\s*/, ''))

    const report = {
      summary,
      totalEntries,
      moodDistribution: moodMap,
      topMoods: topMood.map(([mood, count]) => ({ mood, count })),
      topTags: topTags.map(([tag, count]) => ({ tag, count })),
      pattern,
      suggestions: suggestions.length > 0 ? suggestions : ['保持写日记的习惯，关注情绪变化！'],
    }

    // 7. 缓存
    const result = { generatedAt: nowBeijing(), fromCache: false, report }
    await c.env.CACHE.put('journal_ai_analysis', JSON.stringify(result), { expirationTtl: 3600 })

    return c.json(result)
  } catch (err) {
    console.error('Journal AI analysis error:', err)
    return c.json({ error: 'AI 分析失败' }, 500)
  }
})

export default journal