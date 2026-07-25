import { useRef, useCallback, type TouchEvent } from 'react'

interface SwipeHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
}

export function useSwipeGesture({ onSwipeLeft, onSwipeRight, threshold = 80 }: SwipeHandlers) {
  const startX = useRef(0)
  const startY = useRef(0)
  const swiping = useRef(false)

  const onTouchStart = useCallback((e: TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    swiping.current = false
  }, [])

  const onTouchMove = useCallback((e: TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    // 只在水平滑动距离大于垂直时跟踪
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      swiping.current = true
    }
  }, [])

  const onTouchEnd = useCallback((e: TouchEvent) => {
    if (!swiping.current) return
    const dx = e.changedTouches[0].clientX - startX.current
    if (dx < -threshold && onSwipeLeft) {
      onSwipeLeft()
    } else if (dx > threshold && onSwipeRight) {
      onSwipeRight()
    }
    swiping.current = false
  }, [onSwipeLeft, onSwipeRight, threshold])

  return { onTouchStart, onTouchMove, onTouchEnd }
}
