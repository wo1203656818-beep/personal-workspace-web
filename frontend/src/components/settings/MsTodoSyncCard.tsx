import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileText } from 'lucide-react'
import { settingsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SettingCard } from './SettingCard'
import { SyncCard } from './SyncCard'

const MS_ACCOUNT_TYPES = [
  { value: 'common', label: 'common（个人+组织账号）' },
  { value: 'consumers', label: 'consumers（仅个人 Microsoft 账号）' },
  { value: 'organizations', label: 'organizations（仅工作或学校账号）' },
]

export function MsTodoSyncCard() {
  const queryClient = useQueryClient()
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [accountType, setAccountType] = useState('common')
  const [redirectUri, setRedirectUri] = useState('')
  const [authorizing, setAuthorizing] = useState(false)

  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  })

  const { data: status } = useQuery({
    queryKey: ['msTodoStatus'],
    queryFn: settingsApi.msTodoStatus,
  })

  useEffect(() => {
    if (settings.ms_client_id) setClientId(settings.ms_client_id)
    if (settings.ms_client_secret_set && !clientSecret) setClientSecret('••••••••')
    if (settings.ms_tenant_id) setTenantId(settings.ms_tenant_id)
    if (settings.ms_account_type) {
      setAccountType(settings.ms_account_type)
    } else if (
      settings.ms_tenant_id &&
      MS_ACCOUNT_TYPES.some((t) => t.value === settings.ms_tenant_id)
    ) {
      setAccountType(settings.ms_tenant_id)
    }
    if (settings.ms_redirect_uri !== undefined) setRedirectUri(settings.ms_redirect_uri)
  }, [settings])

  const effectiveRedirectUri =
    redirectUri.trim() || `${window.location.origin}/oauth/ms-todo/callback`

  const syncMutation = useMutation({
    mutationFn: settingsApi.msTodoSync,
    onSuccess: (data: { ok: boolean; synced?: number; error?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['msTodoStatus'] })
      queryClient.invalidateQueries({ queryKey: ['syncLogs'] })
      if (data.ok) {
        toast.success(`同步完成 · ${data.synced} 条任务`)
      } else {
        toast.error(`同步失败: ${data.error || '未知错误'}`)
      }
    },
    onError: (err: Error) => {
      toast.error(`同步失败: ${err.message}`)
    },
  })

  const saveAzureMutation = useMutation({
    mutationFn: (data: Record<string, string>) => settingsApi.update(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })

  const handleAuthorize = () => {
    const authUrl =
      `https://login.microsoftonline.com/${accountType || 'common'}/oauth2/v2.0/authorize?` +
      `client_id=${clientId}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(effectiveRedirectUri)}&` +
      `scope=${encodeURIComponent('Tasks.ReadWrite offline_access')}&` +
      `response_mode=query`
    window.location.href = authUrl
  }

  const handleSaveAndAuthorize = async () => {
    try {
      setAuthorizing(true)
      const payload: Record<string, string> = {
        ms_client_id: clientId,
        ms_account_type: accountType,
        ms_redirect_uri: redirectUri,
        ...(tenantId ? { ms_tenant_id: tenantId } : {}),
      }
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
          <Badge className="rounded-full bg-emerald-500 px-2.5 py-0.5 hover:bg-emerald-500">
            已授权
          </Badge>
        ) : (
          <Badge variant="secondary" className="rounded-full px-2.5 py-0.5">
            未授权
          </Badge>
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
            onFocus={() => {
              if (clientSecret === '••••••••') setClientSecret('')
            }}
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
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            若应用注册为"仅个人 Microsoft 账号"，请选择 consumers
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
            留空则使用当前域名。若使用自定义域名，请在此填写，并确保已在 Azure
            应用注册中添加该回调地址。
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
            <SyncCard
              lastSync={status.lastSync}
              onSync={() => syncMutation.mutate()}
              syncing={syncMutation.isPending}
            />
          )}
        </div>
      </div>
    </SettingCard>
  )
}
