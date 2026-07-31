import { useEffect, useState, lazy, Suspense } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sun,
  ListTodo,
  FileText,
  BookOpen,
  Settings,
  ChevronsUpDown,
  User,
  LogOut,
  Moon,
  Monitor,
  KeyRound,
  Unlink,
  Download,
  LayoutDashboard,
  Newspaper,
  Home,
  Sparkles,
  Radar,
  BarChart3,
  Flame,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarSeparator,
  SidebarProvider,
  SidebarRail,
  SidebarGroup,
  SidebarGroupLabel,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { settingsApi, imaApi } from '@/lib/api'
import { exportAllData } from '@/lib/export'
import { toast } from 'sonner'

import { NavItem } from '@/components/layout/NavItem'
import { AppHeader } from '@/components/layout/AppHeader'
import { SyncWarningBar } from '@/components/layout/SyncWarningBar'
import { ChangePasswordDialog } from '@/components/layout/ChangePasswordDialog'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'

const CommandPaletteDialog = lazy(() =>
  import('@/components/layout/CommandPaletteDialog').then((m) => ({
    default: m.CommandPaletteDialog,
  })),
)

const navGroups = [
  {
    label: '核心',
    items: [
      { title: '首页', href: '/', icon: Home },
      { title: '任务', href: '/tasks', icon: ListTodo },
      { title: '笔记', href: '/notes', icon: FileText },
      { title: '知识库', href: '/knowledge', icon: BookOpen },
    ],
  },
  {
    label: '更多',
    items: [
      { title: '资讯', href: '/news', icon: Newspaper },
      { title: '监控', href: '/monitor', icon: Radar },
      { title: '工具', href: '/tools', icon: Sparkles },
      { title: '习惯', href: '/habits', icon: Flame },
      { title: '分析', href: '/analysis', icon: BarChart3 },
      { title: '设置', href: '/settings', icon: Settings },
    ],
  },
]

const navCommands = navGroups.flatMap((group) =>
  group.items.map((item) => ({
    label: item.title,
    href: item.href,
    icon: item.icon,
  })),
)

function getBreadcrumbs(pathname: string): Array<{ label: string; href?: string }> {
  if (pathname === '/' || pathname === '') return [{ label: '首页' }]
  if (pathname.startsWith('/tasks')) return [{ label: '任务' }]
  if (pathname.startsWith('/notes')) return [{ label: '笔记' }]
  if (pathname.startsWith('/knowledge')) return [{ label: '知识库' }]
  if (pathname.startsWith('/news')) return [{ label: '资讯' }]
  if (pathname.startsWith('/habits')) return [{ label: '习惯' }]
  if (pathname.startsWith('/settings')) return [{ label: '设置' }]
  return [{ label: '首页' }]
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

  const breadcrumbs = getBreadcrumbs(location.pathname)

  const isNavActive = (item: (typeof navGroups)[number]['items'][number]) => {
    if (item.href === '/') return location.pathname === '/'
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
                <SidebarGroupLabel className="text-xs font-medium text-muted-foreground/70">
                  {group.label}
                </SidebarGroupLabel>
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
                    <DropdownMenuItem
                      onClick={() => disconnectMutation.mutate('ms_refresh_token')}
                      className="text-destructive"
                    >
                      <Unlink className="mr-2 size-4" />
                      断开 MS Todo
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => disconnectMutation.mutate('ima_api_key')}
                      className="text-destructive"
                    >
                      <Unlink className="mr-2 size-4" />
                      断开 IMA
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setLogoutDialogOpen(true)}
                      className="text-destructive"
                    >
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
          <AppHeader
            breadcrumbs={breadcrumbs}
            themeIcon={ThemeIcon}
            onToggleTheme={() =>
              setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark')
            }
          />
          {showSyncWarning && (
            <SyncWarningBar
              syncFailure={syncFailure!}
              onNavigate={navigate}
              onDismiss={() => setSyncWarningDismissed(true)}
            />
          )}
          <div className="flex-1 overflow-auto pb-14 md:pb-0">
            <Outlet />
          </div>
        </SidebarInset>
      </div>

      <MobileBottomNav />

      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认退出登录？</AlertDialogTitle>
            <AlertDialogDescription>退出后需要重新输入密码才能登录。</AlertDialogDescription>
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

      <Suspense fallback={null}>
        <CommandPaletteDialog
          open={commandOpen}
          onOpenChange={setCommandOpen}
          navCommands={navCommands}
          onSetTheme={setTheme}
        />
      </Suspense>

      <ChangePasswordDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} />
    </SidebarProvider>
  )
}
