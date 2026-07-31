import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, or, like, desc, asc, sql } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { nowBeijing, todayCST } from '../time'
import { decrypt } from '../crypto-utils'
import {
  fetchSourcesByCategory, fetchSingleSource,
  processPendingItems, generateDailyDigest, pushDailyBrief,
} from '../news-fetcher'
import { PRESET_FEED_SOURCES } from '../news-sources'

const news = new Hono<{ Bindings: Env }>()

// 获取新闻列表
news.get('/', async (c) => {
  const { category, source, search, page = '1', pageSize = '20', sort = 'score', saved } = c.req.query()
  const db = drizzle(c.env.DB, { schema })
  const where: any[] = []
  if (category && category !== '全部') where.push(eq(schema.feedItems.category, category))
  if (source) where.push(eq(schema.feedItems.sourceId, source))
  if (search) where.push(or(like(schema.feedItems.title, `%${search}%`), like(schema.feedItems.aiSummary, `%${search}%`)))
  if (saved === '1') {
    where.push(sql`EXISTS (SELECT 1 FROM news_feedback WHERE target_id = feed_items.id AND target_type = 'item' AND feedback = 'save')`)
  }

  const p = Math.max(1, parseInt(page))
  const ps = Math.min(100, Math.max(1, parseInt(pageSize)))
  const offset = (p - 1) * ps

  // 排序逻辑
  let orderBy: any[]
  if (sort === 'time') {
    orderBy = [desc(schema.feedItems.fetchedAt)]
  } else if (sort === 'personal') {
    // 个性化排序：收藏 > 👍 > 无反馈 > 👎（隐藏到末尾）
    const personalOrder = sql`CASE
      WHEN EXISTS (SELECT 1 FROM news_feedback WHERE target_id = feed_items.id AND target_type = 'item' AND feedback = 'save') THEN 0
      WHEN EXISTS (SELECT 1 FROM news_feedback WHERE target_id = feed_items.id AND target_type = 'item' AND feedback = 'up') THEN 1
      WHEN EXISTS (SELECT 1 FROM news_feedback WHERE target_id = feed_items.id AND target_type = 'item' AND feedback = 'down') THEN 3
      ELSE 2
    END`
    orderBy = [asc(personalOrder), desc(schema.feedItems.aiScore), desc(schema.feedItems.fetchedAt)]
  } else {
    orderBy = [desc(schema.feedItems.aiScore), desc(schema.feedItems.fetchedAt)]
  }

  // 窗口函数：单次查询同时返回分页数据和总数，避免双扫描
  const totalExpr = sql<number>`COUNT(*) OVER()`
  const rows = await db.select({ item: schema.feedItems, total: totalExpr })
    .from(schema.feedItems)
    .where(where.length ? and(...where) : undefined)
    .orderBy(...orderBy)
    .limit(ps)
    .offset(offset)

  const items = rows.map(r => r.item)
  const total = Number(rows[0]?.total ?? 0)

  // 按需触发 AI 处理：若列表中存在未处理条目（aiScore<=0），异步处理一批（最多 20 条），不阻塞本次响应
  // aiScore: 负数=待处理（含优先级），0=未处理，正数=已评分，-1=AI失败
  if (items.some((it: any) => it.aiScore <= 0)) {
    c.executionCtx.waitUntil(
      processPendingItems(c.env, 20).catch((e) =>
        console.error('[news] on-demand AI processing failed:', e)
      )
    )
  }

  return c.json({
    items,
    pagination: { page: p, pageSize: ps, total },
  })
})

// 手动触发新闻 AI 处理（用户主动点击"处理未分析新闻"按钮时调用）
news.post('/process', async (c) => {
  try {
    const { limit = 5 } = await c.req.json<{ limit?: number }>().catch(() => ({ limit: 5 }))
    // 单次最多处理 10 条，避免 Workers 总执行时间超限
    const effectiveLimit = Math.min(10, Math.max(1, limit))
    const { processed, failed } = await processPendingItems(c.env, effectiveLimit)
    return c.json({ ok: true, processed, failed })
  } catch (e: any) {
    console.error('[news/process] error:', e?.message || e, e?.stack)
    return c.json({ ok: false, error: e?.message || '处理失败' }, 500)
  }
})

// 获取订阅源列表
news.get('/sources', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const sources = await db.select().from(schema.feedSources).orderBy(schema.feedSources.category, schema.feedSources.name)
  return c.json(sources)
})

// 资讯分类列表（从 sources 动态聚合）
news.get('/categories', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select({ category: schema.feedSources.category }).from(schema.feedSources).groupBy(schema.feedSources.category)
  const cats = rows.map(r => r.category).filter(Boolean).sort()
  return c.json(cats)
})

// 批量更新订阅源启用状态
news.put('/sources', async (c) => {
  const body = await c.req.json()
  const db = drizzle(c.env.DB, { schema })
  for (const s of body) {
    await db.update(schema.feedSources)
      .set({ enabled: s.enabled, updatedAt: nowBeijing() })
      .where(eq(schema.feedSources.id, s.id))
  }
  return c.json({ ok: true })
})

