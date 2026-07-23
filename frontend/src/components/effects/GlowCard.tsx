import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * 悬浮发光卡片（Aceternity 风格源码移植）
 * 鼠标悬浮时显示紫调辉光，用于分析页统计卡片等
 */
export function GlowCard({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/60 bg-card p-6 transition-all duration-200 hover:border-primary/40",
        "before:pointer-events-none before:absolute before:-inset-px before:rounded-xl before:bg-gradient-to-b before:from-primary/10 before:to-transparent before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100",
        className
      )}
      {...props}
    >
      <div
        className="pointer-events-none absolute -inset-[1px] rounded-xl bg-gradient-to-r from-primary/0 via-primary/10 to-primary/0 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100"
        aria-hidden
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
