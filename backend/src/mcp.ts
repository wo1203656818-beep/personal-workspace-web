import { z } from 'zod'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'
import type { Env } from './types'
import { verify } from 'hono/jwt'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createMcpHandler } from 'agents/mcp'
import { buildChatCtx, executeChatTool, CHAT_TOOLS } from './routes/ai-chat'

function jsonSchemaToZodShape(schemaJson: any): Record<string, any> {
  const shape: Record<string, any> = {}
  const props = schemaJson?.properties || {}
  const required: string[] = schemaJson?.required || []
  for (const [key, def] of Object.entries(props)) {
    const d = def as any
    let zType: any
    if (d.type === 'boolean') zType = z.boolean()
    else if (d.type === 'number' || d.type === 'integer') zType = z.number()
    else if (Array.isArray(d.enum) && d.enum.length) zType = z.enum(d.enum as [string, ...string[]])
    else zType = z.string()
    if (d.description) zType = zType.describe(d.description)
    if (!required.includes(key)) zType = zType.optional()
    shape[key] = zType
  }
  return shape
}

function createMcpServer(env: Env): McpServer {
  const server = new McpServer({ name: 'Workbench MCP', version: '1.0.0' })
  const db = drizzle(env.DB, { schema })
  for (const t of CHAT_TOOLS) {
    const fn = t.function
    server.registerTool(
      fn.name,
      { description: fn.description, inputSchema: jsonSchemaToZodShape(fn.parameters) },
      async (args: any) => {
        try {
          const ctx = await buildChatCtx(db)
          const r = await executeChatTool({ env } as any, db, fn.name, args, ctx)
          return { content: [{ type: 'text' as const, text: r.observation }] }
        } catch (e: any) {
          return { content: [{ type: 'text' as const, text: `工具 ${fn.name} 执行失败：${String(e?.message || e).slice(0, 200)}` }], isError: true }
        }
      }
    )
  }
  return server
}

export async function verifyMcpAuth(request: Request, env: Env): Promise<boolean> {
  try {
    const mcpToken = request.headers.get('x-mcp-token')
    if (mcpToken && env.MCP_TOKEN && mcpToken === env.MCP_TOKEN) return true
    // 也支持 URL 里带 token（方便只接受 URL 的 MCP 客户端，如 LobeChat 一键连接）
    const qToken = new URL(request.url).searchParams.get('mcp_token') || new URL(request.url).searchParams.get('token')
    if (qToken && env.MCP_TOKEN && qToken === env.MCP_TOKEN) return true
    const auth = request.headers.get('authorization') || ''
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (m && env.JWT_SECRET) {
      await verify(m[1], env.JWT_SECRET, 'HS256')
      return true
    }
  } catch {}
  return false
}

export function handleMcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  return createMcpHandler(createMcpServer(env) as any)(request, env as any, ctx)
}
