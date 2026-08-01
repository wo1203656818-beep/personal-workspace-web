export type ToolCall = {
  name: string
  observation: string
}

export type Source = {
  title: string
  url: string
}

export type Msg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  pending?: boolean
  tools?: ToolCall[]
  sources?: Source[]
}

// 把模型以 <think>...</think> 内联输出的思考过程抽出来（兼容 Qwen 等把思考写进正文的模型）
export function splitThink(raw: string): { think: string; rest: string } {
  const start = raw.indexOf('<think>')
  const end = raw.indexOf('</think>')
  if (start === -1 || end === -1 || end < start) return { think: '', rest: raw }
  const think = raw.slice(start + '<think>'.length, end).trim()
  const rest = (raw.slice(0, start) + raw.slice(end + '</think>'.length)).trim()
  return { think, rest }
}

export function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// 跨开/关持久化（Sheet 关闭会卸载内容，用模块级变量保留当前会话）
export const sessionStore: {
  sessionId: string | null
  messages: Msg[]
  deepThink: boolean
  webSearch: boolean
} = {
  sessionId: null,
  messages: [],
  deepThink: false,
  webSearch: false,
}
