// 聊天导出工具：复制为 Markdown / 导出 .md 文件 / 导出 PDF
export interface ExportMsg {
  role: 'user' | 'assistant'
  content: string
  tools?: { name: string; observation: string }[]
  reasoning?: string
}

function toMarkdown(messages: ExportMsg[]): string {
  return messages
    .filter((m) => m.content || (m.tools && m.tools.length))
    .map((m) => {
      const who = m.role === 'user' ? '你' : 'AI 助手'
      const parts: string[] = [`### ${who}`, '']
      if (m.reasoning) parts.push(`> 思考：${m.reasoning}`, '')
      if (m.content) parts.push(m.content, '')
      if (m.tools && m.tools.length) {
        parts.push('**操作：**')
        for (const t of m.tools) parts.push(`- ${t.name}：${t.observation}`)
        parts.push('')
      }
      return parts.join('\n')
    })
    .join('\n')
}

export async function copyChatAsMarkdown(messages: ExportMsg[]): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(toMarkdown(messages))
    return true
  } catch {
    return false
  }
}

export function downloadChatMarkdown(messages: ExportMsg[], filename = '会话记录'): void {
  const md = toMarkdown(messages)
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.md`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function exportChatPdf(messages: ExportMsg[], title = '会话记录'): void {
  const md = toMarkdown(messages)
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:32px;color:#1a1a1a;line-height:1.7;}
  h1{font-size:20px;margin:0 0 16px;}
  h3{margin:24px 0 8px;font-size:15px;color:#2563eb;}
  pre{white-space:pre-wrap;word-break:break-word;background:#f6f8fa;padding:12px;border-radius:6px;}
  blockquote{color:#666;border-left:3px solid #ddd;margin:0;padding-left:12px;}
  @media print{body{padding:0;}}
</style></head><body><h1>${title}</h1><pre>${escapeHtml(md)}</pre></body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 300)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
