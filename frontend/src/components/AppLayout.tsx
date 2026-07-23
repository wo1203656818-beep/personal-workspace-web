import { useEffect, useState, Fragment } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sun, Star, CalendarClock, ListTodo, FileText, BookOpen,
  BarChart3, Coins, Settings, Plus, Search, CheckSquare,
  User, LogOut, Moon, Monitor, KeyRound, Unlink, Download, LayoutDashboard,
} from 'lucide-react'
import {
  Sidebar, SidebarContent, SidebarHeader, SidebarFooter,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarTrigger, SidebarInset, SidebarSeparator, SidebarProvider,
  useSidebar,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
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

import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { taskListsApi, authApi, settingsApi, tasksApi, notesApi, kbApi, type Task, type Note, type KbDocument } from '@/lib/api'
import { exportAllData } from '@/lib/export'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const systemViews = [
  { title: '我的一天', href: '/tasks/myday', icon: Sun },
  { title: '重要', href: '/tasks/important', icon: Star },
  { title: '已计划', href: '/tasks/planned', icon: CalendarClock },
]

const mainNav = [
  { title: '任务', href: '/tasks', icon: ListTodo },
  { title: '笔记', href: '/notes', icon: FileText },
  { title: '知识库', href: '/knowledge', icon: BookOpen },
  { title: '分析', href: '/analysis', icon: BarChart3 },
  { title: '天意硬币', href: '/coin', icon: Coins },
  { title: '设置', href: '/settings', icon: Settings },
]

const navCommands = [
  ...systemViews.map((v) => ({ label: v.title, href: v.href, icon: v.icon })),
  ...mainNav.map((v) => ({ label: v.title, href: v.href, icon: v.icon })),
]

// 顶部用户菜单项
function MenuButton({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ElementType
  label: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
        danger
          ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
          : 'text-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  )
}

// 侧边栏搜索框（需要在 SidebarProvider 内调用 useSidebar）
function SidebarSearch({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { setOpenMobile } = useSidebar()
  const [searchQuery, setSearchQuery] = useState('')
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && searchQuery.trim()) {
            onNavigate(`/tasks/search?q=${encodeURIComponent(searchQuery.trim())}`)
            setOpenMobile(false)
          }
        }}
        placeholder="搜索任务..."
        className="h-9 rounded-lg border bg-secondary/50 pl-8 text-sm transition-colors placeholder:text-muted-foreground/60 hover:bg-secondary focus:bg-background"
      />
    </div>
  )
}

// 根据路由生成面包屑
function getBreadcrumbs(
  pathname: string,
  lists: Array<{ id: string; name: string }>
): Array<{ label: string; href?: string }> {
  if (pathname === '/' || pathname === '') return [{ label: '首页' }]
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
  if (pathname.startsWith('/analysis')) return [{ label: '数据分析' }]
  if (pathname.startsWith('/coin')) return [{ label: '天意硬币' }]
  if (pathname.startsWith('/settings')) return [{ label: '设置' }]
  return [{ label: '工作台' }]
}

