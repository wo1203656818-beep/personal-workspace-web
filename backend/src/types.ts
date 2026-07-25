// 统一的 Cloudflare Workers 环境类型
// index.ts / ms-sync.ts / ima-sync.ts 共用

export interface Env {
  DB: D1Database
  CACHE: KVNamespace
  AI: Ai
  STORAGE: R2Bucket
  JWT_SECRET: string
  PASSWORD_HASH: string
  MS_CLIENT_ID?: string
  MS_CLIENT_SECRET?: string
  MS_TENANT_ID?: string
  ALLOWED_ORIGIN?: string
  MCP_TOKEN?: string
}

// AI 聊天消息类型
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
