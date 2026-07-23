import { Client } from '@microsoft/microsoft-graph-client'
import { drizzle } from 'drizzle-orm/d1'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import * as schema from './schema'
import { eq, or, and, isNull, isNotNull } from 'drizzle-orm'
import { encrypt, decrypt } from './crypto-utils'
import type { Env } from './types'

type DB = DrizzleD1Database<typeof schema>

/**
 * 微软 To Do 双向同步模块
 * 使用 @microsoft/microsoft-graph-client（Workers 兼容）
 * OAuth 用原生 fetch 实现（MSAL v5 大量使用 Node 内置模块，Workers 不兼容，故降级）
 */

const GRAPH_SCOPE = 'https://graph.microsoft.com/Tasks.ReadWrite offline_access'

/**
 * 将 MS Graph 返回的 dueDateTime.dateTime 转换为北京时间 yyyy-MM-dd。
 *
 * 背景：MS Graph 查询任务时，dueDateTime.dateTime 始终以 UTC 语义返回，
 * 即使字符串本身不带时区后缀（时区信息在 dueDateTime.timeZone 字段里）。
 * 例如用户设置 2026-07-23（CST），MS 返回 "2026-07-22T16:00:00"（无后缀，
 * 但语义是 UTC，16:00 UTC + 8h = 次日 00:00 CST = 2026-07-23）。
 * 直接 split('T')[0] 会得到 "2026-07-22"，导致日期提前一天。
 *
 * 规则：
 * - 纯日期格式（yyyy-MM-dd）：直接返回（本地编辑存的就是这种格式）
 * - 其余所有格式（含无时区后缀的 datetime）：视为 UTC，new Date(s+'Z') 解析后 +8h 取日期
 */
function msDueDateToLocal(msDateTime: string | undefined | null): string | null {
  if (!msDateTime) return null
  const s = String(msDateTime).trim()
  // 纯日期格式 yyyy-MM-dd：直接返回，避免误加时区
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // 其余格式（含 "2026-07-22T16:00:00" 无后缀、或带 Z/+08:00 后缀）：一律按 UTC 解析
  try {
    // 若已带时区后缀，new Date 能正确解析；若无后缀，补 'Z' 视为 UTC
    const hasTzSuffix = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)
    const d = new Date(hasTzSuffix ? s : s + 'Z')
    if (isNaN(d.getTime())) return s.split('T')[0]
    // 加 8 小时得到北京时间，再取日期
    const cst = new Date(d.getTime() + 8 * 3600 * 1000)
    return cst.toISOString().split('T')[0]
  } catch {
    return s.split('T')[0]
  }
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type?: string
  scope?: string
}

// 优先从 settings 表读取 MS 凭据（与前端设置页保持一致），未设置时回退 env
async function getMsCredentials(env: Env) {
  const db = drizzle(env.DB, { schema })
  const rows = await db.select().from(schema.settings)
    .where(or(
      eq(schema.settings.key, 'ms_client_id'),
      eq(schema.settings.key, 'ms_tenant_id'),
      eq(schema.settings.key, 'ms_account_type'),
      eq(schema.settings.key, 'ms_client_secret'),
    ))
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  const clientId = map.ms_client_id?.trim() || env.MS_CLIENT_ID
  let clientSecret = map.ms_client_secret?.trim() || env.MS_CLIENT_SECRET
  // accountType：优先用 ms_account_type
  // 兼容旧版 ms_tenant_id：仅当值是 common/consumers/organizations 时才用
  // 若 ms_tenant_id 是 UUID 格式（directory tenant ID），不能用作 endpoint，回退到 common
  const VALID_ACCOUNT_TYPES = new Set(['common', 'consumers', 'organizations'])
  const tenantRaw = map.ms_tenant_id?.trim()
  const tenantAsAccountType = tenantRaw && VALID_ACCOUNT_TYPES.has(tenantRaw) ? tenantRaw : ''
  const accountType = map.ms_account_type?.trim() || tenantAsAccountType || env.MS_TENANT_ID || 'common'

  // client_secret 可能经过加密存储（enc$ 前缀），decrypt 内部会自动判断是否需要解密
  if (clientSecret) {
    try {
      clientSecret = await decrypt(env.JWT_SECRET, clientSecret)
    } catch {
      // 解密失败时保留原值，兼容明文
    }
  }

  if (!clientId || !clientSecret || !accountType) {
    throw new Error('微软同步未配置：请在设置页填写 MS Client ID / Account Type / Client Secret，或在 wrangler secret 设置')
  }
  // 诊断日志：输出实际使用的凭据信息（脱敏）
  console.log('[ms-todo] credentials debug:', {
    clientIdLen: clientId.length,
    clientIdPrefix: clientId.slice(0, 8),
    clientSecretLen: clientSecret.length,
    clientSecretPrefix: clientSecret.slice(0, 4),
    clientSecretSuffix: clientSecret.slice(-4),
    accountType,
  })
  return { clientId, clientSecret, accountType }
}

