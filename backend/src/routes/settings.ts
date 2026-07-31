import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { settingsSchema } from '../validation'
import { decrypt, encryptSettings, SENSITIVE_KEYS } from '../crypto-utils'
import { nowBeijing } from '../time'
import { logSync } from '../sync-logger'
import { kvCacheDeletePrefix } from '../utils/kv-cache'
import { fullSync, exchangeCodeForToken, getSyncStatus } from '../ms-sync'

const settings = new Hono<{ Bindings: Env }>()

settings.get('/', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const all = await db.select().from(schema.settings)
  const result: Record<string, string> = {}
  for (const s of all) {
    if (SENSITIVE_KEYS.includes(s.key)) {
      // 敏感键不返回实际值，只返回布尔标记表示已保存
      result[`${s.key}_set`] = 'true'
    } else {
      result[s.key] = s.value
    }
  }
  return c.json(result)
})

settings.put('/', async (c) => {
  const body = settingsSchema.parse(await c.req.json())
  // 敏感键加密后再存储（向后兼容：读取时 decrypt 自动识别 enc$ 前缀）
  const encrypted = await encryptSettings(c.env.JWT_SECRET, body)
  const db = drizzle(c.env.DB, { schema })
  const now = nowBeijing()
  const stmts = Object.entries(encrypted).map(([key, value]) =>
    db
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: now } }),
  )
  await db.batch(stmts as any)
  return c.json({ ok: true })
})

// 清空所有数据（事务：保留 settings 表，避免用户重新配置）
settings.post('/reset/confirm', async (c) => {
  const { password } = await c.req.json<{ password: string }>()
  if (!password) return c.json({ error: '请输入密码确认' }, 400)

  const db = drizzle(c.env.DB, { schema })
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'master_password'))
  if (!row.length) return c.json({ error: '未设置密码' }, 400)

  const { decrypt } = await import('../crypto-utils')
  const stored = await decrypt(c.env.JWT_SECRET, row[0].value)
  if (password !== stored) return c.json({ error: '密码错误' }, 403)

  // 生成一次性确认令牌，5 分钟有效
  const token = crypto.randomUUID()
  const expires = Date.now() + 5 * 60 * 1000
  await c.env.CACHE.put(`reset-confirm:${token}`, '1', { expirationTtl: 300 })
  return c.json({ ok: true, token, expires })
})

settings.delete('/reset', async (c) => {
  // 个人应用：JWT 鉴权 + 前端"确认清空"文本验证已足够，不再需要一次性 token
  const db = drizzle(c.env.DB, { schema })
  try {
    // 1. 清空 R2 中的 KB 文件
    try {
      const r2Objects = await c.env.STORAGE.list()
      if (r2Objects.objects.length > 0) {
        await c.env.STORAGE.delete(r2Objects.objects.map((o) => o.key))
      }
    } catch (e) {
      console.error('[reset] R2 清理失败:', e)
    }

    // 2. 事务清空 D1 表（保留 settings、ai_configs）
    await db.batch([
      db.delete(schema.subtasks),
      db.delete(schema.tasks),
      db.delete(schema.taskLists),
      db.delete(schema.imaNotes),
      db.delete(schema.kbDocuments),
      db.delete(schema.syncLogs),
      db.delete(schema.kvCache),
      db.delete(schema.feedItems),
      db.delete(schema.dailyDigests),
      db.delete(schema.monitorSnapshots),
      db.delete(schema.monitorBriefs),
      // 注意：Vectorize 中的孤儿向量不删除（无 clearAll API），
      // D1 记录已清空，semantic-search 查 D1 会全部 miss，孤儿向量无害。
      // 用户可手动调 /api/ai/reindex 重建。
    ])

    // 3. 清空 KV 中的 AI 缓存（best effort）
    await Promise.all([kvCacheDeletePrefix(c.env, 'ai:'), kvCacheDeletePrefix(c.env, 'search:')])

    return c.json({ success: true, message: '数据已清空' })
  } catch (e: any) {
    console.error('[reset] 清空失败:', e)
    return c.json({ error: e.message }, 500)
  }
})

// ========== 微软 To Do 同步 ==========

// OAuth 前端回调处理端点（由前端回调页 MsTodoCallback.tsx 调用）
// redirect_uri 必须与前端发起授权时一致；优先用前端传入的 redirect_uri，其次用保存的 ms_redirect_uri
settings.get('/ms-todo/callback', async (c) => {
  const code = c.req.query('code')
  if (!code) return c.json({ ok: false, error: '缺少 code 参数' })

  // 前端可以通过 ?redirect_uri= 显式传入授权时使用的回跳地址
  let redirectUri = c.req.query('redirect_uri')
  if (!redirectUri) {
    // 回退到保存的 ms_redirect_uri 设置
    const db = drizzle(c.env.DB, { schema })
    const row = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, 'ms_redirect_uri'))
    redirectUri = row[0]?.value || `${new URL(c.req.url).origin}/oauth/ms-todo/callback`
  }

  try {
    const ok = await exchangeCodeForToken(c.env, code, redirectUri!)
    return c.json({ ok })
  } catch (e: any) {
    // 打印完整错误到 wrangler tail，便于诊断
    console.error('[ms-todo callback] exchangeCodeForToken failed:', {
      message: e.message,
      stack: e.stack,
      redirectUri,
      codeLen: code?.length,
    })
    // 返回 200 + ok:false，避免 ky 抛 HTTPError 吞掉错误体
    return c.json({ ok: false, error: e.message })
  }
})

// 同步状态
settings.get('/ms-todo/status', async (c) => {
  const status = await getSyncStatus(c.env)
  return c.json(status)
})

// 手动触发同步
settings.post('/ms-todo/sync', async (c) => {
  try {
    const result = await fullSync(c.env)
    const db = drizzle(c.env.DB, { schema })
    // 仅在完全无失败时更新"最后同步时间"，避免部分失败显示"同步成功"假阳性
    if (result.failed === 0) {
      await db
        .insert(schema.settings)
        .values({ key: 'ms_last_sync', value: nowBeijing() })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: nowBeijing() } })
    }

    let status: 'success' | 'partial' | 'error'
    if (result.failed === 0) status = 'success'
    else if (result.synced > 0) status = 'partial'
    else status = 'error'

    await logSync(c.env, 'ms_todo', {
      status,
      synced: result.synced,
      failed: result.failed,
      skipped: result.skipped,
      message:
        status === 'success'
          ? `同步完成 · ${result.synced} 条任务`
          : status === 'partial'
            ? `部分同步 · ${result.synced} 条成功，${result.failed} 条失败`
            : `同步失败 · ${result.failed} 条任务出错`,
      details: result.errors?.length ? result.errors.join('\n') : undefined,
    })

    return c.json({ ok: result.failed === 0, ...result })
  } catch (e: any) {
    console.error('[ms-todo] sync failed:', e)
    await logSync(c.env, 'ms_todo', {
      status: 'error',
      message: e.message,
    })
    return c.json({ error: e.message }, 500)
  }
})

export default settings
