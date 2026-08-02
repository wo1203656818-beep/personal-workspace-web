import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, or, like, desc, inArray } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '../schema'
import type { Env } from '../types'
import { callAI } from '../utils/ai-client'
import { embedText, indexTarget } from '../utils/vectorize'

type VectorizeMatch = { id: string; score?: number; metadata?: Record<string, any> | null }

const kbImportSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().max(100_000).default(''),
  fileType: z.string().max(20).default('unknown'),
  fileSize: z.number().max(100_000_000).default(0),
})

const kbAskSchema = z.object({ question: z.string().min(1).max(2000) })

const kbGlobalAskSchema = z.object({
  question: z.string().min(1).max(2000),
  topK: z.number().min(1).max(20).default(5),
})

const kb = new Hono<{ Bindings: Env }>()

// 运行时确保 KB 表增强列存在（避免依赖迁移部署连通性）
async function ensureKbTables(dbRaw: any): Promise<void> {
  const alters = [
    `ALTER TABLE kb_documents ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE kb_documents ADD COLUMN ai_summary TEXT`,
  ]
  for (const sql of alters) {
    try {
      await dbRaw.prepare(sql).run()
    } catch {}
  }
}

kb.get('/', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10) || 20, 100)
    const rows = await db
      .select()
      .from(schema.kbDocuments)
      .orderBy(desc(schema.kbDocuments.updatedAt))
      .limit(limit)
    return c.json(rows)
  } catch (e: any) {
    console.error('[kb] list failed:', e?.message, e?.cause)
    return c.json({ error: e.message || '查询知识库失败', detail: e.cause?.message }, 500)
  }
})

// 知识库摘要列表：排除 content 大字段
kb.get('/summary', async (c) => {
  try {
    await ensureKbTables(c.env.DB)
    const db = drizzle(c.env.DB, { schema })
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 200)
    const rows = await db
      .select({
        id: schema.kbDocuments.id,
        title: schema.kbDocuments.title,
        fileType: schema.kbDocuments.fileType,
        fileSize: schema.kbDocuments.fileSize,
        r2Key: schema.kbDocuments.r2Key,
        isStarred: schema.kbDocuments.isStarred,
        importedAt: schema.kbDocuments.importedAt,
        updatedAt: schema.kbDocuments.updatedAt,
      })
      .from(schema.kbDocuments)
      .orderBy(desc(schema.kbDocuments.isStarred), desc(schema.kbDocuments.updatedAt))
      .limit(limit)
    return c.json(rows)
  } catch (e: any) {
    console.error('[kb] summary failed:', e?.message, e?.cause)
    return c.json({ error: e.message || '查询知识库失败', detail: e.cause?.message }, 500)
  }
})

// 搜索知识库
kb.get('/search', async (c) => {
  const q = c.req.query('q') || ''
  if (!q) return c.json([])
  const db = drizzle(c.env.DB, { schema })
  const result = await db
    .select()
    .from(schema.kbDocuments)
    .where(or(like(schema.kbDocuments.title, `%${q}%`), like(schema.kbDocuments.content, `%${q}%`)))
  return c.json(result)
})

kb.get('/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const doc = await db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  if (!doc.length) return c.json({ error: '未找到' }, 404)
  return c.json(doc[0])
})

// 切换星标收藏
kb.post('/:id/star', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const doc = await db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  if (!doc.length) return c.json({ error: '未找到' }, 404)
  const next = !doc[0].isStarred
  await db
    .update(schema.kbDocuments)
    .set({ isStarred: next, updatedAt: new Date().toISOString() })
    .where(eq(schema.kbDocuments.id, id))
  return c.json({ ok: true, isStarred: next })
})

