import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'
import { eq, notInArray, inArray, like } from 'drizzle-orm'
import { decrypt } from './crypto-utils'
import type { Env } from './types'
import { nowBeijing } from './time'
import { getSetting, setSetting } from './utils/settings'
import { fetchWithTimeout } from './utils/fetch-timeout'
import { marked } from 'marked'

/**
 * 腾讯 IMA OpenAPI 同步模块
 * 文档来源：ima.qq.com 官方 skill 包 (ima-skills-1.1.7)
 *
 * 认证：Header 携带 ima-openapi-clientid / ima-openapi-apikey
 * 笔记 API：POST /openapi/note/v1/{list_notebook, list_note, get_doc_content, search_note, import_doc, append_doc}
 * 知识库 API：POST /openapi/wiki/v1/{get_knowledge_base, get_knowledge_list, search_knowledge, get_media_info}
 */

const IMA_BASE_URL = 'https://ima.qq.com'

interface ImaCredentials {
  clientId: string
  apiKey: string
}

/**
 * 指数退避重试
 * @param fn 待重试的异步函数
 * @param retries 重试次数（默认 2）
 * @param baseDelay 首次重试延迟 ms（默认 500）
 */
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 2, baseDelay = 500): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (retries <= 0) throw err
    await new Promise((r) => setTimeout(r, baseDelay))
    return retryWithBackoff(fn, retries - 1, baseDelay * 2)
  }
}

// 从 settings 表读取 IMA 凭证（api_key 走解密）
async function getCredentials(env: Env): Promise<ImaCredentials | null> {
  const db = drizzle(env.DB, { schema })
  const clientIdRow = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'ima_client_id'))
  const apiKeyRow = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'ima_api_key'))
  if (!clientIdRow.length || !apiKeyRow.length) return null
  // api_key 走解密（若以 enc$ 开头则解密，否则明文返回）
  const apiKey = await decrypt(env.ENCRYPTION_KEY ?? env.JWT_SECRET, apiKeyRow[0].value)
  return { clientId: clientIdRow[0].value, apiKey }
}

// 通用 IMA API 调用（原始版本，不含重试）
async function imaPostRaw(apiPath: string, body: any, creds: ImaCredentials): Promise<any> {
  const res = await fetchWithTimeout(
    `${IMA_BASE_URL}/${apiPath}`,
    {
      method: 'POST',
      headers: {
        'ima-openapi-clientid': creds.clientId,
        'ima-openapi-apikey': creds.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    15000,
  )
  const text = await res.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`IMA 响应非 JSON (HTTP ${res.status}): ${text.slice(0, 200)}`)
  }
  if (data.code !== 0) {
    throw new Error(`IMA API 错误 [${data.code}]: ${data.msg || '未知错误'}`)
  }
  return data.data
}

// 通用 IMA API 调用（含指数退避重试，处理瞬态故障）
async function imaPost(
  apiPath: string,
  body: any,
  creds: ImaCredentials,
  maxRetries = 3,
): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await imaPostRaw(apiPath, body, creds)
    } catch (e: any) {
      const isRetryable = /timeout|network|fetch failed|5\d{2}|429/i.test(e?.message || '')
      if (!isRetryable || attempt === maxRetries) throw e
      const delay = Math.min(1000 * 2 ** attempt, 8000)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error('unreachable')
}

// ========== 笔记同步 ==========

/**
 * 拉取所有笔记本
 * POST /openapi/note/v1/list_notebook
 * 返回 NoteFolderInfo[]，folder_type: 0=USER_CREATE, 1=TOTAL, 2=UN_CATEGORIZED
 */
export async function listNotebooks(env: Env) {
  const creds = await getCredentials(env)
  if (!creds) throw new Error('未配置 IMA 凭证，请先在设置页填写 Client ID 和 API Key')

  const folders: any[] = []
  let cursor = '0'
  let isEnd = false

  while (!isEnd) {
    const data = await imaPost('openapi/note/v1/list_notebook', { cursor, limit: 20 }, creds)
    if (data.note_folder_infos) {
      folders.push(...data.note_folder_infos)
    }
    isEnd = data.is_end
    cursor = data.next_cursor
  }

  return folders
}

/**
 * 拉取指定笔记本下的笔记列表
 * POST /openapi/note/v1/list_note
 * folderId 为空则拉取根目录（全部笔记）
 */
