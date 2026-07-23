import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'
import { eq, notInArray, inArray, like } from 'drizzle-orm'
import { decrypt } from './crypto-utils'
import type { Env } from './types'

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
  const clientIdRow = await db.select().from(schema.settings).where(eq(schema.settings.key, 'ima_client_id'))
  const apiKeyRow = await db.select().from(schema.settings).where(eq(schema.settings.key, 'ima_api_key'))
  if (!clientIdRow.length || !apiKeyRow.length) return null
  // api_key 走解密（若以 enc$ 开头则解密，否则明文返回）
  const apiKey = await decrypt(env.JWT_SECRET, apiKeyRow[0].value)
  return { clientId: clientIdRow[0].value, apiKey }
}

/**
 * 设置工具：读取/写入 settings 表（增量同步时间戳等）
 */
async function getSetting(env: Env, key: string): Promise<string | null> {
  const db = drizzle(env.DB, { schema })
  const result = await db.select().from(schema.settings).where(eq(schema.settings.key, key))
  return result.length > 0 ? result[0].value : null
}

async function setSetting(env: Env, key: string, value: string): Promise<void> {
  const db = drizzle(env.DB, { schema })
  await db.insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date().toISOString() } })
}

// 通用 IMA API 调用
async function imaPost(apiPath: string, body: any, creds: ImaCredentials): Promise<any> {
  const res = await fetch(`${IMA_BASE_URL}/${apiPath}`, {
    method: 'POST',
    headers: {
      'ima-openapi-clientid': creds.clientId,
      'ima-openapi-apikey': creds.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json() as any
  if (data.code !== 0) {
    throw new Error(`IMA API 错误 [${data.code}]: ${data.msg || '未知错误'}`)
  }
  return data.data
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
      const data = await imaPost('openapi/note/v1/get_doc_content', {
        note_id: noteId,
        target_content_format: 1, // MARKDOWN，保留原始格式
      }, creds)
      return data.content || ''
    } catch (e: any) {
      // 若服务端不支持 Markdown 格式，降级为纯文本
      if (e.message?.includes('target_content_format')) {
        const data = await imaPost('openapi/note/v1/get_doc_content', {
          note_id: noteId,
          target_content_format: 0, // PLAINTEXT
        }, creds)
        return data.content || ''
      }
      throw e
    }
  })
}

// 从笔记内容中提取 IMA media_id 引用（Markdown 图片/链接、HTML img/a 中既非 http 也非相对路径的 token）
const MARKDOWN_MEDIA_REGEX = /!\[[^\]]*\]\(([^)\s]+)\)|\[[^\]]*\]\(([^)\s]+)\)/g
const HTML_IMG_REGEX = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
const HTML_LINK_REGEX = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi
const URL_LIKE_REGEX = /^(https?:\/\/|\.\/|\/|#|mailto:|tel:|data:)/i

function maybeMediaRef(ref: string): boolean {
  if (!ref || ref.length < 3) return false
  if (URL_LIKE_REGEX.test(ref)) return false
  if (ref.startsWith('(') || ref.includes('\n')) return false
  return true
}

export function extractMediaRefs(content: string): string[] {
  const refs = new Set<string>()
  const add = (raw: string) => {
    const ref = raw.trim()
    if (maybeMediaRef(ref)) refs.add(ref)
  }
  let m: RegExpExecArray | null
  while ((m = MARKDOWN_MEDIA_REGEX.exec(content)) !== null) add(m[1] || m[2] || '')
  while ((m = HTML_IMG_REGEX.exec(content)) !== null) add(m[1] || '')
  while ((m = HTML_LINK_REGEX.exec(content)) !== null) add(m[1] || '')
  return Array.from(refs)
}

// 提取 Markdown/HTML 中的 http 图片 URL（IMA 返回的图片是带签名参数的临时 URL）
const IMAGE_URL_REGEX = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)|<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi

export function extractImageUrls(content: string): string[] {
  const urls = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = IMAGE_URL_REGEX.exec(content)) !== null) {
    const url = (m[1] || m[2] || '').trim()
    if (url) urls.add(url)
  }
  return Array.from(urls)
}

// 检查内容中是否还有未处理的 http 图片 URL（用于增量同步判断）
export function hasUnprocessedImages(content: string): boolean {
  return /!\[[^\]]*\]\(https?:\/\/[^)]+\)|<img[^>]+src=["']https?:\/\/[^"']+["']/i.test(content)
}

