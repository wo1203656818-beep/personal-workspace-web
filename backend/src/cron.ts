import { drizzle } from 'drizzle-orm/d1'
import { eq, and, isNotNull } from 'drizzle-orm'
import * as schema from './schema'
import type { Env } from './types'
import { nowBeijing, todayCST } from './time'
import { decrypt } from './crypto-utils'
import { logSync } from './sync-logger'
import {
  fetchAllSources,
  processPendingItems,
  generateDailyDigest,
  pushDailyBrief,
} from './news-fetcher'
import { runMonitor, pushMonitorBrief } from './monitor-service'
import { syncNotes, syncKnowledgeBase } from './ima-sync'
import { fullSync } from './ms-sync'
import { parseStoredTime, fmtDate } from './utils/helpers'

async function handleReminderPush(env: any, db: any): Promise<void> {
  try {
    const reminderTasks = await db
      .select()
      .from(schema.tasks)
      .where(and(isNotNull(schema.tasks.reminder), eq(schema.tasks.isCompleted, false)))
    if (reminderTasks.length > 0) {
      const nowStr = nowBeijing()
      const timePart = nowStr.split('T')[1] ?? ''
      const [hh, mm] = timePart.split(':')
      const nowMins = parseInt(hh || '0') * 60 + parseInt(mm || '0')
      const due = reminderTasks.filter((t: any) => {
        const rTime = t.reminder!.replace(/\+.*/, '').replace('T', ' ')
        const hm = rTime.split(' ')[1]?.split(':') || []
        const rMins = parseInt(hm[0] || '0') * 60 + parseInt(hm[1] || '0')
        return Math.abs(rMins - nowMins) <= 15
      })
      if (due.length > 0) {
        const tokenRow = await db
          .select()
          .from(schema.settings)
          .where(eq(schema.settings.key, 'telegram_bot_token'))
        const chatRow = await db
          .select()
          .from(schema.settings)
          .where(eq(schema.settings.key, 'telegram_chat_id'))
        const botToken = tokenRow[0]?.value
          ? await decrypt(env.JWT_SECRET, tokenRow[0].value)
          : null
        const chatId = chatRow[0]?.value || null
        if (botToken && chatId) {
          const today = todayCST()
          for (const task of due) {
            const pushed = await env.CACHE.get(`reminder_pushed:${task.id}:${today}`)
            if (pushed) continue
            let text = `⏰ 提醒：${task.title}`
            if (task.dueDate) text += `\n📅 截止：${task.dueDate}`
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
            }).catch(() => {})
            await env.CACHE.put(`reminder_pushed:${task.id}:${today}`, '1', {
              expirationTtl: 86400,
            })
          }
        }
      }
    }
  } catch (e) {
    console.error('[cron] reminder push failed:', e)
  }
}

async function handleRecurrence(env: any, db: any): Promise<void> {
  try {
    const recurring = await db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.isCompleted, true), isNotNull(schema.tasks.recurrence)))
    for (const task of recurring) {
      if (!task.recurrence) continue
      const already = await env.CACHE.get(`recurrence_done:${task.id}`)
      if (already) continue
      const raw = task.recurrence
      let nextDate: string | null = null
      const cur = parseStoredTime(task.dueDate || todayCST())
      if (raw === 'daily') {
        cur.setUTCDate(cur.getUTCDate() + 1)
        nextDate = fmtDate(cur)
      } else if (raw.startsWith('weekly:')) {
        const days =
          raw
            .split(':')[1]
            ?.split(',')
            .map(Number)
            .filter((n: number) => !isNaN(n)) || []
        if (days.length > 0) {
          for (let i = 1; i <= 7; i++) {
            const d = new Date(cur.getTime())
            d.setUTCDate(d.getUTCDate() + i)
            if (days.includes(d.getUTCDay())) {
              nextDate = fmtDate(d)
              break
            }
          }
        }
      } else if (raw.startsWith('monthly:')) {
        const day = parseInt(raw.split(':')[1]) || 1
        const y = cur.getUTCFullYear()
        const m = cur.getUTCMonth() // 0-based
        const nm = m + 1
        const ny = nm > 11 ? y + 1 : y
        const nmAdj = nm > 11 ? 0 : nm
        const maxD = new Date(Date.UTC(ny, nmAdj + 1, 0)).getUTCDate()
        nextDate = `${ny}-${String(nmAdj + 1).padStart(2, '0')}-${String(Math.min(day, maxD)).padStart(2, '0')}`
      }
      if (!nextDate) continue
      await db.insert(schema.tasks).values({
        id: crypto.randomUUID(),
        listId: task.listId,
        title: task.title,
        note: task.note,
        isCompleted: false,
        isImportant: task.isImportant,
        isMyDay: false,
        dueDate: nextDate,
        recurrence: task.recurrence,
        sortOrder: 0,
      })
      await env.CACHE.put(`recurrence_done:${task.id}`, '1', { expirationTtl: 86400 })
    }
  } catch (e) {
    console.error('[cron] recurrence failed:', e)
  }
}

