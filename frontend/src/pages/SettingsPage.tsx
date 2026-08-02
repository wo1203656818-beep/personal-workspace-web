import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Sun, Moon, Monitor, Zap, ShieldAlert, Database, Trash2, Tags, Bell, BellOff,
  Search, Download, Upload, FileJson, RotateCcw, Info, FileSpreadsheet, FileText as FileTextIcon, Archive,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { settingsApi, imaApi, backupApi } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import { SettingsSkeleton } from '@/components/PageSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SettingCard } from '@/components/settings/SettingCard'
import { MsTodoSyncCard } from '@/components/settings/MsTodoSyncCard'
import { ImaSyncCard } from '@/components/settings/ImaSyncCard'
import { TelegramConfigCard } from '@/components/settings/TelegramConfigCard'
import { SyncLogCenter } from '@/components/settings/SyncLogCenter'
import { AiConfigManager } from '@/components/settings/AiConfigManager'
import { TagManager } from '@/components/tags/TagManager'
import { exportFullData, exportTasksCsv, exportNotesMarkdown } from '@/lib/export-csv'
import { cn } from '@/lib/utils'
import { formatCST } from '@/lib/datetime'
import { usePageTitle } from '@/hooks/use-page-title'

export function SettingsPage() {
  usePageTitle('设置')
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const [settingsTab, setSettingsTab] = useState('general')
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmToggleKey, setConfirmToggleKey] = useState<string | null>(null)
  const [confirmToggleLabel, setConfirmToggleLabel] = useState('')
  const [confirmToggleEnabled, setConfirmToggleEnabled] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [importError, setImportError] = useState('')
  const SETTINGS_VERSION = '1.0.0'

  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  })

  const { data: msTodoStatus } = useQuery({
    queryKey: ['msTodoStatus'],
    queryFn: settingsApi.msTodoStatus,
  })

  const { data: imaStatus } = useQuery({
    queryKey: ['imaStatus'],
    queryFn: imaApi.status,
  })

  // 搜索过滤条件
  const searchKeywords = searchQuery.toLowerCase().trim()
  const filteredTabs = searchKeywords
    ? ['general', 'ai', 'sync', 'data'].filter((tab) => {
        const tabLabels: Record<string, string> = {
          general: '通用界面主题标签管理',
          ai: 'AI配置分析周报模型',
          sync: '同步同步服务微软IMA电报通知推送',
          data: '数据危险操作清空备份导入导出',
        }
        return tabLabels[tab].includes(searchKeywords.replace(/\s/g, ''))
      })
    : null

  const resetMutation = useMutation({
    mutationFn: () => settingsApi.resetData(),
    onSuccess: () => {
      toast.success('数据已清空')
      queryClient.invalidateQueries()
    },
    onError: (err: Error) => {
      toast.error(`清空失败: ${err.message}`)
    },
  })

  // 导出设置为 JSON
  const handleExportSettings = useCallback(() => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `settings-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('设置已导出')
  }, [settings])

  // 导入设置
  const handleImportSettings = useCallback(() => {
    setImportError('')
    try {
      const parsed = JSON.parse(importJson)
      if (typeof parsed !== 'object' || parsed === null) {
        setImportError('无效的 JSON 格式')
        return
      }
      settingsApi.update(parsed).then(() => {
        queryClient.invalidateQueries({ queryKey: ['settings'] })
        toast.success('设置已导入')
        setImportDialogOpen(false)
        setImportJson('')
      }).catch((err: Error) => {
        setImportError(`导入失败: ${err.message}`)
      })
    } catch {
      setImportError('无效的 JSON 格式')
    }
  }, [importJson, queryClient])

  return (
    <div className="page-layout">
      <div className="page-header">
        <div className="page-header-left">
          <div className="icon-badge size-9 bg-gradient-to-br from-slate-500 to-slate-400 md:size-10">
            <Monitor className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">设置</h1>
              <Badge variant="outline" className="rounded-full px-2 text-[10px] font-mono">
                v{SETTINGS_VERSION}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">管理界面、AI 与同步配置</p>
          </div>
        </div>
      </div>

      <div className="page-content-wide">
        {/* 搜索过滤栏 */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索设置..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 rounded-xl pl-9 text-sm"
          />
        </div>

      {isLoading ? (
        <SettingsSkeleton />
      ) : (
        <Tabs value={settingsTab} onValueChange={setSettingsTab}>
          <TabsList className="w-full justify-start gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <TabsTrigger value="general" className={cn(filteredTabs && !filteredTabs.includes('general') && 'hidden')}>通用</TabsTrigger>
            <TabsTrigger value="ai" className={cn(filteredTabs && !filteredTabs.includes('ai') && 'hidden')}>AI</TabsTrigger>
            <TabsTrigger value="sync" className={cn(filteredTabs && !filteredTabs.includes('sync') && 'hidden')}>同步</TabsTrigger>
            <TabsTrigger value="data" className={cn(filteredTabs && !filteredTabs.includes('data') && 'hidden')}>数据</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4 space-y-5">
            <SettingCard
              icon={Sun}
              title="界面主题"
              description="选择适合你的界面外观"
              gradient="from-orange-400 to-amber-400"
            >
              <div className="space-y-3">
                <RadioGroup
                  value={theme}
                  onValueChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                >
                  {[
                    { value: 'light', label: '亮色', icon: Sun },
                    { value: 'dark', label: '暗色', icon: Moon },
                    { value: 'system', label: '跟随系统', icon: Monitor },
                  ].map((t) => (
                    <Label
                      key={t.value}
                      htmlFor={`theme-${t.value}`}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 transition-all duration-200 hover:bg-accent/60 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:shadow-sm"
                    >
                      <RadioGroupItem value={t.value} id={`theme-${t.value}`} />
                      <t.icon className="size-4" />
                      <span className="text-sm font-medium">{t.label}</span>
                    </Label>
                  ))}
                </RadioGroup>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-muted-foreground"
                  onClick={() => setTheme('system')}
                >
                  <RotateCcw className="size-3" />
                  恢复默认（跟随系统）
                </Button>
              </div>
            </SettingCard>
            <SettingCard
              icon={Tags}
              title="标签管理"
              description="创建、编辑或删除标签，用于给任务和笔记分类"
              gradient="from-blue-500 to-cyan-500"
            >
              <TagManager />
            </SettingCard>
          </TabsContent>

          <TabsContent value="ai" className="mt-4 space-y-5">
            <SettingCard
              icon={Zap}
              title="AI 配置"
              description="配置 AI 分析、周报与任务拆解的模型来源（可添加多个并自由指定默认）"
              gradient="from-violet-500 to-fuchsia-500"
            >
              <AiConfigManager />
            </SettingCard>
          </TabsContent>

          <TabsContent value="sync" className="mt-4 space-y-5">
            {/* 最近同步时间概览 */}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
              <Info className="size-3.5 shrink-0" />
              <span>微软 To Do：{msTodoStatus?.lastSync ? formatCST(msTodoStatus.lastSync, 'datetime') : '尚未同步'}</span>
              <span className="hidden sm:inline">·</span>
              <span>IMA：{imaStatus?.lastSync ? formatCST(imaStatus.lastSync, 'datetime') : '尚未同步'}</span>
            </div>

            <MsTodoSyncCard />
            <ImaSyncCard />
            <TelegramConfigCard />

            {/* 通知开关 */}
            {settings.telegram_bot_token_set === '1' && settings.telegram_chat_id && (
              <SettingCard
                icon={Bell}
                title="通知推送"
                description="管理 Telegram 通知推送内容"
                gradient="from-rose-500 to-pink-500"
              >
                <div className="space-y-4">
                  <NotificationToggle
                    label="每日代办建议"
                    description="每天早上 6 点推送今日行动建议"
                    settingKey="notify_daily_suggestions"
                    currentValue={settings.notify_daily_suggestions}
                    queryClient={queryClient}
                    onConfirmToggle={(key, label, enabled) => {
                      setConfirmToggleKey(key)
                      setConfirmToggleLabel(label)
                      setConfirmToggleEnabled(enabled)
                    }}
                    confirmPending={confirmToggleKey === 'notify_daily_suggestions'}
                  />
                  <NotificationToggle
                    label="周报推送"
                    description="每周日早上 9 点推送个人周报"
                    settingKey="notify_weekly_report"
                    currentValue={settings.notify_weekly_report}
                    queryClient={queryClient}
                    onConfirmToggle={(key, label, enabled) => {
                      setConfirmToggleKey(key)
                      setConfirmToggleLabel(label)
                      setConfirmToggleEnabled(enabled)
                    }}
                    confirmPending={confirmToggleKey === 'notify_weekly_report'}
                  />
                </div>
              </SettingCard>
            )}

            {/* 确认切换对话框 */}
            <AlertDialog
              open={confirmToggleKey !== null}
              onOpenChange={(open) => { if (!open) setConfirmToggleKey(null) }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认{confirmToggleEnabled ? '关闭' : '开启'}推送</AlertDialogTitle>
                  <AlertDialogDescription>
                    确定要{confirmToggleEnabled ? '关闭' : '开启'}"{confirmToggleLabel}"吗？
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setConfirmToggleKey(null)}>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={() => {
                    if (confirmToggleKey) {
                      const enabled = confirmToggleEnabled
                      settingsApi.update({ [confirmToggleKey]: enabled ? '0' : '1' }).then(() => {
                        queryClient.invalidateQueries({ queryKey: ['settings'] })
                        toast.success(`${confirmToggleLabel}已${enabled ? '关闭' : '开启'}`)
                      }).catch((err: Error) => {
                        toast.error(`操作失败: ${err.message}`)
                      })
                    }
                    setConfirmToggleKey(null)
                  }}>确认</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <SyncLogCenter />
          </TabsContent>

          <TabsContent value="data" className="mt-4 space-y-5">
            {/* 设置导入/导出 */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="icon-badge size-8 bg-gradient-to-br from-emerald-500 to-teal-500">
                    <FileJson className="size-4" />
                  </div>
                  设置导入/导出
                </CardTitle>
                <CardDescription>导出设置为 JSON 文件，或从备份文件恢复</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2 rounded-lg" onClick={handleExportSettings}>
                    <Download className="size-4" /> 导出设置
                  </Button>
                  <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2 rounded-lg">
                        <Upload className="size-4" /> 导入设置
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>导入设置</DialogTitle>
                        <DialogDescription>粘贴之前导出的 JSON 设置内容，或上传 .json 文件</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept=".json"
                            className="h-9 text-xs"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              const reader = new FileReader()
                              reader.onload = (ev) => {
                                setImportJson(ev.target?.result as string)
                                setImportError('')
                              }
                              reader.readAsText(file)
                              // 重置 input 以允许重复选择同一文件
                              e.target.value = ''
                            }}
                          />
                        </div>
                        <div className="relative">
                          <div className="absolute inset-x-0 top-3 flex items-center px-3">
                            <span className="h-px flex-1 bg-border" />
                            <span className="px-2 text-xs text-muted-foreground">或</span>
                            <span className="h-px flex-1 bg-border" />
                          </div>
                          <div className="pt-8" />
                        </div>
                        <textarea
                          placeholder='{"key": "value", ...}'
                          value={importJson}
                          onChange={(e) => { setImportJson(e.target.value); setImportError('') }}
                          className="min-h-[200px] w-full rounded-xl border bg-muted/20 p-3 text-xs font-mono outline-none focus:ring-2 focus:ring-ring"
                        />
                        {importError && (
                          <p className="text-xs text-destructive">{importError}</p>
                        )}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => { setImportDialogOpen(false); setImportJson(''); setImportError('') }}>取消</Button>
                        <Button onClick={handleImportSettings} disabled={!importJson.trim()}>导入</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>

            {/* 数据导出 */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="icon-badge size-8 bg-gradient-to-br from-blue-500 to-cyan-500">
                    <Archive className="size-4" />
                  </div>
                  数据导出
                </CardTitle>
                <CardDescription>导出你的数据，支持多种格式</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2 rounded-lg" onClick={() => {
                    toast.promise(exportFullData(), {
                      loading: '正在导出全部数据...',
                      success: '全部数据已导出',
                      error: '导出失败',
                    })
                  }}>
                    <Download className="size-4" /> 导出全部 JSON
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2 rounded-lg" onClick={() => {
                    toast.promise(exportTasksCsv(), {
                      loading: '正在导出任务...',
                      success: '任务已导出为 CSV',
                      error: '导出失败',
                    })
                  }}>
                    <FileSpreadsheet className="size-4" /> 导出任务 CSV
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2 rounded-lg" onClick={() => {
                    toast.promise(exportNotesMarkdown(), {
                      loading: '正在导出笔记...',
                      success: '笔记已导出为 Markdown',
                      error: '导出失败',
                    })
                  }}>
                    <FileTextIcon className="size-4" /> 导出笔记 Markdown
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 数据导入 */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="icon-badge size-8 bg-gradient-to-br from-amber-500 to-orange-500">
                    <Upload className="size-4" />
                  </div>
                  数据导入
                </CardTitle>
                <CardDescription>从备份文件恢复数据</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    导入将合并数据到现有数据中，不会覆盖已有记录。导入前建议先导出当前数据。
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept=".json"
                      className="h-9 text-xs"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = async (ev) => {
                          try {
                            const json = JSON.parse(ev.target?.result as string)
                            if (!json.data || typeof json.data !== 'object') {
                              toast.error('无效的备份文件格式')
                              return
                            }
                            await backupApi.import(json)
                            toast.success('数据已导入')
                            queryClient.invalidateQueries()
                          } catch (err) {
                            toast.error(`导入失败: ${err instanceof Error ? err.message : '格式错误'}`)
                          }
                        }
                        reader.readAsText(file)
                        // 重置 input 以允许重复选择同一文件
                        e.target.value = ''
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-destructive/30 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-destructive">
                  <div className="icon-badge size-7 bg-gradient-to-br from-red-500 to-rose-500">
                    <ShieldAlert className="size-4" />
                  </div>
                  危险操作
                </CardTitle>
                <CardDescription className="text-destructive/80">
                  以下操作会删除数据，请谨慎使用
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-card p-4">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-destructive/10">
                    <Database className="size-4 text-destructive" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">清空所有数据</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      永久删除所有任务、笔记、知识库及配置数据，且无法恢复。
                    </p>
                  </div>
                  <AlertDialog
                    onOpenChange={(open) => {
                      if (!open) setResetConfirmText('')
                    }}
                  >
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="gap-2 rounded-lg">
                        <Trash2 className="size-4" /> 清空
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-destructive">
                          确认清空所有数据？
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          此操作将永久删除所有任务、笔记、知识库及配置数据，且无法恢复。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="space-y-3 py-2">
                        <div className="rounded-xl bg-destructive/5 p-3 text-sm text-destructive/80">
                          <p className="font-medium text-destructive">请先备份数据</p>
                          <p className="mt-1 text-xs">
                            在执行清空前，请确保已通过顶部菜单「导出数据」功能备份了重要信息。
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">
                            请输入「确认清空」以继续
                          </Label>
                          <Input
                            value={resetConfirmText}
                            onChange={(e) => setResetConfirmText(e.target.value)}
                            placeholder="确认清空"
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={resetConfirmText !== '确认清空'}
                          onClick={() => resetMutation.mutate()}
                        >
                          确认清空
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
      </div>
    </div>
  )
}

function NotificationToggle({
  label,
  description,
  settingKey,
  currentValue,
  queryClient,
  onConfirmToggle,
  confirmPending,
}: {
  label: string
  description: string
  settingKey: string
  currentValue?: string
  queryClient: ReturnType<typeof useQueryClient>
  onConfirmToggle?: (key: string, label: string, enabled: boolean) => void
  confirmPending?: boolean
}) {
  const enabled = currentValue !== '0'
  const toggleMutation = useMutation({
    mutationFn: () => settingsApi.update({ [settingKey]: enabled ? '0' : '1' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success(`${label}已${enabled ? '关闭' : '开启'}`)
    },
    onError: (err: Error) => toast.error(`操作失败: ${err.message}`),
  })

  const handleToggle = () => {
    if (onConfirmToggle) {
      onConfirmToggle(settingKey, label, enabled)
    } else {
      toggleMutation.mutate()
    }
  }

  return (
    <div className="flex items-center justify-between rounded-xl border bg-card p-4">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          {enabled ? <Bell className="size-4 text-primary" /> : <BellOff className="size-4 text-muted-foreground" />}
          <span className="text-sm font-medium">{label}</span>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={toggleMutation.isPending || confirmPending}
      />
    </div>
  )
}
