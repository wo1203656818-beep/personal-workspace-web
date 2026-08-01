import { Hono } from 'hono'
import { Jwt } from 'hono/utils/jwt'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '../schema'
import type { Env } from '../types'
import { loginSchema, changePasswordSchema } from '../validation'
import { decrypt, encrypt, hashPassword } from '../crypto-utils'
import { nowBeijing } from '../time'
import { verifyPassword, getStoredPasswordHash } from '../utils/helpers'

const auth = new Hono<{ Bindings: Env }>()

auth.post('/login', async (c) => {
  try {
    // 防暴力：基于客户端 IP 的 KV 失败计数，5 次/10 分钟限流
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for') || 'unknown'
    const rateKey = `login_fail:${ip}`
    const failCount = Number((await c.env.CACHE.get(rateKey)) || 0)
    if (failCount >= 5) {
      return c.json({ error: '尝试次数过多，请 10 分钟后再试' }, 429)
    }
    const { password } = loginSchema.parse(await c.req.json())
    const storedHash = await getStoredPasswordHash(c.env)
    const ok = await verifyPassword(password, storedHash)
    if (!ok) {
      const next = failCount + 1
      await c.env.CACHE.put(rateKey, String(next), { expirationTtl: 600 })
      return c.json({ error: '密码错误' }, 401)
    }
    // 成功后清零计数
    if (failCount > 0) await c.env.CACHE.delete(rateKey)
    const token = await Jwt.sign(
      { exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 },
      c.env.JWT_SECRET,
      'HS256',
    )
    return c.json({ token })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: err.issues[0].message }, 400)
    }
    console.error('Login error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

auth.post('/change-password', async (c) => {
  try {
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
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: err.issues[0].message }, 400)
    }
    console.error('Change password error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

export default auth
