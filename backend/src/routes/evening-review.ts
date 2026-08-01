import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, gte, sql, and, isNull } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { callAI } from '../utils/ai-client'
import { todayCST, nowBeijing } from '../time'
import { fetchWithTimeout } from '../utils/fetch-timeout'

const eveningReview = new Hono<{ Bindings: Env }>()

eveningReview.post('/generate', async (c) => {
  try {
    const today = todayCST()
    const db = drizzle(c.env.DB, { schema })

    // 聚合当天数据
    const [{ count: completedTasks }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.isCompleted, true), isNull(schema.tasks.msTodoDeletedAt), gte(schema.tasks.updatedAt, today)))

    const [{ count: focusMinutes }] = await db
      .select({ count: sql<number>`COALESCE(SUM(minutes),0)` })
      .from(schema.focusSessions)
      .where(and(eq(schema.focusSessions.completed, true), gte(schema.focusSessions.startedAt, today)))

    const [{ count: habitDone }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.habitCheckins)
      .where(eq(schema.habitCheckins.date, today))

    const [{ count: habitTotal }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.habits)

    const [{ count: journalCount }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.journalEntries)
      .where(eq(schema.journalEntries.date, today))

    // AI 生成回顾
    const prompt = `你是个人晚间回顾助手。根据以下数据生成 100 字以内的晚间回顾，语气温暖鼓励。
今天完成了 ${completedTasks} 个任务，专注了 ${focusMinutes} 分钟，打卡了 ${habitDone}/${habitTotal} 个习惯，${journalCount > 0 ? '写了日记' : '未写日记'}.`

    const review = await callAI(c.env, [
      { role: 'system', content: '你是个人晚间回顾助手，用温暖鼓励的语气输出 100 字以内的中文回顾。' },
      { role: 'user', content: prompt },
    ], { maxTokens: 300 })

    // 通过 Telegram 推送
    const settings = await db.select().from(schema.settings)
    const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]))
    const botToken = settingsMap['telegram_bot_token']
    const chatId = settingsMap['telegram_chat_id']

    if (botToken && chatId) {
      const text = `🌙 晚间回顾\n\n${review.trim()}`
      await fetchWithTimeout(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: parseInt(chatId), text }),
        },
        10000,
      )
    }

    return c.json({ ok: true, review: review.trim() })
  } catch (err) {
    console.error('[evening-review] error:', err)
    return c.json({ error: '生成失败' }, 500)
  }
})

export default eveningReview