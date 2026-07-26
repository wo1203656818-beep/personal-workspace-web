// 时区工具：统一把"后端以北京时间存储的时间字符串"按北京时间（Asia/Shanghai）渲染。
//
// 背景：后端所有 createdAt/updatedAt/importedAt 都以北京时间存储，格式为：
//   1) ISO 带 +08:00 后缀："2026-07-25T16:39:59+08:00"（新格式）
//   2) D1 默认 datetime('now') 产出 "2026-07-25 08:39:59"（空格、无时区后缀，旧数据）
//
// 本工具在解析阶段：
//   - 新格式 (+08:00)：new Date() 能正确解析
//   - 空格格式：补 Z 当 UTC 解析（旧数据兼容）
// 再用 Intl 以 Asia/Shanghai 渲染，确保显示正确。

const TZ = 'Asia/Shanghai'

/** 把存储的时间字符串解析为 Date 对象（无法解析返回 null）。 */
export function parseStoredTime(input: string | null | undefined): Date | null {
  if (!input) return null
  let s = input.trim()
  // 纯日期（yyyy-MM-dd）：视作该日历日的北京时间零点
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00+08:00')
  // D1 空格格式（旧数据）-> 补 T 和 Z，当 UTC 解析
  if (s.includes(' ') && !s.includes('T')) s = s.replace(' ', 'T') + 'Z'
  // 新格式 (+08:00) 或旧格式 (Z) 都能被 new Date() 正确解析
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

type Part = { y: string; mo: string; d: string; h: string; mi: string }
function getParts(date: Date): Part {
  const tf = new Intl.DateTimeFormat('zh-CN', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const m: Record<string, string> = {}
  for (const p of tf.formatToParts(date)) m[p.type] = p.value
  return { y: m.year ?? '', mo: m.month ?? '', d: m.day ?? '', h: m.hour ?? '', mi: m.minute ?? '' }
}

export type CSTType =
  | 'date' // 2026-07-25
  | 'compactDate' // 07/25
  | 'compact' // 07/25 16:39
  | 'cnDate' // 7月25日
  | 'cnShort' // 7月25日 16:39
  | 'datetime' // 2026-07-25 16:39
  | 'time' // 16:39

/** 以北京时间渲染存储的时间字符串；空值返回 ''。 */
export function formatCST(input: string | null | undefined, type: CSTType = 'datetime'): string {
  const date = parseStoredTime(input)
  if (!date) return ''
  const { y, mo, d, h, mi } = getParts(date)
  switch (type) {
    case 'date':
      return `${y}-${mo}-${d}`
    case 'compactDate':
      return `${mo}/${d}`
    case 'compact':
      return `${mo}/${d} ${h}:${mi}`
    case 'cnDate':
      return `${Number(mo)}月${Number(d)}日`
    case 'cnShort':
      return `${Number(mo)}月${Number(d)}日 ${h}:${mi}`
    case 'time':
      return `${h}:${mi}`
    case 'datetime':
    default:
      return `${y}-${mo}-${d} ${h}:${mi}`
  }
}
