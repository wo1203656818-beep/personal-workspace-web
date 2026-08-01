import { drizzle } from 'drizzle-orm/d1'
import { eq, and, isNull, isNotNull, gte, desc, sql } from 'drizzle-orm'
import * as schema from './schema'
import type { Env } from './types'
import { todayCST } from './time'
import { getSetting } from './utils/settings'
import { callAI } from './utils/ai-client'
import { fetchWithTimeout } from './utils/fetch-timeout'

// 推送前统一检查开关（settings: notify_daily_suggestions / notify_weekly_report）
async function pushEnabled(env: Env, key: string): Promise<boolean> {
  const val = await getSetting(env, key)
  return val !== '0'
}

async function getTelegram(env: Env): Promise<{ botToken: string; chatId: string } | null> {
  const botToken = await getSetting(env, 'telegram_bot_token')
  const chatId = await getSetting(env, 'telegram_chat_id')
  if (!botToken || !chatId) return null
  return { botToken, chatId }
}

async function sendTelegram(
  env: Env,
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  await fetchWithTimeout(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    },
    10000,
  ).catch(() => {})
}

// 生成并推送"每日 AI 代办建议"（早上 6 点触发）
export async function runDailySuggestion(env: Env): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await pushEnabled(env, 'notify_daily_suggestions'))) {
      return { ok: false, error: '通知已关闭' }
    }
    const tg = await getTelegram(env)
    if (!tg) return { ok: false, error: 'Telegram 配置未完成' }

    const db = drizzle(env.DB, { schema })
    const today = todayCST()

    // 今日待办：我的日子 / 今天截止 / 未完成的重要任务
    const pending = await db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.isCompleted, false)))
      .orderBy(desc(schema.tasks.isImportant))
      .limit(80)

    const todayTasks = pending.filter(
      (t) =>
        t.isMyDay ||
        (t.myDayDate && t.myDayDate <= today) ||
        (t.dueDate && t.dueDate <= today) ||
        t.isImportant,
    )
    const taskList = todayTasks
      .slice(0, 20)
      .map((t) => `- ${t.title}${t.dueDate ? `（截止 ${t.dueDate}）` : ''}${t.isImportant ? ' ⭐' : ''}`)
      .join('\n')

    const completedToday = await db
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.isCompleted, true),
          isNotNull(schema.tasks.updatedAt),
          gte(schema.tasks.updatedAt!, today),
        ),
      )

    const content = taskList
      ? `今日待办任务：\n${taskList}\n\n已完成：${completedToday.length} 项`
      : `今天没有待办任务（已完成 ${completedToday.length} 项）。`

    let ai = ''
    try {
      ai = await callAI(env, [
        {
          role: 'system',
          content:
            '你是用户的个人效率教练。基于待办任务给出今天 3-5 条简洁可执行的行动建议（中文，每条一行，不要序号标点以外的修饰）。结合优先级、截止日期安排先后顺序。',
        },
        { role: 'user', content },
      ])
    } catch {
      ai = ''
    }

    const message = [
      `☀️ <b>${today} 今日行动建议</b>`,
      '',
      ai || taskList || '今天任务不多，好好休息或提前安排明天。',
    ].join('\n')

    await sendTelegram(env, tg.botToken, tg.chatId, message)
    return { ok: true }
  } catch (e: any) {
    console.error('[cron] daily suggestion failed:', e)
    return { ok: false, error: e.message }
  }
}

// 生成并推送"每周周报"（周日早上 9 点触发）
export async function runWeeklyReport(env: Env): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!(await pushEnabled(env, 'notify_weekly_report'))) {
      return { ok: false, error: '通知已关闭' }
    }
    const tg = await getTelegram(env)
    if (!tg) return { ok: false, error: 'Telegram 配置未完成' }

    const db = drizzle(env.DB, { schema })
    const today = todayCST()
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 6)
    const from = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

    const [completedTasks, newNotes, focusRows, habitRows, expenseRows] = await Promise.all([
      db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.isCompleted, true), gte(schema.tasks.updatedAt!, from))),
      db.select({ id: schema.imaNotes.id }).from(schema.imaNotes),
      db
        .select({ minutes: schema.focusSessions.minutes, completed: schema.focusSessions.completed })
        .from(schema.focusSessions)
        .where(gte(schema.focusSessions.startedAt, from)),
      db
        .select()
        .from(schema.habitCheckins)
        .where(gte(schema.habitCheckins.date, from)),
      db
        .select({ amount: schema.expenses.amount })
        .from(schema.expenses)
        .where(gte(schema.expenses.date, from)),
    ])

    const focusMinutes = focusRows.filter((r) => r.completed).reduce((s, r) => s + r.minutes, 0)
    const expenseTotal = expenseRows.reduce((s, r) => s + r.amount, 0)
    const habitsPerDay = new Map<string, number>()
    for (const h of habitRows) habitsPerDay.set(h.date, (habitsPerDay.get(h.date) || 0) + 1)

    const content = [
      `📊 本周数据（${from} ~ ${today}）`,
      `· 完成任务：${completedTasks.length} 项`,
      `· 新增笔记：${newNotes.length} 条`,
      `· 专注时长：${focusMinutes} 分钟（${focusRows.filter((r) => r.completed).length} 个番茄）`,
      `· 习惯打卡：${habitRows.length} 次`,
      `· 记账支出：¥${expenseTotal.toFixed(2)}`,
    ].join('\n')

    let ai = ''
    try {
      ai = await callAI(env, [
        {
          role: 'system',
          content:
            '你是用户的个人数据分析师。根据本周数据写一段 3-5 句的中文周报总结：指出亮点、发现可改进点、给出下周 1 条行动建议。语气温和、具体、不说教。',
        },
        { role: 'user', content },
      ])
    } catch {
      ai = ''
    }

    const message = [
      `🗓 <b>个人周报 · ${from} ~ ${today}</b>`,
      '',
      content,
      '',
      ai || '本周数据已汇总，继续保持！',
    ].join('\n')

    await sendTelegram(env, tg.botToken, tg.chatId, message)
    return { ok: true }
  } catch (e: any) {
    console.error('[cron] weekly report failed:', e)
    return { ok: false, error: e.message }
  }
}