// 新增自定义订阅源
news.post('/sources', async (c) => {
  const { name, url, type, category, lang = 'zh', enabled = true } = await c.req.json()
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()
  await db.insert(schema.feedSources).values({ id, name, url, type, category, lang, enabled })
  return c.json({ ok: true, id }, 201)
})

// 删除订阅源
news.delete('/sources/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  await db.delete(schema.feedItems).where(eq(schema.feedItems.sourceId, id))
  await db.delete(schema.feedSources).where(eq(schema.feedSources.id, id))
  return c.json({ ok: true })
})

// 获取每日简报列表或单期
news.get('/digests', async (c) => {
  const date = c.req.query('date')
  const db = drizzle(c.env.DB, { schema })
  if (date) {
    const digest = await db.select().from(schema.dailyDigests).where(eq(schema.dailyDigests.date, date)).limit(1)
    return c.json(digest[0] || null)
  }
  const digests = await db.select().from(schema.dailyDigests).orderBy(desc(schema.dailyDigests.date)).limit(30)
  return c.json(digests)
})

// 今日简报（快捷接口：返回今日 brief，无则 null）
news.get('/today', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const today = todayCST()
  const brief = await db.select().from(schema.dailyDigests).where(eq(schema.dailyDigests.date, today)).limit(1)
  return c.json(brief[0] || null)
})

// 抓取进度状态：用 KV 跟踪单分类抓取结果，前端逐个分类调用
const REFRESH_STATUS_KEY = 'news:refresh:status'

interface RefreshStatus {
  status: 'idle' | 'running' | 'done' | 'failed'
  startedAt: number
  finishedAt?: number
  totalFetched: number
  totalErrors: string[]
  categories: Array<{
    name: string
    status: 'pending' | 'running' | 'done' | 'failed'
    fetched?: number
    errors?: string[]
    sourceCount?: number
  }>
}

async function getRefreshStatus(env: Env): Promise<RefreshStatus | null> {
  const raw = await env.CACHE.get(REFRESH_STATUS_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as RefreshStatus } catch { return null }
}

async function setRefreshStatus(env: Env, status: RefreshStatus): Promise<void> {
  await env.CACHE.put(REFRESH_STATUS_KEY, JSON.stringify(status), { expirationTtl: 600 })
}

// 手动刷新：单分类分页同步执行，前端循环调用直到 hasMore=false
// ?category=加密&offset=0 每次处理 20 个源，避免 subrequest 超限
news.post('/refresh', async (c) => {
  try {
    const category = c.req.query('category')
    if (!category) {
      return c.json({ ok: false, error: '请指定 category 参数' }, 400)
    }
    const offset = parseInt(c.req.query('offset') || '0')
    const limit = Math.min(10, parseInt(c.req.query('limit') || '10'))

    const { fetched, errors, sourceCount, hasMore } = await fetchSourcesByCategory(c.env, category, offset, limit)

    return c.json({ ok: true, fetched, errors: errors.slice(0, 5), sourceCount, category, hasMore, nextOffset: hasMore ? offset + limit : undefined })
  } catch (e: any) {
    console.error('[news/refresh] error:', e?.message || e, e?.stack)
    return c.json({ ok: false, error: e?.message || '抓取失败' }, 500)
  }
})

// 查询抓取进度
news.get('/refresh-status', async (c) => {
  const status = await getRefreshStatus(c.env)
  return c.json({ status })
})

// 重置抓取进度（前端开始新一轮抓取前调用）
news.post('/refresh-reset', async (c) => {
  const categories = ['加密', '财经', '科技', '综合']
  const status: RefreshStatus = {
    status: 'running',
    startedAt: Date.now(),
    totalFetched: 0,
    totalErrors: [],
    categories: categories.map(name => ({ name, status: 'pending' as const })),
  }
  await setRefreshStatus(c.env, status)
  return c.json({ ok: true })
})

// 单源刷新
news.post('/refresh/:id', async (c) => {
  const { id } = c.req.param()
  const result = await fetchSingleSource(c.env, id)
  if (!result.ok) return c.json({ error: result.error || 'Source not found' }, 404)
  // 处理全部待 AI 分析的条目（limit=0 表示处理全部，上限 500）
  await processPendingItems(c.env, 0)
  return c.json({ ok: true, newItems: result.newItems })
})

// 生成每日简报
news.post('/generate-digest', async (c) => {
  const date = c.req.query('date')
  const result = await generateDailyDigest(c.env, date)
  return c.json(result)
})

