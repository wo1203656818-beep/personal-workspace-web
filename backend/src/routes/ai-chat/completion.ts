import type { Context } from 'hono'
import type { Env } from '../../types'
import { getActiveConfig, getConfigById, CF_MODELS } from '../../ai-configs'
import { TOOL_ACTION_MAP } from './tools'
import { fetchWithTimeout } from '../../utils/fetch-timeout'

interface ChatResult {
  content: string | null
  toolCalls: { name: string; args: any; id?: string }[] | null
  reasoning?: string
}

interface WebSearchResult {
  text: string
  sources: { title: string; url: string; snippet: string }[]
}

function resolveChatTool(name: string, args: any): string {
  const action = args && typeof args.action === 'string' ? args.action : ''
  return TOOL_ACTION_MAP[name]?.[action] || name
}

function safeParseJson(s: string): any {
  if (!s) return {}
  try {
    return JSON.parse(s)
  } catch {
    try {
      return JSON.parse(s.replace(/[\n\r]/g, ' '))
    } catch {
      return {}
    }
  }
}

async function chatCompletion(
  c: Context<{ Bindings: Env }>,
  messages: any[],
  opts: {
    tools?: any[]
    stream?: boolean
    onText?: (t: string) => void
    onReasoning?: (t: string) => void
    images?: string[]
    deepThink?: boolean
    configId?: string | null
  },
): Promise<ChatResult> {
  let cfg = await getActiveConfig(c.env)
  if (opts.configId && opts.configId !== 'default') {
    const picked = await getConfigById(c.env, opts.configId)
    if (picked) cfg = picked
  }
  if (!cfg) return chatCompletionCF(c, { model: CF_MODELS.DEFAULT }, messages, opts)
  if (cfg.type === 'openai') return chatCompletionOpenAI(cfg, messages, opts)
  return chatCompletionCF(c, cfg, messages, opts)
}

