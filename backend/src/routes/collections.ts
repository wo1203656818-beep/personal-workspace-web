import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc, sql } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '../schema'
import type { Env } from '../types'

const collections = new Hono<{ Bindings: Env }>()

interface MediaBody {
  title?: string
  kind?: string
  author?: string
  status?: string
  rating?: number
  note?: string
}

interface BookmarkBody {
  url?: string
  title?: string
  summary?: string
  tags?: string[] | string
  readStatus?: string
  progress?: number
  readingNote?: string
}

// ─────────── 书 / 影 / 剧 / 游戏清单 ───────────

collections.get('/media', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const kind = c.req.query('kind')
    const status = c.req.query('status')
    let q: any = db.select().from(schema.mediaItems)
    if (kind) q = q.where(eq(schema.mediaItems.kind, kind))
    if (status) {
      q = q.where(eq(schema.mediaItems.status, status))
    }
    const rows = await q.orderBy(desc(schema.mediaItems.updatedAt))
    return c.json(rows)
  } catch (err) {
    console.error('Media list error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

collections.post('/media', async (c) => {
  try {
    let body: MediaBody
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: '请求体格式无效' }, 400)
    }
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const kind: 'book' | 'movie' | 'tv' | 'game' = body?.kind === 'book' || body?.kind === 'movie' || body?.kind === 'tv' || body?.kind === 'game' ? body.kind : 'book'
    if (!title) return c.json({ error: '标题不能为空' }, 400)
    const db = drizzle(c.env.DB, { schema })
    const id = crypto.randomUUID()
    await db.insert(schema.mediaItems).values({
      id,
      kind,
      title,
      author: typeof body?.author === 'string' ? body.author : null,
      status: body?.status === 'want' || body?.status === 'doing' || body?.status === 'done' ? body.status : 'want',
      rating: typeof body?.rating === 'number' && body.rating >= 1 && body.rating <= 5 ? Math.round(body.rating) : null,
      note: typeof body?.note === 'string' ? body.note : null,
    })
    const [row] = await db.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, id))
    return c.json(row, 201)
  } catch (err) {
    console.error('Media create error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

collections.put('/media/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'ID 不能为空' }, 400)
    let body: MediaBody
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: '请求体格式无效' }, 400)
    }
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, id))
    if (!existing) return c.json({ error: '条目不存在' }, 404)
    await db
      .update(schema.mediaItems)
      .set({
        title: typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : existing.title,
        author: typeof body?.author === 'string' ? body.author : existing.author,
        status: ['want', 'doing', 'done'].includes(body?.status as string) ? body.status : existing.status,
        rating:
          typeof body?.rating === 'number' && body.rating >= 1 && body.rating <= 5 ? Math.round(body.rating) : body?.rating === null ? null : existing.rating,
        note: typeof body?.note === 'string' ? body.note : existing.note,
        updatedAt: sql`(datetime('now'))`,
      })
      .where(eq(schema.mediaItems.id, id))
    const [row] = await db.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, id))
    return c.json(row)
  } catch (err) {
    console.error('Media update error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

collections.delete('/media/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'ID 不能为空' }, 400)
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, id))
    if (!existing) return c.json({ error: '条目不存在' }, 404)
    await db.delete(schema.mediaItems).where(eq(schema.mediaItems.id, id))
    return c.json({ ok: true })
  } catch (err) {
    console.error('Media delete error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

// ─────────── 收藏链接（剪藏 / 稍后读）───────────

collections.get('/bookmarks', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const status = c.req.query('status')
    let q: any = db.select().from(schema.bookmarks)
    if (status) q = q.where(eq(schema.bookmarks.readStatus, status))
    const rows = await q.orderBy(desc(schema.bookmarks.createdAt))
    return c.json(rows)
  } catch (err) {
    console.error('Bookmarks list error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

collections.post('/bookmarks', async (c) => {
  try {
    let body: BookmarkBody
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: '请求体格式无效' }, 400)
    }
    const url = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!url || !/^https?:\/\//i.test(url)) return c.json({ error: '链接格式无效' }, 400)
    const db = drizzle(c.env.DB, { schema })
    const id = crypto.randomUUID()
    await db.insert(schema.bookmarks).values({
      id,
      url,
      title: typeof body?.title === 'string' ? body.title : null,
      summary: typeof body?.summary === 'string' ? body.summary : null,
      tags:
        Array.isArray(body?.tags)
          ? JSON.stringify(body.tags.map((t: any) => String(t)))
          : typeof body?.tags === 'string' && body.tags
            ? body.tags
            : null,
      readStatus: ['unread', 'read', 'archived'].includes(body?.readStatus as string)
        ? body.readStatus
        : 'unread',
    })
    const [row] = await db.select().from(schema.bookmarks).where(eq(schema.bookmarks.id, id))
    return c.json(row, 201)
  } catch (err) {
    console.error('Bookmarks create error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

collections.put('/bookmarks/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'ID 不能为空' }, 400)
    let body: BookmarkBody
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: '请求体格式无效' }, 400)
    }
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.bookmarks).where(eq(schema.bookmarks.id, id))
    if (!existing) return c.json({ error: '链接不存在' }, 404)
    await db
      .update(schema.bookmarks)
      .set({
        title: typeof body?.title === 'string' ? body.title : existing.title,
        summary: typeof body?.summary === 'string' ? body.summary : existing.summary,
        tags:
          Array.isArray(body?.tags)
            ? JSON.stringify(body.tags.map((t: any) => String(t)))
            : typeof body?.tags === 'string'
              ? body.tags
              : existing.tags,
        readStatus: ['unread', 'read', 'archived'].includes(body?.readStatus as string)
          ? body.readStatus
          : existing.readStatus,
        progress: typeof body?.progress === 'number' ? Math.max(0, Math.min(100, body.progress)) : existing.progress,
        readingNote: typeof body?.readingNote === 'string' ? body.readingNote : existing.readingNote,
      })
      .where(eq(schema.bookmarks.id, id))
    const [row] = await db.select().from(schema.bookmarks).where(eq(schema.bookmarks.id, id))
    return c.json(row)
  } catch (err) {
    console.error('Bookmarks update error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

collections.delete('/bookmarks/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'ID 不能为空' }, 400)
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.bookmarks).where(eq(schema.bookmarks.id, id))
    if (!existing) return c.json({ error: '链接不存在' }, 404)
    await db.delete(schema.bookmarks).where(eq(schema.bookmarks.id, id))
    return c.json({ ok: true })
  } catch (err) {
    console.error('Bookmarks delete error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

export default collections