// 用 URL pathname 生成确定性 hash 作为 R2 key 标识
async function hashToId(pathname: string): Promise<string> {
  const data = new TextEncoder().encode(pathname)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

/**
 * 下载 IMA media_id 媒体文件到 R2（用于非 URL 类型的 media_id 引用）。
 */
export async function downloadImaMediaToR2(env: Env, mediaId: string): Promise<string | null> {
  const r2Key = `ima/attachments/${mediaId}`
  try {
    const exists = await env.STORAGE.head(r2Key)
    if (exists) return r2Key
  } catch { /* ignore */ }

  try {
    const mediaInfo = await getMediaInfo(env, mediaId)
    const urlInfo = mediaInfo.url_info
    const downloadUrl = urlInfo?.url
    if (!downloadUrl) {
      console.warn('[ima] media no download url:', mediaId)
      return null
    }
    const fetchHeaders: Record<string, string> = {}
    if (urlInfo.headers && typeof urlInfo.headers === 'object') {
      for (const [k, v] of Object.entries(urlInfo.headers)) fetchHeaders[k] = String(v)
    }
    const fileRes = await fetch(downloadUrl, { headers: fetchHeaders })
    if (!fileRes.ok) {
      console.warn('[ima] media download failed:', mediaId, fileRes.status)
      return null
    }
    const buf = await fileRes.arrayBuffer()
    const contentType = fileRes.headers.get('Content-Type') || 'application/octet-stream'
    await env.STORAGE.put(r2Key, buf, { httpMetadata: { contentType }, customMetadata: { mediaId } })
    return r2Key
  } catch (e) {
    console.error('[ima] downloadImaMediaToR2 failed:', mediaId, e)
    return null
  }
}

/**
 * 下载图片 URL 到 R2。IMA 返回的图片 URL 带签名参数会过期，
 * 用 pathname 的 hash 作为永久 key，已存在则跳过。
 */
export async function downloadUrlToR2(env: Env, imageUrl: string): Promise<string | null> {
  let pathname: string
  try {
    pathname = new URL(imageUrl).pathname
  } catch {
    pathname = imageUrl
  }
  const mediaId = await hashToId(pathname)
  const r2Key = `ima/attachments/${mediaId}`
  try {
    const exists = await env.STORAGE.head(r2Key)
    if (exists) return r2Key
  } catch { /* ignore */ }

  // 反转义 Markdown 转义字符（\& → &）再下载
  const downloadUrl = imageUrl.replace(/\\(.)/g, '$1')
  try {
    // 腾讯云 COS/CDN 图片通常校验 Referer，裸 fetch 会 403
    // 带 Referer + UA 提高成功率
    const res = await fetch(downloadUrl, {
      headers: {
        'Referer': 'https://ima.qq.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*;q=0.8',
      },
    })
    if (!res.ok) {
      console.warn('[ima] image download failed:', res.status, downloadUrl.slice(0, 80))
      return null
    }
    const buf = await res.arrayBuffer()
    const contentType = res.headers.get('Content-Type') || 'application/octet-stream'
    await env.STORAGE.put(r2Key, buf, { httpMetadata: { contentType }, customMetadata: { sourcePath: pathname } })
    console.log('[ima] image downloaded:', mediaId, contentType, buf.byteLength)
    return r2Key
  } catch (e) {
    console.error('[ima] downloadUrlToR2 failed:', mediaId, e)
    return null
  }
}

/**
 * 处理笔记内容中的所有媒体引用：
 * 1. http 图片 URL → 下载到 R2，替换为本地 /api/ima/media-file/{hash}
 * 2. media_id 引用 → 通过 getMediaInfo 下载，替换为本地路径
 */
export async function processNoteContentMedia(env: Env, content: string): Promise<string> {
  const imageUrls = extractImageUrls(content)
  const mediaIdRefs = extractMediaRefs(content)
  if (imageUrls.length === 0 && mediaIdRefs.length === 0) return content

  console.log('[ima] processNoteContentMedia: urls=', imageUrls.length, 'mediaIds=', mediaIdRefs.length)
  let processed = content

  // 处理 http 图片 URL — 用 split/join 避免正则转义问题
  for (const url of imageUrls) {
    const r2Key = await downloadUrlToR2(env, url)
    if (!r2Key) continue
    const mediaId = r2Key.split('/').pop()!
    const localUrl = `/api/ima/media-file/${mediaId}`
    processed = processed.split(url).join(localUrl)
  }

  // 处理 media_id 引用
  for (const mediaId of mediaIdRefs) {
    const r2Key = await downloadImaMediaToR2(env, mediaId)
    if (!r2Key) continue
    const localUrl = `/api/ima/media-file/${mediaId}`
    const escaped = mediaId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    processed = processed.replace(
      new RegExp(`(!\\[[^\\]]*\\]\\()${escaped}(\\)|\\[[^\\]]*\\]\\()${escaped}(\\))`, 'g'),
      (_m, imgP, imgS, linkP, linkS) => imgP ? `${imgP}${localUrl}${imgS}` : `${linkP}${localUrl}${linkS}`,
    )
    processed = processed.replace(new RegExp(`(<img[^>]+src=["'])${escaped}(["'][^>]*>)`, 'gi'), `$1${localUrl}$2`)
    processed = processed.replace(new RegExp(`(<a[^>]+href=["'])${escaped}(["'][^>]*>)`, 'gi'), `$1${localUrl}$2`)
  }
  return processed
}

/**
 * 清理笔记内容引用的 R2 附件（删除笔记时调用，避免孤岛数据）。
 * 共享附件保护：删前扫描所有其他笔记，若附件仍被引用则保留，避免误删。
 */
export async function cleanupAttachments(env: Env, content: string): Promise<void> {
  const regex = /\/api\/ima\/media-file\/([^\s)"'\]]+)/g
  const ids = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = regex.exec(content)) !== null) ids.add(m[1])
  if (ids.size === 0) return
  const db = drizzle(env.DB, { schema })
  // 拉取所有笔记的 content（当前笔记此时仍在 DB 中，删除 endpoint 先清附件再删 D1）
  const allNotes = await db.select({ content: schema.imaNotes.content }).from(schema.imaNotes)
  for (const id of ids) {
    const refPattern = `/api/ima/media-file/${id}`
    // refCount 包含当前笔记；若 >1 说明其他笔记也引用，保留附件避免误删
    const refCount = allNotes.filter(n => (n.content || '').includes(refPattern)).length
    if (refCount > 1) {
      console.log('[ima] 保留共享附件（被 ' + refCount + ' 条笔记引用）:', id)
      continue
    }
    try {
      await env.STORAGE.delete(`ima/attachments/${id}`)
      console.log('[ima] cleanup attachment:', id)
    } catch { /* ignore */ }
  }
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

  const data = await imaPost('openapi/note/v1/append_doc', {
    note_id: noteId,
    content_format: 1, // MARKDOWN
    content,
  }, creds)

  return (data.note_id || noteId) as string
}

