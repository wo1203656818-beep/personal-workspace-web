import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, inArray } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { nowBeijing } from '../time'

const tags = new Hono<{ Bindings: Env }>()

tags.get('/', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const allTags = await db.select().from(schema.tags).orderBy(schema.tags.name)
    return c.json(allTags)
  } catch (err) {
    console.error('Tags list error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

tags.post('/', async (c) => {
  try {
    const { name, color } = await c.req.json()
    if (!name) return c.json({ error: '标签名不能为空' }, 400)
    const db = drizzle(c.env.DB, { schema })
    const id = crypto.randomUUID()
    await db
      .insert(schema.tags)
      .values({ id, name, color: color || '#6366f1', createdAt: nowBeijing() })
    return c.json({ id, name, color, createdAt: nowBeijing() }, 201)
  } catch (err) {
    console.error('Tags create error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

tags.put('/:id', async (c) => {
  try {
    const { id } = c.req.param()
    const body = await c.req.json()
    const db = drizzle(c.env.DB, { schema })
    const updates: Record<string, string> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.color !== undefined) updates.color = body.color
    if (Object.keys(updates).length === 0) return c.json({ error: '无更新内容' }, 400)
    await db.update(schema.tags).set(updates).where(eq(schema.tags.id, id))
    return c.json({ ok: true })
  } catch (err) {
    console.error('Tags update error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

tags.delete('/:id', async (c) => {
  try {
    const { id } = c.req.param()
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.tags).where(eq(schema.tags.id, id))
    if (!existing) return c.json({ error: '标签不存在' }, 404)
    await db.delete(schema.tagRelations).where(eq(schema.tagRelations.tagId, id))
    await db.delete(schema.tags).where(eq(schema.tags.id, id))
    return c.json({ ok: true })
  } catch (err) {
    console.error('Tags delete error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// 标签关联
tags.post('/assign', async (c) => {
  try {
    const { tagId, targetType, targetId } = await c.req.json()
    const db = drizzle(c.env.DB, { schema })
    const id = crypto.randomUUID()
    await db
      .insert(schema.tagRelations)
      .values({ id, tagId, targetType, targetId })
      .onConflictDoNothing()
    return c.json({ ok: true })
  } catch (err) {
    console.error('Tags assign error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

tags.delete('/unassign', async (c) => {
  try {
    const { tagId, targetType, targetId } = await c.req.json()
    const db = drizzle(c.env.DB, { schema })
    await db
      .delete(schema.tagRelations)
      .where(
        and(
          eq(schema.tagRelations.tagId, tagId),
          eq(schema.tagRelations.targetType, targetType),
          eq(schema.tagRelations.targetId, targetId),
        ),
      )
    return c.json({ ok: true })
  } catch (err) {
    console.error('Tags unassign error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// 查询某实体的标签
tags.get('/of/:targetType/:targetId', async (c) => {
  try {
    const { targetType, targetId } = c.req.param()
    const db = drizzle(c.env.DB, { schema })
    const relations = await db
      .select({ tagId: schema.tagRelations.tagId })
      .from(schema.tagRelations)
      .where(
        and(
          eq(schema.tagRelations.targetType, targetType),
          eq(schema.tagRelations.targetId, targetId),
        ),
      )
    if (relations.length === 0) return c.json([])
    const tagIds = relations.map((r) => r.tagId)
    const tagsList = await db.select().from(schema.tags).where(inArray(schema.tags.id, tagIds))
    return c.json(tagsList)
  } catch (err) {
    console.error('Tags of error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

export default tags
