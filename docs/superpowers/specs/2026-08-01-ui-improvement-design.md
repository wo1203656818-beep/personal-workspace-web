# UI 整体完善设计方案

## 概述
对个人工作台前端进行全面 UI 完善，使其达到生产级品质。聚焦视觉统一、导航精简、页面打磨和交互流畅度。

## 改进项

### 1. 简化侧边栏导航
- 核心 6 项：首页、任务、笔记、知识库、日记、设置
- 其余 11 项收纳到"更多"弹出菜单或二级入口
- 导航分组从 3 组改为 1 组核心 + 1 个"更多"入口

### 2. 统一页面头部
- 所有页面统一使用 `icon-badge + 标题 + 副标题 + 操作栏` 布局
- 具体改造：ToolsPage、FilesPage、BackupPage、MonitorPage、CollectionsPage、RecordsPage、LoginPage

### 3. 页面过渡动画
- 在 AppLayout 的 `<Outlet />` 外层包裹动画容器
- 添加 fade-in + slide-up 组合动画，duration 200-300ms

### 4. 改造 ToolsPage
- 从简单标签页改为卡片式布局
- 每个工具用独立卡片展示，带图标、描述、入口按钮
- 添加悬停效果和过渡动画

### 5. 改造 FilesPage
- 文件列表改用 grid 卡片布局
- 统一的文件类型图标 + 大小 + 日期展示
- 添加上传进度条和拖拽区域视觉优化

### 6. 改造 BackupPage
- 导出/导入功能用卡片分区展示
- 添加进度动画和视觉反馈
- 数据大小估算展示

### 7. 改造 LoginPage
- 添加渐变背景（纯色渐变）
- 居中卡片式登录框
- 输入框聚焦动效
- 品牌标识展示

### 8. 卡片组件统一
- 所有页面统一使用 surface-card
- 统一圆角 `--radius-card`(12px)、内边距、阴影
- 修复不一致的卡片样式

### 9. 空/加载状态统一
- 确保所有页面使用统一 EmptyState 组件
- 骨架屏统一使用 PageSkeleton / DetailSkeleton

### 10. 移动端适配
- 统一响应式间距（p-4 md:p-6）
- 确保按钮触控区域 ≥ 44px
- 修复移动端布局断裂

## 技术方案
- 纯前端改造，不涉及后端 API
- 主要修改 CSS 文件、页面组件、布局组件
- 使用现有的 Tailwind CSS + shadcn/ui 组件库
- 不引入新依赖

## 涉及文件
- `frontend/src/index.css` - 全局样式补充
- `frontend/src/components/AppLayout.tsx` - 导航 + 动画
- `frontend/src/pages/LoginPage.tsx` - 登录页改造
- `frontend/src/pages/ToolsPage.tsx` - 工具页改造
- `frontend/src/pages/FilesPage.tsx` - 文件页改造
- `frontend/src/pages/BackupPage.tsx` - 备份页改造
- 以及各页面的组件文件