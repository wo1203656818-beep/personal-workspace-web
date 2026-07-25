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
})

// 子任务
export const createSubtaskSchema = z.object({
  title: z.string().min(1, 'title 不能为空'),
})

export const updateSubtaskSchema = z.object({
  title: z.string().min(1).optional(),
  isCompleted: z.boolean().optional(),
  sortOrder: z.number().optional(),
})

// 笔记
export const createNoteSchema = z.object({
  title: z.string().min(1, 'title 不能为空'),
  content: z.string().min(1, 'content 不能为空'),
  sourceFile: z.string().optional(),
})

export const updateNoteSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
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

// AI 测试（apiKey 可选：为空时后端回退到已保存的密钥）
export const aiTestSchema = z.object({
  baseUrl: z.string().url('baseUrl 格式错误'),
  apiKey: z.string().optional(),
  model: z.string().optional(),
})

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


