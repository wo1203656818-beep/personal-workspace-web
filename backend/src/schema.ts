import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
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
  // 行动承诺系统
  status: text('status').default('planned'), // planned | committed | in_progress | done
  why: text('why'), // 为什么要做这个任务
  firstStep: text('first_step'), // 第一步最小行动
  startedAt: text('started_at'),
  abandonedAt: text('abandoned_at'),
  // 心理学干预
  commitmentDeadline: text('commitment_deadline'), // 承诺截止时间
  energyLevel: text('energy_level'), // 任务所需能量: low | medium | high
  ifThenPlan: text('if_then_plan'), // if-then 计划: "如果X发生，我就做Y"
  // 两分钟规则
  isQuick: integer('is_quick', { mode: 'boolean' }).default(false), // 标记为快速任务
  quickDeadline: text('quick_deadline'), // 快速任务截止时间（2分钟后）
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

// 向量嵌入（历史表，已迁移到 Cloudflare Vectorize；保留供迁移过渡期使用）
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

// 新闻订阅源
export const feedSources = sqliteTable('feed_sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  type: text('type').notNull(), // 'rss' | 'rsshub' | 'api'
  category: text('category').notNull(), // 加密/财经/科技/综合
  lang: text('lang').default('zh'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  weight: integer('weight').default(3), // 1-5 源权重，用于三级漏斗预筛
  lastFetchedAt: text('last_fetched_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// 新闻候选条目（抓取后入库，AI 评分前的候选池）
export const feedItems = sqliteTable('feed_items', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').notNull().references(() => feedSources.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  url: text('url').notNull().unique(),
  summary: text('summary'),
  category: text('category').notNull(),
  // AI 评分状态：0=待评分，正数=已评分（1-10），-1=AI 失败（不再自动重试）
  aiScore: integer('ai_score').default(0),
  // AI 翻译的中文标题（英文新闻翻译成中文，中文保留原文）
  titleZh: text('title_zh'),
  // AI 一句话要点（评分时生成）
  aiSummary: text('ai_summary'),
  // AI 判断的"为什么重要"（评分时生成）
  aiReason: text('ai_reason'),
  aiTags: text('ai_tags'), // JSON: ["科技","AI"]
  // 是否已纳入每日简报（避免重复入选）
  briefedAt: text('briefed_at'),
  publishedAt: text('published_at'),
  fetchedAt: text('fetched_at').default(sql`(datetime('now'))`),
})

// 每日简报（AI 主编出报，每天 5-10 条精选）
export const dailyDigests = sqliteTable('daily_digests', {
  id: text('id').primaryKey(),
  date: text('date').notNull().unique(), // yyyy-MM-dd（北京时间）
  title: text('title').notNull(),
  // 总览：AI 生成的一段 100 字以内的"今日要点"
  overview: text('overview'),
  // 精选条目 JSON：[{itemId, title, url, summary, reason, category, sourceName}]
  topItems: text('top_items').notNull(),
  // 是否已推送到 Telegram
  pushedAt: text('pushed_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// 用户反馈（👍/👎，用于渐进个性化）
export const newsFeedback = sqliteTable('news_feedback', {
  id: text('id').primaryKey(),
  // 反馈对象：item（单条新闻）或 brief（整份简报）
  targetType: text('target_type').notNull(), // 'item' | 'brief'
  targetId: text('target_id').notNull(),
  // 反馈类型：up（有用）/ down（没用）/ save（收藏）
  feedback: text('feedback').notNull(), // 'up' | 'down' | 'save'
  // 可选标签：用户选的"为什么没用"（重复/无关/低质/已知道）
  reason: text('reason'),
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

// 通用标签
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').default('#6366f1'),
  createdAt: text('created_at').notNull(),
})

// 标签关联（多态关联）
export const tagRelations = sqliteTable('tag_relations', {
  id: text('id').primaryKey(),
  tagId: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  targetType: text('target_type').notNull(), // 'task' | 'note' | 'kb'
  targetId: text('target_id').notNull(),
})

// ============ 自媒体对标监控（Layer A）============

// 决策规则库（帮助减少内耗，提前定好规则）
export const decisionRules = sqliteTable('decision_rules', {
  id: text('id').primaryKey(),
  category: text('category').notNull(), // 出行 | 购物 | 饮食 | 时间安排 | 其他
  title: text('title').notNull(),
  condition: text('condition').notNull(), // 条件描述
  action: text('action').notNull(), // 行动
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// 决策规则预置模板（一键套用到 decision_rules）
export const decisionTemplates = sqliteTable('decision_templates', {
  id: text('id').primaryKey(),
  category: text('category').notNull(), // 出行 | 购物 | 饮食 | 时间安排 | 社交 | 其他
  title: text('title').notNull(),
  condition: text('condition').notNull(), // 条件描述（如"差价低于50元"）
  action: text('action').notNull(), // 行动（如"直接选省时方案"）
  description: text('description'), // 使用场景说明
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// 决策日志（记录每次决策，用于模式识别）
export const decisionLogs = sqliteTable('decision_logs', {
  id: text('id').primaryKey(),
  taskId: text('task_id'), // 关联任务（可选）
  category: text('category').notNull(), // 出行 | 购物 | 饮食 | 时间安排 | 其他
  title: text('title').notNull(), // 决策描述
  options: text('options'), // JSON: 选项列表 ["高铁","普速","拼车"]
  chosenOption: text('chosen_option'), // 最终选择
  durationSec: integer('duration_sec'), // 决策耗时（秒）
  satisfaction: integer('satisfaction'), // 事后满意度 1-5（可空，延后填写）
  ruleApplied: text('rule_applied'), // 套用的规则 ID（可空）
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// 监控目标：热榜选题（douyin/weibo/zhihu/bilibili…）与 YouTube 竞品频道对标
export const monitorTargets = sqliteTable('monitor_targets', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'hotlist' | 'youtube'
  platform: text('platform').notNull(), // douyin/weibo/zhihu/bilibili/x/youtube
  label: text('label').notNull(), // 展示名，如「抖音热榜」「竞品A频道」
  targetId: text('target_id'), // YouTube 频道 ID（type=youtube 时）
  keyword: text('keyword'), // 可选：仅抓取含关键词的条目（用于关键词雷达）
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// 抓取快照：每次定时抓取的原始数据（按日期+平台+类型唯一）
export const monitorSnapshots = sqliteTable('monitor_snapshots', {
  id: text('id').primaryKey(),
  date: text('date').notNull(), // yyyy-MM-dd（北京日期）
  type: text('type').notNull(),
  platform: text('platform').notNull(),
  targetId: text('target_id'),
  items: text('items').notNull(), // JSON 数组：[{title, url?, heat?, desc?}]
  fetchedAt: text('fetched_at').default(sql`(datetime('now'))`),
})

// 每日监控简报：AI 从各平台热榜/对标中提炼「今日可写选题 / 创作灵感」
export const monitorBriefs = sqliteTable('monitor_briefs', {
  id: text('id').primaryKey(),
  date: text('date').notNull().unique(), // yyyy-MM-dd（北京时间），每天一份
  title: text('title').notNull(),
  content: text('content').notNull(), // AI 生成的选题/灵感正文
  sourceCount: integer('source_count').default(0), // 参与生成的条目数
  pushedAt: text('pushed_at'), // 已推送 Telegram 的时间
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// ═══════════════════════════════════════
// 性能索引
// ═══════════════════════════════════════

export const tasksListIdIdx = index('idx_tasks_list_id').on(tasks.listId)
export const tasksIsCompletedIdx = index('idx_tasks_is_completed').on(tasks.isCompleted)
export const tasksDueDateIdx = index('idx_tasks_due_date').on(tasks.dueDate)
export const tasksMyDayIdx = index('idx_tasks_my_day').on(tasks.isMyDay, tasks.myDayDate)
export const tasksMsTodoIdIdx = index('idx_tasks_ms_todo_id').on(tasks.msTodoId)
export const tasksMsTodoDeletedIdx = index('idx_tasks_ms_todo_deleted').on(tasks.msTodoDeletedAt)
export const tasksStatusIdx = index('idx_tasks_status').on(tasks.status)

export const subtasksTaskIdIdx = index('idx_subtasks_task_id').on(subtasks.taskId)

export const feedItemsSourceIdIdx = index('idx_feed_items_source_id').on(feedItems.sourceId)
export const feedItemsAiScoreIdx = index('idx_feed_items_ai_score').on(feedItems.aiScore)
export const feedItemsCategoryIdx = index('idx_feed_items_category').on(feedItems.category)

export const chatMessagesSessionIdIdx = index('idx_chat_messages_session_id').on(chatMessages.sessionId)
export const chatSessionsUpdatedAtIdx = index('idx_chat_sessions_updated_at').on(chatSessions.updatedAt)

export const tagRelationsTagIdIdx = index('idx_tag_relations_tag_id').on(tagRelations.tagId)
export const tagRelationsTargetIdx = index('idx_tag_relations_target').on(tagRelations.targetType, tagRelations.targetId)

export const monitorSnapshotsDateIdx = index('idx_monitor_snapshots_date').on(monitorSnapshots.date, monitorSnapshots.type)

export const syncLogsSourceIdx = index('idx_sync_logs_source').on(syncLogs.source)

export const newsFeedbackTargetIdx = index('idx_news_feedback_target').on(newsFeedback.targetType, newsFeedback.targetId)

export const decisionTemplatesCategoryIdx = index('idx_decision_templates_category').on(decisionTemplates.category)
export const decisionLogsTaskIdIdx = index('idx_decision_logs_task_id').on(decisionLogs.taskId)
export const decisionLogsCategoryIdx = index('idx_decision_logs_category').on(decisionLogs.category)

// ============ 情绪气象站 ============

// 情绪日志（天气隐喻打卡）
export const moodLogs = sqliteTable('mood_logs', {
  id: text('id').primaryKey(),
  weather: text('weather').notNull(), // sunny | cloudy | rainy | stormy | snowy
  note: text('note'), // 一句话原因（可选）
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

export const moodLogsCreatedAtIdx = index('idx_mood_logs_created_at').on(moodLogs.createdAt)

// ============ 娱乐功能 ============

// 赛博运势
export const cyberFortunes = sqliteTable('cyber_fortunes', {
  id: text('id').primaryKey(),
  date: text('date').notNull().unique(),
  content: text('content').notNull(),
  moodScore: integer('mood_score'),
  luckyColor: text('lucky_color'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// 今日人设
export const dailyPersonas = sqliteTable('daily_personas', {
  id: text('id').primaryKey(),
  date: text('date').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  luckyColor: text('lucky_color'),
  bgmStyle: text('bgm_style'),
  suitableFor: text('suitable_for'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// 灵感卡片（用户收藏）
export const savedInspirations = sqliteTable('saved_inspirations', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  category: text('category').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

// 随机挑战打卡
export const challengeCompletions = sqliteTable('challenge_completions', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),
  challenge: text('challenge').notNull(),
  category: text('category').notNull(),
  completedAt: text('completed_at').default(sql`(datetime('now'))`),
})

// 塔罗牌占卜记录
export const tarotReadings = sqliteTable('tarot_readings', {
  id: text('id').primaryKey(),
  question: text('question').notNull(),
  spread: text('spread').notNull(),
  cards: text('cards').notNull(), // JSON
  interpretation: text('interpretation').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})

export const cyberFortunesDateIdx = index('idx_cyber_fortunes_date').on(cyberFortunes.date)
export const dailyPersonasDateIdx = index('idx_daily_personas_date').on(dailyPersonas.date)
export const challengeCompletionsDateIdx = index('idx_challenge_completions_date').on(challengeCompletions.date)
export const tarotReadingsCreatedAtIdx = index('idx_tarot_readings_created_at').on(tarotReadings.createdAt)
