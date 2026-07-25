import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Sun, Moon, Monitor, Cloud, Zap, TestTube, Save, Plus, Pencil, Check, FileText, ExternalLink, BookOpen, Trash2, ShieldAlert, Database, CheckCircle2, AlertCircle, Clock, Loader2 } from 'lucide-react'
import { settingsApi, imaApi, aiConfigsApi, syncLogsApi, type AiConfig, type SyncLog } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import { SettingsSkeleton } from '@/components/PageSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { formatCST } from '@/lib/datetime'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const [settingsTab, setSettingsTab] = useState('general')
  const [resetConfirmText, setResetConfirmText] = useState('')

  const { isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  })

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

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="icon-badge size-9 bg-gradient-to-br from-slate-500 to-slate-400 md:size-10">
          <Monitor className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">设置</h1>
          <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">管理界面、AI 与同步配置</p>
        </div>
      </div>

      {isLoading ? (
        <SettingsSkeleton />
      ) : (
        <Tabs value={settingsTab} onValueChange={setSettingsTab}>
          <TabsList className="w-full justify-start gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <TabsTrigger value="general">通用</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
            <TabsTrigger value="sync">同步</TabsTrigger>
            <TabsTrigger value="logs">同步日志</TabsTrigger>
            <TabsTrigger value="data">数据</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4 space-y-5">
            <SettingCard
              icon={Sun}
              title="界面主题"
              description="选择适合你的界面外观"
              gradient="from-orange-400 to-amber-400"
            >
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
            <MsTodoSyncCard />
            <ImaSyncCard />
          </TabsContent>

          <TabsContent value="logs" className="mt-4 space-y-5">
            <SyncLogCenter />
          </TabsContent>

          <TabsContent value="data" className="mt-4 space-y-5">
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
                  <AlertDialog onOpenChange={(open) => { if (!open) setResetConfirmText('') }}>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="gap-2 rounded-lg">
                        <Trash2 className="size-4" /> 清空
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-destructive">确认清空所有数据？</AlertDialogTitle>
                        <AlertDialogDescription>
                          此操作将永久删除所有任务、笔记、知识库及配置数据，且无法恢复。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="space-y-3 py-2">
                        <div className="rounded-xl bg-destructive/5 p-3 text-sm text-destructive/80">
                          <p className="font-medium text-destructive">请先备份数据</p>
                          <p className="mt-1 text-xs">在执行清空前，请确保已通过顶部菜单「导出数据」功能备份了重要信息。</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">请输入「确认清空」以继续</Label>
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
  )
}