// 导航链接（需在 SidebarProvider 内使用 useSidebar）
function NavLink({
  item,
  isActive,
}: {
  item: (typeof mainNav)[number]
  isActive: boolean
}) {
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarMenuButton
      asChild
      isActive={isActive}
      className="group h-10 gap-3 rounded-lg px-3 transition-all data-[active=true]:bg-primary data-[active=true]:font-medium data-[active=true]:text-primary-foreground data-[active=true]:shadow-sm data-[active=true]:shadow-primary/20 hover:bg-accent hover:text-accent-foreground"
    >
      <Link to={item.href} onClick={() => setOpenMobile(false)}>
        <item.icon className="size-[18px] transition-transform group-hover:scale-105" />
        <span className="text-sm">{item.title}</span>
      </Link>
    </SidebarMenuButton>
  )
}

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { setTheme } = useTheme()
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
  })

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

  // 导出数据 wrapper
  const exportData = () => {
    toast.promise(exportAllData(), {
      loading: '正在导出数据...',
      success: '数据已导出',
      error: '导出失败',
    })
  }

  // 修改密码
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

  // 全局快捷键：cmd+k (mac) / ctrl+k (win/linux) 唤起命令面板
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

  // 命令面板全站搜索（debounce 300ms）
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

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarHeader className="gap-3 pb-2">
            <div className="flex items-center gap-2.5 px-2 pt-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-sm shadow-primary/25">
                <LayoutDashboard className="size-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-bold tracking-tight leading-none">工作台</span>
                <span className="text-[10px] text-muted-foreground leading-none mt-0.5">Personal Workspace</span>
              </div>
            </div>
            <div className="px-2">
              <SidebarSearch onNavigate={navigate} />
            </div>
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent className="gap-1 px-2">
            <SidebarMenu>
              {mainNav.map((item) => {
                const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href))
                return (
                  <SidebarMenuItem key={item.href}>
                    <NavLink item={item} isActive={isActive} />
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarContent>
          <SidebarSeparator />
          <SidebarFooter className="px-2 pb-3">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setLogoutDialogOpen(true)}
                  className="h-10 gap-3 rounded-lg px-3 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut className="size-[18px]" />
                  <span className="text-sm">退出登录</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6">
            <SidebarTrigger className="size-9 rounded-lg" />
            <Separator orientation="vertical" className="h-5" />
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === breadcrumbs.length - 1
                  return (
                    <Fragment key={idx}>
                      <BreadcrumbItem className={isLast ? '' : 'hidden sm:inline-flex'}>
                        {isLast || !crumb.href ? (
                          <BreadcrumbPage className="font-medium">{crumb.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link to={crumb.href}>{crumb.label}</Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {!isLast && <BreadcrumbSeparator className="hidden sm:block" />}
                    </Fragment>
                  )
                })}
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-2">
              <Popover>
                <PopoverTrigger className="inline-flex h-9 items-center justify-center gap-2 rounded-full border bg-card px-1.5 py-1 text-sm font-medium shadow-sm transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                  <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
                    <User className="size-4" />
                  </span>
                  <span className="hidden pr-1.5 sm:inline">我</span>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-2">
                  <div className="flex flex-col gap-0.5">
                    <MenuButton icon={Settings} label="设置" onClick={() => navigate('/settings')} />
                    <MenuButton icon={KeyRound} label="修改密码" onClick={() => setPasswordDialogOpen(true)} />
                    <MenuButton icon={Download} label="导出数据" onClick={exportData} />
                    <div className="my-1 h-px bg-border" />
                    <MenuButton icon={Unlink} label="断开 MS Todo" danger onClick={() => disconnectMutation.mutate('ms_refresh_token')} />
                    <MenuButton icon={Unlink} label="断开 IMA" danger onClick={() => disconnectMutation.mutate('ima_api_key')} />
                    <MenuButton icon={LogOut} label="退出登录" danger onClick={() => setLogoutDialogOpen(true)} />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </header>
          <div className="flex-1 overflow-auto">
            <div key={location.pathname} className="animate-fade-in-up h-full">
              <Outlet />
            </div>
          </div>
        </SidebarInset>
      </div>

      {/* 退出登录二次确认 */}
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

      {/* 命令面板 cmd+k */}
      <CommandDialog
        open={commandOpen}
        onOpenChange={(open) => {
          setCommandOpen(open)
          if (!open) setSearchQuery('')
        }}
        filter={() => 1}
        className="[&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:px-3 [&_[cmdk-input-wrapper]]:py-3"
      >
        <CommandInput
          placeholder="输入命令或搜索..."
          value={searchQuery}
          onValueChange={setSearchQuery}
          className="h-11 text-base placeholder:text-muted-foreground/50"
        />
        <CommandList>
          <CommandEmpty>无匹配结果</CommandEmpty>
          <CommandGroup heading="跳转" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground/70">
            {navCommands.map((cmd) => (
              <CommandItem
                key={cmd.href}
                value={cmd.label}
                onSelect={() => runCommand(() => navigate(cmd.href))}
                className="mx-2 rounded-lg px-2 py-2.5 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
              >
                <span className="flex size-7 items-center justify-center rounded-md bg-secondary">
                  <cmd.icon className="size-4 text-muted-foreground" />
                </span>
                <span className="text-sm">{cmd.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator className="mx-2" />
          <CommandGroup heading="操作" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground/70">
            <CommandItem
              value="新建任务"
              onSelect={() => runCommand(() => navigate('/tasks/myday?new=1'))}
              className="mx-2 rounded-lg px-2 py-2.5 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
            >
              <span className="flex size-7 items-center justify-center rounded-md bg-secondary">
                <Plus className="size-4 text-muted-foreground" />
              </span>
              <span className="text-sm">新建任务</span>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator className="mx-2" />
          <CommandGroup heading="主题" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground/70">
            <CommandItem
              value="切换到亮色"
              onSelect={() => runCommand(() => setTheme('light'))}
              className="mx-2 rounded-lg px-2 py-2.5 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
            >
              <span className="flex size-7 items-center justify-center rounded-md bg-secondary">
                <Sun className="size-4 text-muted-foreground" />
              </span>
              <span className="text-sm">切换到亮色</span>
            </CommandItem>
            <CommandItem
              value="切换到暗色"
              onSelect={() => runCommand(() => setTheme('dark'))}
              className="mx-2 rounded-lg px-2 py-2.5 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
            >
              <span className="flex size-7 items-center justify-center rounded-md bg-secondary">
                <Moon className="size-4 text-muted-foreground" />
              </span>
              <span className="text-sm">切换到暗色</span>
            </CommandItem>
            <CommandItem
              value="跟随系统"
              onSelect={() => runCommand(() => setTheme('system'))}
              className="mx-2 rounded-lg px-2 py-2.5 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
            >
              <span className="flex size-7 items-center justify-center rounded-md bg-secondary">
                <Monitor className="size-4 text-muted-foreground" />
              </span>
              <span className="text-sm">跟随系统</span>
            </CommandItem>
          </CommandGroup>

          {/* 全站搜索 */}
          {searchQuery.trim().length >= 2 && (
            <>
              <CommandSeparator className="mx-2" />
              {searching ? (
                <CommandGroup heading="搜索中" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground/70">
                  <CommandItem value="searching" disabled className="mx-2 rounded-lg px-2 py-2.5">
                    <span className="text-sm text-muted-foreground">正在搜索...</span>
                  </CommandItem>
                </CommandGroup>
              ) : (
                <>
                  {searchResults.tasks.length > 0 && (
                    <CommandGroup heading="任务" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground/70">
                      {searchResults.tasks.map((task) => (
                        <CommandItem
                          key={task.id}
                          value={task.title}
                          onSelect={() => runCommand(() => navigate(`/tasks/list/${task.listId}?selected=${task.id}`))}
                          className="mx-2 rounded-lg px-2 py-2.5 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                        >
                          <span className="flex size-7 items-center justify-center rounded-md bg-secondary">
                            <CheckSquare className="size-4 text-muted-foreground" />
                          </span>
                          <span className="line-clamp-1 text-sm">{task.title}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {searchResults.notes.length > 0 && (
                    <CommandGroup heading="笔记" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground/70">
                      {searchResults.notes.map((note) => (
                        <CommandItem
                          key={note.id}
                          value={note.title}
                          onSelect={() => runCommand(() => navigate(`/notes/${note.id}`))}
                          className="mx-2 rounded-lg px-2 py-2.5 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                        >
                          <span className="flex size-7 items-center justify-center rounded-md bg-secondary">
                            <FileText className="size-4 text-muted-foreground" />
                          </span>
                          <span className="line-clamp-1 text-sm">{note.title}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {searchResults.kb.length > 0 && (
                    <CommandGroup heading="知识库" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground/70">
                      {searchResults.kb.map((doc) => (
                        <CommandItem
                          key={doc.id}
                          value={doc.title}
                          onSelect={() => runCommand(() => navigate(`/knowledge/${doc.id}`))}
                          className="mx-2 rounded-lg px-2 py-2.5 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                        >
                          <span className="flex size-7 items-center justify-center rounded-md bg-secondary">
                            <BookOpen className="size-4 text-muted-foreground" />
                          </span>
                          <span className="line-clamp-1 text-sm">{doc.title}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {searchResults.tasks.length === 0 && searchResults.notes.length === 0 && searchResults.kb.length === 0 && (
                    <CommandGroup heading="搜索结果" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground/70">
                      <CommandItem value="no-results" disabled className="mx-2 rounded-lg px-2 py-2.5">
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

      {/* 修改密码弹窗 */}
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
              <Label className="text-sm text-muted-foreground">旧密码</Label>
              <Input
                type="password"
                value={pwdForm.old}
                onChange={(e) => setPwdForm(p => ({ ...p, old: e.target.value }))}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">新密码（至少 6 位）</Label>
              <Input
                type="password"
                value={pwdForm.new}
                onChange={(e) => setPwdForm(p => ({ ...p, new: e.target.value }))}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">确认新密码</Label>
              <Input
                type="password"
                value={pwdForm.confirm}
                onChange={(e) => setPwdForm(p => ({ ...p, confirm: e.target.value }))}
                className="h-11"
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
