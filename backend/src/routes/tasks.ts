import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import {
  eq,
  and,
  or,
  isNotNull,
  isNull,
  like,
  desc,
  gte,
  sql,
  getTableColumns,
  max,
  count,
  inArray,
} from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import {
  createListSchema,
  updateListSchema,
  createTaskSchema,
  updateTaskSchema,
  createSubtaskSchema,
  updateSubtaskSchema,
} from '../validation'
import { nowBeijing, todayBeijing, nowCST, todayCST } from '../time'
import { indexTarget } from '../utils/vectorize'
import {
  buildSubtaskAgg,
  TASK_COLUMNS,
  TASK_SUMMARY_COLUMNS,
  syncParentCompletion,
} from '../utils/helpers'
import { deleteMsList } from '../ms-sync'

const tasks = new Hono<{ Bindings: Env }>()

// 查询任务列表 + 拼回 subtask 统计（2 次 roundtrip 代替逐行子查询 N 次）
async function queryTasksWithSubtaskStats(
  db: ReturnType<typeof drizzle<any>>,
  whereClause: any,
  orderClause: any[],
): Promise<any[]> {
  const rows: any[] = await db
    .select({ ...TASK_SUMMARY_COLUMNS })
    .from(schema.tasks)
    .where(whereClause)
    .orderBy(...orderClause)
  const ids = rows.map((r) => r.id)
  const agg = buildSubtaskAgg(db)
  const counts = await agg.counts(ids)
  return rows.map((r) => {
    const s = counts.get(r.id) || { subtaskCount: 0, completedSubtaskCount: 0 }
    return { ...r, subtaskCount: s.subtaskCount, completedSubtaskCount: s.completedSubtaskCount }
  })
}

// ========== 任务列表 ==========

// 获取所有列表
tasks.get('/lists', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const withStats = c.req.query('stats') === '1'
  const lists = await db.select().from(schema.taskLists).orderBy(schema.taskLists.sortOrder)
  if (!withStats) return c.json(lists)
  const stats = await db
    .select({
      listId: schema.tasks.listId,
      total: count(schema.tasks.id),
      active: sql<number>`SUM(CASE WHEN ${schema.tasks.isCompleted} = 0 AND ${schema.tasks.msTodoDeletedAt} IS NULL THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN ${schema.tasks.isCompleted} = 1 AND ${schema.tasks.msTodoDeletedAt} IS NULL THEN 1 ELSE 0 END)`,
    })
    .from(schema.tasks)
    .where(isNull(schema.tasks.msTodoDeletedAt))
    .groupBy(schema.tasks.listId)
  const sm = new Map<string, { total: number; active: number; completed: number }>()
  for (const s of stats)
    sm.set(s.listId, {
      total: Number(s.total),
      active: Number(s.active) || 0,
      completed: Number(s.completed) || 0,
    })
  const enriched = lists.map((l) => {
    const s = sm.get(l.id) || { total: 0, active: 0, completed: 0 }
    return { ...l, taskCount: s.total, activeTaskCount: s.active, completedTaskCount: s.completed }
  })
  return c.json(enriched)
})

// 创建列表
tasks.post('/lists', async (c) => {
  const { name, color } = createListSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })
  // 任务列表排在末尾：SQL MAX 代替全表拉回
  const [maxRow] = await db.select({ v: max(schema.taskLists.sortOrder) }).from(schema.taskLists)
  const maxSort = Number(maxRow.v ?? 0)

  const id = crypto.randomUUID()
  await db.insert(schema.taskLists).values({
    id,
    name,
    color: color || '#2563EB',
    sortOrder: maxSort + 1,
    isSystem: false,
  })
  const list = await db.select().from(schema.taskLists).where(eq(schema.taskLists.id, id))
  return c.json(list[0], 201)
})

// 更新列表
tasks.put('/lists/:id', async (c) => {
  const { id } = c.req.param()
  const { name, color } = updateListSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })
  await db
    .update(schema.taskLists)
    .set({ name, color, updatedAt: nowBeijing() })
    .where(eq(schema.taskLists.id, id))
  const list = await db.select().from(schema.taskLists).where(eq(schema.taskLists.id, id))
  return c.json(list[0])
})

