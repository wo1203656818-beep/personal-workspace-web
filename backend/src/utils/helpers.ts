import { drizzle } from 'drizzle-orm/d1'
import { eq, inArray, sql, getTableColumns, count } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'

// Re-export all split modules so existing `from '../utils/helpers'` imports keep working
export { callAI } from './ai-client'
export type { CallAIOptions } from './ai-client'
export { embedText, indexTarget } from './vectorize'
export { normalizeSearchText, buildSearchTerms, lexicalScore, buildSnippet } from './search'
export { kvCacheGet, kvCacheSet, kvCacheDeletePrefix } from './kv-cache'

// ═══════════════════════════════════════
// 时间工具
// ═══════════════════════════════════════

export function parseStoredTime(s: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00Z')
  const cleaned = s.replace(/\+.*/, '').replace('Z', '')
  const d = new Date(cleaned + 'Z')
  return isNaN(d.getTime()) ? new Date() : d
}

export function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function normalizeDate(s: string | null | undefined): string | null {
  if (!s) return null
  return s.split('T')[0]
}

export function getISOWeek(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year: date.getUTCFullYear(), week }
}

// ═══════════════════════════════════════
// 密码认证
// ═══════════════════════════════════════

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = parseInt(parts[1], 10)
  const salt = new Uint8Array(parts[2].match(/.{2}/g)!.map((b) => parseInt(b, 16)))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  const computed = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return computed === parts[3]
}

export async function getStoredPasswordHash(env: Env): Promise<string> {
  const db = drizzle(env.DB, { schema })
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'password_hash'))
  if (row.length > 0) {
    const { decrypt } = await import('../crypto-utils')
    return decrypt(env.JWT_SECRET, row[0].value)
  }
  return env.PASSWORD_HASH
}

// ═══════════════════════════════════════
// 子任务聚合
// ═══════════════════════════════════════

export const TASK_COLUMNS = getTableColumns(schema.tasks)
const { note: _taskNote, ...TASK_SUMMARY_COLUMNS_REST } = TASK_COLUMNS
export { TASK_SUMMARY_COLUMNS_REST as TASK_SUMMARY_COLUMNS }

export function buildSubtaskAgg(db: ReturnType<typeof drizzle<any>>) {
  return {
    async counts(taskIds: string[]) {
      if (!taskIds.length)
        return new Map<string, { subtaskCount: number; completedSubtaskCount: number }>()
      const rows = await db
        .select({
          taskId: schema.subtasks.taskId,
          subtaskCount: count(schema.subtasks.id),
          completedSubtaskCount: sql<number>`SUM(CASE WHEN ${schema.subtasks.isCompleted} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(schema.subtasks)
        .where(inArray(schema.subtasks.taskId, taskIds))
        .groupBy(schema.subtasks.taskId)
      const m = new Map<string, { subtaskCount: number; completedSubtaskCount: number }>()
      for (const r of rows)
        m.set(r.taskId, {
          subtaskCount: Number(r.subtaskCount),
          completedSubtaskCount: Number(r.completedSubtaskCount) || 0,
        })
      return m
    },
  }
}

export async function syncParentCompletion(db: any, taskId: string) {
  const subs = await db
    .select({ isCompleted: schema.subtasks.isCompleted })
    .from(schema.subtasks)
    .where(eq(schema.subtasks.taskId, taskId))
  const allDone = subs.length > 0 && subs.every((s: any) => s.isCompleted)
  await db
    .update(schema.tasks)
    .set({ isCompleted: allDone, updatedAt: (await import('../time')).nowBeijing() })
    .where(eq(schema.tasks.id, taskId))
}
