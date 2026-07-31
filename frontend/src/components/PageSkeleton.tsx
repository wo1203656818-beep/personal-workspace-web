import { Skeleton } from '@/components/ui/skeleton'

/**
 * 列表型骨架屏：页面壳（顶部标题栏 + 6 行列表项）
 */
export function PageSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <Skeleton className="h-8 w-32" />
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[280px_1fr]">
      <div className="hidden border-r p-4 md:block">
        <Skeleton className="mb-3 h-5 w-24" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
      <div className="p-6">
        <Skeleton className="mb-4 h-7 w-48" />
        <Skeleton className="mb-6 h-4 w-32" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-4">
          <Skeleton className="mb-3 h-5 w-32" />
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
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
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  )
}

export default PageSkeleton
