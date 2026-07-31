import { useQuery } from '@tanstack/react-query'
import { tasksApi } from '@/lib/api/tasks'
import { Sun, Moon, CloudSun, Clock } from 'lucide-react'
import type { Task } from '@/lib/api/types'

const energyIcons = {
  high: Sun,
  medium: CloudSun,
  low: Moon,
}

const energyColors = {
  high: 'text-orange-500',
  medium: 'text-blue-500',
  low: 'text-purple-500',
}

export function EnergyMatch() {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'energy-match'],
    queryFn: tasksApi.energyMatch,
    staleTime: 10 * 60 * 1000,
  })

  if (isLoading || !data) return null
  if (data.tasks.length === 0) return null

  const Icon = energyIcons[data.recommendedEnergy as keyof typeof energyIcons] || Clock
  const color = energyColors[data.recommendedEnergy as keyof typeof energyColors] || 'text-muted-foreground'

  return (
    <div className="rounded-lg border bg-gradient-to-r from-primary/5 to-primary/10 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`size-5 ${color}`} />
        <h3 className="text-sm font-medium">能量匹配推荐</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{data.timeContext}</p>

      <div className="space-y-2">
        {data.tasks.slice(0, 3).map((task: Task) => (
          <div key={task.id} className="flex items-center justify-between gap-2 rounded-md bg-background/50 px-3 py-2">
            <span className="text-sm truncate">{task.title}</span>
            {task.firstStep && (
              <span className="text-xs text-muted-foreground shrink-0">
                第一步: {task.firstStep}
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs mt-3 italic text-primary/80">{data.tip}</p>
    </div>
  )
}
