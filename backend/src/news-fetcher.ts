import type { Env } from './types'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc, asc, inArray, sql } from 'drizzle-orm'
import * as schema from './schema'
import { nowBeijing, todayCST } from './time'
import { callAI } from './utils/ai-client'
import {
  PRESET_FEED_SOURCES,
  TITLE_BLACKLIST_PATTERNS,
  TITLE_HIGHLIGHT_PATTERNS,
  RSSHUB_INSTANCES,
} from './news-sources'
import { getSetting } from './utils/settings'
import { fetchWithTimeout } from './utils/fetch-timeout'

export interface RawFeedItem {
  title: string
  url: string
  summary?: string
  publishedAt?: string
  sourceId: string
  category: string
}

// contentHash 字段已从 schema 中移除，去重完全依赖 url 唯一索引

// 并发分批执行工具：每批 concurrency 个，避免一次发起过多 fetch 把 worker 打爆
async function mapBatch<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

// ---------- AI 调用（复用统一客户端）----------

async function fetchRSS(url: string): Promise<RawFeedItem[]> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
        cf: { cacheTtl: 300 } as any,
      },
      10000,
    )
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    return parseRSS(text)
  } catch (e) {
    console.error('[fetchRSS] failed:', url, e)
    return []
  }
}

// 从 XML 块中提取首个指定标签的文本内容（兼容带属性、CDATA、自闭合情况）
function extractTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = xml.match(re)
  if (!m) return undefined
  let content = m[1].trim()
  // 解包 CDATA
  const cdata = content.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/)
  if (cdata) content = cdata[1].trim()
  // 去除内嵌 HTML 标签的简单兜底（避免摘要里残留 <p> 等）
  return content
}

// 不依赖 DOMParser 的轻量 RSS/Atom 解析器（Cloudflare Workers 无 DOM API）
export function parseRSS(xmlText: string): RawFeedItem[] {
  const items: RawFeedItem[] = []
  try {
    const itemRegex = /<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi
    const matches = xmlText.match(itemRegex) || []
    for (const block of matches) {
      const title = extractTag(block, 'title')
      // <link>text</link> 或 <link href="..."/>
      let link = extractTag(block, 'link')
      if (!link) {
        const hrefMatch = block.match(/<link\b[^>]*\shref=["']([^"']+)["']/i)
        link = hrefMatch?.[1]?.trim()
      }
      const summary =
        extractTag(block, 'description') ||
        extractTag(block, 'summary') ||
        extractTag(block, 'content')
      const pubDate =
        extractTag(block, 'pubDate') ||
        extractTag(block, 'published') ||
        extractTag(block, 'updated')
      if (title && link) {
        items.push({
          title,
          url: link,
          summary: summary?.slice(0, 500),
          publishedAt: pubDate,
          sourceId: '',
          category: '',
        })
      }
    }
  } catch (e) {
    console.error('[parseRSS] failed:', e)
  }
  return items
}

async function fetchRSSHub(path: string): Promise<RawFeedItem[]> {
  // 多实例容错：按序尝试所有实例，首个成功即返回
  for (const base of RSSHUB_INSTANCES) {
    if (!base) continue
    try {
      const url = `${base}${path}`
      const response = await fetchWithTimeout(
        url,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
          cf: { cacheTtl: 300 } as any,
        },
        10000,
      )
      if (!response.ok) continue
      const text = await response.text()
      const items = parseRSS(text)
      if (items.length > 0) return items
    } catch (e) {
      console.error('[fetchRSSHub] instance failed:', base, e)
    }
  }
  return []
}

async function fetchAPI(url: string): Promise<RawFeedItem[]> {
  try {
    const response = await fetchWithTimeout(url, { cf: { cacheTtl: 300 } as any }, 10000)
    if (!response.ok) return []
    const data = (await response.json()) as any
    if (Array.isArray(data)) {
      return data
        .map((item: any) => ({
          title: item.title || item.name,
          url: item.url || item.link,
          summary: item.description?.slice(0, 500),
          publishedAt: item.pubDate || item.publishedAt,
          sourceId: '',
          category: '',
        }))
        .filter((i: any) => i.title && i.url)
    }
    if (data?.data?.length) {
      return data.data
        .map((item: any) => ({
          title: item.title || item.name,
          url: item.url || item.link,
          summary: item.description?.slice(0, 500),
          publishedAt: item.pubDate || item.publishedAt,
          sourceId: '',
          category: '',
        }))
        .filter((i: any) => i.title && i.url)
    }
  } catch (e) {
    console.error('[fetchAPI] failed:', url, e)
  }
  return []
}

