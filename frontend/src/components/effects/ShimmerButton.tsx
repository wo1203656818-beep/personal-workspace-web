import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * 微光按钮（Aceternity 风格源码移植）
 * 按钮表面有一圈旋转的微光，用于 CTA（如登录提交）
 */
export function ShimmerButton({
  className,
  children,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "relative inline-flex h-11 items-center justify-center overflow-hidden rounded-md border border-primary/30 bg-primary px-6 text-sm font-medium text-primary-foreground transition-transform duration-150 active:scale-[0.97]",
        "before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:animate-[shimmer_2.5s_infinite]",
        className
      )}
      {...props}
    >
      <span className="relative z-10">{children}</span>
    </button>
  )
}
