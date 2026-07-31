import { Hono } from 'hono'
import type { Context } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, desc, asc, sql } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { decrypt } from '../crypto-utils'
import { todayCST } from '../time'
import {
  buildChatCtx,
  buildChatSystem,
  chatCompletion,
  executeChatTool,
  CHAT_TOOLS,
} from './ai-chat'

const telegram = new Hono<{ Bindings: Env }>()

// 读取 Telegram 配置（token 解密）
async function getTelegramConfig(
  env: Env,
): Promise<{ botToken: string | null; chatId: string | null }> {
  const db = drizzle(env.DB, { schema })
  const tokenRow = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'telegram_bot_token'))
  const chatRow = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'telegram_chat_id'))
  const botToken = tokenRow[0]?.value ? await decrypt(env.JWT_SECRET, tokenRow[0].value) : null
  return { botToken, chatId: chatRow[0]?.value || null }
}

// webhook secret：从 JWT_SECRET 派生（HMAC-SHA256 hex），Telegram 回调会带
// X-Telegram-Bot-Api-Secret-Token 头，用于防伪造请求
let tgSecretCache: string | null = null
async function telegramWebhookSecret(env: Env): Promise<string> {
  if (tgSecretCache) return tgSecretCache
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(env.JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('telegram-webhook'))
  tgSecretCache = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return tgSecretCache
}

// 发送 Telegram 消息：纯文本（不用 parse_mode，避免 AI 输出含 <、_ 等字符导致 400 静默失败）、
// 超长自动分段（Telegram 单条上限 4096 字符）、失败打日志
async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<boolean> {
  const t = (text || '').trim() || '（空回复）'
  const chunks: string[] = []
  for (let i = 0; i < t.length && chunks.length < 5; i += 3800) chunks.push(t.slice(i, i + 3800))
  let allOk = true
  for (const chunk of chunks) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
      })
      if (!res.ok) {
        allOk = false
        console.error(
          '[telegram] sendMessage failed:',
          res.status,
          await res.text().catch(() => ''),
        )
      }
    } catch (e: any) {
      allOk = false
      console.error('[telegram] sendMessage network error:', e.message)
    }
  }
  return allOk
}

// 自然语言消息 → AI 管家（复用聊天工具集，多轮工具循环，非流式）
async function telegramAIReply(c: Context<{ Bindings: Env }>, text: string): Promise<string> {
  const db = drizzle(c.env.DB, { schema })
  const ctx = await buildChatCtx(db)
  const system =
    buildChatSystem(ctx) +
    '\n当前通过 Telegram 对话：回复必须是纯文本（禁用 Markdown/HTML 格式符号），尽量简短直接。'
  const messages: any[] = [
    { role: 'system', content: system },
    { role: 'user', content: text },
  ]
  for (let round = 0; round < 4; round++) {
    const result = await chatCompletion(c, messages, { tools: CHAT_TOOLS })
    if (result.toolCalls?.length) {
      const toolCalls = result.toolCalls.map((tc, i) => ({
        id: tc.id || `call_${round}_${i}`,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
      }))
      const assistantMsg: any = {
        role: 'assistant',
        content: result.content || null,
        tool_calls: toolCalls,
      }
      if (result.reasoning) assistantMsg.reasoning_content = result.reasoning
      messages.push(assistantMsg)
      for (let i = 0; i < result.toolCalls.length; i++) {
        const tc = result.toolCalls[i]
        let observation = ''
        try {
          const r = await executeChatTool(c, db, tc.name, tc.args || {}, ctx)
          observation = r.observation
        } catch (e: any) {
          observation = `工具执行失败: ${e.message}`
        }
        messages.push({ role: 'tool', tool_call_id: toolCalls[i].id, content: observation })
      }
      continue
    }
    return result.content?.trim() || '好的。'
  }
  return '操作步骤过多，已中止。请把请求拆小一点再试。'
}

