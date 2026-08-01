# 三功能设计文档：日历视图 + 专注 AI 分析 + 稍后读

## 概述

为个人工作台增加三个实用功能，全部基于已有数据/API 实现，无需新增数据库表。

---

## 功能 A：日历视图

### 目标
在日历上统一展示有截止日期的任务、日记条目、习惯打卡，提供按天/月查看的全局日程视图。

### 数据来源（全部已存在）
| 数据 | 表 | 字段 |
|------|-----|------|
| 任务截止日期 | `tasks` | `dueDate` (text, yyyy-MM-dd) |
| 日记日期 | `journal_entries` | `date` (text, yyyy-MM-dd) |
| 习惯打卡日期 | `habit_checkins` | `date` (text, yyyy-MM-dd) |

### 后端

**新文件**: `backend/src/routes/calendar.ts`

**API**: `GET /api/calendar/items?month=2026-08`
- 查询指定月份的数据：
  - `tasks` 表中 `dueDate` 在该月且未完成的
  - `journal_entries` 表中 `date` 在该月的
  - `habit_checkins` 表中 `date` 在该月的（按天聚合计数）
- 返回统一格式：
```json
{
  "month": "2026-08",
  "days": {
    "2026-08-01": {
      "tasks": [{ "id": "...", "title": "...", "listId": "...", "isCompleted": false }],
      "journals": [{ "id": "...", "title": "...", "mood": "..." }],
      "habits": [{ "habitId": "...", "habitName": "...", "count": 1 }]
    }
  }
}
```

**注册路由**: 在 `backend/src/index.ts` 添加 `app.route('/api/calendar', calendar)`

### 前端

**新文件**: `frontend/src/pages/CalendarPage.tsx`
- 使用 shadcn/ui `calendar.tsx` 组件作为基础
- 月视图为主，日历格子内显示：
  - 任务圆点（蓝色）
  - 日记圆点（黄色）
  - 习惯圆点（绿色）
  - 点击日期弹出当日详情面板
- 顶部导航：上个月 / 下个月 / 今天
- 右侧或底部详情面板：选中日期的任务列表、日记列表、习惯打卡列表
- 点击任务跳转到 `/tasks`，点击日记跳转到 `/journal`

**新文件**: `frontend/src/lib/api/calendar.ts`
```typescript
export const calendarApi = {
  getMonth: (month: string) => api.get(`calendar/items?month=${month}`).json<CalendarMonthData>()
}
```

**修改文件**:
- `frontend/src/router.tsx` — 添加 `/calendar` 路由
- `frontend/src/components/AppLayout.tsx` — 在"核心"导航区添加"日历"项

### 组件树
```
CalendarPage
├── CalendarHeader (年月导航 + 今天按钮)
├── CalendarGrid (shadcn/ui Calendar)
│   └── DayCell
│       ├── TaskDot (蓝色)
│       ├── JournalDot (黄色)
│       └── HabitDot (绿色)
└── DayDetailPanel (选中日期后显示)
    ├── TaskList (点击跳转)
    ├── JournalList (点击跳转)
    └── HabitList
```

---

## 功能 B：专注 AI 分析

### 目标
对专注记录进行 AI 深度分析，生成有洞察力的报告，帮助用户了解自己的专注模式。

### 数据来源（全部已存在）
| 数据 | 表 | 字段 |
|------|-----|------|
| 专注会话 | `focus_sessions` | minutes, completed, taskId, taskTitle, startedAt, endedAt |

### 后端

**新增端点**: `GET /api/focus/ai-analysis`
- 读取最近 30 天已完成的专注会话
- 构建分析 prompt，调用 Workers AI（使用当前默认 AI 配置）
- 分析维度：
  1. **每日趋势**：最近 7 天/30 天专注时长变化，识别上升/下降趋势
  2. **效率时段**：按小时聚合，找出专注高峰时段（如"上午 9-11 点专注时长占全天的 40%"）
  3. **任务维度**：按 taskTitle 聚合，显示哪些任务投入时间最多
  4. **AI 建议**：基于数据给出 2-3 条可操作建议
- 结果缓存到 KV，key 为 `focus_ai_analysis`, TTL 3600 秒（1 小时）
- 缓存未命中时才调用 AI，命中直接返回缓存结果

