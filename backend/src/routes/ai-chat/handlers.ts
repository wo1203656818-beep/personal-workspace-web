import type { Context } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, isNull, desc } from 'drizzle-orm'
import * as schema from '../../schema'
import type { Env } from '../../types'
import {
  getActiveConfig, listAiConfigs, createAiConfig, updateAiConfig,
  setDefaultAiConfig, ensureAiConfigsTable, CF_MODELS,
} from '../../ai-configs'
import { nowBeijing, todayCST } from '../../time'
import {
  callAI, indexTarget, syncParentCompletion,
  normalizeDate, normalizeSearchText,
} from '../../utils/helpers'
import { resolveChatTool, webSearch } from './completion'
import type { ChatCtx } from './sessions'

async function resolveTaskId(db: any, args: any): Promise<string | null> {
  if (args.id) return String(args.id)
  const kw = (args.keyword || '').toString().trim()
  if (!kw) return null
  const rows = await db.select({ id: schema.tasks.id, title: schema.tasks.title })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.isCompleted, false), isNull(schema.tasks.msTodoDeletedAt)))
    .limit(100)
  const norm = normalizeSearchText(kw)
  const hit = rows.find((r: any) => normalizeSearchText(r.title).includes(norm) || r.title.includes(kw))
  return hit?.id ?? null
}

async function resolveListId(db: any, args: any): Promise<string | null> {
  if (args.listId) return String(args.listId)
  const kw = (args.keyword || '').toString().trim()
  if (!kw) return null
  const rows = await db.select({ id: schema.taskLists.id, name: schema.taskLists.name }).from(schema.taskLists).limit(100)
  const norm = normalizeSearchText(kw)
  const hit = rows.find((r: any) => normalizeSearchText(r.name).includes(norm) || r.name.includes(kw))
  return hit?.id ?? null
}

async function resolveKbDoc(db: any, args: any): Promise<{ id: string; title: string; content: string | null } | null> {
  if (args.docId) {
    const rows = await db.select({ id: schema.kbDocuments.id, title: schema.kbDocuments.title, content: schema.kbDocuments.content })
      .from(schema.kbDocuments).where(eq(schema.kbDocuments.id, String(args.docId))).limit(1)
    return rows[0] ?? null
  }
  const kw = (args.keyword || '').toString().trim()
  if (!kw) return null
  const rows = await db.select({ id: schema.kbDocuments.id, title: schema.kbDocuments.title, content: schema.kbDocuments.content })
    .from(schema.kbDocuments).limit(100)
  const norm = normalizeSearchText(kw)
  const hit = rows.find((r: any) => normalizeSearchText(r.title).includes(norm) || r.title.includes(kw))
  return hit ?? null
}

const str = (v: any) => (v == null ? '' : String(v)).trim()
const bool = (v: any) => v === true || v === 'true' || v === 1 || v === '1'