async function chatCompletionOpenAI(
  cfg: { baseUrl: string; apiKey: string; model: string },
  messages: any[],
  opts: {
    tools?: any[]
    stream?: boolean
    onText?: (t: string) => void
    onReasoning?: (t: string) => void
    images?: string[]
    deepThink?: boolean
  },
): Promise<ChatResult> {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`
  const body: any = { model: cfg.model || 'gpt-4o', messages, temperature: 0.7 }
  const isMimo = /xiaomimimo\.com/i.test(cfg.baseUrl)
  if (isMimo) body.thinking = { type: opts.deepThink ? 'enabled' : 'disabled' }
  if (opts.images && opts.images.length) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        messages[i] = {
          ...messages[i],
          content: [
            {
              type: 'text',
              text: typeof messages[i].content === 'string' ? messages[i].content : '',
            },
            ...opts.images.slice(0, 4).map((u) => ({ type: 'image_url', image_url: { url: u } })),
          ],
        }
        break
      }
    }
  }
  if (opts.tools && opts.tools.length) {
    body.tools = opts.tools
    body.tool_choice = 'auto'
  }
  if (opts.stream) body.stream = true

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`AI 请求失败 (HTTP ${res.status}): ${txt.slice(0, 200)}`)
  }

  if (opts.stream && res.body) {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let content = ''
    let reasoning = ''
    let sawTool = false
    const toolAcc: any[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const parts = buf.split('\n\n')
      buf = parts.pop() || ''
      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const json = JSON.parse(data)
          const delta = json.choices?.[0]?.delta
          if (!delta) continue
          if (delta.reasoning_content || delta.reasoning) {
            const rt = delta.reasoning_content || delta.reasoning
            reasoning += rt
            opts.onReasoning?.(rt)
          }
          if (delta.tool_calls) {
            sawTool = true
            for (const tc of delta.tool_calls) {
              const i = tc.index ?? toolAcc.length
              toolAcc[i] = toolAcc[i] || { id: '', name: '', args: '' }
              if (tc.id) toolAcc[i].id = tc.id
              if (tc.function?.name) toolAcc[i].name += tc.function.name
              if (tc.function?.arguments) toolAcc[i].args += tc.function.arguments
            }
          }
          if (delta.content && !sawTool) {
            content += delta.content
            opts.onText?.(delta.content)
          }
        } catch {}
      }
    }
    if (sawTool) {
      const toolCalls = toolAcc
        .filter(Boolean)
        .map((t) => ({ id: t.id || undefined, name: t.name, args: safeParseJson(t.args) }))
        .filter((t: any) => t.name)
      return {
        content: null,
        toolCalls: toolCalls.length ? toolCalls : null,
        reasoning: reasoning || undefined,
      }
    }
    return { content: content || null, toolCalls: null, reasoning: reasoning || undefined }
  }

  const data = (await res.json()) as any
  const msg = data.choices?.[0]?.message
  const toolCalls = (msg?.tool_calls || [])
    .map((tc: any) => ({
      id: tc.id || undefined,
      name: tc.function?.name,
      args: safeParseJson(tc.function?.arguments || '{}'),
    }))
    .filter((t: any) => t.name)
  return {
    content: msg?.content || null,
    toolCalls: toolCalls.length ? toolCalls : null,
    reasoning: msg?.reasoning_content || msg?.reasoning || undefined,
  }
}

async function chatCompletionCF(
  c: Context<{ Bindings: Env }>,
  cfg: { model: string },
  messages: any[],
  opts: {
    tools?: any[]
    stream?: boolean
    onText?: (t: string) => void
    onReasoning?: (t: string) => void
    images?: string[]
    deepThink?: boolean
  },
): Promise<ChatResult> {
  const model = cfg.model || CF_MODELS.DEFAULT
  const body: any = { messages, max_tokens: 2048 }
  if (opts.tools && opts.tools.length) body.tools = opts.tools
  if (opts.stream) body.stream = true
  const parse = (response: any): ChatResult => {
    const r = response as any
    const msg = r?.response?.choices?.[0]?.message ?? r?.choices?.[0]?.message ?? r?.message
    if (msg) {
      const content = msg.content ?? null
      const toolCalls = (msg.tool_calls || [])
        .map((tc: any) => ({
          name: tc.function?.name,
          args: safeParseJson(tc.function?.arguments || '{}'),
        }))
        .filter((t: any) => t.name)
      return { content, toolCalls: toolCalls.length ? toolCalls : null }
    }
    if (typeof r === 'string') return { content: r, toolCalls: null }
    return {
      content: r?.response?.response || r?.result?.response || r?.output || null,
      toolCalls: null,
    }
  }
  try {
    const response: any = await c.env.AI.run(model, body)
    // 流式：Workers AI 返回 ReadableStream，chunk 为 SSE 格式 data: {"response":"..."}\n\n
    if (opts.stream && response instanceof ReadableStream) {
      const reader = response.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let content = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() || ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (!data || data === '[DONE]') continue
          try {
            const json = JSON.parse(data)
            const text = json.response || json.delta || ''
            if (text) {
              content += text
              opts.onText?.(text)
            }
          } catch {}
        }
      }
      return { content: content || null, toolCalls: null }
    }
    return parse(response)
  } catch (e: any) {
    const detail = (e?.message || '').toLowerCase()
    // CF 部分模型不支持 function calling：带 tools 报错时自动降级为不带 tools 重试
    const toolsUnsupported =
      opts.tools && opts.tools.length && /tool|function|unsupported|invalid/.test(detail)
    if (toolsUnsupported) {
      const fallbackBody = { ...body }
      delete fallbackBody.tools
      return parse(await c.env.AI.run(model, fallbackBody))
    }
    const unavailable =
      /not found|not available|does not exist|unknown model|invalid model|not supported|503|504/.test(
        detail,
      )
    if (unavailable && model !== CF_MODELS.FALLBACK) {
      const fbBody = { ...body }
      delete fbBody.tools
      return parse(await c.env.AI.run(CF_MODELS.FALLBACK, fbBody))
    }
    throw new Error('AI 调用失败，请检查 AI 配置或稍后重试')
  }
}

function stripHtml(s: string): string {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeDdgUrl(href: string): string {
  const m = String(href).match(/[?&]uddg=([^&]+)/)
  if (m) {
    try {
      return decodeURIComponent(m[1])
    } catch {}
  }
  if (href.startsWith('//')) return 'https:' + href
  if (href.startsWith('/')) return 'https://html.duckduckgo.com' + href
  return href
}

async function webSearch(query: string, env: any): Promise<WebSearchResult> {
  const q = String(query || '').trim()
  if (!q) return { text: 'web_search 缺少 query', sources: [] }
  try {
    let items: { title: string; url: string; snippet: string }[] = []
    const key = env?.TAVILY_API_KEY
    if (key && typeof key === 'string' && key.length > 0) {
      try {
        const r = await fetchWithTimeout(
          'https://api.tavily.com/search',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: key, query: q, max_results: 5, search_depth: 'basic' }),
          },
          8000,
        )
        if (r.ok) {
          const j: any = await r.json().catch(() => null)
          items = (j?.results || []).map((x: any) => ({
            title: x.title || '',
            url: x.url || '',
            snippet: String(x.content || '').slice(0, 280),
          }))
        }
      } catch {}
    }
    if (!items.length) {
      const r = await fetchWithTimeout(
        'https://html.duckduckgo.com/html/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          },
          body: `q=${encodeURIComponent(q)}`,
        },
        8000,
      )
      if (r.ok) {
        const html = await r.text()
        const matches = [
          ...html.matchAll(
            /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g,
          ),
        ]
        items = matches.slice(0, 5).map((m) => ({
          title: stripHtml(m[2]),
          url: decodeDdgUrl(m[1]),
          snippet: stripHtml(m[3]).slice(0, 280),
        }))
      }
    }
    if (!items.length)
      return {
        text: `联网搜索「${q}」暂未返回结果，可能是网络受限或该搜索引擎暂无索引。`,
        sources: [],
      }
    const list = items
      .map((it, i) => `${i + 1}. ${it.title}\n   ${it.url}\n   ${it.snippet}`)
      .join('\n\n')
    return {
      text: `联网搜索「${q}」结果（共 ${items.length} 条，来自网络）：\n${list}\n\n请基于以上资料回答，并尽量标注信息来源。`,
      sources: items,
    }
  } catch (e: any) {
    return { text: `联网搜索「${q}」失败：${e?.message || '未知错误'}`, sources: [] }
  }
}

function chatSafetyFallback(
  message: string,
): { reply: string; refresh: boolean; action: any } | null {
  const m = message.toLowerCase()
  if (/(暗色|深色|黑暗|dark)/.test(m))
    return { reply: '已切换到暗色模式', refresh: false, action: { type: 'theme', payload: 'dark' } }
  if (/(亮色|浅色|明亮|light)/.test(m))
    return {
      reply: '已切换到亮色模式',
      refresh: false,
      action: { type: 'theme', payload: 'light' },
    }
  if (/(系统模式|跟随系统|system)/.test(m))
    return {
      reply: '已切换为跟随系统',
      refresh: false,
      action: { type: 'theme', payload: 'system' },
    }
  const nav: [RegExp, string, string][] = [
    [/去.*分析|打开分析|分析页/, '/analysis', '分析页'],
    [/去.*笔记|打开笔记|笔记页/, '/notes', '笔记'],
    [/去.*知识|打开知识|知识库/, '/knowledge', '知识库'],
    [/去.*任务|打开任务|待办/, '/tasks', '任务'],
    [/去.*工具|打开工具|决策/, '/tools', '工具'],
    [/去.*搜索|打开搜/, '/search', '搜索'],
    [/去.*设置|打开设置/, '/settings', '设置'],
    [/去.*首页|回首页|仪表盘/, '/', '首页'],
  ]
  for (const [re, path, name] of nav) {
    if (re.test(message))
      return {
        reply: `正在前往${name}…`,
        refresh: false,
        action: { type: 'navigate', payload: path },
      }
  }
  return null
}

export {
  ChatResult,
  WebSearchResult,
  resolveChatTool,
  safeParseJson,
  chatCompletion,
  chatCompletionOpenAI,
  chatCompletionCF,
  webSearch,
  chatSafetyFallback,
}
