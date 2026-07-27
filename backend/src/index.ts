import { Hono } from 'hono'
import type { Context } from 'hono'
import { jwt, verify } from 'hono/jwt'
import { z } from 'zod'
import { Jwt } from 'hono/utils/jwt'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, or, isNotNull, isNull, like, desc, gte, gt, lt, asc, inArray, sql, getTableColumns, max, count } from 'drizzle-orm'
import * as schema from './schema'
import type { Env, ChatMessage } from './types'
import {
  loginSchema, changePasswordSchema, createListSchema, updateListSchema,
  createTaskSchema, updateTaskSchema,
  createSubtaskSchema, updateSubtaskSchema,
  createNoteSchema, updateNoteSchema,
  imaCreateNoteSchema, imaAppendNoteSchema,
  settingsSchema, aiTestSchema,
  aiConfigCreateSchema, aiConfigUpdateSchema, aiConfigTestSchema,
} from './validation'
import { decrypt, encrypt, encryptSettings, SENSITIVE_KEYS, hashPassword } from './crypto-utils'
import { withIdempotency } from './idempotent'
import { syncNotes, syncKnowledgeBase, getImaStatus, listNotebooks, listNotes, listAddableKnowledgeBases, getKnowledgeList, getMediaInfo, createNote as imaCreateNote, appendNote as imaAppendNote, stripImagesAndAttachments, markdownToCleanHtml } from './ima-sync'
import {
  getActiveConfig, listAiConfigs, createAiConfig, updateAiConfig,
  deleteAiConfig, setDefaultAiConfig, testAiConfig, CF_MODELS,
  ensureChatTables, ensureAiConfigsTable,
} from './ai-configs'
import { fetchPhysicalEntropy, fetchUniformEntropy } from './entropy'
import { nowBeijing, todayBeijing, nowCST, todayCST } from './time'
import { logSync } from './sync-logger'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createMcpHandler } from 'agents/mcp'


// 任务表的全部列（用于列表查询，避免 SELECT * 之余方便附加上 subtaskCount）
const TASK_COLUMNS = getTableColumns(schema.tasks)
// 任务列表用摘要列：排除可能很大的 note 字段，详情接口再返回完整内容
const { note: _taskNote, ...TASK_SUMMARY_COLUMNS } = TASK_COLUMNS

