import { Hono } from 'hono'
import type { Context } from 'hono'
import { jwt } from 'hono/jwt'
import { Jwt } from 'hono/utils/jwt'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, isNotNull, isNull, like, desc, gte } from 'drizzle-orm'
import * as schema from './schema'
import type { Env, ChatMessage } from './types'
import {
  loginSchema, changePasswordSchema, createListSchema, updateListSchema,
  createTaskSchema, updateTaskSchema,
  createSubtaskSchema, updateSubtaskSchema,
  createNoteSchema, updateNoteSchema,
  imaCreateNoteSchema, imaAppendNoteSchema,
  settingsSchema, aiTestSchema,
} from './validation'
import { decrypt, encrypt, encryptSettings, SENSITIVE_KEYS, hashPassword } from './crypto-utils'
import { withIdempotency } from './idempotent'
import { syncNotes, syncKnowledgeBase, getImaStatus, listNotebooks, listNotes, listAddableKnowledgeBases, getKnowledgeList, getMediaInfo, createNote as imaCreateNote, appendNote as imaAppendNote, cleanupAttachments } from './ima-sync'



const app = new Hono<{ Bindings: Env }>()

// CORS 中间件：本地开发允许 *，生产读 ALLOWED_ORIGIN 白名单
app.use('*', cors({
  origin: (_origin, c) => c.env.ALLOWED_ORIGIN ?? '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
}))

