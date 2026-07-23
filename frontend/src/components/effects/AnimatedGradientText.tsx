import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * 渐变流动文字（Aceternity 风格源码移植）
 * 文字呈紫调渐变并循环流动，用于标题强调
 */
export function AnimatedGradientText({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline animate-gradient-text bg-[length:200%_auto] bg-clip-text text-transparent",
        "[background-image:linear-gradient(90deg,hsl(258_90%_66%),hsl(280_90%_72%),hsl(258_90%_66%))]",
        className
      )}
      style={{ backgroundSize: "200% auto" }}
      {...props}
    >
      {children}
    </span>
  )
}