async function handleNewsDigest(env: any): Promise<void> {
  try {
    const { fetched, errors } = await fetchAllSources(env)
    await logSync(env, 'news_fetch', {
      status: errors.length ? 'partial' : 'success',
      synced: fetched,
      message: `[Cron] 新闻抓取 ${fetched} 条${errors.length ? `，${errors.length} 个源出错` : ''}`,
      details: errors.join('\n'),
    })
  } catch (e: any) {
    console.error('[cron] news fetch failed:', e)
    await logSync(env, 'news_fetch', { status: 'error', message: e.message })
  }
  try {
    const { processed, failed } = await processPendingItems(env, 50)
    if (processed > 0 || failed > 0) {
      await logSync(env, 'news_ai', {
        status: failed > 0 && processed === 0 ? 'error' : 'success',
        synced: processed,
        message: `[Cron] AI 评分 ${processed} 条${failed ? `，${failed} 条失败` : ''}`,
      })
    }
  } catch (e: any) {
    console.error('[cron] news ai failed:', e)
    await logSync(env, 'news_ai', { status: 'error', message: e.message })
  }
}

export async function handleScheduled(event: ScheduledEvent, env: any): Promise<void> {
  const db = drizzle(env.DB, { schema })
  const now = nowBeijing()
  // 每个 cron 使用独立锁 key，避免不同任务互相阻塞（如 */15 紧急推送被 */30 长任务跳过）
  // 锁存放在 KV，避免污染 settings 配置表
  const LOCK_KEY = `cron_lock:${event.cron}`
  const LOCK_TTL_S = 30 * 60

  // 简单分布式锁：若 30 分钟内已有其他实例在执行同一 cron，跳过本次
  try {
    const lockVal = await env.CACHE.get(LOCK_KEY)
    if (lockVal) {
      console.warn(`[cron:${event.cron}] 上次执行尚未结束或锁未超时，跳过本次`)
      return
    }
    await env.CACHE.put(LOCK_KEY, now, { expirationTtl: LOCK_TTL_S })
  } catch (e) {
    console.error(`[cron:${event.cron}] lock failed:`, e)
    return
  }

  try {
    if (event.cron === '*/30 * * * *') {
      // 每 30 分钟：MS Todo 同步 + 新闻抓取 + AI 批量评分
      try {
        const result = await fullSync(env)
        await db
          .insert(schema.settings)
          .values({ key: 'ms_last_sync', value: now })
          .onConflictDoUpdate({ target: schema.settings.key, set: { value: now } })
        const status = result.failed === 0 ? 'success' : result.synced > 0 ? 'partial' : 'error'
        await logSync(env, 'ms_todo', {
          status,
          synced: result.synced,
          failed: result.failed,
          skipped: result.skipped,
          message:
            status === 'success'
              ? `[Cron] 同步完成 · ${result.synced} 条任务`
              : status === 'partial'
                ? `[Cron] 部分同步 · ${result.synced} 条成功，${result.failed} 条失败`
                : `[Cron] 同步失败 · ${result.failed} 条任务出错`,
          details: result.errors?.length ? result.errors.join('\n') : undefined,
        })
      } catch (e: any) {
        console.error('[cron] ms-todo failed:', e)
        await logSync(env, 'ms_todo', { status: 'error', message: e.message })
      }
      await handleReminderPush(env, db)
      await handleRecurrence(env, db)
      await handleNewsDigest(env)
    } else if (event.cron === '0 18 * * *') {
      // 每日 2 点（北京，UTC 18:00）：IMA 同步 → 生成今日简报 → 推送 Telegram
      // IMA 同步在前，确保简报用到当天最新的笔记/知识库数据
      try {
        const notesResult = await syncNotes(env)
        if (!notesResult.partial) {
          await db
            .insert(schema.settings)
            .values({ key: 'ima_last_sync', value: now })
            .onConflictDoUpdate({ target: schema.settings.key, set: { value: now } })
        }
        const notesStatus = notesResult.partial ? 'partial' : 'success'
        await logSync(env, 'ima_notes', {
          status: notesStatus,
          synced: notesResult.synced,
          skipped: notesResult.skipped,
          message:
            notesStatus === 'partial'
              ? `[Cron] 部分同步 · ${notesResult.synced} 条笔记`
              : `[Cron] 同步完成 · ${notesResult.synced} 条笔记`,
        })
      } catch (e: any) {
        console.error('[cron] ima notes failed:', e)
        await logSync(env, 'ima_notes', { status: 'error', message: e.message })
      }

      try {
        const kbResult = await syncKnowledgeBase(env)
        await logSync(env, 'ima_kb', {
          status: 'success',
          synced: kbResult.synced,
          message: `[Cron] 同步完成 · ${kbResult.synced} 个文件`,
        })
      } catch (e: any) {
        console.error('[cron] ima kb failed:', e)
        await logSync(env, 'ima_kb', { status: 'error', message: e.message })
      }

      // 生成今日简报 + 推送 Telegram
      try {
        const result = await generateDailyDigest(env)
        if (result.ok) {
          await logSync(env, 'news_digest', {
            status: 'success',
            message: `[Cron] 每日简报已生成`,
          })
          // 自动推送（如果配置了 Telegram）
          const pushResult = await pushDailyBrief(env)
          if (pushResult.ok) {
            await logSync(env, 'news_push', {
              status: 'success',
              message: `[Cron] 简报已推送到 Telegram`,
            })
          } else if (pushResult.error && !pushResult.error.includes('配置未完成')) {
            await logSync(env, 'news_push', { status: 'error', message: pushResult.error })
          }
        } else {
          await logSync(env, 'news_digest', {
            status: 'error',
            message: `[Cron] 今日无足够评分条目，简报未生成`,
          })
        }
      } catch (e: any) {
        console.error('[cron] news digest failed:', e)
        await logSync(env, 'news_digest', { status: 'error', message: e.message })
      }

      // 自媒体对标监控：热榜选题 + YouTube 竞品 → 生成选题简报 → 推送 Telegram
      try {
        const mRes = await runMonitor(env)
        if (mRes.ok) {
          await logSync(env, 'monitor', {
            status: 'success',
            message: `[Cron] 监控简报已生成（热榜${mRes.hotTargets}/对标${mRes.ytTargets}）`,
          })
          const pRes = await pushMonitorBrief(env)
          if (pRes.ok) {
            await logSync(env, 'monitor_push', {
              status: 'success',
              message: `[Cron] 监控简报已推送 Telegram`,
            })
          } else if (
            pRes.error &&
            !pRes.error.includes('配置未完成') &&
            !pRes.error.includes('尚未生成')
          ) {
            await logSync(env, 'monitor_push', { status: 'error', message: pRes.error })
          }
        } else {
          await logSync(env, 'monitor', {
            status: 'error',
            message: mRes.error || '[Cron] 监控简报生成失败',
          })
        }
      } catch (e: any) {
        console.error('[cron] monitor failed:', e)
        await logSync(env, 'monitor', { status: 'error', message: e.message })
      }
    } else {
      console.warn('[cron] unknown cron pattern:', event.cron)
    }
  } finally {
    // 释放锁
    try {
      await env.CACHE.delete(LOCK_KEY)
    } catch (e) {
      console.error(`[cron:${event.cron}] unlock failed:`, e)
    }
  }
}