// 删除列表（事务：其下任务软删除以便 MS 端同步删除，再删列表本身；若列表关联 MS 则同步删除 MS 端列表）
tasks.delete('/lists/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const now = nowBeijing()
  // 先查列表信息（含 msTodoListId），删除后无法再查
  const list = await db.select().from(schema.taskLists).where(eq(schema.taskLists.id, id))
  const msTodoListId = list[0]?.msTodoListId
  // 先记录列表下所有任务 ID 及其子任务 ID，用于清理嵌入
  const tasksInList = await db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(eq(schema.tasks.listId, id))
  const subtaskIds = tasksInList.length
    ? await db
        .select({ id: schema.subtasks.id })
        .from(schema.subtasks)
        .where(
          inArray(
            schema.subtasks.taskId,
            tasksInList.map((t) => t.id),
          ),
        )
    : []
  // 关联 MS 的任务做软删除（下次同步会从 MS 端删除）；无 MS 关联的直接硬删；删列表本身，三者并行安全
  await db.batch([
    db
      .update(schema.tasks)
      .set({ msTodoDeletedAt: now, updatedAt: now })
      .where(and(eq(schema.tasks.listId, id), isNotNull(schema.tasks.msTodoId))),
    db.delete(schema.tasks).where(and(eq(schema.tasks.listId, id), isNull(schema.tasks.msTodoId))),
    db.delete(schema.taskLists).where(eq(schema.taskLists.id, id)),
  ])
  // 批量清理列表下所有任务及子任务的向量嵌入（Vectorize deleteByIds）
  const allTargetIds = [
    ...tasksInList.map((t) => ({ type: 'task' as const, id: t.id })),
    ...subtaskIds.map((st) => ({ type: 'subtask' as const, id: st.id })),
  ]
  if (allTargetIds.length > 0) {
    const batchSize = 50
    for (let i = 0; i < allTargetIds.length; i += batchSize) {
      const chunk = allTargetIds.slice(i, i + batchSize)
      const vectorIds = chunk.map((x) => `${x.type}:${x.id}`)
      await c.env.VECTORIZE.deleteByIds(vectorIds).catch((e) =>
        console.error('[embed] list delete batch cleanup failed:', e?.message),
      )
    }
  }
  // 若列表关联 MS，异步删除 MS 端列表（失败不影响本地删除结果）
  if (msTodoListId) {
    c.executionCtx.waitUntil(deleteMsList(c.env, msTodoListId))
  }
  return c.json({ ok: true })
})

// ========== 任务 ==========

// 获取列表下的任务
tasks.get('/lists/:id/tasks', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const result = await queryTasksWithSubtaskStats(
    db,
    and(eq(schema.tasks.listId, id), isNull(schema.tasks.msTodoDeletedAt)),
    [schema.tasks.sortOrder],
  )
  return c.json(result)
})

// 我的一天（按当日 myDayDate 过滤，使用北京时间）
tasks.get('/myday', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const today = todayCST()
  const result = await queryTasksWithSubtaskStats(
    db,
    and(
      eq(schema.tasks.isMyDay, true),
      eq(schema.tasks.myDayDate, today),
      isNull(schema.tasks.msTodoDeletedAt),
    ),
    [schema.tasks.sortOrder, desc(schema.tasks.createdAt)],
  )
  return c.json(result)
})

// 重要（须放在 /:id 之前避免被捕获）
tasks.get('/important', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const result = await queryTasksWithSubtaskStats(
    db,
    and(
      eq(schema.tasks.isImportant, true),
      eq(schema.tasks.isCompleted, false),
      isNull(schema.tasks.msTodoDeletedAt),
    ),
    [schema.tasks.sortOrder, desc(schema.tasks.createdAt)],
  )
  return c.json(result)
})

// 已计划（须放在 /:id 之前避免被捕获）
tasks.get('/planned', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const result = await queryTasksWithSubtaskStats(
    db,
    and(
      isNotNull(schema.tasks.dueDate),
      eq(schema.tasks.isCompleted, false),
      isNull(schema.tasks.msTodoDeletedAt),
    ),
    [schema.tasks.dueDate, schema.tasks.sortOrder],
  )
  return c.json(result)
})

