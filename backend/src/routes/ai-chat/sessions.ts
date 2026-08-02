import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, isNull, isNotNull, desc, asc, sql } from 'drizzle-orm'
import * as schema from '../../schema'
import type { Env } from '../../types'
import { ensureChatTables } from '../../ai-configs'
import { nowBeijing, todayCST } from '../../time'
import { ROLE_PERSONAS } from './tools'

interface ChatCtx {
  lists: { id: string; name: string }[]
  pendingTasks: any[]
  today: string
  listNames: string
  context: string
  completedToday: number
  overdueCount: number
}

async function buildChatCtx(db: any): Promise<ChatCtx> {
  const today = todayCST()
  const [lists, pendingTasks, completedTodayRow] = await Promise.all([
    db.select({ id: schema.taskLists.id, name: schema.taskLists.name }).from(schema.taskLists),
    db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        dueDate: schema.tasks.dueDate,
        isImportant: schema.tasks.isImportant,
        isMyDay: schema.tasks.isMyDay,
      })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.isCompleted, false), isNull(schema.tasks.msTodoDeletedAt)))
      .orderBy(desc(schema.tasks.updatedAt))
      .limit(20),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.tasks)
      .where(
        and(eq(schema.tasks.isCompleted, true), sql`DATE(${schema.tasks.updatedAt}) = ${today}`),
      ),
  ])
  const completedToday = Number(completedTodayRow[0]?.count ?? 0)
  const overdueCount = pendingTasks.filter((t: any) => t.dueDate && t.dueDate < today).length
  const myDayTitles = pendingTasks
    .filter((t: any) => t.isMyDay)
    .slice(0, 3)
    .map((t: any) => t.title)
  const upcoming = pendingTasks
    .filter((t: any) => t.dueDate && t.dueDate >= today)
    .sort((a: any, b: any) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .slice(0, 3)
    .map((t: any) => `${t.title}(${t.dueDate})`)
  const listNames = lists.map((l: any) => l.name).join('、') || '（暂无列表）'
  const context = `日期:${today} | 列表:${listNames} | 未完成:${pendingTasks.length} | 今日完成:${completedToday} | 逾期:${overdueCount} | 我的一天:${myDayTitles.join('、') || '无'} | 即将到期:${upcoming.join('、') || '无'}`
  return { lists, pendingTasks, today, listNames, context, completedToday, overdueCount }
}

function buildChatSystem(ctx: ChatCtx, extra?: { systemPrompt?: string; role?: string }): string {
  const roleLine = extra?.role && ROLE_PERSONAS[extra.role] ? `\n${ROLE_PERSONAS[extra.role]}` : ''
  const customLine = extra?.systemPrompt?.trim()
    ? `\n用户自定义指令（最高优先级）：\n${extra.systemPrompt.trim()}`
    : ''
  return `你是这个「个人工作台」的专属 AI 助手。你可以看到用户当前的任务、笔记、列表等上下文信息，基于这些信息回答问题、提供建议、协助思考。你不直接操作数据，而是像一个了解用户工作状态的顾问一样，给出有用的建议和回答。

${roleLine}${customLine}

## 当前上下文
${ctx.context}

## 能力
- 基于用户的任务和笔记提供分析、总结、建议
- 回答问题、写作、翻译、代码、推理
- 梳理待办事项的优先级和安排建议
- 中文回复，保持友好、简洁、有帮助的风格`
}

async function resolveChatSession(
  db: any,
  sessionId: string | null,
  firstMessage: string,
): Promise<{ id: string; configId: string | null }> {
  if (sessionId) {
    const existing = await db
      .select({ id: schema.chatSessions.id, configId: schema.chatSessions.configId })
      .from(schema.chatSessions)
      .where(eq(schema.chatSessions.id, sessionId))
      .limit(1)
    if (existing.length) return { id: existing[0].id, configId: existing[0].configId || null }
  }
  const id = crypto.randomUUID()
  const title =
    firstMessage.length > 30 ? firstMessage.slice(0, 30) + '…' : firstMessage || '新对话'
  await db.insert(schema.chatSessions).values({ id, title })
  return { id, configId: null }
}

async function loadChatHistory(
  db: any,
  sessionId: string,
  limit = 16,
): Promise<{ role: string; content: string }[]> {
  const rows = await db
    .select({ role: schema.chatMessages.role, content: schema.chatMessages.content })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.sessionId, sessionId))
    .orderBy(asc(schema.chatMessages.createdAt))
    .limit(limit)
  return rows.map((r: any) => ({ role: r.role, content: r.content }))
}

async function insertChatMessage(
  db: any,
  sessionId: string,
  role: string,
  content: string,
  toolCalls: any[] | null,
): Promise<void> {
  await db.insert(schema.chatMessages).values({
    id: crypto.randomUUID(),
    sessionId,
    role,
    content,
    toolCalls: toolCalls && toolCalls.length ? JSON.stringify(toolCalls) : null,
  })
  await db
    .update(schema.chatSessions)
    .set({ updatedAt: nowBeijing() })
    .where(eq(schema.chatSessions.id, sessionId))
    .catch(() => {})
}

