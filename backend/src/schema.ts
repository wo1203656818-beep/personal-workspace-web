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