// 搜索（须放在 /:id 之前避免被捕获）
tasks.get('/search', async (c) => {
  const q = c.req.query('q') || ''
  if (!q) return c.json([])
  const db = drizzle(c.env.DB, { schema })
  const result = await queryTasksWithSubtaskStats(
    db,
    and(
      or(like(schema.tasks.title, `%${q}%`), like(schema.tasks.note, `%${q}%`)),
      isNull(schema.tasks.msTodoDeletedAt),
    ),
    [desc(schema.tasks.createdAt)],
  )
  return c.json(result)
})

// 全部任务（用于任务总览页）
tasks.get('/', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const result = await queryTasksWithSubtaskStats(db, isNull(schema.tasks.msTodoDeletedAt), [
    desc(schema.tasks.createdAt),
  ])
  return c.json(result)
})

// 任务统计（聚合查询，须放在 /:id 之前避免被捕获）
tasks.get('/stats', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const today = todayCST()
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`sum(case when ${schema.tasks.isCompleted} = 1 then 1 else 0 end)::int`,
      important: sql<number>`sum(case when ${schema.tasks.isImportant} = 1 and ${schema.tasks.isCompleted} = 0 then 1 else 0 end)::int`,
      myDay: sql<number>`sum(case when ${schema.tasks.isMyDay} = 1 then 1 else 0 end)::int`,
      todayCompleted: sql<number>`sum(case when ${schema.tasks.isCompleted} = 1 and date(${schema.tasks.updatedAt}) = ${today} then 1 else 0 end)::int`,
      overdue: sql<number>`sum(case when ${schema.tasks.isCompleted} = 0 and ${schema.tasks.dueDate} < ${today} then 1 else 0 end)::int`,
    })
    .from(schema.tasks)
    .where(isNull(schema.tasks.msTodoDeletedAt))
  return c.json(
    stats || { total: 0, completed: 0, important: 0, myDay: 0, todayCompleted: 0, overdue: 0 },
  )
})

// WIP 状态（进行中的任务数量，须放在 /:id 之前）
tasks.get('/wip', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const [committed] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.isCompleted, false),
        isNull(schema.tasks.msTodoDeletedAt),
        eq(schema.tasks.status, 'committed'),
      ),
    )
  const [inProgress] = await db
    .select({ count: sql<number>`CAST(count(*) AS INTEGER)` })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.isCompleted, false),
        isNull(schema.tasks.msTodoDeletedAt),
        eq(schema.tasks.status, 'in_progress'),
      ),
    )
  const limit = 5
  const total = (committed?.count || 0) + (inProgress?.count || 0)
  return c.json({
    committed: committed?.count || 0,
    inProgress: inProgress?.count || 0,
    total,
    limit,
    available: Math.max(0, limit - total),
  })
})

// 逾期任务（3天未行动的planned任务，须放在 /:id 之前）
tasks.get('/stale', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString()
  const stale = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.isCompleted, false),
        isNull(schema.tasks.msTodoDeletedAt),
        or(eq(schema.tasks.status, 'planned'), isNull(schema.tasks.status)),
        sql`${schema.tasks.createdAt} < ${threeDaysAgo}`,
      ),
    )
    .orderBy(schema.tasks.createdAt)
  return c.json(stale)
})

// 获取单个任务（过滤已软删除的 MS Todo 任务）
tasks.get('/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const task = await db
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, id), isNull(schema.tasks.msTodoDeletedAt)))
  if (task.length === 0) return c.json({ error: '任务不存在' }, 404)
  return c.json(task[0])
})

