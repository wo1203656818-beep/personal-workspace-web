import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../schema'
import type { Env } from '../types'
import { decrypt, encrypt, SENSITIVE_KEYS } from '../crypto-utils'
import { nowBeijing } from '../time'

export async function getSetting(env: Env, key: string): Promise<string | null> {
  const db = drizzle(env.DB, { schema })
  const row = await db.select().from(schema.settings).where(eq(schema.settings.key, key))
  if (!row.length) return null
  const val = row[0].value
  if (val.startsWith('enc$')) {
    try { return await decrypt(env.JWT_SECRET, val) } catch { return val }
  }
  return val
}

export async function setSetting(env: Env, key: string, value: string): Promise<void> {
  const db = drizzle(env.DB, { schema })
  const now = nowBeijing()
  // 敏感字段（refresh_token / api_key 等）自动加密存储，避免明文落库
  const storedValue = SENSITIVE_KEYS.includes(key) ? await encrypt(env.JWT_SECRET, value) : value
  await db.insert(schema.settings)
    .values({ key, value: storedValue })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: storedValue, updatedAt: now } })
}
