import type { Env } from '../types'

export async function kvCacheGet<T>(env: Env, key: string): Promise<T | null> {
  try {
    const value = await env.CACHE.get(key)
    if (value) {
      try { return JSON.parse(value) as T } catch { return null }
    }
  } catch (e) { console.error('[kv] get failed:', e) }
  return null
}

export async function kvCacheSet(env: Env, key: string, value: unknown, ttlMs: number): Promise<void> {
  const json = JSON.stringify(value)
  try {
    await env.CACHE.put(key, json, { expirationTtl: Math.max(60, Math.ceil(ttlMs / 1000)) })
  } catch (e) { console.error('[kv] put failed:', e) }
}

export async function kvCacheDeletePrefix(env: Env, prefix: string, limit = 1000): Promise<void> {
  try {
    const list = await env.CACHE.list({ prefix, limit })
    if (list.keys.length > 0) {
      await Promise.all(list.keys.map((k) => env.CACHE.delete(k.name)))
    }
  } catch (e) { console.error('[kv] delete prefix failed:', e) }
}
