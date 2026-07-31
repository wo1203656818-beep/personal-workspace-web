import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { decisionRulesApi, type DecisionRule } from '@/lib/api/decision-rules'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, Plus, Train, ShoppingCart, UtensilsCrossed, Clock, HelpCircle } from 'lucide-react'

const CATEGORIES = [
  { value: '出行', label: '出行', icon: Train },
  { value: '购物', label: '购物', icon: ShoppingCart },
  { value: '饮食', label: '饮食', icon: UtensilsCrossed },
  { value: '时间安排', label: '时间安排', icon: Clock },
  { value: '其他', label: '其他', icon: HelpCircle },
]

export function DecisionRules() {
  const queryClient = useQueryClient()
  const [activeCategory, setActiveCategory] = useState('出行')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', condition: '', action: '' })

  const { data: rules = [] } = useQuery({
    queryKey: ['decision-rules'],
    queryFn: decisionRulesApi.list,
  })

  const createMutation = useMutation({
    mutationFn: decisionRulesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decision-rules'] })
      setForm({ title: '', condition: '', action: '' })
      setShowForm(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: decisionRulesApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['decision-rules'] }),
  })

  const filteredRules = rules.filter((r: DecisionRule) => r.category === activeCategory)

  const handleCreate = () => {
    if (!form.title || !form.condition || !form.action) return
    createMutation.mutate({ category: activeCategory, ...form })
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <p className="text-sm text-muted-foreground">
        提前定好规则，遇到直接套用，不用每次重新纠结。
      </p>

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

      {/* 规则列表 */}
      <div className="space-y-3">
        {filteredRules.map((rule: DecisionRule) => (
          <div key={rule.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <h4 className="text-sm font-medium">{rule.title}</h4>
                <p className="text-xs text-muted-foreground">
                  如果：{rule.condition}
                </p>
                <p className="text-xs font-medium text-primary">
                  就：{rule.action}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => deleteMutation.mutate(rule.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}

        {filteredRules.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            还没有规则，添加第一条吧
          </p>
        )}
      </div>

      {/* 添加表单 */}
      {showForm ? (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h4 className="text-sm font-medium">添加规则</h4>
          <Input
            placeholder="规则标题，如：短途出行"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Input
            placeholder="条件，如：差价<100元"
            value={form.condition}
            onChange={(e) => setForm({ ...form, condition: e.target.value })}
          />
          <Input
            placeholder="行动，如：直接选高铁"
            value={form.action}
            onChange={(e) => setForm({ ...form, action: e.target.value })}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={createMutation.isPending}>
              添加
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              取消
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="gap-2" onClick={() => setShowForm(true)}>
          <Plus className="size-4" />
          添加规则
        </Button>
      )}
    </div>
  )
}