// 列表查询任务的通用聚合：单次扫 subtasks 表产出每个 taskId 的数量，避免逐行子查询
// 用法：在每个任务列表端点内 { subAgg } = buildSubtaskAgg(db) 后 LEFT JOIN 或 Map 聚合后拼回结果
function buildSubtaskAgg(db: ReturnType<typeof drizzle<any>>) {
  return {
    async counts(taskIds: string[]) {
      if (!taskIds.length) return new Map<string, { subtaskCount: number; completedSubtaskCount: number }>()
      const rows = await db
        .select({
          taskId: schema.subtasks.taskId,
          subtaskCount: count(schema.subtasks.id),
          completedSubtaskCount: sql<number>`SUM(CASE WHEN ${schema.subtasks.isCompleted} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(schema.subtasks)
        .where(inArray(schema.subtasks.taskId, taskIds))
        .groupBy(schema.subtasks.taskId)
      const m = new Map<string, { subtaskCount: number; completedSubtaskCount: number }>()
      for (const r of rows) m.set(r.taskId, { subtaskCount: Number(r.subtaskCount), completedSubtaskCount: Number(r.completedSubtaskCount) ?? 0 })
      return m
    },
  }
}

const app = new Hono<{ Bindings: Env }>()

// CORS 中间件：本地开发允许 *，生产读 ALLOWED_ORIGIN 白名单
app.use('*', cors({
  origin: (_origin, c) => c.env.ALLOWED_ORIGIN ?? '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  maxAge: 86400,
}))

// AI 调用辅助函数：优先使用 ai_configs 表中的默认配置，回退到旧 settings.ai_provider，
// 再回退到 Cloudflare 免费模型（保证基础可用）
async function callAI(
  c: Context<{ Bindings: Env }>,
  messages: ChatMessage[],
  opts: { maxTokens?: number } = {}
): Promise<string> {
  const cfg = await getActiveConfig(c.env)
  const model = cfg?.model
  const maxTokens = opts.maxTokens ?? 512

  if (cfg?.type === 'openai') {
    if (!cfg.baseUrl || !cfg.apiKey) throw new Error('OpenAI 配置缺少 Base URL 或 API Key')
    // 思考型模型（如小米 MiMo）默认开启深度思考，且 max_tokens 同时限制"思考链+回答"总长，
    // 512 会被思考链耗尽导致 content 为空。工具型调用无需思考：MiMo 显式关闭 thinking。
    const isMimo = /xiaomimimo\.com/i.test(cfg.baseUrl)
    const body: any = {
      model: cfg.model || 'gpt-4o',
      messages,
      max_tokens: maxTokens,
    }
    if (isMimo) body.thinking = { type: 'disabled' }
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`AI 请求失败 (HTTP ${res.status}): ${txt.slice(0, 200)}`)
    }
    const data = await res.json() as any
    const msg = data.choices?.[0]?.message
    const content = msg?.content || ''
    // 通用兜底：思考型模型思考链耗尽 max_tokens 导致 content 为空时，
    // 用更大的 token 预算重试一次（不改思考开关，兼容 deepseek-reasoner 等）
    if (!content && msg?.reasoning_content && maxTokens < 4096) {
      const retryRes = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, max_tokens: 4096 }),
      })
      if (retryRes.ok) {
        const retryData = await retryRes.json() as any
        return retryData.choices?.[0]?.message?.content || ''
      }
    }
    return content
  }

  // 默认：Cloudflare Workers AI（cfg 为 null 时也走这里，用兜底模型）
  const cfModel = model || CF_MODELS.DEFAULT
  try {
    const response = await c.env.AI.run(cfModel, { messages, max_tokens: maxTokens })
    // 兼容不同模型的响应结构（string / { response } / { result: { response } } / 流式对象）
    if (typeof response === 'string') return response
    const r = response as any
    return r.response?.response || r.response || r.result?.response || r.output || JSON.stringify(response)
  } catch (aiErr: any) {
    const detail = (aiErr?.message || aiErr?.toString() || JSON.stringify(aiErr)).toLowerCase()
    // 若主模型在当前账户不可用，自动降级到兜底模型
    const isModelUnavailable = /model not found|not available|does not exist|unknown model|invalid model|not supported|503|504/.test(detail)
    if (isModelUnavailable && cfModel !== CF_MODELS.FALLBACK) {
      try {
        const response = await c.env.AI.run(CF_MODELS.FALLBACK, { messages, max_tokens: maxTokens })
        if (typeof response === 'string') return response
        const r = response as any
        return r.response?.response || r.response || r.result?.response || r.output || JSON.stringify(response)
      } catch (fallbackErr: any) {
        const fallbackDetail = fallbackErr?.message || fallbackErr?.toString() || JSON.stringify(fallbackErr)
        throw new Error(`AI 调用失败，请检查 AI 配置或稍后重试`)
      }
    }
    throw new Error(`AI 调用失败，请检查 AI 配置或稍后重试`)
  }
}

// 文本向量化（嵌入）：统一走 Cloudflare Workers AI 嵌入模型。
// bge-m3 是多语言嵌入模型，更适合当前以中文为主的内容检索。
const EMBED_MODEL = '@cf/baai/bge-m3'
async function embedText(c: Context<{ Bindings: Env }>, text: string): Promise<number[]> {
  const res = await c.env.AI.run(EMBED_MODEL, { text: text.slice(0, 8000) })
  const r = res as any
  // CF 文本嵌入返回 { shape: [1, N], data: number[][] }，单条输入时 data[0] 即向量
  const vec = Array.isArray(r?.data) ? r.data[0] : (r?.embedding ?? r?.data ?? null)
  if (Array.isArray(vec)) return vec as number[]
  if (Array.isArray(r)) return r as number[]
  throw new Error('embedding 解析失败')
}

// 余弦相似度
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

function normalizeSearchText(text: string): string {
  return (text || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function buildSearchTerms(query: string): string[] {
  const normalized = normalizeSearchText(query)
  if (!normalized) return []
  const terms = new Set<string>()
  for (const part of normalized.split(/\s+/).filter(Boolean)) {
    if (part.length >= 2) terms.add(part)
  }
  if (/[\u4e00-\u9fff]/.test(normalized)) {
    for (let i = 0; i < normalized.length - 1; i++) {
      const chunk = normalized.slice(i, i + 2).trim()
      if (chunk.length === 2 && /[\u4e00-\u9fff]/.test(chunk)) terms.add(chunk)
    }
  }
  terms.add(normalized)
  return Array.from(terms).sort((a, b) => b.length - a.length).slice(0, 12)
}

function lexicalScore(query: string, title: string, text: string): number {
  const q = normalizeSearchText(query)
  const titleText = normalizeSearchText(title)
  const bodyText = normalizeSearchText(text)
  if (!q || !bodyText) return 0

  let score = 0
  if (titleText.includes(q)) score += 0.28
  if (bodyText.includes(q)) score += 0.22

  for (const term of buildSearchTerms(q)) {
    if (term === q) continue
    if (titleText.includes(term)) score += 0.06
    else if (bodyText.includes(term)) score += 0.03
  }
  return Math.min(score, 0.42)
}

function buildSnippet(query: string, text: string): string {
  const plain = (text || '').replace(/\s+/g, ' ').trim()
  if (!plain) return ''
  const normalized = normalizeSearchText(plain)
  for (const term of buildSearchTerms(query)) {
    const idx = normalized.indexOf(term)
    if (idx >= 0) {
      const start = Math.max(0, idx - 30)
      const end = Math.min(plain.length, start + 140)
      const prefix = start > 0 ? '…' : ''
      const suffix = end < plain.length ? '…' : ''
      return `${prefix}${plain.slice(start, end)}${suffix}`
    }
  }
  return plain.slice(0, 140) + (plain.length > 140 ? '…' : '')
}

// 增量嵌入：用 upsert 避免 delete+insert 两次写；文本为空则删除旧向量。AI 异常由调用方 catch，不阻断主流程。
// 增量嵌入：AI/向量异常一律吞掉，绝不让主流程（创建/更新任务、子任务）因此 500。
async function indexTarget(c: Context<{ Bindings: Env }>, type: 'note' | 'task' | 'kb' | 'subtask', id: string, text: string) {
  try {
    const db = drizzle(c.env.DB, { schema })
    const t = (text || '').trim()
    if (!t) {
      await db.delete(schema.embeddings).where(and(eq(schema.embeddings.targetType, type), eq(schema.embeddings.targetId, id)))
      return
    }
    const vec = await embedText(c, t.slice(0, 4000))
    await db.insert(schema.embeddings).values({
      id: crypto.randomUUID(),
      targetType: type,
      targetId: id,
      model: EMBED_MODEL,
      vector: JSON.stringify(vec),
    }).onConflictDoUpdate({
      target: [schema.embeddings.targetType, schema.embeddings.targetId],
      set: { vector: JSON.stringify(vec), model: EMBED_MODEL },
    })
  } catch (e: any) {
    console.error('[embed] indexTarget failed (ignored):', e?.message)
  }
}

// 子任务完成联动：父任务的完成态 = 所有子任务是否全部完成（双向一致）。
// 任一子任务未完成 → 父任务保持未完成；全部完成 → 父任务标记完成。
async function syncParentCompletion(db: any, taskId: string) {
  const subs = await db.select({ isCompleted: schema.subtasks.isCompleted })
    .from(schema.subtasks).where(eq(schema.subtasks.taskId, taskId))
  const allDone = subs.length > 0 && subs.every((s: any) => s.isCompleted)
  await db.update(schema.tasks)
    .set({ isCompleted: allDone, updatedAt: nowBeijing() })
    .where(eq(schema.tasks.id, taskId))
}

// 北京时间工具函数已移至 ./time 模块

// 规范化日期字段为 yyyy-MM-dd（兼容 "2026-07-23" 和 "2026-07-23T00:00:00" 两种格式）
function normalizeDate(s: string | null | undefined): string | null {
  if (!s) return null
  return s.split('T')[0]
}

// ISO 周计算辅助函数（返回 { year, week }，week 为 1-53）
function getISOWeek(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { year: date.getUTCFullYear(), week }
}

// KV 缓存辅助函数：优先用 Cloudflare KV（低延迟、高并发），回退到 D1 kv_cache 表
async function kvCacheGet<T>(env: Env, key: string): Promise<T | null> {
  try {
    const value = await env.CACHE.get(key)
    if (value) {
      try { return JSON.parse(value) as T } catch { return null }
    }
  } catch (e) { console.error('[kv] get failed:', e) }
  // 回退 D1（兼容旧缓存）
  try {
    const db = drizzle(env.DB, { schema })
    const [row] = await db.select().from(schema.kvCache).where(and(eq(schema.kvCache.key, key), gt(schema.kvCache.expiresAt, Date.now())))
    if (row) {
      try { return JSON.parse(row.value) as T } catch { return null }
    }
  } catch { }
  return null
}

async function kvCacheSet(env: Env, key: string, value: unknown, ttlMs: number): Promise<void> {
  const json = JSON.stringify(value)
  // KV 写入（主缓存，TTL 至少 60 秒）
  try {
    await env.CACHE.put(key, json, { expirationTtl: Math.max(60, Math.ceil(ttlMs / 1000)) })
  } catch (e) { console.error('[kv] put failed:', e) }
  // 同时写入 D1 保持兼容，失败不阻断
  try {
    const db = drizzle(env.DB, { schema })
    await db.insert(schema.kvCache).values({
      key,
      value: json,
      expiresAt: Date.now() + ttlMs,
    }).onConflictDoUpdate({
      target: schema.kvCache.key,
      set: { value: json, expiresAt: Date.now() + ttlMs },
    })
  } catch (e) { console.error('[kv] D1 fallback write failed:', e) }
}

async function kvCacheDeletePrefix(env: Env, prefix: string, limit = 1000): Promise<void> {
  try {
    const list = await env.CACHE.list({ prefix, limit })
    if (list.keys.length > 0) {
      await Promise.all(list.keys.map((k) => env.CACHE.delete(k.name)))
    }
  } catch (e) { console.error('[kv] delete prefix failed:', e) }
}

// ========== 认证 ==========

// 密码验证（PBKDF2，格式：pbkdf2$<iterations>$<salt_hex>$<hash_hex>）
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = parseInt(parts[1], 10)
  const salt = new Uint8Array(parts[2].match(/.{2}/g)!.map(b => parseInt(b, 16)))
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial, 256
  )
  const computed = Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, '0')).join('')
  return computed === parts[3]
}

// 获取生效的密码哈希：优先读 settings 表 password_hash（解密），回退 env.PASSWORD_HASH
// 改密码后写入 settings 表，覆盖 env（Workers 不可改 env）
async function getStoredPasswordHash(env: Env): Promise<string> {
  const db = drizzle(env.DB, { schema })
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, 'password_hash'))
  if (row.length > 0) {
    return decrypt(env.JWT_SECRET, row[0].value)
  }
  return env.PASSWORD_HASH
}

// 登录
app.post('/api/auth/login', async (c) => {
  const { password } = loginSchema.parse(await c.req.json())

  const storedHash = await getStoredPasswordHash(c.env)
  const ok = await verifyPassword(password, storedHash)
  if (!ok) return c.json({ error: '密码错误' }, 401)

  const token = await Jwt.sign(
    { exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 },
    c.env.JWT_SECRET,
    'HS256'
  )
  return c.json({ token })
})

// 修改密码：验证旧密码 → 生成新 PBKDF2 hash → 加密后写入 settings 表 password_hash
app.post('/api/auth/change-password', async (c) => {
  const { oldPassword, newPassword } = changePasswordSchema.parse(await c.req.json())
  const storedHash = await getStoredPasswordHash(c.env)
  const ok = await verifyPassword(oldPassword, storedHash)
  if (!ok) return c.json({ error: '旧密码错误' }, 401)

  const newHash = await hashPassword(newPassword)
  const encrypted = await encrypt(c.env.JWT_SECRET, newHash)
  const db = drizzle(c.env.DB, { schema })
  await db.insert(schema.settings)
    .values({ key: 'password_hash', value: encrypted })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: encrypted, updatedAt: nowBeijing() } })
  return c.json({ ok: true })
})

// JWT 中间件（hono/jwt）— 保护所有 /api 路由，白名单内的路径免认证
const PUBLIC_PATHS = new Set(['/api/auth/login', '/api/settings/ms-todo/callback'])
app.use('/api/*', async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) return next()
  return jwt({ secret: c.env.JWT_SECRET, alg: 'HS256' })(c, next)
})

// 健康检查：验证 DB/KV/R2 绑定可用
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    bindings: {
      db: !!c.env.DB,
      kv: !!c.env.CACHE,
      r2: !!c.env.STORAGE,
      ai: !!c.env.AI,
    },
  })
})

// 全局错误处理：生产环境脱敏，不泄露内部错误细节
app.onError((err, c) => {
  // HTTPException（JWT 401 等）直接放行，保留原始状态码
  if (err instanceof HTTPException) {
    return err.getResponse()
  }
  const requestId = crypto.randomUUID()
  console.error(`[server] unhandled error [${requestId}]:`, err)
  // Zod 校验错误返回 422
  if (err.name === 'ZodError') {
    return c.json({ error: '请求参数校验失败', details: (err as any).errors }, 422)
  }
  // JSON 解析错误返回 400
  if (err instanceof SyntaxError && err.message.includes('JSON')) {
    return c.json({ error: '请求体 JSON 格式错误' }, 400)
  }
  return c.json({ error: '服务器内部错误', requestId }, 500)
})

// ========== 任务列表 ==========

// 获取所有列表
app.get('/api/tasks/lists', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const withStats = c.req.query('stats') === '1'
  const lists = await db.select().from(schema.taskLists).orderBy(schema.taskLists.sortOrder)
  if (!withStats) return c.json(lists)
  const stats = await db
    .select({
      listId: schema.tasks.listId,
      total: count(schema.tasks.id),
      active: sql<number>`SUM(CASE WHEN ${schema.tasks.isCompleted} = 0 AND ${schema.tasks.msTodoDeletedAt} IS NULL THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN ${schema.tasks.isCompleted} = 1 AND ${schema.tasks.msTodoDeletedAt} IS NULL THEN 1 ELSE 0 END)`,
    })
    .from(schema.tasks)
    .where(isNull(schema.tasks.msTodoDeletedAt))
    .groupBy(schema.tasks.listId)
  const sm = new Map<string, { total: number; active: number; completed: number }>()
  for (const s of stats) sm.set(s.listId, { total: Number(s.total), active: Number(s.active) ?? 0, completed: Number(s.completed) ?? 0 })
  const enriched = lists.map((l) => {
    const s = sm.get(l.id) || { total: 0, active: 0, completed: 0 }
    return { ...l, taskCount: s.total, activeTaskCount: s.active, completedTaskCount: s.completed }
  })
  return c.json(enriched)
})

// 创建列表
app.post('/api/tasks/lists', async (c) => {
  const { name, color } = createListSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })
  // 任务列表排在末尾：SQL MAX 代替全表拉回
  const [maxRow] = await db.select({ v: max(schema.taskLists.sortOrder) }).from(schema.taskLists)
  const maxSort = Number(maxRow.v ?? 0)

  const id = crypto.randomUUID()
  await db.insert(schema.taskLists).values({
    id,
    name,
    color: color || '#2563EB',
    sortOrder: maxSort + 1,
    isSystem: false,
  })
  const list = await db.select().from(schema.taskLists).where(eq(schema.taskLists.id, id))
  return c.json(list[0], 201)
})

// 更新列表
app.put('/api/tasks/lists/:id', async (c) => {
  const { id } = c.req.param()
  const { name, color } = updateListSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })
  await db.update(schema.taskLists)
    .set({ name, color, updatedAt: nowBeijing() })
    .where(eq(schema.taskLists.id, id))
  const list = await db.select().from(schema.taskLists).where(eq(schema.taskLists.id, id))
  return c.json(list[0])
})

// 删除列表（事务：其下任务软删除以便 MS 端同步删除，再删列表本身；若列表关联 MS 则同步删除 MS 端列表）
app.delete('/api/tasks/lists/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const now = nowBeijing()
  // 先查列表信息（含 msTodoListId），删除后无法再查
  const list = await db.select().from(schema.taskLists).where(eq(schema.taskLists.id, id))
  const msTodoListId = list[0]?.msTodoListId
  // 先记录列表下所有任务 ID 及其子任务 ID，用于清理嵌入
  const tasksInList = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.listId, id))
  const subtaskIds = tasksInList.length
    ? await db.select({ id: schema.subtasks.id }).from(schema.subtasks).where(inArray(schema.subtasks.taskId, tasksInList.map((t) => t.id)))
    : []
  // 关联 MS 的任务做软删除（下次同步会从 MS 端删除）；无 MS 关联的直接硬删；删列表本身，三者并行安全
  await db.batch([
    db.update(schema.tasks).set({ msTodoDeletedAt: now, updatedAt: now }).where(and(eq(schema.tasks.listId, id), isNotNull(schema.tasks.msTodoId))),
    db.delete(schema.tasks).where(and(eq(schema.tasks.listId, id), isNull(schema.tasks.msTodoId))),
    db.delete(schema.taskLists).where(eq(schema.taskLists.id, id)),
  ])
  // 批量清理列表下所有任务及子任务的向量嵌入
  const allTargetIds = [
    ...tasksInList.map((t) => ({ type: 'task' as const, id: t.id })),
    ...subtaskIds.map((st) => ({ type: 'subtask' as const, id: st.id })),
  ]
  if (allTargetIds.length > 0) {
    const batchSize = 50
    for (let i = 0; i < allTargetIds.length; i += batchSize) {
      const chunk = allTargetIds.slice(i, i + batchSize)
      const conditions = chunk.map((x) => and(eq(schema.embeddings.targetType, x.type), eq(schema.embeddings.targetId, x.id)))
      await db.delete(schema.embeddings).where(or(...conditions)).catch((e) =>
        console.error('[embed] list delete batch cleanup failed:', e?.message)
      )
    }
  }
  // 若列表关联 MS，异步删除 MS 端列表（失败不影响本地删除结果）
  if (msTodoListId) {
    c.executionCtx.waitUntil(deleteMsList(c.env, msTodoListId))
  }
  return c.json({ ok: true })
})

// ========== 任务 ==========

// 查询任务列表 + 拼回 subtask 统计（2 次 roundtrip 代替逐行子查询 N 次）
async function queryTasksWithSubtaskStats(
  db: ReturnType<typeof drizzle<any>>,
  whereClause: any,
  orderClause: any[],
): Promise<any[]> {
  const rows: any[] = await db.select({ ...TASK_SUMMARY_COLUMNS })
    .from(schema.tasks)
    .where(whereClause)
    .orderBy(...orderClause)
  const ids = rows.map((r) => r.id)
  const agg = buildSubtaskAgg(db)
  const counts = await agg.counts(ids)
  return rows.map((r) => {
    const s = counts.get(r.id) || { subtaskCount: 0, completedSubtaskCount: 0 }
    return { ...r, subtaskCount: s.subtaskCount, completedSubtaskCount: s.completedSubtaskCount }
  })
}

// 获取列表下的任务
app.get('/api/tasks/lists/:id/tasks', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const result = await queryTasksWithSubtaskStats(
    db,
    and(eq(schema.tasks.listId, id), isNull(schema.tasks.msTodoDeletedAt)),
    [schema.tasks.sortOrder],
  )
  return c.json(result)
})

// 我的一天（按当日 myDayDate 过滤，使用北京时间）
app.get('/api/tasks/myday', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const today = todayCST()
  const result = await queryTasksWithSubtaskStats(
    db,
    and(eq(schema.tasks.isMyDay, true), eq(schema.tasks.myDayDate, today), isNull(schema.tasks.msTodoDeletedAt)),
    [schema.tasks.sortOrder, desc(schema.tasks.createdAt)],
  )
  return c.json(result)
})

// 重要（须放在 /:id 之前避免被捕获）
app.get('/api/tasks/important', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const result = await queryTasksWithSubtaskStats(
    db,
    and(eq(schema.tasks.isImportant, true), eq(schema.tasks.isCompleted, false), isNull(schema.tasks.msTodoDeletedAt)),
    [schema.tasks.sortOrder, desc(schema.tasks.createdAt)],
  )
  return c.json(result)
})

// 已计划（须放在 /:id 之前避免被捕获）
app.get('/api/tasks/planned', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const result = await queryTasksWithSubtaskStats(
    db,
    and(isNotNull(schema.tasks.dueDate), eq(schema.tasks.isCompleted, false), isNull(schema.tasks.msTodoDeletedAt)),
    [schema.tasks.dueDate, schema.tasks.sortOrder],
  )
  return c.json(result)
})

// 搜索（须放在 /:id 之前避免被捕获）
app.get('/api/tasks/search', async (c) => {
  const q = c.req.query('q') || ''
  if (!q) return c.json([])
  const db = drizzle(c.env.DB, { schema })
  const result = await queryTasksWithSubtaskStats(
    db,
    and(or(like(schema.tasks.title, `%${q}%`), like(schema.tasks.note, `%${q}%`)), isNull(schema.tasks.msTodoDeletedAt)),
    [desc(schema.tasks.createdAt)],
  )
  return c.json(result)
})

// 全部任务（用于任务总览页）
app.get('/api/tasks', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const result = await queryTasksWithSubtaskStats(
    db,
    isNull(schema.tasks.msTodoDeletedAt),
    [desc(schema.tasks.createdAt)],
  )
  return c.json(result)
})

// 获取单个任务（过滤已软删除的 MS Todo 任务）
app.get('/api/tasks/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const task = await db.select().from(schema.tasks)
    .where(and(eq(schema.tasks.id, id), isNull(schema.tasks.msTodoDeletedAt)))
  if (task.length === 0) return c.json({ error: '任务不存在' }, 404)
  return c.json(task[0])
})

// 创建任务
app.post('/api/tasks', async (c) => {
  const body = createTaskSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })

  // 校验 listId 存在 + SQL MAX(sortOrder) 代替全表拉回
  const [list, maxRow] = await Promise.all([
    db.select({ id: schema.taskLists.id }).from(schema.taskLists).where(eq(schema.taskLists.id, body.listId)),
    db.select({ v: max(schema.tasks.sortOrder) }).from(schema.tasks).where(eq(schema.tasks.listId, body.listId)),
  ])
  if (list.length === 0) {
    return c.json({ error: '指定的任务列表不存在' }, 400)
  }

  // 新任务排在列表末尾：sortOrder 取当前列表最大值 + 1
  const maxSort = Number(maxRow[0]?.v ?? 0)

  const id = crypto.randomUUID()
  await db.insert(schema.tasks).values({
    id,
    listId: body.listId,
    title: body.title,
    note: body.note,
    isCompleted: false,
    isImportant: body.isImportant,
    isMyDay: body.isMyDay,
    // 若前端未传 myDayDate 但 isMyDay=true，使用北京日期
    myDayDate: body.isMyDay ? (body.myDayDate ?? todayCST()) : (body.myDayDate ?? null),
    dueDate: body.dueDate ?? null,
    sortOrder: maxSort + 1,
  })
  // 增量嵌入，供语义检索即时命中（AI 异常不阻断创建）。用 waitUntil 后台执行，不阻塞响应。
  const taskText = `${body.title}\n${body.note || ''}\n${body.isImportant ? '重要' : ''}\n${body.dueDate ? '截止: ' + body.dueDate : ''}\n${body.isMyDay ? '我的一天' : ''}`
  c.executionCtx.waitUntil(indexTarget(c, 'task', id, taskText).catch((e) => console.error('[embed] task create failed:', e?.message)))
  const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id))
  return c.json(task[0], 201)
})

// 更新任务
app.put('/api/tasks/:id', async (c) => {
  const { id } = c.req.param()
  const body = updateTaskSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })
  const updateData: Record<string, unknown> = { updatedAt: nowBeijing() }
  for (const key of ['title', 'note', 'isCompleted', 'isImportant', 'isMyDay', 'myDayDate', 'dueDate', 'reminder', 'recurrence', 'sortOrder', 'listId'] as const) {
    if (key in body) updateData[key] = body[key]
  }
  await db.update(schema.tasks).set(updateData).where(eq(schema.tasks.id, id))
  // 主任务勾选完成 → 其下所有子任务同步完成（"父完成即子完成"）。取消完成时应保留子任务已有进度，不应强拆。
  if (body.isCompleted === true) {
    await db.update(schema.subtasks).set({ isCompleted: true }).where(eq(schema.subtasks.taskId, id))
  }
  const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id))
  // 增量嵌入，供语义检索即时命中（AI 异常不阻断更新）。用 waitUntil 后台执行，不阻塞响应。
  if (task[0]) {
    const taskText = `${task[0].title}\n${task[0].note || ''}\n${task[0].isCompleted ? '已完成' : '未完成'}\n${task[0].isImportant ? '重要' : ''}\n${task[0].dueDate ? '截止: ' + task[0].dueDate : ''}\n${task[0].isMyDay ? '我的一天' : ''}`
    c.executionCtx.waitUntil(indexTarget(c, 'task', task[0].id, taskText).catch((e) => console.error('[embed] task update failed:', e?.message)))
  }
  return c.json(task[0])
})

// 删除任务（MS Todo 关联任务走软删除，等同步时推送到 MS 端再硬删）
app.delete('/api/tasks/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const existing = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id))
  if (existing.length === 0) return c.json({ ok: true })
  const task = existing[0]
  // 删除前先记录子任务 ID，用于清理嵌入向量
  const subtaskIds = await db.select({ id: schema.subtasks.id }).from(schema.subtasks).where(eq(schema.subtasks.taskId, id))
  if (task.msTodoId) {
    // 关联 MS Todo：软删除标记，等下次同步时 DELETE MS 端再硬删本地
    // 同步清理子任务，避免软删除任务产生隐藏孤儿子任务
    await db.batch([
      db.update(schema.tasks)
        .set({ msTodoDeletedAt: nowBeijing(), updatedAt: nowBeijing() })
        .where(eq(schema.tasks.id, id)),
      db.delete(schema.subtasks).where(eq(schema.subtasks.taskId, id)),
    ])
  } else {
    // 未关联 MS Todo：直接硬删（子任务走 onDelete cascade）
    await db.delete(schema.tasks).where(eq(schema.tasks.id, id))
  }
  // 批量清理任务及子任务的向量嵌入（软删除任务也清理，避免语义搜索命中已删除内容）
  const allTargetIds = [{ type: 'task' as const, id }, ...subtaskIds.map((st) => ({ type: 'subtask' as const, id: st.id }))]
  const batchSize = 50
  for (let i = 0; i < allTargetIds.length; i += batchSize) {
    const chunk = allTargetIds.slice(i, i + batchSize)
    const conditions = chunk.map((x) => and(eq(schema.embeddings.targetType, x.type), eq(schema.embeddings.targetId, x.id)))
    await db.delete(schema.embeddings).where(or(...conditions)).catch((e) =>
      console.error('[embed] task delete batch cleanup failed:', e?.message)
    )
  }
  return c.json({ ok: true })
})

// 添加到我的那一天（使用北京时间）
app.post('/api/tasks/:id/myday', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  await db.update(schema.tasks).set({
    isMyDay: true,
    myDayDate: todayCST(),
    updatedAt: nowBeijing(),
  }).where(eq(schema.tasks.id, id))
  return c.json({ ok: true })
})

// 移出我的那一天
app.delete('/api/tasks/:id/myday', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  await db.update(schema.tasks).set({
    isMyDay: false,
    myDayDate: null,
    updatedAt: nowBeijing(),
  }).where(eq(schema.tasks.id, id))
  return c.json({ ok: true })
})

// 任务批量排序（拖拽后，1 次 roundtrip 代替 N 次单任务 PUT）
app.put('/api/tasks/reorder', async (c) => {
  try {
    const { orders } = await c.req.json() as { orders: { id: string; sortOrder: number }[] }
    if (!orders || !Array.isArray(orders)) return c.json({ error: 'orders required' }, 400)
    const db = drizzle(c.env.DB, { schema })
    const valid = orders.filter((o) => o && typeof o.sortOrder === 'number')
    if (valid.length === 0) return c.json({ ok: true })
    const now = nowBeijing()
    // 逐条更新；D1/D1-like drizzle batch 类型严格，顺序执行更稳且数量有限
    for (const o of valid) {
      await db.update(schema.tasks).set({ sortOrder: o.sortOrder, updatedAt: now }).where(eq(schema.tasks.id, o.id))
    }
    return c.json({ ok: true })
  } catch (e: any) {
    return c.json({ error: '排序失败', detail: e.message }, 500)
  }
})

// ========== 子任务 ==========

// 获取任务的子任务
app.get('/api/subtasks/:taskId', async (c) => {
  const { taskId } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const result = await db.select().from(schema.subtasks)
    .where(eq(schema.subtasks.taskId, taskId))
    .orderBy(schema.subtasks.sortOrder)
  return c.json(result)
})

// 创建子任务
app.post('/api/subtasks/:taskId', async (c) => {
  const { taskId } = c.req.param()
  try {
    let body: unknown = null
    try {
      body = await c.req.json()
    } catch (e: any) {
      console.error('[subtasks] parse body failed:', { taskId, error: e })
      return c.json({ error: '请求体解析失败', detail: e.message }, 400)
    }

    const parsed = createSubtaskSchema.safeParse(body)
    if (!parsed.success) {
      console.error('[subtasks] validation failed:', { taskId, body, issues: parsed.error.issues })
      return c.json({ error: '参数校验失败', detail: parsed.error.message }, 422)
    }
    const { title, sortOrder } = parsed.data

    const db = drizzle(c.env.DB, { schema })

    // 校验父任务存在，避免外键约束导致 500
    const parent = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.id, taskId))
    if (parent.length === 0) {
      return c.json({ error: '父任务不存在', taskId }, 404)
    }

    const id = crypto.randomUUID()
    const now = nowBeijing()
    // 若传了 sortOrder：插入到指定位置，该位置及之后的子任务后移一位
    if (sortOrder !== undefined) {
      await db.update(schema.subtasks)
        .set({ sortOrder: sql`${schema.subtasks.sortOrder} + 1` })
        .where(and(eq(schema.subtasks.taskId, taskId), gte(schema.subtasks.sortOrder, sortOrder)))
      await db.insert(schema.subtasks).values({ id, taskId, title, isCompleted: false, sortOrder, createdAt: now })
    } else {
      // 未传 sortOrder：追加到末尾
      const existingSubs = await db.select({ sortOrder: schema.subtasks.sortOrder }).from(schema.subtasks)
        .where(eq(schema.subtasks.taskId, taskId))
      const maxSort = existingSubs.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), 0)
      await db.insert(schema.subtasks).values({ id, taskId, title, isCompleted: false, sortOrder: maxSort + 1, createdAt: now })
    }
    // 新增子任务后同步父任务完成态（新子任务默认未完成，若父任务之前已完成则变为未完成）
    await syncParentCompletion(db, taskId)
    const subtask = await db.select().from(schema.subtasks).where(eq(schema.subtasks.id, id))
    // 增量嵌入子任务（非阻塞：响应返回后在后台执行，不拖慢前端）
    c.executionCtx.waitUntil(
      indexTarget(c, 'subtask', id, title).catch((e) => console.error('[embed] subtask create failed:', e?.message))
    )
    return c.json(subtask[0], 201)
  } catch (e: any) {
    console.error('[subtasks] unhandled error:', { taskId, error: e, stack: e.stack })
    return c.json({ error: '子任务创建失败', detail: e.message, stack: e.stack }, 500)
  }
})

// 子任务批量排序（拖拽后）
app.put('/api/subtasks/reorder', async (c) => {
  try {
    const { orders } = await c.req.json() as { orders: { id: string; sortOrder: number }[] }
    if (!orders || !Array.isArray(orders)) return c.json({ error: 'orders required' }, 400)
    const db = drizzle(c.env.DB, { schema })
    // 逐条更新（D1 batch 类型约束较严，顺序执行更稳妥）
    for (const o of orders) {
      await db.update(schema.subtasks).set({ sortOrder: o.sortOrder }).where(eq(schema.subtasks.id, o.id))
    }
    return c.json({ ok: true })
  } catch (e: any) {
    return c.json({ error: '排序失败', detail: e.message }, 500)
  }
})

// 更新子任务
app.put('/api/subtasks/:id', async (c) => {
  const { id } = c.req.param()
  const body = updateSubtaskSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })
  const updateData: Record<string, unknown> = {}
  for (const key of ['title', 'isCompleted', 'sortOrder'] as const) {
    if (key in body) updateData[key] = body[key]
  }
  await db.update(schema.subtasks).set(updateData).where(eq(schema.subtasks.id, id))
  const subtask = await db.select().from(schema.subtasks).where(eq(schema.subtasks.id, id))
  // 子任务完成态变化 → 同步父任务完成态
  if (subtask[0] && 'isCompleted' in updateData) {
    await syncParentCompletion(db, subtask[0].taskId)
  }
  // 增量嵌入子任务（非阻塞）
  if (subtask[0]) c.executionCtx.waitUntil(
    indexTarget(c, 'subtask', subtask[0].id, subtask[0].title).catch((e) => console.error('[embed] subtask update failed:', e?.message))
  )
  return c.json(subtask[0])
})

// 切换子任务完成状态
app.patch('/api/subtasks/:id/toggle', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const existing = await db.select().from(schema.subtasks).where(eq(schema.subtasks.id, id))
  if (!existing.length) return c.json({ error: '未找到' }, 404)
  const nextCompleted = !existing[0].isCompleted
  await db.update(schema.subtasks)
    .set({ isCompleted: nextCompleted })
    .where(eq(schema.subtasks.id, id))
  // 子任务完成态变化 → 同步父任务完成态（全部完成则父任务完成）
  await syncParentCompletion(db, existing[0].taskId)
  const subtask = await db.select().from(schema.subtasks).where(eq(schema.subtasks.id, id))
  return c.json(subtask[0])
})

// 删除子任务
app.delete('/api/subtasks/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const existing = await db.select({ taskId: schema.subtasks.taskId }).from(schema.subtasks).where(eq(schema.subtasks.id, id))
  await db.delete(schema.subtasks).where(eq(schema.subtasks.id, id))
  // 删除后重新同步父任务完成态（可能因少了一个子任务导致父任务不再满足"全部完成"）
  if (existing.length > 0) {
    await syncParentCompletion(db, existing[0].taskId)
  }
  // 清理子任务嵌入（后台执行，不阻塞响应）
  c.executionCtx.waitUntil(indexTarget(c, 'subtask', id, '').catch((e) => console.error('[embed] subtask delete cleanup failed:', e?.message)))
  return c.json({ ok: true })
})

// ========== AI ==========

// AI 拆解子任务（支持直接在服务端创建，避免前端 N 次串行请求）
app.post('/api/ai/breakdown', async (c) => {
    try {
      const { taskTitle, taskId } = await c.req.json()
      if (!taskTitle) return c.json({ error: '任务标题不能为空' }, 400)

      const text = await callAI(c, [
        {
          role: 'system',
          content: '你是任务拆解专家。将任务拆解为3-7个可执行子步骤。每行只写一个步骤，不要编号、不要 JSON、不要额外说明。'
        },
        { role: 'user', content: `任务：${taskTitle}` }
      ], { maxTokens: 1024 })

      if (!text || typeof text !== 'string') {
        return c.json({ subtasks: [] })
      }

      // 优先尝试解析 JSON 数组，失败则按行拆分
      const match = text.match(/\[[\s\S]*\]/)
      let parsedTitles: string[] = []
      if (match) {
        try {
          const parsed = JSON.parse(match[0])
          if (Array.isArray(parsed)) {
            parsedTitles = parsed.filter((item: any) => item && item.title).map((item: any) => String(item.title).trim()).filter(Boolean)
          }
        } catch { /* ignore */ }
      }

      if (parsedTitles.length === 0) {
        parsedTitles = text
          .split(/\n/)
          .map((line) => line.replace(/^\s*[-\d\.\*]+\s*/, '').trim())
          .filter((line) => line.length > 0 && line.length < 200)
          .slice(0, 10)
      }

      // 若传了 taskId，直接在服务端创建子任务（免前端逐个请求）
      if (taskId) {
        const db = drizzle(c.env.DB, { schema })
        const now = nowBeijing()
        const created: { id: string; title: string }[] = []
        for (const title of parsedTitles) {
          const id = crypto.randomUUID()
          await db.insert(schema.subtasks).values({ id, taskId, title, isCompleted: false, sortOrder: created.length + 1, createdAt: now })
          // 非阻塞索引嵌入
          c.executionCtx.waitUntil(
            indexTarget(c, 'subtask', id, title).catch((e) => console.error('[embed] ai subtask failed:', e?.message))
          )
          created.push({ id, title })
        }
        // 批量创建完成后同步一次父任务完成态
        await syncParentCompletion(db, taskId)
        // 令父任务嵌入中包含新子任务信息
        const parentTitles = parsedTitles.join(', ')
        const parentTask = await db.select({ id: schema.tasks.id, title: schema.tasks.title, note: schema.tasks.note }).from(schema.tasks).where(eq(schema.tasks.id, taskId))
        if (parentTask[0]) {
          c.executionCtx.waitUntil(
            indexTarget(c, 'task', taskId, `${parentTask[0].title}\n${parentTask[0].note || ''}\n${parentTitles}`).catch(() => {})
          )
        }
        return c.json({ subtasks: created, created: true })
      }

      // 未传 taskId 时兼容旧行为（仅返回标题列表）
      return c.json({ subtasks: parsedTitles.map((title) => ({ title })) })
    } catch (e: any) {
      console.error('[ai/breakdown] error:', e?.message || e)
      return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
    }
  })

// AI 数据分析（带 1 小时 KV 缓存，减少重复 AI 调用）
app.post('/api/ai/analysis', async (c) => {
  const range = c.req.query('range') || 'all'
  const cacheKey = `ai:analysis:${range}`
  const cacheTTL = 60 * 60 * 1000 // 1 小时
  const db = drizzle(c.env.DB, { schema })

  const cached = await kvCacheGet<{ analysis: string; stats: object }>(c.env, cacheKey)
  if (cached) return c.json({ ...cached, cached: true })

  // 时间范围过滤条件
  let dateFilter: string | undefined = undefined
  if (range !== 'all') {
    const since = new Date()
    since.setDate(since.getDate() - parseInt(range))
    dateFilter = since.toISOString()
  }

  // 在数据库层聚合统计，避免把全部任务/笔记加载到内存
  const taskWhere = dateFilter
    ? and(gte(schema.tasks.createdAt, dateFilter), isNull(schema.tasks.msTodoDeletedAt))
    : isNull(schema.tasks.msTodoDeletedAt)

  const [totalTasksRow, completedTasksRow, importantTasksRow, notesCountRow] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(schema.tasks).where(taskWhere),
    db.select({ count: sql<number>`COUNT(*)` }).from(schema.tasks).where(and(taskWhere, eq(schema.tasks.isCompleted, true))),
    db.select({ count: sql<number>`COUNT(*)` }).from(schema.tasks).where(and(taskWhere, eq(schema.tasks.isImportant, true))),
    db.select({ count: sql<number>`COUNT(*)` }).from(schema.imaNotes),
  ])

  // 按日完成趋势
  const dailyMap: Record<string, number> = {}
  const days = range === 'all' ? 30 : parseInt(range)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dailyMap[d.toISOString().split('T')[0]] = 0
  }
  // 仅需 completed + updatedAt 在范围内的任务，用索引覆盖列减少 IO
  const completedTasks = await db.select({ updatedAt: schema.tasks.updatedAt }).from(schema.tasks)
    .where(and(taskWhere, eq(schema.tasks.isCompleted, true)))
  for (const t of completedTasks) {
    if (!t.updatedAt) continue
    const date = new Date(t.updatedAt).toISOString().split('T')[0]
    if (date in dailyMap) dailyMap[date]++
  }
  const dailyCompleted = Object.entries(dailyMap).map(([date, count]) => ({ date, count }))

  const stats = {
    totalTasks: totalTasksRow[0]?.count ?? 0,
    completedTasks: completedTasksRow[0]?.count ?? 0,
    importantTasks: importantTasksRow[0]?.count ?? 0,
    notesCount: notesCountRow[0]?.count ?? 0,
    dailyCompleted,
  }

  try {
    const analysis = await callAI(c, [
      {
        role: 'system',
        content: '你是数据分析专家。根据以下数据生成简洁的中文分析报告，包含趋势洞察和建议。200字以内。'
      },
      { role: 'user', content: JSON.stringify(stats) }
    ])
    const response = { analysis, stats }

    await kvCacheSet(c.env, cacheKey, response, cacheTTL)

    return c.json({ ...response, cached: false })
  } catch (e: any) {
    console.error('[ai/analysis] error:', e)
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// AI 周报
app.post('/api/ai/weekly-report', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })

    // 本周数据：用 COUNT 避免把全部任务/笔记加载到内存
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const since = weekAgo.toISOString()

    const taskWhere = and(gte(schema.tasks.createdAt, since), isNull(schema.tasks.msTodoDeletedAt))
    const [[weekTasksRow], [completedTasksRow], [weekNotesRow]] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(schema.tasks).where(taskWhere),
      db.select({ count: sql<number>`COUNT(*)` }).from(schema.tasks).where(and(taskWhere, eq(schema.tasks.isCompleted, true))),
      db.select({ count: sql<number>`COUNT(*)` }).from(schema.imaNotes).where(gte(schema.imaNotes.importedAt, since)),
    ])

    const weekTasksCount = weekTasksRow?.count ?? 0
    const completedTasksCount = completedTasksRow?.count ?? 0
    const weekNotesCount = weekNotesRow?.count ?? 0

    const summary = `本周新增任务 ${weekTasksCount} 个，完成 ${completedTasksCount} 个，新增笔记 ${weekNotesCount} 篇。`

    const report = await callAI(c, [{
      role: 'system',
      content: `你是一个个人助手，根据用户本周的工作数据生成一份周报。请用中文输出，包含：本周成就、待改进、下周建议三个部分，每部分 2-3 句话。`
    }, {
      role: 'user',
      content: summary
    }])

    // 存入 settings 表（key: weekly_report_YYYYWww，ISO 周）
    const { year, week } = getISOWeek(new Date())
    const reportKey = `weekly_report_${year}W${week.toString().padStart(2, '0')}`
    await db.insert(schema.settings).values({ key: reportKey, value: report }).onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: report, updatedAt: nowBeijing() },
    })

    // 保留最近 52 周周报，删除更旧的数据避免 settings 无限增长
    const allReports = await db.select({ key: schema.settings.key }).from(schema.settings)
      .where(like(schema.settings.key, 'weekly_report_%'))
      .orderBy(desc(schema.settings.key))
    const oldReports = allReports.slice(52)
    if (oldReports.length > 0) {
      await db.delete(schema.settings).where(inArray(schema.settings.key, oldReports.map((r) => r.key)))
    }

    return c.json({ report, week: `${year}-W${week}` })
  } catch (e: any) {
    const detail = e?.message || e?.toString() || JSON.stringify(e)
    console.error('[weekly-report] error:', detail, e?.stack || '')
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// 获取历史周报列表
app.get('/api/ai/weekly-reports', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const reports = await db.select().from(schema.settings)
      .where(like(schema.settings.key, 'weekly_report_%'))
      .orderBy(desc(schema.settings.key))
    return c.json(reports.map(s => ({ week: s.key.replace('weekly_report_', ''), report: s.value })))
  } catch (e: any) {
    console.error('[weekly-reports] error:', e)
    return c.json({ error: e.message || String(e) }, 500)
  }
})

// 每日简报：聚合「我的一天」+ 今日/已过期任务 + 近期笔记，生成晨间摘要
app.post('/api/ai/digest', async (c) => {
  const today = todayCST()
  const cacheKey = `ai:digest:${today}`
  const cacheTTL = 24 * 60 * 60 * 1000 // 24 小时
  const db = drizzle(c.env.DB, { schema })

  const cached = await kvCacheGet<string>(c.env, cacheKey)
  if (cached) return c.json({ digest: cached, cached: true })

  try {
    // 我的一天任务（未完成）
    const myDayTasks = await db.select().from(schema.tasks)
      .where(and(eq(schema.tasks.isMyDay, true), eq(schema.tasks.isCompleted, false), isNull(schema.tasks.msTodoDeletedAt)))

    // 今日到期或已过期未完成任务
    const dueTasks = await db.select().from(schema.tasks)
      .where(and(
        eq(schema.tasks.isCompleted, false),
        isNull(schema.tasks.msTodoDeletedAt),
        or(
          eq(schema.tasks.dueDate, today),
          and(isNotNull(schema.tasks.dueDate), lt(schema.tasks.dueDate, today))
        )
      ))

    // 最近 3 天新增笔记（用北京时间日期计算）
    const now = new Date()
    const threeDaysAgoDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const fmt3d = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    })
    const parts3d = fmt3d.formatToParts(threeDaysAgoDate)
    const g3 = (type: string) => parts3d.find(p => p.type === type)?.value || '00'
    const threeDaysAgo = `${g3('year')}-${g3('month')}-${g3('day')}T${g3('hour')}:${g3('minute')}:${g3('second')}+08:00`
    const recentNotes = await db.select().from(schema.imaNotes)
      .where(gte(schema.imaNotes.importedAt, threeDaysAgo))
      .orderBy(desc(schema.imaNotes.importedAt))
      .limit(10)

    const myDayTitles = myDayTasks.map(t => t.title).slice(0, 10)
    const dueTitles = dueTasks.map(t => `${t.title}${t.dueDate && t.dueDate < today ? '（已过期）' : ''}`).slice(0, 10)
    const noteTitles = recentNotes.map(n => n.title).slice(0, 10)

    const prompt = `你是个人助理。根据以下信息生成一段 150 字以内的今日简报，包含今日重点和一句建议，中文输出：
- 我的一天任务（未完成）：${myDayTitles.join('、') || '无'}
- 今日到期或已过期任务：${dueTitles.join('、') || '无'}
- 最近 3 天笔记：${noteTitles.join('、') || '无'}`

    const digest = await callAI(c, [
      { role: 'system', content: '你是个人助理，用简洁、温暖的语气生成今日简报。' },
      { role: 'user', content: prompt },
    ], { maxTokens: 300 })

    const trimmed = digest.trim()
    await kvCacheSet(c.env, cacheKey, trimmed, cacheTTL)

    return c.json({ digest: trimmed, cached: false })
  } catch (e: any) {
    console.error('[digest] error:', e)
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// AI 笔记辅助：总结 / 要点 / 转任务
app.post('/api/ai/note-summary', async (c) => {
  const { noteId, action } = await c.req.json<{ noteId: string; action: 'summary' | 'points' | 'to-task' }>()
  if (!noteId) return c.json({ error: 'noteId 必填' }, 400)
  const db = drizzle(c.env.DB, { schema })
  const note = await db.select().from(schema.imaNotes).where(eq(schema.imaNotes.id, noteId)).get()
  if (!note) return c.json({ error: '笔记不存在' }, 404)

  const prompts: Record<string, string> = {
    summary: '你是一个笔记助手。用 3 句话以内总结以下笔记的核心要点，中文输出。',
    points: '从以下笔记中提取 5 条关键要点，每条一行，不要编号、不要解释。',
    'to-task': '从以下笔记中提取可执行的待办事项，每条一行，不要编号、不要解释。',
  }
  const content = (note.content || '').slice(0, 8000)
  if (!content.trim()) return c.json({ result: '' })

  try {
    const result = await callAI(c, [
      { role: 'system', content: prompts[action] || prompts.summary },
      { role: 'user', content },
    ], { maxTokens: action === 'summary' ? 400 : 300 })
    return c.json({ result })
  } catch (e: any) {
    console.error('[ai/note-summary] error:', e)
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// 跨模块语义检索（RAG-lite）：向量存 D1，按需增量嵌入，暴力余弦，不引外部向量库
app.post('/api/ai/semantic-search', async (c) => {
  const { query, topK = 5 } = await c.req.json<{ query: string; topK?: number }>()
  if (!query || !query.trim()) return c.json({ results: [] })

  // KV 缓存（5 分钟 TTL），相同查询直接返回；key 基于查询内容稳定哈希，避免永远失效
  const queryNorm = query.trim().toLowerCase()
  const cacheKeyBase = `${queryNorm}:${topK}`
  const cacheKeyHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cacheKeyBase))
  const cacheKey = `ai:search:${Array.from(new Uint8Array(cacheKeyHash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)}`
  const cacheTTLSeconds = 300 // 5 min
  const cacheTTLMs = cacheTTLSeconds * 1000
  const db = drizzle(c.env.DB, { schema })

  const cached = await kvCacheGet<{ results: unknown[] }>(c.env, cacheKey)
  if (cached) return c.json(cached)

  // 1. 嵌入查询
  let qVec: number[]
  try {
    qVec = await embedText(c, query)
  } catch (e: any) {
    return c.json({ error: '嵌入模型不可用: ' + e.message }, 500)
  }

  // 2. 收集语料（笔记 + 任务 + 子任务 + 知识库有正文的）
  let notes: any[], tasks: any[], subtasks: any[], kb: any[]
  try {
    notes = await db.select({ id: schema.imaNotes.id, title: schema.imaNotes.title, content: schema.imaNotes.content }).from(schema.imaNotes)
    tasks = await db.select({ id: schema.tasks.id, title: schema.tasks.title, note: schema.tasks.note, isCompleted: schema.tasks.isCompleted, isImportant: schema.tasks.isImportant, dueDate: schema.tasks.dueDate }).from(schema.tasks).where(isNull(schema.tasks.msTodoDeletedAt))
    subtasks = await db.select({ id: schema.subtasks.id, title: schema.subtasks.title, taskId: schema.subtasks.taskId }).from(schema.subtasks)
    kb = await db.select({ id: schema.kbDocuments.id, title: schema.kbDocuments.title, content: schema.kbDocuments.content }).from(schema.kbDocuments)
  } catch (e: any) {
    return c.json({ error: '数据库查询失败: ' + e.message }, 500)
  }

  type Item = { type: 'note' | 'task' | 'subtask' | 'kb'; id: string; title: string; text: string }
  const items: Item[] = []
  for (const n of notes) items.push({ type: 'note', id: n.id, title: n.title, text: `${n.title}\n${n.content || ''}`.slice(0, 4000) })
  for (const t of tasks) {
    const meta = `${t.isCompleted ? '已完成' : '未完成'}\n${t.isImportant ? '重要' : ''}\n${t.dueDate ? '截止: ' + t.dueDate : ''}`
    items.push({ type: 'task', id: t.id, title: t.title, text: `${t.title}\n${t.note || ''}\n${meta}`.slice(0, 4000) })
  }
  for (const st of subtasks) items.push({ type: 'subtask', id: st.id, title: st.title, text: st.title })
  for (const k of kb) { if (k.content && k.content.trim()) items.push({ type: 'kb', id: k.id, title: k.title, text: `${k.title}\n${k.content}`.slice(0, 4000) }) }

  if (items.length === 0) return c.json({ results: [] })

  // 3. 增量嵌入：缺失才编码并缓存到 embeddings 表，后续查询直接走缓存
  let existing: any[]
  try {
    existing = await db.select().from(schema.embeddings)
  } catch (e: any) {
    return c.json({ error: '向量缓存查询失败: ' + e.message }, 500)
  }
  // 预解析所有向量到 Map，避免循环中重复 JSON.parse
  const embMap = new Map<string, number[]>()
  for (const e of existing) {
    try { embMap.set(`${e.targetType}:${e.targetId}`, JSON.parse(e.vector)) } catch { /* skip corrupt */ }
  }

  // 4. 评分（语义 + 词法 + 标题加权）
  const scored: { type: string; id: string; title: string; snippet: string; score: number }[] = []
  for (const it of items) {
    const key = `${it.type}:${it.id}`
    let vec = embMap.get(key)
    if (!vec) {
      try {
        vec = await embedText(c, it.text)
        await db.insert(schema.embeddings).values({ id: crypto.randomUUID(), targetType: it.type, targetId: it.id, model: EMBED_MODEL, vector: JSON.stringify(vec) })
        embMap.set(key, vec)
      } catch (e: any) {
        console.error('[semantic-search] 嵌入失败，跳过', key, e?.message)
        continue
      }
    }
    const semantic = cosine(qVec, vec)
    const lexical = lexicalScore(query, it.title, it.text)
    const titleBoost = normalizeSearchText(it.title).includes(normalizeSearchText(query)) ? 0.08 : 0
    const finalScore = Math.min(1, semantic * 0.72 + lexical + titleBoost)
    scored.push({
      type: it.type,
      id: it.id,
      title: it.title,
      snippet: buildSnippet(query, it.text),
      score: finalScore,
    })
  }

  scored.sort((a, b) => b.score - a.score)
  const results = scored.filter((r) => r.score > 0.18).slice(0, Math.min(topK, 20))
  const response = { results }

  // 写入缓存
  await kvCacheSet(c.env, cacheKey, response, cacheTTLMs)

  return c.json(response)
})

// 一次性重建全部向量（首跑语义检索前可调用，预热嵌入缓存，避免首次查询过慢）
// 先清空再逐条写入，单条失败不中断整体；返回成功索引条数。
// 语义检索重索引（同步执行，带 try/catch + 限量，避免超时/500）
app.post('/api/ai/reindex', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    await db.delete(schema.embeddings)
    const notes = await db.select({ id: schema.imaNotes.id, title: schema.imaNotes.title, content: schema.imaNotes.content }).from(schema.imaNotes)
    const tasks = await db.select({ id: schema.tasks.id, title: schema.tasks.title, note: schema.tasks.note, isCompleted: schema.tasks.isCompleted, isImportant: schema.tasks.isImportant, dueDate: schema.tasks.dueDate }).from(schema.tasks).where(isNull(schema.tasks.msTodoDeletedAt))
    const subtasks = await db.select({ id: schema.subtasks.id, title: schema.subtasks.title }).from(schema.subtasks)
    const kb = await db.select({ id: schema.kbDocuments.id, title: schema.kbDocuments.title, content: schema.kbDocuments.content }).from(schema.kbDocuments)
    let count = 0
    for (const n of notes) try { await indexTarget(c, 'note', n.id, `${n.title}\n${n.content || ''}`); count++ } catch (e: any) { console.error('[reindex] 跳过 note', n.id, e?.message) }
    for (const t of tasks) {
      const meta = `${t.isCompleted ? '已完成' : '未完成'}\n${t.isImportant ? '重要' : ''}\n${t.dueDate ? '截止: ' + t.dueDate : ''}`
      try { await indexTarget(c, 'task', t.id, `${t.title}\n${t.note || ''}\n${meta}`); count++ } catch (e: any) { console.error('[reindex] 跳过 task', t.id, e?.message) }
    }
    for (const st of subtasks) try { await indexTarget(c, 'subtask', st.id, st.title); count++ } catch (e: any) { console.error('[reindex] 跳过 subtask', st.id, e?.message) }
    for (const k of kb) { if (k.content?.trim()) try { await indexTarget(c, 'kb', k.id, `${k.title}\n${k.content}`); count++ } catch (e: any) { console.error('[reindex] 跳过 kb', k.id, e?.message) } }
    return c.json({ ok: true, indexed: count })
  } catch (e: any) {
    console.error('[reindex] failed:', e)
    return c.json({ ok: false, error: e.message, indexed: 0 }, 200)
  }
})

// 自然语言录入任务：解析一句话为结构化任务（标题/截止时间/列表/备注）
app.post('/api/ai/parse-task', async (c) => {
  const { text } = await c.req.json<{ text: string }>()
  if (!text || !text.trim()) return c.json({ error: 'text 必填' }, 400)
  const db = drizzle(c.env.DB, { schema })
  const lists = await db.select({ id: schema.taskLists.id, name: schema.taskLists.name }).from(schema.taskLists)
  const listNames = lists.map((l) => l.name).join('、') || '（暂无列表）'
  const system = `你是一个任务解析助手。用户用一句话描述要做的事，请提取结构化任务并只输出一个严格 JSON 对象（不要解释、不要 markdown 代码块、不要反引号），字段：
{"title": string, "dueDate": string|null, "listName": string|null, "note": string|null}
- title：简洁任务标题（必填）。
- dueDate：若提到日期，转为 yyyy-MM-dd（如 2026-07-24），按北京时间；相对时间以今天为基准推算；没有具体日期则为 null。不要带时间。
- listName：若提到分类（如"工作""生活"），从候选列表里选最匹配的；否则 null。
- note：补充说明，没有则 null。
候选列表：${listNames}`
  try {
    const raw = await callAI(c, [
      { role: 'system', content: system },
      { role: 'user', content: text },
    ], { maxTokens: 300 })
    let parsed: any = null
    try {
      parsed = JSON.parse(raw.trim().replace(/^```json\s*|```$/g, '').trim())
    } catch {
      parsed = null
    }
    if (!parsed || !parsed.title) {
      // 回退：整句作标题
      return c.json({ task: { title: text.trim(), dueDate: null, listName: null, note: null, listId: lists[0]?.id ?? null } })
    }
    let listId: string | null = null
    if (parsed.listName) {
      const match = lists.find((l) => l.name === parsed.listName)
        || lists.find((l) => parsed.listName.includes(l.name) || l.name.includes(parsed.listName))
      listId = match?.id ?? null
    }
    // 统一日期格式为 yyyy-MM-dd
    const dueDate = normalizeDate(parsed.dueDate)
    return c.json({ task: { title: parsed.title, dueDate, listName: parsed.listName ?? null, note: parsed.note ?? null, listId } })
  } catch (e: any) {
    console.error('[parse-task] AI 调用失败:', e)
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// AI 优先级建议：基于截止日期、重要标记等，推荐今天最值得做的 1-3 件事
app.post('/api/ai/priority-suggestions', async (c) => {
  const today = todayCST()
  const cacheKey = `ai:priority:${today}`
  const cacheTTL = 24 * 60 * 60 * 1000 // 24 小时
  const db = drizzle(c.env.DB, { schema })

  const cached = await kvCacheGet<{ taskId: string; reason: string }[]>(c.env, cacheKey)
  if (cached) return c.json({ suggestions: cached, cached: true })

  try {
    const candidates = await db.select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      note: schema.tasks.note,
      isImportant: schema.tasks.isImportant,
      isMyDay: schema.tasks.isMyDay,
      dueDate: schema.tasks.dueDate,
    }).from(schema.tasks).where(and(
      eq(schema.tasks.isCompleted, false),
      isNull(schema.tasks.msTodoDeletedAt)
    )).orderBy(asc(schema.tasks.dueDate))

    if (candidates.length === 0) {
      return c.json({ suggestions: [], cached: false })
    }

    const items = candidates.slice(0, 20).map(t => ({
      id: t.id,
      title: t.title,
      isImportant: t.isImportant,
      isMyDay: t.isMyDay,
      dueDate: t.dueDate,
      overdue: t.dueDate && t.dueDate < today,
    }))

    const prompt = `你是时间管理助手。请从以下未完成任务中推荐 1-3 件今天最值得优先做的事，并给出简短理由（每行 20 字以内）。只输出严格 JSON 数组，不要解释、不要 markdown 代码块：
[{ "taskId": "任务ID", "reason": "推荐理由" }]
今天是 ${today}。
候选任务：${JSON.stringify(items)}`

    const raw = await callAI(c, [
      { role: 'system', content: '你是时间管理助手，擅长根据截止日期、重要性和「我的一天」标记判断优先级。' },
      { role: 'user', content: prompt },
    ], { maxTokens: 400 })

    let suggestions: { taskId: string; reason: string }[] = []
    try {
      const parsed = JSON.parse(raw.trim().replace(/^```json\s*|```$/g, '').trim())
      if (Array.isArray(parsed)) {
        suggestions = parsed.filter((p: any) => items.some((i: any) => i.id === p.taskId) && typeof p.reason === 'string')
      }
    } catch {
      suggestions = []
    }

    await kvCacheSet(c.env, cacheKey, suggestions, cacheTTL)

    return c.json({ suggestions, cached: false })
  } catch (e: any) {
    console.error('[priority-suggestions] error:', e)
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// AI 列表推荐：根据任务标题推荐最合适的列表（1 小时 KV 缓存，避免每次输入都调 AI）
app.post('/api/ai/suggest-list', async (c) => {
  const { title } = await c.req.json<{ title: string }>()
  if (!title || !title.trim()) return c.json({ listId: null, listName: null }, 400)

  const db = drizzle(c.env.DB, { schema })
  const lists = await db.select({ id: schema.taskLists.id, name: schema.taskLists.name }).from(schema.taskLists)
  if (lists.length === 0) return c.json({ listId: null, listName: null })

  const listNames = lists.map((l) => l.name).join('、')
  const normalizedTitle = title.trim().toLowerCase()
  const cacheKeyBase = `${normalizedTitle}:${listNames}`
  const cacheKeyHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cacheKeyBase))
  const cacheKey = `ai:suggest-list:${Array.from(new Uint8Array(cacheKeyHash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)}`
  const cacheTTL = 60 * 60 * 1000 // 1 小时

  const cached = await kvCacheGet<{ listId: string | null; listName: string | null }>(c.env, cacheKey)
  if (cached) return c.json({ ...cached, cached: true })

  const system = `你是一个任务分类助手。用户要创建一个任务，标题是："${title.trim()}"
请从以下候选列表中推荐最合适的列表，只输出一个严格 JSON 对象（不要解释、不要 markdown 代码块、不要反引号）：
{"listName": string|null}
如果标题无法判断或列表都不合适，返回 {"listName": null}。
候选列表：${listNames}`

  try {
    const raw = await callAI(c, [
      { role: 'system', content: system },
      { role: 'user', content: title.trim() },
    ], { maxTokens: 100 })

    let parsed: any = null
    try {
      parsed = JSON.parse(raw.trim().replace(/^```json\s*|```$/g, '').trim())
    } catch {
      parsed = null
    }

    const listName = parsed?.listName
    const result = { listId: null as string | null, listName: null as string | null }
    if (listName) {
      const match = lists.find((l) => l.name === listName)
        || lists.find((l) => listName.includes(l.name) || l.name.includes(listName))
      result.listId = match?.id ?? null
      result.listName = match?.name ?? null
    }

    await kvCacheSet(c.env, cacheKey, result, cacheTTL)

    return c.json({ ...result, cached: false })
  } catch (e: any) {
    console.error('[suggest-list] AI 调用失败:', e)
    return c.json({ listId: null, listName: null })
  }
})

// ========== AI 聊天助手：自然语言操作系统功能 ==========
// 接收一句话指令，由 AI 解析意图并返回结构化 action，后端直接执行数据类操作，
// 纯前端类操作（主题/跳转）以 action 形式返回给前端执行。
app.post('/api/ai/chat', async (c) => {
  let body: any
  try { body = await c.req.json() } catch { return c.json({ error: 'body 解析失败' }, 400) }
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return c.json({ error: 'message 必填' }, 400)
  const sessionId = typeof body?.sessionId === 'string' && body.sessionId ? body.sessionId : null
  const deepThink = !!body?.deepThink
  const systemPrompt = typeof body?.systemPrompt === 'string' ? body.systemPrompt.slice(0, 2000) : ''
  const role = typeof body?.role === 'string' ? body.role : ''
  const images = Array.isArray(body?.images) ? body.images.filter((x: any) => typeof x === 'string' && x.startsWith('data:')).slice(0, 4) : []

  const db = drizzle(c.env.DB, { schema })
  await ensureChatTables(c.env.DB)

  // 解析/创建会话，并加载最近历史（用于多轮记忆）
  const session = await resolveChatSession(db, sessionId, message)
  const history = await loadChatHistory(db, session.id)

  const ctx = await buildChatCtx(db)

  // 流式输出（SSE）
  c.header('Content-Type', 'text/event-stream')
  c.header('Cache-Control', 'no-cache, no-transform')
  c.header('Connection', 'keep-alive')
  c.header('X-Accel-Buffering', 'no')

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)) } catch {}
      }
      try {
        await streamChat(c, db, {
          message, sessionId: session.id, history, deepThink,
          systemPrompt, role, images,
          ctx,
          send,
        })
      } catch (e: any) {
        console.error('[ai/chat] 执行失败:', e)
        send({ type: 'error', message: '出错了，请稍后再试。' })
      } finally {
        try { controller.close() } catch {}
      }
    },
  })
  return c.body(stream)
})

// ============ AI 聊天：通用助手 + 工具调用 Agent ============
// 设计：模型能力完全开放（像 DeepSeek 一样能聊天/推理/写代码），
// 同时拥有操作本系统的工具。用真正的 function calling（而非让模型输出 JSON）调用工具，
// 多轮循环，SSE 流式输出最终文本，聊天记录持久化到 D1。

interface ChatCtx {
  lists: { id: string; name: string }[]
  pendingTasks: any[]
  today: string
  listNames: string
  context: string
  completedToday: number
  overdueCount: number
}

// 从数据库构建聊天/工具所需的系统上下文（聊天端点与 MCP 共用）
async function buildChatCtx(db: any): Promise<ChatCtx> {
  const today = todayCST()
  const lists = await db.select({ id: schema.taskLists.id, name: schema.taskLists.name }).from(schema.taskLists)
  const pendingTasks = await db.select({
    id: schema.tasks.id, title: schema.tasks.title, dueDate: schema.tasks.dueDate,
    isImportant: schema.tasks.isImportant, isMyDay: schema.tasks.isMyDay,
  }).from(schema.tasks)
    .where(and(eq(schema.tasks.isCompleted, false), isNull(schema.tasks.msTodoDeletedAt)))
    .orderBy(desc(schema.tasks.updatedAt)).limit(20)
  const completedTodayRow = await db.select({ count: sql<number>`COUNT(*)` }).from(schema.tasks)
    .where(and(eq(schema.tasks.isCompleted, true), sql`DATE(${schema.tasks.updatedAt}) = ${today}`))
  const completedToday = Number(completedTodayRow[0]?.count ?? 0)
  const overdueCount = pendingTasks.filter((t: any) => t.dueDate && t.dueDate < today).length
  const myDayTitles = pendingTasks.filter((t: any) => t.isMyDay).slice(0, 3).map((t: any) => t.title)
  const upcoming = pendingTasks.filter((t: any) => t.dueDate && t.dueDate >= today)
    .sort((a: any, b: any) => String(a.dueDate).localeCompare(String(b.dueDate))).slice(0, 3)
    .map((t: any) => `${t.title}(${t.dueDate})`)
  const listNames = lists.map((l: any) => l.name).join('、') || '（暂无列表）'
  const context = `日期:${today} | 列表:${listNames} | 未完成:${pendingTasks.length} | 今日完成:${completedToday} | 逾期:${overdueCount} | 我的一天:${myDayTitles.join('、') || '无'} | 即将到期:${upcoming.join('、') || '无'}`
  return { lists, pendingTasks, today, listNames, context, completedToday, overdueCount }
}

// 工具定义：聊天端点不再使用工具调用，改为纯文本对话（MCP 端点仍可引用此数组）
const CHAT_TOOLS: any[] = []

// 新工具名(+action) → 旧执行分支映射：executeChatTool 的 case 逻辑保持不变，零改动复用
const TOOL_ACTION_MAP: Record<string, Record<string, string>> = {
  task: { create: 'create_task', update: 'update_task', complete: 'complete_task', delete: 'delete_task', search: 'search_tasks' },
  task_list: { create: 'create_task_list', update: 'update_task_list', delete: 'delete_task_list' },
  subtask: { create: 'create_subtask', toggle: 'toggle_subtask', delete: 'delete_subtask' },
  note: { create: 'add_note', update: 'update_note', delete: 'delete_note', search: 'search_notes' },
  knowledge: { search: 'search_knowledge', summarize: 'summarize_knowledge', ask: 'ask_knowledge' },
  workspace: { overview: 'get_overview', navigate: 'navigate', theme: 'set_theme', coin_flip: 'coin_flip' },
  ai_config: { get: 'get_ai_config', update: 'update_ai_config' },
}

function resolveChatTool(name: string, args: any): string {
  const action = args && typeof args.action === 'string' ? args.action : ''
  return TOOL_ACTION_MAP[name]?.[action] || name
}

// 多角色预设（用户可在聊天里切换场景语气）
const ROLE_PERSONAS: Record<string, string> = {
  study: '你当前处于「学习模式」：用教练式、循循善诱的方式帮助用户理解概念，多用类比、提问引导思考，鼓励动手实践。',
  work: '你当前处于「工作模式」：高效、结构化、结果导向。优先给出可执行步骤、清单与要点，少废话。',
  chat: '你当前处于「闲聊模式」：轻松、亲切、像朋友一样陪聊，可适当幽默，不必每次都调用工具。',
}

// 注意：deepThink 不进 system（会破坏前缀缓存），API 级开关在 chatCompletionOpenAI 处理，
// 提示语级则附加到当前用户消息尾部（见 streamChat）
function buildChatSystem(ctx: ChatCtx, extra?: { systemPrompt?: string; role?: string }): string {
  const roleLine = extra?.role && ROLE_PERSONAS[extra.role] ? `\n${ROLE_PERSONAS[extra.role]}` : ''
  const customLine = extra?.systemPrompt?.trim() ? `\n用户自定义指令（最高优先级）：\n${extra.systemPrompt.trim()}` : ''
  return `你是这个「个人工作台」的专属 AI 助手。你可以看到用户当前的任务、笔记、列表等上下文信息，基于这些信息回答问题、提供建议、协助思考。你不直接操作数据，而是像一个了解用户工作状态的顾问一样，给出有用的建议和回答。

${roleLine}${customLine}

## 当前上下文
${ctx.context}

## 能力
- 基于用户的任务和笔记提供分析、总结、建议
- 回答问题、写作、翻译、代码、推理
- 梳理待办事项的优先级和安排建议
- 中文回复，保持友好、简洁、有帮助的风格`
}

function safeParseJson(s: string): any {
  if (!s) return {}
  try { return JSON.parse(s) } catch {
    try { return JSON.parse(s.replace(/[\n\r]/g, ' ')) } catch { return {} }
  }
}

// 持久化前脱敏：把工具参数里的 apiKey 替换为 ***，避免密钥落库到聊天记录
function sanitizeToolArgs(args: any): any {
  if (!args || typeof args !== 'object') return args
  try {
    const clone = JSON.parse(JSON.stringify(args))
    if ('apiKey' in clone && typeof clone.apiKey === 'string') clone.apiKey = '***'
    return clone
  } catch {
    return args
  }
}

// 联网搜索：优先用 Tavily（需 env.TAVILY_API_KEY），否则 keyless 走 DuckDuckGo HTML 抓取
interface WebSearchResult {
  text: string
  sources: { title: string; url: string; snippet: string }[]
}
async function webSearch(query: string, env: any): Promise<WebSearchResult> {
  const q = String(query || '').trim()
  if (!q) return { text: 'web_search 缺少 query', sources: [] }
  try {
    let items: { title: string; url: string; snippet: string }[] = []
    const key = env?.TAVILY_API_KEY
    if (key && typeof key === 'string' && key.length > 0) {
      try {
        const r = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: key, query: q, max_results: 5, search_depth: 'basic' }),
        })
        if (r.ok) {
          const j: any = await r.json().catch(() => null)
          items = (j?.results || []).map((x: any) => ({ title: x.title || '', url: x.url || '', snippet: String(x.content || '').slice(0, 280) }))
        }
      } catch {}
    }
    if (!items.length) {
      const r = await fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        },
        body: `q=${encodeURIComponent(q)}`,
      })
      if (r.ok) {
        const html = await r.text()
        const matches = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)]
        items = matches.slice(0, 5).map((m) => ({ title: stripHtml(m[2]), url: decodeDdgUrl(m[1]), snippet: stripHtml(m[3]).slice(0, 280) }))
      }
    }
    if (!items.length) return { text: `联网搜索「${q}」暂未返回结果，可能是网络受限或该搜索引擎暂无索引。`, sources: [] }
    const list = items.map((it, i) => `${i + 1}. ${it.title}\n   ${it.url}\n   ${it.snippet}`).join('\n\n')
    return {
      text: `联网搜索「${q}」结果（共 ${items.length} 条，来自网络）：\n${list}\n\n请基于以上资料回答，并尽量标注信息来源。`,
      sources: items,
    }
  } catch (e: any) {
    return { text: `联网搜索「${q}」失败：${e?.message || '未知错误'}`, sources: [] }
  }
}

function stripHtml(s: string): string {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function decodeDdgUrl(href: string): string {
  const m = String(href).match(/[?&]uddg=([^&]+)/)
  if (m) { try { return decodeURIComponent(m[1]) } catch {} }
  if (href.startsWith('//')) return 'https:' + href
  if (href.startsWith('/')) return 'https://html.duckduckgo.com' + href
  return href
}

// AI 完全不可用时的极小兜底：仅保证"切换主题 / 跳转页面"这两个纯前端动作仍可用。
function chatSafetyFallback(message: string): { reply: string; refresh: boolean; action: any } | null {
  const m = message.toLowerCase()
  if (/(暗色|深色|黑暗|dark)/.test(m)) return { reply: '已切换到暗色模式', refresh: false, action: { type: 'theme', payload: 'dark' } }
  if (/(亮色|浅色|明亮|light)/.test(m)) return { reply: '已切换到亮色模式', refresh: false, action: { type: 'theme', payload: 'light' } }
  if (/(系统模式|跟随系统|system)/.test(m)) return { reply: '已切换为跟随系统', refresh: false, action: { type: 'theme', payload: 'system' } }
  const nav: [RegExp, string, string][] = [
    [/去.*分析|打开分析|分析页/, '/analysis', '分析页'],
    [/去.*笔记|打开笔记|笔记页/, '/notes', '笔记'],
    [/去.*知识|打开知识|知识库/, '/knowledge', '知识库'],
    [/去.*任务|打开任务|待办/, '/tasks', '任务'],
    [/去.*工具|打开工具|决策/, '/tools', '工具'],
    [/去.*搜索|打开搜/, '/search', '搜索'],
    [/去.*设置|打开设置/, '/settings', '设置'],
    [/去.*首页|回首页|仪表盘/, '/', '首页'],
  ]
  for (const [re, path, name] of nav) {
    if (re.test(message)) return { reply: `正在前往${name}…`, refresh: false, action: { type: 'navigate', payload: path } }
  }
  return null
}

interface ChatResult {
  content: string | null
  toolCalls: { name: string; args: any; id?: string }[] | null
  // 思考型模型（MiMo/DeepSeek-R1 等）的思考链。MiMo 要求多轮工具调用时
  // assistant 消息必须完整回传 reasoning_content，否则 API 返回 400。
  reasoning?: string
}

// 统一入口：根据配置走 OpenAI 兼容（支持流式 + 工具）或 Cloudflare（工具 + 非流式）
async function chatCompletion(
  c: Context<{ Bindings: Env }>,
  messages: any[],
  opts: { tools?: any[]; stream?: boolean; onText?: (t: string) => void; onReasoning?: (t: string) => void; images?: string[]; deepThink?: boolean }
): Promise<ChatResult> {
  const cfg = await getActiveConfig(c.env)
  // 未配置任何 AI 时，回退到 Cloudflare 默认模型（如 qwen 72b），保证开箱可用
  if (!cfg) return chatCompletionCF(c, { model: CF_MODELS.DEFAULT }, messages, opts)
  if (cfg.type === 'openai') return chatCompletionOpenAI(cfg, messages, opts)
  return chatCompletionCF(c, cfg, messages, opts)
}

async function chatCompletionOpenAI(
  cfg: { baseUrl: string; apiKey: string; model: string },
  messages: any[],
  opts: { tools?: any[]; stream?: boolean; onText?: (t: string) => void; onReasoning?: (t: string) => void; images?: string[]; deepThink?: boolean }
): Promise<ChatResult> {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`
  const body: any = { model: cfg.model || 'gpt-4o', messages, temperature: 0.7 }
  // 深度思考 API 级开关：思考型模型（MiMo 等）默认恒开思考，必须显式 disabled 才能关；
  // 开关跟随用户的「深度思考」按钮。不支持 thinking 参数的提供商会忽略未知字段（MiMo 家族确认支持）。
  const isMimo = /xiaomimimo\.com/i.test(cfg.baseUrl)
  if (isMimo) body.thinking = { type: opts.deepThink ? 'enabled' : 'disabled' }
  // 多模态：把图片作为 image_url 内容附加到最后一条用户消息
  if (opts.images && opts.images.length) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        messages[i] = {
          ...messages[i],
          content: [
            { type: 'text', text: typeof messages[i].content === 'string' ? messages[i].content : '' },
            ...opts.images.slice(0, 4).map((u) => ({ type: 'image_url', image_url: { url: u } })),
          ],
        }
        break
      }
    }
  }
  if (opts.tools && opts.tools.length) { body.tools = opts.tools; body.tool_choice = 'auto' }
  if (opts.stream) body.stream = true

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`AI 请求失败 (HTTP ${res.status}): ${txt.slice(0, 200)}`)
  }

  if (opts.stream && res.body) {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let content = ''
    let reasoning = ''
    let sawTool = false
    const toolAcc: any[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop() || ''
      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const json = JSON.parse(data)
          const delta = json.choices?.[0]?.delta
          if (!delta) continue
          // 捕获推理模型的思考链（reasoning_content / reasoning 字段）
          if (delta.reasoning_content || delta.reasoning) {
            const rt = delta.reasoning_content || delta.reasoning
            reasoning += rt
            opts.onReasoning?.(rt)
          }
          if (delta.tool_calls) {
            sawTool = true
            for (const tc of delta.tool_calls) {
              const i = tc.index ?? toolAcc.length
              toolAcc[i] = toolAcc[i] || { id: '', name: '', args: '' }
              if (tc.id) toolAcc[i].id = tc.id
              if (tc.function?.name) toolAcc[i].name += tc.function.name
              if (tc.function?.arguments) toolAcc[i].args += tc.function.arguments
            }
          }
          if (delta.content && !sawTool) { content += delta.content; opts.onText?.(delta.content) }
        } catch {}
      }
    }
    if (sawTool) {
      const toolCalls = toolAcc.filter(Boolean).map((t) => ({ id: t.id || undefined, name: t.name, args: safeParseJson(t.args) })).filter((t: any) => t.name)
      return { content: null, toolCalls: toolCalls.length ? toolCalls : null, reasoning: reasoning || undefined }
    }
    return { content: content || null, toolCalls: null, reasoning: reasoning || undefined }
  }

  const data = await res.json() as any
  const msg = data.choices?.[0]?.message
  const toolCalls = (msg?.tool_calls || []).map((tc: any) => ({ id: tc.id || undefined, name: tc.function?.name, args: safeParseJson(tc.function?.arguments || '{}') })).filter((t: any) => t.name)
  return { content: msg?.content || null, toolCalls: toolCalls.length ? toolCalls : null, reasoning: msg?.reasoning_content || msg?.reasoning || undefined }
}