// AI 调用辅助函数：根据 settings 表决定用 Cloudflare AI 还是自定义 API
async function callAI(c: Context<{ Bindings: Env }>, messages: ChatMessage[]): Promise<string> {
  const db = drizzle(c.env.DB, { schema })
  const settings = await db.select().from(schema.settings)
  const settingsMap: Record<string, string> = {}
  for (const s of settings) settingsMap[s.key] = s.value

  const provider = settingsMap.ai_provider || 'cloudflare'

  if (provider === 'custom' && settingsMap.custom_ai_base_url && settingsMap.custom_ai_api_key) {
    // 自定义 OpenAI 兼容 API（api_key 走解密，向后兼容明文）
    const apiKey = await decrypt(c.env.JWT_SECRET, settingsMap.custom_ai_api_key)
    const res = await fetch(`${settingsMap.custom_ai_base_url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settingsMap.custom_ai_model || 'gpt-4o',
        messages,
      }),
    })
    const data = await res.json() as any
    return data.choices?.[0]?.message?.content || ''
  }

  // 默认：Cloudflare Workers AI（模型可从 settings 表 ai_model 配置，兜底用速度/质量均衡模型）
  const model = settingsMap.ai_model || '@cf/qwen/qwen2.5-coder-32b-instruct'
  const response = await c.env.AI.run(model, { messages, max_tokens: 512 })
  // 兼容不同模型的响应结构（string / { response } / { result: { response } } / 流式对象）
  if (typeof response === 'string') return response
  const r = response as any
  return r.response?.response || r.response || r.result?.response || r.output || JSON.stringify(response)
}

// 北京时间（UTC+8）工具函数：Cloudflare Workers 默认 UTC，用户在 Asia/Shanghai
// 用 UTC + 8 小时偏移计算，避免依赖 Intl 时区数据库
const CST_OFFSET_MS = 8 * 60 * 60 * 1000

// 返回北京时间的当前 Date 对象
function nowCST(): Date {
  return new Date(Date.now() + CST_OFFSET_MS)
}

// 返回北京日期字符串 yyyy-MM-dd（用于 myDayDate / dueDate 比较）
function todayCST(): string {
  return nowCST().toISOString().split('T')[0]
}

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
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: encrypted, updatedAt: new Date().toISOString() } })
  return c.json({ ok: true })
})

// JWT 中间件（hono/jwt）— 保护所有 /api 路由，白名单内的路径免认证
const PUBLIC_PATHS = new Set(['/api/auth/login', '/api/settings/ms-todo/callback'])
// 免认证前缀：IMA 附件文件（浏览器 <img> 不带 Authorization 头，hash 不可枚举，个人应用可接受公开）
const PUBLIC_PREFIXES = ['/api/ima/media-file/']
app.use('/api/*', async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) return next()
  if (PUBLIC_PREFIXES.some(p => c.req.path.startsWith(p))) return next()
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
  const lists = await db.select().from(schema.taskLists).orderBy(schema.taskLists.sortOrder)
  return c.json(lists)
})

// 创建列表
app.post('/api/tasks/lists', async (c) => {
  const { name, color } = createListSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })
  // 任务列表排在末尾：sortOrder 取当前最大值 + 1
  const existingLists = await db.select({ sortOrder: schema.taskLists.sortOrder }).from(schema.taskLists)
  const maxSort = existingLists.reduce((m, l) => Math.max(m, l.sortOrder ?? 0), 0)

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
    .set({ name, color, updatedAt: new Date().toISOString() })
    .where(eq(schema.taskLists.id, id))
  const list = await db.select().from(schema.taskLists).where(eq(schema.taskLists.id, id))
  return c.json(list[0])
})

// 删除列表（事务：其下任务软删除以便 MS 端同步删除，再删列表本身；若列表关联 MS 则同步删除 MS 端列表）
app.delete('/api/tasks/lists/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const now = new Date().toISOString()
  // 先查列表信息（含 msTodoListId），删除后无法再查
  const list = await db.select().from(schema.taskLists).where(eq(schema.taskLists.id, id))
  const msTodoListId = list[0]?.msTodoListId
  // 关联 MS 的任务做软删除（下次同步会从 MS 端删除）；无 MS 关联的直接硬删
  await db.update(schema.tasks)
    .set({ msTodoDeletedAt: now, updatedAt: now })
    .where(and(eq(schema.tasks.listId, id), isNotNull(schema.tasks.msTodoId)))
  await db.delete(schema.tasks).where(and(eq(schema.tasks.listId, id), isNull(schema.tasks.msTodoId)))
  await db.delete(schema.taskLists).where(eq(schema.taskLists.id, id))
  // 若列表关联 MS，异步删除 MS 端列表（失败不影响本地删除结果）
  if (msTodoListId) {
    c.executionCtx.waitUntil(deleteMsList(c.env, msTodoListId))
  }
  return c.json({ ok: true })
})

// ========== 任务 ==========

// 获取列表下的任务
app.get('/api/tasks/lists/:id/tasks', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const result = await db.select().from(schema.tasks)
    .where(and(eq(schema.tasks.listId, id), isNull(schema.tasks.msTodoDeletedAt)))
    .orderBy(schema.tasks.sortOrder)
  return c.json(result)
})

// 我的一天（按当日 myDayDate 过滤，使用北京时间）
app.get('/api/tasks/myday', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const today = todayCST()
  const result = await db.select().from(schema.tasks)
    .where(and(eq(schema.tasks.isMyDay, true), eq(schema.tasks.myDayDate, today), isNull(schema.tasks.msTodoDeletedAt)))
    .orderBy(schema.tasks.sortOrder, desc(schema.tasks.createdAt))
  return c.json(result)
})

// 重要（须放在 /:id 之前避免被捕获）
app.get('/api/tasks/important', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const result = await db.select().from(schema.tasks)
    .where(and(eq(schema.tasks.isImportant, true), eq(schema.tasks.isCompleted, false), isNull(schema.tasks.msTodoDeletedAt)))
    .orderBy(schema.tasks.sortOrder, desc(schema.tasks.createdAt))
  return c.json(result)
})

// 已计划（须放在 /:id 之前避免被捕获）
app.get('/api/tasks/planned', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const result = await db.select().from(schema.tasks)
    .where(and(isNotNull(schema.tasks.dueDate), eq(schema.tasks.isCompleted, false), isNull(schema.tasks.msTodoDeletedAt)))
    .orderBy(schema.tasks.dueDate, schema.tasks.sortOrder)
  return c.json(result)
})

// 搜索（须放在 /:id 之前避免被捕获）
app.get('/api/tasks/search', async (c) => {
  const q = c.req.query('q') || ''
  if (!q) return c.json([])
  const db = drizzle(c.env.DB, { schema })
  const result = await db.select().from(schema.tasks)
    .where(and(like(schema.tasks.title, `%${q}%`), isNull(schema.tasks.msTodoDeletedAt)))
  return c.json(result)
})

// 全部任务（用于任务总览页）
app.get('/api/tasks', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const result = await db.select().from(schema.tasks)
    .where(isNull(schema.tasks.msTodoDeletedAt))
    .orderBy(desc(schema.tasks.createdAt))
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

  // 校验 listId 存在，避免产生孤儿任务
  const list = await db.select().from(schema.taskLists).where(eq(schema.taskLists.id, body.listId))
  if (list.length === 0) {
    return c.json({ error: '指定的任务列表不存在' }, 400)
  }

  // 新任务排在列表末尾：sortOrder 取当前列表最大值 + 1
  const existingTasks = await db.select({ sortOrder: schema.tasks.sortOrder }).from(schema.tasks)
    .where(eq(schema.tasks.listId, body.listId))
  const maxSort = existingTasks.reduce((m, t) => Math.max(m, t.sortOrder ?? 0), 0)

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
  const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id))
  return c.json(task[0], 201)
})

// 更新任务
app.put('/api/tasks/:id', async (c) => {
  const { id } = c.req.param()
  const body = updateTaskSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })
  const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  for (const key of ['title', 'note', 'isCompleted', 'isImportant', 'isMyDay', 'myDayDate', 'dueDate', 'reminder', 'recurrence', 'sortOrder', 'listId'] as const) {
    if (key in body) updateData[key] = body[key]
  }
  await db.update(schema.tasks).set(updateData).where(eq(schema.tasks.id, id))
  const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id))
  return c.json(task[0])
})

// 删除任务（MS Todo 关联任务走软删除，等同步时推送到 MS 端再硬删）
app.delete('/api/tasks/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const existing = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id))
  if (existing.length === 0) return c.json({ ok: true })
  const task = existing[0]
  if (task.msTodoId) {
    // 关联 MS Todo：软删除标记，等下次同步时 DELETE MS 端再硬删本地
    // 同步清理子任务，避免软删除任务产生隐藏孤儿子任务
    await db.batch([
      db.update(schema.tasks)
        .set({ msTodoDeletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(eq(schema.tasks.id, id)),
      db.delete(schema.subtasks).where(eq(schema.subtasks.taskId, id)),
    ])
  } else {
    // 未关联 MS Todo：直接硬删（子任务走 onDelete cascade）
    await db.delete(schema.tasks).where(eq(schema.tasks.id, id))
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
    updatedAt: new Date().toISOString(),
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
    updatedAt: new Date().toISOString(),
  }).where(eq(schema.tasks.id, id))
  return c.json({ ok: true })
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
    const { title } = parsed.data

    const db = drizzle(c.env.DB, { schema })

    // 校验父任务存在，避免外键约束导致 500
    const parent = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.id, taskId))
    if (parent.length === 0) {
      return c.json({ error: '父任务不存在', taskId }, 404)
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    // 子任务排在末尾：sortOrder 取当前任务下子任务最大值 + 1
    const existingSubs = await db.select({ sortOrder: schema.subtasks.sortOrder }).from(schema.subtasks)
      .where(eq(schema.subtasks.taskId, taskId))
    const maxSort = existingSubs.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), 0)
    await db.insert(schema.subtasks).values({
      id,
      taskId,
      title,
      isCompleted: false,
      sortOrder: maxSort + 1,
      createdAt: now,
    })
    const subtask = await db.select().from(schema.subtasks).where(eq(schema.subtasks.id, id))
    return c.json(subtask[0], 201)
  } catch (e: any) {
    console.error('[subtasks] unhandled error:', { taskId, error: e, stack: e.stack })
    return c.json({ error: '子任务创建失败', detail: e.message, stack: e.stack }, 500)
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
  const subtask = await db.select().from(schema.subtasks).where(eq(schema.subtasks.id, id))
  return c.json(subtask[0])
})

// 删除子任务
app.delete('/api/subtasks/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  await db.delete(schema.subtasks).where(eq(schema.subtasks.id, id))
  return c.json({ ok: true })
})

// ========== AI ==========

// AI 拆解子任务
app.post('/api/ai/breakdown', async (c) => {
  const { taskTitle } = await c.req.json()
  if (!taskTitle) return c.json({ error: '任务标题不能为空' }, 400)

  try {
    const text = await callAI(c, [
      {
        role: 'system',
        content: '你是任务拆解专家。将任务拆解为3-7个可执行子步骤。每行只写一个步骤，不要编号、不要 JSON、不要额外说明。'
      },
      { role: 'user', content: `任务：${taskTitle}` }
    ])

    if (!text || typeof text !== 'string') {
      return c.json({ subtasks: [] })
    }

    // 优先尝试解析 JSON 数组，失败则按行拆分
    const match = text.match(/\[[\s\S]*\]/)
    let subtasks: { title: string }[] = []
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed)) {
          subtasks = parsed.filter((item: any) => item && item.title).map((item: any) => ({ title: String(item.title) }))
        }
      } catch {
        // ignore
      }
    }

    if (subtasks.length === 0) {
      subtasks = text
        .split(/\n/)
        .map((line) => line.replace(/^\s*[-\d\.\*]+\s*/, '').trim())
        .filter((line) => line.length > 0 && line.length < 200)
        .slice(0, 10)
        .map((title) => ({ title }))
    }

    return c.json({ subtasks })
  } catch (e: any) {
    return c.json({ error: 'AI 请求失败: ' + e.message }, 500)
  }
})

// AI 数据分析
app.post('/api/ai/analysis', async (c) => {
  const range = c.req.query('range') || 'all'
  const db = drizzle(c.env.DB, { schema })

  // 时间范围过滤条件
  let dateFilter: string | undefined = undefined
  if (range !== 'all') {
    const since = new Date()
    since.setDate(since.getDate() - parseInt(range))
    dateFilter = since.toISOString()
  }

  // 在数据库层过滤任务（时间范围 + 排除已软删除的 MS Todo 任务）
  const taskWhere = dateFilter
    ? and(gte(schema.tasks.createdAt, dateFilter), isNull(schema.tasks.msTodoDeletedAt))
    : isNull(schema.tasks.msTodoDeletedAt)
  const filteredTasks = await db.select().from(schema.tasks).where(taskWhere)

  // 按日完成趋势
  const dailyMap: Record<string, number> = {}
  const days = range === 'all' ? 30 : parseInt(range)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dailyMap[d.toISOString().split('T')[0]] = 0
  }
  // 遍历已完成任务，按 updatedAt 日期分组（completedAt 没有独立字段，用 updatedAt 近似）
  filteredTasks.filter(t => t.isCompleted).forEach(t => {
    if (!t.updatedAt) return
    const date = new Date(t.updatedAt).toISOString().split('T')[0]
    if (date in dailyMap) dailyMap[date]++
  })
  const dailyCompleted = Object.entries(dailyMap).map(([date, count]) => ({ date, count }))

  const allNotes = await db.select().from(schema.imaNotes)
  const stats = {
    totalTasks: filteredTasks.length,
    completedTasks: filteredTasks.filter(t => t.isCompleted).length,
    importantTasks: filteredTasks.filter(t => t.isImportant).length,
    notesCount: allNotes.length,
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
    return c.json({ analysis, stats })
  } catch (e: any) {
    return c.json({ error: 'AI 请求失败: ' + e.message }, 500)
  }
})

// AI 周报
app.post('/api/ai/weekly-report', async (c) => {
  const db = drizzle(c.env.DB, { schema })

  // 本周数据
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const since = weekAgo.toISOString()

  const weekTasks = await db.select().from(schema.tasks)
    .where(and(gte(schema.tasks.createdAt, since), isNull(schema.tasks.msTodoDeletedAt)))
  const completedTasks = weekTasks.filter(t => t.isCompleted)
  const weekNotes = await db.select().from(schema.imaNotes)
    .where(gte(schema.imaNotes.importedAt, since))

  const summary = `本周新增任务 ${weekTasks.length} 个，完成 ${completedTasks.length} 个，新增笔记 ${weekNotes.length} 篇。`

  const report = await callAI(c, [{
    role: 'system',
    content: `你是一个个人助手，根据用户本周的工作数据生成一份周报。${summary}。请用中文输出，包含：本周成就、待改进、下周建议三个部分，每部分 2-3 句话。`
  }])

  // 存入 settings 表（key: weekly_report_YYYYWww，ISO 周）
  const { year, week } = getISOWeek(new Date())
  const reportKey = `weekly_report_${year}W${week.toString().padStart(2, '0')}`
  await db.insert(schema.settings).values({ key: reportKey, value: report }).onConflictDoUpdate({
    target: schema.settings.key,
    set: { value: report, updatedAt: new Date().toISOString() },
  })

  // 保留最近 52 周周报，删除更旧的数据避免 settings 无限增长
  const allReports = await db.select({ key: schema.settings.key }).from(schema.settings)
    .where(like(schema.settings.key, 'weekly_report_%'))
  const oldReports = allReports
    .map((r) => r.key)
    .sort((a, b) => b.localeCompare(a))
    .slice(52)
  for (const key of oldReports) {
    await db.delete(schema.settings).where(eq(schema.settings.key, key))
  }

  return c.json({ report, week: `${year}-W${week}` })
})

// 获取历史周报列表
app.get('/api/ai/weekly-reports', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const allSettings = await db.select().from(schema.settings)
  const reports = allSettings
    .filter(s => s.key.startsWith('weekly_report_'))
    .sort((a, b) => b.key.localeCompare(a.key))
  return c.json(reports.map(s => ({ week: s.key.replace('weekly_report_', ''), report: s.value })))
})

// ========== 天意硬币 ==========

app.post('/api/coin/flip', async (c) => {
  let randomValue = 0
  let source = ''

  // 真物理熵源列表：每次抛掷用 Web Crypto 随机选一个起点，
  // 按起点顺序依次尝试，全部失败才回退到 Web Crypto（伪随机）。
  // 不固定单一源，避免单点故障 + 增加熵源多样性
  const entropySources: Array<{ name: string; fetch: () => Promise<number> }> = [
    {
      // random.org：大气无线电噪声（主要为全球雷暴闪电放电），真物理熵
      name: 'random_org',
      fetch: async () => {
        const res = await fetch('https://www.random.org/integers/?num=1&min=0&max=255&col=1&base=10&format=plain&rnd=new')
        if (!res.ok) throw new Error(`random.org ${res.status}`)
        const v = parseInt(await res.text(), 10)
        if (isNaN(v) || v < 0 || v > 255) throw new Error('random.org invalid')
        return v
      },
    },
    {
      // NIST Beacon 2.0：美国国家标准技术研究院的物理熵源
      // （量子相位噪声 + 放射性衰变 Krypton-85），真物理熵
      // 返回 pulse.localRandomValue 为 512-bit hex，取首字节
      name: 'nist_beacon',
      fetch: async () => {
        const res = await fetch('https://beacon.nist.gov/beacon/2.0/pulse/last')
        if (!res.ok) throw new Error(`NIST ${res.status}`)
        const data = await res.json() as any
        const hex = data?.pulse?.localRandomValue
        if (!hex || hex.length < 2) throw new Error('NIST no value')
        const v = parseInt(hex.slice(0, 2), 16)
        if (isNaN(v)) throw new Error('NIST invalid')
        return v
      },
    },
  ]

  // 用 Web Crypto 随机选起点（仅用于选源，不参与最终结果）
  const selector = new Uint8Array(1)
  crypto.getRandomValues(selector)
  const startIdx = selector[0] % entropySources.length

  let lastErr: unknown
  let succeeded = false
  for (let i = 0; i < entropySources.length; i++) {
    const src = entropySources[(startIdx + i) % entropySources.length]
    try {
      randomValue = await src.fetch()
      source = src.name
      succeeded = true
      break
    } catch (e) {
      lastErr = e
      console.warn(`[coin] entropy source ${src.name} failed:`, (e as Error).message)
    }
  }

  // 所有真物理熵源失败 → Web Crypto 兜底（伪随机）
  if (!succeeded) {
    const arr = new Uint8Array(1)
    crypto.getRandomValues(arr)
    randomValue = arr[0]
    source = 'crypto'
    console.warn('[coin] all physical entropy sources failed, fallback to Web Crypto:', lastErr)
  }

  const result = randomValue < 128 ? 'tails' : 'heads'
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()

  // AI 解读
  let interpretation = ''
  try {
    interpretation = await callAI(c, [{
      role: 'system',
      content: `用户抛掷天意硬币得到"${result === 'heads' ? '阳/正面' : '阴/反面'}"，用一句话给出玄学解读，30字以内。`
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
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10) || 20, 100)
  const rows = await db.select().from(schema.coinFlips).orderBy(desc(schema.coinFlips.createdAt)).limit(limit)
  return c.json(rows)
})

// ========== 笔记 ==========

app.get('/api/notes', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10) || 20, 100)
  const rows = await db.select().from(schema.imaNotes).orderBy(desc(schema.imaNotes.updatedAt)).limit(limit)
  return c.json(rows)
})

// 搜索笔记
app.get('/api/notes/search', async (c) => {
  const q = c.req.query('q') || ''
  if (!q) return c.json([])
  const db = drizzle(c.env.DB, { schema })
  const result = await db.select().from(schema.imaNotes)
    .where(like(schema.imaNotes.title, `%${q}%`))
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
    .set({ title, content, updatedAt: new Date().toISOString() })
    .where(eq(schema.imaNotes.id, id))
  const note = await db.select().from(schema.imaNotes).where(eq(schema.imaNotes.id, id))
  return c.json(note[0])
})

app.post('/api/notes/import', async (c) => {
  const { title, content, sourceFile } = createNoteSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()
  await db.insert(schema.imaNotes).values({ id, title, content, sourceFile })
  return c.json({ id }, 201)
})

app.delete('/api/notes/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  // 先查询笔记内容，清理其引用的 R2 附件，再删除 D1 记录
  const note = await db.select({ content: schema.imaNotes.content }).from(schema.imaNotes).where(eq(schema.imaNotes.id, id))
  if (note.length > 0) {
    await cleanupAttachments(c.env, note[0].content || '')
  }
  await db.delete(schema.imaNotes).where(eq(schema.imaNotes.id, id))
  return c.json({ ok: true })
})

// ========== 知识库 ==========

app.get('/api/kb', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10) || 20, 100)
  const rows = await db.select().from(schema.kbDocuments).orderBy(desc(schema.kbDocuments.updatedAt)).limit(limit)
  return c.json(rows)
})

// 搜索知识库
app.get('/api/kb/search', async (c) => {
  const q = c.req.query('q') || ''
  if (!q) return c.json([])
  const db = drizzle(c.env.DB, { schema })
  const result = await db.select().from(schema.kbDocuments)
    .where(like(schema.kbDocuments.title, `%${q}%`))
  return c.json(result)
})

app.get('/api/kb/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const doc = await db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  if (!doc.length) return c.json({ error: '未找到' }, 404)
  return c.json(doc[0])
})

app.post('/api/kb/import', async (c) => {
  const { title, content, fileType, fileSize } = await c.req.json()
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()
  await db.insert(schema.kbDocuments).values({ id, title, content, fileType, fileSize })
  return c.json({ id }, 201)
})

app.delete('/api/kb/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  // 先删除 D1 记录，再删 R2；若 R2 删除失败仅记录日志，避免应用层失败
  const doc = await db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  await db.delete(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  if (doc.length > 0 && doc[0].r2Key) {
    try { await c.env.STORAGE.delete(doc[0].r2Key) } catch (e) {
      console.error('[kb] R2 删除失败:', doc[0].r2Key, e)
    }
  }
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

  // 对于 Markdown/TXT，同时存文本内容到 D1 以便直接预览
  let content = ''
  if (fileType === 'md' || fileType === 'txt') {
    content = await file.text()
  }

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

// IMA 笔记全量同步
app.post('/api/ima/sync-notes', async (c) => {
  try {
    const result = await syncNotes(c.env)
    const db = drizzle(c.env.DB, { schema })
    await db.insert(schema.settings)
      .values({ key: 'ima_last_sync', value: new Date().toISOString() })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: new Date().toISOString() } })
    return c.json({ ok: true, ...result })
  } catch (e: any) {
    console.error('[ima] sync-notes failed:', e)
    const status = e.message?.includes('未配置 IMA 凭证') ? 400 : 500
    return c.json({ error: e.message }, status)
  }
})

// IMA 知识库全量同步
app.post('/api/ima/sync-kb', async (c) => {
  try {
    const result = await syncKnowledgeBase(c.env)
    const db = drizzle(c.env.DB, { schema })
    await db.insert(schema.settings)
      .values({ key: 'ima_last_sync', value: new Date().toISOString() })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: new Date().toISOString() } })
    return c.json({ ok: true, ...result })
  } catch (e: any) {
    console.error('[ima] sync-kb failed:', e)
    const status = e.message?.includes('未配置 IMA 凭证') ? 400 : 500
    return c.json({ error: e.message }, status)
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

// IMA 笔记附件/图片下载（已转存到 R2）
app.get('/api/ima/media-file/:mediaId', async (c) => {
  try {
    const { mediaId } = c.req.param()
    const r2Key = `ima/attachments/${mediaId}`
    const object = await c.env.STORAGE.get(r2Key)
    if (!object) {
      return c.json({ error: '附件不存在或尚未同步' }, 404)
    }
    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (e: any) {
    console.error('[ima] media-file serve failed:', e)
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
        .set({ content: newContent, updatedAt: new Date().toISOString() })
        .where(eq(schema.imaNotes.id, id))
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
  for (const [key, value] of Object.entries(encrypted)) {
    await db.insert(schema.settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date().toISOString() } })
  }
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

    // 2. 事务清空 D1 表（保留 settings）
    await db.batch([
      db.delete(schema.subtasks),
      db.delete(schema.tasks),
      db.delete(schema.taskLists),
      db.delete(schema.imaNotes),
      db.delete(schema.kbDocuments),
      db.delete(schema.coinFlips),
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
        .values({ key: 'ms_last_sync', value: new Date().toISOString() })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: new Date().toISOString() } })
    }
    return c.json({ ok: result.failed === 0, ...result })
  } catch (e: any) {
    console.error('[ms-todo] sync failed:', e)
    return c.json({ error: e.message }, 500)
  }
})

// 根路由
app.get('/', (c) => c.json({ name: 'Workbench API', version: '1.0.0' }))

// Cron Trigger — 每 5 分钟自动同步 MS Todo + IMA
export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledEvent, env: any) => {
    const db = drizzle(env.DB, { schema })
    const now = new Date().toISOString()
    const LOCK_KEY = 'cron_sync_lock'
    const LOCK_TTL_MS = 10 * 60 * 1000

    // 简单分布式锁：若 10 分钟内已有其他实例在执行，跳过本次
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
      // 1. MS Todo 同步
      try {
        await fullSync(env)
        await db.insert(schema.settings)
          .values({ key: 'ms_last_sync', value: now })
          .onConflictDoUpdate({ target: schema.settings.key, set: { value: now } })
      } catch (e) {
        console.error('[cron] ms-todo failed:', e)
      }

      // 2. IMA 同步（笔记 + 知识库），独立 catch 不阻塞
      try {
        await syncNotes(env)
        await syncKnowledgeBase(env)
        await db.insert(schema.settings)
          .values({ key: 'ima_last_sync', value: now })
          .onConflictDoUpdate({ target: schema.settings.key, set: { value: now } })
      } catch (e) {
        console.error('[cron] ima failed:', e)
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
