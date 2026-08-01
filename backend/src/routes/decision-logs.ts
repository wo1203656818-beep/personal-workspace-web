import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { gte, sql } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { callAI } from '../utils/ai-client'
import { nowBeijing } from '../time'

const decisionLogs = new Hono<{ Bindings: Env }>()

decisionLogs.get('/analysis', async (c) => {
  try {
    const cached = await c.env.CACHE.get('decision_logs_analysis')
    if (cached) return c.json({ ...JSON.parse(cached), fromCache: true })

    const db = drizzle(c.env.DB, { schema })
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90)
    const since = threeMonthsAgo.toISOString()

    const logs = await db
      .select()
      .from(schema.decisionLogs)
      .where(gte(schema.decisionLogs.createdAt, since))

    const totalLogs = logs.length
    const categoryDist: Record<string, number> = {}
    let totalDuration = 0
    let durationCount = 0
    let totalSatisfaction = 0
    let satisfactionCount = 0
    let ruleAppliedCount = 0

    for (const log of logs) {
      categoryDist[log.category] = (categoryDist[log.category] || 0) + 1
      if (log.durationSec) { totalDuration += log.durationSec; durationCount++ }
      if (log.satisfaction) { totalSatisfaction += log.satisfaction; satisfactionCount++ }
      if (log.ruleApplied) ruleAppliedCount++
    }

    const avgDuration = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0
    const avgSatisfaction = satisfactionCount > 0 ? Math.round((totalSatisfaction / satisfactionCount) * 10) / 10 : 0
    const ruleRate = totalLogs > 0 ? Math.round((ruleAppliedCount / totalLogs) * 100) : 0

    const prompt = `你是决策分析助手。分析以下决策日志，找出用户的决策模式。
总决策数：${totalLogs}
分类分布：${JSON.stringify(categoryDist)}
平均决策耗时：${avgDuration}秒
平均满意度：${avgSatisfaction}/5
规则使用率：${ruleRate}%
用中文输出 3-5 条洞察和建议。`

    const reportText = await callAI(c.env, [
      { role: 'system', content: '你是决策分析助手。' },
      { role: 'user', content: prompt },
    ], { maxTokens: 512 })

    const result = {
      generatedAt: nowBeijing(),
      fromCache: false,
      report: reportText.trim(),
      stats: { totalLogs, categoryDist, avgDuration, avgSatisfaction, ruleRate },
    }

    await c.env.CACHE.put('decision_logs_analysis', JSON.stringify(result), { expirationTtl: 3600 })
    return c.json(result)
  } catch (err) {
    console.error('[decision-logs/analysis] error:', err)
    return c.json({ error: '分析失败' }, 500)
  }
})

export default decisionLogs