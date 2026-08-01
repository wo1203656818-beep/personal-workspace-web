import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc, gte } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { nowBeijing, todayCST } from '../time'
import { getActiveConfig } from '../ai-configs'

const focus = new Hono<{ Bindings: Env }>()

// 会话列表（最近 N 天，默认 14 天）
focus.get('/', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const days = Math.min(parseInt(c.req.query('days') || '14'), 90)
    const from = todayCST()
    const d = new Date(from + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - (days - 1))
    const fromDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

    const sessions = await db
      .select()
      .from(schema.focusSessions)
      .where(gte(schema.focusSessions.startedAt, fromDate))
      .orderBy(desc(schema.focusSessions.startedAt))
      .limit(500)

    // 汇总：今日专注总时长 / 完成番茄数 / 累计
    const today = todayCST()
    const [todaySessions, allStats] = await Promise.all([
      db
        .select()
        .from(schema.focusSessions)
        .where(gte(schema.focusSessions.startedAt, today)),
      db
        .select()
        .from(schema.focusSessions)
        .where(eq(schema.focusSessions.completed, true)),
    ])

    const todayMinutes = todaySessions
      .filter((s) => s.completed)
      .reduce((sum, s) => sum + s.minutes, 0)
    const todayCount = todaySessions.filter((s) => s.completed).length
    const totalMinutes = allStats.reduce((sum, s) => sum + s.minutes, 0)
    const totalCount = allStats.length

    return c.json({
      sessions,
      stats: { todayMinutes, todayCount, totalMinutes, totalCount },
    })
  } catch (err) {
    console.error('Focus list error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// 记录一次专注会话
focus.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const minutes = Math.min(parseInt(body?.minutes) || 25, 180)
    if (minutes < 1) return c.json({ error: '时长无效' }, 400)
    const db = drizzle(c.env.DB, { schema })
    const id = crypto.randomUUID()
    const completed = body?.completed !== false
    await db.insert(schema.focusSessions).values({
      id,
      taskId: typeof body?.taskId === 'string' && body.taskId ? body.taskId : null,
      taskTitle: typeof body?.taskTitle === 'string' ? body.taskTitle : null,
      minutes,
      completed,
      startedAt: typeof body?.startedAt === 'string' ? body.startedAt : nowBeijing(),
      endedAt: typeof body?.endedAt === 'string' ? body.endedAt : nowBeijing(),
    })
    const [row] = await db.select().from(schema.focusSessions).where(eq(schema.focusSessions.id, id))
    return c.json(row, 201)
  } catch (err) {
    console.error('Focus create error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// 专注统计（趋势）
focus.get('/stats', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    // 本周数据（最近7天）
    const today = todayCST()
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 6)
    const fromDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    
    const sessions = await db
      .select()
      .from(schema.focusSessions)
      .where(gte(schema.focusSessions.startedAt, fromDate))
      .orderBy(desc(schema.focusSessions.startedAt))
    
    // 按天聚合
    const dailyMap: Record<string, { minutes: number; count: number }> = {}
    for (const s of sessions) {
      if (!s.completed) continue
      const day = s.startedAt.slice(0, 10)
      if (!dailyMap[day]) dailyMap[day] = { minutes: 0, count: 0 }
      dailyMap[day].minutes += s.minutes
      dailyMap[day].count += 1
    }
    
    // 生成最近7天完整数据
    const weekly: { date: string; minutes: number; count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const dd = new Date(today + 'T00:00:00Z')
      dd.setUTCDate(dd.getUTCDate() - i)
      const dateStr = `${dd.getUTCFullYear()}-${String(dd.getUTCMonth() + 1).padStart(2, '0')}-${String(dd.getUTCDate()).padStart(2, '0')}`
      weekly.push({
        date: dateStr,
        minutes: dailyMap[dateStr]?.minutes || 0,
        count: dailyMap[dateStr]?.count || 0,
      })
    }
    
    // 今日统计数据（复用已有逻辑）
    const [todaySessions, allStats] = await Promise.all([
      db
        .select()
        .from(schema.focusSessions)
        .where(gte(schema.focusSessions.startedAt, today)),
      db
        .select()
        .from(schema.focusSessions)
        .where(eq(schema.focusSessions.completed, true)),
    ])
    
    const todayMinutes = todaySessions
      .filter((s) => s.completed)
      .reduce((sum, s) => sum + s.minutes, 0)
    const todayCount = todaySessions.filter((s) => s.completed).length
    const totalMinutes = allStats.reduce((sum, s) => sum + s.minutes, 0)
    const totalCount = allStats.length
    
    return c.json({
      todayMinutes,
      todayCount,
      totalMinutes,
      totalCount,
      weekly,
    })
  } catch (err) {
    console.error('Focus stats error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// 删除会话
focus.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.focusSessions).where(eq(schema.focusSessions.id, id))
    if (!existing) return c.json({ error: '会话不存在' }, 404)
    await db.delete(schema.focusSessions).where(eq(schema.focusSessions.id, id))
    return c.json({ ok: true })
  } catch (err) {
    console.error('Focus delete error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// AI 专注分析
focus.get('/ai-analysis', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })

    // 1. 检查 KV 缓存
    const cached = await c.env.CACHE.get('focus_ai_analysis')
    if (cached) {
      return c.json({ ...JSON.parse(cached), fromCache: true })
    }

    // 2. 读取最近 30 天已完成的专注会话
    const today = todayCST()
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 29)
    const fromDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

    const sessions = await db
      .select()
      .from(schema.focusSessions)
      .where(
        and(
          gte(schema.focusSessions.startedAt, fromDate),
          eq(schema.focusSessions.completed, true),
        ),
      )
      .orderBy(schema.focusSessions.startedAt)

    if (sessions.length === 0) {
      return c.json({
        generatedAt: nowBeijing(),
        fromCache: false,
        report: {
          summary: '过去 30 天没有专注记录，开始一个番茄钟来生成分析吧！',
          dailyTrend: '暂无数据',
          peakHours: '暂无数据',
          topTasks: [],
          suggestions: ['开始你的第一个番茄钟'],
        },
      })
    }

    // 3. 计算统计数据
    const totalMinutes = sessions.reduce((s, x) => s + x.minutes, 0)
    const totalSessions = sessions.length
    const avgMinutes = Math.round(totalMinutes / totalSessions)

    // 按天聚合
    const dailyMap: Record<string, number> = {}
    for (const s of sessions) {
      const day = s.startedAt.slice(0, 10)
      dailyMap[day] = (dailyMap[day] || 0) + s.minutes
    }
    const daysWithData = Object.keys(dailyMap).length

    // 按小时聚合
    const hourlyMap: Record<string, number> = {}
    for (const s of sessions) {
      const hour = s.startedAt.slice(11, 13)
      hourlyMap[hour] = (hourlyMap[hour] || 0) + s.minutes
    }
    const sortedHours = Object.entries(hourlyMap).sort((a, b) => b[1] - a[1])
    const peakHour = sortedHours.length > 0 ? sortedHours[0][0] : '?'

    // 按任务聚合
    const taskMap: Record<string, { minutes: number; count: number }> = {}
    for (const s of sessions) {
      const key = s.taskTitle || '未关联任务'
      if (!taskMap[key]) taskMap[key] = { minutes: 0, count: 0 }
      taskMap[key].minutes += s.minutes
      taskMap[key].count += 1
    }
    const topTasks = Object.entries(taskMap)
      .sort((a, b) => b[1].minutes - a[1].minutes)
      .slice(0, 5)
      .map(([taskTitle, data]) => ({
        taskTitle,
        totalMinutes: data.minutes,
        sessionCount: data.count,
      }))

    // 4. 构建 AI prompt
    const prompt = `你是一个专注力分析助手。分析以下专注数据，用中文生成简短报告。

数据概览：
- 总专注时长：${totalMinutes} 分钟
- 总会话数：${totalSessions} 次
- 平均每次：${avgMinutes} 分钟
- 有专注记录的天数：${daysWithData} 天
- 最活跃时段：${peakHour}:00 左右

按小时分布（小时:分钟）：
${Object.entries(hourlyMap).sort((a, b) => Number(a[0]) - Number(b[0])).map(([h, m]) => `  ${h}:00 — ${m}分钟`).join('\n')}

按任务分布：
${topTasks.map(t => `  ${t.taskTitle} — ${t.totalMinutes}分钟（${t.sessionCount}次）`).join('\n')}

请生成以下内容（用中文，简洁有力）：
1. 一句话总结（30 字以内）
2. 每日趋势判断（上升/下降/稳定）
3. 效率时段分析（哪个时段最高效）
4. 2-3 条可操作建议`

    // 5. 调用 AI
    const aiConfig = await getActiveConfig(c.env)

    let reportText: string
    if (aiConfig && aiConfig.type === 'openai') {
      // 使用用户配置的 AI
      const response = await fetch(new URL('/chat/completions', aiConfig.baseUrl).toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1024,
        }),
      })
      const data = await response.json() as any
      reportText = data.choices?.[0]?.message?.content || 'AI 分析暂时不可用'
    } else {
      // 使用 Workers AI
      const aiResp = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
      }) as any
      reportText = aiResp.response || 'AI 分析暂时不可用'
    }

    // 6. 解析 AI 输出
    const lines = reportText.split('\n').filter(l => l.trim())
    const summary = lines[0] || '专注数据分析完成'
    const dailyTrend = lines[1] || '请查看详细数据'
    const peakHours = lines[2] || '请查看详细数据'
    const suggestions = lines.slice(3).filter(l => l.match(/^\d+[.、]|[-*]/)).map(l => l.replace(/^\d+[.、]\s*|[-*]\s*/, ''))

    const report = {
      summary,
      dailyTrend,
      peakHours,
      topTasks,
      suggestions: suggestions.length > 0 ? suggestions : ['保持专注，继续加油！'],
    }

    // 7. 缓存到 KV（1 小时）
    const result = { generatedAt: nowBeijing(), fromCache: false, report }
    await c.env.CACHE.put('focus_ai_analysis', JSON.stringify(result), { expirationTtl: 3600 })

    return c.json(result)
  } catch (err) {
    console.error('Focus AI analysis error:', err)
    return c.json({ error: 'AI 分析失败' }, 500)
  }
})

export default focus
