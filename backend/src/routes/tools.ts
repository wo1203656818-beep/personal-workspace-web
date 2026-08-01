import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'

const tools = new Hono<{ Bindings: Env }>()

// ========== 同步日志 ==========

tools.get('/sync-logs', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const source = c.req.query('source')
    const status = c.req.query('status')

    let q = db.select().from(schema.syncLogs)
    const conditions = []
    if (source) conditions.push(eq(schema.syncLogs.source, source))
    if (status) conditions.push(eq(schema.syncLogs.status, status))
    if (conditions.length > 0) q = q.where(and(...conditions)) as typeof q

    const rows = await q.orderBy(desc(schema.syncLogs.createdAt))
    return c.json(rows)
  } catch (err) {
    console.error('Sync logs error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// ========== 设置（按 key 删除）============

tools.delete('/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.settings).where(eq(schema.settings.key, key))
    if (!existing) return c.json({ error: '设置项不存在' }, 404)
    await db.delete(schema.settings).where(eq(schema.settings.key, key))
    return c.json({ ok: true })
  } catch (err) {
    console.error('Settings delete error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// ========== AI 图片生成 ==========

tools.post('/tools/generate-image', async (c) => {
  try {
    const { prompt, size, style } = await c.req.json<{ prompt: string; size?: string; style?: string }>()
    if (!prompt) return c.json({ error: '缺少 prompt 参数' }, 400)

    // 解析尺寸（格式：宽x高，如 1024x1024）
    let width = 1024
    let height = 1024
    if (size) {
      const parts = size.split('x')
      if (parts.length === 2) {
        width = parseInt(parts[0], 10) || 1024
        height = parseInt(parts[1], 10) || 1024
      }
    }

    // 如果指定了风格，附加到 prompt 中
    const finalPrompt = style ? `${prompt}, ${style}风格` : prompt

    const result = await c.env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
      prompt: finalPrompt,
      width,
      height,
    })

    // 将图片字节转换为 base64 数据 URL
    let imageData: Uint8Array
    if (result instanceof ArrayBuffer) {
      imageData = new Uint8Array(result)
    } else if (result && typeof result === 'object') {
      imageData = new Uint8Array((result as any).image)
    } else {
      throw new Error('不支持的 AI 响应格式')
    }

    const base64 = btoa(Array.from(imageData, (b) => String.fromCharCode(b)).join(''))
    const imageUrl = `data:image/png;base64,${base64}`

    return c.json({ imageUrl })
  } catch (err) {
    console.error('generate-image error:', err)
    return c.json({ error: '图片生成失败', detail: String(err) }, 500)
  }
})

export default tools
