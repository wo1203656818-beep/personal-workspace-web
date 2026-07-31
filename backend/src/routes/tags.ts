import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, inArray } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { nowBeijing } from '../time'

const tags = new Hono<{ Bindings: Env }>()

tags.get('/', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const allTags = await db.select().from(schema.tags).orderBy(schema.tags.name)
  return c.json(allTags)
})

tags.post('/', async (c) => {
  const { name, color } = await c.req.json()
  if (!name) return c.json({ error: '标签名不能为空' }, 400)
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()
  await db.insert(schema.tags).values({ id, name, color: color || '#6366f1', createdAt: nowBeijing() })
  return c.json({ id, name, color, createdAt: nowBeijing() }, 201)
})

tags.put('/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()
  const db = drizzle(c.env.DB, { schema })
  const updates: Record<string, string> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.color !== undefined) updates.color = body.color
  if (Object.keys(updates).length === 0) return c.json({ error: '无更新内容' }, 400)
  await db.update(schema.tags).set(updates).where(eq(schema.tags.id, id))
  return c.json({ ok: true })
})

tags.delete('/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  await db.delete(schema.tagRelations).where(eq(schema.tagRelations.tagId, id))
  await db.delete(schema.tags).where(eq(schema.tags.id, id))
  return c.json({ ok: true })
})

// 标签关联
tags.post('/assign', async (c) => {
  const { tagId, targetType, targetId } = await c.req.json()
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()
  await db.insert(schema.tagRelations).values({ id, tagId, targetType, targetId }).onConflictDoNothing()
  return c.json({ ok: true })
})

tags.delete('/unassign', async (c) => {
  const { tagId, targetType, targetId } = await c.req.json()
  const db = drizzle(c.env.DB, { schema })
  await db.delete(schema.tagRelations).where(
    and(eq(schema.tagRelations.tagId, tagId), eq(schema.tagRelations.targetType, targetType), eq(schema.tagRelations.targetId, targetId))
  )
  return c.json({ ok: true })
})

// 查询某实体的标签
tags.get('/of/:targetType/:targetId', async (c) => {
  const { targetType, targetId } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const relations = await db.select({ tagId: schema.tagRelations.tagId })
    .from(schema.tagRelations)
    .where(and(eq(schema.tagRelations.targetType, targetType), eq(schema.tagRelations.targetId, targetId)))
  if (relations.length === 0) return c.json([])
  const tagIds = relations.map(r => r.tagId)
  const tagsList = await db.select().from(schema.tags).where(inArray(schema.tags.id, tagIds))
  return c.json(tagsList)
})

export default tags