/**
 * 同步笔记到本地 D1（增量：首次全量，后续按 updated_at 过滤）
 * 拉取所有笔记本 → 用户自建文件夹递归拉取笔记 + 根目录笔记 → 笔记内容
 * 按 note_id 去重；settings 表存 ima_notes_synced_at 记录上次同步时间
 */
export async function syncNotes(env: Env): Promise<{ synced: number }> {
  const db = drizzle(env.DB, { schema })
  let syncedCount = 0

  // 读取上次同步时间（增量过滤）
  const lastSyncedAt = await getSetting(env, 'ima_notes_synced_at')

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

  // 4. 逐条同步笔记内容（增量过滤：updated_at > lastSyncedAt）
  for (const note of allNotesMap.values()) {
    const noteId = note.note_id
    const title = note.title || '无标题'
    const noteUpdatedAt = note.updated_at || note.update_time

    // 检查是否已存在
    const existing = await db.select().from(schema.imaNotes)
      .where(eq(schema.imaNotes.id, noteId))

    // 增量过滤：若笔记未更新且内容里已无未处理的媒体引用/图片 URL，则跳过
    const oldContent = existing.length > 0 ? (existing[0].content || '') : ''
    const hasUnprocessedMedia = oldContent && (extractMediaRefs(oldContent).length > 0 || hasUnprocessedImages(oldContent))
    if (lastSyncedAt && noteUpdatedAt && new Date(noteUpdatedAt) <= new Date(lastSyncedAt) && !hasUnprocessedMedia) {
      continue
    }

    // 拉取笔记内容；失败时保留已有内容，避免用占位文本覆盖真实数据
    let content = existing.length > 0 ? existing[0].content : ''
    try {
      content = await getNoteContent(env, noteId)
    } catch {
      // 拉取失败时保留旧内容
    }

    // 下载正文中的图片/附件到 R2，并把引用替换为本地可访问链接
    try {
      content = await processNoteContentMedia(env, content)
    } catch (e) {
      console.error('[ima] processNoteContentMedia failed:', noteId, e)
    }

    if (!content) content = '（内容获取失败）'

    if (existing.length > 0) {
      // 更新
      await db.update(schema.imaNotes)
        .set({
          title,
          content,
          sourceFile: 'ima_openapi',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.imaNotes.id, noteId))
    } else {
      // 新增
      await db.insert(schema.imaNotes).values({
        id: noteId,
        title,
        content,
        sourceFile: 'ima_openapi',
      })
    }
    syncedCount++
  }

  // 5. 清理 IMA 端已删除的本地笔记（仅根目录和所有文件夹都拉取成功时执行，确保快照完整）
  if (rootFetchOk && allFoldersFetchedOk) {
    const imaNoteIds = Array.from(allNotesMap.keys())
    const localImaNotes = await db.select({ id: schema.imaNotes.id, content: schema.imaNotes.content }).from(schema.imaNotes)
      .where(eq(schema.imaNotes.sourceFile, 'ima_openapi'))
    const toDelete = localImaNotes.filter((n) => !imaNoteIds.includes(n.id))
    if (toDelete.length > 0) {
      // 先清理每条笔记引用的 R2 附件
      for (const n of toDelete) {
        await cleanupAttachments(env, n.content || '')
      }
      if (imaNoteIds.length > 0) {
        await db.delete(schema.imaNotes).where(notInArray(schema.imaNotes.id, imaNoteIds))
      } else {
        await db.delete(schema.imaNotes).where(eq(schema.imaNotes.sourceFile, 'ima_openapi'))
      }
      syncedCount -= toDelete.length
    }
  }

  // 更新同步时间戳
  await setSetting(env, 'ima_notes_synced_at', new Date().toISOString())

  return { synced: syncedCount }
}

