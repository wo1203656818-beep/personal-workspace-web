import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import {
  Select, SelectTrigger, SelectContent, SelectItem,
} from '@/components/ui/select'
import { monitorApi, type MonitorTarget, type MonitorBrief, type MonitorSnapshot } from '@/lib/api'
import { Plus, Trash2, Play, Send, Radio, ExternalLink } from 'lucide-react'

const HOT_PLATFORMS = [
  { value: 'baidu', label: '百度热搜（可用）' },
  { value: 'hackernews', label: '全球科技热榜（可用）' },
  { value: 'douyin', label: '抖音热榜（需国内中继）' },
  { value: 'weibo', label: '微博热搜（需国内中继）' },
  { value: 'zhihu', label: '知乎热榜（需国内中继）' },
  { value: 'bilibili', label: 'B站热榜（需国内中继）' },
]

export function MonitorPage() {
  const qc = useQueryClient()
  const [type, setType] = useState<'hotlist' | 'youtube'>('hotlist')
  const [platform, setPlatform] = useState('douyin')
  const [label, setLabel] = useState('')
  const [targetId, setTargetId] = useState('')
  const [keyword, setKeyword] = useState('')

  const targetsQ = useQuery({ queryKey: ['monitor-targets'], queryFn: monitorApi.listTargets })
  const briefQ = useQuery({ queryKey: ['monitor-brief'], queryFn: monitorApi.getBrief })
  const snapsQ = useQuery({
    queryKey: ['monitor-snapshots', 'hotlist'],
    queryFn: () => monitorApi.getSnapshots({ type: 'hotlist' }),
  })

  const [running, setRunning] = useState(false)
  const [pushing, setPushing] = useState(false)

  const targets = (targetsQ.data || []) as MonitorTarget[]
  const brief = briefQ.data as MonitorBrief | { ok: false; message?: string } | undefined
  const snapshots = (snapsQ.data || []) as MonitorSnapshot[]
  const hotItems = snapshots[0]?.items || []

  async function handleAdd() {
    if (!label.trim()) { toast.error('请填写展示名称'); return }
    try {
      await monitorApi.createTarget({
        type, platform: type === 'hotlist' ? platform : 'youtube',
        label: label.trim(),
        targetId: type === 'youtube' ? targetId.trim() || null : null,
        keyword: keyword.trim() || null,
        enabled: true,
      })
      toast.success('已添加监控目标')
      setLabel(''); setTargetId(''); setKeyword('')
      qc.invalidateQueries({ queryKey: ['monitor-targets'] })
    } catch (e: any) { toast.error(`添加失败: ${e.message}`) }
  }

  async function handleDelete(id: string) {
    try {
      await monitorApi.deleteTarget(id)
      toast.success('已删除')
      qc.invalidateQueries({ queryKey: ['monitor-targets'] })
    } catch (e: any) { toast.error(`删除失败: ${e.message}`) }
  }

  async function handleRun() {
    setRunning(true)
    try {
      const r = await monitorApi.runNow() as any
      if (r?.ok) { toast.success(`监控已运行（热榜${r.hotTargets}/对标${r.ytTargets}）`); qc.invalidateQueries({ queryKey: ['monitor-brief'] }); qc.invalidateQueries({ queryKey: ['monitor-snapshots'] }) }
      else toast.error(`运行失败: ${r?.error || '未知'}`)
    } catch (e: any) { toast.error(`运行失败: ${e.message}`) }
    finally { setRunning(false) }
  }

  async function handlePush() {
    setPushing(true)
    try {
      const r = await monitorApi.push() as any
      if (r?.ok) toast.success('简报已推送 Telegram')
      else toast.error(`推送失败: ${r?.error || '未知'}`)
    } catch (e: any) { toast.error(`推送失败: ${e.message}`) }
    finally { setPushing(false) }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Radio className="h-6 w-6 text-indigo-500" /> 监控中心
          </h1>
          <p className="text-sm text-muted-foreground">盯热榜选题与竞品动态，AI 每日生成「今日创作选题」并推送</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRun} disabled={running}>
            <Play className="mr-1 h-4 w-4" /> 立即运行
          </Button>
          <Button variant="outline" onClick={handlePush} disabled={pushing}>
            <Send className="mr-1 h-4 w-4" /> 推送简报
          </Button>
        </div>
      </div>

      {/* 今日简报 */}
      <Card>
        <CardHeader>
          <CardTitle>今日创作选题</CardTitle>
          <CardDescription>
            {brief && 'date' in brief ? `生成于 ${brief.date} · 基于 ${brief.sourceCount} 条热点` : '尚未生成（点「立即运行」或等待每日 8 点定时任务）'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {'content' in (brief || {}) && brief && 'content' in brief && brief.content
            ? <pre className="whitespace-pre-wrap text-sm leading-relaxed">{brief.content}</pre>
            : <p className="text-sm text-muted-foreground">暂无简报。添加监控目标后点「立即运行」即可生成。</p>}
        </CardContent>
      </Card>

      {/* 添加目标 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">添加监控目标</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger className="rounded-lg"><span>{type === 'hotlist' ? '热榜选题' : 'YouTube 对标'}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hotlist">热榜选题</SelectItem>
                  <SelectItem value="youtube">YouTube 对标</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type === 'hotlist' ? (
              <div className="space-y-1.5">
                <Label>平台</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="rounded-lg"><span>{HOT_PLATFORMS.find(p => p.value === platform)?.label}</span></SelectTrigger>
                  <SelectContent>
                    {HOT_PLATFORMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="col-span-2 space-y-1.5 sm:col-span-1">
                <Label>频道 ID</Label>
                <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="UCxxxx" className="rounded-lg" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="如：抖音热榜" className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>关键词（可选）</Label>
              <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="仅抓含此词" className="rounded-lg" />
            </div>
          </div>
          {type === 'youtube' && (
            <p className="text-xs text-muted-foreground">
              需在「设置 → 系统」配置 <code>youtube_api_key</code>（YouTube Data API v3）。频道 ID 在频道页 URL 的 <code>channel/UC...</code> 处获取。
            </p>
          )}
          <Button onClick={handleAdd}><Plus className="mr-1 h-4 w-4" /> 添加</Button>
        </CardContent>
      </Card>

      {/* 目标列表 */}
      <Card>
        <CardHeader><CardTitle className="text-base">监控目标（{targets.length}）</CardTitle></CardHeader>
        <CardContent>
          {targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有监控目标。</p>
          ) : (
            <div className="divide-y">
              {targets.map(t => (
                <div key={t.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="font-medium">{t.label}</span>
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {t.type === 'hotlist' ? `热榜·${t.platform}` : `YouTube${t.targetId ? `·${t.targetId}` : ''}`}
                    </span>
                    {t.keyword && <span className="ml-1 text-xs text-muted-foreground">关键词: {t.keyword}</span>}
                    {!t.enabled && <span className="ml-2 text-xs text-amber-500">已停用</span>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 今日热榜快照预览 */}
      {hotItems.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">今日热榜快照预览</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-1 text-sm">
              {hotItems.slice(0, 15).map((it: any, i: number) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted-foreground">{i + 1}.</span>
                  <span className="flex-1">{it.title}</span>
                  {it.url && <a href={it.url} target="_blank" rel="noreferrer" className="text-indigo-500"><ExternalLink className="h-3.5 w-3.5" /></a>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