async function chatCompletionCF(
  c: Context<{ Bindings: Env }>,
  cfg: { model: string },
  messages: any[],
  opts: { tools?: any[]; images?: string[] }
): Promise<ChatResult> {
  const model = cfg.model || CF_MODELS.DEFAULT
  const body: any = { messages }
  if (opts.tools && opts.tools.length) body.tools = opts.tools
  const parse = (response: any): ChatResult => {
    const r = response as any
    const msg = r?.response?.choices?.[0]?.message ?? r?.choices?.[0]?.message ?? r?.message
    if (msg) {
      const content = msg.content ?? null
      const toolCalls = (msg.tool_calls || []).map((tc: any) => ({ name: tc.function?.name, args: safeParseJson(tc.function?.arguments || '{}') })).filter((t: any) => t.name)
      return { content, toolCalls: toolCalls.length ? toolCalls : null }
    }
    if (typeof r === 'string') return { content: r, toolCalls: null }
    return { content: r?.response?.response || r?.result?.response || r?.output || null, toolCalls: null }
  }
  try {
    return parse(await c.env.AI.run(model, body))
  } catch (e: any) {
    const detail = (e?.message || '').toLowerCase()
    const unavailable = /not found|not available|does not exist|unknown model|invalid model|not supported|503|504/.test(detail)
    if (unavailable && model !== CF_MODELS.FALLBACK) return parse(await c.env.AI.run(CF_MODELS.FALLBACK, body))
    throw new Error('AI 调用失败，请检查 AI 配置或稍后重试')
  }
}

