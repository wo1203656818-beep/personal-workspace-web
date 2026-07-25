// 时区工具：统一把"后端以 UTC 存储的时间字符串"按北京时间（Asia/Shanghai）渲染。
//
// 背景：Cloudflare Workers / D1 默认 UTC。后端所有 createdAt/updatedAt/importedAt
// 都以 UTC 存储，存在两种格式：
//   1) D1 默认 datetime('now') 产出 "2026-07-25 08:39:59"（空格、无时区后缀）
//   2) 代码显式 new Date().toISOString() 产出 "2026-07-25T08:39:59.123Z"（ISO，带 Z）
// 二者都表示 UTC 时刻。若前端直接 `new Date(str)`：
//   - ISO 带 Z：能被正确识别为 UTC，再 toLocaleString 显示北京时间（正确）
//   - 空格格式：V8 当成"本地时间"解析（北京 8 小时时差），Safari 直接 Invalid Date
// 于是同一页面里时间一会儿对一会儿慢 8 小时，正是用户反馈的"很多时间都是 UTC"。
//
// 本工具在解析阶段显式把存储值当 UTC 处理，再用 Intl 以 Asia/Shanghai 渲染，
// 两种格式都能得到正确的北京时间，彻底消除偏差。

const TZ = 'Asia/Shanghai'

/** 把存储的时间字符串解析为 UTC 的 Date 对象（无法解析返回 null）。 */
export function parseStoredTime(input: string | null | undefined): Date | null {
  if (!input) return null
  let s = input.trim()
  // 纯日期（yyyy-MM-dd）：视作该日历日的 UTC 零点
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00Z')
  // D1 空格格式 -> 补 T 和 Z，显式按 UTC 解析
  if (s.includes(' ')) s = s.replace(' ', 'T') + 'Z'
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
