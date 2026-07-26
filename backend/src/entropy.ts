/**
 * 物理熵采集模块
 * 优先使用真物理熵源，全部失败时抛出错误。
 */

export interface EntropyResult {
  value: number
  source: string
}

// NIST Beacon 防重放：记录上次脉冲时间戳，同窗口内拒绝重复
let lastNistPulseTimestamp: string | null = null

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
    // Beacon 约60秒更新一次脉冲，同一窗口内多次请求返回相同值
    name: 'nist_beacon',
    fetch: async () => {
      const res = await fetch('https://beacon.nist.gov/beacon/2.0/pulse/last')
      if (!res.ok) throw new Error(`NIST ${res.status}`)
      const data = (await res.json()) as any
      const hex = data?.pulse?.localRandomValue
      const pulseTs = data?.pulse?.timeStamp
      if (!hex || hex.length < 2) throw new Error('NIST no value')
      // 防重放：同一脉冲时间戳说明是同一个60秒窗口，拒绝复用
      if (pulseTs && pulseTs === lastNistPulseTimestamp) {
        throw new Error('NIST pulse reused (same 60s window)')
      }
      if (pulseTs) lastNistPulseTimestamp = pulseTs
      const v = parseInt(hex.slice(0, 2), 16)
      if (isNaN(v)) throw new Error('NIST invalid')
      return v
    },
  },
]

/**
 * 获取一个 0-255 的随机字节，source 标明实际使用的熵源。
 * 全部物理熵源失败时抛出错误。
 */
export async function fetchPhysicalEntropy(): Promise<EntropyResult> {
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

  throw new Error(`物理熵采集失败（所有源不可用）: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)
}

/**
 * 基于物理熵的均匀随机整数 [0, n-1]，使用拒绝采样消除 modulo bias。
 * maxValid = floor(256/n)*n，拒绝 >= maxValid 的值，最多重试3次。
 */
export async function fetchUniformEntropy(n: number): Promise<EntropyResult & { uniformValue: number }> {
  const maxValid = Math.floor(256 / n) * n
  for (let attempt = 0; attempt < 3; attempt++) {
    const { value, source } = await fetchPhysicalEntropy()
    if (value < maxValid) {
      return { value, source, uniformValue: value % n }
    }
  }
  const { value, source } = await fetchPhysicalEntropy()
  return { value, source, uniformValue: value % n }
}