function estimateTokens(text: string): number {
  if (!text) return 0
  const len = text.length
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
  const ratio = cjk / len
  return Math.ceil((len * (1.8 + ratio * 0.8)) / 2.5)
}

function truncateHistory(
  history: { role: string; content: string }[],
  maxTokens: number,
): { role: string; content: string }[] {
  if (!history || history.length <= 4) return history
  let total = 0
  const keepFromRight: number[] = []
  for (let i = history.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(history[i].content) + 4
    if (total + msgTokens > maxTokens && history.length - i > 4) break
    total += msgTokens
    keepFromRight.unshift(i)
  }
  return keepFromRight.map((idx) => history[idx])
}

const sessions = new Hono<{ Bindings: Env }>()

sessions.get('/', async (c) => {
  try {
    await ensureChatTables(c.env.DB)
    const db = drizzle(c.env.DB, { schema })
    const sessionsList = await db
      .select({
        id: schema.chatSessions.id,
        title: schema.chatSessions.title,
        updatedAt: schema.chatSessions.updatedAt,
        pinned: schema.chatSessions.pinned,
        tags: schema.chatSessions.tags,
        configId: schema.chatSessions.configId,
      })
      .from(schema.chatSessions)
      .orderBy(desc(schema.chatSessions.pinned), desc(schema.chatSessions.updatedAt))
      .limit(50)

    if (sessionsList.length === 0) return c.json([])

    const sessionIds = sessionsList.map((s: any) => s.id)
    const placeholders = sessionIds.map(() => '?').join(',')
    const lastMsgResult = await c.env.DB.prepare(
      `SELECT m.sessionId as sid, m.content as content
       FROM chat_messages m
       INNER JOIN (
         SELECT sessionId, MAX(createdAt) as maxCreated
         FROM chat_messages
         WHERE sessionId IN (${placeholders})
         GROUP BY sessionId
       ) latest ON m.sessionId = latest.sessionId AND m.createdAt = latest.maxCreated`,
    )
      .bind(...sessionIds)
      .all()

    const previewMap = new Map<string, string>()
    for (const row of lastMsgResult.results || []) {
      previewMap.set(row.sid as string, row.content as string)
    }

    const withPreview = sessionsList.map((s: any) => {
      let tags: string[] = []
      try {
        tags = s.tags ? JSON.parse(s.tags) : []
      } catch {
        tags = []
      }
      return {
        id: s.id,
        title: s.title,
        updatedAt: s.updatedAt,
        preview: previewMap.get(s.id) || '',
        pinned: s.pinned ? 1 : 0,
        tags,
        configId: s.configId || null,
      }
    })
    return c.json(withPreview)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

sessions.get('/:id', async (c) => {
  try {
    await ensureChatTables(c.env.DB)
    const db = drizzle(c.env.DB, { schema })
    const id = c.req.param('id')
    const msgs = await db
      .select({
        role: schema.chatMessages.role,
        content: schema.chatMessages.content,
        toolCalls: schema.chatMessages.toolCalls,
        createdAt: schema.chatMessages.createdAt,
      })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.sessionId, id))
      .orderBy(asc(schema.chatMessages.createdAt))
    const session = await db
      .select({
        id: schema.chatSessions.id,
        title: schema.chatSessions.title,
        configId: schema.chatSessions.configId,
      })
      .from(schema.chatSessions)
      .where(eq(schema.chatSessions.id, id))
      .limit(1)
    return c.json({ session: session[0] || null, messages: msgs })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

sessions.delete('/:id', async (c) => {
  try {
    await ensureChatTables(c.env.DB)
    const db = drizzle(c.env.DB, { schema })
    const id = c.req.param('id')
    await db.batch([
      db.delete(schema.chatMessages).where(eq(schema.chatMessages.sessionId, id)),
      db.delete(schema.chatSessions).where(eq(schema.chatSessions.id, id)),
    ])
    return c.json({ ok: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

sessions.patch('/:id', async (c) => {
  try {
    await ensureChatTables(c.env.DB)
    const db = drizzle(c.env.DB, { schema })
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => ({}))
    const patch: any = {}
    if (typeof body.title === 'string' && body.title.trim())
      patch.title = body.title.trim().slice(0, 80)
    if (Array.isArray(body.tags)) {
      patch.tags = JSON.stringify(
        body.tags
          .filter((t: any) => typeof t === 'string')
          .map((t: string) => t.trim())
          .filter(Boolean)
          .slice(0, 10),
      )
    }
    if (typeof body.pinned === 'boolean' || typeof body.pinned === 'number')
      patch.pinned = body.pinned ? 1 : 0
    if ('configId' in body) patch.configId = body.configId ? String(body.configId).slice(0, 80) : null
    if (Object.keys(patch).length === 0) return c.json({ error: '无可更新字段' }, 400)
    patch.updatedAt = nowBeijing()
    await db.update(schema.chatSessions).set(patch).where(eq(schema.chatSessions.id, id))
    return c.json({ ok: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export {
  ChatCtx,
  buildChatCtx,
  buildChatSystem,
  resolveChatSession,
  loadChatHistory,
  insertChatMessage,
  estimateTokens,
  truncateHistory,
  sessions,
}