async function resolveChatSession(db: any, sessionId: string | null, firstMessage: string): Promise<{ id: string }> {
  if (sessionId) {
    const existing = await db.select({ id: schema.chatSessions.id }).from(schema.chatSessions).where(eq(schema.chatSessions.id, sessionId)).limit(1)
    if (existing.length) return { id: existing[0].id }
  }
  const id = crypto.randomUUID()
  const title = firstMessage.length > 30 ? firstMessage.slice(0, 30) + '…' : (firstMessage || '新对话')
  await db.insert(schema.chatSessions).values({ id, title })
  return { id }
}

async function loadChatHistory(db: any, sessionId: string, limit = 16): Promise<{ role: string; content: string }[]> {
  const rows = await db.select({ role: schema.chatMessages.role, content: schema.chatMessages.content })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.sessionId, sessionId))
    .orderBy(asc(schema.chatMessages.createdAt))
    .limit(limit)
  return rows.map((r: any) => ({ role: r.role, content: r.content }))
}

async function insertChatMessage(db: any, sessionId: string, role: string, content: string, toolCalls: any[] | null): Promise<void> {
  await db.insert(schema.chatMessages).values({
    id: crypto.randomUUID(),
    sessionId,
    role,
    content,
    toolCalls: toolCalls && toolCalls.length ? JSON.stringify(toolCalls) : null,
  })
  await db.update(schema.chatSessions).set({ updatedAt: nowBeijing() }).where(eq(schema.chatSessions.id, sessionId)).catch(() => {})
}

