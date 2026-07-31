import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { decisionTemplatesApi, decisionRulesApi, type DecisionTemplate } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Train, ShoppingCart, UtensilsCrossed, Clock, Users, HelpCircle, Check, Plus } from 'lucide-react'

const CATEGORIES = [
  { value: '出行', label: '出行', icon: Train },
  { value: '购物', label: '购物', icon: ShoppingCart },
  { value: '饮食', label: '饮食', icon: UtensilsCrossed },
  { value: '时间安排', label: '时间安排', icon: Clock },
  { value: '社交', label: '社交', icon: Users },
  { value: '其他', label: '其他', icon: HelpCircle },
]

export function DecisionTemplates() {
  const queryClient = useQueryClient()
  const [activeCategory, setActiveCategory] = useState('出行')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: templates = [] } = useQuery({
    queryKey: ['decision-templates'],
    queryFn: decisionTemplatesApi.list,
  })

  const { data: rules = [] } = useQuery({
    queryKey: ['decision-rules'],
    queryFn: decisionRulesApi.list,
  })

  const applyMutation = useMutation({
    mutationFn: (id: string) => decisionTemplatesApi.apply(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decision-rules'] })
      toast.success('规则已套用')
    },
  })

  const batchApplyMutation = useMutation({
    mutationFn: (ids: string[]) => decisionTemplatesApi.batchApply(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['decision-rules'] })
      toast.success(`已套用 ${data.count} 条规则`)
      setSelectedIds(new Set())
    },
  })

  const filteredTemplates = templates.filter((t: DecisionTemplate) => t.category === activeCategory)

  const isApplied = (template: DecisionTemplate) => {
    return rules.some((r) => r.title === template.title && r.condition === template.condition)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">决策规则模板库</h3>
        <p className="text-sm text-muted-foreground">
          预设好的决策规则，一键套用到你的规则库。遇到类似场景直接套用，不用重新思考。
        </p>
      </div>

      {/* 分类标签 */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat.value}
            variant={activeCategory === cat.value ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => setActiveCategory(cat.value)}
          >
            <cat.icon className="size-3.5" />
            {cat.label}
          </Button>
        ))}
      </div>

      {/* 模板列表 */}
      <div className="space-y-2">
        {filteredTemplates.map((template) => {
          const applied = isApplied(template)
          const selected = selectedIds.has(template.id)
          return (
            <div
              key={template.id}
              className={`rounded-lg border p-3 transition-colors ${
                applied ? 'bg-muted/50 opacity-60' : selected ? 'border-primary bg-primary/5' : 'bg-card'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium">{template.title}</h4>
                    {applied && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Check className="size-3" /> 已套用
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">如果：{template.condition}</p>
                  <p className="text-xs font-medium text-primary">就：{template.action}</p>
                  {template.description && (
                    <p className="text-xs text-muted-foreground italic">{template.description}</p>
                  )}
                </div>
                {!applied && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-8 p-0"
                      onClick={() => toggleSelect(template.id)}
                    >
                      <div className={`size-4 rounded border-2 ${
                        selected ? 'border-primary bg-primary' : 'border-muted-foreground'
                      }`}>
                        {selected && <Check className="size-3 text-primary-foreground m-0.5" />}
                      </div>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-8 p-0"
                      onClick={() => applyMutation.mutate(template.id)}
                      disabled={applyMutation.isPending}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {filteredTemplates.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            该分类暂无模板
          </p>
        )}
      </div>

      {/* 批量套用 */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-0 bg-background border-t p-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">已选 {selectedIds.size} 条</span>
          <Button
            size="sm"
            onClick={() => batchApplyMutation.mutate(Array.from(selectedIds))}
            disabled={batchApplyMutation.isPending}
          >
            批量套用
          </Button>
        </div>
      )}
    </div>
  )
}
