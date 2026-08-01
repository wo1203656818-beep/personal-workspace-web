import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { todayCST, nowBeijing } from '../time'
import { callAI } from '../utils/ai-client'

const records = new Hono<{ Bindings: Env }>()

// ─────────── 记账 ───────────

// 流水列表（可按日期范围/分类过滤）
records.get('/expenses', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const from = c.req.query('from')
    const to = c.req.query('to')
    const category = c.req.query('category')
    let q: any = db.select().from(schema.expenses)
    if (from) q = q.where(gte(schema.expenses.date, from))
    if (to) q = q.where(lte(schema.expenses.date, to))
    if (category) {
      q = q.where(
        from || to
          ? and(
              ...(from ? [gte(schema.expenses.date, from)] : []),
              ...(to ? [lte(schema.expenses.date, to)] : []),
              eq(schema.expenses.category, category),
            )
          : eq(schema.expenses.category, category),
      )
    }
    const rows = await q.orderBy(desc(schema.expenses.date), desc(schema.expenses.createdAt))
    return c.json(rows)
  } catch (err) {
    console.error('Expenses list error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// 分类汇总 + 月度统计
records.get('/expenses/summary', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const from = c.req.query('from') || todayCST().slice(0, 7) + '-01'
    const to = c.req.query('to') || todayCST()
    const range = and(gte(schema.expenses.date, from), lte(schema.expenses.date, to))

    const [byCategory, totalRow, trend] = await Promise.all([
      db
        .select({
          category: schema.expenses.category,
          amount: sql<number>`COALESCE(SUM(${schema.expenses.amount}), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(schema.expenses)
        .where(range)
        .groupBy(schema.expenses.category),
      db
        .select({ amount: sql<number>`COALESCE(SUM(${schema.expenses.amount}), 0)` })
        .from(schema.expenses)
        .where(range),
      db
        .select({
          date: schema.expenses.date,
          amount: sql<number>`COALESCE(SUM(${schema.expenses.amount}), 0)`,
        })
        .from(schema.expenses)
        .where(range)
        .groupBy(schema.expenses.date)
        .orderBy(schema.expenses.date),
    ])

    return c.json({
      total: totalRow[0]?.amount ?? 0,
      byCategory,
      trend,
    })
  } catch (err) {
    console.error('Expenses summary error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// 记账分类列表（去重）
records.get('/expenses/categories', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const rows = await db
      .select({ category: schema.expenses.category })
      .from(schema.expenses)
      .groupBy(schema.expenses.category)
    return c.json(rows.map((r) => r.category))
  } catch (err) {
    console.error('Expenses categories error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

records.post('/expenses', async (c) => {
  try {
    const body = await c.req.json()
    const amount = parseFloat(body?.amount)
    if (isNaN(amount) || amount <= 0) return c.json({ error: '金额无效' }, 400)
    const date = typeof body?.date === 'string' && body.date ? body.date : todayCST()
    const db = drizzle(c.env.DB, { schema })
    const id = crypto.randomUUID()
    await db.insert(schema.expenses).values({
      id,
      amount,
      category: typeof body?.category === 'string' && body.category.trim() ? body.category.trim() : '其他',
      note: typeof body?.note === 'string' ? body.note : null,
      date,
    })
    const [row] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, id))
    return c.json(row, 201)
  } catch (err) {
    console.error('Expenses create error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

records.put('/expenses/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const db = drizzle(c.env.DB, { schema })
    const existing = await db.select().from(schema.expenses).where(eq(schema.expenses.id, id))
    if (!existing.length) return c.json({ error: '记录不存在' }, 404)
    const amount = body?.amount !== undefined ? parseFloat(body.amount) : existing[0].amount
    if (isNaN(amount) || amount <= 0) return c.json({ error: '金额无效' }, 400)
    const category = typeof body?.category === 'string' && body.category.trim() ? body.category.trim() : existing[0].category
    const note = body?.note !== undefined ? (typeof body.note === 'string' ? body.note : null) : existing[0].note
    const date = typeof body?.date === 'string' && body.date ? body.date : existing[0].date
    await db.update(schema.expenses).set({ amount, category, note, date }).where(eq(schema.expenses.id, id))
    const [row] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, id))
    return c.json(row)
  } catch (err) {
    console.error('Expenses update error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

records.delete('/expenses/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.expenses).where(eq(schema.expenses.id, id))
    if (!existing) return c.json({ error: '记录不存在' }, 404)
    await db.delete(schema.expenses).where(eq(schema.expenses.id, id))
    return c.json({ ok: true })
  } catch (err) {
    console.error('Expenses delete error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// ─────────── 消费预算管理 ───────────

// 获取当月预算数据
records.get('/expenses/budget', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const today = todayCST()
    const year = parseInt(today.slice(0, 4))
    const month = parseInt(today.slice(5, 7))
    const day = parseInt(today.slice(8))
    const daysInMonth = new Date(year, month, 0).getDate()
    const daysPassed = Math.min(day, daysInMonth)
    const monthStart = today.slice(0, 7) + '-01'

    // 读取预算设置
    const [setting] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, 'monthly_budget'))
    const budget = setting ? parseFloat(setting.value) : 0

    // 计算当月已支出
    const [totalRow] = await db
      .select({ amount: sql<number>`COALESCE(SUM(${schema.expenses.amount}), 0)` })
      .from(schema.expenses)
      .where(and(gte(schema.expenses.date, monthStart), lte(schema.expenses.date, today)))
    const spent = totalRow?.amount ?? 0

    const avgDaily = daysPassed > 0 ? Math.round((spent / daysPassed) * 100) / 100 : 0
    const projected = Math.round((avgDaily * daysInMonth) * 100) / 100
    const remaining = Math.max(budget - spent, 0)
    const progress = budget > 0 ? Math.min(Math.round((spent / budget) * 10000) / 100, 100) : 0

    return c.json({ budget, spent, remaining, avgDaily, projected, progress, daysPassed, daysInMonth })
  } catch (err) {
    console.error('Budget get error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// 设置预算
records.post('/expenses/budget', async (c) => {
  try {
    const body = await c.req.json()
    const amount = parseFloat(body?.amount)
    if (isNaN(amount) || amount < 0) return c.json({ error: '金额无效' }, 400)
    const db = drizzle(c.env.DB, { schema })
    // 使用 upsert 方式写入 settings 表
    const existing = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, 'monthly_budget'))
    if (existing.length > 0) {
      await db
        .update(schema.settings)
        .set({ value: String(amount), updatedAt: nowBeijing() })
        .where(eq(schema.settings.key, 'monthly_budget'))
    } else {
      await db
        .insert(schema.settings)
        .values({ key: 'monthly_budget', value: String(amount), updatedAt: nowBeijing() })
    }
    return c.json({ ok: true })
  } catch (err) {
    console.error('Budget set error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// AI 消费建议
records.get('/expenses/budget/ai-tip', async (c) => {
  try {
    // 1. 检查 KV 缓存（每日刷新）
    const today = todayCST()
    const cacheKey = `budget_ai_tip_${today}`
    const cached = await c.env.CACHE.get(cacheKey)
    if (cached) {
      return c.json({ ...JSON.parse(cached), fromCache: true })
    }

    const db = drizzle(c.env.DB, { schema })
    const year = parseInt(today.slice(0, 4))
    const month = parseInt(today.slice(5, 7))
    const day = parseInt(today.slice(8))
    const daysInMonth = new Date(year, month, 0).getDate()
    const daysPassed = Math.min(day, daysInMonth)
    const monthStart = today.slice(0, 7) + '-01'

    // 2. 读取预算
    const [setting] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, 'monthly_budget'))
    const budget = setting ? parseFloat(setting.value) : 0

    if (budget <= 0) {
      const result = { generatedAt: nowBeijing(), tip: '还没有设置月度预算，去设置一个预算目标吧！' }
      await c.env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 86400 })
      return c.json({ ...result, fromCache: false })
    }

    // 3. 计算当月支出数据
    const [totalRow] = await db
      .select({ amount: sql<number>`COALESCE(SUM(${schema.expenses.amount}), 0)` })
      .from(schema.expenses)
      .where(and(gte(schema.expenses.date, monthStart), lte(schema.expenses.date, today)))
    const spent = totalRow?.amount ?? 0
    const avgDaily = daysPassed > 0 ? Math.round((spent / daysPassed) * 100) / 100 : 0
    const projected = Math.round((avgDaily * daysInMonth) * 100) / 100
    const remaining = Math.max(budget - spent, 0)
    const progress = budget > 0 ? Math.min(Math.round((spent / budget) * 10000) / 100, 100) : 0

    // 4. 按分类统计当月支出
    const byCategory = await db
      .select({
        category: schema.expenses.category,
        amount: sql<number>`COALESCE(SUM(${schema.expenses.amount}), 0)`,
      })
      .from(schema.expenses)
      .where(and(gte(schema.expenses.date, monthStart), lte(schema.expenses.date, today)))
      .groupBy(schema.expenses.category)
      .orderBy(sql`amount DESC`)

    // 5. 构建 AI prompt
    const prompt = `你是一个个人财务顾问。根据以下当月预算和消费数据，用中文生成一句简短、有用的消费建议（30 字以内，不要太长）。

预算：¥${budget.toFixed(0)}
已支出：¥${spent.toFixed(2)}（${progress}%）
剩余：¥${remaining.toFixed(2)}
日均支出：¥${avgDaily.toFixed(2)}
预计月底总支出：¥${projected.toFixed(2)}
距离月底还有 ${daysInMonth - daysPassed} 天
分类排行：${byCategory.map(c => `${c.category} ¥${c.amount.toFixed(0)}`).join('、')}

请直接返回一句建议，不要加任何前缀或说明。`

    // 6. 调用 AI
    const tip = await callAI(c.env, [{ role: 'user', content: prompt }], { maxTokens: 128, timeoutMs: 15000 })

    // 7. 缓存到 KV（每天刷新）
    const result = { generatedAt: nowBeijing(), tip: tip.trim() }
    await c.env.CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 86400 })

    return c.json({ ...result, fromCache: false })
  } catch (err) {
    console.error('Budget AI tip error:', err)
    return c.json({ error: 'AI 建议生成失败' }, 500)
  }
})

// ─────────── 健康指数打卡 ───────────

// 记账 AI 分析
records.get('/expenses/ai-analysis', async (c) => {
  try {
    // 1. 检查 KV 缓存
    const cached = await c.env.CACHE.get('expenses_ai_analysis')
    if (cached) {
      return c.json({ ...JSON.parse(cached), fromCache: true })
    }

    const db = drizzle(c.env.DB, { schema })
    const today = todayCST()
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - 89)
    const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`

    // 2. 读取最近 90 天记账数据
    const rows = await db
      .select()
      .from(schema.expenses)
      .where(gte(schema.expenses.date, from))
      .orderBy(schema.expenses.date)

    if (rows.length === 0) {
      return c.json({
        generatedAt: nowBeijing(),
        fromCache: false,
        report: {
          summary: '过去 90 天没有记账记录，开始记账来生成分析吧！',
          totalSpent: 0,
          avgDaily: 0,
          topCategory: '暂无',
          suggestions: ['开始记录你的第一笔支出'],
        },
      })
    }

    // 3. 计算统计数据
    const totalSpent = rows.reduce((s, x) => s + x.amount, 0)
    const daysWithData = new Set(rows.map(r => r.date)).size
    const avgDaily = Math.round((totalSpent / Math.max(daysWithData, 1)) * 100) / 100

    // 按分类聚合
    const categoryMap: Record<string, number> = {}
    for (const r of rows) {
      categoryMap[r.category] = (categoryMap[r.category] || 0) + r.amount
    }
    const sortedCategories = Object.entries(categoryMap).sort((a, b) => b[1] - a[1])
    const topCategory = sortedCategories.length > 0 ? sortedCategories[0][0] : '暂无'

    // 按月聚合
    const monthlyMap: Record<string, number> = {}
    for (const r of rows) {
      const month = r.date.slice(0, 7)
      monthlyMap[month] = (monthlyMap[month] || 0) + r.amount
    }

    // 4. 构建 AI prompt
    const prompt = `你是一个个人财务分析助手。分析以下记账数据，用中文生成简短报告。

数据概览：
- 总支出：¥${totalSpent.toFixed(2)}
- 有记录天数：${daysWithData} 天
- 日均支出：¥${avgDaily.toFixed(2)}
- 最大支出分类：${topCategory}

分类分布：
${sortedCategories.map(([cat, amt]) => `  ${cat}: ¥${amt.toFixed(2)}`).join('\n')}

月度趋势：
${Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([m, amt]) => `  ${m}: ¥${amt.toFixed(2)}`).join('\n')}

请生成以下内容（用中文，简洁有力）：
1. 一句话总结消费状况（30 字以内）
2. 消费模式分析（哪个类别支出最多，是否有异常）
3. 2-3 条省钱建议`

    // 5. 调用 AI
    const reportText = await callAI(c.env, [{ role: 'user', content: prompt }], { maxTokens: 1024, timeoutMs: 30000 })

    // 6. 解析 AI 输出
    const lines = reportText.split('\n').filter(l => l.trim())
    const summary = lines[0] || '消费分析完成'
    const pattern = lines[1] || '请查看详细数据'
    const suggestions = lines.slice(2).filter(l => l.match(/^\d+[.、]|[-*]/)).map(l => l.replace(/^\d+[.、]\s*|[-*]\s*/, ''))

    const report = {
      summary,
      totalSpent: Math.round(totalSpent * 100) / 100,
      avgDaily,
      topCategory,
      pattern,
      suggestions: suggestions.length > 0 ? suggestions : ['合理规划支出，继续加油！'],
    }

    // 7. 缓存到 KV（1 小时）
    const result = { generatedAt: nowBeijing(), fromCache: false, report }
    await c.env.CACHE.put('expenses_ai_analysis', JSON.stringify(result), { expirationTtl: 3600 })

    return c.json(result)
  } catch (err) {
    console.error('Expenses AI analysis error:', err)
    return c.json({ error: 'AI 分析失败' }, 500)
  }
})

// ─────────── 健康指数打卡 ───────────

// 数值列表（按 metric 类型）
records.get('/health', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const metric = c.req.query('metric') || 'weight'
    const days = Math.min(parseInt(c.req.query('days') || '90'), 730)
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - (days - 1))
    const from = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    const rows = await db
      .select()
      .from(schema.healthMetrics)
      .where(and(eq(schema.healthMetrics.metric, metric), gte(schema.healthMetrics.date, from)))
      .orderBy(desc(schema.healthMetrics.date), desc(schema.healthMetrics.createdAt))
    // 同一天多条取最新一条（合并为时间序列）
    const byDate = new Map<string, typeof rows[number]>()
    for (const r of rows) if (!byDate.has(r.date)) byDate.set(r.date, r)
    const series = [...byDate.entries()]
      .map(([date, r]) => ({ id: r.id, date, value: r.value, note: r.note }))
      .sort((a, b) => a.date.localeCompare(b.date))
    return c.json({ series, raw: rows })
  } catch (err) {
    console.error('Health list error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

records.get('/health/metrics', async (c) => {
  try {
    const db = drizzle(c.env.DB, { schema })
    const rows = await db
      .select({ metric: schema.healthMetrics.metric, unit: schema.healthMetrics.unit })
      .from(schema.healthMetrics)
      .groupBy(schema.healthMetrics.metric)
    return c.json(rows)
  } catch (err) {
    console.error('Health metrics error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

// 健康数据 AI 分析
records.get('/health/ai-analysis', async (c) => {
  try {
    // 1. 检查 KV 缓存
    const cached = await c.env.CACHE.get('health_ai_analysis')
    if (cached) {
      return c.json({ ...JSON.parse(cached), fromCache: true })
    }

    const db = drizzle(c.env.DB, { schema })
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 89)
    const from = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

    // 2. 读取最近 90 天健康数据
    const rows = await db
      .select()
      .from(schema.healthMetrics)
      .where(gte(schema.healthMetrics.date, from))
      .orderBy(schema.healthMetrics.date)

    if (rows.length === 0) {
      return c.json({
        generatedAt: nowBeijing(),
        fromCache: false,
        report: {
          summary: '过去 90 天没有健康记录，开始记录健康数据来生成分析吧！',
          metrics: [],
          suggestions: ['开始记录你的健康数据'],
        },
      })
    }

    // 3. 按指标分组
    const metricGroups: Record<string, { values: number[]; unit: string | null; dates: string[] }> = {}
    for (const r of rows) {
      if (!metricGroups[r.metric]) metricGroups[r.metric] = { values: [], unit: r.unit, dates: [] }
      metricGroups[r.metric].values.push(r.value)
      metricGroups[r.metric].dates.push(r.date)
    }

    const metricsSummary = Object.entries(metricGroups).map(([metric, data]) => {
      const avg = Math.round((data.values.reduce((a, b) => a + b, 0) / data.values.length) * 100) / 100
      const min = Math.min(...data.values)
      const max = Math.max(...data.values)
      const latest = data.values[data.values.length - 1]
      const first = data.values[0]
      const trend = latest > first ? '上升' : latest < first ? '下降' : '稳定'
      return { metric, avg, min, max, latest, trend, unit: data.unit || '', count: data.values.length }
    })

    // 4. 构建 AI prompt
    const prompt = `你是一个个人健康分析助手。分析以下健康数据，用中文生成简短报告。

数据概览（共 ${rows.length} 条记录，${Object.keys(metricGroups).length} 个指标）：

${metricsSummary.map(m => `【${m.metric}】
  - 平均值：${m.avg} ${m.unit}
  - 范围：${m.min} - ${m.max} ${m.unit}
  - 最新值：${m.latest} ${m.unit}
  - 趋势：${m.trend}
  - 记录数：${m.count} 次`).join('\n\n')}

请生成以下内容（用中文，简洁有力）：
1. 一句话总结健康状况（30 字以内）
2. 主要发现（哪些指标正常/异常）
3. 2-3 条健康建议`

    // 5. 调用 AI
    const reportText = await callAI(c.env, [{ role: 'user', content: prompt }], { maxTokens: 1024, timeoutMs: 30000 })

    // 6. 解析
    const lines = reportText.split('\n').filter(l => l.trim())
    const summary = lines[0] || '健康分析完成'
    const findings = lines.slice(1).filter(l => !l.match(/^\d+[.、]|[-*]/)).join(' ') || '请查看详细数据'
    const suggestions = lines.filter(l => l.match(/^\d+[.、]|[-*]/)).map(l => l.replace(/^\d+[.、]\s*|[-*]\s*/, ''))

    const report = {
      summary,
      metrics: metricsSummary,
      findings,
      suggestions: suggestions.length > 0 ? suggestions : ['保持健康生活方式！'],
    }

    // 7. 缓存
    const result = { generatedAt: nowBeijing(), fromCache: false, report }
    await c.env.CACHE.put('health_ai_analysis', JSON.stringify(result), { expirationTtl: 3600 })

    return c.json(result)
  } catch (err) {
    console.error('Health AI analysis error:', err)
    return c.json({ error: 'AI 分析失败' }, 500)
  }
})

records.post('/health', async (c) => {
  try {
    const body = await c.req.json()
    const metric = typeof body?.metric === 'string' && body.metric ? body.metric : 'weight'
    const value = parseFloat(body?.value)
    if (isNaN(value)) return c.json({ error: '数值无效' }, 400)
    const date = typeof body?.date === 'string' && body.date ? body.date : todayCST()
    const db = drizzle(c.env.DB, { schema })
    const id = crypto.randomUUID()
    await db.insert(schema.healthMetrics).values({
      id,
      metric,
      value,
      unit: typeof body?.unit === 'string' ? body.unit : null,
      note: typeof body?.note === 'string' ? body.note : null,
      date,
    })
    const [row] = await db.select().from(schema.healthMetrics).where(eq(schema.healthMetrics.id, id))
    return c.json(row, 201)
  } catch (err) {
    console.error('Health create error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

records.put('/health/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.healthMetrics).where(eq(schema.healthMetrics.id, id))
    if (!existing) return c.json({ error: '记录不存在' }, 404)
    const metric = typeof body?.metric === 'string' && body.metric ? body.metric : existing.metric
    const value = body?.value !== undefined ? parseFloat(body.value) : existing.value
    if (isNaN(value)) return c.json({ error: '数值无效' }, 400)
    const unit = body?.unit !== undefined ? (typeof body.unit === 'string' ? body.unit : null) : existing.unit
    const note = body?.note !== undefined ? (typeof body.note === 'string' ? body.note : null) : existing.note
    const date = typeof body?.date === 'string' && body.date ? body.date : existing.date
    await db.update(schema.healthMetrics).set({ metric, value, unit, note, date }).where(eq(schema.healthMetrics.id, id))
    const [row] = await db.select().from(schema.healthMetrics).where(eq(schema.healthMetrics.id, id))
    return c.json(row)
  } catch (err) {
    console.error('Health update error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

records.delete('/health/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const db = drizzle(c.env.DB, { schema })
    const [existing] = await db.select().from(schema.healthMetrics).where(eq(schema.healthMetrics.id, id))
    if (!existing) return c.json({ error: '记录不存在' }, 404)
    await db.delete(schema.healthMetrics).where(eq(schema.healthMetrics.id, id))
    return c.json({ ok: true })
  } catch (err) {
    console.error('Health delete error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

export default records
