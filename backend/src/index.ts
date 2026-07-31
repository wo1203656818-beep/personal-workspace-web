import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import type { Env } from './types'

// 路由模块
import auth from './routes/auth'
import tasks from './routes/tasks'
import subtasks from './routes/subtasks'
import ai from './routes/ai'
import aiChat from './routes/ai-chat'
import notes from './routes/notes'
import kb from './routes/kb'
import ima from './routes/ima'
import settings from './routes/settings'
import news from './routes/news'
import telegram from './routes/telegram'
import monitor from './routes/monitor'
import tools from './routes/tools'
import tags from './routes/tags'
import decisionRules from './routes/decision-rules'
import decisionTemplates from './routes/decision-templates'
import decisionLogs from './routes/decision-logs'
import mood from './routes/mood'
import declutter from './routes/declutter'
import nightlyReview from './routes/nightly-review'
import entertainment from './routes/entertainment'
import { listAiConfigs, createAiConfig, updateAiConfig, deleteAiConfig, setDefaultAiConfig, testAiConfig } from './ai-configs'

// MCP + Cron
import { verifyMcpAuth, handleMcp } from './mcp'
import { handleScheduled } from './cron'

const app = new Hono<{ Bindings: Env }>()

// ═══════════════════════════════════════
// 中间件
// ═══════════════════════════════════════

app.use('*', cors({
  origin: (_origin, c) => c.env.ALLOWED_ORIGIN ?? '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  maxAge: 86400,
}))

// JWT 认证 — 白名单路径免鉴权
const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/settings/ms-todo/callback',
  '/api/news/refresh-status',
  '/api/telegram/webhook',
])

app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (PUBLIC_PATHS.has(path)) return next()
  return jwt({ secret: c.env.JWT_SECRET, alg: 'HS256' })(c, next)
})

// 全局错误处理
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  const requestId = crypto.randomUUID()
  console.error(`[server] unhandled error [${requestId}]:`, err)
  if (err.name === 'ZodError') {
    return c.json({ error: '请求参数校验失败', details: (err as any).errors }, 422)
  }
  if (err instanceof SyntaxError && err.message.includes('JSON')) {
    return c.json({ error: '请求体 JSON 格式错误' }, 400)
  }
  return c.json({ error: '服务器内部错误', requestId }, 500)
})

// ═══════════════════════════════════════
// 健康检查
// ═══════════════════════════════════════

app.get('/health', async (c) => {
  const start = Date.now()
  const checks: Record<string, number> = {}

  // 探测 D1 连通性
  try {
    await c.env.DB.prepare('SELECT 1').first()
    checks.db = Date.now() - start
  } catch {
    checks.db = -1
  }

  // 探测 KV 连通性
  try {
    const kvStart = Date.now()
    await c.env.CACHE.get('__health__')
    checks.kv = Date.now() - kvStart
  } catch {
    checks.kv = -1
  }

  const healthy = Object.values(checks).every(v => v >= 0)
  return c.json({
    status: healthy ? 'ok' : 'degraded',
    latency: checks,
    bindings: {
      db: !!c.env.DB,
      kv: !!c.env.CACHE,
      r2: !!c.env.STORAGE,
      ai: !!c.env.AI,
      vectorize: !!c.env.VECTORIZE,
    },
  }, healthy ? 200 : 503)
})

// ═══════════════════════════════════════
// 路由注册
// ═══════════════════════════════════════

// AI 配置管理 CRUD
const aiConfigRoutes = new Hono<{ Bindings: Env }>()
aiConfigRoutes.get('/', async (c) => c.json(await listAiConfigs(c.env)))
aiConfigRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const id = await createAiConfig(c.env, body)
  return c.json({ id }, 201)
})
aiConfigRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  await updateAiConfig(c.env, id, body)
  return c.json({ ok: true })
})
aiConfigRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await deleteAiConfig(c.env, id)
  return c.json({ ok: true })
})
aiConfigRoutes.post('/:id/default', async (c) => {
  const id = c.req.param('id')
  await setDefaultAiConfig(c.env, id)
  return c.json({ ok: true })
})
aiConfigRoutes.post('/test', async (c) => {
  const body = await c.req.json()
  const result = await testAiConfig(c.env, body)
  return c.json(result)
})

app.route('/api/auth', auth)
app.route('/api/tasks', tasks)
app.route('/api/subtasks', subtasks)
app.route('/api/ai', ai)
app.route('/api/ai/chat', aiChat)
app.route('/api/notes', notes)
app.route('/api/kb', kb)
app.route('/api/ima', ima)
app.route('/api/settings', settings)
app.route('/api/news', news)
app.route('/api/telegram', telegram)
app.route('/api/monitor', monitor)
app.route('/api', tools)          // coin/* + tools/* + sync-logs
app.route('/api/tags', tags)
app.route('/api/decision-rules', decisionRules)
app.route('/api/decision-templates', decisionTemplates)
app.route('/api/decision-logs', decisionLogs)
app.route('/api/mood', mood)
app.route('/api/declutter', declutter)
app.route('/api/nightly-review', nightlyReview)
app.route('/api', entertainment)
app.route('/api/ai-configs', aiConfigRoutes)

// 根路径
app.get('/', (c) => c.json({ name: 'personal-workspace-api', version: '2.0.0' }))

// ═══════════════════════════════════════
// 导出
// ═══════════════════════════════════════

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

  scheduled: handleScheduled,
}
