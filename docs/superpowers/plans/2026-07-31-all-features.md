# 全部功能实施计划

> **For agentic workers:** 10个功能并行实施，按优先级分组。

**目标:** 在现有 personal-workspace 项目上新增 10 个功能

**技术栈:** React 19 + TypeScript + Tailwind CSS 4 + Cloudflare Workers + Hono + D1 + Drizzle ORM + R2

---

## 功能分组 & 实施顺序

### 高优先级（核心体验）
1. **日记/日志** - 新页面 + 后端 API + 数据库表
2. **番茄钟实时倒计时** - 修改 FocusPage
3. **首页看板增强** - 修改 DashboardPage
4. **AI 对话历史管理** - 修改聊天组件

### 中优先级
5. **数据备份/恢复** - 后端 API + 前端页面
6. **生日提醒** - 扩展倒数日，增加年重复
7. **文件管理（R2 浏览器）** - 新页面

### 低优先级
8. **白噪音** - 专注页集成
9. **稍后读进度** - 收藏页扩展
10. **AI 图片生成** - 工具页新增

---

## 文件结构

### 日记/日志
- 创建: `backend/src/routes/journal.ts`
- 创建: `frontend/src/pages/JournalPage.tsx`
- 修改: `backend/src/index.ts` (注册路由)
- 修改: `frontend/src/App.tsx` (添加路由)
- 修改: `frontend/src/components/AppLayout.tsx` (添加导航)
- 修改: `backend/src/schema.ts` (添加 journal_entries 表)
- 修改: `backend/drizzle/` (添加迁移文件)

### 番茄钟实时倒计时
- 修改: `frontend/src/pages/FocusPage.tsx`

### 首页看板增强
- 修改: `frontend/src/pages/DashboardPage.tsx`

### AI 对话历史管理
- 修改: `frontend/src/components/chat/ChatHistorySidebar.tsx`
- 修改: `frontend/src/components/AIChatSheet.tsx`

### 数据备份/恢复
- 创建: `backend/src/routes/backup.ts`
- 创建: `frontend/src/pages/BackupPage.tsx`
- 修改: `backend/src/index.ts`
- 修改: `frontend/src/App.tsx`
- 修改: `frontend/src/components/AppLayout.tsx`

### 生日提醒
- 修改: `backend/src/routes/goals.ts`
- 修改: `frontend/src/pages/GoalsPage.tsx`
- 修改: `backend/src/schema.ts`

### 文件管理
- 创建: `backend/src/routes/files.ts`
- 创建: `frontend/src/pages/FilesPage.tsx`
- 修改: `backend/src/index.ts`
- 修改: `frontend/src/App.tsx`
- 修改: `frontend/src/components/AppLayout.tsx`

### 白噪音
- 创建: `frontend/src/components/tasks/AmbientSounds.tsx`
- 修改: `frontend/src/pages/FocusPage.tsx`

### 稍后读进度
- 修改: `frontend/src/pages/CollectionsPage.tsx`
- 修改: `backend/src/routes/collections.ts`

### AI 图片生成
- 创建: `frontend/src/components/tools/AiImageTool.tsx`
- 修改: `frontend/src/pages/ToolsPage.tsx`