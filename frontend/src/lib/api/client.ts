import ky, { HTTPError } from 'ky'
import { toast } from 'sonner'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export { API_BASE }

/** 默认请求超时时间（毫秒） */
export const DEFAULT_TIMEOUT = 120000

/** 重试配置：最多重试 2 次，仅对 GET 请求重试 */
const RETRY_CONFIG = {
  limit: 2,
  methods: ['get'] as string[],
  statusCodes: [408, 429, 500, 502, 503, 504] as number[],
  maxRetryAfter: 5000,
  afterStatusCodes: [408, 429, 500, 502, 503, 504] as number[],
  delay: (attempt: number) => 2 ** attempt * 1000,
}

/**
 * 解析错误响应体，生成更友好的错误信息
 */
async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.clone().json()
    if (body?.message) return body.message
    if (body?.error) return body.error
    if (body?.detail) return body.detail
  } catch {
    // not JSON
  }
  try {
    const text = await response.clone().text()
    if (text && text.length < 200) return text
  } catch {
    // ignore
  }
  return ''
}

/**
 * 生成用户友好的错误消息
 */
export async function getFriendlyErrorMessage(error: unknown): Promise<string> {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return '请求超时，请检查网络连接后重试'
  }
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return '网络连接失败，请检查网络或服务器状态'
  }

  if (error instanceof HTTPError) {
    const status = error.response.status
    const customMsg = await parseErrorMessage(error.response)

    if (status === 400) return customMsg || '请求参数有误'
    if (status === 401) return '登录已过期，请重新登录'
    if (status === 403) return customMsg || '没有权限执行此操作'
    if (status === 404) return customMsg || '请求的资源不存在'
    if (status === 408) return '请求超时，请稍后重试'
    if (status === 409) return customMsg || '数据冲突，请刷新后重试'
    if (status === 422) return customMsg || '提交的数据校验失败'
    if (status === 429) return '请求过于频繁，请稍后重试'
    if (status >= 500) return customMsg || '服务器内部错误，请稍后重试'

    return customMsg || `请求失败 (${status})`
  }

  if (error instanceof SyntaxError) {
    return '数据解析失败，请稍后重试'
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }

  return '未知错误，请稍后重试'
}

export const api = ky.create({
  prefix: API_BASE,
  retry: RETRY_CONFIG,
  timeout: DEFAULT_TIMEOUT,
  hooks: {
    beforeRequest: [
      ({ request }) => {
        const token = localStorage.getItem('token')
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`)
        }
      },
    ],
    beforeError: [
      async (error) => {
        const friendly = await getFriendlyErrorMessage(error)
        return new Error(friendly)
      },
    ],
    afterResponse: [
      async ({ request, response }) => {
        if (response.status !== 401) return
        const url = new URL(request.url)
        if (url.pathname.endsWith('/api/auth/login')) return
        localStorage.removeItem('token')
        const current = window.location.pathname + window.location.search
        if (!current.startsWith('/login')) {
          sessionStorage.setItem('redirect-after-login', current)
        }
        toast.error('登录已过期，请重新登录')
        window.location.href = '/login'
      },
    ],
  },
})

/**
 * 带超时控制的请求包装器
 * 当请求超过指定时间仍未完成时自动中断
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 30000,
  _timeoutMessage?: string,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const result = await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new DOMException('AbortError', 'AbortError'))
        })
      }),
    ])
    return result
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 带重试的 API 请求包装器
 * 仅在请求失败时自动重试，最多重试指定次数
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    retryDelay?: number
    onRetry?: (attempt: number, error: unknown) => void
  } = {},
): Promise<T> {
  const { maxRetries = 2, retryDelay = 1000, onRetry } = options

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt >= maxRetries) throw error
      // 401 不重试
      if (error instanceof HTTPError && error.response.status === 401) throw error
      // 400/403/404 不重试
      if (error instanceof HTTPError && [400, 403, 404, 422].includes(error.response.status)) {
        throw error
      }
      onRetry?.(attempt + 1, error)
      await new Promise((resolve) => setTimeout(resolve, retryDelay * 2 ** attempt))
    }
  }

  throw new Error('请求失败')
}
