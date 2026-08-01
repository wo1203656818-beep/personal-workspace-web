import { Hono } from 'hono'
import type { Env } from '../types'

const files = new Hono<{ Bindings: Env }>()

// 列出 R2 文件
files.get('/', async (c) => {
  const prefix = c.req.query('prefix') || ''
  const limit = Math.min(parseInt(c.req.query('limit') || '100'), 1000)
  const cursor = c.req.query('cursor')
  
  try {
    const result = await c.env.STORAGE.list({ prefix, limit, cursor })
    const items = await Promise.all(
      result.objects.map(async (obj) => {
        const head = await c.env.STORAGE.head(obj.key)
        return {
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded,
          contentType: head?.httpMetadata?.contentType || 'application/octet-stream',
        }
      })
    )
    
    return c.json({
      items,
      cursor: result.truncated ? result.cursor : null,
      truncated: result.truncated,
    })
  } catch (err: any) {
    return c.json({ error: err.message || '列出文件失败' }, 500)
  }
})

// 删除文件
files.delete('/:key', async (c) => {
  const key = c.req.param('key')
  try {
    await c.env.STORAGE.delete(key)
    return c.json({ ok: true })
  } catch (err: any) {
    return c.json({ error: err.message || '删除失败' }, 500)
  }
})

// 上传文件（需 multipart/form-data）
files.post('/upload', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File | null
    if (!file) return c.json({ error: '请选择文件' }, 400)
    
    const key = formData.get('key') as string || file.name
    const arrayBuffer = await file.arrayBuffer()
    
    await c.env.STORAGE.put(key, arrayBuffer, {
      httpMetadata: { contentType: file.type },
    })
    
    return c.json({ key, size: file.size, contentType: file.type })
  } catch (err: any) {
    return c.json({ error: err.message || '上传失败' }, 500)
  }
})

// 重命名文件（复制到新 key 并删除旧 key）
files.put('/:key/rename', async (c) => {
  const key = c.req.param('key')
  try {
    const body = await c.req.json()
    const newKey = typeof body?.newKey === 'string' ? body.newKey.trim() : ''
    if (!newKey) return c.json({ error: '新文件名不能为空' }, 400)
    if (key === newKey) return c.json({ error: '新文件名与旧文件名相同' }, 400)

    const obj = await c.env.STORAGE.get(key)
    if (!obj) return c.json({ error: '文件不存在' }, 404)

    await c.env.STORAGE.put(newKey, obj.body, {
      httpMetadata: obj.httpMetadata,
      customMetadata: obj.customMetadata,
    })
    await c.env.STORAGE.delete(key)

    const head = await c.env.STORAGE.head(newKey)
    return c.json({
      key: newKey,
      size: head?.size || 0,
      uploaded: head?.uploaded,
      contentType: head?.httpMetadata?.contentType || 'application/octet-stream',
    })
  } catch (err: any) {
    return c.json({ error: err.message || '重命名失败' }, 500)
  }
})

export default files