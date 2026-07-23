# 个人全能工作台 — 产品需求文档 (PRD)

> 版本: v2.0 | 日期: 2026-07-22 | 状态: 规划阶段
> 核心原则：**能用成熟开源代码绝不自己写**，每个功能模块都明确标注复用的开源项目及使用方式

---

## 一、产品概述

### 1.1 产品定位
基于 Cloudflare 技术栈的个人全能工作台，整合任务管理、笔记预览、知识库查阅、数据分析与天意硬币。

### 1.2 目标用户
单人使用（前期仅 1 人）。

### 1.3 核心原则
- **代码复用优先**：所有功能模块均使用 GitHub 高星开源项目，拿来直接用
- **移动端优先**：前端 100% 兼容移动端
- **简单认证**：单密码登录
- **Todoist 风格扁平化设计**

---

## 二、技术栈与开源项目清单（已确定）

### 2.1 总体架构

```
┌─────────────────────────────────────────────────────┐
│                   前端 (SPA)                         │
│  React 19 + TypeScript + Tailwind CSS 4             │
│  shadcn/ui + Vite → Cloudflare Pages 部署           │
├─────────────────────────────────────────────────────┤
│                后端 API (Serverless)                 │
│  Cloudflare Workers + Hono 框架                     │
│  D1 (SQLite) + Drizzle ORM + KV 缓存                │
│  Workers AI — AI 推理                                │
├─────────────────────────────────────────────────────┤
│                  外部服务集成                         │
│  Microsoft Graph API → To Do 双向同步               │
│  IMA 导出文件 → 解析预览                              │
│  ANU QRNG API → 天意硬币                             │
└─────────────────────────────────────────────────────┘
```

### 2.2 开源项目清单（每个依赖都经过调研确认）

#### 前端核心