/**
 * 用 authorization code 换 access_token + refresh_token
 * POST 到 AAD v2.0 token 端点（accountType 可为 common/consumers/organizations 或具体 tenantId）
 */
export async function exchangeCode(env: Env, code: string, redirectUri: string): Promise<TokenResponse> {
  const cfg = await getMsCredentials(env)
  const res = await fetch(
    `https://login.microsoftonline.com/${cfg.accountType}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: GRAPH_SCOPE,
      }),
    },
  )
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OAuth exchange 失败 [${res.status}]: ${errText}`)
  }
  const data = await res.json() as TokenResponse
  if (!data.access_token) {
    throw new Error('OAuth exchange 响应缺少 access_token')
  }
  return data
}

/**
 * 用 refresh_token 刷新 access_token
 */
export async function refreshToken(env: Env, rt: string): Promise<TokenResponse> {
  const cfg = await getMsCredentials(env)
  const res = await fetch(
    `https://login.microsoftonline.com/${cfg.accountType}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: rt,
        grant_type: 'refresh_token',
        scope: GRAPH_SCOPE,
      }),
    },
  )
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OAuth refresh 失败 [${res.status}]: ${errText}`)
  }
  const data = await res.json() as TokenResponse
  if (!data.access_token) {
    throw new Error('OAuth refresh 响应缺少 access_token')
  }
  return data
}

// 获取 access_token（从 KV 缓存或用 refresh_token 刷新，预判过期 <60s 提前刷新）
export async function getAccessToken(env: Env): Promise<string | null> {
  // 先从 KV 读缓存（JSON: { token, expiresAt }）
  const cached = await env.CACHE.get('ms_access_token', 'json')
  if (cached) {
    const { token, expiresAt } = cached as { token: string; expiresAt: number }
    // 预判过期：剩余 >60s 直接返回缓存
    if (expiresAt - Date.now() > 60_000) return token
  }

  // 用 refresh_token 刷新
  const rt = await getSetting(env, 'ms_refresh_token')
  if (!rt) return null

  const result = await refreshToken(env, rt)
  // 缓存 access_token + 过期时间（expires_in 秒 → 毫秒时间戳）
  const expiresAt = Date.now() + result.expires_in * 1000
  await env.CACHE.put('ms_access_token', JSON.stringify({ token: result.access_token, expiresAt }), {
    expirationTtl: result.expires_in,
  })
  // 存储新 refresh_token（如有）
  if (result.refresh_token) {
    await setSetting(env, 'ms_refresh_token', result.refresh_token)
  }
  return result.access_token
}

/**
 * 强制刷新 access_token（清 KV 缓存后重新获取）
 * 用于 withTokenRefresh 在 401 时重试
 */
async function forceRefreshToken(env: Env): Promise<string | null> {
  await env.CACHE.delete('ms_access_token')
  return getAccessToken(env)
}

/**
 * Token 刷新包装器：执行 fn，若返回 401 则刷新 token 后重试一次
 * @param env Worker 环境
 * @param fn 接收 access_token 的业务函数，返回 Graph API 响应
 */
export async function withTokenRefresh<T>(
  env: Env,
  fn: (token: string) => Promise<T>,
): Promise<T> {
  const token = await getAccessToken(env)
  if (!token) throw new Error('未授权，请先 OAuth 授权')

  try {
    return await fn(token)
  } catch (err: unknown) {
    // 检查是否为 401 错误（Graph Client 抛出的错误含 statusCode 或 status）
    const e = err as { statusCode?: number; status?: number; code?: string }
    const is401 = e?.statusCode === 401 || e?.status === 401 || e?.code === 'InvalidAuthenticationToken'
    if (!is401) throw err

    // 401：清缓存 → 刷新 token → 重试一次
    console.warn('[ms-todo] access_token 401, refreshing and retrying...')
    const newToken = await forceRefreshToken(env)
    if (!newToken) throw new Error('Token 刷新失败，请重新授权')
    return fn(newToken)
  }
}

// 创建 Graph Client
export function createGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  })
}

/**
 * 分页拉取 MS Graph 集合（处理 @odata.nextLink）
 */
