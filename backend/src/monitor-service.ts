/**
 * 自媒体对标监控（Layer A）
 * 能力：热榜选题监控（60s 开源 API，CF 友好）+ YouTube 竞品频道对标（Data API v3）
 * 数据沉淀到 D1，cron 每日生成「今日创作选题」简报并推送 Telegram。
 */
import { drizzle } from 'drizzle-orm/d1'
import { eq, desc, and, sql } from 'drizzle-orm'
import * as schema from './schema'
import type { Env } from './types'
import { callAI } from './utils/ai-client'
import { decrypt } from './crypto-utils'
import { nowBeijing, todayBeijing, nowCST, todayCST } from './time'
import { getSetting } from './utils/settings'
import { fetchWithTimeout } from './utils/fetch-timeout'

// 热榜多源聚合：Worker 出口在 Cloudflare 网段，部分源（如 60s.viki.moe，其自身架在 Cloudflare 上并开启 Bot Fight）
// 会对 CF→CF 请求返回 403 挑战页，故采用多源容错，按序尝试，首个返回有效数据的源胜出。
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let tablesReady = false
async function ensureMonitorTables(env: Env) {
  if (tablesReady) return
  // 表通常由迁移（drizzle/0020）或 wrangler d1 execute 预先创建；
  // 这里仅做兜底，失败（如已存在/权限受限）不阻断主流程。
  const stmts = [
    `CREATE TABLE IF NOT EXISTS monitor_targets (id TEXT PRIMARY KEY, type TEXT NOT NULL, platform TEXT NOT NULL, label TEXT NOT NULL, target_id TEXT, keyword TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT, updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS monitor_snapshots (id TEXT PRIMARY KEY, date TEXT NOT NULL, type TEXT NOT NULL, platform TEXT NOT NULL, target_id TEXT, items TEXT NOT NULL, fetched_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS monitor_briefs (id TEXT PRIMARY KEY, date TEXT NOT NULL UNIQUE, title TEXT NOT NULL, content TEXT NOT NULL, source_count INTEGER NOT NULL DEFAULT 0, pushed_at TEXT, created_at TEXT)`,
  ]
  for (const s of stmts) {
    try {
      await env.DB.prepare(s).run()
    } catch (e: any) {
      /* 已存在则忽略 */
    }
  }
  tablesReady = true
}

// ---------- 热榜抓取（多源容错）----------
export interface HotItem {
  title: string
  url?: string
  heat?: number
  desc?: string
}

interface HotProvider {
  name: string
  url: (token: string) => string
  parse: (j: any) => any[]
}

const asArray = (x: any): any[] => (Array.isArray(x) ? x : [])
const mapItem = (it: any): HotItem => ({
  title: String(it?.title ?? it?.word ?? it?.name ?? ''),
  url: it?.link ?? it?.url ?? it?.rawUrl ?? it?.href ?? it?.linkUrl ?? undefined,
  heat:
    Number(it?.hot_value ?? it?.hotValue ?? it?.hot ?? it?.hotScore ?? it?.num ?? it?.heat ?? 0) ||
    undefined,
  desc: it?.desc ?? it?.description ?? it?.detail ?? undefined,
})

// 各聚合源对 platform 的入参名不同，统一用同一 token 拼接；某源不支持该平台则返回空，自动 fallthrough。
// 关键约束：Worker 出口在 Cloudflare 海外网段，凡自身架在 Cloudflare 上的中文热榜聚合源（vvhan/oioweb/60s/部分 DailyHotApi 实例）
// 会对 CF→CF 请求返回 530/526/403/1016；抖音/微博/知乎/B站等官方热榜也因风控/签名/地域限制无法从 Worker 直连。
// 经实测，Worker 能稳定直连的中文源为「百度热搜」（百度自有 CDN，不墙海外 IP）；全球源为 Hacker News。
// 抖音/小红书/公众号等"对标具体账号"数据需国内中继（Layer B），不在纯 CF Worker 范围内。
const PROVIDERS: HotProvider[] = [
  {
    name: 'baidu',
    url: () => `https://top.baidu.com/api/board?platform=wise&tab=realtime`,
    parse: (j) =>
      asArray(j?.data?.cards).flatMap((c: any) =>
        asArray(c?.content).flatMap((x: any) => asArray(x?.content)),
      ),
  },
  {
    name: 'hackernews',
    url: () => `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=25`,
    parse: (j) =>
      asArray(j?.hits).map((h: any) => ({
        title: h?.title,
        url: h?.url,
        heat: Number(h?.points ?? 0) || undefined,
      })),
  },
]

