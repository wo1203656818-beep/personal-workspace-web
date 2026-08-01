import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, or, like, desc, sql } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { createNoteSchema, updateNoteSchema } from '../validation'
import { nowBeijing } from '../time'
import { indexTarget } from '../utils/vectorize'

const notes = new Hono<{ Bindings: Env }>()

notes.get('/', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10) || 20, 100)
    const rows = await db
      .select()
      .from(schema.imaNotes)
      .orderBy(desc(schema.imaNotes.updatedAt))
      .limit(limit)
    return c.json(rows)
  } catch (err) {
    console.error('Notes list error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// 笔记摘要列表：只返回列表需要的字段，避免传输大段 content
notes.get('/summary', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 200)
    const rows = await db
      .select({
        id: schema.imaNotes.id,
        title: schema.imaNotes.title,
        sourceFile: schema.imaNotes.sourceFile,
        importedAt: schema.imaNotes.importedAt,
        updatedAt: schema.imaNotes.updatedAt,
        snippet: sql<string>`substr(coalesce(${schema.imaNotes.content}, ''), 1, 200)`,
      })
      .from(schema.imaNotes)
      .orderBy(desc(schema.imaNotes.updatedAt))
      .limit(limit)
    return c.json(rows)
  } catch (err) {
    console.error('Notes summary error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// 搜索笔记
notes.get('/search', async (c) => {
  try {
    const q = c.req.query('q') || ''
    if (!q) return c.json([])
    const db = drizzle(c.env.DB, { schema })
    const result = await db
      .select()
      .from(schema.imaNotes)
      .where(or(like(schema.imaNotes.title, `%${q}%`), like(schema.imaNotes.content, `%${q}%`)))
    return c.json(result)
  } catch (err) {
    console.error('Notes search error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

notes.get('/:id', async (c) => {
  try {
    const { id } = c.req.param()
    const db = drizzle(c.env.DB, { schema })
    const note = await db.select().from(schema.imaNotes).where(eq(schema.imaNotes.id, id))
    if (!note.length) return c.json({ error: '未找到' }, 404)
    return c.json(note[0])
  } catch (err) {
    console.error('Notes get error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// 更新笔记（支持部分更新：只更新传入的字段）
notes.put('/:id', async (c) => {
  try {
    const { id } = c.req.param()
    const parsed = updateNoteSchema.parse(await c.req.json())
    const db = drizzle(c.env.DB, { schema })
    const patch: Record<string, any> = { updatedAt: nowBeijing() }
    if (parsed.title !== undefined) patch.title = parsed.title
    if (parsed.content !== undefined) patch.content = parsed.content
    await db.update(schema.imaNotes).set(patch).where(eq(schema.imaNotes.id, id))
    // 增量嵌入，供语义检索即时命中（AI 异常不阻断更新）
    const note = await db.select().from(schema.imaNotes).where(eq(schema.imaNotes.id, id))
    const title = parsed.title ?? note[0]?.title ?? ''
    const content = parsed.content ?? note[0]?.content ?? ''
    await indexTarget(c, 'note', id, `${title}\n${content || ''}`).catch((e) =>
      console.error('[embed] note update failed:', e?.message),
    )
    return c.json(note[0])
  } catch (err) {
    console.error('Notes update error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

notes.post('/import', async (c) => {
  try {
    const { title, content, sourceFile } = createNoteSchema.parse(await c.req.json())
    const db = drizzle(c.env.DB, { schema })
    const id = crypto.randomUUID()
    await db.insert(schema.imaNotes).values({ id, title, content, sourceFile })
    await indexTarget(c, 'note', id, `${title}\n${content || ''}`).catch((e) =>
      console.error('[embed] note import failed:', e?.message),
    )
    return c.json({ id }, 201)
  } catch (err) {
    console.error('Notes import error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

notes.delete('/:id', async (c) => {
  try {
    const { id } = c.req.param()
    const db = drizzle(c.env.DB, { schema })
    await db.delete(schema.imaNotes).where(eq(schema.imaNotes.id, id))
    // 清理笔记向量嵌入
    await c.env.VECTORIZE.deleteByIds([`note:${id}`]).catch((e) =>
      console.error('[embed] note delete cleanup failed:', e?.message),
    )
    return c.json({ ok: true })
  } catch (err) {
    console.error('Notes delete error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

export default notes