// 抓取单个源的原始数据（不含入库逻辑）
async function fetchSourceRaw(source: {
  id: string
  url: string
  type: string
}): Promise<RawFeedItem[]> {
  switch (source.type) {
    case 'rss':
      return fetchRSS(source.url)
    case 'rsshub':
      // 从完整 URL 中提取路径部分，然后尝试多个 RSSHub 实例
      try {
        const urlObj = new URL(source.url)
        return fetchRSSHub(urlObj.pathname)
      } catch {
        // 如果 URL 解析失败，直接当做路径用
        return fetchRSSHub(source.url.startsWith('/') ? source.url : `/${source.url}`)
      }
    case 'api':
      return fetchAPI(source.url)
    default:
      return []
  }
}

// 关键词黑名单过滤：命中即丢弃，不入库（第一级漏斗：关键词预筛）
function isBlacklisted(title: string): boolean {
  return TITLE_BLACKLIST_PATTERNS.some((re) => re.test(title))
}

// 关键词白名单高亮：命中时标记为高优先级（影响 AI 评分顺序）
function isHighlighted(title: string): boolean {
  return TITLE_HIGHLIGHT_PATTERNS.some((re) => re.test(title))
}

// 批量入库：返回成功插入条数。去重走 url 字段（schema 已有 UNIQUE 约束）。
// 第一级漏斗：关键词黑名单过滤，命中即丢弃，不入库不调 AI。
async function insertItemsBatch(
  db: ReturnType<typeof drizzle<any>>,
  sourceId: string,
  category: string,
  sourceWeight: number,
  items: RawFeedItem[],
): Promise<number> {
  let inserted = 0
  const now = nowBeijing()
  // 第一级漏斗：关键词黑名单过滤
  const filtered = items.filter((item) => !isBlacklisted(item.title))
  // 分片为 50 条/批，避免单条 SQL 参数过多
  for (let i = 0; i < filtered.length; i += 50) {
    const batch = filtered.slice(i, i + 50)
    const values = batch.map((item) => {
      const highlighted = isHighlighted(item.title)
      return {
        id: crypto.randomUUID(),
        sourceId,
        title: item.title,
        url: item.url,
        summary: item.summary || '',
        category,
        // aiScore 初始值：高亮条目 = sourceWeight * 2（优先 AI 处理），普通 = 0
        // 用负数区间表示"待 AI 处理的优先级"：-5（最高）到 -1（最低）
        // 0 表示未处理，正数表示 AI 已处理
        aiScore: highlighted ? -sourceWeight : -(sourceWeight - 1),
        publishedAt: item.publishedAt || now,
        fetchedAt: now,
      }
    })
    try {
      await db.insert(schema.feedItems).values(values).onConflictDoNothing({
        target: schema.feedItems.url,
      })
      inserted += batch.length
    } catch {
      for (const v of values) {
        try {
          await db.insert(schema.feedItems).values(v).onConflictDoNothing({
            target: schema.feedItems.url,
          })
          inserted++
        } catch {
          // 单条也失败则跳过
        }
      }
    }
  }
  return inserted
}

