import { Hono } from 'hono'
import type { Env } from '../types'
import {
  listTargets, createTarget, updateTarget, deleteTarget,
  getSnapshots, getTodayBrief, runMonitor, pushMonitorBrief,
} from '../monitor-service'

const monitor = new Hono<{ Bindings: Env }>()

// 监控目标 CRUD
monitor.get('/targets', async (c) => {
  try {
    const rows = await listTargets(c.env)
    return c.json(rows)
  } catch (e: any) {
    console.error('[monitor] error:', e)
    return c.json({ error: '操作失败' }, 500)
  }
})

monitor.post('/targets', async (c) => {
  try {
    const body = await c.req.json<{ type: string; platform: string; label: string; targetId?: string; keyword?: string; enabled?: boolean }>()
    if (!body.type || !body.platform || !body.label) {
      return c.json({ ok: false, error: 'type / platform / label 为必填' }, 400)
    }
    const id = await createTarget(c.env, body)
    return c.json({ ok: true, id })
  } catch (e: any) {
    console.error('[monitor] error:', e)
    return c.json({ error: '操作失败' }, 500)
  }
})

monitor.put('/targets/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json<{ type: string; platform: string; label: string; targetId?: string; keyword?: string; enabled?: boolean }>()
    await updateTarget(c.env, id, body)
    return c.json({ ok: true })
  } catch (e: any) {
    console.error('[monitor] error:', e)
    return c.json({ error: '操作失败' }, 500)
  }
})

monitor.delete('/targets/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await deleteTarget(c.env, id)
    return c.json({ ok: true })
  } catch (e: any) {
    console.error('[monitor] error:', e)
    return c.json({ error: '操作失败' }, 500)
  }
})

// 今日简报
monitor.get('/brief', async (c) => {
  try {
    const brief = await getTodayBrief(c.env)
    return c.json(brief || { ok: false, message: '今日简报尚未生成' })
  } catch (e: any) {
    console.error('[monitor] error:', e)
    return c.json({ error: '操作失败' }, 500)
  }
})

// 快照（原始抓取数据，供前端预览；?type=hotlist|youtube）
monitor.get('/snapshots', async (c) => {
  try {
    const date = c.req.query('date') || undefined
    const type = c.req.query('type') || undefined
    const rows = await getSnapshots(c.env, date, type)
    return c.json(rows)
  } catch (e: any) {
    console.error('[monitor] error:', e)
    return c.json({ error: '操作失败' }, 500)
  }
})

// 手动触发一次监控（cron 密钥或登录态均可）
monitor.post('/run-now', async (c) => {
  const secret = c.req.header('x-cron-secret')
  if (c.env.CRON_SECRET && secret !== c.env.CRON_SECRET) {
    return c.json({ ok: false, error: 'secret 不匹配' }, 403)
  }
  try {
    const result = await runMonitor(c.env)
    return c.json(result)
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500)
  }
})

// 单平台刷新：只抓取指定平台的热榜
monitor.post('/run-platform', async (c) => {
  const secret = c.req.header('x-cron-secret')
  if (c.env.CRON_SECRET && secret !== c.env.CRON_SECRET) {
    return c.json({ ok: false, error: 'secret 不匹配' }, 403)
  }
  let body: any
  try { body = await c.req.json() } catch { return c.json({ ok: false, error: '请求格式错误' }, 400) }
  const { platform } = body || {}
  if (!platform) return c.json({ ok: false, error: '缺少 platform 参数' }, 400)
  try {
    const { runMonitorPlatform } = await import('../monitor-service')
    const result = await runMonitorPlatform(c.env, platform)
    return c.json(result)
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500)
  }
})

// 手动推送今日简报到 Telegram
monitor.post('/push', async (c) => {
  const secret = c.req.header('x-cron-secret')
  if (c.env.CRON_SECRET && secret !== c.env.CRON_SECRET) {
    return c.json({ ok: false, error: 'secret 不匹配' }, 403)
  }
  try {
    const result = await pushMonitorBrief(c.env)
    return c.json(result)
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500)
  }
})

export default monitor