async function fetchAllPages<T>(client: Client, path: string): Promise<T[]> {
  const results: T[] = []
  let nextLink: string | undefined = path
  while (nextLink) {
    const response: any = await client.api(nextLink).get()
    if (response.value) results.push(...response.value)
    nextLink = response['@odata.nextLink']
    // Graph Client 对绝对 URL 支持不稳定，统一转成相对路径
    if (nextLink && nextLink.startsWith('https://graph.microsoft.com/v1.0')) {
      nextLink = nextLink.replace('https://graph.microsoft.com/v1.0', '')
    }
  }
  return results
}

// 全量同步：拉取微软 To Do 所有列表和任务 → 写入 D1，并反向推送本地变更
// 使用 withTokenRefresh 包装，401 自动刷新 token 重试一次
// 返回 synced/failed/skipped/errors，让调用方感知部分失败，避免"同步成功"假阳性
export async function fullSync(env: Env): Promise<{ synced: number; failed: number; skipped: number; errors: string[] }> {
  return withTokenRefresh(env, async (accessToken) => {
    const client = createGraphClient(accessToken)
    const db = drizzle(env.DB, { schema })

  let syncedCount = 0
  let failedCount = 0
  let skippedCount = 0
  const errors: string[] = []
  const recordError = (msg: string) => {
    failedCount++
    errors.push(msg)
    console.error('[ms-todo]', msg)
  }

  // 1. 拉取所有任务列表
  const msLists = await fetchAllPages<any>(client, '/me/todo/lists')
  const allMsTaskIds = new Set<string>()
  const allMsListIds = new Set<string>(msLists.map((l) => l.id).filter(Boolean))

  // MS To Do 个人版默认列表固定叫 "Tasks"，本地自动创建的默认列表叫 "默认列表"。
  // 这两个名字不同但语义等价，单独按名字精确匹配会导致重复创建列表。
  // 这里维护一个"默认列表别名集合"，匹配时把集合内的名字视为等价。
  const DEFAULT_LIST_ALIASES = new Set(['tasks', '默认列表', '任务', 'to-do', 'todo'])
  const isDefaultListName = (name: string) => DEFAULT_LIST_ALIASES.has(name.trim().toLowerCase())

  for (const msList of msLists) {
    // 查找本地是否已有此列表（先按 msTodoListId 精确匹配）
    let existingList = await db.select().from(schema.taskLists)
      .where(eq(schema.taskLists.msTodoListId, msList.id))
    // matchedById 标记：按 msTodoListId 命中说明已关联，名字走 LWW；
    // 否则是新关联，应保留本地名（用户可能在本地重命名过）
    let matchedById = existingList.length > 0

    // 若按 id 未命中，尝试按 name 匹配本地未关联的列表（msTodoListId IS NULL）
    // 这样本地"默认列表"能关联到 MS 端同名列表，避免重复创建
    if (existingList.length === 0) {
      existingList = await db.select().from(schema.taskLists)
        .where(and(eq(schema.taskLists.name, msList.displayName), isNull(schema.taskLists.msTodoListId)))
    }

    // 若精确名字仍未命中，且 MS 列表是默认列表（"Tasks"），
    // 尝试匹配本地任意未关联的非系统默认列表（"默认列表"等别名），
    // 排除 isSystem=true 避免污染系统列表；多候选取 createdAt 最早的稳定关联
    if (existingList.length === 0 && isDefaultListName(msList.displayName)) {
      const candidates = await db.select().from(schema.taskLists)
        .where(and(isNull(schema.taskLists.msTodoListId), eq(schema.taskLists.isSystem, false)))
      const aliasCandidates = candidates.filter(l => isDefaultListName(l.name))
      if (aliasCandidates.length > 0) {
        // 取最早创建的（createdAt 最小，若都为 NULL 则取第一个）
        aliasCandidates.sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : Number.MAX_SAFE_INTEGER
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : Number.MAX_SAFE_INTEGER
          return ta - tb
        })
        existingList = [aliasCandidates[0]]
      }
    }

    let listId: string

    if (existingList.length > 0) {
      listId = existingList[0].id
      if (matchedById) {
        // 已关联列表：名字走 Last Write Wins（比较本地 updatedAt 与 MS lastModifiedDateTime）
        const msListUpdated = msList.lastModifiedDateTime ? new Date(msList.lastModifiedDateTime).getTime() : 0
        const localListUpdated = existingList[0].updatedAt ? new Date(existingList[0].updatedAt).getTime() : 0
        // MS 较新 → 用 MS 名；本地较新 → 保留本地名并 PATCH 到 MS（下面处理）
        const useMsName = msListUpdated > localListUpdated
        const newName = useMsName ? msList.displayName : existingList[0].name
        await db.update(schema.taskLists)
          .set({ name: newName, msTodoListId: msList.id, updatedAt: new Date().toISOString() })
          .where(eq(schema.taskLists.id, listId))
        // 本地较新时把本地名推到 MS，避免本地重命名被吞
        if (!useMsName && existingList[0].name !== msList.displayName) {
          try {
            await client.api(`/me/todo/lists/${msList.id}`).patch({ displayName: existingList[0].name })
          } catch (e) {
            recordError(`列表名推送到 MS 失败 (list ${msList.id}): ${(e as Error).message}`)
          }
        }
      } else {
        // 新关联列表：保留本地名（用户可能重命名过），仅回填 msTodoListId
        // 并把本地名推到 MS，统一两端名字
        await db.update(schema.taskLists)
          .set({ msTodoListId: msList.id, updatedAt: new Date().toISOString() })
          .where(eq(schema.taskLists.id, listId))
        if (existingList[0].name !== msList.displayName) {
          try {
            await client.api(`/me/todo/lists/${msList.id}`).patch({ displayName: existingList[0].name })
          } catch (e) {
            recordError(`新关联列表名推送到 MS 失败 (list ${msList.id}): ${(e as Error).message}`)
          }
        }
      }
    } else {
      // 创建新列表（本地无任何匹配）
      listId = crypto.randomUUID()
      await db.insert(schema.taskLists).values({
        id: listId,
        name: msList.displayName,
        msTodoListId: msList.id,
        isSystem: false,
      })
    }

    // 2. 拉取列表下所有任务（分页）
    const msTasks = await fetchAllPages<any>(client, `/me/todo/lists/${msList.id}/tasks`)

    for (const msTask of msTasks) {
      allMsTaskIds.add(msTask.id)
      const existingTask = await db.select().from(schema.tasks)
        .where(eq(schema.tasks.msTodoId, msTask.id))

      const taskData = {
        listId,
        title: msTask.title || '',
        note: msTask.body?.content || '',
        isCompleted: msTask.status === 'completed',
        isImportant: msTask.importance === 'high',
        // MS 返回的 dueDateTime.dateTime 是 UTC（如 "2026-07-22T16:00:00" 对应 7月23日 CST），
        // 直接存会让前端 new Date() 解析为前一天。转成北京时间 yyyy-MM-dd，与本地编辑格式一致。
        dueDate: msDueDateToLocal(msTask.dueDateTime?.dateTime),
        lastSyncedAt: new Date().toISOString(),
      }

      if (existingTask.length > 0) {
        // Last Write Wins：对比更新时间
        const msUpdated = new Date(msTask.lastModifiedDateTime)
        const localUpdated = new Date(existingTask[0].updatedAt || 0)
        if (msUpdated > localUpdated) {
          await db.update(schema.tasks)
            .set({ ...taskData, updatedAt: new Date().toISOString() })
            .where(eq(schema.tasks.id, existingTask[0].id))
        }

        // 子任务增量同步（已存在任务）：拉取微软 checklist items，按 title 新增/更新本地 subtasks
        const localTaskId = existingTask[0].id
        try {
          const checklistItems = await fetchAllPages<any>(
            client,
            `/me/todo/lists/${msList.id}/tasks/${msTask.id}/checklistItems`,
          )
          const localSubtasks = await db.select().from(schema.subtasks)
            .where(eq(schema.subtasks.taskId, localTaskId))
          for (const item of checklistItems) {
            const matched = localSubtasks.find(s => s.title === item.displayName)
            if (matched) {
              if (matched.isCompleted !== !!item.isChecked) {
                await db.update(schema.subtasks)
                  .set({ isCompleted: !!item.isChecked })
                  .where(eq(schema.subtasks.id, matched.id))
              }
            } else {
              await db.insert(schema.subtasks).values({
                id: crypto.randomUUID(),
                taskId: localTaskId,
                title: item.displayName || '',
                isCompleted: !!item.isChecked,
              })
            }
          }
        } catch (e) {
          console.error('[ms-todo] subtask sync failed:', e)
        }
      } else {
        const taskId = crypto.randomUUID()
        await db.insert(schema.tasks).values({
          id: taskId,
          msTodoId: msTask.id,
          msTodoListId: msList.id,
          ...taskData,
        })

        // 3. 拉取子任务（checklist items）
        if (msTask.id) {
          try {
            const checklistItems = await fetchAllPages<any>(
              client,
              `/me/todo/lists/${msList.id}/tasks/${msTask.id}/checklistItems`,
            )
            for (const item of checklistItems) {
              await db.insert(schema.subtasks).values({
                id: crypto.randomUUID(),
                taskId,
                title: item.displayName || '',
                isCompleted: item.isChecked || false,
              })
            }
          } catch {
            // checklist API 可能不可用，跳过
          }
        }
      }
      syncedCount++
    }
  }

  // 4. 先推送本地新增列表到微软，确保后续本地任务能正确归属到 MS 列表
  // 返回新创建的 MS 列表 ID 集合，合并到 allMsListIds，避免步骤9 误删刚推送的本地列表
  const newListMsIds = await syncLocalListsReverse(db, client)
  for (const id of newListMsIds) allMsListIds.add(id)

  // 5. 反向同步：本地已修改任务回推微软（updatedAt > lastSyncedAt，排除软删除任务）
  // 收集本同步周期内新创建的 MS 任务 ID，合并到 allMsTaskIds，避免步骤8.1 误删
  const createdMsTaskIds = new Set<string>()
  const msLinkedTasks = await db.select().from(schema.tasks)
    .where(and(isNotNull(schema.tasks.msTodoId), isNull(schema.tasks.msTodoDeletedAt)))

  for (const localTask of msLinkedTasks) {
    if (!localTask.msTodoId || !localTask.msTodoListId) continue
    if (!localTask.updatedAt || !localTask.lastSyncedAt) continue
    if (new Date(localTask.updatedAt) <= new Date(localTask.lastSyncedAt)) continue

    try {
      // 检测任务是否移动到了不同列表：本地 listId 对应的 msTodoListId 与任务记录的 msTodoListId 不一致
      const currentList = await db.select().from(schema.taskLists)
        .where(eq(schema.taskLists.id, localTask.listId))
      const newListMsId = currentList[0]?.msTodoListId || null
      // listChanged：新列表的 MS id 与任务记录的 MS id 不同（含新列表无 MS 关联的情况）
      const listChanged = newListMsId !== localTask.msTodoListId

      if (listChanged) {
        // 先删除旧 MS 任务（无论新列表是否关联 MS，旧任务都要从原 MS 列表移除）
        try {
          await client.api(`/me/todo/lists/${localTask.msTodoListId}/tasks/${localTask.msTodoId}`).delete()
        } catch (e) {
          // 旧任务可能已被删除，忽略错误继续
        }

        if (newListMsId) {
          // 新列表已关联 MS：在 MS 新列表中重建任务
          const postPayload: any = {
            title: localTask.title,
            importance: localTask.isImportant ? 'high' : 'normal',
            status: localTask.isCompleted ? 'completed' : 'notStarted',
            body: { content: localTask.note || '', contentType: 'text' },
          }
          if (localTask.dueDate) {
            const dateStr = localTask.dueDate.split('T')[0]
            postPayload.dueDateTime = { dateTime: `${dateStr}T00:00:00`, timeZone: 'China Standard Time' }
          }
          const msTask = await client.api(`/me/todo/lists/${newListMsId}/tasks`).post(postPayload)
          // 更新本地任务的 MS 关联（msTodoId 和 msTodoListId 都变了）
          await db.update(schema.tasks)
            .set({
              msTodoId: msTask.id,
              msTodoListId: newListMsId,
              lastSyncedAt: new Date().toISOString(),
            })
            .where(eq(schema.tasks.id, localTask.id))
          // 记录新 MS 任务 ID，防止步骤8.1 误删
          createdMsTaskIds.add(msTask.id)
          // 重新推送子任务到新 MS 任务（checklist items）
          const localSubs = await db.select().from(schema.subtasks)
            .where(eq(schema.subtasks.taskId, localTask.id))
          for (const sub of localSubs) {
            try {
              await client.api(`/me/todo/lists/${newListMsId}/tasks/${msTask.id}/checklistItems`)
                .post({ displayName: sub.title, isChecked: sub.isCompleted })
            } catch {
              // checklist API 可能不可用，跳过
            }
          }
        } else {
          // 新列表未关联 MS：任务变为纯本地，清除 MS 关联（不再同步）
          await db.update(schema.tasks)
            .set({
              msTodoId: null,
              msTodoListId: null,
              lastSyncedAt: new Date().toISOString(),
            })
            .where(eq(schema.tasks.id, localTask.id))
        }
        syncedCount++
        continue
      }

      // 构造更新载荷，包含 dueDateTime（本地 → MS 反向推送）
      const patchPayload: any = {
        title: localTask.title,
        importance: localTask.isImportant ? 'high' : 'normal',
        status: localTask.isCompleted ? 'completed' : 'notStarted',
        body: { content: localTask.note || '', contentType: 'text' },
      }
      // dueDate 本地格式为 yyyy-MM-dd，MS 需要 ISO 8601 带时区
      if (localTask.dueDate) {
        const dateStr = localTask.dueDate.split('T')[0]
        patchPayload.dueDateTime = { dateTime: `${dateStr}T00:00:00`, timeZone: 'China Standard Time' }
      }
      await client.api(`/me/todo/lists/${localTask.msTodoListId}/tasks/${localTask.msTodoId}`).patch(patchPayload)
      await db.update(schema.tasks)
        .set({ lastSyncedAt: new Date().toISOString() })
        .where(eq(schema.tasks.id, localTask.id))
      syncedCount++
    } catch (e) {
      recordError(`任务反向更新失败 (taskId=${localTask.id}): ${(e as Error).message}`)
    }
  }

  // 6. 反向同步：本地新增任务推送到微软（msTodoId 为 NULL 表示未推送）
  const localTasks = await db.select().from(schema.tasks)
    .where(isNull(schema.tasks.msTodoId))

  for (const localTask of localTasks) {
    if (!localTask.msTodoId) {
      const list = await db.select().from(schema.taskLists)
        .where(eq(schema.taskLists.id, localTask.listId))
      if (list.length === 0 || !list[0].msTodoListId) {
        // 列表未关联 MS：跳过并记录，避免任务永远推不过去却无感知
        skippedCount++
        console.warn(`[ms-todo] 跳过任务推送 (taskId=${localTask.id}, listId=${localTask.listId})：列表未关联 MS`)
        continue
      }

      try {
        // 构造新建载荷，包含 dueDateTime
        const postPayload: any = {
          title: localTask.title,
          importance: localTask.isImportant ? 'high' : 'normal',
          status: localTask.isCompleted ? 'completed' : 'notStarted',
          body: { content: localTask.note || '', contentType: 'text' },
        }
        if (localTask.dueDate) {
          const dateStr = localTask.dueDate.split('T')[0]
          postPayload.dueDateTime = { dateTime: `${dateStr}T00:00:00`, timeZone: 'China Standard Time' }
        }
        const msTask = await client.api(`/me/todo/lists/${list[0].msTodoListId}/tasks`).post(postPayload)

        await db.update(schema.tasks)
          .set({ msTodoId: msTask.id, msTodoListId: list[0].msTodoListId, lastSyncedAt: new Date().toISOString() })
          .where(eq(schema.tasks.id, localTask.id))
        // 记录新 MS 任务 ID，防止步骤8.1 误删
        createdMsTaskIds.add(msTask.id)
        syncedCount++
      } catch (e) {
        recordError(`任务推送失败 (taskId=${localTask.id}): ${(e as Error).message}`)
      }
    }
  }

  // 7. 反向同步子任务：本地 subtask 变更回推 MS checklist
  await syncSubtasksReverse(db, client)

  // 合并本周期新创建的 MS 任务 ID 到 allMsTaskIds，避免步骤8.1 把刚推送的任务误删
  for (const id of createdMsTaskIds) allMsTaskIds.add(id)

  // 8. 删除同步：MS 删除 → 本地删除；本地软删除 → MS 删除
  await syncDeletions(db, client, allMsTaskIds)

  // 9. 删除微软端已删除的列表（级联删除本地任务）
  const localMsLists = await db.select().from(schema.taskLists)
    .where(isNotNull(schema.taskLists.msTodoListId))
  for (const list of localMsLists) {
    if (list.msTodoListId && !allMsListIds.has(list.msTodoListId)) {
      await db.delete(schema.tasks).where(eq(schema.tasks.listId, list.id))
      await db.delete(schema.taskLists).where(eq(schema.taskLists.id, list.id))
    }
  }

  // 10. 重试之前删除失败的 MS 列表（deleteMsList 失败时记入 pending_delete_ms_lists）
  await retryPendingMsListDeletes(env, client)

  return { synced: syncedCount, failed: failedCount, skipped: skippedCount, errors }
  }) // end withTokenRefresh
}

