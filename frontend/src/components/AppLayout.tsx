import { useEffect, useState, Fragment } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sun, Star, CalendarClock, ListTodo, FileText, BookOpen,
  BarChart3, Coins, Settings, Plus, Search, CheckSquare,
  User, LogOut, Moon, Monitor, KeyRound, Unlink, Download,
  LayoutDashboard, Sparkles, ChevronDown, ChevronsUpDown,
  Home, AlertTriangle, X, ListChecks, Newspaper, Radio,
} from 'lucide-react'
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuSub,
  SidebarMenuSubButton, SidebarMenuSubItem,
  SidebarTrigger, SidebarInset, SidebarSeparator, SidebarProvider,
  SidebarRail, SidebarGroup, SidebarGroupLabel,
  useSidebar,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandSeparator,
} from '@/components/ui/command'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { taskListsApi, authApi, settingsApi, tasksApi, notesApi, kbApi, imaApi, type Task, type Note, type KbDocument } from '@/lib/api'
import { exportAllData } from '@/lib/export'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ConfigDrawer } from '@/components/ConfigDrawer'
import { AIChatSheet } from '@/components/AIChatSheet'

// Search result keyword highlighting
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !text) return text?.slice(0, 80) || ''
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lowerText.indexOf(lowerQuery)
  if (idx === -1) return text.slice(0, 80)
  const start = Math.max(0, idx - 20)
  const end = Math.min(text.length, idx + query.length + 40)
  const snippet = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '')
  const parts = snippet.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === lowerQuery
      ? <mark key={i} className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-800">{part}</mark>
      : part
  )
}

// Navigation data with groups
const navGroups = [
  {
    label: '工作台',
    items: [
      { title: '仪表盘', href: '/', icon: Home },
      { title: '任务', href: '/tasks', icon: ListTodo, children: [
        { title: '列表', href: '/tasks/all', icon: ListChecks },
        { title: '我的一天', href: '/tasks/myday', icon: Sun },
        { title: '重要', href: '/tasks/important', icon: Star },
        { title: '已计划', href: '/tasks/planned', icon: CalendarClock },
      ]},
      { title: '笔记', href: '/notes', icon: FileText },
      { title: '知识库', href: '/knowledge', icon: BookOpen },
      { title: '分析', href: '/analysis', icon: BarChart3 },
    ],
  },
  {
    label: '工具',
    items: [
      { title: '决策工具', href: '/tools', icon: Coins },
      { title: '资讯', href: '/news', icon: Newspaper },
      { title: '监控中心', href: '/monitor', icon: Radio },
      { title: '语义搜索', href: '/search', icon: Sparkles },
    ],
  },
  {
    label: '系统',
    items: [
      { title: '设置', href: '/settings', icon: Settings },
    ],
  },
]

// Flatten nav items for command palette
const navCommands = navGroups.flatMap((group) =>
  group.items.flatMap((item) => {
    if (item.children) {
      return item.children.map((child) => ({ label: child.title, href: child.href, icon: child.icon }))
    }
    return [{ label: item.title, href: item.href, icon: item.icon }]
  })
)

// Generate breadcrumbs from pathname
function getBreadcrumbs(
  pathname: string,
  lists: Array<{ id: string; name: string }>
): Array<{ label: string; href?: string }> {
  if (pathname === '/' || pathname === '') return [{ label: '仪表盘' }]
  if (pathname.startsWith('/tasks/myday')) return [{ label: '任务' }, { label: '我的一天' }]
  if (pathname.startsWith('/tasks/important')) return [{ label: '任务' }, { label: '重要' }]
  if (pathname.startsWith('/tasks/planned')) return [{ label: '任务' }, { label: '已计划' }]
  const listMatch = pathname.match(/^\/tasks\/list\/([^/]+)$/)
  if (listMatch) {
    const list = lists.find((l) => l.id === listMatch[1])
    return [{ label: '任务' }, { label: list?.name ?? '列表' }]
  }
  if (pathname.startsWith('/tasks/search')) return [{ label: '任务' }, { label: '搜索' }]
  if (pathname.startsWith('/tasks')) return [{ label: '任务' }]
  if (pathname.startsWith('/notes')) return [{ label: '笔记' }]
  if (pathname.startsWith('/knowledge')) return [{ label: '知识库' }]
  if (pathname.startsWith('/analysis')) return [{ label: '分析' }]
  if (pathname.startsWith('/tools')) return [{ label: '工具' }, { label: '决策工具' }]
  if (pathname.startsWith('/search')) return [{ label: '工具' }, { label: '语义搜索' }]
  if (pathname.startsWith('/settings')) return [{ label: '设置' }]
  if (pathname.startsWith('/news')) return [{ label: '工具' }, { label: '资讯' }]
  return [{ label: '仪表盘' }]
}