export async function listNotes(env: Env, folderId?: string) {
  const creds = await getCredentials(env)
  if (!creds) throw new Error('未配置 IMA 凭证')

  const notes: any[] = []
  let cursor = ''
  let isEnd = false

  while (!isEnd) {
    const body: any = { cursor, limit: 20 }
    if (folderId) body.folder_id = folderId
    const data = await imaPost('openapi/note/v1/list_note', body, creds)
    if (data.note_book_list) {
      notes.push(...data.note_book_list)
    }
    isEnd = data.is_end
    cursor = data.next_cursor || ''
  }

  return notes
}

/**
 * 获取笔记内容 — 优先取 Markdown 以保留段落/列表等格式；失败重试 2 次
 * POST /openapi/note/v1/get_doc_content
 */
export async function getNoteContent(env: Env, noteId: string): Promise<string> {
  const creds = await getCredentials(env)
  if (!creds) throw new Error('未配置 IMA 凭证')

  return retryWithBackoff(async () => {
    try {
      const data = await imaPost(
        'openapi/note/v1/get_doc_content',
        {
          note_id: noteId,
          target_content_format: 1, // MARKDOWN，保留原始格式
        },
        creds,
      )
      return data.content || ''
    } catch (e: any) {
      // 若服务端不支持 Markdown 格式，降级为纯文本
      if (e.message?.includes('target_content_format')) {
        const data = await imaPost(
          'openapi/note/v1/get_doc_content',
          {
            note_id: noteId,
            target_content_format: 0, // PLAINTEXT
          },
          creds,
        )
        return data.content || ''
      }
      throw e
    }
  })
}

// 解码 HTML 实体（IMA 返回的 Markdown 中常含 &amp; 等转义）
export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/**
 * 仅做轻量归一化（反转义 \\&、解码 &amp; 等 HTML 实体），不下载图片。
 */
export function normalizeNoteContent(content: string): string {
  return decodeHtmlEntities(content.replace(/\\(.)/g, '$1'))
}

/**
 * 带 Referer 降级的 fetch，用于 KB 文件下载。
 * 腾讯云 COS 有时要求/禁止特定 Referer，依次尝试多种策略。
 */
export async function fetchWithImaFallbacks(
  downloadUrl: string,
  extraHeaders?: Record<string, string>,
): Promise<Response | null> {
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const baseHeaders: Record<string, string> = { 'User-Agent': UA, ...(extraHeaders || {}) }
  const strategies: Record<string, string>[] = [
    { ...baseHeaders },
    { ...baseHeaders, Referer: 'https://ima.qq.com/' },
    { ...baseHeaders, Referer: 'https://ima.qq.com' },
  ]
  for (const headers of strategies) {
    try {
      const res = await fetchWithTimeout(downloadUrl, { headers }, 15000)
      if (res.ok) return res
    } catch {
      /* try next strategy */
    }
  }
  return null
}

/**
 * 清洗 Markdown：去除所有图片和附件引用，替换为占位标记。
 * - ![alt](url) → [图片]
 * - <img src="..."> → [图片]
 * - [text](media-id) 或 [text](/api/ima/...) → [附件: text]
 * - <a href="..."> 附件链接 → [附件: text]
 * - <figure>/<figcaption> 等包裹标签 → 仅保留内容
 */
