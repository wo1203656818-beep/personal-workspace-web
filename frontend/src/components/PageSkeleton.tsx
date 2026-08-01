import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * 单个骨架卡片行
 */
function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <Skeleton className="size-8 shrink-0 rounded-md" />
      <div className="flex-1 space-y-2">
        <Skeleton className={cn('h-4 w-full', className)} />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="size-6 shrink-0 rounded-full" />
    </div>
  )
}

/**
 * 列表型骨架屏：页面壳（顶部标题栏 + 6 行列表项）
 */
export function PageSkeleton() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="space-y-3">
        <SkeletonRow className="w-3/4" />
        <SkeletonRow className="w-5/6" />
        <SkeletonRow className="w-2/3" />
        <SkeletonRow className="w-4/5" />
        <SkeletonRow className="w-3/5" />
        <SkeletonRow className="w-7/8" />
      </div>
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[280px_1fr]">
      <div className="hidden border-r p-4 md:block">
        <div className="mb-4 space-y-1">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg p-2">
              <Skeleton className="size-4 shrink-0 rounded" />
              <Skeleton className={cn('h-4', i % 2 === 0 ? 'w-3/4' : 'w-1/2')} />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-6 p-6">
        <div className="rounded-lg border bg-card p-5">
          <Skeleton className="mb-3 h-7 w-48" />
          <Skeleton className="mb-6 h-4 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <Skeleton className="mt-1.5 size-2 shrink-0 rounded-full" />
                <Skeleton className={cn('h-4', i % 3 === 0 ? 'w-full' : i % 3 === 1 ? 'w-4/5' : 'w-3/5')} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <div className="space-y-1">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4">
          <div className="mb-4 flex items-center gap-2">
            <Skeleton className="size-5 rounded-md" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-3/4 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SidebarSkeleton() {
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-2.5">
          <Skeleton className="size-4 shrink-0 rounded" />
          <Skeleton className={cn('h-4', i % 2 === 0 ? 'w-5/6' : 'w-2/3')} />
        </div>
      ))}
    </div>
  )
}

export default PageSkeleton
