import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Sun, Moon, Monitor, Cloud, Zap, TestTube, Save, FileText, ExternalLink, BookOpen, Trash2, ShieldAlert, Database } from 'lucide-react'
import { settingsApi, imaApi } from '@/lib/api'
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
import { cn } from '@/lib/utils'

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()

  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  })

  // AI 配置
  const [aiProvider, setAiProvider] = useState('cloudflare')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customApiKey, setCustomApiKey] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms?: number; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (settings.ai_provider) setAiProvider(settings.ai_provider)
    if (settings.custom_ai_base_url) setCustomBaseUrl(settings.custom_ai_base_url)
    // custom_ai_api_key 是敏感字段，后端只返回 custom_ai_api_key_set 标记
    if (settings.custom_ai_api_key_set && !customApiKey) setCustomApiKey('••••••••')
    if (settings.custom_ai_model) setCustomModel(settings.custom_ai_model)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('配置已保存')
    },
  })

  const testMutation = useMutation({
    mutationFn: (data: { baseUrl: string; apiKey: string; model: string }) => settingsApi.testAi(data),
    onMutate: () => { setTesting(true); setTestResult(null) },
    onSuccess: (data) => { setTestResult(data); setTesting(false) },
    onError: () => setTesting(false),
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
        <div className="space-y-5">
          {/* 界面主题 */}
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

          {/* AI 配置 */}
          <SettingCard
            icon={Zap}
            title="AI 配置"
            description="配置 AI 分析、周报与任务拆解的模型来源"
            gradient="from-violet-500 to-fuchsia-500"
          >
            <div className="space-y-5">
              {/* Provider 切换 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">AI 服务商</Label>
                <Select value={aiProvider} onValueChange={setAiProvider}>
                  <SelectTrigger className="w-full rounded-lg">
                    <SelectValue placeholder="选择 AI 服务商" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cloudflare">
                      <span className="flex items-center gap-2">
                        <Cloud className="size-4" /> Cloudflare Workers AI (默认)
                      </span>
                    </SelectItem>
                    <SelectItem value="custom">自定义 API</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {aiProvider === 'cloudflare' && (
                <div className="rounded-xl border border-dashed bg-muted/30 p-4">
                  <p className="text-sm text-muted-foreground">
                    使用 Cloudflare Workers AI 内置模型（免费额度），无需额外配置。
                  </p>
                </div>
              )}

              {aiProvider === 'custom' && (
                <div className="space-y-4 rounded-2xl border bg-muted/20 p-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">API Base URL</Label>
                    <Input
                      placeholder="https://api.openai.com/v1"
                      value={customBaseUrl}
                      onChange={(e) => setCustomBaseUrl(e.target.value)}
                      className="rounded-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">API Key</Label>
                    <Input
                      type="password"
                      placeholder="sk-xxx"
                      value={customApiKey}
                      onFocus={() => { if (customApiKey === '••••••••') setCustomApiKey('') }}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                      className="rounded-lg"
                    />
                    {settings.custom_ai_api_key_set && customApiKey === '••••••••' && (
                      <p className="text-xs text-muted-foreground">已保存，点击输入框可修改</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">模型名称</Label>
                    <Input
                      placeholder="gpt-4o / deepseek-chat / qwen-plus"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      className="rounded-lg"
                    />
                  </div>

                  {/* 连通性测试 */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={testing || !customBaseUrl || !customModel || (!customApiKey && !settings.custom_ai_api_key_set)}
                      onClick={() => testMutation.mutate({
                        baseUrl: customBaseUrl,
                        apiKey: customApiKey === '••••••••' ? '' : customApiKey,
                        model: customModel,
                      })}
                      className="gap-2 rounded-lg"
                    >
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
              )}

              <Button
                size="sm"
                className="gap-2 rounded-lg"
                onClick={() => {
                  const payload: Record<string, string> = {
                    ai_provider: aiProvider,
                    custom_ai_base_url: customBaseUrl,
                    custom_ai_model: customModel,
                  }
                  // 仅在用户输入了真实密钥时才回写，避免占位符覆盖已保存的值
                  if (customApiKey && customApiKey !== '••••••••') {
                    payload.custom_ai_api_key = customApiKey
                  }
                  saveMutation.mutate(payload)
                }}
              >
                <Save className="size-4" /> 保存配置
              </Button>
            </div>
          </SettingCard>

          {/* 微软 To Do 同步 */}
          <MsTodoSyncCard />

          {/* IMA 同步配置 */}
          <ImaSyncCard />

          {/* 危险区域 */}
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
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="gap-2 rounded-lg">
                      <Trash2 className="size-4" /> 清空
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认清空所有数据？</AlertDialogTitle>
                      <AlertDialogDescription>
                        此操作将永久删除所有任务、笔记、知识库及配置数据，且无法恢复。请确认你已备份重要数据。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
        </div>
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

  const syncMutation = useMutation({
    mutationFn: settingsApi.msTodoSync,
    onMutate: () => setSyncing(true),
    onSuccess: (data: { ok: boolean; synced?: number; error?: string }) => {
      setSyncing(false)
      queryClient.invalidateQueries({ queryKey: ['msTodoStatus'] })
      if (data.ok) toast.success(`同步成功 · ${data.synced} 条任务`)
      else toast.error(`同步失败: ${data.error}`)
    },
    onError: () => setSyncing(false),
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

        <div className="flex flex-wrap gap-2">
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
        </div>

        {status?.lastSync && (
          <p className="text-xs text-muted-foreground">
            上次同步: {new Date(status.lastSync).toLocaleString('zh-CN')}
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

  const syncNotesMutation = useMutation({
    mutationFn: () => imaApi.syncNotes(),
    onMutate: () => setSyncingNotes(true),
    onSuccess: (data: { ok: boolean; synced?: number; error?: string }) => {
      setSyncingNotes(false)
      queryClient.invalidateQueries({ queryKey: ['imaStatus'] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      if (data.ok) toast.success(`笔记同步成功${data.synced != null ? ` · ${data.synced} 条` : ''}`)
      else toast.error(`笔记同步失败: ${data.error}`)
    },
    onError: (err: Error) => {
      setSyncingNotes(false)
      toast.error(`笔记同步失败: ${err.message}`)
    },
  })

  const syncKbMutation = useMutation({
    mutationFn: () => imaApi.syncKb(),
    onMutate: () => setSyncingKb(true),
    onSuccess: (data: { ok: boolean; synced?: number; error?: string }) => {
      setSyncingKb(false)
      queryClient.invalidateQueries({ queryKey: ['imaStatus'] })
      queryClient.invalidateQueries({ queryKey: ['kb'] })
      if (data.ok) toast.success(`知识库同步成功${data.synced != null ? ` · ${data.synced} 条` : ''}`)
      else toast.error(`知识库同步失败: ${data.error}`)
    },
    onError: (err: Error) => {
      setSyncingKb(false)
      toast.error(`知识库同步失败: ${err.message}`)
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

        <div className="flex flex-wrap gap-2">
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
          <Button
            size="sm"
            disabled={!imaStatus?.authorized || syncingKb}
            onClick={() => syncKbMutation.mutate()}
            className="gap-2 rounded-lg"
          >
            <BookOpen className="size-4" />
            {syncingKb ? '同步知识库中...' : '同步知识库'}
          </Button>
        </div>

        {imaStatus?.lastSync && (
          <p className="text-xs text-muted-foreground">
            上次同步: {new Date(imaStatus.lastSync).toLocaleString('zh-CN')}
          </p>
        )}
      </div>
    </SettingCard>
  )
}
