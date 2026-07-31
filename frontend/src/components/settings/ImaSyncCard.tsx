import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BookOpen, Save, ExternalLink } from 'lucide-react'
import { settingsApi, imaApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { SettingCard } from './SettingCard'
import { SyncCard } from './SyncCard'

export function ImaSyncCard() {
  const queryClient = useQueryClient()
  const [clientId, setClientId] = useState('')
  const [apiKey, setApiKey] = useState('')

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
    onSuccess: (data: { ok: boolean; synced?: number; error?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['imaStatus'] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      queryClient.invalidateQueries({ queryKey: ['syncLogs'] })
      if (data.ok) {
        toast.success(`同步完成${data.synced != null ? ` · ${data.synced} 条` : ''}`)
      } else {
        toast.error(`同步失败: ${data.error || '未知错误'}`)
      }
    },
    onError: (err: Error) => {
      toast.error(`同步失败: ${err.message}`)
    },
  })

  const syncKbMutation = useMutation({
    mutationFn: () => imaApi.syncKb(),
    onSuccess: (data: { ok: boolean; synced?: number; error?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['imaStatus'] })
      queryClient.invalidateQueries({ queryKey: ['kb'] })
      queryClient.invalidateQueries({ queryKey: ['syncLogs'] })
      if (data.ok) {
        toast.success(`同步完成${data.synced != null ? ` · ${data.synced} 条` : ''}`)
      } else {
        toast.error(`同步失败: ${data.error || '未知错误'}`)
      }
    },
    onError: (err: Error) => {
      toast.error(`同步失败: ${err.message}`)
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
          {imaStatus?.authorized && (
            <>
              <SyncCard
                lastSync={imaStatus.lastSync}
                onSync={() => syncNotesMutation.mutate()}
                syncing={syncNotesMutation.isPending}
                syncLabel="同步笔记"
                syncingLabel="同步笔记中..."
              />
              <SyncCard
                onSync={() => syncKbMutation.mutate()}
                syncing={syncKbMutation.isPending}
                syncLabel="同步知识库"
                syncingLabel="同步知识库中..."
              />
            </>
          )}
        </div>
      </div>
    </SettingCard>
  )
}