async function fetchHotList(platform: string): Promise<{ items: HotItem[]; source: string }> {
  const attempted: string[] = []
  for (const p of PROVIDERS) {
    const url = p.url(platform)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetchWithTimeout(
        url,
        {
          headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
          cf: { cacheTtl: 120 } as any,
          signal: ctrl.signal,
        },
        8000,
      )
      clearTimeout(timer)
      if (!res.ok) {
        const body = (await res.text().catch(() => '')).slice(0, 100)
        attempted.push(`${p.name}:HTTP${res.status}::${body}`)
        continue
      }
      const j: any = await res.json().catch(async () => {
        const t = await res.text().catch(() => '')
        return { __raw: t }
      })
      if (!j || j.__raw !== undefined) {
        attempted.push(`${p.name}:JSON_FAIL::${String(j?.__raw ?? '').slice(0, 100)}`)
        continue
      }
      const items = p
        .parse(j)
        .slice(0, 30)
        .map(mapItem)
        .filter((i) => i.title)
      if (items.length) return { items, source: p.name }
      attempted.push(`${p.name}:EMPTY::${JSON.stringify(j).slice(0, 120)}`)
    } catch (e: any) {
      clearTimeout(timer)
      attempted.push(`${p.name}:${String(e?.message || e).slice(0, 60)}`)
    }
  }
  throw new Error(`所有热榜源均不可用 [${attempted.join(' | ')}]`)
}

// ---------- YouTube 对标抓取 ----------
interface YtVideo {
  title: string
  videoId: string
  url: string
  publishedAt: string
  description: string
}

async function fetchYouTubeChannel(env: Env, channelId: string): Promise<YtVideo[]> {
  const apiKey = await getSetting(env, 'youtube_api_key')
  if (!apiKey) throw new Error('未配置 YouTube API Key')
  // 1) 取频道的上传播放列表
  const chRes = await fetchWithTimeout(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${encodeURIComponent(channelId)}&key=${apiKey}`,
    {},
    12000,
  )
  if (!chRes.ok) throw new Error(`channels.list HTTP ${chRes.status}`)
  const chJson = (await chRes.json()) as any
  const uploads = chJson?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploads) throw new Error('频道不存在或无 uploads 播放列表')
  // 2) 取最新视频
  const plRes = await fetchWithTimeout(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploads}&maxResults=5&key=${apiKey}`,
    {},
    12000,
  )
  if (!plRes.ok) throw new Error(`playlistItems.list HTTP ${plRes.status}`)
  const plJson = (await plRes.json()) as any
  return (plJson?.items || [])
    .map((it: any) => ({
      title: it.snippet?.title || '',
      videoId: it.snippet?.resourceId?.videoId || '',
      url: `https://www.youtube.com/watch?v=${it.snippet?.resourceId?.videoId || ''}`,
      publishedAt: it.snippet?.publishedAt || '',
      description: (it.snippet?.description || '').slice(0, 300),
    }))
    .filter((v: YtVideo) => v.videoId)
}

// ---------- 目标 CRUD ----------
export async function listTargets(env: Env): Promise<any[]> {
  const db = drizzle(env.DB, { schema })
  await ensureMonitorTables(env)
  return db.select().from(schema.monitorTargets).orderBy(desc(schema.monitorTargets.createdAt))
}

