/**
 * AES-GCM 加密工具
 * 用于加密存储 refresh_token 等敏感数据
 *
 * 加密格式：`enc$<salt_hex>$<iv_hex>$<ct_hex>`
 * - 前缀 `enc$` 标识加密内容；读取时若不以 `enc$` 开头则视为明文（向后兼容）
 * - 用 PBKDF2 (SHA-256, 100000 iterations) 从 secret 派生 AES-GCM 256 位密钥
 * - IV 用 12 字节随机数
 */

const PBKDF2_ITERATIONS = 100000
const SALT_BYTES = 16
const IV_BYTES = 12

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return arr
}

/**
 * 用 secret 加密 plaintext，返回 `enc$<salt_hex>$<iv_hex>$<ct_hex>`
 */
export async function encrypt(secret: string, plaintext: string): Promise<string> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, [
    'deriveKey',
  ])
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  return `enc$${toHex(salt)}$${toHex(iv)}$${toHex(new Uint8Array(ct))}`
}

/**
 * 解密 `enc$<salt_hex>$<iv_hex>$<ct_hex>` 格式的字符串
 * 若 stored 不以 `enc$` 开头，则视为明文直接返回（向后兼容）
 */
export async function decrypt(secret: string, stored: string): Promise<string> {
  if (!stored.startsWith('enc$')) return stored
  const parts = stored.split('$')
  if (parts.length !== 4) return stored
  const saltHex = parts[1]
  const ivHex = parts[2]
  const ctHex = parts[3]
  if (!saltHex || !ivHex || !ctHex) return stored

  const enc = new TextEncoder()
  const salt = fromHex(saltHex)
  const iv = fromHex(ivHex)
  const ct = fromHex(ctHex)

  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, [
    'deriveKey',
  ])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return new TextDecoder().decode(pt)
}

/**
 * 密码哈希（PBKDF2，格式：pbkdf2$<iterations>$<salt_hex>$<hash_hex>）
 * 与 verifyPassword 配对使用，供改密码端点与 hash-password 脚本复用
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  const hashHex = toHex(new Uint8Array(bits))
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${hashHex}`
}

/**
 * settings 表中需要加密的敏感键
 */
export const SENSITIVE_KEYS = [
  'ai_api_key',
  'custom_ai_api_key',
  'ima_api_key',
  'ms_refresh_token',
  'ms_client_secret',
  'password_hash',
  'telegram_bot_token',
]

/**
 * 判断某个 settings key 是否为敏感键（需要加密存储）
 */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.includes(key)
}

/**
 * 加密 settings 对象中的敏感键值
 * 返回新对象，敏感键的值被加密为 enc$... 格式
 */
export async function encryptSettings(
  secret: string,
  settings: Record<string, string>,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(settings)) {
    result[key] = isSensitiveKey(key) ? await encrypt(secret, value) : value
  }
  return result
}