export function stripImagesAndAttachments(md: string): string {
  let result = md
  // 1. Markdown 图片 ![alt](url)
  result = result.replace(/!\[[^\]]*\]\([^)]+\)/g, '[图片]')
  // 2. HTML <img ...> 标签
  result = result.replace(/<img[^>]*>/gi, '[图片]')
  // 3. Markdown 附件链接 [text](media-id 或 /api/ima/...) — 非 http/https 的引用
  result = result.replace(/\[([^\]]+)\]\((?!https?:\/\/|mailto:|tel:|#)[^)]+\)/g, '[附件: $1]')
  // 4. HTML <a> 附件链接（非 http/https href）
  result = result.replace(
    /<a[^>]+href=["'](?!https?:\/\/|mailto:|tel:|#)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
    '[附件: $1]',
  )
  // 5. <figure>/<figcaption> 包裹标签 → 仅保留内容
  result = result.replace(/<figure[^>]*>/gi, '')
  result = result.replace(/<\/figure>/gi, '')
  result = result.replace(/<figcaption[^>]*>/gi, '')
  result = result.replace(/<\/figcaption>/gi, '')
  // 6. 清理多余空行（连续 3 个以上换行压缩为 2 个）
  result = result.replace(/\n{3,}/g, '\n\n')
  return result.trim()
}

/**
 * 将干净 Markdown 转为轻量纯净 HTML（无样式、无 class）。
 * 用于前端展示阅读，替代客户端 ReactMarkdown 渲染。
 */
export function markdownToCleanHtml(md: string): string {
  // 注意：marked.parse 默认不进行 XSS 过滤，若输入源不可信应使用 DOMPurify 等消毒库
  const raw = marked.parse(md, { async: false }) as string
  // 移除 <img> 标签（以防 stripImagesAndAttachments 遗漏的 HTML img）
  return raw.replace(/<img[^>]*>/gi, '[图片]')
}

function inferFileTypeFromName(name?: string | null): string | null {
  const raw = (name || '').trim().toLowerCase()
  if (!raw) return null
  const clean = raw.split('?')[0].split('#')[0]
  const ext = clean.includes('.') ? clean.split('.').pop() || '' : ''
  const map: Record<string, string> = {
    pdf: 'pdf',
    docx: 'docx',
    doc: 'docx',
    xlsx: 'xlsx',
    xls: 'xlsx',
    md: 'md',
    markdown: 'md',
    txt: 'txt',
    html: 'html',
    htm: 'html',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    webp: 'image',
    bmp: 'image',
    svg: 'image',
    mp3: 'audio',
    wav: 'audio',
    m4a: 'audio',
    ogg: 'audio',
    aac: 'audio',
    flac: 'audio',
    xmind: 'xmind',
    ppt: 'ppt',
    pptx: 'ppt',
  }
  return map[ext] || null
}

function inferFileTypeFromContentType(contentType?: string | null): string | null {
  const ct = (contentType || '').toLowerCase()
  if (!ct) return null
  if (ct.includes('pdf')) return 'pdf'
  if (ct.includes('word') || ct.includes('officedocument.wordprocessingml')) return 'docx'
  if (ct.includes('sheet') || ct.includes('excel') || ct.includes('officedocument.spreadsheetml'))
    return 'xlsx'
  if (ct.startsWith('image/')) return 'image'
  if (ct.startsWith('audio/')) return 'audio'
  if (ct.includes('markdown')) return 'md'
  if (ct.startsWith('text/plain')) return 'txt'
  if (ct.includes('html')) return 'html'
  return null
}

function inferKbFileType(args: {
  mediaType?: number
  title?: string | null
  downloadUrl?: string | null
  contentType?: string | null
  currentType?: string | null
}): string {
  const { mediaType, title, downloadUrl, contentType, currentType } = args
  const typeMap: Record<number, string> = {
    1: 'pdf',
    2: 'web',
    3: 'docx',
    4: 'ppt',
    5: 'xlsx',
    6: 'web',
    7: 'md',
    9: 'image',
    11: 'note',
    12: 'session',
    13: 'txt',
    14: 'xmind',
    15: 'audio',
    20: 'html',
  }
  return (
    typeMap[mediaType || 0] ||
    inferFileTypeFromName(title) ||
    inferFileTypeFromName(downloadUrl) ||
    inferFileTypeFromContentType(contentType) ||
    currentType ||
    'unknown'
  )
}

/**
 * 新建笔记（导入 Markdown 文档）
 * POST /openapi/note/v1/import_doc
 * content_format 固定为 1（MARKDOWN），目前仅支持 Markdown
 * 返回新笔记的 note_id
 */
export async function createNote(env: Env, content: string, folderName?: string): Promise<string> {
  const creds = await getCredentials(env)
  if (!creds) throw new Error('未配置 IMA 凭证')

  const body: any = {
    content_format: 1, // MARKDOWN
    content,
  }
  if (folderName) body.folder_name = folderName

  const data = await imaPost('openapi/note/v1/import_doc', body, creds)
  if (!data.note_id) {
    throw new Error('IMA createNote 响应缺少 note_id')
  }
  return data.note_id as string
}

/**
 * 追加内容到已有笔记
 * POST /openapi/note/v1/append_doc
 * content_format 固定为 1（MARKDOWN）
 */
export async function appendNote(env: Env, noteId: string, content: string): Promise<string> {
  const creds = await getCredentials(env)
  if (!creds) throw new Error('未配置 IMA 凭证')

  const data = await imaPost(
    'openapi/note/v1/append_doc',
    {
      note_id: noteId,
      content_format: 1, // MARKDOWN
      content,
    },
    creds,
  )

  return (data.note_id || noteId) as string
}

/**
 * 同步笔记到本地 D1（增量：首次全量，后续按 updated_at 过滤）
 * 拉取所有笔记本 → 用户自建文件夹递归拉取笔记 + 根目录笔记 → 笔记内容
 * 按 note_id 去重；settings 表存 ima_notes_synced_at 记录上次同步时间
 *
 * 性能策略（避免 HTTP 30s 超时）：
 * - 前置批量查询：一次性 SELECT 全部本地笔记进 Map，代替每条 SELECT
 * - 墙钟预算 MAX_WALL_MS=18000（给 HTTP 端点 12s 缓冲），每 5 条检查一次
 * - 子请求预算 MAX_NOTE_CONTENT_FETCHES=60，超预算的笔记等下次 cron
 * - DB 写入批量：collect dirty rows，每 50 条 db.batch 一次
 * - 同步期不下载图片附件，仅发 Queue；超预算返回 partial=true 让前端提示
 */
export async function syncNotes(
  env: Env,
): Promise<{ synced: number; partial?: boolean; skipped?: number }> {
  const db = drizzle(env.DB, { schema })
  let syncedCount = 0
  let skippedCount = 0
  let partial = false

  // 墙钟预算：HTTP Worker 30s 硬限制，留 12s 缓冲给网络往返和响应序列化
  const t0 = Date.now()
  const MAX_WALL_MS = 18_000
  // 子请求预算：每条笔记内容拉取最多 6 次 IMA POST（含重试+格式降级）
  const MAX_NOTE_CONTENT_FETCHES = 60
  let contentFetches = 0

  // 读取上次同步时间（增量过滤）
  const lastSyncedAt = await getSetting(env, 'ima_notes_synced_at')
  const lastSyncedMs = lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0

  // 1. 拉取所有笔记本
  const folders = await listNotebooks(env)

  // 2. 对每个 folder_type === 0（USER_CREATE）的文件夹递归拉取笔记
  const allNotesMap = new Map<string, any>()
  let allFoldersFetchedOk = true
  for (const folder of folders) {
    if (folder.folder_type === 0) {
      try {
        const notes = await listNotes(env, folder.folder_id)
        for (const n of notes) {
          if (n.note_id) allNotesMap.set(n.note_id, n)
        }
      } catch (e) {
        allFoldersFetchedOk = false
        console.error('[ima] listNotes for folder failed:', folder.folder_id, e)
      }
    }
  }

  // 3. 拉取根目录笔记（不传 folder_id）
  let rootFetchOk = false
  try {
    const rootNotes = await listNotes(env)
    for (const n of rootNotes) {
      if (n.note_id) allNotesMap.set(n.note_id, n)
    }
    rootFetchOk = true
  } catch (e) {
    console.error('[ima] listNotes root failed:', e)
  }

  // 前置批量查询：一次性拉全部本地笔记进 Map，代替每条 SELECT（N→1 次 D1 往返）
  const localRows = await db
    .select({
      id: schema.imaNotes.id,
      content: schema.imaNotes.content,
      updatedAt: schema.imaNotes.updatedAt,
    })
    .from(schema.imaNotes)
    .where(eq(schema.imaNotes.sourceFile, 'ima_openapi'))
  const localMap = new Map<string, { content: string; updatedAt: string | null }>()
  for (const r of localRows)
    localMap.set(r.id, { content: r.content || '', updatedAt: r.updatedAt })

  // 收集 dirty rows 做批量写入
  const upserts: Array<{
    id: string
    title: string
    content: string
    contentHtml: string
    isUpdate: boolean
  }> = []
  const FLUSH_THRESHOLD = 50
  const flushUpserts = async () => {
    if (upserts.length === 0) return
    // 分发为 update/insert 两条 batch（D1 batch 不支持 onConflict）
    const updates = upserts.filter((u) => u.isUpdate)
    const inserts = upserts.filter((u) => !u.isUpdate)
    const stmts: any[] = []
    for (const u of updates) {
      stmts.push(
        db
          .update(schema.imaNotes)
          .set({
            title: u.title,
            content: u.content,
            contentHtml: u.contentHtml,
            sourceFile: 'ima_openapi',
            updatedAt: nowBeijing(),
          })
          .where(eq(schema.imaNotes.id, u.id)),
      )
    }
    for (const u of inserts) {
      stmts.push(
        db.insert(schema.imaNotes).values({
          id: u.id,
          title: u.title,
          content: u.content,
          contentHtml: u.contentHtml,
          sourceFile: 'ima_openapi',
        }),
      )
    }
    if (stmts.length > 0) await db.batch(stmts as any)
    upserts.length = 0
  }

  // 4. 逐条同步笔记内容（增量过滤 + 墙钟/子请求预算）
  let noteIdx = 0
  for (const note of allNotesMap.values()) {
    noteIdx++
    const noteId = note.note_id
    const title = note.title || '无标题'
    const noteUpdatedAt = note.updated_at || note.update_time

    const local = localMap.get(noteId)
    const oldContent = local?.content || ''

    // 增量过滤：仅当笔记在 IMA 端有更新时重新拉取
    const noteUpdatedMs = noteUpdatedAt ? new Date(noteUpdatedAt).getTime() : 0
    if (lastSyncedMs && noteUpdatedMs && noteUpdatedMs <= lastSyncedMs) {
      continue
    }

    // 墙钟预算检查（每 5 条检查一次，减少 Date.now() 调用）
    if (noteIdx % 5 === 0 && Date.now() - t0 > MAX_WALL_MS) {
      console.warn(
        `[ima] syncNotes 墙钟预算耗尽 (已处理 ${noteIdx}/${allNotesMap.size})，剩余笔记下次同步`,
      )
      partial = true
      skippedCount = allNotesMap.size - noteIdx + 1
      break
    }
    // 子请求预算检查
    if (contentFetches >= MAX_NOTE_CONTENT_FETCHES) {
      console.warn(`[ima] syncNotes 子请求预算耗尽 (${contentFetches})，剩余笔记下次同步`)
      partial = true
      skippedCount = allNotesMap.size - noteIdx + 1
      break
    }

    // 拉取笔记内容；失败时保留已有内容，避免用占位文本覆盖真实数据
    let content = oldContent
    try {
      contentFetches++
      content = await getNoteContent(env, noteId)
    } catch {
      // 拉取失败时保留旧内容
    }

    // 轻量归一化（解码 &amp; 等转义）
    content = normalizeNoteContent(content)
    if (!content) content = '（内容获取失败）'

    // 清洗：去除图片/附件引用，替换为占位标记
    const cleanMd = stripImagesAndAttachments(content)
    // 生成轻量 HTML 用于前端展示
    const contentHtml = markdownToCleanHtml(cleanMd)

    upserts.push({ id: noteId, title, content: cleanMd, contentHtml, isUpdate: !!local })
    if (upserts.length >= FLUSH_THRESHOLD) await flushUpserts()

    syncedCount++
  }
  // flush 剩余
  await flushUpserts()

  // 仅根目录和所有文件夹都拉取成功 + 本次非 partial 时执行删除同步，确保快照完整
  // partial 时跳过删除，避免把"未拉取到"的笔记误删
  if (rootFetchOk && allFoldersFetchedOk && !partial) {
    const imaNoteIds = Array.from(allNotesMap.keys())
    const localImaNotes = await db
      .select({ id: schema.imaNotes.id })
      .from(schema.imaNotes)
      .where(eq(schema.imaNotes.sourceFile, 'ima_openapi'))
    const toDelete = localImaNotes.filter((n) => !imaNoteIds.includes(n.id))
    // 安全检查：仅当 IMA 端确实有笔记时才执行删除
    // 若 imaNoteIds 为空（API 返回空列表/凭证问题等），跳过删除，防止误删全部本地数据
    if (toDelete.length > 0 && imaNoteIds.length > 0) {
      await db.delete(schema.imaNotes).where(notInArray(schema.imaNotes.id, imaNoteIds))
      syncedCount -= toDelete.length
    } else if (toDelete.length > 0 && imaNoteIds.length === 0) {
      console.warn('[ima] syncNotes: IMA 返回空笔记列表但本地有笔记，跳过删除以保护数据')
    }
  }

  // 更新同步时间戳（partial 时不更新，让下次同步继续拉取剩余笔记）
  if (!partial) {
    await setSetting(env, 'ima_notes_synced_at', nowBeijing())
  }

  return { synced: syncedCount, partial, skipped: skippedCount }
}

// ========== 知识库同步 ==========

/**
 * 获取可添加的知识库列表
 * POST /openapi/wiki/v1/get_addable_knowledge_base_list
 */
export async function listAddableKnowledgeBases(env: Env) {
  const creds = await getCredentials(env)
  if (!creds) throw new Error('未配置 IMA 凭证')

  const bases: any[] = []
  let cursor = ''
  let isEnd = false

  while (!isEnd) {
    const data = await imaPost(
      'openapi/wiki/v1/get_addable_knowledge_base_list',
      {
        cursor,
        limit: 50,
      },
      creds,
    )
    if (data.addable_knowledge_base_list) {
      bases.push(...data.addable_knowledge_base_list)
    }
    isEnd = data.is_end
    cursor = data.next_cursor || ''
  }

  return bases
}

/**
 * 浏览知识库内容
 * POST /openapi/wiki/v1/get_knowledge_list
 */
export async function getKnowledgeList(env: Env, kbId: string, folderId?: string, cursor?: string) {
  const creds = await getCredentials(env)
  if (!creds) throw new Error('未配置 IMA 凭证')

  const body: any = {
    cursor: cursor ?? '',
    limit: 50,
    knowledge_base_id: kbId,
  }
  if (folderId) body.folder_id = folderId

  const data = await imaPost('openapi/wiki/v1/get_knowledge_list', body, creds)

  return {
    knowledgeList: data.knowledge_list || [],
    isEnd: data.is_end,
    nextCursor: data.next_cursor,
    currentPath: data.current_path || [],
  }
}

/**
 * 获取媒体信息（获取文件访问 URL）
 * POST /openapi/wiki/v1/get_media_info
 * 返回 { media_type, url_info?: { url, headers? }, notebook_ext_info? }
 */
export async function getMediaInfo(env: Env, mediaId: string) {
  const creds = await getCredentials(env)
  if (!creds) throw new Error('未配置 IMA 凭证')

  const data = await imaPost(
    'openapi/wiki/v1/get_media_info',
    {
      media_id: mediaId,
    },
    creds,
  )

  return data
}

/**
 * 分页拉取单个知识库下所有内容（处理 next_cursor）
 */
async function fetchAllKbItems(env: Env, kbId: string): Promise<any[]> {
  const items: any[] = []
  let cursor: string | undefined = undefined
  while (true) {
    const page = await getKnowledgeList(env, kbId, undefined, cursor)
    if (page.knowledgeList?.length) items.push(...page.knowledgeList)
    if (page.isEnd || !page.nextCursor) break
    cursor = page.nextCursor
  }
  return items
}

/**
 * 同步知识库到本地（增量：首次全量，后续按 updated_at 过滤）
 * 拉取可添加的知识库列表 → 每个知识库的内容列表 → 调 getMediaInfo 拿临时 URL 下载文件到 R2
 * 失败的文件标记 fileType='unavailable' 跳过，不阻塞同步
 * settings 表存 ima_kb_synced_at 记录上次同步时间
 */
export async function syncKnowledgeBase(env: Env): Promise<{ synced: number }> {
  const db = drizzle(env.DB, { schema })
  let syncedCount = 0
  const allFetchedMediaIds = new Set<string>()
  let allBasesFetchedOk = true

  // 读取上次同步时间（增量过滤）
  const lastSyncedAt = await getSetting(env, 'ima_kb_synced_at')

  // 获取可访问的知识库列表
  const bases = await listAddableKnowledgeBases(env)

  // 子请求预算：整个 KB 同步最多消耗 ~400 个子请求（留给笔记同步剩余预算）
  const MAX_KB_BUDGET = 80
  let kbBudget = MAX_KB_BUDGET

  for (const base of bases) {
    // 浏览知识库内容（分页拉取）
    let knowledgeList: any[]
    try {
      knowledgeList = await fetchAllKbItems(env, base.id)
    } catch (e) {
      allBasesFetchedOk = false
      console.error('[ima] fetchAllKbItems failed for base:', base.id, e)
      continue
    }

    for (const item of knowledgeList) {
      const mediaId = item.media_id
      if (!mediaId) continue
      allFetchedMediaIds.add(mediaId)

      // 增量过滤：若 lastSyncedAt 存在且知识库项未更新则跳过
      const itemUpdatedAt = item.updated_at || item.update_time
      if (lastSyncedAt && itemUpdatedAt && new Date(itemUpdatedAt) <= new Date(lastSyncedAt)) {
        continue
      }

      // 检查是否已存在
      const existing = await db
        .select()
        .from(schema.kbDocuments)
        .where(eq(schema.kbDocuments.id, mediaId))

      // 获取媒体信息确定文件类型 + 下载 URL
      if (kbBudget <= 0) {
        console.log('[ima] KB budget exhausted, skipping remaining items')
        break // 跳出最内层循环
      }
      kbBudget--
      let mediaType = 0
      let fileType = existing[0]?.fileType || 'unknown'
      let r2Key: string | null = existing[0]?.r2Key || null
      let fileSize: number | null = existing[0]?.fileSize ?? null
      // 文本类文件（md/txt/html）下载后提取文本写入 content 字段，供 DocViewer 直接渲染
      let textContent: string | null = existing[0]?.content ?? null
      let downloadFailed = false

      try {
        const mediaInfo = await retryWithBackoff(() => getMediaInfo(env, mediaId), 2, 800)
        mediaType = mediaInfo.media_type || 0
        const urlInfo = mediaInfo.url_info
        fileType = inferKbFileType({
          mediaType,
          title: item.title,
          downloadUrl: urlInfo?.url,
          currentType: fileType,
        })

        // 笔记类型(11) 和 AI 会话类型(12) 走 notebook_ext_info / session_info，无独立文件可下载
        if (mediaType === 11 || mediaType === 12) {
          // 笔记/会话类型：不下载到 R2，仅记录元数据
          fileSize = null
        } else {
          // 从 url_info 拿临时下载 URL
          const downloadUrl = urlInfo?.url
          if (downloadUrl) {
            // 构造请求头（如 IMA 要求 Authorization 等）；同时补 Referer 兜底
            const fetchHeaders: Record<string, string> = {}
            if (urlInfo.headers && typeof urlInfo.headers === 'object') {
              for (const [k, v] of Object.entries(urlInfo.headers)) {
                fetchHeaders[k] = String(v)
              }
            }
            const fileRes = await fetchWithImaFallbacks(downloadUrl, fetchHeaders)
            if (fileRes) {
              fileType = inferKbFileType({
                mediaType,
                title: item.title,
                downloadUrl,
                contentType: fileRes.headers.get('Content-Type'),
                currentType: fileType,
              })
              const buf = await fileRes.arrayBuffer()
              // 按文件类型选扩展名（补全 ppt 键，避免落到 bin）
              const extMap: Record<string, string> = {
                pdf: 'pdf',
                docx: 'docx',
                ppt: 'pptx',
                xlsx: 'xlsx',
                md: 'md',
                txt: 'txt',
                image: 'img',
                web: 'html',
                xmind: 'xmind',
                audio: 'mp3',
                html: 'html',
                session: '',
              }
              const ext = extMap[fileType] || 'bin'
              r2Key = ext ? `ima/${mediaId}.${ext}` : `ima/${mediaId}`
              await env.STORAGE.put(r2Key, buf, {
                httpMetadata: {
                  contentType: fileRes.headers.get('Content-Type') || 'application/octet-stream',
                },
              })
              fileSize = buf.byteLength
              // 文本类文件提取文本内容，供 DocViewer 无需再走鉴权拉取即可渲染
              if (fileType === 'md' || fileType === 'txt' || fileType === 'html') {
                try {
                  textContent = new TextDecoder('utf-8').decode(buf)
                } catch {
                  // 解码失败忽略，DocViewer 仍可走二进制拉取
                }
              }
            } else {
              downloadFailed = true
            }
          } else {
            downloadFailed = true
          }
        }
      } catch (e) {
        console.error('[ima] getMediaInfo/download failed:', mediaId, e)
        downloadFailed = true
      }

      // 已支持的文件类型集合：用于保护已有文档的已知类型不被降级
      const SUPPORTED_TYPES = new Set([
        'pdf',
        'docx',
        'xlsx',
        'image',
        'txt',
        'html',
        'audio',
        'md',
        'ppt',
        'web',
        'note',
        'session',
        'xmind',
      ])

      if (existing.length > 0) {
        // 已有文档 re-sync：保护旧的已知类型不被降级为 unknown/unavailable
        const oldType = existing[0].fileType
        if (oldType && SUPPORTED_TYPES.has(oldType) && !SUPPORTED_TYPES.has(fileType)) {
          fileType = oldType
        }
        const oldR2Key = existing[0].r2Key
        await db
          .update(schema.kbDocuments)
          .set({
            title: item.title || '无标题',
            fileType,
            content: textContent ?? '',
            r2Key: r2Key ?? undefined,
            fileSize: fileSize ?? undefined,
            updatedAt: nowBeijing(),
          })
          .where(eq(schema.kbDocuments.id, mediaId))
        // r2Key 变化时清理旧的 R2 对象，避免孤儿文件
        if (oldR2Key && oldR2Key !== r2Key) {
          try {
            await env.STORAGE.delete(oldR2Key)
          } catch (e) {
            console.error('[ima] 旧 R2 清理失败:', oldR2Key, e)
          }
        }
      } else {
        // 新文档：下载失败时仅当类型推断也失败才标 unavailable
        if (downloadFailed && !SUPPORTED_TYPES.has(fileType)) {
          fileType = 'unavailable'
          r2Key = null
          fileSize = null
          textContent = null
        }
        await db.insert(schema.kbDocuments).values({
          id: mediaId,
          title: item.title || '无标题',
          content: textContent || '',
          fileType,
          r2Key: r2Key ?? undefined,
          fileSize: fileSize ?? undefined,
        })
        syncedCount++
      }
    }
  }

  // 清理 IMA 端已删除的本地知识库文档及 R2 文件（所有 base 都拉取成功才执行）
  if (allBasesFetchedOk && allFetchedMediaIds.size > 0) {
    const imaDocs = await db
      .select({ id: schema.kbDocuments.id, r2Key: schema.kbDocuments.r2Key })
      .from(schema.kbDocuments)
      .where(like(schema.kbDocuments.r2Key, 'ima/%'))
    const ids = imaDocs.map((d) => d.id)
    const toDeleteIds = ids.filter((id) => !allFetchedMediaIds.has(id))
    if (toDeleteIds.length > 0) {
      for (const id of toDeleteIds) {
        const doc = imaDocs.find((d) => d.id === id)
        if (doc?.r2Key) {
          try {
            await env.STORAGE.delete(doc.r2Key)
          } catch (e) {
            console.error('[ima] 删除孤儿 R2 失败:', doc.r2Key, e)
          }
        }
      }
      await db.delete(schema.kbDocuments).where(inArray(schema.kbDocuments.id, toDeleteIds))
      // 清理 Vectorize 中的向量嵌入（批量删除，失败不阻塞主流程）
      try {
        const vectorIds = toDeleteIds.map((id) => `kb:${id}`)
        for (let i = 0; i < vectorIds.length; i += 50) {
          await env.VECTORIZE.deleteByIds(vectorIds.slice(i, i + 50)).catch((e) =>
            console.error('[ima] KB vector cleanup batch failed:', e?.message),
          )
        }
      } catch (e) {
        console.error('[ima] KB vector cleanup failed:', e)
      }
      syncedCount -= toDeleteIds.length
    }
  } else if (!allBasesFetchedOk) {
    console.warn('[ima] syncKnowledgeBase: 部分知识库拉取失败，跳过清理以保护数据')
  }

  // 仅当全部知识库拉取成功时才更新同步时间戳，避免部分失败导致数据丢失
  if (allBasesFetchedOk) {
    await setSetting(env, 'ima_kb_synced_at', nowBeijing())
  }
  return { synced: syncedCount }
}

// 获取 IMA 同步状态
export async function getImaStatus(
  env: Env,
): Promise<{ authorized: boolean; lastSync: string | null }> {
  const db = drizzle(env.DB, { schema })
  const clientIdRow = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'ima_client_id'))
  const apiKeyRow = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'ima_api_key'))
  const lastSyncRow = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'ima_last_sync'))
  return {
    authorized:
      clientIdRow.length > 0 &&
      !!clientIdRow[0].value &&
      apiKeyRow.length > 0 &&
      !!apiKeyRow[0].value,
    lastSync: lastSyncRow.length > 0 ? lastSyncRow[0].value : null,
  }
}
