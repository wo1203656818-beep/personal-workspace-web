import { Hono } from 'hono'
import { z } from 'zod'
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
  gt,
  lt,
  asc,
  inArray,
  sql,
} from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { callAI } from '../utils/ai-client'
import { embedText, indexTarget } from '../utils/vectorize'
import { normalizeSearchText, lexicalScore, buildSnippet } from '../utils/search'
import { kvCacheGet, kvCacheSet, kvCacheDeletePrefix } from '../utils/kv-cache'
import { syncParentCompletion, normalizeDate, getISOWeek } from '../utils/helpers'
import { nowBeijing, todayBeijing, nowCST, todayCST, formatBeijing } from '../time'

const ai = new Hono<{ Bindings: Env }>()

// AI 拆解子任务（支持直接在服务端创建，避免前端 N 次串行请求）
ai.post('/breakdown', async (c) => {
  try {
    const { taskTitle, taskId } = await c.req.json()
    if (!taskTitle) return c.json({ error: '任务标题不能为空' }, 400)

    const text = await callAI(
      c.env,
      [
        {
          role: 'system',
          content:
            '你是任务拆解专家。将任务拆解为3-7个可执行子步骤。每行只写一个步骤，不要编号、不要 JSON、不要额外说明。',
        },
        { role: 'user', content: `任务：${taskTitle}` },
      ],
      { maxTokens: 1024 },
    )

    if (!text || typeof text !== 'string') {
      return c.json({ subtasks: [] })
    }

    // 优先尝试解析 JSON 数组，失败则按行拆分
    const match = text.match(/\[[\s\S]*\]/)
    let parsedTitles: string[] = []
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed)) {
          parsedTitles = parsed
            .filter((item: any) => item && item.title)
            .map((item: any) => String(item.title).trim())
            .filter(Boolean)
        }
      } catch {
        /* ignore */
      }
    }

    if (parsedTitles.length === 0) {
      parsedTitles = text
        .split(/\n/)
        .map((line) => line.replace(/^\s*[-\d.*]+\s*/, '').trim())
        .filter((line) => line.length > 0 && line.length < 200)
        .slice(0, 10)
    }

    // 若传了 taskId，直接在服务端创建子任务（免前端逐个请求）
    if (taskId) {
      const db = drizzle(c.env.DB, { schema })
      const now = nowBeijing()
      const created: { id: string; title: string }[] = []
      for (const title of parsedTitles) {
        const id = crypto.randomUUID()
        await db.insert(schema.subtasks).values({
          id,
          taskId,
          title,
          isCompleted: false,
          sortOrder: created.length + 1,
          createdAt: now,
        })
        // 非阻塞索引嵌入
        c.executionCtx.waitUntil(
          indexTarget(c, 'subtask', id, title).catch((e) =>
            console.error('[embed] ai subtask failed:', e?.message),
          ),
        )
        created.push({ id, title })
      }
      // 批量创建完成后同步一次父任务完成态
      await syncParentCompletion(db, taskId)
      // 令父任务嵌入中包含新子任务信息
      const parentTitles = parsedTitles.join(', ')
      const parentTask = await db
        .select({ id: schema.tasks.id, title: schema.tasks.title, note: schema.tasks.note })
        .from(schema.tasks)
        .where(eq(schema.tasks.id, taskId))
      if (parentTask[0]) {
        c.executionCtx.waitUntil(
          indexTarget(
            c,
            'task',
            taskId,
            `${parentTask[0].title}\n${parentTask[0].note || ''}\n${parentTitles}`,
          ).catch(() => {}),
        )
      }
      return c.json({ subtasks: created, created: true })
    }

    // 未传 taskId 时兼容旧行为（仅返回标题列表）
    return c.json({ subtasks: parsedTitles.map((title) => ({ title })) })
  } catch (e: any) {
    console.error('[ai/breakdown] error:', e?.message || e)
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// AI 数据分析（带 1 小时 KV 缓存，减少重复 AI 调用）
ai.post('/analysis', async (c) => {
  const range = c.req.query('range') || 'all'
  const cacheKey = `ai:analysis:${range}`
  const cacheTTL = 60 * 60 * 1000 // 1 小时
  const db = drizzle(c.env.DB, { schema })

  const cached = await kvCacheGet<{ analysis: string; stats: object }>(c.env, cacheKey)
  if (cached) return c.json({ ...cached, cached: true })

  // 时间范围过滤条件
  let dateFilter: string | undefined = undefined
  if (range !== 'all') {
    const since = new Date()
    since.setDate(since.getDate() - parseInt(range))
    dateFilter = since.toISOString()
  }

  // 在数据库层聚合统计，避免把全部任务/笔记加载到内存
  const taskWhere = dateFilter
    ? and(gte(schema.tasks.createdAt, dateFilter), isNull(schema.tasks.msTodoDeletedAt))
    : isNull(schema.tasks.msTodoDeletedAt)

  const [totalTasksRow, completedTasksRow, importantTasksRow, notesCountRow] = await Promise.all([
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.tasks)
      .where(taskWhere),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.tasks)
      .where(and(taskWhere, eq(schema.tasks.isCompleted, true))),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.tasks)
      .where(and(taskWhere, eq(schema.tasks.isImportant, true))),
    db.select({ count: sql<number>`COUNT(*)` }).from(schema.imaNotes),
  ])

  // 按日完成趋势
  const dailyMap: Record<string, number> = {}
  const days = range === 'all' ? 30 : parseInt(range)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dailyMap[d.toISOString().split('T')[0]] = 0
  }
  // 仅需 completed + updatedAt 在范围内的任务，用索引覆盖列减少 IO
  const completedTasks = await db
    .select({ updatedAt: schema.tasks.updatedAt })
    .from(schema.tasks)
    .where(and(taskWhere, eq(schema.tasks.isCompleted, true)))
  for (const t of completedTasks) {
    if (!t.updatedAt) continue
    const date = new Date(t.updatedAt).toISOString().split('T')[0]
    if (date in dailyMap) dailyMap[date]++
  }
  const dailyCompleted = Object.entries(dailyMap).map(([date, count]) => ({ date, count }))

  const stats = {
    totalTasks: totalTasksRow[0]?.count ?? 0,
    completedTasks: completedTasksRow[0]?.count ?? 0,
    importantTasks: importantTasksRow[0]?.count ?? 0,
    notesCount: notesCountRow[0]?.count ?? 0,
    dailyCompleted,
  }

  try {
    const analysis = await callAI(c.env, [
      {
        role: 'system',
        content:
          '你是数据分析专家。根据以下数据生成简洁的中文分析报告，包含趋势洞察和建议。200字以内。',
      },
      { role: 'user', content: JSON.stringify(stats) },
    ])
    const response = { analysis, stats }

    await kvCacheSet(c.env, cacheKey, response, cacheTTL)

    return c.json({ ...response, cached: false })
  } catch (e: any) {
    console.error('[ai/analysis] error:', e)
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// AI 周报
ai.post('/weekly-report', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })

    // 本周数据：用 COUNT 避免把全部任务/笔记加载到内存
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const since = weekAgo.toISOString()

    const taskWhere = and(gte(schema.tasks.createdAt, since), isNull(schema.tasks.msTodoDeletedAt))
    const [[weekTasksRow], [completedTasksRow], [weekNotesRow]] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.tasks)
        .where(taskWhere),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.tasks)
        .where(and(taskWhere, eq(schema.tasks.isCompleted, true))),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.imaNotes)
        .where(gte(schema.imaNotes.importedAt, since)),
    ])

    const weekTasksCount = weekTasksRow?.count ?? 0
    const completedTasksCount = completedTasksRow?.count ?? 0
    const weekNotesCount = weekNotesRow?.count ?? 0

    const summary = `本周新增任务 ${weekTasksCount} 个，完成 ${completedTasksCount} 个，新增笔记 ${weekNotesCount} 篇。`

    const report = await callAI(c.env, [
      {
        role: 'system',
        content: `你是一个个人助手，根据用户本周的工作数据生成一份周报。请用中文输出，包含：本周成就、待改进、下周建议三个部分，每部分 2-3 句话。`,
      },
      {
        role: 'user',
        content: summary,
      },
    ])

    // 存入 settings 表（key: weekly_report_YYYYWww，ISO 周）
    const { year, week } = getISOWeek(new Date())
    const reportKey = `weekly_report_${year}W${week.toString().padStart(2, '0')}`
    await db
      .insert(schema.settings)
      .values({ key: reportKey, value: report })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: report, updatedAt: nowBeijing() },
      })

    // 保留最近 52 周周报，删除更旧的数据避免 settings 无限增长
    const allReports = await db
      .select({ key: schema.settings.key })
      .from(schema.settings)
      .where(like(schema.settings.key, 'weekly_report_%'))
      .orderBy(desc(schema.settings.key))
    const oldReports = allReports.slice(52)
    if (oldReports.length > 0) {
      await db.delete(schema.settings).where(
        inArray(
          schema.settings.key,
          oldReports.map((r) => r.key),
        ),
      )
    }

    return c.json({ report, week: `${year}-W${week}` })
  } catch (e: any) {
    const detail = e?.message || e?.toString() || JSON.stringify(e)
    console.error('[weekly-report] error:', detail, e?.stack || '')
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// 获取历史周报列表
ai.get('/weekly-reports', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const reports = await db
      .select()
      .from(schema.settings)
      .where(like(schema.settings.key, 'weekly_report_%'))
      .orderBy(desc(schema.settings.key))
    return c.json(
      reports.map((s) => ({ week: s.key.replace('weekly_report_', ''), report: s.value })),
    )
  } catch (e: any) {
    console.error('[weekly-reports] error:', e)
    return c.json({ error: e.message || String(e) }, 500)
  }
})