| 用途 | 项目 | GitHub Stars | 安装命令 | 说明 |
|------|------|-------------|---------|------|
| UI 组件库 | [shadcn/ui](https://github.com/shadcn-ui/ui) | 80k+ | `npx shadcn@latest init` | 基于 Radix UI + Tailwind，源码复制到本地，可任意修改 |
| CSS 框架 | [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | 85k+ | `npm i tailwindcss @tailwindcss/vite` | v4 版本，Vite 插件方式集成 |
| 路由 | [React Router](https://github.com/remix-run/react-router) | 54k+ | `npm i react-router-dom` | v7，SPA 路由 |
| HTTP 请求 | [ky](https://github.com/sindresorhus/ky) | 14k+ | `npm i ky` | 轻量 fetch 封装，支持拦截器，比 axios 更现代 |
| 表单校验 | [react-hook-form](https://github.com/react-hook-form/react-hook-form) | 42k+ | `npm i react-hook-form` | shadcn/ui 表单默认搭配 |
| Schema 校验 | [zod](https://github.com/colinhacks/zod) | 36k+ | `npm i zod` | 前后端共用 Schema |
| 拖拽排序 | [@hello-pangea/dnd](https://github.com/hello-pangea/dnd) | 3k+ | `npm i @hello-pangea/dnd` | react-beautiful-dnd 的维护替代品，API 完全兼容，支持触摸 |
| 主题切换 | [shadcn/ui Theme Provider](https://ui.shadcn.com/docs/dark-mode/vite) | — | shadcn 内置 | 基于 `next-themes` 移植，支持 Vite，无闪烁 |
| 图表 | [recharts](https://github.com/recharts/recharts) | 25k+ | `npm i recharts` | React + D3 图表库，shadcn/ui 内置图表组件基于它 |
| 日期处理 | [date-fns](https://github.com/date-fns/date-fns) | 35k+ | `npm i date-fns` | 轻量日期库 |
| 图标 | [lucide-react](https://github.com/lucide-icons/lucide) | 55k+ | `npm i lucide-react` | shadcn/ui 默认图标库 |

#### Markdown / 文档预览

| 用途 | 项目 | GitHub Stars | 安装命令 | 说明 |
|------|------|-------------|---------|------|
| Markdown 渲染 | [react-markdown](https://github.com/remarkjs/react-markdown) | 13k+ | `npm i react-markdown` | remark 生态，最成熟的 React MD 渲染器 |
| GFM 支持 | [remark-gfm](https://github.com/remarkjs/remark-gfm) | 2k+ | `npm i remark-gfm` | 表格、删除线、任务列表等 |
| 代码高亮 | [rehype-highlight](https://github.com/rehypejs/rehype-highlight) | 1k+ | `npm i rehype-highlight` | highlight.js 集成 |
| PDF 预览 | [@react-pdf-viewer/core](https://github.com/react-pdf-viewer/react-pdf-viewer) | 2k+ | `npm i @react-pdf-viewer/core @react-pdf-viewer/default-layout` | 功能最全的 React PDF 查看器，支持缩放/搜索/打印 |
| Word 预览 | [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) | 2k+ | `npm i docx-preview` | 像素级还原 Word 文档样式，优于 mammoth.js |
| Excel 预览 | [xlsx](https://github.com/SheetJS/sheetjs) | 35k+ | `npm i xlsx` | SheetJS，解析 Excel 转 HTML 表格 |

#### 后端核心

| 用途 | 项目 | GitHub Stars | 安装命令 | 说明 |
|------|------|-------------|---------|------|
| Web 框架 | [Hono](https://github.com/honojs/hono) | 25k+ | `npm i hono` | 专为 Cloudflare Workers 设计 |
| JWT 认证 | [Hono JWT 中间件](https://hono.dev/docs/helpers/jwt) | 内置 | 内置 `hono/utils/jwt` | Hono 自带 `sign`/`verify`/`jwt` 中间件，无需额外依赖 |
| ORM | [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) | 26k+ | `npm i drizzle-orm` | D1 官方推荐，类型安全 |
| 数据库迁移 | [Drizzle Kit](https://orm.drizzle.team/docs/kit-overview) | — | `npm i drizzle-kit -D` | 生成/执行 SQL 迁移 |
| 微软 Graph SDK | [@microsoft/microsoft-graph-client](https://github.com/microsoftgraph/msgraph-sdk-javascript) | 1k+ | `npm i @microsoft/microsoft-graph-client` | 官方 JS SDK，封装 Graph API |
| MSAL 认证 | [@azure/msal-node](https://github.com/AzureAD/microsoft-authentication-library-for-js) | 3k+ | `npm i @azure/msal-node` | 微软官方 OAuth 库 |
| UUID | [uuid](https://github.com/uuidjs/uuid) | 14k+ | `npm i uuid` | 生成 UUID |
| ZIP 解析 | [fflate](https://github.com/101arrowz/fflate) | 2k+ | `npm i fflate` | 轻量 ZIP 解压，Workers 兼容 |

#### 部署 & 工具

| 用途 | 项目 | 说明 |
|------|------|------|
| 前端部署 | [Cloudflare Pages](https://developers.cloudflare.com/pages/) | 连接 GitHub 自动构建 |
| 后端部署 | [Cloudflare Workers](https://developers.cloudflare.com/workers/) | `wrangler deploy` |
| 本地开发 | [Wrangler](https://github.com/cloudflare/workers-sdk) | `npm i wrangler -D`，本地模拟 D1/KV/AI |
| 数据库管理 | [Cloudflare D1](https://developers.cloudflare.com/d1/) | 边缘 SQLite |
| 文件存储 | [Cloudflare R2](https://developers.cloudflare.com/r2/) | S3 兼容，10GB 免费 |
| AI 推理 | [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) | 内置绑定，免费额度 |

---

## 三、功能模块详述

### 模块 1：登录 / 认证

**复用的开源代码**：
- 后端：Hono 内置 JWT 中间件（`hono/utils/jwt`），无需引入任何第三方认证库
- 密码哈希：Web Crypto API（Workers 内置 `crypto.subtle.digest`）
- 前端：shadcn/ui 的 `Input` + `Button` + `Form` 组件

**实现方式**：
```
密码配置 → Cloudflare Workers Secret (环境变量)
登录请求 → Hono 路由 → crypto.subtle.digest('SHA-256', password) 对比
         → 通过 → hono/utils/jwt 的 sign() 签发 JWT
         → 前端存 localStorage → ky 拦截器自动添加 Authorization: Bearer
```

**关键代码结构（Hono 内置 JWT）**：
```typescript
// 后端 — 完全使用 Hono 内置能力，零额外依赖
import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { sign, verify } from 'hono/utils/jwt'

const app = new Hono()

// 登录路由：验证密码 → 签发 JWT
app.post('/api/auth/login', async (c) => {
  const { password } = await c.req.json()
  const hash = await crypto.subtle.digest('SHA-256', 
    new TextEncoder().encode(password))
  // 对比 Secret 中的 PASSWORD_HASH
  if (hashMatch) {
    const token = await sign({ exp: ... }, c.env.JWT_SECRET, 'HS256')
    return c.json({ token })
  }
})

// 受保护路由：Hono 内置 JWT 中间件
app.use('/api/*', jwt({ secret: c.env.JWT_SECRET }))
```

---

### 模块 2：任务管理（仿微软 To Do）

**复用的开源代码**：

| 功能点 | 复用项目 | 使用方式 |
|--------|---------|---------|
| 整体 UI 框架 | shadcn/ui `Sidebar` + `Card` + `Checkbox` + `Input` | `npx shadcn@latest add sidebar card checkbox input` |
| 拖拽排序 | `@hello-pangea/dnd` | react-beautiful-dnd 停更后的官方维护分支，API 完全兼容 |
| 日期选择器 | shadcn/ui `Calendar` + `Popover` | 基于 react-day-picker |
| 表单 | `react-hook-form` + `zod` | shadcn/ui `Form` 组件封装 |
| 状态管理 | [zustand](https://github.com/pmndrs/zustand) | `npm i zustand`，轻量状态管理 |
| 数据请求 | [TanStack Query](https://github.com/TanStack/query) | `npm i @tanstack/react-query`，自动缓存/重试/乐观更新 |

#### 2.1 功能清单

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 任务列表 | 创建/删除/重命名列表 | P0 |
| 任务 CRUD | 创建、编辑、删除、完成/取消完成 | P0 |
| 子任务 | 任务下添加子步骤，逐项勾选 | P0 |
| AI 拆解子任务 | AI 自动生成子任务清单 | P0 |
| 我的的一天 | 每日待办视图 | P0 |
| 重要标记 | 星标任务，单独视图 | P0 |
| 截止日期 | 设置截止日期和时间 | P1 |
| 重复任务 | 每日/每周/每月重复 | P1 |
| 备注 | 任务详情富文本备注 | P1 |
| 搜索 | 全局搜索任务 | P1 |
| 拖拽排序 | `@hello-pangea/dnd` 实现 | P1 |

#### 2.2 数据模型（D1 + Drizzle Schema）

```typescript
// Drizzle ORM Schema — 直接使用 Drizzle 定义，自动生成 SQL
import { sqliteTable, text, integer, boolean } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const taskLists = sqliteTable('task_lists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').default('#2563EB'),
  sortOrder: integer('sort_order').default(0),
  isSystem: boolean('is_system').default(false),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  listId: text('list_id').notNull().references(() => taskLists.id),
  title: text('title').notNull(),
  note: text('note').default(''),
  isCompleted: boolean('is_completed').default(false),
  isImportant: boolean('is_important').default(false),
  isMyDay: boolean('is_my_day').default(false),
  myDayDate: text('my_day_date'),
  dueDate: text('due_date'),
  reminder: text('reminder'),
  recurrence: text('recurrence'),
  sortOrder: integer('sort_order').default(0),
  // 微软 To Do 同步字段
  msTodoId: text('ms_todo_id'),
  msTodoListId: text('ms_todo_list_id'),
  lastSyncedAt: text('last_synced_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

export const subtasks = sqliteTable('subtasks', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  isCompleted: boolean('is_completed').default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})
```

#### 2.3 AI 拆解子任务

**复用**：Cloudflare Workers AI（绑定即用，无需 SDK）

```typescript
// Worker 代码 — 直接调用 Workers AI binding
app.post('/api/ai/breakdown', async (c) => {
  const { taskTitle } = await c.req.json()
  
  const response = await c.env.AI.run(
    '@cf/deepseek-ai/deepseek-v3-0324',  // 或 @cf/meta/llama-4-scout-17b-16k-instruct
    {
      messages: [
        {
          role: 'system',
          content: '你是任务拆解专家。将任务拆解为3-7个可执行子步骤，返回JSON数组 [{"title":"步骤描述"}]。'
        },
        { role: 'user', content: `任务：${taskTitle}` }
      ]
    }
  )
  
  return c.json(JSON.parse(response.response))
})
```

#### 2.4 前端布局（仿微软 To Do）

```
┌──────────┬──────────────────────────┐
│ 侧边栏   │  任务列表标题              │
│ (shadcn  │  ┌─────────────────────┐ │
│  Sidebar)│  │ + 添加任务           │ │
│          │  ├─────────────────────┤ │
│ 我的的一天│  │ ☐ 任务1  [拖拽手柄] │ │ ← @hello-pangea/dnd
│ 重要     │  │ ☐ 任务2 ⭐ 📅       │ │
│ 已计划   │  │ ☐ 任务3 (已完成)    │ │
│ ──────── │  └─────────────────────┘ │
│ 📁 工作  │                          │
│ 📁 个人  │  点击任务 → 详情面板      │
│          │  ┌─────────────────────┐ │
│ + 新建列表│  │ [AI拆解按钮]        │ │
│          │  │ 子任务: ☐ ☐ ☐      │ │
│          │  └─────────────────────┘ │
└──────────┴──────────────────────────┘
```

---

### 模块 3：笔记预览（IMA 笔记）

**调研结论**：腾讯 IMA **已开放 OpenAPI**（https://ima.qq.com/agent-interface），支持笔记读写、知识库管理、文件上传。认证用 `ima-openapi-clientid` / `ima-openapi-apikey` header。

**复用的开源代码**：

| 功能点 | 复用项目 | 安装 |
|--------|---------|------|
| Markdown 渲染 | `react-markdown` + `remark-gfm` + `rehype-highlight` | `npm i react-markdown remark-gfm rehype-highlight` |
| ZIP 解压（本地导入兜底） | `fflate` | `npm i fflate` |
| IMA OpenAPI 调用 | 原生 `fetch`（无需 SDK，OpenAPI 为 RESTful） | — |

**实现流程**（双通道：OpenAPI 拉取为主，本地导入兜底）：
```
方式 A — IMA OpenAPI 拉取（推荐）：
  用户在设置页填入 Client ID + API Key
  → 后端调用 IMA OpenAPI：/openapi/note/v1/list_notebook → list_note → get_doc_content
  → 内容存入 D1（ima_notes 表）
  → 前端用 react-markdown 渲染预览

方式 B — 本地导入（兜底）：
  用户在 IMA 客户端导出笔记为 Markdown/ZIP
  → 上传到系统 → Worker 用 fflate 解压 ZIP → 解析 Markdown 存入 D1
```

**数据模型**：
```typescript
export const imaNotes = sqliteTable('ima_notes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),     // Markdown 原文
  sourceFile: text('source_file'),
  importedAt: text('imported_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})
```

---

### 模块 4：知识库预览（IMA 知识库）

**复用的开源代码**：

| 文件格式 | 复用项目 | 安装 | 说明 |
|---------|---------|------|------|
| PDF | `@react-pdf-viewer/core` | `npm i @react-pdf-viewer/core @react-pdf-viewer/default-layout` | 支持缩放/搜索/打印/翻页 |
| Word (.docx) | `docx-preview` | `npm i docx-preview` | 像素级还原 Word 样式，优于 mammoth |
| Excel (.xlsx) | `xlsx` (SheetJS) | `npm i xlsx` | 解析为 HTML 表格 |
| Markdown | `react-markdown` | 同笔记模块 | 复用 |
| 图片 | 原生 `<img>` + shadcn `Dialog` | — | 支持点击放大 |
| 通用预览 | [react-file-viewer](https://github.com/plangrid/react-file-viewer) | `npm i react-file-viewer` | 备选，支持多种格式 |

**实现流程**（双通道：OpenAPI 拉取 + 本地上传）：
```
方式 A — IMA OpenAPI 拉取：
  后端调用 /openapi/wiki/v1/get_knowledge_list → get_media_info 拉取知识库文档元数据
  → 文档正文通过 get_doc_content 获取，存入 D1
  → 前端根据 fileType 选择对应预览组件

方式 B — 本地上传：
  用户上传文档 → 原始文件存 R2（c.env.STORAGE.put），元数据存 D1
  → 前端根据文件类型选择对应预览组件
  → PDF → @react-pdf-viewer
  → Word → docx-preview 渲染
  → Excel → xlsx 转 HTML 表格
  → Markdown → react-markdown
```

**数据模型**：
```typescript
export const kbDocuments = sqliteTable('kb_documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  fileType: text('file_type').notNull(),   // pdf/docx/md/xlsx/image
  r2Key: text('r2_key'),                   // R2 存储 key
  fileSize: integer('file_size'),
  importedAt: text('imported_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})
```

---

### 模块 5：数据分析 + 天意硬币

#### 5.1 系统数据分析

**复用的开源代码**：

| 功能点 | 复用项目 | 说明 |
|--------|---------|------|
| 图表渲染 | `recharts` | shadcn/ui 内置 `Chart` 组件基于它 |
| AI 分析报告 | Cloudflare Workers AI | 将统计数据传给 AI 生成文字分析 |
| 日期处理 | `date-fns` | 日期范围计算 |

**实现方式**：
```typescript
// 1. 从 D1 汇总数据
const stats = {
  totalTasks: await db.select().from(tasks)...
  completedThisWeek: ...
  completionRate: ...
  notesCount: ...
}

// 2. 传给 Workers AI 生成分析
const analysis = await c.env.AI.run('@cf/deepseek-ai/deepseek-v3-0324', {
  messages: [{
    role: 'system',
    content: '你是数据分析专家，根据以下数据生成简洁的中文分析报告，包含趋势洞察和建议。'
  }, {
    role: 'user',
    content: JSON.stringify(stats)
  }]
})

// 3. 前端用 recharts 渲染图表 + AI 文字报告
```

#### 5.2 天意硬币

**复用的开源代码**：
- 真随机数：[ANU QRNG API](https://qrng.anu.edu.au/) — 免费、无需认证、量子随机
- 备选：[random.org](https://www.random.org/clients/http/) API — 大气噪声随机
- 降级：Web Crypto API `crypto.getRandomValues()`
- 动画：CSS 3D Transform（无需额外库）

**实现方式**：
```typescript
app.post('/api/coin/flip', async (c) => {
  let randomValue: number
  let source: string

  try {
    // 主方案：ANU 量子随机数 API
    const res = await fetch(
      'https://qrng.anu.edu.au/api/jsoni.php?length=1&type=uint8'
    )
    const data = await res.json()
    randomValue = data.data[0]
    source = 'anu_qrng'
  } catch {
    try {
      // 降级1：random.org
      const res = await fetch(
        'https://www.random.org/integers/?num=1&min=0&max=255&col=1&base=10&format=plain&rnd=new'
      )
      randomValue = parseInt(await res.text())
      source = 'random_org'
    } catch {
      // 降级2：Web Crypto
      const arr = new Uint8Array(1)
      crypto.getRandomValues(arr)
      randomValue = arr[0]
      source = 'crypto'
    }
  }

  const result = randomValue < 128 ? 'tails' : 'heads'

  // AI 解读
  const interpretation = await c.env.AI.run('@cf/deepseek-ai/deepseek-v3-0324', {
    messages: [{
      role: 'system',
      content: `用户抛掷天意硬币得到"${result === 'heads' ? '阳/正面' : '阴/反面'}"，请用一句话给出玄学解读，30字以内。`
    }]
  })

  return c.json({ result, source, rawValue: randomValue, interpretation })
})
```

**数据模型**：
```typescript
export const coinFlips = sqliteTable('coin_flips', {
  id: text('id').primaryKey(),
  result: text('result').notNull(),          // 'heads' | 'tails'
  entropySource: text('entropy_source').notNull(),
  rawValue: integer('raw_value'),
  interpretation: text('interpretation'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
})
```

---

### 模块 6：设置

#### 6.1 界面切换

**复用**：shadcn/ui 官方 Theme Provider 方案（Vite 版本）

```typescript
// 来自 shadcn/ui 官方文档，直接复制
// https://ui.shadcn.com/docs/dark-mode/vite
import { createContext, useContext } from 'react'

type Theme = 'light' | 'dark' | 'system'
// 基于 localStorage + Tailwind dark: class 策略
// shadcn/ui 提供完整代码，直接复制使用
```

#### 6.2 微软 To Do 双向同步

**复用的开源代码**：

| 功能点 | 复用项目 | 安装 | 说明 |
|--------|---------|------|------|
| Graph API 调用 | `@microsoft/microsoft-graph-client` | `npm i @microsoft/microsoft-graph-client` | 官方 SDK |
| OAuth 认证 | `@azure/msal-node` | `npm i @azure/msal-node` | 微软官方认证库 |
| Token 加密 | Web Crypto API | 内置 | AES-GCM 加密 refresh_token |
| Token 缓存 | Cloudflare KV | 内置绑定 | access_token 缓存 1 小时 |
| 定时同步 | Cloudflare Cron Triggers | 内置 | wrangler.toml 配置 |

**同步策略**：
- 首次同步：全量拉取微软 To Do → 写入 D1
- 增量同步：对比 `updated_at`，Last Write Wins
- 同步频率：Cron Trigger 每 5 分钟 + 手动触发

**OAuth 流程**：
```
设置页填入 Client ID/Secret → 点击"授权"
  → 前端跳转 Microsoft 登录页
  → 回调获取 authorization code
  → Worker 用 @azure/msal-node 换取 access_token + refresh_token
  → refresh_token 用 AES-GCM 加密存 D1
  → access_token 缓存 KV（1 小时过期）
  → @microsoft/microsoft-graph-client 调用 /me/todo/lists 全量同步
```

**字段映射**（使用 Graph SDK，无需手写 HTTP）：
```typescript
import { Client } from '@microsoft/microsoft-graph-client'

const client = Client.init({
  authProvider: (done) => done(null, accessToken)
})

// 拉取所有任务列表
const lists = await client.api('/me/todo/lists').get()

// 拉取列表下所有任务
const tasks = await client.api(`/me/todo/lists/${listId}/tasks`).get()

// 创建任务
await client.api(`/me/todo/lists/${listId}/tasks`).post({
  title: '新任务',
  importance: 'high',
  dueDateTime: { dateTime: '2026-07-22T00:00:00', timeZone: 'UTC' }
})

// 更新任务状态
await client.api(`/me/todo/lists/${listId}/tasks/${taskId}`).patch({
  status: 'completed'
})
```

#### 6.3 IMA 笔记/知识库拉取

- **OpenAPI 拉取（主通道）**：用户在设置页配置 IMA Client ID + API Key
  - 笔记：`POST /openapi/note/v1/list_notebook` → `list_note` → `get_doc_content`
  - 知识库：`POST /openapi/wiki/v1/get_knowledge_list` → `get_media_info`
  - 端点：`POST /api/ima/sync-notes`、`POST /api/ima/sync-kb`
- **本地导入（兜底）**：上传 Markdown/ZIP，`fflate` 解压 → `react-markdown` 预览
- **本地上传（知识库）**：上传文档 → R2 存储 + 对应预览组件
- 引导说明：设置页 IMA 卡片含开发者页面链接（https://ima.qq.com/agent-interface）

#### 6.4 AI 配置

**默认**：Cloudflare Workers AI（绑定即用，免费额度）

**自定义配置**：
- 支持 OpenAI 兼容 API（DeepSeek、通义千问、智谱等）
- 配置项：API Base URL、API Key、模型名称
- 连通性测试：发送测试请求 → 显示成功/失败及延迟

```typescript
app.post('/api/settings/ai/test', async (c) => {
  const { baseUrl, apiKey, model } = await c.req.json()
  
  const start = Date.now()
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
      })
    })
    const data = await res.json()
    return c.json({
      ok: true,
      latency_ms: Date.now() - start,
      model: data.model || model
    })
  } catch (e) {
    return c.json({ ok: false, error: e.message })
  }
})
```

---

## 四、API 设计概览

```
/api/auth
  POST   /login                    # 密码登录 → JWT

/api/tasks
  GET    /lists                    # 获取所有列表
  POST   /lists                    # 创建列表
  PUT    /lists/:id                # 更新列表
  DELETE /lists/:id                # 删除列表
  GET    /lists/:id/tasks          # 获取列表下任务
  POST   /tasks                    # 创建任务
  PUT    /tasks/:id                # 更新任务
  DELETE /tasks/:id                # 删除任务
  POST   /tasks/:id/myday          # 加入我的的一天
  DELETE /tasks/:id/myday          # 移出我的的一天
  GET    /tasks/myday              # 我的一天任务
  GET    /tasks/important          # 重要任务
  GET    /tasks/planned            # 已计划任务
  GET    /tasks/search?q=          # 搜索

/api/subtasks
  POST   /tasks/:id/subtasks       # 创建子任务
  PUT    /subtasks/:id             # 更新子任务
  DELETE /subtasks/:id             # 删除子任务
  PATCH  /subtasks/:id/toggle      # 切换完成

/api/ai
  POST   /breakdown                # AI 拆解子任务
  POST   /analysis                 # 数据分析报告
  POST   /coin/interpret           # 硬币解读

/api/notes
  POST   /import                   # 导入 IMA 笔记
  GET    /                         # 笔记列表
  GET    /:id                      # 笔记详情
  DELETE /:id                      # 删除笔记

/api/kb
  POST   /import                   # 导入知识库文档
  GET    /                         # 文档列表
  GET    /:id                      # 文档详情
  GET    /:id/preview              # 文档预览
  DELETE /:id                      # 删除文档

/api/coin
  POST   /flip                     # 抛掷天意硬币
  GET    /history                  # 抛掷历史

/api/settings
  GET    /                         # 获取设置
  PUT    /                         # 更新设置
  POST   /ms-todo/auth             # 微软 OAuth 回调
  GET    /ms-todo/status           # 同步状态
  POST   /ms-todo/sync             # 手动同步
  POST   /ai/test                  # AI 连通性测试
```

---

## 五、前端路由

```
/login                # 登录页
/                     # → 重定向 /tasks/myday
/tasks/myday          # 我的一天
/tasks/important      # 重要
/tasks/planned        # 已计划
/tasks/list/:id       # 指定列表
/tasks/search?q=      # 搜索
/notes                # 笔记列表
/notes/:id            # 笔记详情
/knowledge            # 知识库列表
/knowledge/:id        # 文档预览
/analysis             # 数据分析
/coin                 # 天意硬币
/settings             # 设置
/settings/general     # 通用设置
/settings/sync        # 同步设置
/settings/ai          # AI 配置
```

---

## 六、移动端适配

| 层面 | 策略 | 复用 |
|------|------|------|
| 布局 | Tailwind 响应式 `sm:` / `md:` / `lg:` | Tailwind 内置 |
| 导航 | 移动端底部 Tab Bar → 桌面端侧边栏 | shadcn `Sidebar`（自动响应式） |
| 任务详情 | 移动端底部 Sheet → 桌面端右侧面板 | shadcn `Sheet` 组件 |
| 拖拽 | 触摸拖拽排序 | `@hello-pangea/dnd` 原生支持触摸 |
| 触摸 | 下拉刷新、滑动操作 | shadcn `Swipe` / 自定义 |

---

## 七、数据安全

| 项目 | 方案 | 复用 |
|------|------|------|
| 密码存储 | Worker Secret 环境变量 | Cloudflare 内置 |
| JWT 签名 | HS256 | Hono 内置 `hono/utils/jwt` |
| API Key 加密 | AES-GCM | Web Crypto API 内置 |
| OAuth Token | 加密存储 D1 + KV 缓存 | Web Crypto API |
| 传输安全 | HTTPS | Cloudflare 默认 |

---

## 八、开发阶段

### Phase 1：骨架搭建
- [x] Vite + React + shadcn/ui + Tailwind 初始化
- [x] Hono + Cloudflare Workers + D1 + Drizzle 初始化
- [x] 登录认证（Hono JWT 中间件 + PBKDF2 密码哈希）
- [x] 基础布局（shadcn Sidebar + 移动端适配）

### Phase 2：任务管理
- [x] Drizzle Schema 定义 + 迁移
- [x] 任务列表/任务/子任务 CRUD API
- [x] 前端任务管理 UI（仿微软 To Do）
- [x] AI 拆解子任务（Workers AI）
- [x] 拖拽排序（@hello-pangea/dnd）

### Phase 3：微软 To Do 同步
- [x] @azure/msal-node OAuth 集成
- [x] @microsoft/microsoft-graph-client 全量+增量同步
- [x] Cron Trigger 定时同步

### Phase 4：IMA 集成
- [x] IMA OpenAPI 调研（已获得完整接口文档）
- [x] 笔记 OpenAPI 拉取（list_notebook → list_note → get_doc_content）
- [x] 知识库 OpenAPI 拉取（get_knowledge_list → get_media_info）
- [x] 本地导入兜底（fflate 解压 + react-markdown 预览）
- [x] 知识库文档本地上传 + R2 存储 + 多格式预览
- [x] 设置页 IMA 凭证配置 + 同步按钮

### Phase 5：分析与天意硬币
- [x] 数据分析（recharts + Workers AI）
- [x] 天意硬币（ANU QRNG + AI 解读）

### Phase 6：设置与收尾
- [x] 主题切换（shadcn Theme Provider + matchMedia 监听）
- [x] 自定义 AI 配置 + 连通性测试
- [x] 整体联调（前后端编译零错误、登录/任务/笔记/知识库/硬币/命令面板/移动端/暗色模式验证通过）

---

## 九、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| IMA OpenAPI 凭证失效 | 拉取失败 | 设置页保留本地导入兜底；UI 显示失败原因 |
| 微软 Graph API 变更 | 同步中断 | 使用官方 SDK，跟随版本更新 |
| ANU QRNG 不稳定 | 硬币降级 | 三层降级：ANU → random.org → Web Crypto |
| Workers AI 额度不足 | AI 受限 | 支持自定义 API 配置 |
| react-beautiful-dnd 已停更 | 拖拽功能无维护 | 使用 `@hello-pangea/dnd`（官方维护替代） |

---

## 十、附录

### 10.1 项目初始化命令

```bash
# 1. 前端初始化
npm create vite@latest frontend -- --template react-ts
cd frontend
npm i tailwindcss @tailwindcss/vite
npx shadcn@latest init
npx shadcn@latest add sidebar card checkbox input button form dialog sheet calendar popover command dropzone

# 前端依赖
npm i react-router-dom ky react-hook-form zod @tanstack/react-query zustand
npm i @hello-pangea/dnd date-fns lucide-react recharts
npm i react-markdown remark-gfm rehype-highlight
npm i @react-pdf-viewer/core @react-pdf-viewer/default-layout docx-preview xlsx fflate

# 2. 后端初始化
npm create hono@latest backend -- --template cloudflare-workers
cd backend
npm i hono drizzle-orm @microsoft/microsoft-graph-client @azure/msal-node uuid
npm i -D drizzle-kit wrangler

# 3. 数据库迁移
npx wrangler d1 create workbench-db
npx drizzle-kit generate
npx drizzle-kit migrate
```

### 10.2 关键参考文档

| 资源 | 链接 |
|------|------|
| shadcn/ui Vite 暗黑模式 | https://ui.shadcn.com/docs/dark-mode/vite |
| Hono JWT 文档 | https://hono.dev/docs/helpers/jwt |
| Hono Cloudflare Workers 指南 | https://hono.dev/docs/getting-started/cloudflare-workers |
| Drizzle D1 文档 | https://orm.drizzle.team/docs/get-started-sqlite#cloudflare-d1 |
| Microsoft Graph To Do API | https://learn.microsoft.com/en-us/graph/api/resources/todo-overview |
| Cloudflare Workers AI | https://developers.cloudflare.com/workers-ai/ |
| ANU QRNG API | https://qrng.anu.edu.au/ |
| @hello-pangea/dnd | https://github.com/hello-pangea/dnd |
| react-pdf-viewer | https://react-pdf-viewer.dev/ |
| docx-preview | https://github.com/VolodymyrBaydalka/docxjs |

### 10.3 wrangler.toml 配置参考

```toml
name = "workbench-api"
main = "src/index.ts"
compatibility_date = "2026-07-01"

[vars]
JWT_SECRET = "" # 通过 wrangler secret put 设置

[[d1_databases]]
binding = "DB"
database_name = "workbench-db"
database_id = "xxx"

[[kv_namespaces]]
binding = "CACHE"
id = "xxx"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "workbench-storage"

[ai]
binding = "AI"

[triggers]
crons = ["*/5 * * * *"]  # 每 5 分钟同步微软 To Do
```