export async function createTarget(env: Env, input: any): Promise<string> {
  const db = drizzle(env.DB, { schema })
  await ensureMonitorTables(env)
  const id = crypto.randomUUID()
  await db.insert(schema.monitorTargets).values({
    id,
    type: input.type,
    platform: input.platform,
    label: input.label,
    targetId: input.targetId || null,
    keyword: input.keyword || null,
    enabled: input.enabled ?? true,
  })
  return id
}

export async function updateTarget(env: Env, id: string, input: any): Promise<void> {
  const db = drizzle(env.DB, { schema })
  await ensureMonitorTables(env)
  await db
    .update(schema.monitorTargets)
    .set({
      type: input.type,
      platform: input.platform,
      label: input.label,
      targetId: input.targetId ?? null,
      keyword: input.keyword ?? null,
      enabled: input.enabled ?? true,
      updatedAt: nowBeijing(),
    })
    .where(eq(schema.monitorTargets.id, id))
}

export async function deleteTarget(env: Env, id: string): Promise<void> {
  const db = drizzle(env.DB, { schema })
  await ensureMonitorTables(env)
  await db.delete(schema.monitorTargets).where(eq(schema.monitorTargets.id, id))
}

// ---------- 快照读取（供前端预览）----------
export async function getSnapshots(env: Env, date?: string, type?: string): Promise<any[]> {
  const db = drizzle(env.DB, { schema })
  await ensureMonitorTables(env)
  const d = date || todayBeijing()
  const conds = [eq(schema.monitorSnapshots.date, d)]
  if (type) conds.push(eq(schema.monitorSnapshots.type, type))
  const rows = await db
    .select()
    .from(schema.monitorSnapshots)
    .where(and(...conds))
    .orderBy(desc(schema.monitorSnapshots.fetchedAt))
  // items 在 D1 中以 JSON 字符串存储，返回前端前解析为数组；
  // 否则前端 MonitorPage 对字符串调用 .slice().map 会抛 "G.slice(...).map is not a function"
  return rows.map((r) => {
    let parsed: any[] = []
    try {
      parsed =
        typeof r.items === 'string'
          ? JSON.parse(r.items || '[]')
          : Array.isArray(r.items)
            ? r.items
            : []
    } catch {
      parsed = []
    }
    return { ...r, items: parsed }
  })
}

// ---------- 简报读取 ----------
export async function getTodayBrief(env: Env): Promise<any | null> {
  const db = drizzle(env.DB, { schema })
  await ensureMonitorTables(env)
  const d = todayBeijing()
  const rows = await db
    .select()
    .from(schema.monitorBriefs)
    .where(eq(schema.monitorBriefs.date, d))
    .limit(1)
  return rows[0] || null
}

// ---------- 主流程：执行一次监控并生成简报 ----------
export interface MonitorRunResult {
  ok: boolean
  hotTargets: number
  ytTargets: number
  briefId?: string
  error?: string
  diagnostics?: string[]
}

