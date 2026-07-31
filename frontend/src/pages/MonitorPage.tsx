import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { monitorApi, type MonitorTarget, type MonitorBrief, type MonitorSnapshot } from '@/lib/api'
import {
  Plus,
  Trash2,
  Play,
  Send,
  Radio,
  ExternalLink,
  ChevronUp,
  Loader2,
  BarChart3,
  Edit2,
  Video,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const HOT_PLATFORMS = [
  { value: 'baidu', label: '百度热搜', available: true },
  { value: 'hackernews', label: 'Hacker News', available: true },
  { value: 'douyin', label: '抖音热榜', available: false, reason: '需国内中继服务' },
  { value: 'weibo', label: '微博热搜', available: false, reason: '需国内中继服务' },
  { value: 'zhihu', label: '知乎热榜', available: false, reason: '需国内中继服务' },
  { value: 'bilibili', label: 'B站热榜', available: false, reason: '需国内中继服务' },
]

const COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#a78bfa',
  '#c4b5fd',
  '#ddd6fe',
  '#ede9fe',
  '#f5f3ff',
  '#f5f3ff',
  '#f5f3ff',
  '#f5f3ff',
]

export function MonitorPage() {
  const qc = useQueryClient()

  // State
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingTarget, setEditingTarget] = useState<MonitorTarget | null>(null)
  const [type, setType] = useState<'hotlist' | 'youtube'>('hotlist')
  const [platform, setPlatform] = useState('baidu')
  const [label, setLabel] = useState('')
  const [targetId, setTargetId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [snapshotTab, setSnapshotTab] = useState<string>('all')

  // Queries
  const targetsQ = useQuery({ queryKey: ['monitor-targets'], queryFn: monitorApi.listTargets })
  const briefQ = useQuery({ queryKey: ['monitor-brief'], queryFn: monitorApi.getBrief })
  const snapsQ = useQuery({
    queryKey: ['monitor-snapshots', snapshotTab, selectedDate],
    queryFn: () =>
      monitorApi.getSnapshots({
        type: snapshotTab === 'all' || snapshotTab === 'youtube' ? undefined : 'hotlist',
        date: selectedDate || undefined,
      }),
  })

  const targets = (targetsQ.data || []) as MonitorTarget[]
  const brief = briefQ.data as MonitorBrief | { ok: false; message?: string } | undefined
  const snapshots = (snapsQ.data || []) as MonitorSnapshot[]

  // Parse snapshots per platform
  const platformSnapshots = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const snap of snapshots) {
      const rawItems: unknown = snap.items
      let items: any[] = []
      if (Array.isArray(rawItems)) items = rawItems
      else if (typeof rawItems === 'string') {
        try {
          const p = JSON.parse(rawItems || '[]')
          if (Array.isArray(p)) items = p
        } catch {}
      }
      if (snap.type === 'youtube') {
        const existing = map.get('youtube') || []
        existing.push(
          ...items.map((v) => ({ ...v, _targetId: snap.targetId, _fetchedAt: snap.fetchedAt })),
        )
        map.set('youtube', existing)
      } else {
        const existing = map.get(snap.platform) || []
        existing.push(...items)
        map.set(snap.platform, existing)
      }
    }
    return map
  }, [snapshots])

  const activePlatforms = useMemo(
    () => Array.from(platformSnapshots.keys()).filter((k) => k !== 'youtube'),
    [platformSnapshots],
  )
  const currentItems = useMemo(
    () =>
      snapshotTab === 'youtube'
        ? platformSnapshots.get('youtube') || []
        : snapshotTab === 'all'
          ? activePlatforms.flatMap((p) => platformSnapshots.get(p) || [])
          : platformSnapshots.get(snapshotTab) || [],
    [snapshotTab, activePlatforms, platformSnapshots],
  )

  // Mutations
  const [running, setRunning] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [refreshingPlatform, setRefreshingPlatform] = useState<string | null>(null)

  async function handleAdd() {
    if (!label.trim()) {
      toast.error('请填写展示名称')
      return
    }
    try {
      if (editingTarget) {
        await monitorApi.updateTarget(editingTarget.id, {
          type,
          platform: type === 'hotlist' ? platform : 'youtube',
          label: label.trim(),
          targetId: type === 'youtube' ? targetId.trim() || null : null,
          keyword: keyword.trim() || null,
          enabled: editingTarget.enabled,
        })
        toast.success('已更新')
      } else {
        await monitorApi.createTarget({
          type,
          platform: type === 'hotlist' ? platform : 'youtube',
          label: label.trim(),
          targetId: type === 'youtube' ? targetId.trim() || null : null,
          keyword: keyword.trim() || null,
          enabled: true,
        })
        toast.success('已添加监控目标')
      }
      setLabel('')
      setTargetId('')
      setKeyword('')
      setEditingTarget(null)
      setShowAddForm(false)
      qc.invalidateQueries({ queryKey: ['monitor-targets'] })
    } catch (e: any) {
      toast.error(`操作失败: ${e.message}`)
    }
  }

  async function handleDelete(id: string) {
    try {
      await monitorApi.deleteTarget(id)
      toast.success('已删除')
      qc.invalidateQueries({ queryKey: ['monitor-targets'] })
    } catch (e: any) {
      toast.error(`删除失败: ${e.message}`)
    }
  }

  async function handleToggleEnabled(target: MonitorTarget) {
    try {
      await monitorApi.updateTarget(target.id, { ...target, enabled: !target.enabled })
      qc.invalidateQueries({ queryKey: ['monitor-targets'] })
    } catch (e: any) {
      toast.error(`更新失败: ${e.message}`)
    }
  }

  function handleEdit(target: MonitorTarget) {
    setEditingTarget(target)
    setType(target.type)
    setPlatform(target.platform)
    setLabel(target.label)
    setTargetId(target.targetId || '')
    setKeyword(target.keyword || '')
    setShowAddForm(true)
  }

  async function handleRun() {
    setRunning(true)
    try {
      const r = (await monitorApi.runNow()) as any
      if (r?.ok) {
        toast.success(`监控已运行（热榜${r.hotTargets}/对标${r.ytTargets}）`)
        qc.invalidateQueries({ queryKey: ['monitor-brief'] })
        qc.invalidateQueries({ queryKey: ['monitor-snapshots'] })
      } else toast.error(`运行失败: ${r?.error || '未知'}`)
    } catch (e: any) {
      toast.error(`运行失败: ${e.message}`)
    } finally {
      setRunning(false)
    }
  }

  async function handlePush() {
    setPushing(true)
    try {
      const r = (await monitorApi.push()) as any
      if (r?.ok) toast.success('简报已推送 Telegram')
      else toast.error(`推送失败: ${r?.error || '未知'}`)
    } catch (e: any) {
      toast.error(`推送失败: ${e.message}`)
    } finally {
      setPushing(false)
    }
  }

  async function handleRefreshPlatform(p: string) {
    setRefreshingPlatform(p)
    try {
      const r = (await monitorApi.runPlatform(p)) as any
      if (r?.ok) {
        toast.success(`${p} 已刷新（${r.fetched} 条）`)
        qc.invalidateQueries({ queryKey: ['monitor-snapshots'] })
      } else toast.error(`刷新失败: ${r?.error || '未知'}`)
    } catch (e: any) {
      toast.error(`刷新失败: ${e.message}`)
    } finally {
      setRefreshingPlatform(null)
    }
  }

  // Heat chart data
  const heatData = currentItems
    .slice(0, 10)
    .map((it: any) => ({
      name: (it.title || '').slice(0, 12) + ((it.title || '').length > 12 ? '...' : ''),
      heat: Number(it.heat || it.hot_value || it.points || 0),
      fullTitle: it.title || '',
    }))
    .filter((d) => d.heat > 0)

  // Date shortcuts
  const today = new Date().toISOString().slice(0, 10)
  const dateShortcuts = [
    { label: '今天', value: '' },
    { label: '昨天', value: new Date(Date.now() - 86400000).toISOString().slice(0, 10) },
    { label: '前天', value: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10) },
  ]

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-card/50 px-4 py-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          <div className="icon-badge size-9 bg-gradient-to-br from-indigo-500 to-purple-500 md:size-10">
            <Radio className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">监控中心</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
              热榜选题与竞品动态 · AI 创作选题
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRun} disabled={running} size="sm">
            {running ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-1 h-4 w-4" />
            )}
            {running ? '运行中...' : '立即运行'}
          </Button>
          <Button variant="outline" onClick={handlePush} disabled={pushing} size="sm">
            <Send className="mr-1 h-4 w-4" /> 推送
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-5 p-4 md:p-6">
          {/* 今日简报 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-indigo-500" /> 今日创作选题
              </CardTitle>
              <CardDescription>
                {brief && 'date' in brief
                  ? `生成于 ${brief.date} · 基于 ${brief.sourceCount} 条热点`
                  : '尚未生成（点「立即运行」或等待每日定时任务）'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {'content' in (brief || {}) && brief && 'content' in brief && brief.content ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{brief.content}</div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  暂无简报。添加监控目标后点「立即运行」即可生成。
                </p>
              )}
            </CardContent>
          </Card>

          {/* 目标管理 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">监控目标（{targets.length}）</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddForm(!showAddForm)
                  setEditingTarget(null)
                  setLabel('')
                  setTargetId('')
                  setKeyword('')
                }}
              >
                {showAddForm ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                {showAddForm ? '收起' : '添加'}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 添加/编辑表单 */}
              {showAddForm && (
                <div className="border rounded-lg p-3 bg-muted/20 space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">类型</Label>
                      <Select value={type} onValueChange={(v) => setType(v as any)}>
                        <SelectTrigger className="h-8 text-xs">
                          <span>{type === 'hotlist' ? '热榜选题' : 'YouTube 对标'}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hotlist">热榜选题</SelectItem>
                          <SelectItem value="youtube">YouTube 对标</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {type === 'hotlist' ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs">平台</Label>
                        <Select value={platform} onValueChange={setPlatform}>
                          <SelectTrigger className="h-8 text-xs">
                            <span>{HOT_PLATFORMS.find((p) => p.value === platform)?.label}</span>
                          </SelectTrigger>
                          <SelectContent>
                            {HOT_PLATFORMS.map((p) => (
                              <SelectItem key={p.value} value={p.value} disabled={!p.available}>
                                {p.label}
                                {!p.available ? ' (暂不可用)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <Label className="text-xs">频道 ID</Label>
                        <Input
                          value={targetId}
                          onChange={(e) => setTargetId(e.target.value)}
                          placeholder="UCxxxx"
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-xs">名称</Label>
                      <Input
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="如：百度热搜"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">关键词（可选）</Label>
                      <Input
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder="仅抓含此词"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <Button onClick={handleAdd} size="sm">
                    {editingTarget ? '保存修改' : '添加'}
                  </Button>
                </div>
              )}

              {/* 目标列表 */}
              {targets.length === 0 ? (
                <p className="text-sm text-muted-foreground">还没有监控目标。点「添加」开始。</p>
              ) : (
                <div className="space-y-1.5">
                  {targets.map((t) => {
                    const pConfig = HOT_PLATFORMS.find((p) => p.value === t.platform)
                    return (
                      <div
                        key={t.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border bg-background text-sm"
                      >
                        <Switch
                          checked={t.enabled}
                          onCheckedChange={() => handleToggleEnabled(t)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{t.label}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {t.type === 'hotlist'
                                ? `热榜·${t.platform}`
                                : `YouTube${t.targetId ? `·${t.targetId}` : ''}`}
                            </Badge>
                            {!pConfig?.available && t.type === 'hotlist' && (
                              <span className="text-[10px] text-amber-500">暂不可用</span>
                            )}
                          </div>
                          {t.keyword && (
                            <span className="text-xs text-muted-foreground">
                              关键词: {t.keyword}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(t)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDelete(t.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 快照预览 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  热榜快照
                  {currentItems.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {currentItems.length} 条
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  {/* 日期快捷选择 */}
                  {dateShortcuts.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => setSelectedDate(d.value)}
                      className={cn(
                        'px-2 py-0.5 text-xs rounded-full border transition-colors',
                        selectedDate === d.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'text-muted-foreground hover:bg-muted border-transparent',
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-2 py-0.5 text-xs border rounded-lg bg-background"
                    max={today}
                  />
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 平台 Tabs */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setSnapshotTab('all')}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-full border transition-colors',
                    snapshotTab === 'all'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'text-muted-foreground hover:bg-muted border-border',
                  )}
                >
                  全部
                </button>
                {activePlatforms.map((p) => (
                  <button
                    key={p}
                    onClick={() => setSnapshotTab(p)}
                    onDoubleClick={() => handleRefreshPlatform(p)}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-full border transition-colors flex items-center gap-1',
                      snapshotTab === p
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'text-muted-foreground hover:bg-muted border-border',
                    )}
                  >
                    {p}
                    {refreshingPlatform === p && <Loader2 className="w-3 h-3 animate-spin" />}
                  </button>
                ))}
                {platformSnapshots.has('youtube') && (
                  <button
                    onClick={() => setSnapshotTab('youtube')}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-full border transition-colors flex items-center gap-1',
                      snapshotTab === 'youtube'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'text-muted-foreground hover:bg-muted border-border',
                    )}
                  >
                    <Video className="w-3 h-3" /> YouTube
                  </button>
                )}
              </div>

              {/* 热度图 */}
              {heatData.length > 0 && snapshotTab !== 'youtube' && (
                <div className="border rounded-lg p-3 bg-muted/10">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={heatData} layout="vertical" margin={{ left: 0, right: 10 }}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value) => [`${Number(value).toLocaleString()} 热度`, '']}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="heat" radius={[0, 4, 4, 0]}>
                        {heatData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* 条目列表 */}
              {currentItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  暂无快照数据。点「立即运行」抓取热榜。
                </p>
              ) : (
                <ol className="space-y-1 text-sm">
                  {currentItems.slice(0, 30).map((it: any, i: number) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-muted/30 transition-colors"
                    >
                      <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="flex-1">{it.title}</span>
                        {it.heat && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {Number(it.heat).toLocaleString()} 热度
                          </span>
                        )}
                        {it.url && (
                          <a
                            href={it.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1.5 text-indigo-500 hover:underline"
                          >
                            <ExternalLink className="inline h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  )
}
