# AI 能力路线图（personal-workspace）

> 版本: v1.0 | 日期: 2026-07-23 | 模式: 嵌入式、按需、一次性调用
> 定位：本方案只补"摩擦点"的 AI 辅助，不做通用聊天 / 流式对话。

---

## 0. 设计原则与硬约束（来自你的偏好）

| 原则 | 含义 | 对方案的影响 |
|---|---|---|
| 嵌入式、按需 | AI 出现在功能发生的那个点，不是聊天面板 | 所有功能 = 按钮触发的一次性调用 |
| 省维护优先 | 能复用就复用，不引外部服务 | 复用 `callAI()`；向量检索用 D1 存，不接外部向量库 |
| 成本护栏 | 每功能设 token 上限，绝不开无上限对话 | 每个端点显式传 `max_tokens` |
| 国内访问便捷 | Cloudflare 免费档国内慢 | 避开流式逐字（每 token 过慢链路才卡）；只做"点一下出结果" |

**红线（不做）**：通用聊天机器人、联网搜索 Agent、多 Agent 编排、任何依赖稳定代理/外部网络的功能。

---

## 1. 现状盘点（已核对代码）

- 后端 `backend/src/index.ts` 中 `callAI(c, messages)` 是唯一 AI 入口，按 `settings`/`aiConfigs` 表选 Cloudflare 或自定义 OpenAI 兼容 API。
- 已有 AI 端点：`/api/ai/breakdown`（拆解子任务）、`/api/ai/analysis`（数据分析）、`/api/ai/weekly-report`（周报）、`/api/ai/coin/interpret`（硬币解读）。
- 前端仅 `TasksPage`（拆解按钮）与 `SettingsPage`（AI 配置）接了 AI；`NotesPage` / `KnowledgePage` **零 AI**。
- 数据表（`backend/src/schema.ts`）：
  - `imaNotes.content` = 完整 Markdown 全文 → 笔记 AI 辅助**零前置**即可做。
  - `kbDocuments.content` 对 PDF/DOCX 常为 `null`（只存元数据+r2Key）→ KB 语义检索**需先做文本抽取**。
  - `aiConfigs` 已支持多配置 + 默认，模型策略无需重构。

**缺口结论**：最该用 AI 的「笔记 / 知识库」目前完全没有辅助；任务无自然语言录入；全站无语义检索。

---

## 2. 路线图（按优先级）

### P0 — 高杠杆 / 低成本 / 立即做

- **P0-1 笔记 AI 辅助**：总结、提炼要点、转成任务。复用 `callAI`，零前置。
- **P0-2 任务自然语言录入**：输入框打"明天下午3点和医生开会" → 自动解析标题+时间。纯 prompt→JSON。

### P1 — 差异化 / 中等成本

- **P1-1 今日简报**：早上一次调用，拼「我的一天任务 + 近期笔记 + 本周概览」成一段摘要推送。
- **P1-2 跨模块语义检索（RAG-lite）**：在任务+笔记+知识库里做语义搜索。个人数据量小，向量存 D1，暴力余弦即可，**不引外部向量库**。这是相对 ima/ChatGPT 的唯一差异化能力。

### P2 — 可选 / 探索

- **P2-1 知识库问答**：依赖 P2-0（KB 文本抽取）前置。
- **P2-2 分析/周报增强**：根因解释（"为什么这周完成率低"）、简单预测。复用现有 `analysis` 端点。

### P2-0 前置任务（P1-2 / P2-1 依赖）

- 知识库导入管线补一步：PDF/DOCX 解析出的正文写入 `kbDocuments.content`（已有 `docx-preview`/`xlsx` 在前端，但后端入库时未存正文 → 需在导入 Worker 里用 `pdftotext` 思路或前端解析后回传）。

---

## 3. 每个功能的接口改动点（可执行）

> 统一约定：新增端点都走 `callAI`，并显式传 `maxTokens`。建议先给 `callAI` 加可选参数。

### 3.0 `callAI` 增加 maxTokens（所有功能共用）

```typescript
// backend/src/index.ts — 修改 callAI 签名
async function callAI(
  c: Context<{ Bindings: Env }>,
  messages: ChatMessage[],
  opts: { maxTokens?: number } = {}
): Promise<string> {
  // ... 选 provider 逻辑不变 ...
  const model = settingsMap.ai_model || '@cf/meta/llama-4-scout-17b-16k-instruct' // 改默认：用对话模型，不是 coder
  const response = await c.env.AI.run(model, {
    messages,
    max_tokens: opts.maxTokens ?? 512,
  })
  // ... 兼容解析不变 ...
}
```