/**
 * 重试之前删除失败的 MS 列表。
 * deleteMsList 失败时把 msTodoListId 记入 settings.pending_delete_ms_lists（JSON 数组），
 * fullSync 末尾重试这些删除，避免本地已删但 MS 端残留导致下次同步列表"复活"。
 */
async function retryPendingMsListDeletes(env: Env, client: Client): Promise<void> {
  const raw = await getSetting(env, 'pending_delete_ms_lists')
  if (!raw) return
  let pendingIds: string[] = []
  try { pendingIds = JSON.parse(raw) } catch { pendingIds = [] }
  if (pendingIds.length === 0) return
  const remaining: string[] = []
  for (const msListId of pendingIds) {
    try {
      await client.api(`/me/todo/lists/${msListId}`).delete()
    } catch (e) {
      // 仍失败：保留待下次重试（404 视为已删，不再保留）
      const msg = (e as Error).message || ''
      if (!msg.includes('404') && !msg.includes('not found')) {
        remaining.push(msListId)
      }
    }
  }
  // 更新 pending 列表（空则删除 setting）
  if (remaining.length > 0) {
    await setSetting(env, 'pending_delete_ms_lists', JSON.stringify(remaining))
  } else {
    const db = drizzle(env.DB, { schema })
    await db.delete(schema.settings).where(eq(schema.settings.key, 'pending_delete_ms_lists'))
  }
}

