import type { Env } from '../types'
import { getActiveConfig, CF_MODELS } from '../ai-configs'

const extractWorkersAIResponse = (response: any): string => {
  if (typeof response === 'string') return response
  const r = response as any
  if (r.choices?.[0]?.message?.content) return String(r.choices[0].message.content)
  if (typeof r.response === 'string') return r.response
  if (r.response !== undefined) return JSON.stringify(r.response)
  if (r.result?.response) return String(r.result.response)
  if (r.output) return typeof r.output === 'string' ? r.output : JSON.stringify(r.output)
  return JSON.stringify(response)
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function callOpenAI(
  env: Env,
  config: { baseUrl: string; apiKey: string; model: string },
  messages: { role: string; content: string }[],
  maxTokens: number,
  timeoutMs: number,
): Promise<string> {
  if (!config.baseUrl || !config.apiKey) throw new Error('OpenAI 配置缺少 Base URL 或 API Key')
  const isMimo = /xiaomimimo\.com/i.test(config.baseUrl)
  const body: any = {
    model: config.model || 'gpt-4o',
    messages,
    max_tokens: maxTokens,
  }
  if (isMimo) body.thinking = { type: 'disabled' }

  const maxRetries = 2
  let lastError: any
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await withTimeout(
        fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }),
        timeoutMs,
        'openai',
      )
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        const isRetryable = /429|5\d{2}/.test(String(res.status))
        if (isRetryable && attempt < maxRetries) {
          const delay = Math.min(1000 * 2 ** attempt, 8000)
          await new Promise(r => setTimeout(r, delay))
          continue
        }
        throw new Error(`AI 请求失败 (HTTP ${res.status}): ${txt.slice(0, 200)}`)
      }
      const data = await res.json() as any
      const msg = data.choices?.[0]?.message
      const content = msg?.content || ''
      if (!content && msg?.reasoning_content && maxTokens < 4096) {
        const retryRes = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, max_tokens: 4096 }),
        })
        if (retryRes.ok) {
          const retryData = await retryRes.json() as any
          return retryData.choices?.[0]?.message?.content || ''
        }
      }
      return content
    } catch (e: any) {
      lastError = e
      const isRetryable = /timeout|network|fetch failed|429|5\d{2}/i.test(e?.message || '')
      if (!isRetryable || attempt === maxRetries) throw e
      const delay = Math.min(1000 * 2 ** attempt, 8000)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastError ?? new Error('AI 调用失败')
}

async function callWorkersAI(
  env: Env,
  model: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
  timeoutMs: number,
): Promise<string> {
  try {
    const response = await withTimeout(
      env.AI.run(model as any, { messages, max_tokens: maxTokens }),
      timeoutMs,
      'ai',
    )
    return extractWorkersAIResponse(response)
  } catch (aiErr: any) {
    const detail = (aiErr?.message || aiErr?.toString() || JSON.stringify(aiErr)).toLowerCase()
    const isModelUnavailable = /model not found|not available|does not exist|unknown model|invalid model|not supported|503|504|ai_timeout/.test(detail)
    if (isModelUnavailable && model !== CF_MODELS.FALLBACK) {
      try {
        const response = await withTimeout(
          env.AI.run(CF_MODELS.FALLBACK, { messages, max_tokens: maxTokens }),
          timeoutMs,
          'ai_fallback',
        )
        return extractWorkersAIResponse(response)
      } catch {
        throw new Error('AI 调用失败，请检查 AI 配置或稍后重试')
      }
    }
    throw new Error(detail.includes('ai_timeout') ? 'AI 调用超时' : 'AI 调用失败，请检查 AI 配置或稍后重试')
  }
}

export interface CallAIOptions {
  maxTokens?: number
  timeoutMs?: number
}

export async function callAI(
  env: Env,
  messages: { role: string; content: string }[],
  opts: CallAIOptions = {},
): Promise<string> {
  const maxTokens = opts.maxTokens ?? 512
  const timeoutMs = opts.timeoutMs ?? 30000

  const cfg = await getActiveConfig(env)

  if (cfg?.type === 'openai') {
    return callOpenAI(env, cfg, messages, maxTokens, timeoutMs)
  }

  const cfModel = cfg?.model || CF_MODELS.DEFAULT
  return callWorkersAI(env, cfModel, messages, maxTokens, timeoutMs)
}