// AI 总结知识库文档（已缓存则直接返回）
kb.post('/:id/summary', async (c) => {
  const { id } = c.req.param()
  await ensureKbTables(c.env.DB)
  const db = drizzle(c.env.DB, { schema })
  const doc = await db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  if (!doc.length) return c.json({ error: '未找到' }, 404)
  // 命中缓存直接返回
  if (doc[0].aiSummary) {
    return c.json({ summary: doc[0].aiSummary, cached: true })
  }
  const content = (doc[0].content || '').slice(0, 8000)
  if (!content.trim()) {
    return c.json({ error: '该文档暂无可用正文，无法总结' }, 400)
  }
  try {
    const summary = await callAI(
      c.env,
      [
        {
          role: 'system',
          content: '你是文档总结助手。用 3 句话以内总结以下文档的核心内容，中文输出，不要分段。',
        },
        { role: 'user', content: `文档标题：${doc[0].title}\n\n${content}` },
      ],
      { maxTokens: 400 },
    )
    const trimmed = summary.trim()
    // 写入缓存
    await db
      .update(schema.kbDocuments)
      .set({ aiSummary: trimmed, updatedAt: new Date().toISOString() })
      .where(eq(schema.kbDocuments.id, id))
    return c.json({ summary: trimmed, cached: false })
  } catch (e: any) {
    console.error('[kb/summary] error:', e)
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// 向知识库文档提问
kb.post('/:id/ask', async (c) => {
  const { id } = c.req.param()
  const { question } = kbAskSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })
  const doc = await db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  if (!doc.length) return c.json({ error: '未找到' }, 404)
  const content = (doc[0].content || '').slice(0, 6000)
  if (!content.trim()) {
    return c.json({ error: '该文档暂无可用正文，无法问答' }, 400)
  }
  try {
    const answer = await callAI(
      c.env,
      [
        {
          role: 'system',
          content:
            '你是文档问答助手。请严格基于以下文档内容回答问题，如果文档中没有相关信息，请明确说明。',
        },
        {
          role: 'user',
          content: `文档标题：${doc[0].title}\n\n文档内容：\n${content}\n\n问题：${question.trim()}`,
        },
      ],
      { maxTokens: 500 },
    )
    return c.json({ answer: answer.trim() })
  } catch (e: any) {
    console.error('[kb/ask] error:', e)
    return c.json({ error: 'AI 调用失败，请检查 AI 配置或稍后重试' }, 500)
  }
})

// 跨文档知识库问答（RAG）
kb.post('/ask', async (c) => {
  try {
    const { question, topK } = kbGlobalAskSchema.parse(await c.req.json())

    const db = drizzle(c.env.DB, { schema })
    const fetchK = Math.min(topK * 3, 20)

    // 1. 使用 Vectorize 语义检索
    let matches: VectorizeMatch[] = []
    try {
      const qVec = await embedText(c, question.trim())
      const queryResult = await c.env.VECTORIZE.query(qVec, { topK: fetchK, returnMetadata: 'all' })
      matches = (queryResult.matches || []).filter((m) => {
        const meta = m.metadata as { type?: string } | null
        return meta?.type === 'kb'
      })
    } catch (e: any) {
      console.error('[kb/ask] vectorize error:', e?.message)
    }

    // 2. 从 matches 中提取匹配的知识库文档片段
    const kbIds = [
      ...new Set(
        matches.map((m) => (m.metadata as { targetId?: string })?.targetId).filter(Boolean),
      ),
    ] as string[]
    const kbDocs = kbIds.length
      ? await db
          .select({
            id: schema.kbDocuments.id,
            title: schema.kbDocuments.title,
            content: schema.kbDocuments.content,
          })
          .from(schema.kbDocuments)
          .where(inArray(schema.kbDocuments.id, kbIds))
      : []
    const docMap = new Map(kbDocs.map((d) => [d.id, d]))

    // 按 score 排序，拼接 context
    const sources: { title: string; snippet: string; score: number }[] = []
    const contextParts: string[] = []
    const sorted = matches.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, topK)
    for (const m of sorted) {
      const meta = m.metadata as { targetId?: string } | null
      const doc = meta?.targetId ? docMap.get(meta.targetId) : undefined
      if (!doc) continue
      const snippet = (doc.content || '').slice(0, 800)
      sources.push({ title: doc.title, snippet, score: m.score ?? 0 })
      contextParts.push(`【${doc.title}】\n${snippet}`)
    }

    if (contextParts.length === 0) {
      return c.json({
        answer: '未在知识库中找到相关内容，请尝试换个问题或先上传相关文档。',
        sources: [],
      })
    }

    const context = contextParts.join('\n\n---\n\n')
    // 3. 调用 AI 生成回答
    const answer = await callAI(
      c.env,
      [
        {
          role: 'system',
          content:
            '你是知识库问答助手。请严格基于以下知识库文档片段回答问题，如果文档中没有相关信息，请明确说明。回答时请引用文档来源。',
        },
        { role: 'user', content: `知识库文档片段：\n${context}\n\n问题：${question.trim()}` },
      ],
      { maxTokens: 800 },
    )

    return c.json({ answer: answer.trim(), sources })
  } catch (e: any) {
    console.error('[kb/ask-global] error:', e)
    return c.json({ error: '问答失败' }, 500)
  }
})