// ========== 知识库同步 ==========

/**
 * 搜索知识库列表
 * POST /openapi/wiki/v1/search_knowledge_base
 */
export async function searchKnowledgeBases(env: Env, query: string) {
  const creds = await getCredentials(env)
  if (!creds) throw new Error('未配置 IMA 凭证')

  const data = await imaPost('openapi/wiki/v1/search_knowledge_base', {
    query,
    cursor: '',
    limit: 20,
  }, creds)

  return data.info_list || []
}

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
    const data = await imaPost('openapi/wiki/v1/get_addable_knowledge_base_list', {
      cursor,
      limit: 50,
    }, creds)
    if (data.addable_knowledge_base_list) {
      bases.push(...data.addable_knowledge_base_list)
    }
    isEnd = data.is_end
    cursor = data.next_cursor || ''
  }

  return bases
}

/**
 * 获取知识库信息
 * POST /openapi/wiki/v1/get_knowledge_base
 */
export async function getKnowledgeBaseInfo(env: Env, kbIds: string[]) {
  const creds = await getCredentials(env)
  if (!creds) throw new Error('未配置 IMA 凭证')

  const data = await imaPost('openapi/wiki/v1/get_knowledge_base', {
    ids: kbIds,
  }, creds)

  return data.infos || {}
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

  const data = await imaPost('openapi/wiki/v1/get_media_info', {
    media_id: mediaId,
  }, creds)

  return data
}

/**
 * 搜索知识库内容
 * POST /openapi/wiki/v1/search_knowledge
 */