// 粗略估算文本 token 数（CJK 混合文本约 2.5 字符/token，纯英文约 4 字符/token）
function estimateTokens(text: string): number {
  if (!text) return 0
  const len = text.length
  // 检测中文字符占比
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  const ratio = cjk / len
  // CJK 越多每字符 token 越少（分词更细）；英文越多每字符 token 越少（词级）
  return Math.ceil(len * (1.8 + ratio * 0.8) / 2.5)
}

// 按 token 预算截断聊天历史：保留最新消息，丢弃最老的；至少保留最近 4 条
function truncateHistory(history: { role: string; content: string }[], maxTokens: number): { role: string; content: string }[] {
  if (!history || history.length <= 4) return history
  // 从新到旧计算累积 token，找到截断点
  let total = 0
  const keepFromRight: number[] = []
  for (let i = history.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(history[i].content) + 4 // +4 for role/formatting overhead
    if (total + msgTokens > maxTokens && history.length - i > 4) break // 至少保留 4 条
    total += msgTokens
    keepFromRight.unshift(i)
  }
  return keepFromRight.map((idx) => history[idx])
}

// 核心：纯流式对话 + 持久化（无工具调用）
async function streamChat(
  c: Context<{ Bindings: Env }>,
  db: any,
  opts: { message: string; sessionId: string; history: { role: string; content: string }[]; ctx: ChatCtx; send: (o: any) => void; deepThink?: boolean; systemPrompt?: string; role?: string; images?: string[] }
): Promise<void> {
  const { message, sessionId, history, ctx, send, deepThink, systemPrompt, role, images } = opts
  await insertChatMessage(db, sessionId, 'user', message, null)

  const system = buildChatSystem(ctx, { systemPrompt, role })
  const trimmedHistory = truncateHistory(history, 4000)
  const messages: any[] = [{ role: 'system', content: system }]
  for (const h of trimmedHistory) {
    if (h.role === 'user') messages.push({ role: 'user', content: h.content })
    else if (h.role === 'assistant') messages.push({ role: 'assistant', content: h.content || ' ' })
  }
  // 深度思考提示附加到当前消息尾部
  const hints: string[] = []
  if (deepThink) hints.push('用户已开启「深度思考」，请先分步推理再作答，复杂问题要拆解方案并权衡。')
  messages.push({ role: 'user', content: hints.length ? `${message}\n\n（系统提示：${hints.join('')}）` : message })

  let finalReply = ''

  try {
    const result = await chatCompletion(c, messages, { stream: true, deepThink, images, onText: (t) => send({ type: 'delta', text: t }), onReasoning: (t) => send({ type: 'reasoning', text: t }) })
    finalReply = result.content?.trim() || '好的。'
  } catch (e: any) {
    const fb = chatSafetyFallback(message)
    if (fb) {
      finalReply = fb.reply
      await insertChatMessage(db, sessionId, 'assistant', finalReply, null)
      send({ type: 'done', reply: finalReply, refresh: false, action: fb.action, sessionId })
      return
    }
    finalReply = 'AI 暂时不可用，请稍后再试。'
  }

  await insertChatMessage(db, sessionId, 'assistant', finalReply, null)
  send({ type: 'done', reply: finalReply, refresh: false, action: null, sessionId })
}