kb.post('/import', async (c) => {
  const { title, content, fileType, fileSize } = kbImportSchema.parse(await c.req.json())
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()
  await db.insert(schema.kbDocuments).values({ id, title, content, fileType, fileSize })
  // 增量嵌入 KB 文档
  await indexTarget(c, 'kb', id, `${title}\n${content || ''}`).catch((e) =>
    console.error('[embed] kb import failed:', e?.message),
  )
  return c.json({ id }, 201)
})

kb.delete('/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  // 先删除 D1 记录，再删 R2；若 R2 删除失败仅记录日志，避免应用层失败
  const doc = await db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  await db.delete(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  if (doc.length > 0) {
    // 删除 KB 文件本身的 R2 对象
    if (doc[0].r2Key) {
      try {
        await c.env.STORAGE.delete(doc[0].r2Key)
      } catch (e) {
        console.error('[kb] R2 删除失败:', doc[0].r2Key, e)
      }
    }
  }
  // 清理知识库向量嵌入
  await c.env.VECTORIZE.deleteByIds([`kb:${id}`]).catch((e) =>
    console.error('[embed] kb delete cleanup failed:', e?.message),
  )
  return c.json({ ok: true })
})

// 知识库文件上传到 R2
kb.post('/upload', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file'] as File
  if (!file) return c.json({ error: '未提供文件' }, 400)

  const title = (body['title'] as string) || file.name
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  const typeMap: Record<string, string> = {
    pdf: 'pdf',
    docx: 'docx',
    doc: 'docx',
    xlsx: 'xlsx',
    xls: 'xlsx',
    md: 'md',
    markdown: 'md',
    txt: 'txt',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    webp: 'image',
    gif: 'image',
  }
  const fileType = typeMap[ext] || 'unknown'

  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()
  const r2Key = `kb/${id}/${file.name}`

  // 上传到 R2
  await c.env.STORAGE.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  })

  // 对于 Markdown/TXT，同时存文本内容到 D1 以便直接预览；
  // 前端也可能对 PDF/DOCX 提取了正文并随表单传入
  let content = (body['content'] as string) || ''
  if (!content && (fileType === 'md' || fileType === 'txt')) {
    content = await file.text()
  }
  // 限制长度，避免 D1 单行过大
  const MAX_CONTENT = 30000
  if (content.length > MAX_CONTENT) content = content.slice(0, MAX_CONTENT)

  try {
    await db.insert(schema.kbDocuments).values({
      id,
      title,
      content,
      fileType,
      r2Key,
      fileSize: file.size,
    })
  } catch (e) {
    // D1 写入失败时回滚 R2，避免产生无引用的孤儿对象
    try {
      await c.env.STORAGE.delete(r2Key)
    } catch {}
    throw e
  }

  // 增量嵌入 KB 文档
  await indexTarget(c, 'kb', id, `${title}\n${content || ''}`).catch((e) =>
    console.error('[embed] kb upload failed:', e?.message),
  )

  return c.json({ id }, 201)
})

// 知识库文件下载（从 R2 读取）
kb.get('/:id/download', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  const doc = await db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.id, id))
  if (!doc.length) return c.json({ error: '未找到' }, 404)
  if (!doc[0].r2Key) return c.json({ error: '该文件无 R2 存储' }, 404)

  const object = await c.env.STORAGE.get(doc[0].r2Key)
  if (!object) return c.json({ error: 'R2 文件不存在' }, 404)

  const headers = new Headers()
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
  headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(doc[0].title)}"`)
  return new Response(object.body, { headers })
})

export default kb