// 通用设置卡片
function SettingCard({
  icon: Icon,
  title,
  description,
  gradient,
  children,
}: {
  icon: React.ElementType
  title: string
  description: string
  gradient: string
  children: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden transition-shadow duration-200 hover:shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base">
          <div className={cn('icon-badge size-8', gradient)}>
            <Icon className="size-4" />
          </div>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// 微软 To Do 同步卡片
const MS_ACCOUNT_TYPES = [
  { value: 'common', label: 'common（个人+组织账号）' },
  { value: 'consumers', label: 'consumers（仅个人 Microsoft 账号）' },
  { value: 'organizations', label: 'organizations（仅工作或学校账号）' },
]

function MsTodoSyncCard() {
  const queryClient = useQueryClient()
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [accountType, setAccountType] = useState('common')
  const [redirectUri, setRedirectUri] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [authorizing, setAuthorizing] = useState(false)

  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  })

  const { data: status } = useQuery({
    queryKey: ['msTodoStatus'],
    queryFn: settingsApi.msTodoStatus,
  })

  // B7：从 settings 同步已保存的凭据，避免刷新后清空
  useEffect(() => {
    if (settings.ms_client_id) setClientId(settings.ms_client_id)
    // ms_client_secret 是敏感字段，后端只返回 ms_client_secret_set 标记
    if (settings.ms_client_secret_set && !clientSecret) setClientSecret('••••••••')
    if (settings.ms_tenant_id) setTenantId(settings.ms_tenant_id)
    if (settings.ms_account_type) {
      setAccountType(settings.ms_account_type)
    } else if (settings.ms_tenant_id && MS_ACCOUNT_TYPES.some((t) => t.value === settings.ms_tenant_id)) {
      // 兼容旧版：tenantId 是已知账号类型时直接沿用
      setAccountType(settings.ms_tenant_id)
    }
    if (settings.ms_redirect_uri !== undefined) setRedirectUri(settings.ms_redirect_uri)
  }, [settings])

  const effectiveRedirectUri = (redirectUri.trim() || `${window.location.origin}/oauth/ms-todo/callback`)

  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(feedbackTimerRef.current), [])

  const syncMutation = useMutation({
    mutationFn: settingsApi.msTodoSync,
    onMutate: () => { setSyncing(true); setSyncFeedback(null) },
    onSuccess: (data: { ok: boolean; synced?: number; error?: string }) => {
      setSyncing(false)
      queryClient.invalidateQueries({ queryKey: ['msTodoStatus'] })
      queryClient.invalidateQueries({ queryKey: ['syncLogs'] })
      if (data.ok) {
        const msg = `同步完成 · ${data.synced} 条任务`
        setSyncFeedback({ type: 'success', message: msg })
      } else {
        const msg = data.error || '未知错误'
        setSyncFeedback({ type: 'error', message: `同步失败: ${msg}` })
      }
      clearTimeout(feedbackTimerRef.current)
      feedbackTimerRef.current = setTimeout(() => setSyncFeedback(null), 5000)
    },
    onError: (err: Error) => {
      setSyncing(false)
      setSyncFeedback({ type: 'error', message: `同步失败: ${err.message}` })
    },
  })

  // 保存 Azure 凭据到设置
  const saveAzureMutation = useMutation({
    mutationFn: (data: Record<string, string>) => settingsApi.update(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })

  // OAuth 授权跳转（B6：redirect_uri 指向前端回调页；accountType 支持 common/consumers/organizations）
  const handleAuthorize = () => {
    const authUrl = `https://login.microsoftonline.com/${accountType || 'common'}/oauth2/v2.0/authorize?` +
      `client_id=${clientId}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(effectiveRedirectUri)}&` +
      `scope=${encodeURIComponent('Tasks.ReadWrite offline_access')}&` +
      `response_mode=query`
    window.location.href = authUrl
  }

  // B8：先 await 保存凭据，再跳转授权，避免竞态
  const handleSaveAndAuthorize = async () => {
    try {
      setAuthorizing(true)
      const payload: Record<string, string> = {
        ms_client_id: clientId,
        ms_account_type: accountType,
        ms_redirect_uri: redirectUri,
        // 兼容旧版：仍保存 tenantId，但后端优先读取 ms_account_type
        ...(tenantId ? { ms_tenant_id: tenantId } : {}),
      }
      // 仅在用户输入了真实密钥时才回写，避免占位符覆盖已保存的值
      if (clientSecret && clientSecret !== '••••••••') {
        payload.ms_client_secret = clientSecret
      }
      await saveAzureMutation.mutateAsync(payload)
      handleAuthorize()
    } catch (e: unknown) {
      toast.error(`保存凭据失败: ${e instanceof Error ? e.message : '未知错误'}`)
      setAuthorizing(false)
    }
  }

  return (
    <SettingCard
      icon={FileText}
      title="微软 To Do 同步"
      description="通过 Microsoft Graph API 双向同步任务"
      gradient="from-blue-500 to-indigo-500"
    >
      <div className="flex items-center justify-between rounded-xl border bg-muted/20 p-3">
        <span className="text-sm font-medium text-muted-foreground">授权状态</span>
        {status?.authorized ? (
          <Badge className="rounded-full bg-emerald-500 px-2.5 py-0.5 hover:bg-emerald-500">已授权</Badge>
        ) : (
          <Badge variant="secondary" className="rounded-full px-2.5 py-0.5">未授权</Badge>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Azure Client ID</Label>
          <Input
            placeholder="应用(客户端) ID"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="rounded-lg"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Azure Client Secret</Label>
          <Input
            type="password"
            placeholder="应用密钥"
            value={clientSecret}
            onFocus={() => { if (clientSecret === '••••••••') setClientSecret('') }}
            onChange={(e) => setClientSecret(e.target.value)}
            className="rounded-lg"
          />
          {settings.ms_client_secret_set && clientSecret === '••••••••' && (
            <p className="text-xs text-muted-foreground">已保存，点击输入框可修改</p>
          )}
          <p className="text-xs text-muted-foreground">
            在 Azure 应用注册的「证书和密码」中创建客户端密钥
          </p>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Microsoft 账号类型</Label>
          <Select value={accountType} onValueChange={setAccountType}>
            <SelectTrigger className="rounded-lg">
              <SelectValue placeholder="选择账号类型" />
            </SelectTrigger>
            <SelectContent>
              {MS_ACCOUNT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            若应用注册为“仅个人 Microsoft 账号”，请选择 consumers
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">授权回跳地址（可选）</Label>
          <Input
            placeholder={`例如：${window.location.origin}/oauth/ms-todo/callback`}
            value={redirectUri}
            onChange={(e) => setRedirectUri(e.target.value)}
            className="rounded-lg"
          />
          <p className="text-xs text-muted-foreground">
            留空则使用当前域名。若使用自定义域名，请在此填写，并确保已在 Azure 应用注册中添加该回调地址。
          </p>
          <p className="text-xs font-mono text-muted-foreground break-all">
            当前回跳地址：{effectiveRedirectUri}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!clientId || authorizing || (!clientSecret && !settings.ms_client_secret_set)}
            onClick={handleSaveAndAuthorize}
            className="rounded-lg"
          >
            {authorizing ? '保存并授权中...' : '保存并授权'}
          </Button>
          {status?.authorized && (
            <Button
              size="sm"
              disabled={syncing}
              onClick={() => syncMutation.mutate()}
              className="rounded-lg"
            >
              {syncing ? '同步中...' : '立即同步'}
            </Button>
          )}
          {syncFeedback && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-xs',
                syncFeedback.type === 'success'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-destructive'
              )}
            >
              {syncFeedback.type === 'success'
                ? <CheckCircle2 className="size-3.5" />
                : <AlertCircle className="size-3.5" />}
              {syncFeedback.message}
            </span>
          )}
        </div>

        {status?.lastSync && (
          <p className="text-xs text-muted-foreground">
            上次同步: {formatCST(status.lastSync, 'datetime')}
          </p>
        )}
      </div>
    </SettingCard>
  )
}

