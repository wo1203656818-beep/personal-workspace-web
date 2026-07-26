# 工作台功能审计与改进建议

审计时间：2026-07-27 | 后端 ~3500 行（index.ts）+ 前端 ~20 个页面/组件

---

## P0 — 功能缺陷（影响正常使用）

### 1. AI 聊天面板亮色模式主题断裂

**现状**：`AIChatSheet.tsx` 第 265 行硬编码 `bg-[#0a0a0a]`（纯黑背景），亮色模式下白色页面中嵌入一块纯黑面板，风格割裂。全部文字颜色也是硬编码的 `text-white/xx`。

**修复**：改用 Tailwind 主题变量 `bg-background text-foreground border-border`，跟随用户主题。

**文件**：`frontend/src/components/AIChatSheet.tsx`

---

## P1 — 应该修的

### 2. 任务搜索不包含子任务

**现状**：`GET /api/tasks/search` 只匹配任务的 `title` 和 `note`，用户如果记得子任务内容但忘了父任务标题就搜不到。

**修复**：改成 LEFT JOIN subtasks，匹配子任务标题后返回其父任务。

**文件**：`backend/src/index.ts` 第 535 行

**用户价值**：高。查找"已完成但忘了放在哪个任务下"的场景很常见。

---

### 3. 所有外部 API 调用缺少超时控制

**现状**：`callAI`、`chatCompletionOpenAI`、`entropy.ts`（random.org/NIST）、`ima-sync.ts`、搜索（Tavily/DuckDuckGo）等所有外部 fetch 都**没有设置 timeout**。Workers 默认无超时，一个外部服务挂起会让整个请求等到 30 秒硬限制。

**修复**：给每个 fetch 加 `AbortSignal.timeout(ms)`（AI 15s / 熵 5s / IMA 10s / 搜索 5s）。

**文件**：`backend/src/index.ts` `callAI`、`chatCompletionOpenAI`、`entropy.ts`、`ima-sync.ts`

**用户价值**：极高。防止某个外部 API 卡死导致整个功能不可用。

---

### 4. 任务页缺少批量操作

**现状**：TasksPage 只能逐条完成/删除任务。没有多选模式、没有"批量完成"/"批量删除"。

**修复**：前端加 checkbox 多选模式 + 浮动操作栏；后端增加批量端点 `POST /api/tasks/batch/complete` / `POST /api/tasks/batch/delete`。

**文件**：`frontend/src/pages/TasksPage.tsx` + `backend/src/index.ts`

**用户价值**：高。任务管理中的高频操作（一次性勾选多个已完成任务）。

---

### 5. Cloudflare Workers AI 缺少 max_tokens 传递

**现状**：`chatCompletionCF` 函数传给 CF AI 的 body 里没有 `max_tokens`，而 `callAI`（工具类调用）有。虽然 CF 有默认值，但聊天端和工具端的行为不一致。

**修复**：在 `chatCompletionCF` 中增加 `max_tokens: 4096`（或从 opts 传入）。

**文件**：`backend/src/index.ts` 第 1738-1766 行

**用户价值**：中。长期运行时 token 生成的可控性。

---

### 6. 大量 D1 查询路由缺少 try/catch

**现状**：任务/子任务/笔记/知识库/硬币的几乎所有路由（~25 个）的 D1 查询都是裸调用。D1 抖动时前端只能看到"服务器内部错误"的通用 500。

**修复**：批量给这些路由加 try-catch，返回 `{ error: '数据库查询失败', detail: e.message }`。

**文件**：`backend/src/index.ts` 第 415-550 行（任务路由）、688-797 行（子任务）、2696-2750 行（笔记）、2448-2480 行（硬币）等

**用户价值**：中。提高故障排查效率。

---

## P2 — 值得加的

### 7. 缺少过期数据定期清理

**现状**：`coin_flips` / `answer_book_draws` / `daily_fortunes` / `sync_logs` / `chat_messages` / `chat_sessions` 无清理机制，持续增长。唯一有清理逻辑的只有周报（保留 52 周）。

**修复**：在 cron handler 中增加清理（硬币保留 90 天、同步日志 30 天、聊天记录 180 天）。

**文件**：`backend/src/index.ts` cron handler

---

### 8. 笔记列表无排序功能

**现状**：NotesPage 显示笔记按后端返回顺序，前端无排序选择器。

**修复**：添加排序下拉框（按更新时间/创建时间/标题），对应后端加 `sort` 参数。

**文件**：`frontend/src/pages/NotesPage.tsx`

---

### 9. 桌面端任务详情建议改用右侧面板

**现状**：`TaskDetailDialog` 使用居中 Dialog（弹窗），而微软 To Do 使用右侧 Sheet 面板。移动端已经是底部 Sheet，桌面端不一致。

**修复**：桌面端改用右侧 Sheet（类似 AI 聊天面板的抽屉）。

**文件**：`frontend/src/pages/TasksPage.tsx` 第 1148-1525 行

---

### 10. 分析页首次进入自动触发

**现状**：AnalysisPage 需要用户手动点击"生成分析"按钮才请求数据。

**修复**：首次进入自动触发一次分析查询，同时保留手动刷新按钮。

**文件**：`frontend/src/pages/AnalysisPage.tsx`

---

### 11. 月报表/环比对比

**现状**：AI 分析端点只有简单的计数。缺少月度趋势、环比对比、效率评分。

**修复**：在 `/api/ai/analysis` 加 `range` 参数支持 30/90/180 天，增加环比统计，让 AI 基于趋势生成更丰富的洞察。

**文件**：`backend/src/index.ts` 第 850 行

---

## 已完成的近期修复（不再需要动）

| 事项 | 完成时间 | 说明 |
|------|---------|------|
| 时区统一北京时间 | 7/27 | 后端 time.ts + 前端 datetime.ts |
| AI 管家定位 + 23→8 工具 | 7/25 | 降 token 成本 |
| 深度思考开关真接入 API | 7/25 | MiMo thinking 显式开关 |
| 工具调用错误兜底 | 7/25 | 失败转 observation 不卡死 |
| 时间显示统一 | 7/27 | 全站 UTC→北京 |
| 侧边栏"列表"入口 | 7/27 | 任务子菜单补列表 |
| 所有任务视图 | 7/27 | Tab 栏加"所有任务" |
| 回复偏好弹窗 | 7/25 | X 关闭 + 保存改完成 |
| 移动端适配 | 7/23-25 | 多轮修复侧栏/FAB/底部截断 |

---

## 我的建议优先级

按"对日常使用的影响"排序：

1. **P0 — AI 面板主题断裂**（先修，因为现在亮色模式用户量可能不小）
2. **P1 — 搜索缺子任务**（功能缺失，影响使用）
3. **P1 — 外部调用缺超时**（防卡死，受益广）
4. **P1 — 批量操作**（高产用户刚需）
5. **P1 — D1 路由缺 try/catch**（改造成本低，收益大）
6. P2 的条目按需投入，不急

建议你把这份报告看完后挑几项想修的告诉我就行，不用一次性全部做。