// 创建任务
tasks.post('/', async (c) => {
  const body = createTaskSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })

  // WIP 限制检查：committed + in_progress 不能超过上限
  const WIP_LIMIT = 5
  const [wipCount] = await db
    .select({ count: sql<number>`CAST(count(*) AS INTEGER)` })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.isCompleted, false),
        isNull(schema.tasks.msTodoDeletedAt),
        or(eq(schema.tasks.status, 'committed'), eq(schema.tasks.status, 'in_progress')),
      ),
    )
  if ((wipCount?.count || 0) >= WIP_LIMIT) {
    return c.json(
      {
        error: '已达到进行中任务上限',
        wipLimit: WIP_LIMIT,
        activeCount: wipCount?.count || 0,
        message: '请先完成或放弃一个任务再添加新的',
      },
      409,
    )
  }

  // 校验 listId 存在 + SQL MAX(sortOrder) 代替全表拉回
  const [list, maxRow] = await Promise.all([
    db
      .select({ id: schema.taskLists.id })
      .from(schema.taskLists)
      .where(eq(schema.taskLists.id, body.listId)),
    db
      .select({ v: max(schema.tasks.sortOrder) })
      .from(schema.tasks)
      .where(eq(schema.tasks.listId, body.listId)),
  ])
  if (list.length === 0) {
    return c.json({ error: '指定的任务列表不存在' }, 400)
  }

  // 新任务排在列表末尾：sortOrder 取当前列表最大值 + 1
  const maxSort = Number(maxRow[0]?.v ?? 0)

  const id = crypto.randomUUID()
  await db.insert(schema.tasks).values({
    id,
    listId: body.listId,
    title: body.title,
    note: body.note,
    isCompleted: false,
    isImportant: body.isImportant,
    isMyDay: body.isMyDay,
    // 若前端未传 myDayDate 但 isMyDay=true，使用北京日期
    myDayDate: body.isMyDay ? (body.myDayDate ?? todayCST()) : (body.myDayDate ?? null),
    dueDate: body.dueDate ?? null,
    sortOrder: maxSort + 1,
    status: body.status ?? 'planned',
    why: body.why ?? null,
    firstStep: body.firstStep ?? null,
    commitmentDeadline: body.commitmentDeadline ?? null,
    energyLevel: body.energyLevel ?? null,
    ifThenPlan: body.ifThenPlan ?? null,
  })
  // 增量嵌入，供语义检索即时命中（AI 异常不阻断创建）。用 waitUntil 后台执行，不阻塞响应。
  const taskText = `${body.title}\n${body.note || ''}\n${body.isImportant ? '重要' : ''}\n${body.dueDate ? '截止: ' + body.dueDate : ''}\n${body.isMyDay ? '我的一天' : ''}`
  c.executionCtx.waitUntil(
    indexTarget(c, 'task', id, taskText).catch((e) =>
      console.error('[embed] task create failed:', e?.message),
    ),
  )
  const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id))
  return c.json(task[0], 201)
})

// 更新任务
tasks.put('/:id', async (c) => {
  const { id } = c.req.param()
  const body = updateTaskSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })
  const updateData: Record<string, unknown> = { updatedAt: nowBeijing() }
  for (const key of [
    'title',
    'note',
    'isCompleted',
    'isImportant',
    'isMyDay',
    'myDayDate',
    'dueDate',
    'reminder',
    'recurrence',
    'sortOrder',
    'listId',
    'status',
    'why',
    'firstStep',
    'commitmentDeadline',
    'energyLevel',
    'ifThenPlan',
  ] as const) {
    if (key in body) updateData[key] = body[key]
  }
  await db.update(schema.tasks).set(updateData).where(eq(schema.tasks.id, id))
  // 主任务勾选完成 → 其下所有子任务同步完成（"父完成即子完成"）。取消完成时应保留子任务已有进度，不应强拆。
  if (body.isCompleted === true) {
    await db
      .update(schema.subtasks)
      .set({ isCompleted: true })
      .where(eq(schema.subtasks.taskId, id))
  }
  const task = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id))
  // 增量嵌入，供语义检索即时命中（AI 异常不阻断更新）。用 waitUntil 后台执行，不阻塞响应。
  if (task[0]) {
    const taskText = `${task[0].title}\n${task[0].note || ''}\n${task[0].isCompleted ? '已完成' : '未完成'}\n${task[0].isImportant ? '重要' : ''}\n${task[0].dueDate ? '截止: ' + task[0].dueDate : ''}\n${task[0].isMyDay ? '我的一天' : ''}`
    c.executionCtx.waitUntil(
      indexTarget(c, 'task', task[0].id, taskText).catch((e) =>
        console.error('[embed] task update failed:', e?.message),
      ),
    )
  }
  return c.json(task[0])
})