// IMA 同步卡片
function ImaSyncCard() {
  const queryClient = useQueryClient()
  const [clientId, setClientId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [syncingNotes, setSyncingNotes] = useState(false)
  const [syncingKb, setSyncingKb] = useState(false)

  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  })

  const { data: imaStatus } = useQuery({
    queryKey: ['imaStatus'],
    queryFn: imaApi.status,
  })

  useEffect(() => {
    if (settings.ima_client_id) setClientId(settings.ima_client_id)
    // ima_api_key 是敏感字段，后端不返回实际值，只返回 ima_api_key_set 标记
    if (settings.ima_api_key_set && !apiKey) setApiKey('••••••••')
  }, [settings])

  const saveCredsMutation = useMutation({
    mutationFn: (data: Record<string, string>) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('凭证已保存')
    },
  })

  const [imaNotesFeedback, setImaNotesFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [imaKbFeedback, setImaKbFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const imaNotesTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const imaKbTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { clearTimeout(imaNotesTimerRef.current); clearTimeout(imaKbTimerRef.current) }, [])

  const syncNotesMutation = useMutation({
    mutationFn: () => imaApi.syncNotes(),
    onMutate: () => { setSyncingNotes(true); setImaNotesFeedback(null) },
    onSuccess: (data: { ok: boolean; synced?: number; error?: string }) => {
      setSyncingNotes(false)
      queryClient.invalidateQueries({ queryKey: ['imaStatus'] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      queryClient.invalidateQueries({ queryKey: ['syncLogs'] })
      if (data.ok) {
        const msg = `同步完成${data.synced != null ? ` · ${data.synced} 条` : ''}`
        setImaNotesFeedback({ type: 'success', message: msg })
      } else {
        const msg = data.error || '未知错误'
        setImaNotesFeedback({ type: 'error', message: `同步失败: ${msg}` })
      }
      clearTimeout(imaNotesTimerRef.current)
      imaNotesTimerRef.current = setTimeout(() => setImaNotesFeedback(null), 5000)
    },
    onError: (err: Error) => {
      setSyncingNotes(false)
      setImaNotesFeedback({ type: 'error', message: `同步失败: ${err.message}` })
    },
  })

  const syncKbMutation = useMutation({
    mutationFn: () => imaApi.syncKb(),
    onMutate: () => { setSyncingKb(true); setImaKbFeedback(null) },
    onSuccess: (data: { ok: boolean; synced?: number; error?: string }) => {
      setSyncingKb(false)
      queryClient.invalidateQueries({ queryKey: ['imaStatus'] })
      queryClient.invalidateQueries({ queryKey: ['kb'] })
      queryClient.invalidateQueries({ queryKey: ['syncLogs'] })
      if (data.ok) {
        const msg = `同步完成${data.synced != null ? ` · ${data.synced} 条` : ''}`
        setImaKbFeedback({ type: 'success', message: msg })
      } else {
        const msg = data.error || '未知错误'
        setImaKbFeedback({ type: 'error', message: `同步失败: ${msg}` })
      }
      clearTimeout(imaKbTimerRef.current)
      imaKbTimerRef.current = setTimeout(() => setImaKbFeedback(null), 5000)
    },
    onError: (err: Error) => {
      setSyncingKb(false)
      setImaKbFeedback({ type: 'error', message: `同步失败: ${err.message}` })
    },
  })

  return (
    <SettingCard
      icon={BookOpen}
      title="IMA 笔记/知识库同步"
      description="通过腾讯 IMA OpenAPI 自动拉取笔记和知识库内容"
      gradient="from-sky-500 to-blue-500"
    >
      <div className="flex items-center justify-between rounded-xl border bg-muted/20 p-3">
        <span className="text-sm font-medium text-muted-foreground">配置状态</span>
        {imaStatus?.authorized ? (
          <Badge className="rounded-full bg-emerald-500 px-2.5 py-0.5 hover:bg-emerald-500">已配置</Badge>
        ) : (
          <Badge variant="secondary" className="rounded-full px-2.5 py-0.5">未配置</Badge>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <div className="rounded-2xl border border-dashed bg-muted/20 p-3 text-xs space-y-1.5">
          <p className="font-medium text-muted-foreground">如何获取凭证：</p>
          <p>
            1. 访问{' '}
            <a
              href="https://ima.qq.com/agent-interface"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              IMA 开放接口 <ExternalLink className="size-3" />
            </a>
          </p>
          <p>2. 登录并创建应用</p>
          <p>3. 获取 Client ID 和 API Key</p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">IMA Client ID</Label>
          <Input
            type="password"
            placeholder="应用标识"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="rounded-lg"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">IMA API Key</Label>
          <Input
            type="password"
            placeholder="接口密钥"
            value={apiKey}
            onFocus={() => { if (apiKey === '••••••••') setApiKey('') }}
            onChange={(e) => setApiKey(e.target.value)}
            className="rounded-lg"
          />
          {settings.ima_api_key_set && apiKey === '••••••••' && (
            <p className="text-xs text-muted-foreground">已保存，点击输入框可修改</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!clientId || !apiKey || apiKey === '••••••••'}
            onClick={() => saveCredsMutation.mutate({ ima_client_id: clientId, ima_api_key: apiKey })}
            className="gap-2 rounded-lg"
          >
            <Save className="size-4" /> 保存凭证
          </Button>
          <Button
            size="sm"
            disabled={!imaStatus?.authorized || syncingNotes}
            onClick={() => syncNotesMutation.mutate()}
            className="gap-2 rounded-lg"
          >
            <FileText className="size-4" />
            {syncingNotes ? '同步笔记中...' : '同步笔记'}
          </Button>
          {imaNotesFeedback && (
            <span className={cn('inline-flex items-center gap-1.5 text-xs', imaNotesFeedback.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
              {imaNotesFeedback.type === 'success' ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
              {imaNotesFeedback.message}
            </span>
          )}
          <Button
            size="sm"
            disabled={!imaStatus?.authorized || syncingKb}
            onClick={() => syncKbMutation.mutate()}
            className="gap-2 rounded-lg"
          >
            <BookOpen className="size-4" />
            {syncingKb ? '同步知识库中...' : '同步知识库'}
          </Button>
          {imaKbFeedback && (
            <span className={cn('inline-flex items-center gap-1.5 text-xs', imaKbFeedback.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
              {imaKbFeedback.type === 'success' ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
              {imaKbFeedback.message}
            </span>
          )}
        </div>

        {imaStatus?.lastSync && (
          <p className="text-xs text-muted-foreground">
            上次同步: {formatCST(imaStatus.lastSync, 'datetime')}
          </p>
        )}
      </div>
    </SettingCard>
  )
}

// 同步日志中心
const SOURCE_LABELS: Record<SyncLog['source'], string> = {
  ms_todo: 'MS Todo',
  ima_notes: 'IMA 笔记',
  ima_kb: 'IMA 知识库',
}

const STATUS_VARIANTS: Record<SyncLog['status'], { label: string; className: string }> = {
  success: { label: '成功', className: 'bg-emerald-500 hover:bg-emerald-500 text-white' },
  partial: { label: '部分', className: 'bg-amber-500 hover:bg-amber-500 text-white' },
  error: { label: '失败', className: 'bg-destructive hover:bg-destructive text-destructive-foreground' },
}

function SyncLogCenter() {
  const [source, setSource] = useState<'all' | SyncLog['source']>('all')
  const [status, setStatus] = useState<'all' | SyncLog['status']>('all')

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['syncLogs', source, status],
    queryFn: () =>
      syncLogsApi.list(
        source === 'all' && status === 'all'
          ? undefined
          : {
              ...(source !== 'all' ? { source } : {}),
              ...(status !== 'all' ? { status } : {}),
            }
      ),
  })
  const logs = Array.isArray(data) ? data : []

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="icon-badge size-8 bg-gradient-to-br from-slate-500 to-slate-400">
            <Clock className="size-4" />
          </div>
          同步日志
        </CardTitle>
        <CardDescription>查看所有同步事件与结果</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={source} onValueChange={(v) => setSource(v as 'all' | SyncLog['source'])}>
            <SelectTrigger className="h-8 w-[140px] rounded-lg text-xs">
              <SelectValue placeholder="来源" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部来源</SelectItem>
              <SelectItem value="ms_todo">MS Todo</SelectItem>
              <SelectItem value="ima_notes">IMA 笔记</SelectItem>
              <SelectItem value="ima_kb">IMA 知识库</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(v) => setStatus(v as 'all' | SyncLog['status'])}>
            <SelectTrigger className="h-8 w-[120px] rounded-lg text-xs">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="success">成功</SelectItem>
              <SelectItem value="partial">部分</SelectItem>
              <SelectItem value="error">失败</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-8 rounded-lg text-xs"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            刷新
          </Button>
        </div>

        <ScrollArea className="h-64 rounded-xl border">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              加载中…
            </div>
          ) : logs.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">暂无同步日志</div>
          ) : (
            <div className="divide-y">
              {logs.map((log) => (
                <div key={log.id} className="p-3 text-sm transition-colors hover:bg-accent/40">
                  <div className="flex items-center gap-2">
                    <Badge className={cn('rounded-full px-2 py-0.5 text-xs', STATUS_VARIANTS[log.status].className)}>
                      {STATUS_VARIANTS[log.status].label}
                    </Badge>
                    <Badge variant="outline" className="rounded-full px-2 py-0.5 text-xs">
                      {SOURCE_LABELS[log.source]}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatCST(log.createdAt, 'compact')}
                    </span>
                  </div>
                  <p className="mt-1.5 font-medium">{log.message || '无消息'}</p>
                  {(log.synced > 0 || log.failed > 0 || log.skipped > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {log.synced > 0 && <span>成功 {log.synced}</span>}
                      {log.failed > 0 && <span className="text-destructive">失败 {log.failed}</span>}
                      {log.skipped > 0 && <span>跳过 {log.skipped}</span>}
                    </div>
                  )}
                  {log.details && (
                    <p className="mt-1.5 whitespace-pre-wrap text-xs text-muted-foreground">{log.details}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

// AI 配置管理：支持多条配置 + 自由设置默认
function AiConfigManager() {
  const queryClient = useQueryClient()
  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['aiConfigs'],
    queryFn: aiConfigsApi.list,
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<'cloudflare' | 'openai'>('cloudflare')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms?: number; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setType('cloudflare')
    setBaseUrl('')
    setApiKey('')
    setModel('')
    setIsDefault(false)
    setTestResult(null)
  }

  const openAdd = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEdit = (cfg: AiConfig) => {
    setEditingId(cfg.id)
    setName(cfg.name)
    setType(cfg.type)
    setBaseUrl(cfg.baseUrl)
    setApiKey('') // 不回显明文；留空表示沿用已保存密钥
    setModel(cfg.model)
    setIsDefault(cfg.isDefault)
    setTestResult(null)
    setDialogOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name, type, baseUrl, apiKey, model, isDefault }
      return editingId ? aiConfigsApi.update(editingId, payload) : aiConfigsApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aiConfigs'] })
      toast.success(editingId ? '配置已更新' : '配置已添加')
      setDialogOpen(false)
    },
    onError: (e: Error) => toast.error(`保存失败: ${e.message}`),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => aiConfigsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aiConfigs'] })
      toast.success('已删除')
    },
    onError: (e: Error) => toast.error(`删除失败: ${e.message}`),
  })

  const defaultMutation = useMutation({
    mutationFn: (id: string) => aiConfigsApi.setDefault(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aiConfigs'] })
      toast.success('已设为默认')
    },
    onError: (e: Error) => toast.error(`操作失败: ${e.message}`),
  })

  const testMutation = useMutation({
    mutationFn: () =>
      editingId
        ? aiConfigsApi.test({ id: editingId })
        : aiConfigsApi.test({ type, baseUrl, apiKey, model }),
    onMutate: () => { setTesting(true); setTestResult(null) },
    onSuccess: (d) => { setTestResult(d); setTesting(false) },
    onError: () => setTesting(false),
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          已配置 {configs.length} 个模型来源，AI 功能使用标记为「默认」的配置。
        </p>
        <Button size="sm" className="gap-2 rounded-lg" onClick={openAdd}>
          <Plus className="size-4" /> 添加配置
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}

      {!isLoading && configs.length === 0 && (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          还没有 AI 配置。默认将使用 Cloudflare Workers AI 免费模型。点击「添加配置」可接入自定义 API。
        </div>
      )}

      <div className="space-y-2">
        {configs.map((cfg) => (
          <div key={cfg.id} className="flex flex-col gap-3 rounded-2xl border bg-muted/20 p-3 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
              {cfg.type === 'cloudflare' ? <Cloud className="size-4" /> : <Zap className="size-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{cfg.name}</span>
                {cfg.isDefault && (
                  <Badge className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs hover:bg-emerald-500">默认</Badge>
                )}
                <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-xs">
                  {cfg.type === 'cloudflare' ? 'Cloudflare' : 'OpenAI'}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {cfg.type === 'cloudflare'
                  ? `模型: ${cfg.model || '@cf/qwen/qwen2.5-coder-32b-instruct'}`
                  : `${cfg.baseUrl} · ${cfg.model || 'gpt-4o'}${cfg.apiKeySet ? ' · 密钥已保存' : ''}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {!cfg.isDefault && (
                <Button variant="outline" size="sm" className="rounded-lg" onClick={() => defaultMutation.mutate(cfg.id)}>
                  设为默认
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={() => openEdit(cfg)}>
                <Pencil className="size-3.5" /> 编辑
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-lg text-destructive hover:text-destructive"
                onClick={() => removeMutation.mutate(cfg.id)}
              >
                <Trash2 className="size-3.5" /> 删除
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑 AI 配置' : '添加 AI 配置'}</DialogTitle>
            <DialogDescription>配置一个模型来源，可添加多个并在列表中自由设置默认。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">名称</Label>
              <Input placeholder="如：我的 GPT / 公司 Qwen" value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">类型</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'cloudflare' | 'openai')}>
                <SelectTrigger className="w-full rounded-lg">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cloudflare">Cloudflare Workers AI（免费）</SelectItem>
                  <SelectItem value="openai">自定义 OpenAI 兼容 API</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {type === 'cloudflare' && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">模型名称</Label>
                <Input placeholder="@cf/qwen/qwen2.5-coder-32b-instruct" value={model} onChange={(e) => setModel(e.target.value)} className="rounded-lg" />
                <p className="text-xs text-muted-foreground">留空使用默认均衡模型。可在 Cloudflare 控制台查看可用 @cf 模型。</p>
              </div>
            )}

            {type === 'openai' && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">API Base URL</Label>
                  <Input placeholder="https://api.openai.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">API Key</Label>
                  <Input
                    type="password"
                    placeholder={editingId ? '留空则沿用已保存密钥' : 'sk-xxx'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="rounded-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">模型名称</Label>
                  <Input placeholder="gpt-4o / deepseek-chat / qwen-plus" value={model} onChange={(e) => setModel(e.target.value)} className="rounded-lg" />
                </div>
              </>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="size-4 rounded border-border"
              />
              设为默认（AI 功能使用该配置）
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button variant="outline" size="sm" disabled={testing} onClick={() => testMutation.mutate()} className="gap-2 rounded-lg">
                <TestTube className="size-4" />
                {testing ? '测试中...' : '测试连接'}
              </Button>
              {testResult && (
                testResult.ok ? (
                  <Badge className="gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 hover:bg-emerald-500">
                    连接成功 · {testResult.latency_ms}ms
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="rounded-full px-2.5 py-0.5">失败: {testResult.error}</Badge>
                )
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button
              disabled={!name || (type === 'openai' && !baseUrl) || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="gap-2 rounded-lg"
            >
              <Check className="size-4" /> 保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
