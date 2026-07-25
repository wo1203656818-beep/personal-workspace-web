import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// 任务列表
export const taskLists = sqliteTable('task_lists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').default('#2563EB'),
  sortOrder: integer('sort_order').default(0),
  isSystem: integer('is_system', { mode: 'boolean' }).default(false),
  msTodoListId: text('ms_todo_list_id'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// 任务
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  listId: text('list_id').notNull().references(() => taskLists.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  note: text('note').default(''),
  isCompleted: integer('is_completed', { mode: 'boolean' }).default(false),
  isImportant: integer('is_important', { mode: 'boolean' }).default(false),
  isMyDay: integer('is_my_day', { mode: 'boolean' }).default(false),
  myDayDate: text('my_day_date'),
  dueDate: text('due_date'),
  reminder: text('reminder'),
  recurrence: text('recurrence'),
  sortOrder: integer('sort_order').default(0),
  msTodoId: text('ms_todo_id'),
  msTodoListId: text('ms_todo_list_id'),
  lastSyncedAt: text('last_synced_at'),
  msTodoDeletedAt: text('ms_todo_deleted_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// 子任务
export const subtasks = sqliteTable('subtasks', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  isCompleted: integer('is_completed', { mode: 'boolean' }).default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// IMA 笔记
export const imaNotes = sqliteTable('ima_notes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  contentHtml: text('content_html'),
  sourceFile: text('source_file'),
  importedAt: text('imported_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// 知识库文档
export const kbDocuments = sqliteTable('kb_documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  fileType: text('file_type').notNull(),
  r2Key: text('r2_key'),
  fileSize: integer('file_size'),
  importedAt: text('imported_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// 天意硬币
export const coinFlips = sqliteTable('coin_flips', {
  id: text('id').primaryKey(),
  result: text('result').notNull(),
  entropySource: text('entropy_source').notNull(),
  rawValue: integer('raw_value'),
  interpretation: text('interpretation'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// 设置
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// AI 配置（支持多条，可自由设置默认）
export const aiConfigs = sqliteTable('ai_configs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'cloudflare' | 'openai'
  baseUrl: text('base_url'),
  apiKey: text('api_key'), // 加密存储（enc$ 前缀），Cloudflare 类型可为空
  model: text('model'),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// 向量嵌入（跨模块语义检索用；个人量级，暴力余弦即可，不引外部向量库）
export const embeddings = sqliteTable('embeddings', {
  id: text('id').primaryKey(),
  targetType: text('target_type').notNull(), // 'note' | 'task' | 'subtask' | 'kb'
  targetId: text('target_id').notNull(),
  model: text('model').notNull(),
  vector: text('vector').notNull(), // JSON 数组
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// KV 缓存（AI 搜索结果等短时缓存）
export const kvCache = sqliteTable('kv_cache', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at').notNull(), // Unix 时间戳（毫秒）
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// 答案之书
export const answerBookDraws = sqliteTable('answer_book_draws', {
  id: text('id').primaryKey(),
  result: text('result').notNull(),
  entropySource: text('entropy_source').notNull(),
  rawValue: integer('raw_value'),
  interpretation: text('interpretation'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// 每日一签
export const dailyFortunes = sqliteTable('daily_fortunes', {
  id: text('id').primaryKey(),
  date: text('date').notNull(), // yyyy-MM-dd 北京日期
  result: text('result').notNull(),
  entropySource: text('entropy_source').notNull(),
  rawValue: integer('raw_value'),
  interpretation: text('interpretation'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// 同步日志
export const syncLogs = sqliteTable('sync_logs', {
  id: text('id').primaryKey(),
  source: text('source').notNull(), // ms_todo | ima_notes | ima_kb
  status: text('status').notNull(), // success | partial | error
  synced: integer('synced').default(0),
  failed: integer('failed').default(0),
  skipped: integer('skipped').default(0),
  message: text('message'),
  details: text('details'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// ============ AI 聊天记录（持久化）============
// 会话表：一条会话 = 一段连续对话
export const chatSessions = sqliteTable('chat_sessions', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('新对话'),
  tags: text('tags'), // JSON 数组，如 ["工作","重要"]，可空
  pinned: integer('pinned').default(0), // 0/1 置顶（固定到顶部）
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// 消息表：会话内的单条消息（含助手调用的工具信息，便于回放）
export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull().default(''),
  toolCalls: text('tool_calls'), // JSON：助手本次调用的工具 [{name, args}]
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})
