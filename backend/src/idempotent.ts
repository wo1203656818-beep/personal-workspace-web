import type { Env } from './types'

/**
 * 幂等性辅助：基于 Idempotency-Key header + KV 缓存，5 分钟内重复请求返回首次结果
 *
 * @param env - Worker 环境（需 KV 绑定）
 * @param key - 幂等键（通常从 Idempotency-Key header 读取）
 * @param fn - 实际业务函数
 * @returns 首次执行结果或缓存结果
 */
export async function withIdempotency<T>(
  env: Env,
  key: string | undefined | null,
  fn: () => Promise<T>,
): Promise<T> {
  // 无幂等键：直接执行，不缓存
  if (!key) return fn()

  const kvKey = `idem:${key}`
  const cached = await env.CACHE.get(kvKey, 'json')
  if (cached) return cached as T

  const result = await fn()
  // 缓存 5 分钟
  await env.CACHE.put(kvKey, JSON.stringify(result), { expirationTtl: 300 })
  return result
}