// Navigation item component
function NavItem({
  item,
  isActive,
}: {
  item: typeof navGroups[number]['items'][number]
  isActive: boolean
}) {
  const { setOpenMobile } = useSidebar()
  const location = useLocation()
  const [open, setOpen] = useState(isActive)

  if (item.children) {
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              isActive={isActive}
              className="h-10 gap-3 rounded-lg px-3 transition-all data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <item.icon className="size-[18px]" />
              <span className="flex-1 text-sm text-left">{item.title}</span>
              <ChevronDown className={cn('size-4 transition-transform duration-200', open && 'rotate-180')} />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.children.map((child) => {
                const childActive = location.pathname === child.href
                return (
                  <SidebarMenuSubItem key={child.href}>
                    <SidebarMenuSubButton
                      asChild
                      isActive={childActive}
                      className="h-9 gap-2 rounded-lg px-2.5 text-sm transition-all data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    >
                      <Link to={child.href} onClick={() => setOpenMobile(false)}>
                        <child.icon className="size-4" />
                        <span>{child.title}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                )
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    )
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        className="h-10 gap-3 rounded-lg px-3 transition-all data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Link to={item.href} onClick={() => setOpenMobile(false)}>
          <item.icon className="size-[18px]" />
          <span className="text-sm">{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const [commandOpen, setCommandOpen] = useState(false)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [pwdForm, setPwdForm] = useState({ old: '', new: '', confirm: '' })
  const [pwdLoading, setPwdLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<{ tasks: Task[]; notes: Note[]; kb: KbDocument[] }>({
    tasks: [],
    notes: [],
    kb: [],
  })

  const { data: lists = [] } = useQuery({
    queryKey: ['taskLists'],
    queryFn: taskListsApi.list,
    staleTime: 2 * 60 * 1000,
  })

  // Sync status for warning bar
  const { data: msTodoStatus } = useQuery({
    queryKey: ['msTodoStatus'],
    queryFn: settingsApi.msTodoStatus,
    refetchInterval: 60000,
  })

  const { data: imaStatus } = useQuery({
    queryKey: ['imaStatus'],
    queryFn: imaApi.status,
    refetchInterval: 60000,
  })

  const [syncWarningDismissed, setSyncWarningDismissed] = useState(false)

  const syncFailure = (() => {
    if (msTodoStatus?.authorized && msTodoStatus.lastSync === null) {
      return { source: 'MS Todo', message: '同步失败，请检查授权状态' }
    }
    if (imaStatus?.authorized && imaStatus.lastSync === null) {
      return { source: 'IMA', message: '同步失败，请检查 API Key' }
    }
    return null
  })()

  const showSyncWarning = syncFailure && !syncWarningDismissed

  const disconnectMutation = useMutation({
    mutationFn: (key: string) => settingsApi.update({ [key]: '' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['msTodoStatus'] })
      queryClient.invalidateQueries({ queryKey: ['imaStatus'] })
      toast.success('已断开授权')
    },
    onError: (err: Error) => toast.error(`操作失败: ${err.message}`),
  })

  const exportData = () => {
    toast.promise(exportAllData(), {
      loading: '正在导出数据...',
      success: '数据已导出',
      error: '导出失败',
    })
  }

  const handleChangePassword = async () => {
    if (pwdForm.new !== pwdForm.confirm) {
      toast.error('两次输入的新密码不一致')
      return
    }
    if (pwdForm.new.length < 6) {
      toast.error('新密码至少 6 位')
      return
    }
    setPwdLoading(true)
    try {
      await authApi.changePassword({ oldPassword: pwdForm.old, newPassword: pwdForm.new })
      toast.success('密码已修改，下次登录请使用新密码')
      setPasswordDialogOpen(false)
      setPwdForm({ old: '', new: '', confirm: '' })
    } catch (e) {
      toast.error(`修改失败: ${(e as Error).message}`)
    } finally {
      setPwdLoading(false)
    }
  }

  // Global Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setCommandOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Command palette search
  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults({ tasks: [], notes: [], kb: [] })
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(() => {
      Promise.allSettled([
        tasksApi.search(q).catch(() => [] as Task[]),
        notesApi.search(q).catch(() => [] as Note[]),
        kbApi.search(q).catch(() => [] as KbDocument[]),
      ]).then(([tasksRes, notesRes, kbRes]) => {
        setSearchResults({
          tasks: tasksRes.status === 'fulfilled' ? tasksRes.value : [],
          notes: notesRes.status === 'fulfilled' ? notesRes.value : [],
          kb: kbRes.status === 'fulfilled' ? kbRes.value : [],
        })
        setSearching(false)
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const breadcrumbs = getBreadcrumbs(
    location.pathname,
    lists as Array<{ id: string; name: string }>
  )

  const runCommand = (fn: () => void) => {
    fn()
    setCommandOpen(false)
  }

  // Check if nav item is active
  const isNavActive = (item: typeof navGroups[number]['items'][number]) => {
    if (item.href === '/') return location.pathname === '/'
    if (item.children) {
      return item.children.some((child) => location.pathname === child.href) || location.pathname.startsWith(item.href)
    }
    return location.pathname === item.href || location.pathname.startsWith(item.href)
  }

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <Sidebar>
          <SidebarHeader className="pb-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <Link to="/">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                      <LayoutDashboard className="size-5" />
                    </div>
                    <div className="flex flex-col gap-0.5 leading-none">
                      <span className="font-semibold text-sm">工作台</span>
                      <span className="text-[10px] text-muted-foreground">Personal Workspace</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent className="gap-1 px-2">
            {navGroups.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel className="text-xs font-medium text-muted-foreground/70">{group.label}</SidebarGroupLabel>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <NavItem key={item.href} item={item} isActive={isNavActive(item)} />
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarSeparator />
          <SidebarFooter className="px-2 pb-3">
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      size="lg"
                      className="h-10 gap-3 rounded-lg px-3 data-[state=open]:bg-sidebar-accent"
                    >
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">
                          <User className="size-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-0.5 leading-none text-left">
                        <span className="font-medium text-sm">我</span>
                        <span className="text-[10px] text-muted-foreground">个人工作台</span>
                      </div>
                      <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuItem onClick={() => navigate('/settings')}>
                      <Settings className="mr-2 size-4" />
                      设置
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPasswordDialogOpen(true)}>
                      <KeyRound className="mr-2 size-4" />
                      修改密码
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportData}>
                      <Download className="mr-2 size-4" />
                      导出数据
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => disconnectMutation.mutate('ms_refresh_token')} className="text-destructive">
                      <Unlink className="mr-2 size-4" />
                      断开 MS Todo
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => disconnectMutation.mutate('ima_api_key')} className="text-destructive">
                      <Unlink className="mr-2 size-4" />
                      断开 IMA
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setLogoutDialogOpen(true)} className="text-destructive">
                      <LogOut className="mr-2 size-4" />
                      退出登录
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-50 flex h-12 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6">
            <SidebarTrigger className="-ml-1 size-8" />
            <Separator orientation="vertical" className="h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1
                  return (
                    <Fragment key={idx}>
                      <BreadcrumbItem className={isLast ? '' : 'hidden sm:inline-flex'}>
                        {isLast || !crumb.href ? (
                          <BreadcrumbPage className="text-sm font-medium">{crumb.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link to={crumb.href} className="text-sm">{crumb.label}</Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {!isLast && <BreadcrumbSeparator className="hidden sm:block" />}
                    </Fragment>
                  )
                })}
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCommandOpen(true)}
              >
                <Search className="size-4" />
                <span className="sr-only">搜索</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')}
              >
                <ThemeIcon className="size-4" />
                <span className="sr-only">切换主题</span>
              </Button>
              <AIChatSheet />
              <ConfigDrawer />
            </div>
          </header>
          {/* Sync failure warning bar */}
          {showSyncWarning && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="size-4" />
                <span className="font-medium">{syncFailure!.source}</span>
                <span className="text-amber-600 dark:text-amber-400">{syncFailure!.message}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-xs text-amber-800 hover:text-amber-900 dark:text-amber-200"
                  onClick={() => navigate('/settings')}
                >
                  查看设置
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5 text-amber-600 hover:text-amber-800 dark:text-amber-400"
                  onClick={() => setSyncWarningDismissed(true)}
                >
                  <X className="size-3" />
                </Button>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </SidebarInset>
      </div>

      {/* Logout confirmation */}
      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认退出登录？</AlertDialogTitle>
            <AlertDialogDescription>
              退出后需要重新输入密码才能登录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                logout()
                setLogoutDialogOpen(false)
              }}
            >
              确认退出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Command palette */}
      <CommandDialog
        open={commandOpen}
        onOpenChange={(open) => {
          setCommandOpen(open)
          if (!open) setSearchQuery('')
        }}
        filter={() => 1}
      >
        <CommandInput
          placeholder="输入命令或搜索..."
          value={searchQuery}
          onValueChange={setSearchQuery}
          className="h-11 text-base"
        />
        <CommandList>
          <CommandEmpty>无匹配结果</CommandEmpty>
          <CommandGroup heading="导航">
            {navCommands.map((cmd) => (
              <CommandItem
                key={cmd.href}
                value={cmd.label}
                onSelect={() => runCommand(() => navigate(cmd.href))}
                className="rounded-lg px-2 py-2.5"
              >
                <cmd.icon className="mr-2 size-4" />
                <span className="text-sm">{cmd.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="操作">
            <CommandItem
              value="新建任务"
              onSelect={() => runCommand(() => navigate('/tasks/myday?new=1'))}
              className="rounded-lg px-2 py-2.5"
            >
              <Plus className="mr-2 size-4" />
              <span className="text-sm">新建任务</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="主题">
            <CommandItem
              value="切换到亮色"
              onSelect={() => runCommand(() => setTheme('light'))}
              className="rounded-lg px-2 py-2.5"
            >
              <Sun className="mr-2 size-4" />
              <span className="text-sm">亮色模式</span>
            </CommandItem>
            <CommandItem
              value="切换到暗色"
              onSelect={() => runCommand(() => setTheme('dark'))}
              className="rounded-lg px-2 py-2.5"
            >
              <Moon className="mr-2 size-4" />
              <span className="text-sm">暗色模式</span>
            </CommandItem>
            <CommandItem
              value="跟随系统"
              onSelect={() => runCommand(() => setTheme('system'))}
              className="rounded-lg px-2 py-2.5"
            >
              <Monitor className="mr-2 size-4" />
              <span className="text-sm">跟随系统</span>
            </CommandItem>
          </CommandGroup>

          {/* Search results */}
          {searchQuery.trim().length >= 2 && (
            <>
              <CommandSeparator />
              {searching ? (
                <CommandGroup heading="搜索中">
                  <CommandItem value="searching" disabled className="rounded-lg px-2 py-2.5">
                    <span className="text-sm text-muted-foreground">正在搜索...</span>
                  </CommandItem>
                </CommandGroup>
              ) : (
                <>
                  {searchResults.tasks.length > 0 && (
                    <CommandGroup heading={`任务 (${searchResults.tasks.length})`}>
                      {searchResults.tasks.map((task) => (
                        <CommandItem
                          key={task.id}
                          value={task.title}
                          onSelect={() => runCommand(() => navigate(`/tasks/list/${task.listId}?selected=${task.id}`))}
                          className="rounded-lg px-2 py-2.5"
                        >
                          <CheckSquare className="mr-2 size-4 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="line-clamp-1 text-sm font-medium">{highlightMatch(task.title, searchQuery)}</span>
                            {task.note && (
                              <span className="line-clamp-1 text-xs text-muted-foreground">{highlightMatch(task.note, searchQuery)}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {searchResults.notes.length > 0 && (
                    <CommandGroup heading={`笔记 (${searchResults.notes.length})`}>
                      {searchResults.notes.map((note) => (
                        <CommandItem
                          key={note.id}
                          value={note.title}
                          onSelect={() => runCommand(() => navigate(`/notes/${note.id}`))}
                          className="rounded-lg px-2 py-2.5"
                        >
                          <FileText className="mr-2 size-4 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="line-clamp-1 text-sm font-medium">{highlightMatch(note.title, searchQuery)}</span>
                            {note.content && (
                              <span className="line-clamp-1 text-xs text-muted-foreground">{highlightMatch(note.content, searchQuery)}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {searchResults.kb.length > 0 && (
                    <CommandGroup heading={`知识库 (${searchResults.kb.length})`}>
                      {searchResults.kb.map((doc) => (
                        <CommandItem
                          key={doc.id}
                          value={doc.title}
                          onSelect={() => runCommand(() => navigate(`/knowledge/${doc.id}`))}
                          className="rounded-lg px-2 py-2.5"
                        >
                          <BookOpen className="mr-2 size-4 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="line-clamp-1 text-sm font-medium">{highlightMatch(doc.title, searchQuery)}</span>
                            {doc.content && (
                              <span className="line-clamp-1 text-xs text-muted-foreground">{highlightMatch(doc.content, searchQuery)}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {searchResults.tasks.length === 0 && searchResults.notes.length === 0 && searchResults.kb.length === 0 && (
                    <CommandGroup heading="搜索结果">
                      <CommandItem value="no-results" disabled className="rounded-lg px-2 py-2.5">
                        <span className="text-sm text-muted-foreground">未找到匹配结果</span>
                      </CommandItem>
                    </CommandGroup>
                  )}
                </>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>

      {/* Change password dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="size-5 text-primary" />
              修改密码
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">旧密码</label>
              <input
                type="password"
                value={pwdForm.old}
                onChange={(e) => setPwdForm(p => ({ ...p, old: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">新密码（至少 6 位）</label>
              <input
                type="password"
                value={pwdForm.new}
                onChange={(e) => setPwdForm(p => ({ ...p, new: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">确认新密码</label>
              <input
                type="password"
                value={pwdForm.confirm}
                onChange={(e) => setPwdForm(p => ({ ...p, confirm: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>取消</Button>
            <Button onClick={handleChangePassword} disabled={pwdLoading}>
              {pwdLoading ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
