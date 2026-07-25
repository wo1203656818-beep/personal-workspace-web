/**
 * 物理熵采集模块
 * 优先使用真物理熵源，全部失败时回退到 Web Crypto。
 */

export interface EntropyResult {
  value: number
  source: string
}

const entropySources: Array<{ name: string; fetch: () => Promise<number> }> = [
  {
    // random.org：大气无线电噪声（主要为全球雷暴闪电放电），真物理熵
    name: 'random_org',
    fetch: async () => {
      const res = await fetch(
        'https://www.random.org/integers/?num=1&min=0&max=255&col=1&base=10&format=plain&rnd=new'
      )
      if (!res.ok) throw new Error(`random.org ${res.status}`)
      const v = parseInt(await res.text(), 10)
      if (isNaN(v) || v < 0 || v > 255) throw new Error('random.org invalid')
      return v
    },
  },
  {
    // NIST Beacon 2.0：量子相位噪声 + 放射性衰变 Krypton-85，真物理熵
    name: 'nist_beacon',
    fetch: async () => {
      const res = await fetch('https://beacon.nist.gov/beacon/2.0/pulse/last')
      if (!res.ok) throw new Error(`NIST ${res.status}`)
      const data = (await res.json()) as any
      const hex = data?.pulse?.localRandomValue
      if (!hex || hex.length < 2) throw new Error('NIST no value')
      const v = parseInt(hex.slice(0, 2), 16)
      if (isNaN(v)) throw new Error('NIST invalid')
      return v
    },
  },
]

/**
 * 获取一个 0-255 的随机字节，source 标明实际使用的熵源。
 */
export async function fetchPhysicalEntropy(): Promise<EntropyResult> {
  // 用 Web Crypto 随机选起点（仅用于选源，不参与最终结果）
  const selector = new Uint8Array(1)
  crypto.getRandomValues(selector)
  const startIdx = selector[0] % entropySources.length

  let lastErr: unknown
  for (let i = 0; i < entropySources.length; i++) {
    const src = entropySources[(startIdx + i) % entropySources.length]
    try {
      const value = await src.fetch()
      return { value, source: src.name }
    } catch (e) {
      lastErr = e
      console.warn(`[entropy] source ${src.name} failed:`, (e as Error).message)
    }
  }

  // 所有真物理熵源失败 → Web Crypto 兜底
  const arr = new Uint8Array(1)
  crypto.getRandomValues(arr)
  console.warn('[entropy] all physical entropy sources failed, fallback to Web Crypto:', lastErr)
  return { value: arr[0], source: 'crypto' }
}
