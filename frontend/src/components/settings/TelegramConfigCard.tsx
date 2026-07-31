import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Send } from 'lucide-react'
import { api, settingsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { SettingCard } from './SettingCard'

export function TelegramConfigCard() {
  const queryClient = useQueryClient()
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [binding, setBinding] = useState(false)

  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  })

  useEffect(() => {
    if (settings.telegram_bot_token_set && !botToken) setBotToken('••••••••')
    if (settings.telegram_chat_id) setChatId(settings.telegram_chat_id)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success('电报配置已保存')
    },
    onError: (err: Error) => toast.error(`保存失败: ${err.message}`),
  })

  const handleSave = async () => {
    try {
      setSaving(true)
      const payload: Record<string, string> = {
        telegram_chat_id: chatId,
      }
      if (botToken && botToken !== '••••••••') {
        payload.telegram_bot_token = botToken
      }
      await saveMutation.mutateAsync(payload)
    } finally {
      setSaving(false)
    }
  }

  const handleTestPush = async () => {
    try {
      setTesting(true)
      const j = await api.post('news/test-push')
        .json<{ ok: boolean; pushed?: number; error?: string; detail?: string }>()
      if (!j.ok) {
        throw new Error(j.error || '推送失败')
      }
      toast.success('测试消息已推送，请检查电报')
    } catch (e: any) {
      const msg = e?.response ? await e.response.json().catch(() => ({})) : null
      toast.error(`推送失败: ${msg?.error || e.message}`)
    } finally {
      setTesting(false)
    }
  }

  const configured = !!(settings.telegram_bot_token_set && settings.telegram_chat_id)

  const { data: webhookInfo, refetch: refetchWebhook } = useQuery({
    queryKey: ['telegramWebhookInfo'],
    queryFn: () => api.get('telegram/webhook-info').json<{
      ok: boolean
      bound?: boolean
      url?: string
      urlMismatch?: boolean
      pendingUpdateCount?: number
      lastErrorMessage?: string | null
      error?: string
    }>(),
    enabled: configured,
    retry: false,
  })

  const handleBindWebhook = async () => {
    try {
      setBinding(true)
      const j = await api.post('telegram/set-webhook').json<{ ok: boolean; url?: string; error?: string }>()
      if (!j.ok) throw new Error(j.error || '绑定失败')
      toast.success('双向对话已开启，现在可以在 Telegram 里给机器人发消息了')
      refetchWebhook()
    } catch (e: any) {
      const msg = e?.response ? (await e.response.json().catch(() => ({})))?.error : null
      toast.error(`绑定失败: ${msg || e.message}`)
    } finally {
      setBinding(false)
    }
  }

  const webhookOk = !!(webhookInfo?.ok && webhookInfo.bound && !webhookInfo.urlMismatch)

  return (
    <SettingCard
      icon={Send}
      title="电报推送"
      description="新闻推送 + Telegram 双向对话（AI 管家）"
      gradient="from-sky-500 to-cyan-500"
    >
      <div className="flex items-center justify-between rounded-xl border bg-muted/20 p-3">
        <span className="text-sm font-medium text-muted-foreground">推送状态</span>
        {configured ? (
          <Badge className="rounded-full bg-emerald-500 px-2.5 py-0.5 hover:bg-emerald-500">已配置</Badge>
        ) : (
          <Badge variant="secondary" className="rounded-full px-2.5 py-0.5">未配置</Badge>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Bot Token</Label>
          <Input
            type="password"
            placeholder="通过 @BotFather 获取的 Bot Token"
            value={botToken}
            onFocus={() => { if (botToken === '••••••••') setBotToken('') }}
            onChange={(e) => setBotToken(e.target.value)}
            className="rounded-lg"
          />
          {settings.telegram_bot_token_set && botToken === '••••••••' && (
            <p className="text-xs text-muted-foreground">已保存，点击输入框可修改</p>
          )}
          <p className="text-xs text-muted-foreground">
            在 Telegram 中找 @BotFather，发送 /newbot 创建机器人后获取
          </p>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Chat ID</Label>
          <Input
            placeholder="接收推送的会话 ID，如 123456789"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            className="rounded-lg"
          />
          <p className="text-xs text-muted-foreground">
            可向 @userinfobot 发消息获取个人 Chat ID；群组需把机器人加入后用负数 ID
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={saving || (!botToken && !settings.telegram_bot_token_set) || !chatId}
            onClick={handleSave}
            className="rounded-lg"
          >
            {saving ? '保存中...' : '保存配置'}
          </Button>
          {configured && (
            <Button
              size="sm"
              disabled={testing}
              onClick={handleTestPush}
              className="rounded-lg"
            >
              {testing ? '推送中...' : '测试推送'}
            </Button>
          )}
          {configured && (
            <Button
              size="sm"
              variant={webhookOk ? 'outline' : 'default'}
              disabled={binding}
              onClick={handleBindWebhook}
              className="rounded-lg"
            >
              {binding ? '绑定中...' : webhookOk ? '重新绑定双向对话' : '开启双向对话'}
            </Button>
          )}
        </div>

        {configured && (
          <div className="rounded-xl border bg-muted/20 p-3 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-muted-foreground">双向对话（从 Telegram 发消息给机器人）</span>
              {webhookOk ? (
                <Badge className="rounded-full bg-emerald-500 px-2 py-0 hover:bg-emerald-500">已开启</Badge>
              ) : (
                <Badge variant="secondary" className="rounded-full px-2 py-0">未开启</Badge>
              )}
            </div>
            {!webhookInfo?.bound && (
              <p className="text-muted-foreground">尚未绑定 Webhook——这就是「发消息没回复」的原因。点击上方「开启双向对话」完成绑定。</p>
            )}
            {webhookInfo?.urlMismatch && (
              <p className="text-amber-600">⚠️ Webhook 绑定到了错误的域名（{webhookInfo.url}），Telegram 消息可能被访问控制拦截。请点击「重新绑定双向对话」修正。</p>
            )}
            {!!webhookInfo?.lastErrorMessage && (
              <p className="text-amber-600">最近投递错误：{webhookInfo.lastErrorMessage}</p>
            )}
            {!!webhookInfo?.pendingUpdateCount && webhookInfo.pendingUpdateCount > 0 && (
              <p className="text-muted-foreground">待处理消息 {webhookInfo.pendingUpdateCount} 条</p>
            )}
            {webhookOk && !webhookInfo?.lastErrorMessage && (
              <p className="text-muted-foreground">链路正常。支持命令 /tasks /add /news /digest，直接打字可与 AI 管家对话。</p>
            )}
          </div>
        )}
      </div>
    </SettingCard>
  )
}
