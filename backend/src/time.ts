/**
 * 北京时间（UTC+8）工具函数
 * 统一使用 Intl.DateTimeFormat 获取真正的北京时间，不依赖手动偏移
 */

// 返回北京时间的 ISO 字符串（带 +08:00 后缀），用于数据库存储
export function nowBeijing(): string {
  return formatBeijing(new Date())
}

// 将任意 Date 格式化为北京时间的 ISO 字符串（带 +08:00 后缀）
export function formatBeijing(d: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+08:00`
}

// 返回北京时间的日期字符串 yyyy-MM-dd（用于 myDayDate / dueDate / SQL 比较）
export function todayBeijing(): string {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(now) // en-CA 格式: yyyy-MM-dd
}

// 兼容旧代码名
export const nowCST = nowBeijing
export const todayCST = todayBeijing