/**
 * 反向同步子任务：本地 subtask 变更回推 MS checklist
 * - 本地有 MS 无 → POST 到 MS
 * - 本地 MS 都有但 isChecked 不一致 → PATCH 到 MS
 * - MS 有本地无 → DELETE 本地（MS 端删除的子任务同步）
 */
async function syncSubtasksReverse(db: DB, client: Client): Promise<void> {
  const msLinkedTasks = await db.select().from(schema.tasks)
    .where(and(isNotNull(schema.tasks.msTodoId), isNotNull(schema.tasks.msTodoListId)))

  for (const task of msLinkedTasks) {
    if (!task.msTodoId || !task.msTodoListId) continue
    try {
      const msItems = await fetchAllPages<any>(
        client,
        `/me/todo/lists/${task.msTodoListId}/tasks/${task.msTodoId}/checklistItems`,
      )
      const localSubtasks = await db.select().from(schema.subtasks)
        .where(eq(schema.subtasks.taskId, task.id))

      // 本地有 MS 无 → POST；本地 MS 都有但状态不一致 → PATCH
      for (const sub of localSubtasks) {
        const matched = msItems.find((m) => m.displayName === sub.title)
        if (!matched) {
          await client
            .api(`/me/todo/lists/${task.msTodoListId}/tasks/${task.msTodoId}/checklistItems`)
            .post({ displayName: sub.title, isChecked: sub.isCompleted })
        } else if (!!matched.isChecked !== sub.isCompleted) {
          await client
            .api(`/me/todo/lists/${task.msTodoListId}/tasks/${task.msTodoId}/checklistItems/${matched.id}`)
            .patch({ isChecked: sub.isCompleted })
        }
      }

      // 重新拉取 MS checklist，删除 MS 端已不存在的本地子任务
      try {
        const finalMsItems = await fetchAllPages<any>(
          client,
          `/me/todo/lists/${task.msTodoListId}/tasks/${task.msTodoId}/checklistItems`,
        )
        const finalTitles = new Set(finalMsItems.map((m) => m.displayName))
        for (const sub of localSubtasks) {
          if (!finalTitles.has(sub.title)) {
            await db.delete(schema.subtasks).where(eq(schema.subtasks.id, sub.id))
          }
        }
      } catch (e) {
        console.error('[ms-todo] refetch checklist failed:', e)
      }
    } catch (e) {
      console.error('[ms-todo] reverse subtask sync failed:', e)
    }
  }
}

