import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, isNull, sql, desc, gte } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { todayCST } from '../time'

const nightlyReview = new Hono<{ Bindings: Env }>()

nightlyReview.post('/', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const today = todayCST()

  const completedToday = await db.select().from(schema.tasks)
    .where(and(
      eq(schema.tasks.isCompleted, true),
      sql`date(${schema.tasks.updatedAt}) = ${today}`,
    ))

  const pendingToday = await db.select().from(schema.tasks)
    .where(and(
      eq(schema.tasks.isCompleted, false),
      isNull(schema.tasks.msTodoDeletedAt),
      sql`date(${schema.tasks.createdAt}) <= ${today}`,
    ))
    .limit(10)

  const moodToday = await db.select().from(schema.moodLogs)
    .where(gte(schema.moodLogs.createdAt, today))
    .limit(1)

  const decisionToday = await db.select().from(schema.decisionLogs)
    .where(gte(schema.decisionLogs.createdAt, today))

  const aiConfig = await db.select().from(schema.aiConfigs)
    .where(eq(schema.aiConfigs.isDefault, true))
    .limit(1)

  if (!aiConfig.length || !aiConfig[0].apiKey) {
    return c.json({ error: '未配置 AI' }, 400)
  }

  const config = aiConfig[0]
  const baseUrl = config.baseUrl || 'https://api.openai.com/v1'

  const completedList = completedToday.map(t => `- ${t.title}`).join('\n') || '无'
  const pendingList = pendingToday.map(t => `- ${t.title}${t.dueDate ? ` (截止: ${t.dueDate})` : ''}`).join('\n') || '无'
  const moodEmoji = moodToday.length > 0 ? { sunny: '☀️', cloudy: '⛅', rainy: '🌧️', stormy: '⛈️', snowy: '🌨️' }[moodToday[0].weather] || '🙂' : '未记录'
  const decisionCount = decisionToday.length

  const prompt = `你是一个温暖的生活回顾助手。请根据以下数据生成今日回顾和明日建议。

## 今日数据

### 已完成的任务 (${completedToday.length}个)
${completedList}

### 未完成的任务 (${pendingToday.length}个)
${pendingList}

### 今日心情
${moodEmoji}

### 今日决策次数
${decisionCount}次

请生成：
1. 一句话总结今天（温暖、鼓励的语气）
2. 明日最值得做的3件事（基于未完成任务的重要性）
3. 一句鼓励的话

请用简洁的中文回复，总字数控制在200字以内。`

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    }),
  })

  if (!resp.ok) {
    return c.json({ error: 'AI 调用失败' }, 500)
  }

  const data = await resp.json() as any
  const review = data.choices?.[0]?.message?.content || '今日回顾生成失败'

  return c.json({
    date: today,
    review,
    stats: {
      completed: completedToday.length,
      pending: pendingToday.length,
      mood: moodEmoji,
      decisions: decisionCount,
    },
  })
})

nightlyReview.get('/history', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const settings = await db.select().from(schema.settings)
    .where(eq(schema.settings.key, 'nightly_reviews'))
    .limit(1)

  if (!settings.length) return c.json([])
  try {
    return c.json(JSON.parse(settings[0].value))
  } catch {
    return c.json([])
  }
})

export default nightlyReview
