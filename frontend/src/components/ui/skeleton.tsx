import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'rounded-md bg-gradient-to-r from-accent via-accent/70 to-accent bg-[length:200%_100%] animate-shimmer relative overflow-hidden',
        'before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/5 before:to-transparent before:animate-shimmer',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
