# UI 整体完善实施计划

> **For agentic workers:** Inline execution - batch execution with checkpoints.

**Goal:** 将个人工作台前端 UI 提升至生产级品质，统一视觉风格、精简导航、打磨页面细节

**Architecture:** 纯前端改造，修改 AppLayout 侧边栏导航、各页面组件和全局 CSS，不涉及后端 API

**Tech Stack:** React + TypeScript + Tailwind CSS + shadcn/ui + React Router

---

### Task 1: 简化侧边栏导航

**Files:**
- Modify: `frontend/src/components/AppLayout.tsx`

- [ ] **Step 1: 重构导航数据结构**

将 `navGroups` 从 3 组改为 1 组核心 + 1 个"更多"入口：

```tsx
const coreNavItems = [
  { title: '首页', href: '/', icon: Home },
  { title: '任务', href: '/tasks', icon: ListTodo },
  { title: '笔记', href: '/notes', icon: FileText },
  { title: '知识库', href: '/knowledge', icon: BookOpen },
  { title: '日记', href: '/journal', icon: BookHeart },
]

const moreNavItems = [
  { title: '专注', href: '/focus', icon: Timer },
  { title: '习惯', href: '/habits', icon: Flame },
  { title: '目标', href: '/goals', icon: Target },
  { title: '收藏', href: '/collections', icon: Bookmark },
  { title: '记录', href: '/records', icon: Wallet },
  { title: '工具', href: '/tools', icon: Sparkles },
  { title: '资讯', href: '/news', icon: Newspaper },
  { title: '监控', href: '/monitor', icon: Radar },
  { title: '分析', href: '/analysis', icon: BarChart3 },
  { title: '备份', href: '/backup', icon: Shield },
  { title: '文件', href: '/files', icon: FolderOpen },
  { title: '设置', href: '/settings', icon: Settings },
]
```

- [ ] **Step 2: 修改 Sidebar 渲染部分**

将 SidebarContent 中的 navGroups 映射改为先渲染 coreNavItems，再渲染一个"更多"展开区域：

```tsx
<SidebarContent className="gap-1 px-2">
  <SidebarGroup>
    <SidebarGroupLabel className="text-xs font-medium text-muted-foreground/70">
      核心
    </SidebarGroupLabel>
    <SidebarMenu>
      {coreNavItems.map((item) => (
        <NavItem key={item.href} item={item} isActive={isNavActive(item)} />
      ))}
    </SidebarMenu>
  </SidebarGroup>
  <SidebarSeparator />
  <SidebarGroup>
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => setMoreExpanded(!moreExpanded)}
          className="text-muted-foreground"
        >
          <MoreHorizontal className="size-4" />
          <span>更多功能</span>
          <ChevronDown className={cn("ml-auto size-4 transition-transform", moreExpanded && "rotate-180")} />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
    {moreExpanded && (
      <SidebarMenu className="mt-1">
        {moreNavItems.map((item) => (
          <NavItem key={item.href} item={item} isActive={isNavActive(item)} />
        ))}
      </SidebarMenu>
    )}
  </SidebarGroup>
</SidebarContent>
```

- [ ] **Step 3: 添加 useState 和所需导入**

在 AppLayout 组件中添加 `const [moreExpanded, setMoreExpanded] = useState(false)`，并导入 `MoreHorizontal`, `ChevronDown` 图标。

- [ ] **Step 4: 更新 navCommands（命令面板）**

将 `navCommands` 改为包含所有导航项（核心 + 更多），确保命令面板功能完整。

### Task 2: 添加页面过渡动画

**Files:**
- Modify: `frontend/src/components/AppLayout.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: 在 index.css 添加页面过渡动画类**

```css
@utility page-enter {
  animation: page-enter 250ms ease-out;
}

@keyframes page-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 2: 在 AppLayout 的 Outlet 外层包装动画**

在 `<Outlet />` 外层添加 `<div className="page-enter">`：

```tsx
<div className="flex-1 overflow-auto pb-16 md:pb-0">
  <div className="page-enter">
    <Outlet />
  </div>
</div>
```

### Task 3: 改造 LoginPage

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: 读取当前 LoginPage 完整内容**

- [ ] **Step 2: 重写 LoginPage 为品牌化登录页**

使用纯色渐变背景、居中卡片式登录框、输入框聚焦动效：

```tsx
import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { KeyRound, Eye, EyeOff, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function LoginPage() {
  const { login, isLoading, error } = useAuth()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    await login(password.trim(), remember)
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-950 via-violet-950/70 to-slate-950 p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20">
            <LayoutDashboard className="size-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">个人工作台</h1>
          <p className="mt-1 text-sm text-white/60">输入密码以继续</p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-white/80">密码</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-xl border-white/10 bg-white/5 pl-10 text-white placeholder:text-white/30 focus:border-white/30 focus:ring-white/20"
                  autoFocus
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-white/60">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-white/20 bg-white/5"
                />
                记住我
              </label>
            </div>

            {error && (
              <div className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading || !password.trim()}
              className="h-11 w-full rounded-xl gap-2 bg-white text-slate-900 hover:bg-white/90"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
                  验证中...
                </span>
              ) : (
                <>
                  <LogIn className="size-4" />
                  进入工作台
                </>
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-white/30">
          个人工作空间 · 安全加密
        </p>
      </div>
    </div>
  )
}
```

### Task 4: 改造 ToolsPage

**Files:**
- Modify: `frontend/src/pages/ToolsPage.tsx`

- [ ] **Step 1: 读取当前 ToolsPage 完整内容**

- [ ] **Step 2: 重写 ToolsPage 为卡片式布局**

每个工具用独立卡片展示，带图标、描述、入口按钮。

### Task 5: 改造 FilesPage

**Files:**
- Modify: `frontend/src/pages/FilesPage.tsx`

- [ ] **Step 1: 读取当前 FilesPage 完整内容**

- [ ] **Step 2: 优化文件列表展示**

使用 grid 卡片布局，统一文件类型图标展示。

### Task 6: 改造 BackupPage

**Files:**
- Modify: `frontend/src/pages/BackupPage.tsx`

- [ ] **Step 1: 读取当前 BackupPage 完整内容**

- [ ] **Step 2: 优化备份页面布局**

使用卡片分区展示导出/导入功能，添加视觉反馈。

### Task 7: 统一页面头部和卡片样式

**Files:**
- Modify: `frontend/src/pages/CollectionsPage.tsx`
- Modify: `frontend/src/pages/RecordsPage.tsx`
- Modify: `frontend/src/pages/MonitorPage.tsx`

- [ ] **Step 1: 为 CollectionsPage 添加统一头部**

- [ ] **Step 2: 为 RecordsPage 添加统一头部**

- [ ] **Step 3: 为 MonitorPage 添加统一头部**

### Task 8: 全局样式微调和移动端适配

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: 确保全局样式一致性**

补充缺失的响应式间距、按钮触控优化。

### Task 9: 验证和修复

- [ ] **Step 1: 运行构建检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 2: 运行构建**

Run: `cd frontend && npm run build`
Expected: 构建成功，无报错