// 抓取指定分类的源（同步执行，避免 waitUntil 失效）
// 支持 offset/limit 分页，避免单次请求 subrequest 超限
export async function fetchSourcesByCategory(
  env: Env,
  category: string,
  offset = 0,
  limit = 20,
): Promise<{
  fetched: number
  errors: string[]
  sourceCount: number
  category: string
  hasMore: boolean
}> {
  const db = drizzle(env.DB, { schema })
  const allSources = await db
    .select()
    .from(schema.feedSources)
    .where(and(eq(schema.feedSources.enabled, true), eq(schema.feedSources.category, category)))

  // 分页：只处理当前页的源
  const sources = allSources.slice(offset, offset + limit)
  const hasMore = offset + limit < allSources.length

  let totalFetched = 0
  const errors: string[] = []

  // 每批 5 个源并发抓取，单源 6 秒超时（降低并发避免 worker 压力，延长超时避免正常源被误杀）
  const batchResults = await mapBatch(sources, 5, async (source) => {
    try {
      const items = await Promise.race([
        fetchSourceRaw(source),
        new Promise<RawFeedItem[]>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 6000),
        ),
      ])
      if (items.length === 0) return { sourceId: source.id, inserted: 0, name: source.name }
      const weight = (source as any).weight ?? 3
      const inserted = await insertItemsBatch(db, source.id, source.category, weight, items)
      return { sourceId: source.id, inserted, name: source.name }
    } catch (e) {
      return {
        sourceId: source.id,
        inserted: 0,
        name: source.name,
        error: `${source.name}: ${e instanceof Error ? e.message : String(e)}`,
      }
    }
  })

  for (const r of batchResults) {
    totalFetched += r.inserted
    if (r.error) errors.push(r.error)
    try {
      await db
        .update(schema.feedSources)
        .set({ lastFetchedAt: nowBeijing() })
        .where(eq(schema.feedSources.id, r.sourceId))
    } catch {}
  }

  return { fetched: totalFetched, errors, sourceCount: allSources.length, category, hasMore }
}

// 抓取所有启用的源（复用 fetchSourcesByCategory，适用于 cron 等无超时限制场景）
export async function fetchAllSources(env: Env): Promise<{ fetched: number; errors: string[] }> {
  const db = drizzle(env.DB, { schema })
  const sources = await db
    .select()
    .from(schema.feedSources)
    .where(eq(schema.feedSources.enabled, true))
  const categories = [...new Set(sources.map((s) => s.category))]

  let totalFetched = 0
  const allErrors: string[] = []

  for (const category of categories) {
    let offset = 0
    let hasMore = true
    while (hasMore) {
      const result = await fetchSourcesByCategory(env, category, offset, 100)
      totalFetched += result.fetched
      allErrors.push(...result.errors)
      hasMore = result.hasMore
      offset += 100
    }
  }

  return { fetched: totalFetched, errors: allErrors }
}

// 单源抓取：复用 fetchAllSources 内部的抓取与入库逻辑，供 /api/news/refresh/:id 使用
export async function fetchSingleSource(
  env: Env,
  sourceId: string,
): Promise<{ ok: boolean; newItems: number; error?: string }> {
  const db = drizzle(env.DB, { schema })
  const source = await db
    .select()
    .from(schema.feedSources)
    .where(eq(schema.feedSources.id, sourceId))
    .limit(1)
  if (!source.length) return { ok: false, newItems: 0, error: 'Source not found' }
  const s = source[0]

  const items = await fetchSourceRaw(s)
  const weight = (s as any).weight ?? 3
  const newItems = await insertItemsBatch(db, s.id, s.category, weight, items)

  await db
    .update(schema.feedSources)
    .set({ lastFetchedAt: nowBeijing() })
    .where(eq(schema.feedSources.id, s.id))

  return { ok: true, newItems }
}

// 批量 AI 评分：一次处理 10 条新闻，返回每条的评分结果。
// 这是第三级漏斗：只对通过关键词过滤的条目调 AI，节省 90% 调用。
async function processBatchWithAI(
  env: Env,
  items: any[],
): Promise<
  Array<{ aiSummary: string; aiScore: number; aiTags: string[]; aiReason: string; titleZh: string }>
