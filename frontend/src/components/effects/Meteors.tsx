import { cn } from "@/lib/utils"

/**
 * 流星点缀（Aceternity 风格源码移植）
 * 多条紫调流星从顶部斜向坠落，用于登录页背景氛围
 * 必须包裹在 `relative overflow-hidden` 的父容器中
 */
export function Meteors({
  number = 20,
  className,
}: {
  number?: number
  className?: string
}) {
  const meteors = new Array(number).fill(true)
  return (
    <>
      {meteors.map((_, idx) => (
        <span
          key={idx}
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 size-0.5 rotate-[215deg] animate-meteor rounded-full bg-primary shadow-[0_0_0_1px_#ffffff10]",
            "before:absolute before:top-1/2 before:h-px before:w-[60px] before:-translate-y-1/2 before:bg-gradient-to-r before:from-primary before:to-transparent before:content-['']",
            className
          )}
          style={{
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${Math.random() * 5 + 5}s`,
          }}
        />
      ))}
    </>
  )
}