**返回格式**:
```json
{
  "generatedAt": "2026-08-01T12:00:00Z",
  "fromCache": true,
  "report": {
    "summary": "过去30天你共专注 xx 小时，日均 xx 分钟...",
    "dailyTrend": "最近一周专注时长呈上升趋势，周环比 +xx%",
    "peakHours": "你最专注的时段是 9:00-11:00（占总量 40%）",
    "topTasks": [
      { "taskTitle": "项目A", "totalMinutes": 600, "sessionCount": 12 }
    ],
    "suggestions": [
      "建议把重要任务安排在上午 9-11 点",
      "周三专注时长偏低，可以尝试调整"
    ]
  }
}
```

### 前端

**修改文件**: `frontend/src/pages/FocusPage.tsx`
- 在专注页面新增"AI 分析"标签页或卡片区
- 显示 AI 生成的文本报告
- 加载骨架屏（Skeleton）
- 手动刷新按钮
- 显示"上次生成时间"和"来自缓存"标识

**修改文件**: `frontend/src/lib/api/focus.ts`
- 新增 `aiAnalysis()` 方法

### 组件树
```
FocusPage
├── TimerSection (原有番茄钟)
├── StatsSection (原有统计卡片)
└── AIAnalysisSection (新增)
    ├── AITrendCard (每日趋势)
    ├── AIPeakHoursCard (效率时段)
    ├── AITopTasksCard (任务维度)
    └── AISuggestionsCard (AI 建议)
```

---

## 功能 C：稍后读 / 阅读列表

### 目标
为 Telegram bot 自动保存的链接和手动添加的链接提供一个专门的阅读管理界面，支持分类筛选、阅读进度追踪、笔记记录。

### 数据来源（全部已存在）
| 数据 | 表 | 字段 |
|------|-----|------|
| 收藏链接 | `bookmarks` | id, url, title, summary, tags, readStatus, progress, readingNote, createdAt |

### 后端

**现有 API 无需修改**（已有完整 CRUD）：
- `GET /api/collections/bookmarks?status=unread` — 列表
- `POST /api/collections/bookmarks` — 创建
- `PUT /api/collections/bookmarks/:id` — 更新（含 readStatus, progress, readingNote）
- `DELETE /api/collections/bookmarks/:id` — 删除

**新增端点（可选增强）**: `POST /api/collections/bookmarks/:id/summarize`
- 抓取链接内容（使用 `fetch`）
- 调用 Workers AI 生成摘要
- 保存到 `bookmarks.summary`

### 前端

**修改文件**: `frontend/src/pages/CollectionsPage.tsx`
- 在现有标签页基础上新增"稍后读"标签
- 标签结构：书影剧 / 稍后读

**稍后读界面**：
- 列表模式：卡片式展示链接，每项显示：
  - 标题（可点击跳转）
  - URL（截断显示）
  - 摘要（如有）
  - 标签（彩色 badge）
  - 阅读状态 badge（未读/已读/归档）
  - 阅读进度条（0-100%）
  - 操作按钮：已读/未读切换、归档、编辑、删除
- 顶部筛选栏：全部 / 未读 / 已读 / 归档
- 新建按钮：手动添加链接（弹窗输入 URL + 标题 + 标签）
- 编辑弹窗：修改标题、标签、阅读进度、阅读笔记

**修改文件**: `frontend/src/lib/api/collections.ts`
- 新增 `summarize(id)` 方法（可选）

### 组件树
```
CollectionsPage
├── Tabs
│   ├── 书影剧 (Tab 1 — 原有内容)
│   └── 稍后读 (Tab 2 — 新增)
│       ├── FilterBar (全部/未读/已读/归档)
│       ├── AddBookmarkButton (弹窗输入)
│       ├── BookmarkList
│       │   └── BookmarkCard
│       │       ├── Title + URL
│       │       ├── Summary + Tags
│       │       ├── ReadStatus badge
│       │       ├── ProgressBar
│       │       └── ActionButtons (已读/归档/编辑/删除)
│       └── BookmarkEditDialog (编辑弹窗)
```

---

## 实现顺序

建议按以下顺序实现，因为依赖关系递进：

1. **功能 C：稍后读** — 仅前端改动（后端 API 已有），最快见效
2. **功能 A：日历视图** — 后端新路由 + 前端新页面，独立模块
3. **功能 B：专注 AI 分析** — 后端新端点 + 前端修改，涉及 AI 调用

## 不变项

- 不新增数据库表
- 不修改现有 API 的返回格式
- 不修改现有路由结构
- 不修改现有数据流
- 不新增 npm 依赖