> 默认模型从 `@cf/qwen/qwen2.5-coder-32b` 改成交互/对话模型（或保持自定义 API 默认 DeepSeek）。coder 模型不适合总结/解析。

### P0-1 笔记 AI 辅助

```typescript
// 新增：/api/ai/note-summary
app.post('/api/ai/note-summary', async (c) => {
  const { noteId, action } = await c.req.json() // action: 'summary' | 'points' | 'to-task'
  const db = drizzle(c.env.DB, { schema })
  const note = await db.select().from(schema.imaNotes).where(eq(schema.imaNotes.id, noteId)).get()
  if (!note) return c.json({ error: '笔记不存在' }, 404)

  const prompts: Record<string,string> = {
    summary: '用 3 句话总结以下笔记要点。',
    points:  '提取 5 条关键要点，每条一行，不要编号。',
    'to-task':'从笔记中提取可执行的待办事项，每行一个，不要编号。',
  }
  const text = await callAI(c, [
    { role: 'system', content: prompts[action] || prompts.summary },
    { role: 'user', content: note.content.slice(0, 8000) },
  ], { maxTokens: action === 'summary' ? 400 : 300 })
  return c.json({ result: text })
})
```

- **前端**：`NotesPage` 详情区加「总结 / 要点 / 转任务」三个按钮；转任务时把结果行批量 `POST /api/subtasks` 或建新任务。
- **成本**：每篇 ~ 输入(content 平均 1k token) + 输出 300 → ~1.3k token/次。

### P0-2 任务自然语言录入

```typescript
// 新增：/api/ai/parse-task
app.post('/api/ai/parse-task', async (c) => {
  const { text } = await c.req.json()
  const result = await callAI(c, [
    { role: 'system', content: '解析用户输入为任务 JSON：{title, dueDate(ISO,无则null), isImportant(bool)}。只返回 JSON。' },
    { role: 'user', content: text },
  ], { maxTokens: 200 })
  const match = result.match(/\{[\s\S]*\}/)
  const parsed = match ? JSON.parse(match[0]) : { title: text }
  return c.json(parsed)
})
```

- **前端**：任务输入框支持"回车即解析"，拿到 `{title, dueDate}` 直接走现有建任务逻辑。
- **成本**：~100 token/次，可忽略。

### P1-1 今日简报

```typescript
// 新增：/api/ai/digest
app.get('/api/ai/digest', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const myDay = await db.select().from(schema.tasks)
    .where(and(eq(schema.tasks.isMyDay, true), isNull(schema.tasks.msTodoDeletedAt)))
  const recentNotes = await db.select().from(schema.imaNotes)
    .orderBy(desc(schema.imaNotes.importedAt)).limit(5)
  const brief = `我的一天任务 ${myDay.length} 个（未完成 ${myDay.filter(t=>!t.isCompleted).length}）。近期笔记：${recentNotes.map(n=>n.title).join('、')}`
  const text = await callAI(c, [
    { role: 'system', content: '你是个人晨间助手，根据以下信息生成 150 字内的今日简报，含今日重点与一句建议。' },
    { role: 'user', content: brief },
  ], { maxTokens: 300 })
  return c.json({ digest: text })
})
```

- **前端**：`TasksPage` / 首页顶部加「今日简报」卡片，进入页面或点按钮拉取。
- **成本**：~1 次调用，输入 ~800 + 输出 300。

### P1-2 跨模块语义检索（RAG-lite）

**前置**：新增 `embeddings` 表（D1，无外部向量库）：

```typescript
// backend/src/schema.ts 新增
export const embeddings = sqliteTable('embeddings', {
  id: text('id').primaryKey(),
  targetType: text('target_type').notNull(), // 'note' | 'kb' | 'task'
  targetId: text('target_id').notNull(),
  model: text('model').notNull(),
  vector: text('vector').notNull(), // JSON 数组
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})
```

**编码（导入/建任务时触发一次）**：

```typescript
// 用 Workers AI 嵌入模型（以 wrangler 实际可用模型为准，如 @cf/baai/bge-base-en-v1.5 或 multilingual 变体）
const emb = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: docText })
const vector = (emb as any).data[0] // 768 维数组
await db.insert(schema.embeddings).values({ id: crypto.randomUUID(), targetType, targetId, model, vector: JSON.stringify(vector) })
```

