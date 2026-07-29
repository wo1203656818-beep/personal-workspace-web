import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'
import type { Env } from './types'

export type SyncSource = 'ms_todo' | 'ima_notes' | 'ima_kb' | 'news_fetch' | 'news_digest' | 'news_ai' | 'news_push'
export type SyncStatus = 'success' | 'partial' | 'error'

export interface SyncLogInput {
  status: SyncStatus
  synced?: number
  failed?: number
  skipped?: number
  message?: string
  details?: string
}

export async function logSync(
  env: Env,
  source: SyncSource,
  input: SyncLogInput
): Promise<void> {
  const db = drizzle(env.DB, { schema })
  try {
    await db.insert(schema.syncLogs).values({
      id: crypto.randomUUID(),
      source,
      status: input.status,
      synced: input.synced ?? 0,
      failed: input.failed ?? 0,
      skipped: input.skipped ?? 0,
      message: input.message,
      details: input.details,
    })
  } catch (e) {
    console.error('[sync-logger] failed to write sync log:', e)
  }
}
