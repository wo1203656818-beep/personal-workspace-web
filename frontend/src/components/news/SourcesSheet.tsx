import { useState } from 'react'
import { RefreshCw, Loader2, Search, Settings, Plus, Trash2 } from 'lucide-react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface NewsSource {
  id: string
  name: string
  url: string
  type: string
  category: string
  lang: string
  enabled: boolean
  weight: number
}

export function SourcesSheet({
  open,
  onOpenChange,
  sources,
  onToggle,
  onAdd,
  onDelete,
  onReset,
  isResetting,
  isAdding,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sources: NewsSource[] | undefined
  onToggle: (source: NewsSource, enabled: boolean) => void
  onAdd: (source: { name: string; url: string; type: string; category: string; lang: string; enabled: boolean }) => void
  onDelete: (id: string) => void
  onReset: () => void
  isResetting: boolean
  isAdding: boolean
}) {
  const [sourceSearch, setSourceSearch] = useState('')
  const [newSource, setNewSource] = useState({ name: '', url: '', type: 'rss', category: '综合', lang: 'en', enabled: true })

  const sourcesByCategory = (sources || []).reduce<Record<string, NewsSource[]>>((acc, s) => {
    const cat = s.category || '未分类'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(s)
    return acc
  }, {})

  const filteredSourcesByCategory = sourceSearch
    ? Object.fromEntries(
        Object.entries(sourcesByCategory).map(([cat, srcs]) => [
          cat,
          srcs.filter(s => s.name.toLowerCase().includes(sourceSearch.toLowerCase()) || s.url.toLowerCase().includes(sourceSearch.toLowerCase())),
        ]).filter(([, srcs]) => srcs.length > 0)
      )
    : sourcesByCategory

  const handleAddSource = () => {
    if (!newSource.name || !newSource.url) return
    onAdd(newSource)
    setNewSource({ name: '', url: '', type: 'rss', category: '综合', lang: 'en', enabled: true })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Settings className="w-5 h-5" /> 订阅源管理</SheetTitle>
          <SheetDescription>管理新闻订阅源的启用状态，或添加新的订阅源。</SheetDescription>
        </SheetHeader>
        <div className="px-4 space-y-4">
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            disabled={isResetting}
            onClick={() => {
              if (confirm('确定要重置所有资讯源吗？这会删除所有现有源并替换为精选源（约 30 个高质量源）。已抓取的新闻也会被清空。')) {
                onReset()
              }
            }}
          >
            {isResetting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            重置为精选源
          </Button>
          {sources && sources.length > 0 && (
            <div className="relative mt-4">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={`搜索 ${sources.length} 个订阅源...`}
                value={sourceSearch}
                onChange={(e) => setSourceSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          )}
          {sources ? (
            Object.entries(filteredSourcesByCategory as Record<string, NewsSource[]>).map(([cat, catSources]) => (
              <div key={cat}>
                <h3 className="text-sm font-semibold mb-2">{cat}（{catSources.length}）</h3>
                <div className="space-y-1.5">
                  {catSources.map(source => (
                    <div key={source.id} className="flex items-center gap-2 p-2 rounded-lg border bg-background text-sm">
                      <Switch checked={source.enabled} onCheckedChange={(checked) => onToggle(source, checked)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate">{source.name}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{source.type}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{source.url}</p>
                      </div>
                      <button onClick={() => onDelete(source.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="删除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          )}

          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Plus className="w-4 h-4" /> 添加订阅源</h3>
            <div className="space-y-2">
              <Input placeholder="名称" value={newSource.name} onChange={(e) => setNewSource(s => ({ ...s, name: e.target.value }))} />
              <Input placeholder="URL" value={newSource.url} onChange={(e) => setNewSource(s => ({ ...s, url: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Select value={newSource.type} onValueChange={(v) => setNewSource(s => ({ ...s, type: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="类型" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rss">RSS</SelectItem>
                    <SelectItem value="rsshub">RSSHub</SelectItem>
                    <SelectItem value="api">API</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={newSource.category} onValueChange={(v) => setNewSource(s => ({ ...s, category: v }))}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="分类" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="加密">加密</SelectItem>
                    <SelectItem value="财经">财经</SelectItem>
                    <SelectItem value="科技">科技</SelectItem>
                    <SelectItem value="综合">综合</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input placeholder="语言 (en/zh)" value={newSource.lang} onChange={(e) => setNewSource(s => ({ ...s, lang: e.target.value }))} />
              <Button onClick={handleAddSource} disabled={isAdding} className="w-full" size="sm">
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                添加
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