**检索（暴力余弦，个人量级足够）**：

```typescript
app.post('/api/ai/semantic-search', async (c) => {
  const { query, topK = 5 } = await c.req.json()
  const q = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: query })
  const qv = (q as any).data[0]
  const all = await db.select().from(schema.embeddings)
  const scored = all.map(r => ({ ...r, score: cosine(JSON.parse(r.vector), qv) }))
    .sort((a,b)=>b.score-a.score).slice(0, topK)
  // 回填原文标题（join imaNotes / kbDocuments / tasks）
  return c.json({ results: scored })
})
```

- **前端**：全局搜索框加「语义」开关，调 `/api/ai/semantic-search`。
- **成本**：编码每篇一次（导入时）；检索 = 1 次查询嵌入 + 1 次生成（可选 rerank）。月成本可忽略。
- **维护**：向量随内容更新需重建（导入/编辑时删旧插新）；个人量级定时全量重建也便宜。

### P2-0 KB 文本抽取（P1-2/P2-1 前置）

- PDF：在导入 Worker 用 `@react-pdf-text` 或 `pdf-parse` 思路提取文本 → 写 `kbDocuments.content`。
- DOCX：复用已装的 `docx-preview` 解析或 `Mammoth` 提取文本。
- 仅对 `fileType` 为 pdf/docx/md 做；图片/表格类跳过。

---

## 4. 架构改动清单

| 改动 | 文件 | 说明 |
|---|---|---|
| `callAI` 加 `maxTokens` | `backend/src/index.ts` | 所有新功能共用 |
| 默认模型改对话模型 | `backend/src/index.ts` | 去掉 coder 默认 |
| 新增 4 个端点 | `backend/src/index.ts` | note-summary / parse-task / digest / semantic-search |
| 新增 `embeddings` 表 + 迁移 | `backend/src/schema.ts` + `drizzle/` | RAG-lite |
| KB 导入补文本抽取 | `backend/src/index.ts` 导入逻辑 | P2-0 |
| 前端 4 处按钮/入口 | `frontend/src/pages/*` | Notes / Tasks / Search |
| 前端 `api.ts` 加对应函数 | `frontend/src/lib/api.ts` | 调用层 |

---

## 5. 国内访问 / 延迟处理

- AI 调用是 **Worker→模型（服务端）**，不受你"无代理"影响；真正被 Cloudflare 国内慢链路拖垮的是**流式逐字对话**（每 token 过慢链路才卡）。
- 本方案全部为**一次性调用**（点按钮 → 等 1–2s 出结果），体验可接受。
- 若未来想要"追问"，再评估：用国内直连模型 API（如 DeepSeek 官方国内端点）做流式，而非走 CF 慢链路。

---

## 6. 成本护栏

- 每个端点显式 `max_tokens`（总结 400、要点 300、解析 200、简报 300）。
- 不做无上限对话；`aiConfigs` 已支持自定义 API，用户可自行换更便宜的模型。
- 语义检索的嵌入编码是一次性成本，个人量级月成本可忽略（CF Workers AI 免费额度内或自定义 API 几分钱）。

---

## 7. 实施顺序（里程碑）

1. **M1（半天）**：`callAI` 加 `maxTokens` + 改默认模型；上线 P0-1 笔记 AI 辅助。
2. **M2（半天）**：P0-2 任务自然语言录入。
3. **M3（1 天）**：P1-1 今日简报；P2-0 KB 文本抽取。
4. **M4（1–2 天）**：P1-2 `embeddings` 表 + 编码 + 语义检索 + 前端搜索入口。
5. **M5（探索）**：P2-1 知识库问答、P2-2 分析增强。

> 建议先交付 M1–M2 验证"嵌入 AI 是否真提升日常使用"，再决定是否投入 M3–M4 的检索子系统。

---

## 8. 不建议做（再次强调）

- ❌ 通用聊天面板 / 流式对话
- ❌ 联网搜索、浏览器 Agent（需稳定代理，你没有）
- ❌ 多 Agent 编排（维护成本爆炸，且你"先自建后弃"的历史表明会烂尾）
- ❌ AI 遍地开花：只在摩擦点加，不为"酷"而加
