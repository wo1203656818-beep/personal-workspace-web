import { useState, useRef, useEffect } from 'react'
import { Download, Upload, Loader2, Shield, FileText, ListTodo, BookHeart, Bookmark, Timer, CheckSquare, Square } from 'lucide-react'
import { toast } from 'sonner'
import { backupApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/hooks/use-page-title'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const DATA_TYPES = [
  { key: 'tasks', label: '任务', icon: ListTodo, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { key: 'notes', label: '笔记', icon: FileText, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  { key: 'journal', label: '日记', icon: BookHeart, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { key: 'bookmarks', label: '链接收藏', icon: Bookmark, color: 'text-teal-500', bg: 'bg-teal-500/10' },
  { key: 'focus', label: '专注记录', icon: Timer, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  { key: 'habits', label: '习惯', icon: ListTodo, color: 'text-green-500', bg: 'bg-green-500/10' },
  { key: 'goals', label: '目标', icon: ListTodo, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  { key: 'media', label: '书影清单', icon: ListTodo, color: 'text-pink-500', bg: 'bg-pink-500/10' },
  { key: 'expenses', label: '记账', icon: ListTodo, color: 'text-orange-500', bg: 'bg-orange-500/10' },
] as const

const DATA_TYPE_LABELS: Record<string, string> = {
  tasks: '任务',
  notes: '笔记',
  journal: '日记',
  bookmarks: '链接收藏',
  focus: '专注记录',
  habits: '习惯',
  goals: '目标',
  media: '书影清单',
  expenses: '记账',
}

export function BackupPage() {
  usePageTitle('备份')
  const fileRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importConfirm, setImportConfirm] = useState(false)
  const [importData, setImportData] = useState<any>(null)
  const [importPreview, setImportPreview] = useState<any>(null)
  const [fileSize, setFileSize] = useState('')
  const [lastExport, setLastExport] = useState<string | null>(() => localStorage.getItem('lastBackupExport'))
  const [lastImport, setLastImport] = useState<string | null>(() => localStorage.getItem('lastBackupImport'))
  const [estimatedSize, setEstimatedSize] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(DATA_TYPES.map(t => t.key)))

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const toggleType = (key: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleExport = async () => {
    if (selectedTypes.size === 0) {
      toast.error('请至少选择一种数据类型')
      return
    }
    setExporting(true)
    setProgress(10)
    setProgressLabel('正在读取数据...')
    try {
      const fullData = await backupApi.export()
      setProgress(60)
      setProgressLabel('正在过滤数据...')
      const filteredData: Record<string, any[]> = {}
      for (const key of selectedTypes) {
        if (fullData.data[key]) {
          filteredData[key] = fullData.data[key]
        }
      }
      const exportPayload = {
        version: fullData.version,
        exportedAt: fullData.exportedAt,
        data: filteredData,
      }
      setProgress(80)
      setProgressLabel('正在生成文件...')
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' })
      setProgress(90)
      setProgressLabel('正在下载...')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setProgress(100)
      setProgressLabel('完成')
      const now = new Date().toLocaleString('zh-CN')
      localStorage.setItem('lastBackupExport', now)
      setLastExport(now)
      toast.success('数据已导出')
    } catch (err: any) {
      toast.error(`导出失败: ${err.message}`)
    } finally {
      setExporting(false)
      setTimeout(() => { setProgress(0); setProgressLabel('') }, 2000)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (!data.data || typeof data.data !== 'object') {
          toast.error('无效的备份文件格式')
          return
        }
        setImportData(data)
        setFileSize(formatFileSize(file.size))
        const preview: Record<string, number> = {}
        for (const [key, items] of Object.entries(data.data)) {
          const label = DATA_TYPE_LABELS[key] || key
          preview[label] = Array.isArray(items) ? items.length : 0
        }
        setImportPreview(preview)
        setImportConfirm(true)
      } catch {
        toast.error('无效的 JSON 文件')
      }
    }
    reader.readAsText(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleImport = async () => {
    if (!importData) return
    setImporting(true)
    setProgress(10)
    setProgressLabel('正在导入数据...')
    try {
      const result = await backupApi.import(importData)
      setProgress(100)
      setProgressLabel(`已导入 ${result.imported} 条记录`)
      toast.success(`已导入 ${result.imported} 条记录`)
      const now = new Date().toLocaleString('zh-CN')
      localStorage.setItem('lastBackupImport', now)
      setLastImport(now)
      setImportConfirm(false)
      setImportData(null)
      setImportPreview(null)
    } catch (err: any) {
      toast.error(`导入失败: ${err.message}`)
    } finally {
      setImporting(false)
      setTimeout(() => { setProgress(0); setProgressLabel('') }, 2000)
    }
  }

  const totalSelected = selectedTypes.size
  const allSelected = selectedTypes.size === DATA_TYPES.length

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault()
        handleExport()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault()
        fileRef.current?.click()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedTypes])

  const estimateExportSize = async () => {
    if (selectedTypes.size === 0) {
      toast.error('请至少选择一种数据类型')
      return
    }
    setEstimatedSize(null)
    try {
      const fullData = await backupApi.export()
      const filteredData: Record<string, any[]> = {}
      for (const key of selectedTypes) {
        if (fullData.data[key]) {
          filteredData[key] = fullData.data[key]
        }
      }
      const payload = { version: fullData.version, exportedAt: fullData.exportedAt, data: filteredData }
      const json = JSON.stringify(payload)
      const bytes = new TextEncoder().encode(json).length
      setEstimatedSize(formatFileSize(bytes))
    } catch {
      setEstimatedSize('未知')
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card/50 px-4 py-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 text-white md:size-10">
            <Shield className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">数据备份</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">导出和导入所有数据</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {/* Progress Bar */}
          {progress > 0 && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <Loader2 className="size-3.5 animate-spin" />
                    {progressLabel}
                  </span>
                  <span className="text-xs text-muted-foreground">{progress}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </CardContent>
            </Card>
          )}

          {/* Export Section */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                  <Download className="size-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm">导出数据</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    选择要导出的数据类型，将所有数据导出为 JSON 文件
                  </p>

                  {/* Data type selection */}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {DATA_TYPES.map(({ key, label, icon: Icon, color, bg }) => (
                      <button
                        key={key}
                        onClick={() => toggleType(key)}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border p-2.5 text-left transition-all',
                          selectedTypes.has(key)
                            ? 'border-primary/30 bg-primary/5'
                            : 'border-border hover:bg-accent/50'
                        )}
                      >
                        {selectedTypes.has(key) ? (
                          <CheckSquare className="size-4 text-primary shrink-0" />
                        ) : (
                          <Square className="size-4 text-muted-foreground shrink-0" />
                        )}
                        <div className={cn('flex size-7 items-center justify-center rounded-lg shrink-0', bg)}>
                          <Icon className={cn('size-3.5', color)} />
                        </div>
                        <span className="text-xs font-medium">{label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px]"
                      onClick={() => {
                        if (allSelected) {
                          setSelectedTypes(new Set())
                        } else {
                          setSelectedTypes(new Set(DATA_TYPES.map(t => t.key)))
                        }
                      }}
                    >
                      {allSelected ? <Square className="size-3 mr-1" /> : <CheckSquare className="size-3 mr-1" />}
                      {allSelected ? '取消全选' : '全选'}
                    </Button>
                    <span className="text-[10px] text-muted-foreground">
                      已选 {totalSelected}/{DATA_TYPES.length} 类
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" className="gap-1.5 rounded-lg" onClick={handleExport} disabled={exporting || totalSelected === 0}>
                      {exporting ? <><Loader2 className="size-4 animate-spin" /> 导出中...</> : <><Download className="size-4" /> 导出已选数据</>}
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5 rounded-lg" onClick={estimateExportSize} disabled={totalSelected === 0}>
                      估算大小
                    </Button>
                    {estimatedSize && (
                      <span className="text-[10px] text-muted-foreground">
                        约 {estimatedSize}
                      </span>
                    )}
                  </div>

                  {lastExport && (
                    <p className="mt-2 text-xs text-muted-foreground">上次导出: {lastExport}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Import Section */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                  <Upload className="size-5 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm">导入数据</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    从备份文件恢复数据。注意：导入会添加数据，不会覆盖现有记录
                  </p>
                  <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
                  <Button size="sm" className="mt-3 gap-1.5 rounded-lg" variant="outline" onClick={() => fileRef.current?.click()}>
                    <Upload className="size-4" />选择文件导入
                  </Button>
                  {lastImport && (
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">上次导入: {lastImport}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 text-[10px] text-destructive"
                        onClick={() => {
                          localStorage.removeItem('lastBackupImport')
                          setLastImport(null)
                          toast.success('已清除导入记录')
                        }}
                      >
                        清除
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={importConfirm} onOpenChange={(o) => { if (!o) { setImportConfirm(false); setImportData(null); setImportPreview(null) }}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认导入数据</AlertDialogTitle>
            <AlertDialogDescription>
              {importPreview && (
                <div className="mt-2 space-y-1.5">
                  {Object.entries(importPreview).map(([label, count]) => (
                    <div key={label} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">{String(count)} 条</span>
                    </div>
                  ))}
                  <div className="border-t pt-1.5 mt-1.5 flex items-center justify-between text-xs font-medium">
                    <span>总计</span>
                    <span>{String(Object.values(importPreview).reduce((a, b) => (a as number) + (b as number), 0))} 条</span>
                  </div>
                </div>
              )}
              {fileSize && <p className="mt-2 text-xs text-muted-foreground">文件大小: {fileSize}</p>}
              <p className="mt-2 text-xs text-amber-500">此操作不会覆盖现有数据，但可能导致重复。</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleImport} disabled={importing}>
              {importing ? <><Loader2 className="size-4 animate-spin mr-1" /> 导入中...</> : '确认导入'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}