// 每日简报：聚合「我的一天」+ 今日/已过期任务 + 近期笔记，生成晨间摘要
ai.post('/digest', async (c) => {
  const today = todayCST()
  const cacheKey = `ai:digest:${today}`
  const cacheTTL = 24 * 60 * 60 * 1000 // 24 小时
  const db = drizzle(c.env.DB, { schema })

  const cached = await kvCacheGet<string>(c.env, cacheKey)
  if (cached) return c.json({ digest: cached, cached: true })

  try {
    // 我的一天任务（未完成）
    const myDayTasks = await db
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.isMyDay, true),
          eq(schema.tasks.isCompleted, false),
          isNull(schema.tasks.msTodoDeletedAt),
        ),
      )

    // 今日到期或已过期未完成任务
    const dueTasks = await db
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.isCompleted, false),
          isNull(schema.tasks.msTodoDeletedAt),
          or(
            eq(schema.tasks.dueDate, today),
            and(isNotNull(schema.tasks.dueDate), lt(schema.tasks.dueDate, today)),
          ),
        ),
      )

    // 最近 3 天新增笔记（用北京时间日期计算）
    const now = new Date()
    const threeDaysAgoDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const threeDaysAgo = formatBeijing(threeDaysAgoDate)
    const recentNotes = await db
      .select()
      .from(schema.imaNotes)
      .where(gte(schema.imaNotes.importedAt, threeDaysAgo))
      .orderBy(desc(schema.imaNotes.importedAt))
      .limit(10)

    const myDayTitles = myDayTasks.map((t) => t.title).slice(0, 10)
    const dueTitles = dueTasks
      .map((t) => `${t.title}${t.dueDate && t.dueDate < today ? '（已过期）' : ''}`)
      .slice(0, 10)
    const noteTitles = recentNotes.map((n) => n.title).slice(0, 10)

    const prompt = `你是个人助理。根据以下信息生成一段 150 字以内的今日简报，包含今日重点和一句建议，中文输出：
- 我的一天任务（未完成）：${myDayTitles.join('、') || '无'}
- 今日到期或已过期任务：${dueTitles.join('、') || '无'}
- 最近 3 天笔记：${noteTitles.join('、') || '无'}`

    const digest = await callAI(
      c.env,
      [
        { role: 'system', content: '你是个人助理，用简洁、温暖的语气生成今日简报。' },
        { role: 'user', content: prompt },
      ],
      { maxTokens: 300 },
    )

    const trimmed = digest.trim()
    await kvCacheSet(c.env, cacheKey, trimmed, cacheTTL)

    return c.json({ digest: trimmed, cached: false })
  } catch (e: any) {
    console.error('[digest] error:', e)
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// AI 笔记辅助：总结 / 要点 / 转任务
ai.post('/note-summary', async (c) => {
  const { noteId, action } = await c.req.json<{
    noteId: string
    action: 'summary' | 'points' | 'to-task'
  }>()
  if (!noteId) return c.json({ error: 'noteId 必填' }, 400)
  const db = drizzle(c.env.DB, { schema })
  const note = await db.select().from(schema.imaNotes).where(eq(schema.imaNotes.id, noteId)).get()
  if (!note) return c.json({ error: '笔记不存在' }, 404)

  const prompts: Record<string, string> = {
    summary: '你是一个笔记助手。用 3 句话以内总结以下笔记的核心要点，中文输出。',
    points: '从以下笔记中提取 5 条关键要点，每条一行，不要编号、不要解释。',
    'to-task': '从以下笔记中提取可执行的待办事项，每条一行，不要编号、不要解释。',
  }
  const content = (note.content || '').slice(0, 8000)
  if (!content.trim()) return c.json({ result: '' })

  try {
    const result = await callAI(
      c.env,
      [
        { role: 'system', content: prompts[action] || prompts.summary },
        { role: 'user', content },
      ],
      { maxTokens: action === 'summary' ? 400 : 300 },
    )
    return c.json({ result })
  } catch (e: any) {
    console.error('[ai/note-summary] error:', e)
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// 跨模块语义检索（RAG）：向量存 Cloudflare Vectorize，语义检索 + 词法加权
ai.post('/semantic-search', async (c) => {
  const { query, topK = 5 } = await c.req.json<{ query: string; topK?: number }>()
  if (!query || !query.trim()) return c.json({ results: [] })

  // KV 缓存（5 分钟 TTL），相同查询直接返回；key 基于查询内容稳定哈希，避免永远失效
  const queryNorm = query.trim().toLowerCase()
  const cacheKeyBase = `${queryNorm}:${topK}`
  const cacheKeyHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cacheKeyBase))
  const cacheKey = `ai:search:${Array.from(new Uint8Array(cacheKeyHash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)}`
  const cacheTTLSeconds = 300 // 5 min
  const cacheTTLMs = cacheTTLSeconds * 1000
  const db = drizzle(c.env.DB, { schema })

  const cached = await kvCacheGet<{ results: unknown[] }>(c.env, cacheKey)
  if (cached) return c.json(cached)

  // 1. 嵌入查询向量
  let qVec: number[]
  try {
    qVec = await embedText(c, query)
  } catch (e: any) {
    return c.json({ error: '嵌入模型不可用: ' + e.message }, 500)
  }

  // 2. Vectorize 向量检索（替代全表扫 + JSON.parse），取 topK*3 候选用于二次排序
  const fetchK = Math.min(topK * 3, 50)
  let matches: VectorizeMatch[]
  try {
    const queryResult = await c.env.VECTORIZE.query(qVec, { topK: fetchK, returnMetadata: 'all' })
    matches = queryResult.matches || []
  } catch (e: any) {
    return c.json({ error: '向量检索失败: ' + e.message }, 500)
  }

  if (matches.length === 0) {
    const emptyResponse = { results: [] }
    await kvCacheSet(c.env, cacheKey, emptyResponse, cacheTTLMs)
    return c.json(emptyResponse)
  }

  // 3. 按 type 分组，批量从 D1 查具体记录（避免 N+1）
  const idsByType: Record<string, string[]> = { note: [], task: [], subtask: [], kb: [] }
  for (const m of matches) {
    const meta = m.metadata as { type: string; targetId: string } | null
    if (meta?.type && meta.targetId && idsByType[meta.type]) {
      idsByType[meta.type].push(meta.targetId)
    }
  }

  const [notes, tasks, subtasks, kbDocs] = await Promise.all([
    idsByType.note.length
      ? db
          .select({
            id: schema.imaNotes.id,
            title: schema.imaNotes.title,
            content: schema.imaNotes.content,
          })
          .from(schema.imaNotes)
          .where(inArray(schema.imaNotes.id, idsByType.note))
      : [],
    idsByType.task.length
      ? db
          .select({
            id: schema.tasks.id,
            title: schema.tasks.title,
            note: schema.tasks.note,
            isCompleted: schema.tasks.isCompleted,
            isImportant: schema.tasks.isImportant,
            dueDate: schema.tasks.dueDate,
          })
          .from(schema.tasks)
          .where(
            and(inArray(schema.tasks.id, idsByType.task), isNull(schema.tasks.msTodoDeletedAt)),
          )
      : [],
    idsByType.subtask.length
      ? db
          .select({
            id: schema.subtasks.id,
            title: schema.subtasks.title,
            taskId: schema.subtasks.taskId,
          })
          .from(schema.subtasks)
          .where(inArray(schema.subtasks.id, idsByType.subtask))
      : [],
    idsByType.kb.length
      ? db
          .select({
            id: schema.kbDocuments.id,
            title: schema.kbDocuments.title,
            content: schema.kbDocuments.content,
          })
          .from(schema.kbDocuments)
          .where(inArray(schema.kbDocuments.id, idsByType.kb))
      : [],
  ])

  // 4. 构建 D1 记录查找表 + 文本
  const recordMap = new Map<string, { title: string; text: string }>()
  for (const n of notes)
    recordMap.set(`note:${n.id}`, {
      title: n.title,
      text: `${n.title}\n${n.content || ''}`.slice(0, 4000),
    })
  for (const t of tasks) {
    const meta = `${t.isCompleted ? '已完成' : '未完成'}\n${t.isImportant ? '重要' : ''}\n${t.dueDate ? '截止: ' + t.dueDate : ''}`
    recordMap.set(`task:${t.id}`, {
      title: t.title,
      text: `${t.title}\n${t.note || ''}\n${meta}`.slice(0, 4000),
    })
  }
  for (const st of subtasks) recordMap.set(`subtask:${st.id}`, { title: st.title, text: st.title })
  for (const k of kbDocs)
    recordMap.set(`kb:${k.id}`, { title: k.title, text: `${k.title}\n${k.content}`.slice(0, 4000) })

  // 5. 综合评分（语义 + 词法 + 标题加权），Vectorize score 已是余弦相似度
  const scored: { type: string; id: string; title: string; snippet: string; score: number }[] = []
  for (const m of matches) {
    const meta = m.metadata as { type: string; targetId: string } | null
    if (!meta?.type || !meta.targetId) continue
    const key = `${meta.type}:${meta.targetId}`
    const record = recordMap.get(key)
    if (!record) continue // D1 中已删除的记录，跳过
    const semantic = m.score
    const lexical = lexicalScore(query, record.title, record.text)
    const titleBoost = normalizeSearchText(record.title).includes(normalizeSearchText(query))
      ? 0.08
      : 0
    const finalScore = Math.min(1, semantic * 0.72 + lexical + titleBoost)
    scored.push({
      type: meta.type,
      id: meta.targetId,
      title: record.title,
      snippet: buildSnippet(query, record.text),
      score: finalScore,
    })
  }

  scored.sort((a, b) => b.score - a.score)
  const results = scored.filter((r) => r.score > 0.18).slice(0, Math.min(topK, 20))
  const response = { results }

  // 写入缓存
  await kvCacheSet(c.env, cacheKey, response, cacheTTLMs)

  return c.json(response)
})

// 一次性重建全部向量索引到 Vectorize（批量 upsert，覆盖旧向量）。
// 不先清空：已删除的 D1 记录对应的孤儿向量会在 semantic-search 时被 recordMap 过滤。
ai.post('/reindex', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const notes = await db
      .select({
        id: schema.imaNotes.id,
        title: schema.imaNotes.title,
        content: schema.imaNotes.content,
      })
      .from(schema.imaNotes)
    const tasks = await db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        note: schema.tasks.note,
        isCompleted: schema.tasks.isCompleted,
        isImportant: schema.tasks.isImportant,
        dueDate: schema.tasks.dueDate,
      })
      .from(schema.tasks)
      .where(isNull(schema.tasks.msTodoDeletedAt))
    const subtasks = await db
      .select({ id: schema.subtasks.id, title: schema.subtasks.title })
      .from(schema.subtasks)
    const kb = await db
      .select({
        id: schema.kbDocuments.id,
        title: schema.kbDocuments.title,
        content: schema.kbDocuments.content,
      })
      .from(schema.kbDocuments)

    // 构建全部待索引文本
    type Pending = { type: 'note' | 'task' | 'kb' | 'subtask'; id: string; text: string }
    const pending: Pending[] = []
    for (const n of notes)
      pending.push({
        type: 'note',
        id: n.id,
        text: `${n.title}\n${n.content || ''}`.slice(0, 4000),
      })
    for (const t of tasks) {
      const meta = `${t.isCompleted ? '已完成' : '未完成'}\n${t.isImportant ? '重要' : ''}\n${t.dueDate ? '截止: ' + t.dueDate : ''}`
      pending.push({
        type: 'task',
        id: t.id,
        text: `${t.title}\n${t.note || ''}\n${meta}`.slice(0, 4000),
      })
    }
    for (const st of subtasks) pending.push({ type: 'subtask', id: st.id, text: st.title })
    for (const k of kb) {
      if (k.content?.trim())
        pending.push({ type: 'kb', id: k.id, text: `${k.title}\n${k.content}`.slice(0, 4000) })
    }

    // 批量嵌入 + upsert（每批 25 条，控制 AI 调用并发）
    let count = 0
    const BATCH = 25
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH)
      const vectors: VectorizeVector[] = []
      // 嵌入是串行的（Workers AI 单次 embed 支持单条），但 upsert 批量
      for (const item of batch) {
        try {
          const vec = await embedText(c, item.text)
          vectors.push({
            id: `${item.type}:${item.id}`,
            values: vec,
            metadata: { type: item.type, targetId: item.id },
          })
          count++
        } catch (e: any) {
          console.error('[reindex] 嵌入失败，跳过', item.type, item.id, e?.message)
        }
      }
      if (vectors.length > 0) {
        try {
          await c.env.VECTORIZE.upsert(vectors)
        } catch (e: any) {
          console.error('[reindex] 批量 upsert 失败，降级逐条', e?.message)
          for (const v of vectors) {
            try {
              await c.env.VECTORIZE.upsert([v])
            } catch {
              /* skip */
            }
          }
        }
      }
    }
    return c.json({ ok: true, indexed: count })
  } catch (e: any) {
    console.error('[reindex] failed:', e)
    return c.json({ ok: false, error: e.message, indexed: 0 }, 200)
  }
})