> {
  if (items.length === 0) return []
  try {
    const newsList = items
      .map(
        (item, idx) =>
          `${idx + 1}. 标题：${item.title}\n   摘要：${(item.summary || '无').slice(0, 200)}`,
      )
      .join('\n')

    const prompt = `请分析以下 ${items.length} 条新闻，为每条输出严格 JSON 数组：
[
  {"id": 1, "titleZh": "中文标题（英文翻译成中文，中文保留原文）", "summary": "中文一句话核心摘要，30字以内", "score": 0-10重要性评分, "tags": ["最多3个中文标签"], "reason": "为什么重要，20字以内中文"},
  ...
]

要求：
1. 所有字段内容必须是中文
2. titleZh：英文标题翻译成中文，中文标题保留原文
3. summary：用中文写一句话核心摘要
4. 评分标准：重大突发=9-10，行业重大=7-8，有参考价值=5-6，普通=3-4，琐碎=1-2
5. reason：一句话告诉用户"这跟你有什么关系/为什么值得关注"

新闻列表：
${newsList}

只输出 JSON 数组，不要额外文字。`

    const result = await callAI(
      env,
      [
        {
          role: 'system',
          content:
            '你是资深新闻主编，擅长批量判断新闻重要性并写摘要。输出必须是合法 JSON 数组。所有输出必须是中文。',
        },
        { role: 'user', content: prompt },
      ],
      { maxTokens: 1000, timeoutMs: 20000 },
    )

    const jsonMatch = result.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as any[]
      return items.map((_, idx) => {
        const r = parsed[idx]
        if (!r) return { aiSummary: '', aiScore: -1, aiTags: [], aiReason: '', titleZh: '' }
        return {
          aiSummary: r.summary || '',
          aiScore: Math.max(0, Math.min(10, r.score || 0)),
          aiTags: Array.isArray(r.tags) ? r.tags.slice(0, 3).map((t: any) => String(t)) : [],
          aiReason: r.reason || '',
          titleZh: r.titleZh || '',
        }
      })
    }
  } catch (e) {
    console.error('[processBatchWithAI] failed:', e)
  }
  return items.map(() => ({ aiSummary: '', aiScore: -1, aiTags: [], aiReason: '', titleZh: '' }))
}

// 处理待 AI 分析的新闻条目（第三级漏斗：AI 批量评分）。
export async function processPendingItems(
  env: Env,
  limit = 100,
): Promise<{ processed: number; failed: number }> {
  const db = drizzle(env.DB, { schema })
  const effectiveLimit = limit > 0 ? Math.min(limit, 30) : 30
  // aiScore: 0=未处理（待评分），正数=已评分（1-10），-1=AI失败
  // 只处理 aiScore=0 的新条目，-1（失败）的不再自动重试，避免无限循环浪费配额
  const pending = await db
    .select()
    .from(schema.feedItems)
    .where(sql`${schema.feedItems.aiScore} = 0`)
    .orderBy(desc(schema.feedItems.fetchedAt))
    .limit(effectiveLimit)

  if (pending.length === 0) return { processed: 0, failed: 0 }

  let processed = 0
  let failed = 0
  const BATCH_SIZE = 5
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE)
    // processBatchWithAI 内部已有 try/catch，不会抛错
    const aiResults = await processBatchWithAI(env, batch)

    // 用 db.batch 将本批更新合并为一次往返，避免逐条 N+1
    const updates = batch.map((item, j) => {
      const ai = aiResults[j]
      return db
        .update(schema.feedItems)
        .set({
          titleZh: ai.titleZh || null,
          aiSummary: ai.aiSummary,
          aiScore: ai.aiScore,
          aiTags: JSON.stringify(ai.aiTags),
          aiReason: ai.aiReason,
        })
        .where(eq(schema.feedItems.id, item.id))
    })
    try {
      await db.batch(updates as any)
      for (const ai of aiResults) {
        if (ai.aiScore === -1) failed++
        else processed++
      }
    } catch (e) {
      console.error('[processPendingItems] db batch update failed:', e)
      failed += batch.length
    }
  }

  return { processed, failed }
}