async function handleCreateTask(c: Context<{ Bindings: Env }>, db: any, args: any, ctx: ChatCtx) {
  const title = str(args.title)
  if (!title) return { observation: 'create_task 缺少 title，未创建', refresh: false }
  let listId: string | null = null
  const wantName = args.listName ? str(args.listName) : null
  if (wantName) {
    const hit = ctx.lists.find((l) => l.name === wantName)
      || ctx.lists.find((l) => wantName.includes(l.name) || l.name.includes(wantName))
    listId = hit?.id ?? null
  }
  if (!listId && !wantName && ctx.lists.length) listId = ctx.lists[0].id
  let createdList = ''
  if (!listId) {
    const id = crypto.randomUUID()
    await db.insert(schema.taskLists).values({ id, name: wantName || '默认', color: '#2563EB', sortOrder: 0, isSystem: false })
    listId = id
    createdList = `（新建列表「${wantName || '默认'}」）`
  }
  const dueDate = normalizeDate(args.dueDate || null)
  const id = crypto.randomUUID()
  const existing = await db.select({ s: schema.tasks.sortOrder }).from(schema.tasks).where(eq(schema.tasks.listId, listId))
  const sort = existing.reduce((m: number, t: any) => Math.max(m, t.s ?? 0), 0) + 1
  await db.insert(schema.tasks).values({
    id,
    listId,
    title,
    note: args.note ? str(args.note) : '',
    isCompleted: false,
    isImportant: bool(args.isImportant),
    isMyDay: bool(args.isMyDay),
    myDayDate: bool(args.isMyDay) ? ctx.today : null,
    dueDate: dueDate ?? null,
    reminder: args.reminder ? str(args.reminder) : null,
    sortOrder: sort,
  })
  await indexTarget(c, 'task', id, `${title}\n${args.note || ''}`).catch(() => {})
  const parts = [dueDate ? `截止 ${dueDate}` : '', bool(args.isImportant) ? '已标重要' : '', bool(args.isMyDay) ? '已加入我的一天' : ''].filter(Boolean)
  return { observation: `已创建任务「${title}」${createdList}${parts.length ? `（${parts.join('、')}）` : ''}`, refresh: true }
}

async function handleSearchTasks(_c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  const q = str(args.query)
  const includeCompleted = bool(args.includeCompleted)
  const rows = await db.select({
    id: schema.tasks.id,
    title: schema.tasks.title,
    dueDate: schema.tasks.dueDate,
    isImportant: schema.tasks.isImportant,
    isCompleted: schema.tasks.isCompleted,
  }).from(schema.tasks)
    .where(includeCompleted ? isNull(schema.tasks.msTodoDeletedAt) : and(eq(schema.tasks.isCompleted, false), isNull(schema.tasks.msTodoDeletedAt)))
    .orderBy(desc(schema.tasks.updatedAt)).limit(120)
  const norm = normalizeSearchText(q)
  const terms = norm.split(/\s+/).filter((t: string) => t.length >= 1)
  const matched = rows.filter((r: any) => {
    const t = r.title.toLowerCase()
    return terms.some((term: string) => t.includes(term)) || t.includes(norm)
  }).slice(0, 10)
  if (!matched.length) return { observation: `未找到与「${q}」相关的任务`, refresh: false }
  const list = matched.map((m: any, i: number) =>
    `${i + 1}. id=${m.id} 标题=${m.title}${m.dueDate ? ` 截止=${m.dueDate}` : ''}${m.isImportant ? ' [重要]' : ''}${m.isCompleted ? ' [已完成]' : ''}`
  ).join('\n')
  return { observation: `匹配到 ${matched.length} 个任务：\n${list}`, refresh: false }
}

async function handleCompleteTask(c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  const id = await resolveTaskId(db, args)
  if (!id) return { observation: `没找到要操作的任务（${args.keyword || args.id || '无关键词'}）`, refresh: false }
  const cur = await db.select({ title: schema.tasks.title }).from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1)
  const title = cur[0]?.title ?? '任务'
  await db.update(schema.tasks).set({ isCompleted: true, updatedAt: nowBeijing() }).where(eq(schema.tasks.id, id))
  try {
    await db.update(schema.subtasks).set({ isCompleted: true }).where(eq(schema.subtasks.taskId, id))
  } catch { /* subtask update is best-effort */ }
  return { observation: `已标记完成：${title}`, refresh: true }
}

async function handleDeleteTask(c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  const id = await resolveTaskId(db, args)
  if (!id) return { observation: `没找到要操作的任务（${args.keyword || args.id || '无关键词'}）`, refresh: false }
  const cur = await db.select({ title: schema.tasks.title }).from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1)
  const title = cur[0]?.title ?? '任务'
  await indexTarget(c, 'task', id, '').catch(() => {})
  await db.delete(schema.tasks).where(eq(schema.tasks.id, id))
  return { observation: `已删除：${title}`, refresh: true }
}