// 自然语言录入任务：解析一句话为结构化任务（标题/截止时间/列表/备注）
ai.post('/parse-task', async (c) => {
  const { text } = await c.req.json<{ text: string }>()
  if (!text || !text.trim()) return c.json({ error: 'text 必填' }, 400)
  const db = drizzle(c.env.DB, { schema })
  const lists = await db
    .select({ id: schema.taskLists.id, name: schema.taskLists.name })
    .from(schema.taskLists)
  const listNames = lists.map((l) => l.name).join('、') || '（暂无列表）'
  const system = `你是一个任务解析助手。用户用一句话描述要做的事，请提取结构化任务并只输出一个严格 JSON 对象（不要解释、不要 markdown 代码块、不要反引号），字段：
{"title": string, "dueDate": string|null, "listName": string|null, "note": string|null}
- title：简洁任务标题（必填）。
- dueDate：若提到日期，转为 yyyy-MM-dd（如 2026-07-24），按北京时间；相对时间以今天为基准推算；没有具体日期则为 null。不要带时间。
- listName：若提到分类（如"工作""生活"），从候选列表里选最匹配的；否则 null。
- note：补充说明，没有则 null。
候选列表：${listNames}`
  try {
    const raw = await callAI(
      c.env,
      [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
      { maxTokens: 300 },
    )
    let parsed: any = null
    try {
      parsed = JSON.parse(
        raw
          .trim()
          .replace(/^```json\s*|```$/g, '')
          .trim(),
      )
    } catch {
      parsed = null
    }
    if (!parsed || !parsed.title) {
      // 回退：整句作标题
      return c.json({
        task: {
          title: text.trim(),
          dueDate: null,
          listName: null,
          note: null,
          listId: lists[0]?.id ?? null,
        },
      })
    }
    let listId: string | null = null
    if (parsed.listName) {
      const match =
        lists.find((l) => l.name === parsed.listName) ||
        lists.find((l) => parsed.listName.includes(l.name) || l.name.includes(parsed.listName))
      listId = match?.id ?? null
    }
    // 统一日期格式为 yyyy-MM-dd
    const dueDate = normalizeDate(parsed.dueDate)
    return c.json({
      task: {
        title: parsed.title,
        dueDate,
        listName: parsed.listName ?? null,
        note: parsed.note ?? null,
        listId,
      },
    })
  } catch (e: any) {
    console.error('[parse-task] AI 调用失败:', e)
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// AI 优先级建议：基于截止日期、重要标记等，推荐今天最值得做的 1-3 件事
ai.post('/priority-suggestions', async (c) => {
  const today = todayCST()
  const cacheKey = `ai:priority:${today}`
  const cacheTTL = 24 * 60 * 60 * 1000 // 24 小时
  const db = drizzle(c.env.DB, { schema })

  const cached = await kvCacheGet<{ taskId: string; reason: string }[]>(c.env, cacheKey)
  if (cached) return c.json({ suggestions: cached, cached: true })

  try {
    const candidates = await db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        note: schema.tasks.note,
        isImportant: schema.tasks.isImportant,
        isMyDay: schema.tasks.isMyDay,
        dueDate: schema.tasks.dueDate,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.isCompleted, false), isNull(schema.tasks.msTodoDeletedAt)))
      .orderBy(asc(schema.tasks.dueDate))

    if (candidates.length === 0) {
      return c.json({ suggestions: [], cached: false })
    }

    const items = candidates.slice(0, 20).map((t) => ({
      id: t.id,
      title: t.title,
      isImportant: t.isImportant,
      isMyDay: t.isMyDay,
      dueDate: t.dueDate,
      overdue: t.dueDate && t.dueDate < today,
    }))

    const prompt = `你是时间管理助手。请从以下未完成任务中推荐 1-3 件今天最值得优先做的事，并给出简短理由（每行 20 字以内）。只输出严格 JSON 数组，不要解释、不要 markdown 代码块：
[{ "taskId": "任务ID", "reason": "推荐理由" }]
今天是 ${today}。
候选任务：${JSON.stringify(items)}`

    const raw = await callAI(
      c.env,
      [
        {
          role: 'system',
          content: '你是时间管理助手，擅长根据截止日期、重要性和「我的一天」标记判断优先级。',
        },
        { role: 'user', content: prompt },
      ],
      { maxTokens: 400 },
    )

    let suggestions: { taskId: string; reason: string }[] = []
    try {
      const parsed = JSON.parse(
        raw
          .trim()
          .replace(/^```json\s*|```$/g, '')
          .trim(),
      )
      if (Array.isArray(parsed)) {
        suggestions = parsed.filter(
          (p: any) => items.some((i: any) => i.id === p.taskId) && typeof p.reason === 'string',
        )
      }
    } catch {
      suggestions = []
    }

    await kvCacheSet(c.env, cacheKey, suggestions, cacheTTL)

    return c.json({ suggestions, cached: false })
  } catch (e: any) {
    console.error('[priority-suggestions] error:', e)
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// AI 列表推荐：根据任务标题推荐最合适的列表（1 小时 KV 缓存，避免每次输入都调 AI）
ai.post('/suggest-list', async (c) => {
  const { title } = await c.req.json<{ title: string }>()
  if (!title || !title.trim()) return c.json({ listId: null, listName: null }, 400)

  const db = drizzle(c.env.DB, { schema })
  const lists = await db
    .select({ id: schema.taskLists.id, name: schema.taskLists.name })
    .from(schema.taskLists)
  if (lists.length === 0) return c.json({ listId: null, listName: null })

  const listNames = lists.map((l) => l.name).join('、')
  const normalizedTitle = title.trim().toLowerCase()
  const cacheKeyBase = `${normalizedTitle}:${listNames}`
  const cacheKeyHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cacheKeyBase))
  const cacheKey = `ai:suggest-list:${Array.from(new Uint8Array(cacheKeyHash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)}`
  const cacheTTL = 60 * 60 * 1000 // 1 小时

  const cached = await kvCacheGet<{ listId: string | null; listName: string | null }>(
    c.env,
    cacheKey,
  )
  if (cached) return c.json({ ...cached, cached: true })

  const system = `你是一个任务分类助手。用户要创建一个任务，标题是："${title.trim()}"
请从以下候选列表中推荐最合适的列表，只输出一个严格 JSON 对象（不要解释、不要 markdown 代码块、不要反引号）：
{"listName": string|null}
如果标题无法判断或列表都不合适，返回 {"listName": null}。
候选列表：${listNames}`

  try {
    const raw = await callAI(
      c.env,
      [
        { role: 'system', content: system },
        { role: 'user', content: title.trim() },
      ],
      { maxTokens: 100 },
    )

    let parsed: any = null
    try {
      parsed = JSON.parse(
        raw
          .trim()
          .replace(/^```json\s*|```$/g, '')
          .trim(),
      )
    } catch {
      parsed = null
    }

    const listName = parsed?.listName
    const result = { listId: null as string | null, listName: null as string | null }
    if (listName) {
      const match =
        lists.find((l) => l.name === listName) ||
        lists.find((l) => listName.includes(l.name) || l.name.includes(listName))
      result.listId = match?.id ?? null
      result.listName = match?.name ?? null
    }

    await kvCacheSet(c.env, cacheKey, result, cacheTTL)

    return c.json({ ...result, cached: false })
  } catch (e: any) {
    console.error('[suggest-list] AI 调用失败:', e)
    return c.json({ listId: null, listName: null })
  }
})

// ========== AI 文案生成器 ==========
ai.post('/copywriting', async (c) => {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: '请求格式错误' }, 400)
  }
  const { platform, topic, style, referenceUrl, count } = body || {}
  if (!topic || !topic.trim()) return c.json({ error: '请输入主题或关键词' }, 400)
  if (!platform) return c.json({ error: '请选择目标平台' }, 400)

  const PLATFORM_PROMPTS: Record<string, { name: string; guide: string }> = {
    xiaohongshu: {
      name: '小红书',
      guide: `小红书笔记风格：
- 标题要有吸引力，善用"｜"分隔，适当加 emoji（🔥💡✨🎀等）
- 正文 300-500 字，分段清晰，适当换行
- 语气亲切自然，像朋友分享经验
- 结尾加 3-5 个话题标签（#xxx#）
- 善用"姐妹们""宝子们""亲测""避雷"等口语化表达`,
    },
    moments: {
      name: '朋友圈',
      guide: `朋友圈文案风格：
- 简短精炼，50-150 字以内
- 有格调、有品味，不啰嗦
- 可以适当文艺或幽默
- 不需要话题标签
- 适合配图发布，文字点到为止`,
    },
    douyin: {
      name: '抖音',
      guide: `抖音文案风格：
- 开头第一句必须是"钩子"（hook），3秒内抓住注意力
- 口语化、有节奏感，适合念出来
- 200-300 字
- 可以用反转、提问、对比等技巧
- 结尾引导互动："你觉得呢？""双击告诉我"`,
    },
    weibo: {
      name: '微博',
      guide: `微博文案风格：
- 140 字左右，信息密度高
- 有观点、有态度，可以带点犀利
- 适当用 #话题标签#（2-3个）
- 可以引用热点、结合时事
- 语气可以偏新闻感或评论感`,
    },
    bilibili: {
      name: 'B站',
      guide: `B站动态/视频文案风格：
- 有梗、有趣、接地气
- 可以用"家人们""兄弟们""破防了"等B站黑话
- 200-400 字
- 适当玩梗但不尬
- 结尾可以引导"三连""关注"`,
    },
    official_account: {
      name: '公众号',
      guide: `公众号文章风格：
- 标题要有点击欲，可以用数字、疑问、对比
- 正文结构清晰，有小标题分段
- 专业但不枯燥，有案例有观点
- 500-1000 字
- 适合深度内容，有信息增量`,
    },
  }

  const STYLE_MAP: Record<string, string> = {
    seeding: '种草安利（热情推荐，突出优点和使用体验）',
    review: '测评对比（客观分析，优缺点并列，有数据支撑）',
    tutorial: '教程攻略（步骤清晰，实用干货，手把手教学）',
    daily: '日常分享（轻松随意，生活化，真实感）',
    professional: '专业科普（权威感，有理有据，行业洞察）',
  }

  const p = PLATFORM_PROMPTS[platform] || PLATFORM_PROMPTS.xiaohongshu
  const s = STYLE_MAP[style || 'daily'] || STYLE_MAP.daily
  const genCount = Math.min(Math.max(Number(count) || 3, 1), 5)

  // 如果有参考链接，先抓取内容摘要
  let refSection = ''
  if (referenceUrl && referenceUrl.trim()) {
    try {
      const refRes = await fetch(referenceUrl.trim(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CopyBot/1.0)' },
        cf: { cacheTtl: 300 },
        signal: AbortSignal.timeout(8000),
      })
      if (refRes.ok) {
        const html = (await refRes.text()).slice(0, 5000)
        // 粗提取：去标签，取前 1000 字
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 1000)
        if (text.length > 50) refSection = `\n\n参考链接内容摘要：\n${text}`
      }
    } catch {
      /* 抓取失败不阻断 */
    }
  }

  const systemPrompt = `你是顶尖的社交媒体文案写手，精通各平台的内容风格和算法偏好。

当前目标平台：${p.name}
写作风格：${s}

平台写作规范：
${p.guide}

输出要求：生成 ${genCount} 条独立的文案变体，每条从不同切入角度。

输出严格 JSON 数组格式（不要额外文字、不要 markdown 代码块）：
[
  {
    "content": "完整文案正文",
    "hashtags": ["话题标签1", "话题标签2"],
    "hook": "一句话概括这条文案的核心卖点"
  }
]

注意：
- 所有文案必须是中文
- 每条文案切入角度要明显不同（比如一个侧重体验、一个侧重对比、一个侧重故事）
- hashtags 根据平台特性生成，小红书/微博 3-5 个，其他平台 0-2 个
- content 中不要包含 hashtags（hashtags 单独字段）`

  const userPrompt = `请为以下主题撰写${p.name}文案：\n\n主题：${topic.trim()}${refSection}`

  try {
    const raw = await callAI(
      c.env,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 2000 },
    )

    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return c.json({ error: 'AI 返回格式异常，请重试' }, 500)

    const parsed = JSON.parse(jsonMatch[0])
    const results = (Array.isArray(parsed) ? parsed : [parsed])
      .slice(0, genCount)
      .map((item: any) => ({
        content: String(item?.content || ''),
        hashtags: Array.isArray(item?.hashtags) ? item.hashtags.map(String) : [],
        hook: String(item?.hook || ''),
      }))
      .filter((item: any) => item.content)

    if (results.length === 0) return c.json({ error: '生成结果为空，请重试' }, 500)
    return c.json({ results })
  } catch (e: any) {
    console.error('[copywriting] AI 调用失败:', e?.message || e)
    return c.json(
      {
        error: e?.message?.includes('timeout') ? 'AI 调用超时，请重试' : 'AI 调用失败，请稍后重试',
      },
      500,
    )
  }
})

export default ai
