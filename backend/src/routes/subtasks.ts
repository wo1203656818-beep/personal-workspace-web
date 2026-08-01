import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, gte, sql } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { createSubtaskSchema, updateSubtaskSchema } from '../validation'
import { nowBeijing } from '../time'
import { indexTarget } from '../utils/vectorize'
import { syncParentCompletion } from '../utils/helpers'

const subtasks = new Hono<{ Bindings: Env }>()

subtasks.get('/:taskId', async (c) => {
  const { taskId } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const result = await db
    .select()
    .from(schema.subtasks)
    .where(eq(schema.subtasks.taskId, taskId))
    .orderBy(schema.subtasks.sortOrder)
  return c.json(result)
})

subtasks.post('/:taskId', async (c) => {
  const { taskId } = c.req.param()
  try {
    let body: unknown = null
    try {
      body = await c.req.json()
    } catch (e: any) {
      console.error('[subtasks] parse body failed:', { taskId, error: e })
      return c.json({ error: '请求体解析失败', detail: e.message }, 400)
    }
    const parsed = createSubtaskSchema.safeParse(body)
    if (!parsed.success) {
      console.error('[subtasks] validation failed:', { taskId, body, issues: parsed.error.issues })
      return c.json({ error: '参数校验失败', detail: parsed.error.message }, 422)
    }
    const { title, sortOrder } = parsed.data
    const db = drizzle(c.env.DB, { schema })
    const parent = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId))
    if (parent.length === 0) return c.json({ error: '父任务不存在', taskId }, 404)
    const id = crypto.randomUUID()
    const now = nowBeijing()
    if (sortOrder !== undefined) {
      await db
        .update(schema.subtasks)
        .set({ sortOrder: sql`${schema.subtasks.sortOrder} + 1` })
        .where(and(eq(schema.subtasks.taskId, taskId), gte(schema.subtasks.sortOrder, sortOrder)))
      await db
        .insert(schema.subtasks)
        .values({ id, taskId, title, isCompleted: false, sortOrder, createdAt: now })
    } else {
      const existingSubs = await db
        .select({ sortOrder: schema.subtasks.sortOrder })
        .from(schema.subtasks)
        .where(eq(schema.subtasks.taskId, taskId))
      const maxSort = existingSubs.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), 0)
      await db
        .insert(schema.subtasks)
        .values({ id, taskId, title, isCompleted: false, sortOrder: maxSort + 1, createdAt: now })
    }
    await syncParentCompletion(db, taskId)
    const subtask = await db.select().from(schema.subtasks).where(eq(schema.subtasks.id, id))
    c.executionCtx.waitUntil(
      indexTarget(c, 'subtask', id, title).catch((e) =>
        console.error('[embed] subtask create failed:', e?.message),
      ),
    )
    return c.json(subtask[0], 201)
  } catch (e: any) {
    console.error('[subtasks] unhandled error:', { taskId, error: e, stack: e.stack })
    return c.json({ error: '子任务创建失败', detail: e.message }, 500)
  }
})

subtasks.put('/reorder', async (c) => {
  try {
    const { orders } = (await c.req.json()) as { orders: { id: string; sortOrder: number }[] }
    if (!orders || !Array.isArray(orders)) return c.json({ error: 'orders required' }, 400)
    const db = drizzle(c.env.DB, { schema })
    for (const o of orders) {
      await db
        .update(schema.subtasks)
        .set({ sortOrder: o.sortOrder })
        .where(eq(schema.subtasks.id, o.id))
    }
    return c.json({ ok: true })
  } catch (e: any) {
    return c.json({ error: '排序失败', detail: e.message }, 500)
  }
})

subtasks.put('/:id', async (c) => {
  const { id } = c.req.param()
  const body = updateSubtaskSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })
  const updateData: Record<string, unknown> = {}
  for (const key of ['title', 'isCompleted', 'sortOrder'] as const) {
    if (key in body) updateData[key] = body[key]
  }
  await db.update(schema.subtasks).set(updateData).where(eq(schema.subtasks.id, id))
  const subtask = await db.select().from(schema.subtasks).where(eq(schema.subtasks.id, id))
  if (subtask[0] && 'isCompleted' in updateData) {
    await syncParentCompletion(db, subtask[0].taskId)
  }
  if (subtask[0])
    c.executionCtx.waitUntil(
      indexTarget(c, 'subtask', subtask[0].id, subtask[0].title).catch((e) =>
        console.error('[embed] subtask update failed:', e?.message),
      ),
    )
  return c.json(subtask[0])
})

subtasks.patch('/:id/toggle', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const existing = await db.select().from(schema.subtasks).where(eq(schema.subtasks.id, id))
  if (!existing.length) return c.json({ error: '未找到' }, 404)
  const nextCompleted = !existing[0].isCompleted
  await db
    .update(schema.subtasks)
    .set({ isCompleted: nextCompleted })
    .where(eq(schema.subtasks.id, id))
  await syncParentCompletion(db, existing[0].taskId)
  const subtask = await db.select().from(schema.subtasks).where(eq(schema.subtasks.id, id))
  return c.json(subtask[0])
})

subtasks.delete('/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const existing = await db
    .select({ taskId: schema.subtasks.taskId })
    .from(schema.subtasks)
    .where(eq(schema.subtasks.id, id))
  await db.delete(schema.subtasks).where(eq(schema.subtasks.id, id))
  if (existing.length > 0) {
    await syncParentCompletion(db, existing[0].taskId)
  }
  c.executionCtx.waitUntil(
    c.env.VECTORIZE.deleteByIds([`subtask:${id}`]).catch((e) =>
      console.error('[embed] subtask delete cleanup failed:', e?.message),
    ),
  )
  return c.json({ ok: true })
})

export default subtasks
