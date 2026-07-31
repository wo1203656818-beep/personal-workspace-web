import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Cloud, Zap, Plus, Pencil, Trash2, Check, TestTube } from 'lucide-react'
import { aiConfigsApi, type AiConfig } from '@/lib/api'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function AiConfigManager() {
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
  const [testResult, setTestResult] = useState<{
    ok: boolean
    latency_ms?: number
    error?: string
  } | null>(null)
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
    setApiKey('')
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
    onMutate: () => {
      setTesting(true)
      setTestResult(null)
    },
    onSuccess: (d) => {
      setTestResult(d)
      setTesting(false)
    },
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
          还没有 AI 配置。默认将使用 Cloudflare Workers AI 免费模型。点击「添加配置」可接入自定义
          API。
        </div>
      )}

      <div className="space-y-2">
        {configs.map((cfg) => (
          <div
            key={cfg.id}
            className="flex flex-col gap-3 rounded-2xl border bg-muted/20 p-3 sm:flex-row sm:items-center sm:gap-3"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
              {cfg.type === 'cloudflare' ? (
                <Cloud className="size-4" />
              ) : (
                <Zap className="size-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{cfg.name}</span>
                {cfg.isDefault && (
                  <Badge className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs hover:bg-emerald-500">
                    默认
                  </Badge>
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
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => defaultMutation.mutate(cfg.id)}
                >
                  设为默认
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-lg"
                onClick={() => openEdit(cfg)}
              >
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
            <DialogDescription>
              配置一个模型来源，可添加多个并在列表中自由设置默认。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">名称</Label>
              <Input
                placeholder="如：我的 GPT / 公司 Qwen"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg"
              />
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
                <Input
                  placeholder="@cf/qwen/qwen2.5-coder-32b-instruct"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="rounded-lg"
                />
                <p className="text-xs text-muted-foreground">
                  留空使用默认均衡模型。可在 Cloudflare 控制台查看可用 @cf 模型。
                </p>
              </div>
            )}

            {type === 'openai' && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">API Base URL</Label>
                  <Input
                    placeholder="https://api.openai.com/v1"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="rounded-lg"
                  />
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
                  <Input
                    placeholder="gpt-4o / deepseek-chat / qwen-plus"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="rounded-lg"
                  />
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
              <Button
                variant="outline"
                size="sm"
                disabled={testing}
                onClick={() => testMutation.mutate()}
                className="gap-2 rounded-lg"
              >
                <TestTube className="size-4" />
                {testing ? '测试中...' : '测试连接'}
              </Button>
              {testResult &&
                (testResult.ok ? (
                  <Badge className="gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 hover:bg-emerald-500">
                    连接成功 · {testResult.latency_ms}ms
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="rounded-full px-2.5 py-0.5">
                    失败: {testResult.error}
                  </Badge>
                ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
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