/**
 * 反向同步本地新增列表：msTodoListId IS NULL 的本地列表 POST 到 MS
 * 返回新创建的 MS 列表 ID 集合，供调用方合并到 allMsListIds，避免步骤9 误删
 */
async function syncLocalListsReverse(db: DB, client: Client): Promise<Set<string>> {
  const createdMsListIds = new Set<string>()
  const localLists = await db.select().from(schema.taskLists)
    .where(isNull(schema.taskLists.msTodoListId))

  for (const list of localLists) {
    if (list.isSystem) continue // 系统列表（如"我的一天"）不推送
    try {
      const msList = await client.api('/me/todo/lists').post({
        displayName: list.name,
      })
      await db.update(schema.taskLists)
        .set({ msTodoListId: msList.id, updatedAt: new Date().toISOString() })
        .where(eq(schema.taskLists.id, list.id))
      createdMsListIds.add(msList.id)
    } catch (e) {
      console.error('[ms-todo] reverse list push failed:', e)
    }
  }
  return createdMsListIds
}

/**
 * 删除同步：
 * 1. MS 删除 → 本地硬删：本地 msTodoId 不在 MS 全部 task id 集合内的删除
 * 2. 本地软删除 → MS 删除：msTodoDeletedAt 非空的，DELETE MS 任务后硬删本地
 */
