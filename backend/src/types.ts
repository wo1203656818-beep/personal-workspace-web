// 统一的 Cloudflare Workers 环境类型
// index.ts / ms-sync.ts / ima-sync.ts 共用

export interface Env {
  DB: D1Database
  CACHE: KVNamespace
  AI: Ai
  STORAGE: R2Bucket
  VECTORIZE: VectorizeIndex
  JWT_SECRET: string
  PASSWORD_HASH: string
  MS_CLIENT_ID?: string
  MS_CLIENT_SECRET?: string
  MS_TENANT_ID?: string
  ALLOWED_ORIGIN?: string
  MCP_TOKEN?: string
  // Telegram webhook 注册用的公网基址（必须是 Telegram 服务器可直达、无 Cloudflare Access 的域名，
  // 即 workers.dev 域名；自定义域名有 Access 会拦截 Telegram 的回调）
  PUBLIC_API_BASE?: string
  TAVILY_API_KEY?: string
  // 监控手动触发/推送的密钥（设置了才校验，未设置则不校验）
  CRON_SECRET?: string
}

// AI 聊天消息类型
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// API 统一响应类型
export interface ApiSuccess<T = any> { ok: true; data?: T }
export interface ApiError { ok?: false; error: string; detail?: string; requestId?: string }
export interface PaginatedResponse<T> { items: T[]; pagination: { page: number; pageSize: number; total: number } }
export interface ToolResult { observation: string; refresh: boolean; action?: any; sources?: any[] }
