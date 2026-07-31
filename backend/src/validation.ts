import { z } from 'zod'

// 认证
export const loginSchema = z.object({
  password: z.string().min(1, '密码不能为空'),
})

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '旧密码不能为空'),
  newPassword: z.string().min(6, '新密码至少 6 位'),
})

// 任务列表
export const createListSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  color: z.string().optional(),
})

export const updateListSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
})

// 任务
export const createTaskSchema = z.object({
  listId: z.string().min(1, 'listId 不能为空'),
  title: z.string().min(1, 'title 不能为空'),
  note: z.string().optional().default(''),
  isImportant: z.boolean().optional().default(false),
  isMyDay: z.boolean().optional().default(false),
  myDayDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  // 行动承诺系统
  status: z.enum(['planned', 'committed', 'in_progress']).optional(),
  why: z.string().max(2000).optional(),
  firstStep: z.string().max(500).optional(),
  // 心理学干预
  commitmentDeadline: z.string().nullable().optional(),
  energyLevel: z.enum(['low', 'medium', 'high']).nullable().optional(),
  ifThenPlan: z.string().max(500).nullable().optional(),
})

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  note: z.string().optional(),
  isCompleted: z.boolean().optional(),
  isImportant: z.boolean().optional(),
  isMyDay: z.boolean().optional(),
  myDayDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  reminder: z.string().nullable().optional(),
  recurrence: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
  // 支持移动任务到其他列表（任务详情弹窗"移动到列表"功能）
  listId: z.string().optional(),
  // 行动承诺系统
  status: z.enum(['planned', 'committed', 'in_progress', 'done']).optional(),
  why: z.string().max(2000).nullable().optional(),
  firstStep: z.string().max(500).nullable().optional(),
  // 心理学干预
  commitmentDeadline: z.string().nullable().optional(),
  energyLevel: z.enum(['low', 'medium', 'high']).nullable().optional(),
  ifThenPlan: z.string().max(500).nullable().optional(),
})

// 子任务
export const createSubtaskSchema = z.object({
  title: z.string().min(1, 'title 不能为空'),
  sortOrder: z.number().optional(),
})

export const updateSubtaskSchema = z.object({
  title: z.string().min(1).optional(),
  isCompleted: z.boolean().optional(),
  sortOrder: z.number().optional(),
})

// 笔记
export const createNoteSchema = z.object({
  title: z.string().min(1, 'title 不能为空'),
  content: z.string().default(''),
  sourceFile: z.string().optional(),
})

export const updateNoteSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
})

// IMA 笔记
export const imaCreateNoteSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1, 'content 不能为空'),
})

export const imaAppendNoteSchema = z.object({
  content: z.string().min(1, 'content 不能为空'),
})

// 设置（key-value 字符串映射）
export const settingsSchema = z.record(z.string(), z.string())

// AI 配置（多条目）
export const aiConfigCreateSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  type: z.enum(['cloudflare', 'openai']),
  baseUrl: z.string().optional().default(''),
  apiKey: z.string().optional().default(''),
  model: z.string().optional().default(''),
  isDefault: z.boolean().optional().default(false),
})

export const aiConfigUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['cloudflare', 'openai']).optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  isDefault: z.boolean().optional(),
})

export const aiConfigTestSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['cloudflare', 'openai']).optional(),
  baseUrl: z.string().optional().default(''),
  apiKey: z.string().optional().default(''),
  model: z.string().optional().default(''),
})

// 子任务创建（POST /subtasks）
export const subtaskCreateSchema = z.object({
  title: z.string().min(1, 'title 不能为空'),
  taskId: z.string().min(1, 'taskId 不能为空'),
})

// AI 聊天会话创建
export const chatSessionCreateSchema = z.object({
  title: z.string().min(1, '标题不能为空'),
})

// 监控目标
export const monitorTargetSchema = z.object({
  type: z.enum(['hotlist', 'youtube']),
  platform: z.string().min(1, 'platform 不能为空'),
  label: z.string().min(1, 'label 不能为空'),
  targetId: z.string().optional(),
  keyword: z.string().optional(),
  enabled: z.boolean().optional(),
})

// 新闻订阅源
export const newsSourceSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  url: z.string().url('URL 格式错误'),
  type: z.string().min(1, 'type 不能为空'),
  category: z.string().min(1, '分类不能为空'),
  lang: z.string().optional().default('zh'),
  enabled: z.boolean().optional(),
})