async function syncDeletions(
  db: DB,
  client: Client,
  allMsTaskIds: Set<string>,
): Promise<void> {
  // 1. MS 删除 → 本地硬删
  const localMsTasks = await db.select().from(schema.tasks)
    .where(isNotNull(schema.tasks.msTodoId))
  for (const t of localMsTasks) {
    if (!t.msTodoId) continue
    if (!allMsTaskIds.has(t.msTodoId)) {
      await db.delete(schema.tasks).where(eq(schema.tasks.id, t.id))
    }
  }

  // 2. 本地软删除 → MS 删除
  const softDeleted = await db.select().from(schema.tasks)
    .where(isNotNull(schema.tasks.msTodoDeletedAt))
  for (const t of softDeleted) {
    if (t.msTodoId && t.msTodoListId) {
      try {
        await client.api(`/me/todo/lists/${t.msTodoListId}/tasks/${t.msTodoId}`).delete()
        // DELETE 成功：硬删本地
        await db.delete(schema.tasks).where(eq(schema.tasks.id, t.id))
      } catch (e) {
        const msg = (e as Error).message || ''
        // MS 端 404 / not found：任务已不存在，可安全硬删本地
        if (msg.includes('404') || msg.includes('not found') || msg.includes('ResourceNotFound')) {
          await db.delete(schema.tasks).where(eq(schema.tasks.id, t.id))
        } else {
          // 其他失败（网络/限流/5xx）：保留本地软删除标记，下次同步重试
          // 不硬删本地，否则下次同步 MS 端任务会作为新任务插入导致"复活"
          console.error('[ms-todo] 软删除任务推送 MS 失败，保留本地待重试 (taskId=' + t.id + '):', e)
        }
      }
    } else {
      // 无 MS 关联：直接硬删本地
      await db.delete(schema.tasks).where(eq(schema.tasks.id, t.id))
    }
  }
}