// Telegram 入站消息处理（在 waitUntil 中异步执行，webhook 已先回 200）
async function handleTelegramUpdate(c: Context<{ Bindings: Env }>, body: any): Promise<void> {
  try {
    const message = body?.message
    if (!message?.text) return

    const { botToken, chatId: configChatId } = await getTelegramConfig(c.env)
    // 未完成配置（token 或 chatId 缺失）一律不响应，杜绝匿名会话驱动系统
    if (!botToken || !configChatId) return

    const chatId = String(message.chat.id)
    if (chatId !== configChatId) return

    const db = drizzle(c.env.DB, { schema })
    const text = String(message.text).trim()
    let reply = ''

    if (text === '/start' || text === '/help') {
      reply =
        '📋 可用命令：\n/tasks - 查看待办\n/news - 最新资讯\n/add <标题> - 快速添加任务\n/digest - 今日简报\n/help - 帮助\n\n也可以直接打字和我对话：我是你的 AI 管家，能建任务、记笔记、查知识库、联网搜索。'
    } else if (text === '/tasks') {
      const tasks = await db
        .select({ title: schema.tasks.title, dueDate: schema.tasks.dueDate })
        .from(schema.tasks)
        .where(eq(schema.tasks.isCompleted, false))
        .orderBy(desc(schema.tasks.isImportant), asc(schema.tasks.sortOrder))
        .limit(10)
      if (tasks.length === 0) {
        reply = '🎉 没有待办任务！'
      } else {
        reply =
          '📋 待办任务：\n' +
          tasks
            .map((t, i) => `${i + 1}. ${t.title}${t.dueDate ? ` (${t.dueDate})` : ''}`)
            .join('\n')
      }
    } else if (text === '/news') {
      const items = await db
        .select({
          titleZh: schema.feedItems.titleZh,
          title: schema.feedItems.title,
          score: schema.feedItems.aiScore,
          url: schema.feedItems.url,
        })
        .from(schema.feedItems)
        .where(sql`${schema.feedItems.aiScore} > 0`)
        .orderBy(desc(schema.feedItems.aiScore))
        .limit(5)
      if (items.length === 0) {
        reply = '📰 暂无新闻'
      } else {
        reply =
          '📰 最新资讯：\n' +
          items
            .map(
              (item, i) => `${i + 1}. ${item.titleZh || item.title} (${item.score}分)\n${item.url}`,
            )
            .join('\n\n')
      }
    } else if (text.startsWith('/add ')) {
      const title = text.slice(5).trim()
      if (!title) {
        reply = '请输入任务标题，例如：/add 买牛奶'
      } else {
        const lists = await db.select().from(schema.taskLists).limit(1)
        const listId = lists[0]?.id
        if (listId) {
          const id = crypto.randomUUID()
          await db
            .insert(schema.tasks)
            .values({ id, listId, title, isCompleted: false, sortOrder: 0 })
          reply = `✅ 已添加任务：${title}`
        } else {
          reply = '❌ 没有可用的任务列表'
        }
      }
    } else if (text === '/digest') {
      const today = todayCST()
      const brief = await db
        .select()
        .from(schema.dailyDigests)
        .where(eq(schema.dailyDigests.date, today))
        .limit(1)
      if (brief.length === 0) {
        reply = '📰 今日简报尚未生成'
      } else {
        const b = brief[0]
        const topItems = JSON.parse(b.topItems || '[]')
        reply =
          `📰 ${b.title}\n\n${b.overview || ''}\n\n` +
          topItems
            .slice(0, 5)
            .map((item: any, i: number) => `${i + 1}. ${item.title}\n${item.summary || ''}`)
            .join('\n\n')
      }
    } else if (text.startsWith('/')) {
      reply = '🤔 未识别的命令，输入 /help 查看可用命令，或直接打字与 AI 管家对话'
    } else {
      // 非命令：交给 AI 管家（先发 typing 状态，AI 处理可能要几秒）
      fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
      }).catch(() => {})
      try {
        reply = await telegramAIReply(c, text)
      } catch (e: any) {
        console.error('[telegram] AI reply error:', e)
        reply = '⚠️ AI 暂时不可用，请稍后再试。命令功能（/tasks /news /add /digest）不受影响。'
      }
    }

    await sendTelegramMessage(botToken, chatId, reply)
  } catch (e: any) {
    console.error('[telegram] handleTelegramUpdate error:', e)
  }
}