export async function runMonitor(env: Env): Promise<MonitorRunResult> {
  const db = drizzle(env.DB, { schema })
  await ensureMonitorTables(env)
  const date = todayBeijing()
  const targets = await db
    .select()
    .from(schema.monitorTargets)
    .where(eq(schema.monitorTargets.enabled, true))
  const hotTargets = targets.filter((t) => t.type === 'hotlist')
  const ytTargets = targets.filter((t) => t.type === 'youtube')

  const allTitles: string[] = [] // 喂给 AI 的标题池
  const ytNews: string[] = [] // YouTube 竞品新动态摘要
  const diagnostics: string[] = []

  // ---- 热榜 ----
  for (const t of hotTargets) {
    try {
      const { items, source } = await fetchHotList(t.platform)
      const kw = t.keyword?.toLowerCase()
      const filtered = kw
        ? items.filter((it) => (it.title + (it.desc || '')).toLowerCase().includes(kw))
        : items
      await db.insert(schema.monitorSnapshots).values({
        id: crypto.randomUUID(),
        date,
        type: 'hotlist',
        platform: t.platform,
        targetId: t.targetId || null,
        items: JSON.stringify(filtered),
      })
      diagnostics.push(`hotlist ${t.platform} via ${source}: OK (${filtered.length} 条)`)
      for (const it of filtered.slice(0, 20)) allTitles.push(`【${t.platform}】${it.title}`)
    } catch (e: any) {
      console.error(`[monitor] hotlist ${t.platform} failed:`, e.message)
      diagnostics.push(`hotlist ${t.platform}: ${e.message}`)
    }
  }

  // ---- YouTube 对标 ----
  const lastSnap = await getLastYtSnapshotMap(db)
  for (const t of ytTargets) {
    if (!t.targetId) continue
    try {
      const videos = await fetchYouTubeChannel(env, t.targetId)
      await db.insert(schema.monitorSnapshots).values({
        id: crypto.randomUUID(),
        date,
        type: 'youtube',
        platform: 'youtube',
        targetId: t.targetId,
        items: JSON.stringify(videos),
      })
      for (const v of videos.slice(0, 5)) {
        allTitles.push(`【YouTube·${t.label}】${v.title}`)
        const prev = lastSnap[`${t.targetId}:${v.videoId}`]
        if (!prev) ytNews.push(`🔔 ${t.label} 新视频：${v.title}\n${v.url}`)
      }
    } catch (e: any) {
      console.error(`[monitor] youtube ${t.label} failed:`, e.message)
      diagnostics.push(`youtube ${t.label}: ${e.message}`)
    }
  }

  // ---- 生成简报 ----
  const persistDiag = async (ok: boolean) => {
    try {
      await env.CACHE.put(
        'monitor:last-run',
        JSON.stringify({ ts: Date.now(), ok, sourceCount: allTitles.length, diagnostics }),
      )
    } catch {
      /* KV 不可用时忽略 */
    }
  }
  try {
    const brief = await generateMonitorBrief(env, allTitles, ytNews)
    const id = crypto.randomUUID()
    await db
      .insert(schema.monitorBriefs)
      .values({
        id,
        date,
        title: `📡 今日创作选题 · ${date}`,
        content: brief,
        sourceCount: allTitles.length,
      })
      .onConflictDoUpdate({
        target: schema.monitorBriefs.date,
        set: {
          title: `📡 今日创作选题 · ${date}`,
          content: brief,
          sourceCount: allTitles.length,
          pushedAt: null,
        },
      })
    console.log('[monitor] run ok:', JSON.stringify(diagnostics))
    await persistDiag(true)
    return {
      ok: true,
      hotTargets: hotTargets.length,
      ytTargets: ytTargets.length,
      briefId: id,
      diagnostics,
    }
  } catch (e: any) {
    console.error('[monitor] brief generation failed:', e)
    console.log('[monitor] run failed:', JSON.stringify(diagnostics))
    await persistDiag(false)
    return {
      ok: false,
      hotTargets: hotTargets.length,
      ytTargets: ytTargets.length,
      error: e.message,
      diagnostics,
    }
  }
}

// ---------- 单平台刷新（前端手动触发）----------
export interface MonitorPlatformResult {
  ok: boolean
  fetched: number
  platform: string
  error?: string
}

export async function runMonitorPlatform(
  env: Env,
  platform: string,
): Promise<MonitorPlatformResult> {
  const db = drizzle(env.DB, { schema })
  await ensureMonitorTables(env)
  const date = todayBeijing()

  // 热榜平台
  const { items, source } = await fetchHotList(platform)
  await db.insert(schema.monitorSnapshots).values({
    id: crypto.randomUUID(),
    date,
    type: 'hotlist',
    platform,
    items: JSON.stringify(items),
  })
  return { ok: true, fetched: items.length, platform }
}

async function getLastYtSnapshotMap(db: any): Promise<Record<string, boolean>> {
  const d = todayBeijing()
  // 取昨日之前的最后一个 youtube 快照做"新视频"判定
  const rows = await db
    .select()
    .from(schema.monitorSnapshots)
    .where(
      and(eq(schema.monitorSnapshots.type, 'youtube'), sql`${schema.monitorSnapshots.date} < ${d}`),
    )
    .orderBy(desc(schema.monitorSnapshots.fetchedAt))
    .limit(50)
  const map: Record<string, boolean> = {}
  for (const r of rows) {
    try {
      const items = JSON.parse(r.items) as YtVideo[]
      for (const v of items) map[`${r.targetId}:${v.videoId}`] = true
    } catch {}
  }
  return map
}