export async function searchKnowledge(env: Env, kbId: string, query: string) {
  const creds = await getCredentials(env)
  if (!creds) throw new Error('未配置 IMA 凭证')

  const data = await imaPost('openapi/wiki/v1/search_knowledge', {
    query,
    cursor: '',
    knowledge_base_id: kbId,
  }, creds)

  return data.info_list || []
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

  // 读取上次同步时间（增量过滤）
  const lastSyncedAt = await getSetting(env, 'ima_kb_synced_at')

  // 获取可访问的知识库列表
  const bases = await listAddableKnowledgeBases(env)

  for (const base of bases) {
    // 浏览知识库内容（分页拉取）
    const knowledgeList = await fetchAllKbItems(env, base.id)

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
      const existing = await db.select().from(schema.kbDocuments)
        .where(eq(schema.kbDocuments.id, mediaId))

      // 获取媒体信息确定文件类型 + 下载 URL
      let mediaType = 0
      let fileType = 'unknown'
      let r2Key: string | null = null
      let fileSize: number | null = null
      // 文本类文件（md/txt/html）下载后提取文本写入 content 字段，供 DocViewer 直接渲染
      let textContent: string | null = null

      try {
        const mediaInfo = await getMediaInfo(env, mediaId)
        mediaType = mediaInfo.media_type || 0
        // MediaType 枚举（ima-skills 1.1.8）：
        // 1=PDF, 2=网页, 3=Word, 4=PPT, 5=Excel, 6=公众号, 7=Markdown,
        // 9=图片, 11=笔记, 12=AI会话, 13=TXT, 14=Xmind, 15=录音, 20=HTML文件
        const typeMap: Record<number, string> = {
          1: 'pdf', 2: 'web', 3: 'docx', 4: 'ppt', 5: 'xlsx',
          6: 'web', 7: 'md', 9: 'image', 11: 'note', 12: 'session',
          13: 'txt', 14: 'xmind', 15: 'audio', 20: 'html',
        }
        fileType = typeMap[mediaType] || 'unknown'

        // 笔记类型(11) 和 AI 会话类型(12) 走 notebook_ext_info / session_info，无独立文件可下载
        if (mediaType === 11 || mediaType === 12) {
          // 笔记/会话类型：不下载到 R2，仅记录元数据
          fileSize = null
        } else {
          // 从 url_info 拿临时下载 URL
          const urlInfo = mediaInfo.url_info
          const downloadUrl = urlInfo?.url
          if (downloadUrl) {
            // 构造请求头（如 IMA 要求 Authorization 等）；同时补 Referer 兜底
            const fetchHeaders: Record<string, string> = {
              'Referer': 'https://ima.qq.com/',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            }
            if (urlInfo.headers && typeof urlInfo.headers === 'object') {
              for (const [k, v] of Object.entries(urlInfo.headers)) {
                fetchHeaders[k] = String(v)
              }
            }
            const fileRes = await fetch(downloadUrl, { headers: fetchHeaders })
            if (fileRes.ok) {
              const buf = await fileRes.arrayBuffer()
              // 按文件类型选扩展名（补全 ppt 键，避免落到 bin）
              const extMap: Record<string, string> = {
                pdf: 'pdf', docx: 'docx', ppt: 'pptx', xlsx: 'xlsx',
                md: 'md', txt: 'txt', image: 'img', web: 'html',
                xmind: 'xmind', audio: 'mp3', html: 'html', session: '',
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
              // 下载失败：标记不可用
              fileType = 'unavailable'
            }
          } else {
            // 无下载 URL：标记不可用
            fileType = 'unavailable'
          }
        }
      } catch (e) {
        console.error('[ima] getMediaInfo/download failed:', mediaId, e)
        fileType = 'unavailable'
      }

      if (existing.length > 0) {
        const oldR2Key = existing[0].r2Key
        await db.update(schema.kbDocuments)
          .set({
            title: item.title || '无标题',
            fileType,
            content: textContent ?? existing[0].content,
            r2Key: r2Key ?? undefined,
            fileSize: fileSize ?? undefined,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.kbDocuments.id, mediaId))
        // r2Key 变化时清理旧的 R2 对象，避免孤儿文件
        if (oldR2Key && oldR2Key !== r2Key) {
          try { await env.STORAGE.delete(oldR2Key) } catch (e) {
            console.error('[ima] 旧 R2 清理失败:', oldR2Key, e)
          }
        }
      } else {
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
  if (allFetchedMediaIds.size > 0) {
    const imaDocs = await db.select({ id: schema.kbDocuments.id, r2Key: schema.kbDocuments.r2Key }).from(schema.kbDocuments)
      .where(like(schema.kbDocuments.r2Key, 'ima/%'))
    const ids = imaDocs.map((d) => d.id)
    const toDeleteIds = ids.filter((id) => !allFetchedMediaIds.has(id))
    if (toDeleteIds.length > 0) {
      for (const id of toDeleteIds) {
        const doc = imaDocs.find((d) => d.id === id)
        if (doc?.r2Key) {
          try { await env.STORAGE.delete(doc.r2Key) } catch (e) {
            console.error('[ima] 删除孤儿 R2 失败:', doc.r2Key, e)
          }
        }
      }
      await db.delete(schema.kbDocuments).where(inArray(schema.kbDocuments.id, toDeleteIds))
      syncedCount -= toDeleteIds.length
    }
  }

  // 更新同步时间戳
  await setSetting(env, 'ima_kb_synced_at', new Date().toISOString())
  return { synced: syncedCount }
}

// 获取 IMA 同步状态
export async function getImaStatus(env: Env): Promise<{ authorized: boolean; lastSync: string | null }> {
  const db = drizzle(env.DB, { schema })
  const clientIdRow = await db.select().from(schema.settings).where(eq(schema.settings.key, 'ima_client_id'))
  const apiKeyRow = await db.select().from(schema.settings).where(eq(schema.settings.key, 'ima_api_key'))
  const lastSyncRow = await db.select().from(schema.settings).where(eq(schema.settings.key, 'ima_last_sync'))
  return {
    authorized: clientIdRow.length > 0 && !!clientIdRow[0].value && apiKeyRow.length > 0 && !!apiKeyRow[0].value,
    lastSync: lastSyncRow.length > 0 ? lastSyncRow[0].value : null,
  }
}
