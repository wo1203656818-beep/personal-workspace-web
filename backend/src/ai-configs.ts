import { drizzle } from 'drizzle-orm/d1'
import { eq, asc } from 'drizzle-orm'
import * as schema from './schema'
import type { Env } from './types'
import { encrypt, decrypt } from './crypto-utils'
import { nowBeijing } from './time'

export type AiConfigType = 'cloudflare' | 'openai'

// 使用更小更快的模型，避免 Workers AI 大模型 cold start 超时
// 注意：llama-3.1-8b-instruct 和 qwen1.5-14b-chat-awq 已于 2025-2026 年弃用
const DEFAULT_CF_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'
const FALLBACK_CF_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'

export const CF_MODELS = { DEFAULT: DEFAULT_CF_MODEL, FALLBACK: FALLBACK_CF_MODEL }

export interface AiConfigInput {
  name: string
  type: AiConfigType
  baseUrl?: string
  apiKey?: string
  model?: string
  isDefault?: boolean
}

export interface AiConfigView {
  id: string
  name: string
  type: AiConfigType
  baseUrl: string
  model: string
  isDefault: boolean
  apiKeySet: boolean
  createdAt: string | null
}

// 运行时确保表存在（避免依赖 drizzle migration apply 的部署连通性）
export async function ensureAiConfigsTable(dbRaw: any): Promise<void> {
  await dbRaw.prepare(
    `CREATE TABLE IF NOT EXISTS ai_configs (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, base_url TEXT, api_key TEXT, model TEXT, is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT, updated_at TEXT)`
  ).run()
}

// 运行时确保 AI 聊天记录表存在
export async function ensureChatTables(dbRaw: any): Promise<void> {
  await dbRaw.prepare(
    `CREATE TABLE IF NOT EXISTS chat_sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '新对话', created_at TEXT, updated_at TEXT)`
  ).run()
  await dbRaw.prepare(
    `CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', tool_calls TEXT, created_at TEXT)`
  ).run()
  // 增量加列（已存在则忽略错误）
  const alters = [
    `ALTER TABLE chat_sessions ADD COLUMN tags TEXT DEFAULT '[]'`,
    `ALTER TABLE chat_sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`,
  ]
  for (const sql of alters) {
    try { await dbRaw.prepare(sql).run() } catch {}
  }
}

function rowToView(r: typeof schema.aiConfigs.$inferSelect): AiConfigView {
  return {
    id: r.id,
    name: r.name,
    type: r.type as AiConfigType,
    baseUrl: r.baseUrl ?? '',
    model: r.model ?? '',
    isDefault: !!r.isDefault,
    apiKeySet: !!r.apiKey,
    createdAt: r.createdAt ?? null,
  }
}

// 首次使用时，把旧的 settings.ai_provider 配置迁移成一条 ai_configs 记录
export async function migrateLegacyIfEmpty(db: any, env: Env): Promise<void> {
  const existing = await db.select({ id: schema.aiConfigs.id }).from(schema.aiConfigs).limit(1)
  if (existing.length > 0) return

  const rows = await db.select().from(schema.settings)
  const map: Record<string, string> = {}
  for (const s of rows) map[s.key] = s.value
  if (!map.ai_provider) return // 没有任何 AI 配置，无需迁移

  const id = crypto.randomUUID()
  if (map.ai_provider === 'custom' && map.custom_ai_base_url) {
    await db.insert(schema.aiConfigs).values({
      id,
      name: '自定义 API（迁移自旧配置）',
      type: 'openai',
      baseUrl: map.custom_ai_base_url,
      apiKey: map.custom_ai_api_key || null, // settings 中已是加密值，直接复用
      model: map.custom_ai_model || 'gpt-4o',
      isDefault: true,
    })
  } else {
    await db.insert(schema.aiConfigs).values({
      id,
      name: 'Cloudflare Workers AI（迁移自旧配置）',
      type: 'cloudflare',
      baseUrl: null,
      apiKey: null,
      model: map.ai_model || DEFAULT_CF_MODEL,
      isDefault: true,
    })
  }
}

export async function listAiConfigs(env: Env): Promise<AiConfigView[]> {
  const db = drizzle(env.DB, { schema })
  await ensureAiConfigsTable(env.DB)
  await migrateLegacyIfEmpty(db, env)
  const rows = await db.select().from(schema.aiConfigs).orderBy(asc(schema.aiConfigs.createdAt))
  return rows.map(rowToView)
}

// 取生效的默认配置（解密 apiKey），供 callAI 使用；无配置时返回 null
export async function getActiveConfig(env: Env): Promise<{
  type: AiConfigType
  baseUrl: string
  apiKey: string
  model: string
} | null> {
  const db = drizzle(env.DB, { schema })
  await ensureAiConfigsTable(env.DB)
  await migrateLegacyIfEmpty(db, env)
  const rows = await db.select().from(schema.aiConfigs)
  if (rows.length === 0) return null
  const active = rows.find((r) => r.isDefault) ?? rows[0]
  return {
    type: active.type as AiConfigType,
    baseUrl: active.baseUrl ?? '',
    apiKey: active.apiKey ? await decrypt(env.JWT_SECRET, active.apiKey) : '',
    model: active.model || (active.type === 'cloudflare' ? DEFAULT_CF_MODEL : 'gpt-4o'),
  }
}

