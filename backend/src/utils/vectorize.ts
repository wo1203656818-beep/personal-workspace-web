import type { Context } from 'hono'
import type { Env } from '../types'

const EMBED_MODEL = '@cf/baai/bge-m3'

export async function embedText(c: Context<{ Bindings: Env }>, text: string): Promise<number[]> {
  const res = await c.env.AI.run(EMBED_MODEL, { text: text.slice(0, 8000) })
  const r = res as any
  const vec = Array.isArray(r?.data) ? r.data[0] : (r?.embedding ?? r?.data ?? null)
  if (Array.isArray(vec)) return vec as number[]
  if (Array.isArray(r)) return r as number[]
  throw new Error('embedding 解析失败')
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 2,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (e: any) {
      if (attempt === maxRetries) {
        console.error(`[retry] ${label} failed after ${maxRetries + 1} attempts:`, e?.message)
        throw e
      }
      const delay = Math.min(1000 * 2 ** attempt, 5000)
      console.warn(
        `[retry] ${label} attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
        e?.message,
      )
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error('unreachable')
}

export async function indexTarget(
  c: Context<{ Bindings: Env }>,
  type: 'note' | 'task' | 'kb' | 'subtask',
  id: string,
  text: string,
) {
  try {
    const t = (text || '').trim()
    const vectorId = `${type}:${id}`
    if (!t) {
      await retryWithBackoff(
        () => c.env.VECTORIZE.deleteByIds([vectorId]),
        `vectorize delete ${vectorId}`,
      )
      return
    }
    const vec = await embedText(c, t.slice(0, 4000))
    await retryWithBackoff(
      () =>
        c.env.VECTORIZE.upsert([
          {
            id: vectorId,
            values: vec,
            metadata: { type, targetId: id },
          },
        ]),
      `vectorize upsert ${vectorId}`,
    )
  } catch (e: any) {
    console.error('[embed] indexTarget failed (ignored):', e?.message)
  }
}
