// 带超时的 fetch，避免外部服务挂起拖死整个 Worker 请求
// 超时后抛错，由调用方决定如何处理（失败结构化返回）
export async function fetchWithTimeout(
  url: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(`FETCH_TIMEOUT: ${String(url).slice(0, 120)} (>${timeoutMs}ms)`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}
