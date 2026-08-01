import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '../schema'
import type { Env } from '../types'

const backup = new Hono<{ Bindings: Env }>()

// 导出所有数据
backup.get('/export', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const data: Record<string, any[]> = {}
    
    for (const [key, table] of Object.entries(schema)) {
      if (typeof table === 'object' && table !== null && 'dbName' in table) {
        try {
          const rows = await db.select().from(table as any)
          data[key] = rows
        } catch (err) {
          console.error(`Backup export error for table ${key}:`, err)
        }
      }
    }
    
    return c.json({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      data,
    })
  } catch (err) {
    console.error('Backup export error:', err)
    return c.json({ error: '导出失败' }, 500)
  }
})

// 导入数据
backup.post('/import', async (c) => {
  try {
    let body: any
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: '请求体格式无效' }, 400)
    }
    const db = drizzle(c.env.DB, { schema })
    const { data } = body
    let imported = 0
    
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return c.json({ error: '数据格式无效' }, 400)
    }
    
    for (const [tableName, rows] of Object.entries(data)) {
      if (!Array.isArray(rows) || rows.length === 0) continue
      const table = (schema as any)[tableName]
      if (!table || !('dbName' in table)) continue
      
      for (const row of rows) {
        if (typeof row !== 'object' || row === null) continue
        try {
          await db.insert(table).values(row).onConflictDoNothing()
          imported++
        } catch (err) {
          console.error(`Backup import row error in ${tableName}:`, err)
        }
      }
    }
    
    return c.json({ ok: true, imported })
  } catch (err) {
    console.error('Backup import error:', err)
    return c.json({ error: '导入失败' }, 500)
  }
})

export default backup