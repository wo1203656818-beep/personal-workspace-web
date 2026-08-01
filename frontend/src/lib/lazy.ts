import { lazy, type ComponentType } from 'react'

// 动态导入加载失败时自动刷新页面一次。
// 部署后 Cloudflare Pages 会清理旧的带 hash 资源，而浏览器可能仍缓存着旧的
// index.html，导致按需加载的 chunk URL 404。刷新即可拿到新的 index.html。
const RELOAD_AT_KEY = 'chunk_reload_at'
const RELOAD_COOLDOWN = 10_000

export function lazyImport<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory()
    } catch (err) {
      const last = Number(sessionStorage.getItem(RELOAD_AT_KEY) || 0)
      if (Date.now() - last > RELOAD_COOLDOWN) {
        sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()))
        window.location.reload()
      }
      throw err
    }
  })
}