export async function createAiConfig(env: Env, input: AiConfigInput): Promise<string> {
  const db = drizzle(env.DB, { schema })
  await ensureAiConfigsTable(env.DB)
  const id = crypto.randomUUID()
  const apiKey = input.apiKey ? await encrypt(env.JWT_SECRET, input.apiKey) : null

  // 若已有默认配置，新配置默认不抢默认；否则第一条强制为默认
  const count = await db.select({ id: schema.aiConfigs.id }).from(schema.aiConfigs).limit(1)
  const isDefault = input.isDefault ?? count.length === 0

  if (isDefault) {
    await db.update(schema.aiConfigs).set({ isDefault: false }).where(eq(schema.aiConfigs.isDefault, true))
  }
  await db.insert(schema.aiConfigs).values({
    id,
    name: input.name,
    type: input.type,
    baseUrl: input.type === 'cloudflare' ? null : (input.baseUrl || null),
    apiKey,
    model: input.model || (input.type === 'cloudflare' ? DEFAULT_CF_MODEL : null),
    isDefault,
  })
  return id
}

export async function updateAiConfig(env: Env, id: string, input: Partial<AiConfigInput>): Promise<void> {
  const db = drizzle(env.DB, { schema })
  await ensureAiConfigsTable(env.DB)
  const existing = await db.select().from(schema.aiConfigs).where(eq(schema.aiConfigs.id, id)).limit(1)
  if (existing.length === 0) throw new Error('配置不存在')

  if (input.isDefault) {
    await db.update(schema.aiConfigs).set({ isDefault: false }).where(eq(schema.aiConfigs.isDefault, true))
  }
  const patch: any = { updatedAt: nowBeijing() }
  if (input.name !== undefined) patch.name = input.name
  if (input.type !== undefined) patch.type = input.type
  if (input.baseUrl !== undefined) patch.baseUrl = input.type === 'cloudflare' ? null : (input.baseUrl || null)
  if (input.model !== undefined) patch.model = input.model
  if (input.apiKey !== undefined && input.apiKey !== '') {
    patch.apiKey = await encrypt(env.JWT_SECRET, input.apiKey)
  }
  if (input.isDefault !== undefined) patch.isDefault = input.isDefault
  await db.update(schema.aiConfigs).set(patch).where(eq(schema.aiConfigs.id, id))
}

export async function deleteAiConfig(env: Env, id: string): Promise<void> {
  const db = drizzle(env.DB, { schema })
  await ensureAiConfigsTable(env.DB)
  const existing = await db.select().from(schema.aiConfigs).where(eq(schema.aiConfigs.id, id)).limit(1)
  if (existing.length === 0) return
  const wasDefault = !!existing[0].isDefault
  await db.delete(schema.aiConfigs).where(eq(schema.aiConfigs.id, id))
  // 若删除的是默认项，提升剩余第一条为默认
  if (wasDefault) {
    const remaining = await db.select().from(schema.aiConfigs).orderBy(asc(schema.aiConfigs.createdAt)).limit(1)
    if (remaining.length > 0) {
      await db.update(schema.aiConfigs).set({ isDefault: true }).where(eq(schema.aiConfigs.id, remaining[0].id))
    }
  }
}

export async function setDefaultAiConfig(env: Env, id: string): Promise<void> {
  const db = drizzle(env.DB, { schema })
  await ensureAiConfigsTable(env.DB)
  const existing = await db.select({ id: schema.aiConfigs.id }).from(schema.aiConfigs).where(eq(schema.aiConfigs.id, id)).limit(1)
  if (existing.length === 0) throw new Error('配置不存在')
  await db.update(schema.aiConfigs).set({ isDefault: false }).where(eq(schema.aiConfigs.isDefault, true))
  await db.update(schema.aiConfigs).set({ isDefault: true }).where(eq(schema.aiConfigs.id, id))
}

export interface AiTestResult {
  ok: boolean
  latency_ms?: number
  model?: string
  error?: string
}

// 测试某条配置（或一次性参数）的连通性
export async function testAiConfig(
  env: Env,
  params: { id?: string; type?: AiConfigType; baseUrl?: string; apiKey?: string; model?: string }
): Promise<AiTestResult> {
  let type = params.type ?? 'openai'
  let baseUrl = params.baseUrl ?? ''
  let apiKey = params.apiKey ?? ''
  let model = params.model ?? ''

  if (params.id) {
    const db = drizzle(env.DB, { schema })
    await ensureAiConfigsTable(env.DB)
    const rows = await db.select().from(schema.aiConfigs).where(eq(schema.aiConfigs.id, params.id)).limit(1)
    if (rows.length === 0) return { ok: false, error: '配置不存在' }
    const r = rows[0]
    type = r.type as AiConfigType
    baseUrl = r.baseUrl ?? ''
    apiKey = r.apiKey ? await decrypt(env.JWT_SECRET, r.apiKey) : ''
    model = r.model || (r.type === 'cloudflare' ? DEFAULT_CF_MODEL : 'gpt-4o')
  }

  const start = Date.now()
  try {
    if (type === 'cloudflare') {
      const m = model || DEFAULT_CF_MODEL
      const res: any = await env.AI.run(m, {
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
      })
      // 兼容新旧 Workers AI 返回格式
      const text = typeof res === 'string' ? res
        : res?.choices?.[0]?.message?.content
        ?? (typeof res?.response === 'string' ? res.response : undefined)
        ?? res?.result?.response
        ?? res?.output
      if (text === undefined && res === undefined) return { ok: false, error: 'Cloudflare AI 返回为空' }
      return { ok: true, latency_ms: Date.now() - start, model: m }
    }
    if (!baseUrl) return { ok: false, error: '缺少 API Base URL' }
    if (!apiKey) return { ok: false, error: '缺少 API Key' }
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'gpt-4o',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` }
    }
    const data: any = await res.json().catch(() => ({}))
    if (!data?.choices?.[0]?.message?.content && data?.error) {
      return { ok: false, error: String(data.error?.message || data.error) }
    }
    return { ok: true, latency_ms: Date.now() - start, model: model || 'gpt-4o' }
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) }
  }
}