// ============ AI 聊天：历史记录接口 ============
app.get('/api/ai/chat/sessions', async (c) => {
  try {
    await ensureChatTables(c.env.DB)
    const db = drizzle(c.env.DB, { schema })
    const sessions = await db.select({
      id: schema.chatSessions.id,
      title: schema.chatSessions.title,
      updatedAt: schema.chatSessions.updatedAt,
      pinned: schema.chatSessions.pinned,
      tags: schema.chatSessions.tags,
    }).from(schema.chatSessions).orderBy(desc(schema.chatSessions.pinned), desc(schema.chatSessions.updatedAt)).limit(50)
    const withPreview = await Promise.all(sessions.map(async (s: any) => {
      const last = await db.select({ content: schema.chatMessages.content }).from(schema.chatMessages)
        .where(eq(schema.chatMessages.sessionId, s.id)).orderBy(desc(schema.chatMessages.createdAt)).limit(1)
      let tags: string[] = []
      try { tags = s.tags ? JSON.parse(s.tags) : [] } catch { tags = [] }
      return { id: s.id, title: s.title, updatedAt: s.updatedAt, preview: last[0]?.content || '', pinned: s.pinned ? 1 : 0, tags }
    }))
    return c.json(withPreview)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/ai/chat/sessions/:id', async (c) => {
  try {
    await ensureChatTables(c.env.DB)
    const db = drizzle(c.env.DB, { schema })
    const id = c.req.param('id')
    const msgs = await db.select({
      role: schema.chatMessages.role, content: schema.chatMessages.content,
      toolCalls: schema.chatMessages.toolCalls, createdAt: schema.chatMessages.createdAt,
    }).from(schema.chatMessages).where(eq(schema.chatMessages.sessionId, id)).orderBy(asc(schema.chatMessages.createdAt))
    const session = await db.select({ id: schema.chatSessions.id, title: schema.chatSessions.title })
      .from(schema.chatSessions).where(eq(schema.chatSessions.id, id)).limit(1)
    return c.json({ session: session[0] || null, messages: msgs })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

app.delete('/api/ai/chat/sessions/:id', async (c) => {
  try {
    await ensureChatTables(c.env.DB)
    const db = drizzle(c.env.DB, { schema })
    const id = c.req.param('id')
    await db.delete(schema.chatMessages).where(eq(schema.chatMessages.sessionId, id))
    await db.delete(schema.chatSessions).where(eq(schema.chatSessions.id, id))
    return c.json({ ok: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// 更新会话：标题 / 标签 / 置顶（固定到顶部）
app.patch('/api/ai/chat/sessions/:id', async (c) => {
  try {
    await ensureChatTables(c.env.DB)
    const db = drizzle(c.env.DB, { schema })
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => ({}))
    const patch: any = {}
    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 80)
    if (Array.isArray(body.tags)) {
      patch.tags = JSON.stringify(body.tags.filter((t: any) => typeof t === 'string').map((t: string) => t.trim()).filter(Boolean).slice(0, 10))
    }
    if (typeof body.pinned === 'boolean' || typeof body.pinned === 'number') patch.pinned = body.pinned ? 1 : 0
    if (Object.keys(patch).length === 0) return c.json({ error: '无可更新字段' }, 400)
    patch.updatedAt = nowBeijing()
    await db.update(schema.chatSessions).set(patch).where(eq(schema.chatSessions.id, id))
    return c.json({ ok: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

async function executeChatTool(
  c: Context<{ Bindings: Env }>,
  db: any,
  name: string,
  args: any,
  ctx: ChatCtx
): Promise<{ observation: string; refresh: boolean; action?: any; sources?: { title: string; url: string; snippet: string }[] }> {
  const str = (v: any) => (v == null ? '' : String(v)).trim()
  const bool = (v: any) => v === true || v === 'true' || v === 1 || v === '1'
  // 多态工具（task/note/... + action）解析为旧粒度名，case 内部的 name 比较同样生效
  name = resolveChatTool(name, args)

  switch (name) {
    case 'create_task': {
      const title = str(args.title)
      if (!title) return { observation: 'create_task 缺少 title，未创建', refresh: false }
      let listId: string | null = null
      const wantName = args.listName ? str(args.listName) : null
      if (wantName) {
        const hit = ctx.lists.find((l) => l.name === wantName)
          || ctx.lists.find((l) => wantName.includes(l.name) || l.name.includes(wantName))
        listId = hit?.id ?? null
      }
      if (!listId && !wantName && ctx.lists.length) listId = ctx.lists[0].id
      let createdList = ''
      if (!listId) {
        const id = crypto.randomUUID()
        await db.insert(schema.taskLists).values({ id, name: wantName || '默认', color: '#2563EB', sortOrder: 0, isSystem: false })
        listId = id
        createdList = `（新建列表「${wantName || '默认'}」）`
      }
      const dueDate = normalizeDate(args.dueDate || null)
      const id = crypto.randomUUID()
      const existing = await db.select({ s: schema.tasks.sortOrder }).from(schema.tasks).where(eq(schema.tasks.listId, listId))
      const sort = existing.reduce((m: number, t: any) => Math.max(m, t.s ?? 0), 0) + 1
      await db.insert(schema.tasks).values({
        id,
        listId,
        title,
        note: args.note ? str(args.note) : '',
        isCompleted: false,
        isImportant: bool(args.isImportant),
        isMyDay: bool(args.isMyDay),
        myDayDate: bool(args.isMyDay) ? ctx.today : null,
        dueDate: dueDate ?? null,
        reminder: args.reminder ? str(args.reminder) : null,
        sortOrder: sort,
      })
      await indexTarget(c, 'task', id, `${title}\n${args.note || ''}`).catch(() => {})
      const parts = [dueDate ? `截止 ${dueDate}` : '', bool(args.isImportant) ? '已标重要' : '', bool(args.isMyDay) ? '已加入我的一天' : ''].filter(Boolean)
      return { observation: `已创建任务「${title}」${createdList}${parts.length ? `（${parts.join('、')}）` : ''}`, refresh: true }
    }

    case 'search_tasks': {
      const q = str(args.query)
      const includeCompleted = bool(args.includeCompleted)
      const rows = await db.select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        dueDate: schema.tasks.dueDate,
        isImportant: schema.tasks.isImportant,
        isCompleted: schema.tasks.isCompleted,
      }).from(schema.tasks)
        .where(includeCompleted ? isNull(schema.tasks.msTodoDeletedAt) : and(eq(schema.tasks.isCompleted, false), isNull(schema.tasks.msTodoDeletedAt)))
        .orderBy(desc(schema.tasks.updatedAt)).limit(120)
      const norm = normalizeSearchText(q)
      const terms = norm.split(/\s+/).filter((t: string) => t.length >= 1)
      const matched = rows.filter((r: any) => {
        const t = r.title.toLowerCase()
        return terms.some((term: string) => t.includes(term)) || t.includes(norm)
      }).slice(0, 10)
      if (!matched.length) return { observation: `未找到与「${q}」相关的任务`, refresh: false }
      const list = matched.map((m: any, i: number) =>
        `${i + 1}. id=${m.id} 标题=${m.title}${m.dueDate ? ` 截止=${m.dueDate}` : ''}${m.isImportant ? ' [重要]' : ''}${m.isCompleted ? ' [已完成]' : ''}`
      ).join('\n')
      return { observation: `匹配到 ${matched.length} 个任务：\n${list}`, refresh: false }
    }

    case 'complete_task':
    case 'delete_task':
    case 'update_task': {
      const id = await resolveTaskId(db, args)
      if (!id) return { observation: `没找到要操作的任务（${args.keyword || args.id || '无关键词'}）`, refresh: false }
      const cur = await db.select({ title: schema.tasks.title }).from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1)
      const title = cur[0]?.title ?? '任务'
      if (name === 'complete_task') {
        await db.update(schema.tasks).set({ isCompleted: true, updatedAt: nowBeijing() }).where(eq(schema.tasks.id, id))
        await db.update(schema.subtasks).set({ isCompleted: true }).where(eq(schema.subtasks.taskId, id)).catch(() => {})
        return { observation: `已标记完成：${title}`, refresh: true }
      }
      if (name === 'delete_task') {
        await db.delete(schema.tasks).where(eq(schema.tasks.id, id)).catch(() => {})
        return { observation: `已删除：${title}`, refresh: true }
      }
      const set: any = { updatedAt: nowBeijing() }
      if (args.title != null) set.title = str(args.title)
      if (args.note != null) set.note = str(args.note)
      if (args.dueDate != null) set.dueDate = normalizeDate(args.dueDate) ?? null
      if (args.reminder != null) set.reminder = str(args.reminder)
      if (args.isImportant != null) set.isImportant = bool(args.isImportant)
      if (args.isMyDay != null) set.isMyDay = bool(args.isMyDay)
      await db.update(schema.tasks).set(set).where(eq(schema.tasks.id, id))
      return { observation: `已更新：${title}`, refresh: true }
    }

    case 'get_overview': {
      const listCounts = ctx.lists.map((l) => {
        const n = ctx.pendingTasks.filter((t: any) => t.listId === l.id).length
        return `${l.name}:${n}`
      }).join('、')
      const upcoming = ctx.pendingTasks
        .filter((t: any) => t.dueDate)
        .sort((a: any, b: any) => String(a.dueDate).localeCompare(String(b.dueDate)))
        .slice(0, 5)
        .map((t: any) => `${t.title}(${t.dueDate})`)
        .join('、') || '无'
      const obs = `系统概览：未完成任务 ${ctx.pendingTasks.length} 个；今日已完成 ${ctx.completedToday} 个；逾期 ${ctx.overdueCount} 个；我的一天 ${ctx.pendingTasks.filter((t: any) => t.isMyDay).length} 个；即将到期 ${upcoming}；各列表未完成任务数 ${listCounts || '无'}。`
      return { observation: obs, refresh: false }
    }

    case 'add_note': {
      const title = str(args.title) || '来自助手'
      const content = str(args.content)
      if (!content && !title) return { observation: 'add_note 缺少内容', refresh: false }
      const id = crypto.randomUUID()
      await db.insert(schema.imaNotes).values({ id, title, content }).catch(() => {})
      await indexTarget(c, 'note', id, `${title}\n${content}`).catch(() => {})
      return { observation: `已保存笔记：${title}`, refresh: false, action: { type: 'navigate', payload: '/notes' } }
    }

    case 'search_notes': {
      const q = str(args.query)
      const rows = await db.select({ id: schema.imaNotes.id, title: schema.imaNotes.title, content: schema.imaNotes.content })
        .from(schema.imaNotes).limit(60)
      const norm = normalizeSearchText(q)
      const matched = rows.filter((r: any) => normalizeSearchText(r.title).includes(norm) || normalizeSearchText(r.content).includes(norm)).slice(0, 5)
      if (!matched.length) return { observation: `未找到与「${q}」相关的笔记`, refresh: false }
      const list = matched.map((m: any) => `· ${m.title}：${(m.content || '').slice(0, 80)}`).join('\n')
      return { observation: `匹配到 ${matched.length} 条笔记：\n${list}`, refresh: false }
    }

    case 'set_theme': {
      const v = ['light', 'dark', 'system'].includes(args.value) ? args.value : 'system'
      return { observation: `已切换主题：${v}`, refresh: false, action: { type: 'theme', payload: v } }
    }

    case 'navigate': {
      const path = str(args.path) || '/'
      return { observation: `正在前往 ${path}`, refresh: false, action: { type: 'navigate', payload: path } }
    }

    case 'get_ai_config': {
      const all = await listAiConfigs(c.env)
      const active = all.find((a) => a.isDefault) || all[0]
      const obs = active
        ? `当前生效的 AI 配置：${active.name}（类型=${active.type}${active.baseUrl ? ` 接口=${active.baseUrl}` : ''} 模型=${active.model || '默认'} Key已设置=${active.apiKeySet}）`
        : '当前使用 Cloudflare 默认内置模型（未单独配置）。'
      return { observation: obs, refresh: false }
    }

    case 'update_ai_config': {
      const name = str(args.name)
      const type = args.type === 'cloudflare' ? 'cloudflare' : 'openai'
      if (!name) return { observation: 'update_ai_config 缺少 name', refresh: false }
      if (type === 'openai' && !args.baseUrl) {
        return { observation: 'OpenAI 类型需要提供 baseUrl（如 https://api.deepseek.com/v1）', refresh: false }
      }
      const dbx = drizzle(c.env.DB, { schema })
      await ensureAiConfigsTable(c.env.DB)
      const existing = await dbx.select().from(schema.aiConfigs).where(eq(schema.aiConfigs.name, name)).limit(1)
      const setDefault = args.setDefault === undefined ? true : bool(args.setDefault)
      const rawKey = args.apiKey ? String(args.apiKey).trim() : ''
      let id: string
      if (existing.length) {
        id = existing[0].id
        const patch: any = { name, type }
        if (type === 'openai') patch.baseUrl = str(args.baseUrl)
        patch.model = str(args.model) || (type === 'cloudflare' ? CF_MODELS.DEFAULT : 'gpt-4o')
        if (rawKey) patch.apiKey = rawKey
        await updateAiConfig(c.env, id, patch)
      } else {
        id = await createAiConfig(c.env, {
          name,
          type,
          baseUrl: type === 'openai' ? str(args.baseUrl) : undefined,
          apiKey: rawKey || undefined,
          model: str(args.model) || (type === 'cloudflare' ? CF_MODELS.DEFAULT : undefined),
          isDefault: setDefault,
        })
      }
      if (setDefault) await setDefaultAiConfig(c.env, id).catch(() => {})
      const okKey = rawKey ? '，API Key 已保存' : ''
      return {
        observation: `已保存 AI 配置「${name}」（类型=${type}${type === 'openai' ? ` 接口=${str(args.baseUrl)}` : ''} 模型=${str(args.model) || '默认'}${okKey}），并已设为默认生效。`,
        refresh: false,
      }
    }

    case 'create_task_list': {
      const name = str(args.name)
      if (!name) return { observation: 'create_task_list 缺少 name', refresh: false }
      const existing = await db.select({ sortOrder: schema.taskLists.sortOrder }).from(schema.taskLists)
      const maxSort = existing.reduce((m: number, l: any) => Math.max(m, l.sortOrder ?? 0), 0)
      const id = crypto.randomUUID()
      await db.insert(schema.taskLists).values({ id, name, color: args.color ? str(args.color) : '#2563EB', sortOrder: maxSort + 1, isSystem: false })
      return { observation: `已新建任务列表「${name}」`, refresh: true }
    }

    case 'update_task_list': {
      const listId = await resolveListId(db, args)
      if (!listId) return { observation: `没找到要修改的列表（${args.keyword || args.listId || '无关键词'}）`, refresh: false }
      const patch: any = { updatedAt: nowBeijing() }
      if (args.name != null) patch.name = str(args.name)
      if (args.color != null) patch.color = str(args.color)
      await db.update(schema.taskLists).set(patch).where(eq(schema.taskLists.id, listId))
      const cur = await db.select({ name: schema.taskLists.name }).from(schema.taskLists).where(eq(schema.taskLists.id, listId)).limit(1)
      return { observation: `已更新列表：${cur[0]?.name ?? ''}`, refresh: true }
    }

    case 'delete_task_list': {
      const listId = await resolveListId(db, args)
      if (!listId) return { observation: `没找到要删除的列表（${args.keyword || args.listId || '无关键词'}）`, refresh: false }
      const cur = await db.select({ name: schema.taskLists.name }).from(schema.taskLists).where(eq(schema.taskLists.id, listId)).limit(1)
      await db.delete(schema.tasks).where(eq(schema.tasks.listId, listId)).catch(() => {})
      await db.delete(schema.taskLists).where(eq(schema.taskLists.id, listId))
      return { observation: `已删除列表「${cur[0]?.name ?? ''}」及其下任务`, refresh: true }
    }

    case 'create_subtask': {
      const taskId = args.taskId ? String(args.taskId) : (args.taskKeyword ? await resolveTaskId(db, { keyword: str(args.taskKeyword) }) : null)
      if (!taskId) return { observation: `没找到要添加子任务的任务（${args.taskKeyword || args.taskId || '无关键词'}）`, refresh: false }
      const title = str(args.title)
      if (!title) return { observation: 'create_subtask 缺少 title', refresh: false }
      const existing = await db.select({ sortOrder: schema.subtasks.sortOrder }).from(schema.subtasks).where(eq(schema.subtasks.taskId, taskId))
      const maxSort = existing.reduce((m: number, s: any) => Math.max(m, s.sortOrder ?? 0), 0)
      const id = crypto.randomUUID()
      await db.insert(schema.subtasks).values({ id, taskId, title, isCompleted: false, sortOrder: maxSort + 1, createdAt: nowBeijing() })
      await indexTarget(c, 'subtask', id, title).catch(() => {})
      return { observation: `已为任务添加子任务「${title}」`, refresh: true }
    }

    case 'toggle_subtask': {
      let id: string | null = args.subtaskId ? String(args.subtaskId) : null
      if (!id && (args.taskKeyword || args.title)) {
        const taskId = args.taskKeyword ? await resolveTaskId(db, { keyword: str(args.taskKeyword) }) : null
        if (taskId) {
          const subs = await db.select({ id: schema.subtasks.id, title: schema.subtasks.title }).from(schema.subtasks).where(eq(schema.subtasks.taskId, taskId))
          const kw = str(args.title)
          id = subs.find((s: any) => s.title.includes(kw) || normalizeSearchText(s.title).includes(normalizeSearchText(kw)))?.id ?? null
        }
      }
      if (!id) return { observation: `没找到要操作的子任务（${args.taskKeyword || args.title || args.subtaskId || '无关键词'}）`, refresh: false }
      const existing = await db.select({ isCompleted: schema.subtasks.isCompleted }).from(schema.subtasks).where(eq(schema.subtasks.id, id)).limit(1)
      if (!existing.length) return { observation: '子任务不存在', refresh: false }
      const next = args.complete !== undefined ? bool(args.complete) : !existing[0].isCompleted
      await db.update(schema.subtasks).set({ isCompleted: next }).where(eq(schema.subtasks.id, id))
      const sub = await db.select({ taskId: schema.subtasks.taskId }).from(schema.subtasks).where(eq(schema.subtasks.id, id)).limit(1)
      if (sub[0]) await syncParentCompletion(db, sub[0].taskId).catch(() => {})
      return { observation: next ? '已勾选子任务' : '已取消勾选子任务', refresh: true }
    }

    case 'delete_subtask': {
      let id: string | null = args.subtaskId ? String(args.subtaskId) : null
      if (!id && (args.taskKeyword || args.title)) {
        const taskId = args.taskKeyword ? await resolveTaskId(db, { keyword: str(args.taskKeyword) }) : null
        if (taskId) {
          const subs = await db.select({ id: schema.subtasks.id, title: schema.subtasks.title }).from(schema.subtasks).where(eq(schema.subtasks.taskId, taskId))
          const kw = str(args.title)
          id = subs.find((s: any) => s.title.includes(kw))?.id ?? null
        }
      }
      if (!id) return { observation: `没找到要删除的子任务`, refresh: false }
      await db.delete(schema.subtasks).where(eq(schema.subtasks.id, id))
      await indexTarget(c, 'subtask', id, '').catch(() => {})
      return { observation: '已删除子任务', refresh: true }
    }

    case 'update_note': {
      let id: string | null = args.noteId ? String(args.noteId) : null
      if (!id && args.keyword) {
        const rows = await db.select({ id: schema.imaNotes.id, title: schema.imaNotes.title }).from(schema.imaNotes).limit(100)
        const norm = normalizeSearchText(str(args.keyword))
        id = rows.find((r: any) => normalizeSearchText(r.title).includes(norm) || r.title.includes(str(args.keyword)))?.id ?? null
      }
      if (!id) return { observation: `没找到要修改的笔记（${args.keyword || args.noteId || '无关键词'}）`, refresh: false }
      const patch: any = { updatedAt: nowBeijing() }
      if (args.title != null) patch.title = str(args.title)
      if (args.content != null) patch.content = str(args.content)
      await db.update(schema.imaNotes).set(patch).where(eq(schema.imaNotes.id, id))
      await indexTarget(c, 'note', id, `${str(args.title)}\n${str(args.content)}`).catch(() => {})
      return { observation: `已更新笔记：${str(args.title) || '（内容已改）'}`, refresh: true }
    }

    case 'delete_note': {
      let id: string | null = args.noteId ? String(args.noteId) : null
      if (!id && args.keyword) {
        const rows = await db.select({ id: schema.imaNotes.id, title: schema.imaNotes.title }).from(schema.imaNotes).limit(100)
        const norm = normalizeSearchText(str(args.keyword))
        id = rows.find((r: any) => normalizeSearchText(r.title).includes(norm) || r.title.includes(str(args.keyword)))?.id ?? null
      }
      if (!id) return { observation: `没找到要删除的笔记（${args.keyword || args.noteId || '无关键词'}）`, refresh: false }
      await db.delete(schema.imaNotes).where(eq(schema.imaNotes.id, id))
      await indexTarget(c, 'note', id, '').catch(() => {})
      return { observation: '已删除笔记', refresh: true }
    }

    case 'search_knowledge': {
      const q = str(args.query)
      if (!q) return { observation: 'search_knowledge 缺少 query', refresh: false }
      const rows = await db.select({ id: schema.kbDocuments.id, title: schema.kbDocuments.title, content: schema.kbDocuments.content }).from(schema.kbDocuments).limit(100)
      const norm = normalizeSearchText(q)
      const matched = rows.filter((r: any) => normalizeSearchText(r.title).includes(norm) || normalizeSearchText(r.content || '').includes(norm)).slice(0, 5)
      if (!matched.length) return { observation: `知识库里没找到与「${q}」相关的资料`, refresh: false }
      const list = matched.map((m: any) => `· ${m.title}：${(m.content || '').slice(0, 120).replace(/\n/g, ' ')}`).join('\n')
      return { observation: `知识库匹配到 ${matched.length} 篇：\n${list}`, refresh: false }
    }

    case 'summarize_knowledge': {
      const doc = await resolveKbDoc(db, args)
      if (!doc) return { observation: `没找到要总结的文档（${args.keyword || args.docId || '无关键词'}）`, refresh: false }
      const content = (doc.content || '').slice(0, 8000)
      if (!content.trim()) return { observation: `《${doc.title}》暂无可用正文，无法总结`, refresh: false }
      try {
        const summary = await callAI(c, [
          { role: 'system', content: '你是文档总结助手。用 3 句话以内总结以下文档的核心内容，中文输出，不要分段。' },
          { role: 'user', content: `文档标题：${doc.title}\n\n${content}` },
        ], { maxTokens: 400 })
        return { observation: `《${doc.title}》摘要：${summary.trim()}`, refresh: false }
      } catch (e: any) {
        return { observation: `《${doc.title}》开头：${(doc.content || '').slice(0, 200)}`, refresh: false }
      }
    }

    case 'ask_knowledge': {
      const doc = await resolveKbDoc(db, args)
      if (!doc) return { observation: `没找到要提问的文档（${args.keyword || args.docId || '无关键词'}）`, refresh: false }
      const content = (doc.content || '').slice(0, 6000)
      if (!content.trim()) return { observation: `《${doc.title}》暂无可用正文，无法问答`, refresh: false }
      try {
        const answer = await callAI(c, [
          { role: 'system', content: '你是文档问答助手。请严格基于以下文档内容回答问题，如果文档中没有相关信息，请明确说明。' },
          { role: 'user', content: `文档标题：${doc.title}\n\n文档内容：\n${content}\n\n问题：${str(args.question)}` },
        ], { maxTokens: 500 })
        return { observation: `关于《${doc.title}》：${answer.trim()}`, refresh: false }
      } catch (e: any) {
        return { observation: '调用 AI 总结/问答失败，请检查 AI 配置。', refresh: false }
      }
    }

    case 'coin_flip': {
      const buf = new Uint8Array(1)
      crypto.getRandomValues(buf)
      const result = buf[0] % 2 === 0 ? '正面' : '反面'
      const q = args.question ? `（问题：${str(args.question)}）` : ''
      return { observation: `🪙 天意硬币结果：${result}${q}`, refresh: false }
    }

    case 'web_search': {
      const q = str(args.query)
      if (!q) return { observation: 'web_search 缺少 query', refresh: false }
      const res = await webSearch(q, c.env)
      return { observation: res.text, refresh: false, sources: res.sources }
    }

    default:
      return { observation: `未知工具：${name}`, refresh: false }
  }
}

// 通过 id 或关键词解析任务 id（在未完成且未删除的任务里模糊匹配）
async function resolveTaskId(db: any, args: any): Promise<string | null> {
  if (args.id) return String(args.id)
  const kw = (args.keyword || '').toString().trim()
  if (!kw) return null
  const rows = await db.select({ id: schema.tasks.id, title: schema.tasks.title })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.isCompleted, false), isNull(schema.tasks.msTodoDeletedAt)))
    .limit(100)
  const norm = normalizeSearchText(kw)
  const hit = rows.find((r: any) => normalizeSearchText(r.title).includes(norm) || r.title.includes(kw))
  return hit?.id ?? null
}

// 通过 id 或关键词解析列表 id
async function resolveListId(db: any, args: any): Promise<string | null> {
  if (args.listId) return String(args.listId)
  const kw = (args.keyword || '').toString().trim()
  if (!kw) return null
  const rows = await db.select({ id: schema.taskLists.id, name: schema.taskLists.name }).from(schema.taskLists).limit(100)
  const norm = normalizeSearchText(kw)
  const hit = rows.find((r: any) => normalizeSearchText(r.name).includes(norm) || r.name.includes(kw))
  return hit?.id ?? null
}

// 通过 id 或关键词解析知识库文档
async function resolveKbDoc(db: any, args: any): Promise<{ id: string; title: string; content: string | null } | null> {
  if (args.docId) {
    const rows = await db.select({ id: schema.kbDocuments.id, title: schema.kbDocuments.title, content: schema.kbDocuments.content })
      .from(schema.kbDocuments).where(eq(schema.kbDocuments.id, String(args.docId))).limit(1)
    return rows[0] ?? null
  }
  const kw = (args.keyword || '').toString().trim()
  if (!kw) return null
  const rows = await db.select({ id: schema.kbDocuments.id, title: schema.kbDocuments.title, content: schema.kbDocuments.content })
    .from(schema.kbDocuments).limit(100)
  const norm = normalizeSearchText(kw)
  const hit = rows.find((r: any) => normalizeSearchText(r.title).includes(norm) || r.title.includes(kw))
  return hit ?? null
}

// 旧 dispatchChatAction 已迁移为工具调用 Agent（见 streamChat / executeChatTool）

// ========== AI 配置（多条目 + 默认）==========

// 列出全部 AI 配置（apiKey 不返回明文，仅标记是否已设置）
app.get('/api/ai-configs', async (c) => {
  try {
    const list = await listAiConfigs(c.env)
    return c.json(list)
  } catch (e: any) {
    console.error('[ai-configs] list failed:', e)
    return c.json({ error: e.message }, 500)
  }
})

// 新增一条 AI 配置
app.post('/api/ai-configs', async (c) => {
  try {
    const body = aiConfigCreateSchema.parse(await c.req.json())
    if (body.type === 'openai' && !body.baseUrl) {
      return c.json({ error: 'OpenAI 类型必须填写 API Base URL' }, 400)
    }
    const id = await createAiConfig(c.env, {
      name: body.name,
      type: body.type,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      model: body.model,
      isDefault: body.isDefault,
    })
    return c.json({ ok: true, id })
  } catch (e: any) {
    console.error('[ai-configs] create failed:', e)
    return c.json({ error: e.message }, 400)
  }
})

// 更新一条 AI 配置
app.put('/api/ai-configs/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = aiConfigUpdateSchema.parse(await c.req.json())
    if (body.type === 'openai' && body.baseUrl === '') {
      return c.json({ error: 'OpenAI 类型必须填写 API Base URL' }, 400)
    }
    await updateAiConfig(c.env, id, body)
    return c.json({ ok: true })
  } catch (e: any) {
    console.error('[ai-configs] update failed:', e)
    return c.json({ error: e.message }, 400)
  }
})

// 删除一条 AI 配置
app.delete('/api/ai-configs/:id', async (c) => {
  try {
    await deleteAiConfig(c.env, c.req.param('id'))
    return c.json({ ok: true })
  } catch (e: any) {
    console.error('[ai-configs] delete failed:', e)
    return c.json({ error: e.message }, 400)
  }
})

// 设为默认配置
app.post('/api/ai-configs/:id/default', async (c) => {
  try {
    await setDefaultAiConfig(c.env, c.req.param('id'))
    return c.json({ ok: true })
  } catch (e: any) {
    console.error('[ai-configs] setDefault failed:', e)
    return c.json({ error: e.message }, 400)
  }
})

// 测试 AI 配置连通性（可传 id 或一次性参数）
app.post('/api/ai-configs/test', async (c) => {
  try {
    const body = aiConfigTestSchema.parse(await c.req.json())
    const result = await testAiConfig(c.env, {
      id: body.id,
      type: body.type,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      model: body.model,
    })
    return c.json(result)
  } catch (e: any) {
    console.error('[ai-configs] test failed:', e)
    return c.json({ ok: false, error: e.message }, 400)
  }
})

// ========== 天意硬币 ==========

app.post('/api/coin/flip', async (c) => {
  const { value: randomValue, source } = await fetchPhysicalEntropy()
  const result = randomValue < 128 ? 'tails' : 'heads'
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()

  // AI 解读
  let interpretation = ''
  try {
    interpretation = await callAI(c, [{
      role: 'system',
      content: `你是天意解读助手。用一句话给出玄学解读，30字以内。`
    }, {
      role: 'user',
      content: `用户抛掷天意硬币得到"${result === 'heads' ? '阳/正面' : '阴/反面'}"，请解读。`
    }])
  } catch (e) { console.error('[coin] AI 解读失败:', e) }

  await db.insert(schema.coinFlips).values({
    id,
    result,
    entropySource: source,
    rawValue: randomValue,
    interpretation,
  })

  return c.json({ result, source, rawValue: randomValue, interpretation })
})

app.get('/api/coin/history', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.coinFlips).orderBy(desc(schema.coinFlips.createdAt))
  return c.json(rows)
})

// ========== 决策小工具：答案之书 & 每日一签 ==========

// 答案之书：64条，取意易经六十四卦与道佛智慧
const ANSWERS = [
  '乾元亨利贞，天行健，去做。',
  '否极泰来，时机将至。',
  '潜龙勿用，再等等。',
  '利见大人，贵人将至。',
  '含章可贞，内敛为上。',
  '括囊无咎，收敛锋芒。',
  '鸣谦贞吉，谦受益。',
  '鸣豫凶，不可沉溺安逸。',
  '观我生进退，审时度势。',
  '不远复，迷途知返。',
  '无妄往吉，无妄之行。',
  '大畜利贞，积蓄力量。',
  '颐贞吉，养正则吉。',
  '大过栋桡，非常之时需非常之策。',
  '习坎有孚，险中求信。',
  '离丽也，附丽正道。',
  '咸感也，以心感应。',
  '恒久也，持之以恒。',
  '遁之时义大矣哉，该退则退。',
  '大壮利贞，壮而守正。',
  '晋明出地上，光明在前。',
  '明夷艰贞，韬光养晦。',
  '家人言有物，言行一致。',
  '睽小事吉，小事可成。',
  '蹇利西南，绕道而行。',
  '解利西南，宽以待人。',
  '损损下益上，有舍才有得。',
  '益益动而巽，日进无疆。',
  '夬扬于王庭，果断宣示。',
  '姤女壮勿用取女，谨慎为上。',
  '萃聚也，团结一心。',
  '升地中生木，循序渐进。',
  '困困而不失其所亨，困境见品格。',
  '井改邑不改井，万变不离其宗。',
  '革汤武革命，顺天应人。',
  '鼎取新也，革故鼎新。',
  '震亨震来虩虩，敬畏则安。',
  '艮其背，止于当止。',
  '渐进以正，循序渐进。',
  '归妹征凶，勿急于求成。',
  '丰宜日中，盛极必衰。',
  '旅琐琐斯其所取灾，谨慎处世。',
  '巽小亨，柔顺通达。',
  '兑说也，和悦为贵。',
  '涣亨，散而复聚。',
  '节亨苦节不可贞，适度为佳。',
  '中孚豚鱼吉，至诚感通。',
  '小过可小事不可大事，小事吉。',
  '既济亨小利贞，初吉终乱。',
  '未济亨小狐汔济，将成未成。',
  '天道亏盈而益谦。',
  '地势坤厚德载物。',
  '山止川行，动静皆宜。',
  '泽中有雷，蓄势待发。',
  '风雷相益，借力而行。',
  '水火既济，阴阳调和。',
  '天地不交否，暂守为宜。',
  '泽火革，除旧布新。',
  '雷风恒，守常应变。',
  '山泽损，减损增益。',
  '风山渐，稳步推进。',
  '火地晋，步步高升。',
  '地山谦，满招损谦受益。',
  '天火同人，志同道合。',
  '火天大有，大有可为。',
]

// 每日一签：64签，仿传统庙签格式
const FORTUNES = [
  { name: '乾卦', level: '大吉', poem: '龙飞九霄云程开，万里鹏程自此来。', interpret: '诸事大吉，主动推进，天时地利人和皆备。' },
  { name: '坤卦', level: '吉', poem: '厚德载物容万物，柔顺利贞行无阻。', interpret: '顺势而为，包容为上，合作比单打独斗更顺。' },
  { name: '屯卦', level: '中吉', poem: '春雷初动万物生，草创之时宜谨慎。', interpret: '万事开头难，坚持则通，勿急勿躁。' },
  { name: '蒙卦', level: '中吉', poem: '山下出泉蒙以养，虚心求教智慧长。', interpret: '放下成见，虚心学习，答案会在求索中浮现。' },
  { name: '需卦', level: '吉', poem: '云上于天需以待，饮食宴乐静心怀。', interpret: '耐心等待，时机未到强求无益，养精蓄锐。' },
  { name: '讼卦', level: '末吉', poem: '天水相违讼端起，宜止争端修内省。', interpret: '避免争论，退一步海阔天空，和解为上。' },
  { name: '师卦', level: '中吉', poem: '地中有水师以律，行师出征需正当。', interpret: '行事有章法，团队协作，以正道服人。' },
  { name: '比卦', level: '吉', poem: '地上有水比相亲，择善而从得助力。', interpret: '贵人运旺，主动结交良友，借力而行。' },
  { name: '小畜', level: '小吉', poem: '风行天上小畜密，积少成多方有成。', interpret: '小事可为，大事需缓，积累实力为要。' },
  { name: '履卦', level: '中吉', poem: '上天下泽履以礼，小心谨慎行坦途。', interpret: '按部就班，守规矩走正路，平安顺遂。' },
  { name: '泰卦', level: '大吉', poem: '天地交泰万物通，否极泰来福运隆。', interpret: '大吉大利，一切通达，把握良机果断行动。' },
  { name: '否卦', level: '末吉', poem: '天地不交否难通，宜守不宜进待转机。', interpret: '暂时蛰伏，不冒险不冲动，静待变化。' },
  { name: '同人', level: '吉', poem: '天火同人志相同，和同于人百事通。', interpret: '志同道合之人将至，合作共贏，团结力量大。' },
  { name: '大有', level: '大吉', poem: '火在天上大有明，自天佑之吉无不利。', interpret: '运势极旺，大有可为，正财正缘皆顺。' },
  { name: '谦卦', level: '吉', poem: '地中有山谦君子，满招损兮谦受益。', interpret: '谦虚低调，越谦越顺，勿张扬勿自满。' },
  { name: '豫卦', level: '中吉', poem: '雷出地奋豫以乐，顺时而动万事和。', interpret: '心态积极，顺势而行，但勿乐极生悲。' },
  { name: '随卦', level: '吉', poem: '泽中有雷随时义，顺天应人随缘去。', interpret: '随缘不随意，顺应大势，灵活应变。' },
  { name: '蛊卦', level: '中吉', poem: '山下有风蛊须治，振弊起衰正当时。', interpret: '旧事需清理，革新除弊，破旧方能立新。' },
  { name: '临卦', level: '大吉', poem: '泽上有地临以近，教思无穷容保民。', interpret: '好运临门，亲近良师益友，受益匪浅。' },
  { name: '观卦', level: '中吉', poem: '风行地上观天道，观我生兮进退明。', interpret: '观察形势再行动，三思而后行，审时度势。' },
  { name: '噬嗑', level: '小吉', poem: '雷电噬嗑合而分，果断决裂去障碍。', interpret: '障碍可除，需果断处理，犹豫反受其害。' },
  { name: '贲卦', level: '小吉', poem: '山下有火贲以文，修饰外表重内涵。', interpret: '外在修饰适度即可，内在充实更为重要。' },
  { name: '剥卦', level: '凶', poem: '山附于地剥将尽，不宜冒进宜守身。', interpret: '运势低迷，不宜进取，固守等待转机。' },
  { name: '复卦', level: '大吉', poem: '雷在地中复亨通，一阳来复万象新。', interpret: '否极泰来，重新开始，一切从头再来吉。' },
  { name: '无妄', level: '吉', poem: '天下雷行无妄动，至诚无妄行正道。', interpret: '不做妄念之事，坦荡行事，天佑善人。' },
  { name: '大畜', level: '吉', poem: '天在山中大畜厚，日新其德蓄光明。', interpret: '积蓄实力，厚积薄发，时机到时一飞冲天。' },
  { name: '颐卦', level: '中吉', poem: '山下有雷颐以养，节饮食慎言语。', interpret: '养身养心，节制为上，祸从口出慎言为佳。' },
  { name: '大过', level: '末吉', poem: '泽灭木兮大过时，独立不惧济危难。', interpret: '非常时期需非常之策，但风险亦大，慎行。' },
  { name: '坎卦', level: '凶', poem: '水流不盈习坎险，心亨行尚守诚信。', interpret: '险阻重重，唯有内心坚定、守信方能脱困。' },
  { name: '离卦', level: '中吉', poem: '明两作离大人继，附丽正道放光明。', interpret: '依附正道，远离邪念，光明在前。' },
  { name: '咸卦', level: '吉', poem: '山泽通气咸感应，以虚受人情意通。', interpret: '人缘极佳，以心换心，感情之事尤为顺遂。' },
  { name: '恒卦', level: '吉', poem: '雷风相与恒久远，守常应变道不穷。', interpret: '持之以恒方能成事，三分钟热度终无果。' },
  { name: '遁卦', level: '末吉', poem: '天下有山遁以远，君子远小人不恶。', interpret: '该退则退，远离是非，保全自身为上。' },
  { name: '大壮', level: '中吉', poem: '雷在天上大壮时，非礼弗履守正直。', interpret: '精力旺盛但需守正，壮而不妄方为真壮。' },
  { name: '晋卦', level: '大吉', poem: '明出地上晋光明，自昭明德日日新。', interpret: '步步高升，前途光明，努力终将被看见。' },
  { name: '明夷', level: '凶', poem: '明入地中明夷暗，内文明而外柔顺。', interpret: '韬光养晦之时，隐忍不发，保存实力。' },
  { name: '家人', level: '吉', poem: '风自火出家人和，言有物而行有恒。', interpret: '家庭和睦，家和万事兴，言行一致为要。' },
  { name: '睽卦', level: '末吉', poem: '上火下泽睽相违，小事可成大事非。', interpret: '意见分歧，求同存异，小事可为大事暂缓。' },
  { name: '蹇卦', level: '凶', poem: '山上有水蹇难行，反身修德待时通。', interpret: '举步维艰，内修己身，静待柳暗花明。' },
  { name: '解卦', level: '吉', poem: '雷雨作解百难消，宽以待人解纷扰。', interpret: '困难已解，宜宽厚待人，化干戈为玉帛。' },
  { name: '损卦', level: '中吉', poem: '山泽损损下益上，损益盈虚随时变。', interpret: '有失必有得，适当损失换取更大收获。' },
  { name: '益卦', level: '大吉', poem: '风雷益益动而巽，自天佑之吉大有。', interpret: '运势上升，助人即助己，善行带来好运。' },
  { name: '夬卦', level: '中吉', poem: '泽上于天夬以决，扬于王庭告四方。', interpret: '果断决策之时，但需公开公正，不可暗行。' },
  { name: '姤卦', level: '末吉', poem: '天下有风姤以遇，勿用取女慎始交。', interpret: '初遇之事需谨慎，不被表象迷惑，深入了解。' },
  { name: '萃卦', level: '吉', poem: '泽上于地萃以聚，团结一心力量聚。', interpret: '人聚财聚，合作共贏，独木难成林。' },
  { name: '升卦', level: '大吉', poem: '地中生木升以高，积小成大步步高。', interpret: '稳步上升，日积月累，终成大器。' },
  { name: '困卦', level: '凶', poem: '泽无水兮困穷时，致命遂志守诚信。', interpret: '困境之中不失志，守信待时终会脱困。' },
  { name: '井卦', level: '中吉', poem: '木上有水井养民，改邑不改井长存。', interpret: '万变不离其宗，坚守本心方为长久之道。' },
  { name: '革卦', level: '吉', poem: '泽中有火革故新，汤武革命顺天人。', interpret: '变革之时，除旧布新，顺势而变大吉。' },
  { name: '鼎卦', level: '大吉', poem: '木上有火鼎烹饪，取新去故立正位。', interpret: '鼎新之际，万象更新，把握时机开创新局。' },
  { name: '震卦', level: '中吉', poem: '洊雷震亨震虩虩，恐惧修省福自至。', interpret: '敬畏之心不可无，谨慎行事平安顺遂。' },
  { name: '艮卦', level: '末吉', poem: '兼山艮止于当止，时止时行皆有道。', interpret: '该停则停，该行则行，知止为智。' },
  { name: '渐卦', level: '吉', poem: '山上有木渐以进，循序渐进终有成。', interpret: '循序渐进，不可急于求成，水到渠成。' },
  { name: '归妹', level: '凶', poem: '泽上有雷归妹时，征凶无攸利可寻。', interpret: '关系或合作需谨慎，勿急于确定，多观察。' },
  { name: '丰卦', level: '中吉', poem: '雷电皆至丰以大，宜照天下勿自封。', interpret: '运势正盛，但居安思危，盛极必衰需警醒。' },
  { name: '旅卦', level: '末吉', poem: '山上有火旅途中，柔得中乎行小心。', interpret: '出行或变动需谨慎，漂泊不定守正为要。' },
  { name: '巽卦', level: '小吉', poem: '随风巽以申命行，小亨利有攸往行。', interpret: '以柔顺之道行事，小事可成，顺势而为。' },
  { name: '兑卦', level: '吉', poem: '丽泽兑以朋友讲，和悦待人善缘来。', interpret: '人缘极佳，和颜悦色迎人，好运自然来。' },
  { name: '涣卦', level: '中吉', poem: '风行水上涣以散，先王享帝立庙安。', interpret: '散中有聚，放下执念反而得到更多。' },
  { name: '节卦', level: '小吉', poem: '泽上有水节以度，苦节不可贞守中。', interpret: '节制有度，过犹不及，适中方为上策。' },
  { name: '中孚', level: '大吉', poem: '泽上有风中孚诚，豚鱼吉兮信及远。', interpret: '至诚感通，诚信待人，天佑诚者。' },
  { name: '小过', level: '中吉', poem: '山上有雷过小事，可小事兮不可大。', interpret: '小事可为，大事需缓，不宜好高骛远。' },
  { name: '既济', level: '末吉', poem: '水在火上既济成，初吉终乱慎终始。', interpret: '事已初成，但勿松懈，守成比创业更难。' },
  { name: '未济', level: '中吉', poem: '火在水上未济时，慎辨物居方待时。', interpret: '事未终了，继续努力，黎明前最暗。' },
]

app.post('/api/tools/answer', async (c) => {
  const { value: randomValue, source, uniformValue: idx } = await fetchUniformEntropy(ANSWERS.length)
  const result = ANSWERS[idx]
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()

  await db.insert(schema.answerBookDraws).values({
    id,
    result,
    entropySource: source,
    rawValue: randomValue,
  })

  return c.json({ result, source, rawValue: randomValue })
})

app.get('/api/tools/answer/history', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.answerBookDraws).orderBy(desc(schema.answerBookDraws.createdAt))
  return c.json(rows)
})

