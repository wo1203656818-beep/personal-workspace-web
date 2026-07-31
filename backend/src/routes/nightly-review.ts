import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, isNull, sql, desc, gte } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { todayCST } from '../time'
import { callAI } from '../utils/ai-client'

const nightlyReview = new Hono<{ Bindings: Env }>()

nightlyReview.post('/', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const today = todayCST()

  const [completedToday, pendingToday, moodToday, decisionToday] = await Promise.all([
    db
      .select()
      .from(schema.tasks)
      .where(
        and(eq(schema.tasks.isCompleted, true), sql`date(${schema.tasks.updatedAt}) = ${today}`),
      ),
    db
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.isCompleted, false),
          isNull(schema.tasks.msTodoDeletedAt),
          sql`date(${schema.tasks.createdAt}) <= ${today}`,
        ),
      )
      .limit(10),
    db
      .select()
      .from(schema.moodLogs)
      .where(gte(schema.moodLogs.createdAt, today))
      .limit(1),
    db
      .select()
      .from(schema.decisionLogs)
      .where(gte(schema.decisionLogs.createdAt, today)),
  ])

  const completedList = completedToday.map((t) => `- ${t.title}`).join('\n') || '无'
  const pendingList =
    pendingToday.map((t) => `- ${t.title}${t.dueDate ? ` (截止: ${t.dueDate})` : ''}`).join('\n') ||
    '无'
  const moodEmoji =
    moodToday.length > 0
      ? { sunny: '☀️', cloudy: '⛅', rainy: '🌧️', stormy: '⛈️', snowy: '🌨️' }[
          moodToday[0].weather
        ] || '🙂'
      : '未记录'
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
3. 一句鼓励的话`

  let review = ''
  try {
    review = await callAI(c.env, [
      { role: 'system', content: '你是温暖的生活回顾助手。请用简洁的中文回复，总字数控制在200字以内。' },
      { role: 'user', content: prompt },
    ], { maxTokens: 500 })
  } catch (e) {
    console.error('[nightly-review] AI 调用失败:', e)
    return c.json({ error: 'AI 调用失败' }, 500)
  }

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
  const settings = await db
    .select()
    .from(schema.settings)
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