// 删除任务（MS Todo 关联任务走软删除，等同步时推送到 MS 端再硬删）
tasks.delete('/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const existing = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id))
  if (existing.length === 0) return c.json({ ok: true })
  const task = existing[0]
  // 删除前先记录子任务 ID，用于清理嵌入向量
  const subtaskIds = await db
    .select({ id: schema.subtasks.id })
    .from(schema.subtasks)
    .where(eq(schema.subtasks.taskId, id))
  if (task.msTodoId) {
    // 关联 MS Todo：软删除标记，等下次同步时 DELETE MS 端再硬删本地
    // 同步清理子任务，避免软删除任务产生隐藏孤儿子任务
    await db.batch([
      db
        .update(schema.tasks)
        .set({ msTodoDeletedAt: nowBeijing(), updatedAt: nowBeijing() })
        .where(eq(schema.tasks.id, id)),
      db.delete(schema.subtasks).where(eq(schema.subtasks.taskId, id)),
    ])
  } else {
    // 未关联 MS Todo：直接硬删（子任务走 onDelete cascade）
    await db.delete(schema.tasks).where(eq(schema.tasks.id, id))
  }
  // 批量清理任务及子任务的向量嵌入（Vectorize deleteByIds）
  const allTargetIds = [
    { type: 'task' as const, id },
    ...subtaskIds.map((st) => ({ type: 'subtask' as const, id: st.id })),
  ]
  const batchSize = 50
  for (let i = 0; i < allTargetIds.length; i += batchSize) {
    const chunk = allTargetIds.slice(i, i + batchSize)
    const vectorIds = chunk.map((x) => `${x.type}:${x.id}`)
    await c.env.VECTORIZE.deleteByIds(vectorIds).catch((e) =>
      console.error('[embed] task delete batch cleanup failed:', e?.message),
    )
  }
  return c.json({ ok: true })
})

// 添加到我的那一天（使用北京时间）
tasks.post('/:id/myday', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  await db
    .update(schema.tasks)
    .set({
      isMyDay: true,
      myDayDate: todayCST(),
      updatedAt: nowBeijing(),
    })
    .where(eq(schema.tasks.id, id))
  return c.json({ ok: true })
})

// 移出我的那一天
tasks.delete('/:id/myday', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  await db
    .update(schema.tasks)
    .set({
      isMyDay: false,
      myDayDate: null,
      updatedAt: nowBeijing(),
    })
    .where(eq(schema.tasks.id, id))
  return c.json({ ok: true })
})

// 任务批量排序（拖拽后，1 次 roundtrip 代替 N 次单任务 PUT）
tasks.put('/reorder', async (c) => {
  try {
    const { orders } = (await c.req.json()) as { orders: { id: string; sortOrder: number }[] }
    if (!orders || !Array.isArray(orders)) return c.json({ error: 'orders required' }, 400)
    const db = drizzle(c.env.DB, { schema })
    const valid = orders.filter((o) => o && typeof o.sortOrder === 'number')
    if (valid.length === 0) return c.json({ ok: true })
    const now = nowBeijing()
    // 逐条更新；D1/D1-like drizzle batch 类型严格，顺序执行更稳且数量有限
    for (const o of valid) {
      await db
        .update(schema.tasks)
        .set({ sortOrder: o.sortOrder, updatedAt: now })
        .where(eq(schema.tasks.id, o.id))
    }
    return c.json({ ok: true })
  } catch (e: any) {
    return c.json({ error: '排序失败', detail: e.message }, 500)
  }
})

// ========== 行动承诺系统 ==========

// 承诺执行任务（planned → committed）
tasks.post('/:id/commit', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  await db
    .update(schema.tasks)
    .set({ status: 'committed', updatedAt: nowBeijing() })
    .where(eq(schema.tasks.id, id))
  return c.json({ ok: true })
})

// 开始执行任务（committed → in_progress）
tasks.post('/:id/start', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  await db
    .update(schema.tasks)
    .set({ status: 'in_progress', startedAt: nowBeijing(), updatedAt: nowBeijing() })
    .where(eq(schema.tasks.id, id))
  return c.json({ ok: true })
})

// 放弃任务
tasks.post('/:id/abandon', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  await db
    .update(schema.tasks)
    .set({
      status: 'done',
      abandonedAt: nowBeijing(),
      isCompleted: true,
      updatedAt: nowBeijing(),
    })
    .where(eq(schema.tasks.id, id))
  return c.json({ ok: true })
})

// ========== 心理学干预 ==========