// 测试 Telegram 推送（发送固定测试消息）
news.post('/test-push', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const tokenRow = await db.select().from(schema.settings).where(eq(schema.settings.key, 'telegram_bot_token'))
  const chatRow = await db.select().from(schema.settings).where(eq(schema.settings.key, 'telegram_chat_id'))
  const botToken = tokenRow[0]?.value ? await decrypt(c.env.JWT_SECRET, tokenRow[0].value) : null
  const chatId = chatRow[0]?.value || null
  if (!botToken || !chatId) {
    return c.json({ ok: false, error: 'Telegram 配置未完成，请先保存 Bot Token 和 Chat ID' }, 400)
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '✅ <b>电报推送测试</b>\n这是一条测试消息，如果你收到了，说明配置正确。',
        parse_mode: 'HTML',
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      const status = res.status
      const hint = status === 401 ? '（Bot Token 无效）'
        : status === 400 ? '（Chat ID 无效或格式错误）'
        : status === 403 ? '（bot 被禁用或被目标会话拉黑）'
        : ''
      return c.json({ ok: false, error: `Telegram API 返回 ${status} ${hint}`, detail: errText }, 502)
    }
    return c.json({ ok: true, pushed: 1, test: true })
  } catch (e: any) {
    return c.json({ ok: false, error: `网络错误: ${e.message}` }, 502)
  }
})

// 手动推送今日简报到 Telegram
news.post('/push-brief', async (c) => {
  const result = await pushDailyBrief(c.env)
  if (!result.ok && result.error) {
    return c.json(result, 400)
  }
  return c.json(result)
})

// 用户反馈（👍/👎/收藏）
news.post('/feedback', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const { targetType, targetId, feedback, reason } = await c.req.json<{
    targetType: 'item' | 'brief'
    targetId: string
    feedback: 'up' | 'down' | 'save'
    reason?: string
  }>()
  if (!targetType || !targetId || !feedback) {
    return c.json({ ok: false, error: '参数缺失' }, 400)
  }
  // 同一对象同一反馈类型幂等：先删后插
  await db.delete(schema.newsFeedback).where(and(
    eq(schema.newsFeedback.targetType, targetType),
    eq(schema.newsFeedback.targetId, targetId),
    eq(schema.newsFeedback.feedback, feedback),
  ))
  await db.insert(schema.newsFeedback).values({
    id: crypto.randomUUID(),
    targetType,
    targetId,
    feedback,
    reason: reason || null,
  })
  return c.json({ ok: true })
})

// 获取用户反馈列表（用于前端显示已反馈状态）
news.get('/feedback', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const days = Number(c.req.query('days') || 30)
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const rows = await db.select()
    .from(schema.newsFeedback)
    .where(sql`${schema.newsFeedback.createdAt} >= ${since}`)
    .orderBy(desc(schema.newsFeedback.createdAt))
    .limit(500)
  return c.json(rows)
})

// 初始化预置订阅源
news.post('/init-sources', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  // 一次性查询所有现有源，避免 N+1 查询
  const existingSources = await db.select({ id: schema.feedSources.id, url: schema.feedSources.url }).from(schema.feedSources)
  const existingUrls = new Set(existingSources.map(s => s.url))

  // 批量插入新源（跳过已存在的）
  const toInsert = PRESET_FEED_SOURCES
    .filter(s => !existingUrls.has(s.url))
    .map(s => ({
      id: crypto.randomUUID(),
      name: s.name,
      url: s.url,
      type: s.type,
      category: s.category,
      lang: s.lang || 'zh',
      enabled: true,
      weight: s.weight ?? 3,
    }))

  let inserted = 0
  // 分批插入（每批 20 条），避免单条 SQL 参数过多
  for (let i = 0; i < toInsert.length; i += 20) {
    const batch = toInsert.slice(i, i + 20)
    try {
      await db.insert(schema.feedSources).values(batch)
      inserted += batch.length
    } catch (e) {
      console.error('[init-sources] batch insert failed:', e)
    }
  }

  // 更新已存在源的 category 和 weight
  const toUpdate = PRESET_FEED_SOURCES.filter(s => existingUrls.has(s.url))
  for (const s of toUpdate) {
    const existing = existingSources.find(e => e.url === s.url)
    if (existing) {
      try {
        await db.update(schema.feedSources)
          .set({ category: s.category, weight: s.weight ?? 3 })
          .where(eq(schema.feedSources.id, existing.id))
      } catch {}
    }
  }
  return c.json({ ok: true, inserted })
})

// 重置资讯源：删除所有旧源，重新插入精选源
news.post('/reset-sources', async (c) => {
  const db = drizzle(c.env.DB, { schema })

  // 先删除所有 feedItems（外键依赖）
  await db.delete(schema.feedItems)
  // 再删除所有旧源
  const deleted = await db.delete(schema.feedSources)

  // 插入精选源
  const toInsert = PRESET_FEED_SOURCES.map(s => ({
    id: crypto.randomUUID(),
    name: s.name,
    url: s.url,
    type: s.type,
    category: s.category,
    lang: s.lang || 'zh',
    enabled: true,
    weight: s.weight ?? 3,
  }))

  let inserted = 0
  for (let i = 0; i < toInsert.length; i += 20) {
    const batch = toInsert.slice(i, i + 20)
    try {
      await db.insert(schema.feedSources).values(batch)
      inserted += batch.length
    } catch (e) {
      console.error('[reset-sources] batch insert failed:', e)
    }
  }

  return c.json({ ok: true, deleted: deleted.meta.changes, inserted })
})

export default news
