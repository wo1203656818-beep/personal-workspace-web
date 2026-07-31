import { Hono } from 'hono'
import { Jwt } from 'hono/utils/jwt'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { loginSchema, changePasswordSchema } from '../validation'
import { decrypt, encrypt, hashPassword } from '../crypto-utils'
import { nowBeijing } from '../time'
import { verifyPassword, getStoredPasswordHash } from '../utils/helpers'

const auth = new Hono<{ Bindings: Env }>()

auth.post('/login', async (c) => {
  const { password } = loginSchema.parse(await c.req.json())
  const storedHash = await getStoredPasswordHash(c.env)
  const ok = await verifyPassword(password, storedHash)
  if (!ok) return c.json({ error: '密码错误' }, 401)
  const token = await Jwt.sign(
    { exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 },
    c.env.JWT_SECRET,
    'HS256',
  )
  return c.json({ token })
})

auth.post('/change-password', async (c) => {
  const { oldPassword, newPassword } = changePasswordSchema.parse(await c.req.json())
  const storedHash = await getStoredPasswordHash(c.env)
  const ok = await verifyPassword(oldPassword, storedHash)
  if (!ok) return c.json({ error: '旧密码错误' }, 401)
  const newHash = await hashPassword(newPassword)
  const encrypted = await encrypt(c.env.JWT_SECRET, newHash)
  const db = drizzle(c.env.DB, { schema })
  await db
    .insert(schema.settings)
    .values({ key: 'password_hash', value: encrypted })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: encrypted, updatedAt: nowBeijing() },
    })
  return c.json({ ok: true })
})

export default auth