async function handleUpdateTask(c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  const id = await resolveTaskId(db, args)
  if (!id) return { observation: `没找到要操作的任务（${args.keyword || args.id || '无关键词'}）`, refresh: false }
  const cur = await db.select({ title: schema.tasks.title }).from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1)
  const title = cur[0]?.title ?? '任务'
  const set: any = { updatedAt: nowBeijing() }
  if (args.title != null) set.title = str(args.title)
  if (args.note != null) set.note = str(args.note)
  if (args.dueDate != null) set.dueDate = normalizeDate(args.dueDate) ?? null
  if (args.reminder != null) set.reminder = str(args.reminder)
  if (args.isImportant != null) set.isImportant = bool(args.isImportant)
  if (args.isMyDay != null) set.isMyDay = bool(args.isMyDay)
  await db.update(schema.tasks).set(set).where(eq(schema.tasks.id, id))
  return { observation: `已更新：${title}`, refresh: true }
}

async function handleGetOverview(_c: Context<{ Bindings: Env }>, _db: any, _args: any, ctx: ChatCtx) {
  const listCounts = ctx.lists.map((l) => {
    const n = ctx.pendingTasks.filter((t: any) => t.listId === l.id).length
    return `${l.name}:${n}`
  }).join('、')
  const upcoming = ctx.pendingTasks
    .filter((t: any) => t.dueDate)
    .sort((a: any, b: any) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .slice(0, 5)
    .map((t: any) => `${t.title}(${t.dueDate})`)
    .join('、') || '无'
  const obs = `系统概览：未完成任务 ${ctx.pendingTasks.length} 个；今日已完成 ${ctx.completedToday} 个；逾期 ${ctx.overdueCount} 个；我的一天 ${ctx.pendingTasks.filter((t: any) => t.isMyDay).length} 个；即将到期 ${upcoming}；各列表未完成任务数 ${listCounts || '无'}。`
  return { observation: obs, refresh: false }
}

async function handleAddNote(c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  const title = str(args.title) || '来自助手'
  const content = str(args.content)
  if (!content && !title) return { observation: 'add_note 缺少内容', refresh: false }
  const id = crypto.randomUUID()
  await db.insert(schema.imaNotes).values({ id, title, content })
  await indexTarget(c, 'note', id, `${title}\n${content}`).catch(() => {})
  return { observation: `已保存笔记：${title}`, refresh: false, action: { type: 'navigate', payload: '/notes' } }
}

async function handleSearchNotes(_c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  const q = str(args.query)
  const rows = await db.select({ id: schema.imaNotes.id, title: schema.imaNotes.title, content: schema.imaNotes.content })
    .from(schema.imaNotes).limit(60)
  const norm = normalizeSearchText(q)
  const matched = rows.filter((r: any) => normalizeSearchText(r.title).includes(norm) || normalizeSearchText(r.content).includes(norm)).slice(0, 5)
  if (!matched.length) return { observation: `未找到与「${q}」相关的笔记`, refresh: false }
  const list = matched.map((m: any) => `· ${m.title}：${(m.content || '').slice(0, 80)}`).join('\n')
  return { observation: `匹配到 ${matched.length} 条笔记：\n${list}`, refresh: false }
}

async function handleSetTheme(_c: Context<{ Bindings: Env }>, _db: any, args: any, _ctx: ChatCtx) {
  const v = ['light', 'dark', 'system'].includes(args.value) ? args.value : 'system'
  return { observation: `已切换主题：${v}`, refresh: false, action: { type: 'theme', payload: v } }
}

async function handleNavigate(_c: Context<{ Bindings: Env }>, _db: any, args: any, _ctx: ChatCtx) {
  const path = str(args.path) || '/'
  return { observation: `正在前往 ${path}`, refresh: false, action: { type: 'navigate', payload: path } }
}

async function handleGetAiConfig(c: Context<{ Bindings: Env }>, _db: any, _args: any, _ctx: ChatCtx) {
  const all = await listAiConfigs(c.env)
  const active = all.find((a) => a.isDefault) || all[0]
  const obs = active
    ? `当前生效的 AI 配置：${active.name}（类型=${active.type}${active.baseUrl ? ` 接口=${active.baseUrl}` : ''} 模型=${active.model || '默认'} Key已设置=${active.apiKeySet}）`
    : '当前使用 Cloudflare 默认内置模型（未单独配置）。'
  return { observation: obs, refresh: false }
}

async function handleUpdateAiConfig(c: Context<{ Bindings: Env }>, _db: any, args: any, _ctx: ChatCtx) {
  const name = str(args.name)
  const type = args.type === 'cloudflare' ? 'cloudflare' : 'openai'
  if (!name) return { observation: 'update_ai_config 缺少 name', refresh: false }
  if (type === 'openai' && !args.baseUrl) {
    return { observation: 'OpenAI 类型需要提供 baseUrl（如 https://api.deepseek.com/v1）', refresh: false }
  }
  const dbx = drizzle(c.env.DB, { schema })
  await ensureAiConfigsTable(c.env.DB)
  const existing = await dbx.select().from(schema.aiConfigs).where(eq(schema.aiConfigs.name, name)).limit(1)
  const setDefault = args.setDefault === undefined ? true : bool(args.setDefault)
  const rawKey = args.apiKey ? String(args.apiKey).trim() : ''
  let id: string
  if (existing.length) {
    id = existing[0].id
    const patch: any = { name, type }
    if (type === 'openai') patch.baseUrl = str(args.baseUrl)
    patch.model = str(args.model) || (type === 'cloudflare' ? CF_MODELS.DEFAULT : 'gpt-4o')
    if (rawKey) patch.apiKey = rawKey
    await updateAiConfig(c.env, id, patch)
  } else {
    id = await createAiConfig(c.env, {
      name,
      type,
      baseUrl: type === 'openai' ? str(args.baseUrl) : undefined,
      apiKey: rawKey || undefined,
      model: str(args.model) || (type === 'cloudflare' ? CF_MODELS.DEFAULT : undefined),
      isDefault: setDefault,
    })
  }
  if (setDefault) await setDefaultAiConfig(c.env, id).catch(() => {})
  const okKey = rawKey ? '，API Key 已保存' : ''
  return {
    observation: `已保存 AI 配置「${name}」（类型=${type}${type === 'openai' ? ` 接口=${str(args.baseUrl)}` : ''} 模型=${str(args.model) || '默认'}${okKey}），并已设为默认生效。`,
    refresh: false,
  }
}

async function handleCreateTaskList(_c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  const name = str(args.name)
  if (!name) return { observation: 'create_task_list 缺少 name', refresh: false }
  const existing = await db.select({ sortOrder: schema.taskLists.sortOrder }).from(schema.taskLists)
  const maxSort = existing.reduce((m: number, l: any) => Math.max(m, l.sortOrder ?? 0), 0)
  const id = crypto.randomUUID()
  await db.insert(schema.taskLists).values({ id, name, color: args.color ? str(args.color) : '#2563EB', sortOrder: maxSort + 1, isSystem: false })
  return { observation: `已新建任务列表「${name}」`, refresh: true }
}

async function handleUpdateTaskList(_c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  const listId = await resolveListId(db, args)
  if (!listId) return { observation: `没找到要修改的列表（${args.keyword || args.listId || '无关键词'}）`, refresh: false }
  const patch: any = { updatedAt: nowBeijing() }
  if (args.name != null) patch.name = str(args.name)
  if (args.color != null) patch.color = str(args.color)
  await db.update(schema.taskLists).set(patch).where(eq(schema.taskLists.id, listId))
  const cur = await db.select({ name: schema.taskLists.name }).from(schema.taskLists).where(eq(schema.taskLists.id, listId)).limit(1)
  return { observation: `已更新列表：${cur[0]?.name ?? ''}`, refresh: true }
}

async function handleDeleteTaskList(_c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  const listId = await resolveListId(db, args)
  if (!listId) return { observation: `没找到要删除的列表（${args.keyword || args.listId || '无关键词'}）`, refresh: false }
  const cur = await db.select({ name: schema.taskLists.name }).from(schema.taskLists).where(eq(schema.taskLists.id, listId)).limit(1)
  await db.delete(schema.tasks).where(eq(schema.tasks.listId, listId))
  await db.delete(schema.taskLists).where(eq(schema.taskLists.id, listId))
  return { observation: `已删除列表「${cur[0]?.name ?? ''}」及其下任务`, refresh: true }
}

async function handleCreateSubtask(c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  const taskId = args.taskId ? String(args.taskId) : (args.taskKeyword ? await resolveTaskId(db, { keyword: str(args.taskKeyword) }) : null)
  if (!taskId) return { observation: `没找到要添加子任务的任务（${args.taskKeyword || args.taskId || '无关键词'}）`, refresh: false }
  const title = str(args.title)
  if (!title) return { observation: 'create_subtask 缺少 title', refresh: false }
  const existing = await db.select({ sortOrder: schema.subtasks.sortOrder }).from(schema.subtasks).where(eq(schema.subtasks.taskId, taskId))
  const maxSort = existing.reduce((m: number, s: any) => Math.max(m, s.sortOrder ?? 0), 0)
  const id = crypto.randomUUID()
  await db.insert(schema.subtasks).values({ id, taskId, title, isCompleted: false, sortOrder: maxSort + 1, createdAt: nowBeijing() })
  await indexTarget(c, 'subtask', id, title).catch(() => {})
  return { observation: `已为任务添加子任务「${title}」`, refresh: true }
}

async function handleToggleSubtask(c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  let id: string | null = args.subtaskId ? String(args.subtaskId) : null
  if (!id && (args.taskKeyword || args.title)) {
    const taskId = args.taskKeyword ? await resolveTaskId(db, { keyword: str(args.taskKeyword) }) : null
    if (taskId) {
      const subs = await db.select({ id: schema.subtasks.id, title: schema.subtasks.title }).from(schema.subtasks).where(eq(schema.subtasks.taskId, taskId))
      const kw = str(args.title)
      id = subs.find((s: any) => s.title.includes(kw) || normalizeSearchText(s.title).includes(normalizeSearchText(kw)))?.id ?? null
    }
  }
  if (!id) return { observation: `没找到要操作的子任务（${args.taskKeyword || args.title || args.subtaskId || '无关键词'}）`, refresh: false }
  const existing = await db.select({ isCompleted: schema.subtasks.isCompleted }).from(schema.subtasks).where(eq(schema.subtasks.id, id)).limit(1)
  if (!existing.length) return { observation: '子任务不存在', refresh: false }
  const next = args.complete !== undefined ? bool(args.complete) : !existing[0].isCompleted
  await db.update(schema.subtasks).set({ isCompleted: next }).where(eq(schema.subtasks.id, id))
  const sub = await db.select({ taskId: schema.subtasks.taskId }).from(schema.subtasks).where(eq(schema.subtasks.id, id)).limit(1)
  if (sub[0]) await syncParentCompletion(db, sub[0].taskId).catch(() => {})
  return { observation: next ? '已勾选子任务' : '已取消勾选子任务', refresh: true }
}

async function handleDeleteSubtask(c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  let id: string | null = args.subtaskId ? String(args.subtaskId) : null
  if (!id && (args.taskKeyword || args.title)) {
    const taskId = args.taskKeyword ? await resolveTaskId(db, { keyword: str(args.taskKeyword) }) : null
    if (taskId) {
      const subs = await db.select({ id: schema.subtasks.id, title: schema.subtasks.title }).from(schema.subtasks).where(eq(schema.subtasks.taskId, taskId))
      const kw = str(args.title)
      id = subs.find((s: any) => s.title.includes(kw))?.id ?? null
    }
  }
  if (!id) return { observation: `没找到要删除的子任务`, refresh: false }
  await db.delete(schema.subtasks).where(eq(schema.subtasks.id, id))
  await indexTarget(c, 'subtask', id, '').catch(() => {})
  return { observation: '已删除子任务', refresh: true }
}

async function handleUpdateNote(c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  let id: string | null = args.noteId ? String(args.noteId) : null
  if (!id && args.keyword) {
    const rows = await db.select({ id: schema.imaNotes.id, title: schema.imaNotes.title }).from(schema.imaNotes).limit(100)
    const norm = normalizeSearchText(str(args.keyword))
    id = rows.find((r: any) => normalizeSearchText(r.title).includes(norm) || r.title.includes(str(args.keyword)))?.id ?? null
  }
  if (!id) return { observation: `没找到要修改的笔记（${args.keyword || args.noteId || '无关键词'}）`, refresh: false }
  const patch: any = { updatedAt: nowBeijing() }
  if (args.title != null) patch.title = str(args.title)
  if (args.content != null) patch.content = str(args.content)
  await db.update(schema.imaNotes).set(patch).where(eq(schema.imaNotes.id, id))
  await indexTarget(c, 'note', id, `${str(args.title)}\n${str(args.content)}`).catch(() => {})
  return { observation: `已更新笔记：${str(args.title) || '（内容已改）'}`, refresh: true }
}

async function handleDeleteNote(c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  let id: string | null = args.noteId ? String(args.noteId) : null
  if (!id && args.keyword) {
    const rows = await db.select({ id: schema.imaNotes.id, title: schema.imaNotes.title }).from(schema.imaNotes).limit(100)
    const norm = normalizeSearchText(str(args.keyword))
    id = rows.find((r: any) => normalizeSearchText(r.title).includes(norm) || r.title.includes(str(args.keyword)))?.id ?? null
  }
  if (!id) return { observation: `没找到要删除的笔记（${args.keyword || args.noteId || '无关键词'}）`, refresh: false }
  await db.delete(schema.imaNotes).where(eq(schema.imaNotes.id, id))
  await indexTarget(c, 'note', id, '').catch(() => {})
  return { observation: '已删除笔记', refresh: true }
}

async function handleSearchKnowledge(_c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  const q = str(args.query)
  if (!q) return { observation: 'search_knowledge 缺少 query', refresh: false }
  const rows = await db.select({ id: schema.kbDocuments.id, title: schema.kbDocuments.title, content: schema.kbDocuments.content }).from(schema.kbDocuments).limit(100)
  const norm = normalizeSearchText(q)
  const matched = rows.filter((r: any) => normalizeSearchText(r.title).includes(norm) || normalizeSearchText(r.content || '').includes(norm)).slice(0, 5)
  if (!matched.length) return { observation: `知识库里没找到与「${q}」相关的资料`, refresh: false }
  const list = matched.map((m: any) => `· ${m.title}：${(m.content || '').slice(0, 120).replace(/\n/g, ' ')}`).join('\n')
  return { observation: `知识库匹配到 ${matched.length} 篇：\n${list}`, refresh: false }
}

async function handleSummarizeKnowledge(c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  const doc = await resolveKbDoc(db, args)
  if (!doc) return { observation: `没找到要总结的文档（${args.keyword || args.docId || '无关键词'}）`, refresh: false }
  const content = (doc.content || '').slice(0, 8000)
  if (!content.trim()) return { observation: `《${doc.title}》暂无可用正文，无法总结`, refresh: false }
  try {
    const summary = await callAI(c.env, [
      { role: 'system', content: '你是文档总结助手。用 3 句话以内总结以下文档的核心内容，中文输出，不要分段。' },
      { role: 'user', content: `文档标题：${doc.title}\n\n${content}` },
    ], { maxTokens: 400 })
    return { observation: `《${doc.title}》摘要：${summary.trim()}`, refresh: false }
  } catch (e: any) {
    return { observation: `《${doc.title}》开头：${(doc.content || '').slice(0, 200)}`, refresh: false }
  }
}

async function handleAskKnowledge(c: Context<{ Bindings: Env }>, db: any, args: any, _ctx: ChatCtx) {
  const doc = await resolveKbDoc(db, args)
  if (!doc) return { observation: `没找到要提问的文档（${args.keyword || args.docId || '无关键词'}）`, refresh: false }
  const content = (doc.content || '').slice(0, 6000)
  if (!content.trim()) return { observation: `《${doc.title}》暂无可用正文，无法问答`, refresh: false }
  try {
    const answer = await callAI(c.env, [
      { role: 'system', content: '你是文档问答助手。请严格基于以下文档内容回答问题，如果文档中没有相关信息，请明确说明。' },
      { role: 'user', content: `文档标题：${doc.title}\n\n文档内容：\n${content}\n\n问题：${str(args.question)}` },
    ], { maxTokens: 500 })
    return { observation: `关于《${doc.title}》：${answer.trim()}`, refresh: false }
  } catch (e: any) {
    return { observation: '调用 AI 总结/问答失败，请检查 AI 配置。', refresh: false }
  }
}

async function handleCoinFlip(_c: Context<{ Bindings: Env }>, _db: any, args: any, _ctx: ChatCtx) {
  const buf = new Uint8Array(1)
  crypto.getRandomValues(buf)
  const result = buf[0] % 2 === 0 ? '正面' : '反面'
  const q = args.question ? `（问题：${str(args.question)}）` : ''
  return { observation: `🪙 天意硬币结果：${result}${q}`, refresh: false }
}

async function handleWebSearch(c: Context<{ Bindings: Env }>, _db: any, args: any, _ctx: ChatCtx) {
  const q = str(args.query)
  if (!q) return { observation: 'web_search 缺少 query', refresh: false }
  const res = await webSearch(q, c.env)
  return { observation: res.text, refresh: false, sources: res.sources }
}

const HANDLERS: Record<string, (c: Context<{ Bindings: Env }>, db: any, args: any, ctx: ChatCtx) => Promise<{ observation: string; refresh: boolean; action?: any; sources?: { title: string; url: string; snippet: string }[] }>> = {
  create_task: handleCreateTask,
  search_tasks: handleSearchTasks,
  complete_task: handleCompleteTask,
  delete_task: handleDeleteTask,
  update_task: handleUpdateTask,
  get_overview: handleGetOverview,
  add_note: handleAddNote,
  search_notes: handleSearchNotes,
  set_theme: handleSetTheme,
  navigate: handleNavigate,
  get_ai_config: handleGetAiConfig,
  update_ai_config: handleUpdateAiConfig,
  create_task_list: handleCreateTaskList,
  update_task_list: handleUpdateTaskList,
  delete_task_list: handleDeleteTaskList,
  create_subtask: handleCreateSubtask,
  toggle_subtask: handleToggleSubtask,
  delete_subtask: handleDeleteSubtask,
  update_note: handleUpdateNote,
  delete_note: handleDeleteNote,
  search_knowledge: handleSearchKnowledge,
  summarize_knowledge: handleSummarizeKnowledge,
  ask_knowledge: handleAskKnowledge,
  coin_flip: handleCoinFlip,
  web_search: handleWebSearch,
}

async function executeChatTool(
  c: Context<{ Bindings: Env }>,
  db: any,
  name: string,
  args: any,
  ctx: ChatCtx
): Promise<{ observation: string; refresh: boolean; action?: any; sources?: { title: string; url: string; snippet: string }[] }> {
  name = resolveChatTool(name, args)
  const handler = HANDLERS[name]
  if (handler) return handler(c, db, args, ctx)
  return { observation: `未知工具：${name}`, refresh: false }
}

export { executeChatTool }
