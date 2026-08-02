import { useRef, useCallback, type TouchEvent } from 'react'

interface SwipeHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
}

// 在这些元素内的触摸不触发滑动（避免与文本选择/光标移动冲突）
function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"], button, a, [role="button"]'),
  )
}

export function useSwipeGesture({ onSwipeLeft, onSwipeRight, threshold = 80 }: SwipeHandlers) {
  const startX = useRef(0)
  const startY = useRef(0)
  const swiping = useRef(false)

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (isInteractiveTarget(e.target)) {
      swiping.current = false
      return
    }
    if (!e.touches.length) return
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    swiping.current = false
  }, [])

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!e.touches.length) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    // 只在水平滑动距离大于垂直时跟踪
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      swiping.current = true
    }
  }, [])

  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!swiping.current) return
      const touch = e.changedTouches?.[0]
      if (!touch) return
      const dx = touch.clientX - startX.current
      if (dx < -threshold && onSwipeLeft) {
        onSwipeLeft()
      } else if (dx > threshold && onSwipeRight) {
        onSwipeRight()
      }
      swiping.current = false
    },
    [onSwipeLeft, onSwipeRight, threshold],
  )

  return { onTouchStart, onTouchMove, onTouchEnd }
}
