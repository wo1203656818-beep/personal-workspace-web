export interface TaskList {
  id: string
  name: string
  color: string
  sortOrder: number
  isSystem: boolean
  msTodoListId?: string | null
  createdAt: string
  updatedAt: string
  taskCount?: number
  activeTaskCount?: number
  completedTaskCount?: number
}

export interface Task {
  id: string
  listId: string
  title: string
  note?: string | null
  isCompleted: boolean
  isImportant: boolean
  isMyDay: boolean
  myDayDate?: string | null
  dueDate?: string | null
  reminder?: string | null
  recurrence?: string | null
  sortOrder: number
  msTodoId?: string | null
  // 行动承诺系统
  status?: 'planned' | 'committed' | 'in_progress' | 'done'
  why?: string | null
  firstStep?: string | null
  startedAt?: string | null
  abandonedAt?: string | null
  // 心理学干预
  commitmentDeadline?: string | null
  energyLevel?: 'low' | 'medium' | 'high' | null
  ifThenPlan?: string | null
  // 两分钟规则
  isQuick?: boolean
  quickDeadline?: string | null
  createdAt: string
  updatedAt: string
  subtaskCount?: number
  completedSubtaskCount?: number
}

export interface Subtask {
  id: string
  taskId: string
  title: string
  isCompleted: boolean
  sortOrder: number
}

export interface Note {
  id: string
  title: string
  content: string
  contentHtml?: string | null
  sourceFile?: string | null
  importedAt?: string | null
  updatedAt: string
}

export interface NoteSummary {
  id: string
  title: string
  sourceFile?: string | null
  importedAt?: string | null
  updatedAt: string
  snippet: string
}

export interface KbDocument {
  id: string
  title: string
  content?: string | null
  sourceFile?: string | null
  fileType?: string | null
  fileSize?: number | null
  r2Key?: string | null
  isStarred?: boolean | null
  aiSummary?: string | null
  importedAt?: string | null
  updatedAt?: string | null
}

export interface KbSummary {
  id: string
  title: string
  fileType?: string | null
  fileSize?: number | null
  r2Key?: string | null
  isStarred?: boolean | null
  importedAt?: string | null
  updatedAt?: string | null
}

export interface SyncLog {
  id: string
  source:
    | 'ms_todo'
    | 'ima_notes'
    | 'ima_kb'
    | 'news_fetch'
    | 'news_digest'
    | 'news_ai'
    | 'news_push'
    | 'monitor'
    | 'monitor_push'
    | 'daily_suggestion'
    | 'weekly_report'
  status: 'success' | 'partial' | 'error'
  synced: number
  failed: number
  skipped: number
  message?: string | null
  details?: string | null
  createdAt: string
}

export interface SyncStatus {
  lastSyncAt: string | null
  status: 'idle' | 'syncing' | 'success' | 'error'
  message?: string
}

export interface AiAnalysisStats {
  totalTasks: number
  completedTasks: number
  importantTasks: number
  notesCount: number
  dailyCompleted: { date: string; count: number }[]
}

export interface ChatSessionPreview {
  id: string
  title: string
  updatedAt: string | null
  preview: string
  pinned?: number
  tags?: string[]
  configId?: string | null
}

export interface ChatMessageRow {
  role: string
  content: string
  toolCalls: string | null
  createdAt: string | null
}

export interface AiConfig {
  id: string
  name: string
  type: 'cloudflare' | 'openai'
  baseUrl: string
  model: string
  isDefault: boolean
  apiKeySet: boolean
  createdAt: string | null
}

export interface Tag {
  id: string
  name: string
  color: string
  createdAt: string
}

export interface MonitorTarget {
  id: string
  type: 'hotlist' | 'youtube'
  platform: string
  label: string
  targetId?: string | null
  keyword?: string | null
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export interface MonitorSnapshotItem {
  title?: string
  url?: string
  rank?: number
  score?: number
  views?: number
  likes?: number
  comments?: number
  author?: string
  description?: string
  thumbnail?: string
  publishedAt?: string
  [key: string]: unknown
}

export interface MonitorSnapshot {
  id: string
  date: string
  type: string
  platform: string
  targetId?: string | null
  items: MonitorSnapshotItem[]
  fetchedAt?: string
}

export interface MonitorBrief {
  id: string
  date: string
  title: string
  content: string
  sourceCount: number
  pushedAt?: string | null
  createdAt?: string
}