app.post('/api/tools/fortune', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const today = todayCST()

  // 每日一签幂等：同一天直接返回已有结果
  const existing = await db.select().from(schema.dailyFortunes).where(eq(schema.dailyFortunes.date, today))
  if (existing.length > 0) {
    const row = existing[0]
    return c.json({ ...row, cached: true })
  }

  const { value: randomValue, source, uniformValue: idx } = await fetchUniformEntropy(FORTUNES.length)
  const fortune = FORTUNES[idx]
  const id = crypto.randomUUID()

  await db.insert(schema.dailyFortunes).values({
    id,
    date: today,
    result: fortune.name,
    interpretation: JSON.stringify({ level: fortune.level, poem: fortune.poem, interpret: fortune.interpret }),
    entropySource: source,
    rawValue: randomValue,
  })

  return c.json({ id, date: today, result: fortune.name, level: fortune.level, poem: fortune.poem, interpret: fortune.interpret, source, rawValue: randomValue, cached: false })
})

app.get('/api/tools/fortune/history', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.dailyFortunes).orderBy(desc(schema.dailyFortunes.date))
  return c.json(rows)
})

// ========== 同步日志 ==========

app.get('/api/sync-logs', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const source = c.req.query('source')
  const status = c.req.query('status')

  let q = db.select().from(schema.syncLogs)
  const conditions = []
  if (source) conditions.push(eq(schema.syncLogs.source, source))
  if (status) conditions.push(eq(schema.syncLogs.status, status))
  if (conditions.length > 0) q = q.where(and(...conditions)) as typeof q

  const rows = await q.orderBy(desc(schema.syncLogs.createdAt))
  return c.json(rows)
})

// ========== 笔记 ==========

app.get('/api/notes', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10) || 20, 100)
  const rows = await db.select().from(schema.imaNotes).orderBy(desc(schema.imaNotes.updatedAt)).limit(limit)
  return c.json(rows)
})

// 笔记摘要列表：只返回列表需要的字段，避免传输大段 content
app.get('/api/notes/summary', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 200)
  const rows = await db.select({
    id: schema.imaNotes.id,
    title: schema.imaNotes.title,
    sourceFile: schema.imaNotes.sourceFile,
    importedAt: schema.imaNotes.importedAt,
    updatedAt: schema.imaNotes.updatedAt,
    snippet: sql<string>`substr(coalesce(${schema.imaNotes.content}, ''), 1, 200)`,
  }).from(schema.imaNotes).orderBy(desc(schema.imaNotes.updatedAt)).limit(limit)
  return c.json(rows)
})

// 搜索笔记
app.get('/api/notes/search', async (c) => {
  const q = c.req.query('q') || ''
  if (!q) return c.json([])
  const db = drizzle(c.env.DB, { schema })
  const result = await db.select().from(schema.imaNotes)
    .where(or(like(schema.imaNotes.title, `%${q}%`), like(schema.imaNotes.content, `%${q}%`)))
  return c.json(result)
})

app.get('/api/notes/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const note = await db.select().from(schema.imaNotes).where(eq(schema.imaNotes.id, id))
  if (!note.length) return c.json({ error: '未找到' }, 404)
  return c.json(note[0])
})

// 更新笔记
app.put('/api/notes/:id', async (c) => {
  const { id } = c.req.param()
  const { title, content } = updateNoteSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })
  await db.update(schema.imaNotes)
    .set({ title, content, updatedAt: nowBeijing() })
    .where(eq(schema.imaNotes.id, id))
  // 增量嵌入，供语义检索即时命中（AI 异常不阻断更新）
  await indexTarget(c, 'note', id, `${title}\n${content || ''}`).catch((e) => console.error('[embed] note update failed:', e?.message))
  const note = await db.select().from(schema.imaNotes).where(eq(schema.imaNotes.id, id))
  return c.json(note[0])
})

app.post('/api/notes/import', async (c) => {
  const { title, content, sourceFile } = createNoteSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()
  await db.insert(schema.imaNotes).values({ id, title, content, sourceFile })
  await indexTarget(c, 'note', id, `${title}\n${content || ''}`).catch((e) => console.error('[embed] note import failed:', e?.message))
  return c.json({ id }, 201)
})

app.delete('/api/notes/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  await db.delete(schema.imaNotes).where(eq(schema.imaNotes.id, id))
  // 清理笔记向量嵌入
  await indexTarget(c, 'note', id, '').catch((e) => console.error('[embed] note delete cleanup failed:', e?.message))
  return c.json({ ok: true })
})

// ========== 知识库 ==========

app.get('/api/kb', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10) || 20, 100)
    const rows = await db.select().from(schema.kbDocuments).orderBy(desc(schema.kbDocuments.updatedAt)).limit(limit)
    return c.json(rows)
  } catch (e: any) {
    console.error('[kb] list failed:', e?.message, e?.cause)
    return c.json({ error: e.message || '查询知识库失败', detail: e.cause?.message }, 500)
  }
})

// 知识库摘要列表：排除 content 大字段
app.get('/api/kb/summary', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 200)
    const rows = await db.select({
      id: schema.kbDocuments.id,
      title: schema.kbDocuments.title,
      fileType: schema.kbDocuments.fileType,
      fileSize: schema.kbDocuments.fileSize,
      r2Key: schema.kbDocuments.r2Key,
      importedAt: schema.kbDocuments.importedAt,
      updatedAt: schema.kbDocuments.updatedAt,
    }).from(schema.kbDocuments).orderBy(desc(schema.kbDocuments.updatedAt)).limit(limit)
    return c.json(rows)
  } catch (e: any) {
    console.error('[kb] summary failed:', e?.message, e?.cause)
    return c.json({ error: e.message || '查询知识库失败', detail: e.cause?.message }, 500)
  }
})

// 搜索知识库
app.get('/api/kb/search', async (c) => {
  const q = c.req.query('q') || ''
  if (!q) return c.json([])
  const db = drizzle(c.env.DB, { schema })
  const result = await db.select().from(schema.kbDocuments)
    .where(or(like(schema.kbDocuments.title, `%${q}%`), like(schema.kbDocuments.content, `%${q}%`)))
  return c.json(result)
})

app.get('/api/kb/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const doc = await db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  if (!doc.length) return c.json({ error: '未找到' }, 404)
  return c.json(doc[0])
})