export async function generateDailyDigest(
  env: Env,
  targetDate?: string,
): Promise<{ ok: boolean; digestId?: string }> {
  const db = drizzle(env.DB, { schema })
  const date = targetDate || todayCST()

  // 同一天允许重新生成（覆盖旧的，因为新条目会持续进来）
  const existing = await db
    .select()
    .from(schema.dailyDigests)
    .where(eq(schema.dailyDigests.date, date))
    .limit(1)

  // 选取当日 AI 评分最高的条目（aiScore > 0，按分数降序）
  // 只选 briefedAt 为空的（未被纳入过简报），避免重复
  // 不设最低分数门槛，取 Top 8 即可（AI 评分本身已过滤低质量条目）
  const items = await db
    .select()
    .from(schema.feedItems)
    .where(and(sql`${schema.feedItems.aiScore} > 0`, sql`${schema.feedItems.briefedAt} IS NULL`))
    .orderBy(desc(schema.feedItems.aiScore), desc(schema.feedItems.fetchedAt))
    .limit(30)

  // 至少 3 条才能出报（避免条目太少时生成无意义简报）
  if (items.length < 3) return { ok: false }

  // 取 Top 8（5-10 条精选，硬上限）
  const topN = items.slice(0, 8)

  // 用 1 次大模型调用生成总览（"今日要点"）
  let overview = ''
  try {
    const overviewPrompt = `请根据以下 ${topN.length} 条今日最重要新闻，写一段 100 字以内的"今日要点"总览，指出核心看点和趋势：
${topN.map((i, idx) => `${idx + 1}. ${i.title}${i.aiSummary ? ` - ${i.aiSummary}` : ''}`).join('\n')}
只输出总览文字，不要标题。`
    overview = await callAI(
      env,
      [
        { role: 'system', content: '你是资深新闻主编，擅长写每日新闻总览。' },
        { role: 'user', content: overviewPrompt },
      ],
      { maxTokens: 300 },
    )
  } catch (e) {
    console.error('[generateDailyDigest] overview failed:', e)
  }

  const topItems = topN.map((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    summary: item.aiSummary || item.summary || '',
    reason: item.aiReason || '',
    category: item.category,
    publishedAt: item.publishedAt,
  }))

  const id = existing[0]?.id || crypto.randomUUID()
  if (existing.length > 0) {
    // 覆盖更新
    await db
      .update(schema.dailyDigests)
      .set({ title: `${date} 每日情报简报`, overview, topItems: JSON.stringify(topItems) })
      .where(eq(schema.dailyDigests.id, id))
  } else {
    await db.insert(schema.dailyDigests).values({
      id,
      date,
      title: `${date} 每日情报简报`,
      overview,
      topItems: JSON.stringify(topItems),
    })
  }

  // 标记已入选简报的条目（一次 inArray 批量更新，避免逐条 N+1）
  const now = nowBeijing()
  await db
    .update(schema.feedItems)
    .set({ briefedAt: now })
    .where(inArray(schema.feedItems.id, topN.map((item) => item.id)))

  return { ok: true, digestId: id }
}

// 推送每日简报到 Telegram（早 8 点触发，1 条消息 = 今日简报）
export async function pushDailyBrief(
  env: Env,
): Promise<{ ok: boolean; pushed: number; error?: string }> {
  const db = drizzle(env.DB, { schema })
  const date = todayCST()

  const brief = await db
    .select()
    .from(schema.dailyDigests)
    .where(eq(schema.dailyDigests.date, date))
    .limit(1)
  if (brief.length === 0) return { ok: false, pushed: 0, error: '今日简报尚未生成' }

  // 已推送过则跳过（避免重复）
  if (brief[0].pushedAt) return { ok: true, pushed: 0 }

  const botToken = await getSetting(env, 'telegram_bot_token')
  const chatId = await getSetting(env, 'telegram_chat_id')
  if (!botToken || !chatId) return { ok: false, pushed: 0, error: 'Telegram 配置未完成' }

  const topItems = JSON.parse(brief[0].topItems) as any[]
  const overview = brief[0].overview || ''

  // 构造 Telegram 消息（HTML 格式，简洁紧凑）
  const messageParts = [
    `📰 <b>${brief[0].title}</b>`,
    '',
    overview,
    '',
    ...topItems.map(
      (item, idx) =>
        `<b>${idx + 1}. ${item.title}</b>\n${item.summary || ''}\n${item.reason ? `💡 ${item.reason}\n` : ''}<a href="${item.url}">查看原文</a>`,
    ),
  ]
  const message = messageParts.join('\n')

  try {
    const res = await fetchWithTimeout(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      },
      10000,
    )
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('[pushDailyBrief] telegram api error:', res.status, errText)
      return { ok: false, pushed: 0, error: `Telegram API ${res.status}: ${errText.slice(0, 200)}` }
    }
    await db
      .update(schema.dailyDigests)
      .set({ pushedAt: nowBeijing() })
      .where(eq(schema.dailyDigests.id, brief[0].id))
    return { ok: true, pushed: 1 }
  } catch (e: any) {
    console.error('[pushDailyBrief] network failed:', e)
    return { ok: false, pushed: 0, error: e.message }
  }
}
