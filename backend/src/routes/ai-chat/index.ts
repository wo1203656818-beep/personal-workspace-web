import { Hono } from 'hono'
import type { Context } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../../schema'
import type { Env } from '../../types'
import { ensureChatTables } from '../../ai-configs'
import { chatCompletion, chatSafetyFallback } from './completion'
import { executeChatTool } from './handlers'
import { CHAT_TOOLS } from './tools'
import {
  buildChatCtx,
  buildChatSystem,
  resolveChatSession,
  loadChatHistory,
  insertChatMessage,
  truncateHistory,
  sessions,
} from './sessions'

const aiChat = new Hono<{ Bindings: Env }>()

aiChat.route('/sessions', sessions)

aiChat.post('/', async (c) => {
  let body: any
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'body 解析失败' }, 400)
  }
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return c.json({ error: 'message 必填' }, 400)
  const sessionId = typeof body?.sessionId === 'string' && body.sessionId ? body.sessionId : null
  const deepThink = !!body?.deepThink
  const webSearch = !!body?.webSearch
  const systemPrompt =
    typeof body?.systemPrompt === 'string' ? body.systemPrompt.slice(0, 2000) : ''
  const role = typeof body?.role === 'string' ? body.role : ''
  const images = Array.isArray(body?.images)
    ? body.images.filter((x: any) => typeof x === 'string' && x.startsWith('data:')).slice(0, 4)
    : []

  const db = drizzle(c.env.DB, { schema })
  await ensureChatTables(c.env.DB)

  const session = await resolveChatSession(db, sessionId, message)
  const history = await loadChatHistory(db, session.id)

  const ctx = await buildChatCtx(db)

  c.header('Content-Type', 'text/event-stream')
  c.header('Cache-Control', 'no-cache, no-transform')
  c.header('Connection', 'keep-alive')
  c.header('X-Accel-Buffering', 'no')

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
        } catch {}
      }
      try {
        await streamChat(c, db, {
          message,
          sessionId: session.id,
          history,
          deepThink,
          systemPrompt,
          role,
          images,
          webSearch,
          ctx,
          send,
        })
      } catch (e: any) {
        console.error('[ai/chat] 执行失败:', e)
        send({ type: 'error', message: '出错了，请稍后再试。' })
      } finally {
        try {
          controller.close()
        } catch {}
      }
    },
  })
  return c.body(stream)
})

async function streamChat(
  c: Context<{ Bindings: Env }>,
  db: any,
  opts: {
    message: string
    sessionId: string
    history: { role: string; content: string }[]
    ctx: any
    send: (o: any) => void
    deepThink?: boolean
    webSearch?: boolean
    systemPrompt?: string
    role?: string
    images?: string[]
  },
): Promise<void> {
  const {
    message,
    sessionId,
    history,
    ctx,
    send,
    deepThink,
    webSearch,
    systemPrompt,
    role,
    images,
  } = opts
  await insertChatMessage(db, sessionId, 'user', message, null)

  const system = buildChatSystem(ctx, { systemPrompt, role })
  const trimmedHistory = truncateHistory(history, 4000)
  const messages: any[] = [{ role: 'system', content: system }]
  for (const h of trimmedHistory) {
    if (h.role === 'user') messages.push({ role: 'user', content: h.content })
    else if (h.role === 'assistant') messages.push({ role: 'assistant', content: h.content || ' ' })
  }
  const hints: string[] = []
  if (deepThink)
    hints.push('用户已开启「深度思考」，请先分步推理再作答，复杂问题要拆解方案并权衡。')
  if (webSearch)
    hints.push('用户已开启「联网搜索」，请优先使用 web_search 工具获取最新信息再回答。')
  messages.push({
    role: 'user',
    content: hints.length ? `${message}\n\n（系统提示：${hints.join('')}）` : message,
  })

  let finalReply = ''
  let action: any = null
  let refresh = false

  try {
    // 工具调用循环：检测 toolCalls → 执行 → 把结果回填给 AI → 再生成，最多 5 轮
    for (let i = 0; i < 5; i++) {
      const result = await chatCompletion(c, messages, {
        stream: true,
        deepThink,
        images,
        tools: CHAT_TOOLS,
        onText: (t) => send({ type: 'delta', text: t }),
        onReasoning: (t) => send({ type: 'reasoning', text: t }),
      })

      if (result.toolCalls && result.toolCalls.length) {
        // 有工具调用：执行工具并把结果追加到消息列表
        for (const tc of result.toolCalls) {
          const callId = tc.id || tc.name
          try {
            const toolResult = await executeChatTool(c, db, tc.name, tc.args, ctx)
            send({ type: 'tool', name: tc.name, observation: toolResult.observation })
            if (toolResult.sources) send({ type: 'sources', sources: toolResult.sources })
            if (toolResult.action) action = toolResult.action
            if (toolResult.refresh) refresh = true
            messages.push({
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: callId,
                  type: 'function',
                  function: { name: tc.name, arguments: JSON.stringify(tc.args) },
                },
              ],
            })
            messages.push({
              role: 'tool',
              tool_call_id: callId,
              name: tc.name,
              content: toolResult.observation,
            })
          } catch (e: any) {
            const errMsg = `工具执行失败: ${e?.message || '未知错误'}`
            messages.push({ role: 'tool', tool_call_id: callId, name: tc.name, content: errMsg })
          }
        }
        continue // 让 AI 基于工具结果继续生成
      }

      // 无工具调用：拿到最终回复
      finalReply = result.content?.trim() || '好的。'
      break
    }
    if (!finalReply) finalReply = '好的。'
  } catch (e: any) {
    const fb = chatSafetyFallback(message)
    if (fb) {
      finalReply = fb.reply
      action = fb.action
      await insertChatMessage(db, sessionId, 'assistant', finalReply, null)
      send({ type: 'done', reply: finalReply, refresh, action, sessionId })
      return
    }
    finalReply = 'AI 暂时不可用，请稍后再试。'
  }

  await insertChatMessage(db, sessionId, 'assistant', finalReply, null)
  send({ type: 'done', reply: finalReply, refresh, action, sessionId })
}

export { buildChatCtx, buildChatSystem, chatCompletion, executeChatTool, CHAT_TOOLS }

export default aiChat