async function generateMonitorBrief(env: Env, titles: string[], ytNews: string[]): Promise<string> {
  if (titles.length === 0 && ytNews.length === 0) {
    return '今日暂无足够的监控数据（未配置监控目标或数据源暂时不可用）。可在「监控中心」添加热榜平台或 YouTube 竞品频道。'
  }
  const pool = titles.slice(0, 60).join('\n')
  const ytSection = ytNews.length ? `\n\n=== 竞品频道新动态 ===\n${ytNews.join('\n')}` : ''
  const messages = [
    {
      role: 'system',
      content:
        '你是资深自媒体选题策划。基于今日各平台热榜与竞品动态，为内容创作者提炼「可落地的选题」。输出中文，结构化、说人话、给角度，不要空话套话。',
    },
    {
      role: 'user',
      content: `以下是今日抓到的热点标题池（来自抖音/微博/知乎/B站热榜与 YouTube 竞品频道）：
${pool}${ytSection}

请输出「今日创作选题」简报，要求：
1. 精选 5-8 个最适合做中文自媒体的选题；
2. 每个选题按如下结构：
   【选题标题】
   · 来源信号：来自哪个平台/竞品
   · 为什么值得做（洞察）：这反映了什么情绪或需求
   · 内容角度建议：具体可以怎么切入（给 1-2 个可执行角度）
   · 推荐形式：图文 / 短视频 / 中长视频
3. 最后用 2-3 句总结今日整体选题风向。
只输出简报正文，不要加开场白。`,
    },
  ]
  return await callAI(env, messages, { maxTokens: 1500, timeoutMs: 35000 })
}

// ---------- 推送简报到 Telegram（复用解密逻辑）----------
export async function pushMonitorBrief(
  env: Env,
): Promise<{ ok: boolean; pushed: number; error?: string }> {
  const db = drizzle(env.DB, { schema })
  await ensureMonitorTables(env)
  const d = todayBeijing()
  const brief = await db
    .select()
    .from(schema.monitorBriefs)
    .where(eq(schema.monitorBriefs.date, d))
    .limit(1)
  if (brief.length === 0) return { ok: false, pushed: 0, error: '今日监控简报尚未生成' }
  if (brief[0].pushedAt) return { ok: true, pushed: 0 }

  const botTokenRaw = await getSetting(env, 'telegram_bot_token')
  const chatId = await getSetting(env, 'telegram_chat_id')
  if (!botTokenRaw || !chatId) return { ok: false, pushed: 0, error: 'Telegram 配置未完成' }
  const botToken = botTokenRaw.startsWith('enc$')
    ? await decrypt(env.JWT_SECRET, botTokenRaw)
    : botTokenRaw

  const text = `${brief[0].title}\n\n${brief[0].content}`
  // 分段发送（Telegram 单条上限 ~4096）
  const chunks: string[] = []
  for (let i = 0; i < text.length && chunks.length < 5; i += 3800)
    chunks.push(text.slice(i, i + 3800))
  let allOk = true
  for (const chunk of chunks) {
    try {
      const res = await fetchWithTimeout(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
        },
        10000,
      )
      if (!res.ok) {
        allOk = false
        console.error('[monitor] telegram send failed:', res.status)
      }
    } catch (e: any) {
      allOk = false
      console.error('[monitor] telegram send error:', e.message)
    }
  }
  if (allOk) {
    await db
      .update(schema.monitorBriefs)
      .set({ pushedAt: nowBeijing() })
      .where(eq(schema.monitorBriefs.id, brief[0].id))
    return { ok: true, pushed: 1 }
  }
  return { ok: false, pushed: 0, error: 'Telegram 推送失败' }
}