// 能量匹配：根据当前时间推荐适合的任务
tasks.get('/energy-match', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const hour = new Date().getHours() // UTC+8 已在服务器时区

  // 能量时段映射（基于心理学研究）
  let recommendedEnergy: string
  let timeContext: string
  if (hour >= 6 && hour < 10) {
    recommendedEnergy = 'high' // 早晨：意志力最强
    timeContext = '早晨是意志力最强的时候，适合做高难度任务'
  } else if (hour >= 10 && hour < 14) {
    recommendedEnergy = 'medium'
    timeContext = '上午精力充沛，适合中等难度任务'
  } else if (hour >= 14 && hour < 17) {
    recommendedEnergy = 'low' // 午后低谷
    timeContext = '午后是精力低谷期，适合做简单任务'
  } else if (hour >= 17 && hour < 21) {
    recommendedEnergy = 'medium'
    timeContext = '傍晚精力回升，适合中等难度任务'
  } else {
    recommendedEnergy = 'low'
    timeContext = '晚上适合轻松的任务，避免高难度决策'
  }

  // 获取匹配能量等级的任务
  const tasks = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.isCompleted, false),
        isNull(schema.tasks.msTodoDeletedAt),
        eq(schema.tasks.energyLevel, recommendedEnergy),
        or(eq(schema.tasks.status, 'planned'), isNull(schema.tasks.status)),
      ),
    )
    .orderBy(schema.tasks.createdAt)
    .limit(5)

  return c.json({
    timeContext,
    recommendedEnergy,
    tasks,
    tip:
      recommendedEnergy === 'high'
        ? '💡 现在是你精力最好的时候，挑一个最重要的任务开始'
        : recommendedEnergy === 'low'
          ? '💡 现在精力较低，选一个2分钟能完成的小任务保持 momentum'
          : '💡 现在精力中等，适合推进进行中的任务',
  })
})

// 承诺合约：到期检查
tasks.get('/commitment-check', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const now = new Date().toISOString()

  // 找出已过承诺截止时间但未完成的任务
  const overdue = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.isCompleted, false),
        isNull(schema.tasks.msTodoDeletedAt),
        isNotNull(schema.tasks.commitmentDeadline),
        sql`${schema.tasks.commitmentDeadline} < ${now}`,
        or(eq(schema.tasks.status, 'committed'), eq(schema.tasks.status, 'in_progress')),
      ),
    )

  return c.json({
    overdueTasks: overdue,
    message:
      overdue.length > 0
        ? `⚠️ 有 ${overdue.length} 个任务的承诺已过期，你还需要继续吗？`
        : '✅ 所有承诺都在有效期内',
  })
})

// ========== 两分钟规则 ==========

// 标记任务为快速任务（设置2分钟截止时间）
tasks.post('/:id/mark-quick', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const now = new Date()
  const deadline = new Date(now.getTime() + 2 * 60 * 1000).toISOString()
  await db
    .update(schema.tasks)
    .set({
      isQuick: true,
      quickDeadline: deadline,
      updatedAt: nowBeijing(),
    })
    .where(eq(schema.tasks.id, id))
  return c.json({ ok: true, deadline })
})

// 查询快速任务池（未过期的快速任务）
tasks.get('/quick-pool', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const now = new Date().toISOString()
  const quickTasks = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.isQuick, true),
        eq(schema.tasks.isCompleted, false),
        isNull(schema.tasks.msTodoDeletedAt),
        sql`${schema.tasks.quickDeadline} > ${now}`,
      ),
    )
    .orderBy(schema.tasks.quickDeadline)
  return c.json(quickTasks)
})

// 快速任务过期检查（自动标记过期）
tasks.post('/quick-expire', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const now = new Date().toISOString()
  const expired = await db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.isQuick, true),
        eq(schema.tasks.isCompleted, false),
        isNotNull(schema.tasks.quickDeadline),
        sql`${schema.tasks.quickDeadline} <= ${now}`,
      ),
    )
  if (expired.length > 0) {
    const ids = expired.map((e) => e.id)
    await db
      .update(schema.tasks)
      .set({
        isQuick: false,
        quickDeadline: null,
        updatedAt: nowBeijing(),
      })
      .where(inArray(schema.tasks.id, ids))
  }
  return c.json({ expired: expired.length })
})

// 取消快速标记
tasks.post('/:id/unmark-quick', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  await db
    .update(schema.tasks)
    .set({
      isQuick: false,
      quickDeadline: null,
      updatedAt: nowBeijing(),
    })
    .where(eq(schema.tasks.id, id))
  return c.json({ ok: true })
})

export default tasks
