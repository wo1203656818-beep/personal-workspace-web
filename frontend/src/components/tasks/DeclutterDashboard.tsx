import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { declutterApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Trash2, CheckCircle, Clock, Shield } from 'lucide-react'

export function DeclutterDashboard() {
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: stats } = useQuery({
    queryKey: ['declutter', 'stats'],
    queryFn: declutterApi.stats,
  })

  const { data: staleTasks = [] } = useQuery({
    queryKey: ['declutter', 'stale-tasks'],
    queryFn: declutterApi.staleTasks,
  })

  const { data: orphanedRules = [] } = useQuery({
    queryKey: ['declutter', 'orphaned-rules'],
    queryFn: declutterApi.orphanedRules,
  })

  const cleanupMutation = useMutation({
    mutationFn: declutterApi.cleanup,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['declutter'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast.success(`已清理 ${data.cleaned} 个任务`)
      setSelectedIds(new Set())
    },
  })

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">数字断舍离</h3>
        <p className="text-sm text-muted-foreground">定期清理积压，保持系统清爽</p>
      </div>

      {/* 统计概览 */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold">{stats.totalTasks}</div>
            <p className="text-xs text-muted-foreground">待办任务</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold text-yellow-500">{stats.staleTasks}</div>
            <p className="text-xs text-muted-foreground">逾期未动</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-2xl font-bold">{stats.totalRules}</div>
            <p className="text-xs text-muted-foreground">决策规则</p>
          </div>
        </div>
      )}

      {/* 逾期任务 */}
      {staleTasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Clock className="size-4 text-yellow-500" />
            逾期任务（{staleTasks.length}个）
          </h4>
          <p className="text-xs text-muted-foreground">超过3天未行动的任务，建议清理或重新评估</p>
          <div className="space-y-1">
            {staleTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2 rounded-lg border p-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="size-6 p-0"
                  onClick={() => toggleSelect(task.id)}
                >
                  <div className={`size-4 rounded border-2 ${
                    selectedIds.has(task.id) ? 'border-primary bg-primary' : 'border-muted-foreground'
                  }`}>
                    {selectedIds.has(task.id) && <CheckCircle className="size-3 text-primary-foreground m-0.5" />}
                  </div>
                </Button>
                <span className="text-sm flex-1 truncate">{task.title}</span>
                <span className="text-xs text-muted-foreground">
                  {task.updatedAt ? new Date(task.updatedAt).toLocaleDateString() : '-'}
                </span>
              </div>
            ))}
          </div>
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              className="gap-1"
              onClick={() => cleanupMutation.mutate(Array.from(selectedIds))}
              disabled={cleanupMutation.isPending}
            >
              <Trash2 className="size-3" />
              清理选中的 {selectedIds.size} 个任务
            </Button>
          )}
        </div>
      )}

      {/* 未使用的规则 */}
      {orphanedRules.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Shield className="size-4 text-muted-foreground" />
            未使用的决策规则（{orphanedRules.length}条）
          </h4>
          <p className="text-xs text-muted-foreground">从未套用过的规则，可以考虑删除</p>
          <div className="space-y-1">
            {orphanedRules.map((rule) => (
              <div key={rule.id} className="rounded-lg border p-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{rule.category}</Badge>
                  <span className="text-sm">{rule.title}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  如果 {rule.condition}，就 {rule.action}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {staleTasks.length === 0 && orphanedRules.length === 0 && (
        <div className="text-center py-8">
          <CheckCircle className="size-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">系统很清爽，无需清理</p>
        </div>
      )}
    </div>
  )
}