// OAuth 回调处理：用 code 换 token
export async function exchangeCodeForToken(env: Env, code: string, redirectUri: string): Promise<boolean> {
  const result = await exchangeCode(env, code, redirectUri)
  // 缓存 access_token + 过期时间（新 JSON 格式）
  const expiresAt = Date.now() + result.expires_in * 1000
  await env.CACHE.put('ms_access_token', JSON.stringify({ token: result.access_token, expiresAt }), {
    expirationTtl: result.expires_in,
  })
  if (result.refresh_token) {
    await setSetting(env, 'ms_refresh_token', result.refresh_token)
  }
  return true
}

// 设置工具函数（refresh_token 走加密，其他 setting 直接读写）
async function getSetting(env: Env, key: string): Promise<string | null> {
  const db = drizzle(env.DB, { schema })
  const result = await db.select().from(schema.settings).where(eq(schema.settings.key, key))
  if (result.length === 0) return null
  const raw = result[0].value
  // refresh_token 走解密；其他值原样返回
  if (key === 'ms_refresh_token') {
    try {
      return await decrypt(env.JWT_SECRET, raw)
    } catch (e) {
      console.error('[ms-todo] decrypt refresh_token failed:', e)
      return raw
    }
  }
  return raw
}

async function setSetting(env: Env, key: string, value: string): Promise<void> {
  const db = drizzle(env.DB, { schema })
  let stored = value
  // refresh_token 走加密
  if (key === 'ms_refresh_token') {
    stored = await encrypt(env.JWT_SECRET, value)
  }
  await db.insert(schema.settings)
    .values({ key, value: stored })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: stored, updatedAt: new Date().toISOString() } })
}

// 获取同步状态
export async function getSyncStatus(env: Env): Promise<{ authorized: boolean; lastSync: string | null }> {
  const refreshToken = await getSetting(env, 'ms_refresh_token')
  const lastSync = await getSetting(env, 'ms_last_sync')
  return { authorized: !!refreshToken, lastSync }
}

/**
 * 删除 MS Todo 端的列表（连同其下任务）。
 * 用于本地删除列表时同步删除 MS 端，避免下次 fullSync 又拉回来。
 * 失败时把 msTodoListId 记入 pending_delete_ms_lists，fullSync 会重试。
 */
export async function deleteMsList(env: Env, msTodoListId: string): Promise<void> {
  try {
    await withTokenRefresh(env, async (token) => {
      const client = createGraphClient(token)
      await client.api(`/me/todo/lists/${msTodoListId}`).delete()
    })
  } catch (e) {
    console.error('[ms-todo] deleteMsList failed:', msTodoListId, e)
    // 记入 pending 列表，fullSync 末尾重试，避免 MS 端残留导致列表"复活"
    try {
      const raw = await getSetting(env, 'pending_delete_ms_lists')
      let pendingIds: string[] = []
      if (raw) { try { pendingIds = JSON.parse(raw) } catch { pendingIds = [] } }
      if (!pendingIds.includes(msTodoListId)) {
        pendingIds.push(msTodoListId)
        await setSetting(env, 'pending_delete_ms_lists', JSON.stringify(pendingIds))
      }
    } catch (e2) {
      console.error('[ms-todo] 记录 pending_delete_ms_lists 失败:', e2)
    }
  }
}