// Telegram Webhook 入口：验证 secret → 立即回 200 → waitUntil 异步处理
// （Telegram 要求 webhook 快速响应，否则会重试造成消息重复）
telegram.post('/webhook', async (c) => {
  try {
    const secret = await telegramWebhookSecret(c.env)
    const gotSecret = c.req.header('X-Telegram-Bot-Api-Secret-Token') || ''
    // 兼容旧注册（无 secret）：仅当来头带了 secret 且不匹配时拒绝；
    // 未带 secret 的请求仍受 chatId 白名单约束（handleTelegramUpdate 内）
    if (gotSecret && gotSecret !== secret) return c.json({ ok: true })

    const body = await c.req.json().catch(() => null)
    if (!body) return c.json({ ok: true })

    c.executionCtx.waitUntil(handleTelegramUpdate(c, body))
    return c.json({ ok: true })
  } catch (e: any) {
    console.error('[telegram/webhook] error:', e)
    return c.json({ ok: true })
  }
})

// 设置 Telegram Webhook（绑定双向互通）
telegram.post('/set-webhook', async (c) => {
  const { botToken } = await getTelegramConfig(c.env)
  if (!botToken) return c.json({ ok: false, error: 'Telegram Bot Token 未配置' }, 400)

  // 关键：webhook 必须注册到 Telegram 服务器可直达的域名。
  // 自定义域名有 Cloudflare Access 会拦截 Telegram 回调（302 到登录页），
  // 所以优先用 PUBLIC_API_BASE（workers.dev），仅在未配置时退回请求 origin。
  const baseUrl = (c.env.PUBLIC_API_BASE || '').replace(/\/$/, '') || new URL(c.req.url).origin
  const webhookUrl = `${baseUrl}/api/telegram/webhook`
  const secret = await telegramWebhookSecret(c.env)

  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['message'],
      drop_pending_updates: true,
    }),
  })
  const result = (await res.json()) as any
  if (!result?.ok) {
    return c.json(
      { ok: false, error: result?.description || 'setWebhook 失败', url: webhookUrl },
      502,
    )
  }

  // 顺带注册命令菜单（失败不影响主流程）
  await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands: [
        { command: 'tasks', description: '查看待办任务' },
        { command: 'add', description: '快速添加任务：/add 标题' },
        { command: 'news', description: '最新资讯' },
        { command: 'digest', description: '今日简报' },
        { command: 'help', description: '帮助' },
      ],
    }),
  }).catch(() => {})

  return c.json({ ok: true, url: webhookUrl })
})

// 查询 Telegram Webhook 绑定状态（诊断双向链路）
telegram.get('/webhook-info', async (c) => {
  const { botToken, chatId } = await getTelegramConfig(c.env)
  if (!botToken) return c.json({ ok: false, error: 'Telegram Bot Token 未配置' }, 400)
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
    const data = (await res.json()) as any
    const info = data?.result || {}
    const expectedBase = (c.env.PUBLIC_API_BASE || '').replace(/\/$/, '')
    return c.json({
      ok: true,
      bound: !!info.url,
      url: info.url || '',
      // webhook 指向了非预期域名（如被 Access 保护的自定义域名）时给出警告
      urlMismatch: !!info.url && !!expectedBase && !info.url.startsWith(expectedBase),
      pendingUpdateCount: info.pending_update_count || 0,
      lastErrorDate: info.last_error_date || null,
      lastErrorMessage: info.last_error_message || null,
      chatIdConfigured: !!chatId,
    })
  } catch (e: any) {
    return c.json({ ok: false, error: `查询失败: ${e.message}` }, 502)
  }
})

export default telegram