// AI 总结知识库文档
app.post('/api/kb/:id/summary', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const doc = await db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  if (!doc.length) return c.json({ error: '未找到' }, 404)
  const content = (doc[0].content || '').slice(0, 8000)
  if (!content.trim()) {
    return c.json({ error: '该文档暂无可用正文，无法总结' }, 400)
  }
  try {
    const summary = await callAI(c, [
      { role: 'system', content: '你是文档总结助手。用 3 句话以内总结以下文档的核心内容，中文输出，不要分段。' },
      { role: 'user', content: `文档标题：${doc[0].title}\n\n${content}` },
    ], { maxTokens: 400 })
    return c.json({ summary: summary.trim() })
  } catch (e: any) {
    console.error('[kb/summary] error:', e)
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// 向知识库文档提问
app.post('/api/kb/:id/ask', async (c) => {
  const { id } = c.req.param()
  const { question } = await c.req.json<{ question: string }>()
  if (!question || !question.trim()) return c.json({ error: '问题不能为空' }, 400)
  const db = drizzle(c.env.DB, { schema })
  const doc = await db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  if (!doc.length) return c.json({ error: '未找到' }, 404)
  const content = (doc[0].content || '').slice(0, 6000)
  if (!content.trim()) {
    return c.json({ error: '该文档暂无可用正文，无法问答' }, 400)
  }
  try {
    const answer = await callAI(c, [
      { role: 'system', content: '你是文档问答助手。请严格基于以下文档内容回答问题，如果文档中没有相关信息，请明确说明。' },
      { role: 'user', content: `文档标题：${doc[0].title}\n\n文档内容：\n${content}\n\n问题：${question.trim()}` },
    ], { maxTokens: 500 })
    return c.json({ answer: answer.trim() })
  } catch (e: any) {
    console.error('[kb/ask] error:', e)
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

app.post('/api/kb/import', async (c) => {
  const { title, content, fileType, fileSize } = await c.req.json()
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()
  await db.insert(schema.kbDocuments).values({ id, title, content, fileType, fileSize })
  // 增量嵌入 KB 文档
  await indexTarget(c, 'kb', id, `${title}\n${content || ''}`).catch((e) => console.error('[embed] kb import failed:', e?.message))
  return c.json({ id }, 201)
})

app.delete('/api/kb/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  // 先删除 D1 记录，再删 R2；若 R2 删除失败仅记录日志，避免应用层失败
  const doc = await db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  await db.delete(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  if (doc.length > 0) {
    // 删除 KB 文件本身的 R2 对象
    if (doc[0].r2Key) {
      try { await c.env.STORAGE.delete(doc[0].r2Key) } catch (e) {
        console.error('[kb] R2 删除失败:', doc[0].r2Key, e)
      }
    }
  }
  // 清理知识库向量嵌入
  await indexTarget(c, 'kb', id, '').catch((e) => console.error('[embed] kb delete cleanup failed:', e?.message))
  return c.json({ ok: true })
})

// 知识库文件上传到 R2
app.post('/api/kb/upload', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file'] as File
  if (!file) return c.json({ error: '未提供文件' }, 400)

  const title = (body['title'] as string) || file.name
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const typeMap: Record<string, string> = {
    pdf: 'pdf', docx: 'docx', doc: 'docx', xlsx: 'xlsx', xls: 'xlsx',
    md: 'md', markdown: 'md', txt: 'txt', png: 'image', jpg: 'image',
    jpeg: 'image', webp: 'image', gif: 'image',
  }
  const fileType = typeMap[ext] || 'unknown'

  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()
  const r2Key = `kb/${id}/${file.name}`

  // 上传到 R2
  await c.env.STORAGE.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  })

  // 对于 Markdown/TXT，同时存文本内容到 D1 以便直接预览；
  // 前端也可能对 PDF/DOCX 提取了正文并随表单传入
  let content = (body['content'] as string) || ''
  if (!content && (fileType === 'md' || fileType === 'txt')) {
    content = await file.text()
  }
  // 限制长度，避免 D1 单行过大
  const MAX_CONTENT = 30000
  if (content.length > MAX_CONTENT) content = content.slice(0, MAX_CONTENT)

  try {
    await db.insert(schema.kbDocuments).values({
      id,
      title,
      content,
      fileType,
      r2Key,
      fileSize: file.size,
    })
  } catch (e) {
    // D1 写入失败时回滚 R2，避免产生无引用的孤儿对象
    try { await c.env.STORAGE.delete(r2Key) } catch {}
    throw e
  }

  // 增量嵌入 KB 文档
  await indexTarget(c, 'kb', id, `${title}\n${content || ''}`).catch((e) => console.error('[embed] kb upload failed:', e?.message))

  return c.json({ id }, 201)
})

// 知识库文件下载（从 R2 读取）
app.get('/api/kb/:id/download', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const doc = await db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  if (!doc.length) return c.json({ error: '未找到' }, 404)
  if (!doc[0].r2Key) return c.json({ error: '该文件无 R2 存储' }, 404)

  const object = await c.env.STORAGE.get(doc[0].r2Key)
  if (!object) return c.json({ error: 'R2 文件不存在' }, 404)

  const headers = new Headers()
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
  headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(doc[0].title)}"`)
  return new Response(object.body, { headers })
})

// ========== IMA 同步 ==========

// IMA 同步状态
app.get('/api/ima/status', async (c) => {
  const status = await getImaStatus(c.env)
  return c.json(status)
})

// IMA 笔记全量同步（同步执行，墙钟预算 18s + 子请求预算 60，超预算返回 partial）
app.post('/api/ima/sync-notes', async (c) => {
  try {
    const result = await syncNotes(c.env)
    // 仅完整同步（非 partial）时更新 ima_last_sync，partial 时下次继续
    if (!result.partial) {
      const db = drizzle(c.env.DB, { schema })
      const now = nowBeijing()
      await db.insert(schema.settings)
        .values({ key: 'ima_last_sync', value: now })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: now } })
    }
    const status = result.partial ? 'partial' : 'success'
    await logSync(c.env, 'ima_notes', {
      status,
      synced: result.synced,
      skipped: result.skipped,
      message: status === 'partial' ? `部分同步 · ${result.synced} 条笔记` : `同步完成 · ${result.synced} 条笔记`,
    })
    return c.json({ ok: true, ...result })
  } catch (e: any) {
    console.error('[ima] sync-notes failed:', e)
    await logSync(c.env, 'ima_notes', {
      status: 'error',
      message: e.message,
    })
    const status = e.message?.includes('未配置 IMA 凭证') ? 400 : 500
    return c.json({ error: e.message }, status)
  }
})

// IMA 笔记回填：为没有 content_html 的笔记生成干净 Markdown + HTML
app.post('/api/ima/backfill-content-html', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const rows = await db.select().from(schema.imaNotes)
      .where(eq(schema.imaNotes.sourceFile, 'ima_openapi'))
    let updated = 0
    const stmts: any[] = []
    for (const row of rows) {
      if (row.contentHtml) continue
      const cleanMd = stripImagesAndAttachments(row.content || '')
      const html = markdownToCleanHtml(cleanMd)
      stmts.push(db.update(schema.imaNotes)
        .set({ content: cleanMd, contentHtml: html, updatedAt: nowBeijing() })
        .where(eq(schema.imaNotes.id, row.id)))
      updated++
      if (stmts.length >= 50) {
        await db.batch(stmts as any)
        stmts.length = 0
      }
    }
    if (stmts.length > 0) await db.batch(stmts as any)
    return c.json({ ok: true, total: rows.length, updated })
  } catch (e: any) {
    console.error('[ima] backfill failed:', e)
    return c.json({ error: e.message }, 500)
  }
})

// IMA 知识库全量同步（同步执行，限制处理数量避免超时）
app.post('/api/ima/sync-kb', async (c) => {
  try {
    const result = await syncKnowledgeBase(c.env)
    const db = drizzle(c.env.DB, { schema })
    await db.insert(schema.settings)
      .values({ key: 'ima_last_sync', value: nowBeijing() })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: nowBeijing() } })
    await logSync(c.env, 'ima_kb', {
      status: 'success',
      synced: result.synced,
      message: `同步完成 · ${result.synced} 个文件`,
    })
    return c.json({ ok: true, ...result })
  } catch (e: any) {
    console.error('[ima] sync-kb failed:', e?.message, e?.cause)
    await logSync(c.env, 'ima_kb', {
      status: 'error',
      message: e.message,
    })
    const status = e.message?.includes('未配置 IMA 凭证') ? 400 : 500
    return c.json({ error: e.message, detail: e.cause?.message }, status)
  }
})

// IMA 笔记本列表
app.get('/api/ima/notebooks', async (c) => {
  try {
    const notebooks = await listNotebooks(c.env)
    return c.json(notebooks)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// IMA 笔记列表
app.get('/api/ima/notes', async (c) => {
  try {
    const folderId = c.req.query('folder_id') || undefined
    const notes = await listNotes(c.env, folderId)
    return c.json(notes)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// IMA 知识库列表
app.get('/api/ima/knowledge-bases', async (c) => {
  try {
    const bases = await listAddableKnowledgeBases(c.env)
    return c.json(bases)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// IMA 知识库内容列表
app.get('/api/ima/knowledge-list', async (c) => {
  try {
    const kbId = c.req.query('kb_id')
    if (!kbId) return c.json({ error: '缺少 kb_id 参数' }, 400)
    const folderId = c.req.query('folder_id') || undefined
    const result = await getKnowledgeList(c.env, kbId, folderId)
    return c.json(result)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// IMA 媒体信息（获取文件访问 URL）
app.get('/api/ima/media/:mediaId', async (c) => {
  try {
    const { mediaId } = c.req.param()
    const info = await getMediaInfo(c.env, mediaId)
    return c.json(info)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// IMA 笔记写回：新建笔记（同步到 IMA）— 支持 Idempotency-Key 幂等保护
app.post('/api/ima/notes', async (c) => {
  try {
    const { title, content } = imaCreateNoteSchema.parse(await c.req.json())
    const idemKey = c.req.header('Idempotency-Key')
    const result = await withIdempotency(c.env, idemKey, async () => {
      const noteId = await imaCreateNote(c.env, content)
      // 写入 D1 imaNotes 表
      const db = drizzle(c.env.DB, { schema })
      await db.insert(schema.imaNotes).values({
        id: noteId,
        title: title || '无标题',
        content,
        sourceFile: 'ima_openapi',
      })
      return { ok: true, id: noteId }
    })
    return c.json(result, 201)
  } catch (e: any) {
    console.error('[ima] createNote failed:', e)
    return c.json({ error: e.message }, 500)
  }
})

// IMA 笔记写回：追加内容到已有 IMA 笔记
app.post('/api/ima/notes/:id/append', async (c) => {
  try {
    const { id } = c.req.param()
    const { content } = imaAppendNoteSchema.parse(await c.req.json())
    await imaAppendNote(c.env, id, content)
    // 更新 D1 content（追加到末尾）
    const db = drizzle(c.env.DB, { schema })
    const existing = await db.select().from(schema.imaNotes).where(eq(schema.imaNotes.id, id))
    if (existing.length > 0) {
      const newContent = (existing[0].content || '') + '\n\n' + content
      await db.update(schema.imaNotes)
        .set({ content: newContent, updatedAt: nowBeijing() })
        .where(eq(schema.imaNotes.id, id))
      await indexTarget(c, 'note', id, `${existing[0].title}\n${newContent}`).catch((e) => console.error('[embed] ima append failed:', e?.message))
    }
    return c.json({ ok: true })
  } catch (e: any) {
    console.error('[ima] appendNote failed:', e)
    return c.json({ error: e.message }, 500)
  }
})

app.get('/api/settings', async (c) => {
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

app.put('/api/settings', async (c) => {
  const body = settingsSchema.parse(await c.req.json())
  // 敏感键加密后再存储（向后兼容：读取时 decrypt 自动识别 enc$ 前缀）
  const encrypted = await encryptSettings(c.env.JWT_SECRET, body)
  const db = drizzle(c.env.DB, { schema })
  const now = nowBeijing()
  const stmts = Object.entries(encrypted).map(([key, value]) =>
    db.insert(schema.settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: now } })
  )
  await db.batch(stmts as any)
  return c.json({ ok: true })
})

// 清空所有数据（事务：保留 settings 表，避免用户重新配置）
app.delete('/api/settings/reset', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  try {
    // 1. 清空 R2 中的 KB 文件
    try {
      const r2Objects = await c.env.STORAGE.list()
      if (r2Objects.objects.length > 0) {
        await c.env.STORAGE.delete(r2Objects.objects.map(o => o.key))
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
      db.delete(schema.coinFlips),
      db.delete(schema.answerBookDraws),
      db.delete(schema.dailyFortunes),
      db.delete(schema.syncLogs),
      db.delete(schema.embeddings),
      db.delete(schema.kvCache),
    ])

    // 3. 清空 KV 中的 AI 缓存（best effort）
    await Promise.all([
      kvCacheDeletePrefix(c.env, 'ai:'),
      kvCacheDeletePrefix(c.env, 'search:'),
    ])

    return c.json({ success: true, message: '数据已清空' })
  } catch (e: any) {
    console.error('[reset] 清空失败:', e)
    return c.json({ error: e.message }, 500)
  }
})

// AI 连通性测试
app.post('/api/settings/ai/test', async (c) => {
  const { baseUrl, apiKey, model } = aiTestSchema.parse(await c.req.json())
  // apiKey 为空（前端脱敏占位）时，回退到 settings 表已保存的密钥
  let effectiveKey = apiKey
  if (!effectiveKey) {
    const db = drizzle(c.env.DB, { schema })
    const row = await db.select().from(schema.settings).where(eq(schema.settings.key, 'custom_ai_api_key'))
    if (row.length > 0) {
      effectiveKey = await decrypt(c.env.JWT_SECRET, row[0].value)
    }
  }
  if (!effectiveKey) {
    return c.json({ ok: false, error: '未配置 API Key' })
  }
  const start = Date.now()
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${effectiveKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
    })
    const data = await res.json() as any
    return c.json({
      ok: true,
      latency_ms: Date.now() - start,
      model: data.model || model,
    })
  } catch (e: any) {
    return c.json({ ok: false, error: e.message })
  }
})

// ========== 微软 To Do 同步 ==========

import { fullSync, exchangeCodeForToken, getSyncStatus, deleteMsList } from './ms-sync'

// OAuth 前端回调处理端点（由前端回调页 MsTodoCallback.tsx 调用）
// redirect_uri 必须与前端发起授权时一致；优先用前端传入的 redirect_uri，其次用保存的 ms_redirect_uri
app.get('/api/settings/ms-todo/callback', async (c) => {
  const code = c.req.query('code')
  if (!code) return c.json({ ok: false, error: '缺少 code 参数' })

  // 前端可以通过 ?redirect_uri= 显式传入授权时使用的回跳地址
  let redirectUri = c.req.query('redirect_uri')
  if (!redirectUri) {
    // 回退到保存的 ms_redirect_uri 设置
    const db = drizzle(c.env.DB, { schema })
    const row = await db.select().from(schema.settings).where(eq(schema.settings.key, 'ms_redirect_uri'))
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
app.get('/api/settings/ms-todo/status', async (c) => {
  const status = await getSyncStatus(c.env)
  return c.json(status)
})

// 手动触发同步
app.post('/api/settings/ms-todo/sync', async (c) => {
  try {
    const result = await fullSync(c.env)
    const db = drizzle(c.env.DB, { schema })
    // 仅在完全无失败时更新"最后同步时间"，避免部分失败显示"同步成功"假阳性
    if (result.failed === 0) {
      await db.insert(schema.settings)
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
      message: status === 'success'
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

// 根路由
app.get('/', (c) => c.json({ name: 'Workbench API', version: '1.0.0' }))

// Cron Trigger — 每 30 分钟同步 MS Todo，每天 UTC 18:00 同步 IMA 笔记+知识库
// ============ MCP 服务器：把 22 个工具以标准 MCP 协议暴露给 LobeChat / WorkBuddy / Claude 等 ============
function jsonSchemaToZodShape(schemaJson: any): Record<string, any> {
  const shape: Record<string, any> = {}
  const props = schemaJson?.properties || {}
  const required: string[] = schemaJson?.required || []
  for (const [key, def] of Object.entries(props)) {
    const d = def as any
    let zType: any
    if (d.type === 'boolean') zType = z.boolean()
    else if (d.type === 'number' || d.type === 'integer') zType = z.number()
    else if (Array.isArray(d.enum) && d.enum.length) zType = z.enum(d.enum as [string, ...string[]])
    else zType = z.string()
    if (d.description) zType = zType.describe(d.description)
    if (!required.includes(key)) zType = zType.optional()
    shape[key] = zType
  }
  return shape
}

function createMcpServer(env: Env): McpServer {
  const server = new McpServer({ name: 'Workbench MCP', version: '1.0.0' })
  const db = drizzle(env.DB, { schema })
  for (const t of CHAT_TOOLS) {
    const fn = t.function
    server.registerTool(
      fn.name,
      { description: fn.description, inputSchema: jsonSchemaToZodShape(fn.parameters) },
      async (args: any) => {
        try {
          const ctx = await buildChatCtx(db)
          const r = await executeChatTool({ env } as any, db, fn.name, args, ctx)
          return { content: [{ type: 'text' as const, text: r.observation }] }
        } catch (e: any) {
          return { content: [{ type: 'text' as const, text: `工具 ${fn.name} 执行失败：${String(e?.message || e).slice(0, 200)}` }], isError: true }
        }
      }
    )
  }
  return server
}

async function verifyMcpAuth(request: Request, env: Env): Promise<boolean> {
  try {
    const mcpToken = request.headers.get('x-mcp-token')
    if (mcpToken && env.MCP_TOKEN && mcpToken === env.MCP_TOKEN) return true
    // 也支持 URL 里带 token（方便只接受 URL 的 MCP 客户端，如 LobeChat 一键连接）
    const qToken = new URL(request.url).searchParams.get('mcp_token') || new URL(request.url).searchParams.get('token')
    if (qToken && env.MCP_TOKEN && qToken === env.MCP_TOKEN) return true
    const auth = request.headers.get('authorization') || ''
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (m && env.JWT_SECRET) {
      await verify(m[1], env.JWT_SECRET, 'HS256')
      return true
    }
  } catch {}
  return false
}

function handleMcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  return createMcpHandler(createMcpServer(env) as any)(request, env as any, ctx)
}

export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url)
    if (url.pathname === '/mcp') {
      if (!(await verifyMcpAuth(request, env))) {
        return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } })
      }
      return handleMcp(request, env, ctx)
    }
    return app.fetch(request, env, ctx)
  },

  scheduled: async (event: ScheduledEvent, env: any) => {
    const db = drizzle(env.DB, { schema })
    const now = nowBeijing()
    const LOCK_KEY = 'cron_sync_lock'
    const LOCK_TTL_MS = 30 * 60 * 1000

    // 简单分布式锁：若 30 分钟内已有其他实例在执行，跳过本次
    try {
      const lockRow = await db.select().from(schema.settings).where(eq(schema.settings.key, LOCK_KEY))
      if (lockRow.length > 0 && lockRow[0].value) {
        const lockedAt = new Date(lockRow[0].value).getTime()
        if (!isNaN(lockedAt) && Date.now() - lockedAt < LOCK_TTL_MS) {
          console.warn('[cron] 上次同步尚未结束或锁未超时，跳过本次')
          return
        }
      }
      await db.insert(schema.settings)
        .values({ key: LOCK_KEY, value: now })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: now } })
    } catch (e) {
      console.error('[cron] lock failed:', e)
      return
    }

    try {
      if (event.cron === '*/30 * * * *') {
        // 高频：仅 MS Todo 同步
        try {
          const result = await fullSync(env)
          await db.insert(schema.settings)
            .values({ key: 'ms_last_sync', value: now })
            .onConflictDoUpdate({ target: schema.settings.key, set: { value: now } })
          const status = result.failed === 0 ? 'success' : result.synced > 0 ? 'partial' : 'error'
          await logSync(env, 'ms_todo', {
            status,
            synced: result.synced,
            failed: result.failed,
            skipped: result.skipped,
            message: status === 'success'
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
      } else if (event.cron === '0 18 * * *') {
        // 低频：IMA 笔记 + 知识库同步，独立 catch 不阻塞
        try {
          const notesResult = await syncNotes(env)
          if (!notesResult.partial) {
            await db.insert(schema.settings)
              .values({ key: 'ima_last_sync', value: now })
              .onConflictDoUpdate({ target: schema.settings.key, set: { value: now } })
          }
          const notesStatus = notesResult.partial ? 'partial' : 'success'
          await logSync(env, 'ima_notes', {
            status: notesStatus,
            synced: notesResult.synced,
            skipped: notesResult.skipped,
            message: notesStatus === 'partial'
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
      } else {
        console.warn('[cron] unknown cron pattern:', event.cron)
      }
    } finally {
      // 释放锁
      try {
        await db.delete(schema.settings).where(eq(schema.settings.key, LOCK_KEY))
      } catch (e) {
        console.error('[cron] unlock failed:', e)
      }
    }
  },
}
