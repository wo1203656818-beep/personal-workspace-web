import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { imaCreateNoteSchema, imaAppendNoteSchema } from '../validation'
import { nowBeijing } from '../time'
import { logSync } from '../sync-logger'
import {
  syncNotes, syncKnowledgeBase, getImaStatus, listNotebooks, listNotes,
  listAddableKnowledgeBases, getKnowledgeList, getMediaInfo,
  createNote as imaCreateNote, appendNote as imaAppendNote,
  stripImagesAndAttachments, markdownToCleanHtml,
} from '../ima-sync'
import { withIdempotency } from '../idempotent'
import { indexTarget } from '../utils/vectorize'

const ima = new Hono<{ Bindings: Env }>()

ima.get('/status', async (c) => {
  const status = await getImaStatus(c.env)
  return c.json(status)
})

// IMA 笔记全量同步（同步执行，墙钟预算 18s + 子请求预算 60，超预算返回 partial）
ima.post('/sync-notes', async (c) => {
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
ima.post('/backfill-content-html', async (c) => {
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
ima.post('/sync-kb', async (c) => {
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
ima.get('/notebooks', async (c) => {
  try {
    const notebooks = await listNotebooks(c.env)
    return c.json(notebooks)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// IMA 笔记列表
ima.get('/notes', async (c) => {
  try {
    const folderId = c.req.query('folder_id') || undefined
    const notes = await listNotes(c.env, folderId)
    return c.json(notes)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// IMA 知识库列表
ima.get('/knowledge-bases', async (c) => {
  try {
    const bases = await listAddableKnowledgeBases(c.env)
    return c.json(bases)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// IMA 知识库内容列表
ima.get('/knowledge-list', async (c) => {
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
ima.get('/media/:mediaId', async (c) => {
  try {
    const { mediaId } = c.req.param()
    const info = await getMediaInfo(c.env, mediaId)
    return c.json(info)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// IMA 笔记写回：新建笔记（同步到 IMA）— 支持 Idempotency-Key 幂等保护
ima.post('/notes', async (c) => {
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
ima.post('/notes/:id/append', async (c) => {
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

export default ima
