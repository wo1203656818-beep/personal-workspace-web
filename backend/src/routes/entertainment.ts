import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, desc, sql } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { todayCST } from '../time'
import { callAI } from '../utils/ai-client'

const entertainment = new Hono<{ Bindings: Env }>()

// ========== 赛博运势 ==========
entertainment.post('/cyber-fortune', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const today = todayCST()

  const existing = await db.select().from(schema.cyberFortunes)
    .where(eq(schema.cyberFortunes.date, today)).limit(1)
  if (existing.length > 0) {
    return c.json({ ...existing[0], cached: true })
  }

  let content = ''
  let moodScore = 5
  let luckyColor = '#6366f1'
  try {
    const aiResult = await callAI(c.env, [{
      role: 'system',
      content: `你是一个赛博朋克风格的运势生成器。用科技感的语言生成今日运势。
返回JSON格式：{"content": "运势文案(100字以内，用编程/科技比喻生活)", "moodScore": 1-10的数字, "luckyColor": "hex颜色值"}`
    }, {
      role: 'user',
      content: `今天是${today}，请生成今日赛博运势。`
    }])
    const parsed = JSON.parse(aiResult)
    content = parsed.content || aiResult
    moodScore = parsed.moodScore || 5
    luckyColor = parsed.luckyColor || '#6366f1'
  } catch {
    content = '今日系统运行稳定，CPU占用率适中，适合执行重要任务。'
  }

  const id = crypto.randomUUID()
  await db.insert(schema.cyberFortunes).values({ id, date: today, content, moodScore, luckyColor })
  return c.json({ id, date: today, content, moodScore, luckyColor })
})

entertainment.get('/cyber-fortune/history', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const history = await db.select().from(schema.cyberFortunes).orderBy(desc(schema.cyberFortunes.date)).limit(30)
  return c.json(history)
})

// ========== 今日人设 ==========
entertainment.post('/daily-persona', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const today = todayCST()

  const existing = await db.select().from(schema.dailyPersonas)
    .where(eq(schema.dailyPersonas.date, today)).limit(1)
  if (existing.length > 0) {
    return c.json({ ...existing[0], cached: true })
  }

  let name = '神秘程序员'
  let description = '你是一个热爱生活的创造者'
  let luckyColor = '#f59e0b'
  let bgmStyle = 'Lo-fi Hip Hop'
  let suitableFor = '喝杯咖啡，写点代码'
  try {
    const aiResult = await callAI(c.env, [{
      role: 'system',
      content: `你是一个趣味人设生成器。每天为用户生成一个有趣的角色人设。
返回JSON格式：{"name": "人设名(4-8字，有趣)", "description": "人设描述(50字以内)", "luckyColor": "hex颜色值", "bgmStyle": "今日推荐BGM风格", "suitableFor": "今天适合做的事(20字以内)"}`
    }, {
      role: 'user',
      content: `今天是${today}，请生成今日人设。`
    }])
    const parsed = JSON.parse(aiResult)
    name = parsed.name || name
    description = parsed.description || description
    luckyColor = parsed.luckyColor || luckyColor
    bgmStyle = parsed.bgmStyle || bgmStyle
    suitableFor = parsed.suitableFor || suitableFor
  } catch {}

  const id = crypto.randomUUID()
  await db.insert(schema.dailyPersonas).values({ id, date: today, name, description, luckyColor, bgmStyle, suitableFor })
  return c.json({ id, date: today, name, description, luckyColor, bgmStyle, suitableFor })
})

entertainment.get('/daily-persona/history', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const history = await db.select().from(schema.dailyPersonas).orderBy(desc(schema.dailyPersonas.date)).limit(30)
  return c.json(history)
})

// ========== 灵感抽屉 ==========
const INSPIRATIONS = [
  { content: '用3个emoji描述你今天的心情', category: '写作灵感' },
  { content: '给5年前的自己写一句话', category: '思考问题' },
  { content: '今天尝试用左手写字5分钟', category: '生活挑战' },
  { content: '写下3件你感恩的事', category: '思考问题' },
  { content: '给一个陌生人一个真诚的赞美', category: '社交挑战' },
  { content: '用100字描述窗外的风景', category: '写作灵感' },
  { content: '今天尝试不看手机超过1小时', category: '生活挑战' },
  { content: '写下你最想实现的3个梦想', category: '思考问题' },
  { content: '给未来的自己写一封信', category: '写作灵感' },
  { content: '今天学一个新词汇并用它造句', category: '学习挑战' },
  { content: '用比喻描述你今天的状态', category: '写作灵感' },
  { content: '给最久没联系的朋友发条消息', category: '社交挑战' },
  { content: '今天尝试走一条没走过的路', category: '生活挑战' },
  { content: '写下你最喜欢的一首歌的歌词', category: '写作灵感' },
  { content: '用5句话总结你的人生故事', category: '思考问题' },
  { content: '今天尝试做一件小小的善事', category: '行动建议' },
  { content: '画一幅简笔画描述今天', category: '创作灵感' },
  { content: '用第三人称描述你今天的生活', category: '写作灵感' },
  { content: '写下你最感激的3个人', category: '思考问题' },
  { content: '今天尝试冥想5分钟', category: '健康挑战' },
  { content: '给明天的自己写一句鼓励的话', category: '写作灵感' },
  { content: '用反讽的方式描述今天', category: '写作灵感' },
  { content: '今天尝试一次深呼吸10次', category: '健康挑战' },
  { content: '写下你最想改掉的一个习惯', category: '思考问题' },
  { content: '用一首诗描述今天的心情', category: '创作灵感' },
  { content: '今天尝试说3次谢谢', category: '社交挑战' },
  { content: '写下你理想中的完美一天', category: '思考问题' },
  { content: '今天尝试不抱怨任何事', category: '生活挑战' },
  { content: '用一个词总结今天的收获', category: '写作灵感' },
  { content: '给3年后的自己写一句话', category: '思考问题' },
]

entertainment.post('/inspiration', async (c) => {
  const idx = Math.floor(Math.random() * INSPIRATIONS.length)
  const inspiration = INSPIRATIONS[idx]
  return c.json(inspiration)
})

entertainment.get('/inspiration/saved', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const saved = await db.select().from(schema.savedInspirations).orderBy(desc(schema.savedInspirations.createdAt)).limit(50)
  return c.json(saved)
})

entertainment.post('/inspiration/save', async (c) => {
  const { content, category } = await c.req.json()
  if (!content) return c.json({ error: '缺少内容' }, 400)
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()
  await db.insert(schema.savedInspirations).values({ id, content, category: category || '其他' })
  return c.json({ id }, 201)
})

entertainment.delete('/inspiration/:id', async (c) => {
  const { id } = c.req.param()
  const db = drizzle(c.env.DB, { schema })
  await db.delete(schema.savedInspirations).where(eq(schema.savedInspirations.id, id))
  return c.json({ ok: true })
})

// ========== 随机挑战 ==========
const CHALLENGES = [
  { challenge: '今天尝试早起15分钟', category: '健康' },
  { challenge: '用3个emoji发一条朋友圈', category: '社交' },
  { challenge: '给一个陌生人微笑', category: '社交' },
  { challenge: '今天喝够8杯水', category: '健康' },
  { challenge: '写下一个新的idea', category: '创造' },
  { challenge: '今天尝试不抱怨', category: '心态' },
  { challenge: '给朋友发一句鼓励的话', category: '社交' },
  { challenge: '今天阅读10页书', category: '学习' },
  { challenge: '用5分钟整理桌面', category: '生活' },
  { challenge: '今天尝试做一道新菜', category: '创造' },
  { challenge: '走一条没走过的路回家', category: '探索' },
  { challenge: '写下今天最开心的一件事', category: '心态' },
  { challenge: '给家人打一个电话', category: '社交' },
  { challenge: '今天尝试不看短视频超过2小时', category: '生活' },
  { challenge: '做10个俯卧撑', category: '健康' },
  { challenge: '学习一个新单词', category: '学习' },
  { challenge: '给同事分享一个小零食', category: '社交' },
  { challenge: '今天用番茄钟完成2个任务', category: '效率' },
  { challenge: '写下3个今天的小确幸', category: '心态' },
  { challenge: '今天尝试一次5分钟冥想', category: '健康' },
  { challenge: '整理手机里的照片', category: '生活' },
  { challenge: '给陌生人让路或开门', category: '社交' },
  { challenge: '今天尝试用新视角看一个问题', category: '思考' },
  { challenge: '写下你今天学到的东西', category: '学习' },
  { challenge: '今天尝试一次深蹲15个', category: '健康' },
]

entertainment.post('/daily-challenge', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const today = todayCST()

  const existing = await db.select().from(schema.challengeCompletions)
    .where(eq(schema.challengeCompletions.date, today))

  const idx = Math.floor(Math.random() * CHALLENGES.length)
  const challenge = CHALLENGES[idx]

  return c.json({
    ...challenge,
    date: today,
    completed: existing.length > 0,
    completedAt: existing[0]?.completedAt || null,
  })
})

entertainment.post('/daily-challenge/complete', async (c) => {
  const { challenge, category } = await c.req.json()
  if (!challenge) return c.json({ error: '缺少挑战内容' }, 400)
  const db = drizzle(c.env.DB, { schema })
  const today = todayCST()
  const id = crypto.randomUUID()
  await db.insert(schema.challengeCompletions).values({ id, date: today, challenge, category: category || '其他' })
  return c.json({ ok: true, id }, 201)
})

entertainment.get('/daily-challenge/stats', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const total = await db.select({ count: sql<number>`count(*)` }).from(schema.challengeCompletions)
  const last7 = await db.select({
    date: sql<string>`date(${schema.challengeCompletions.completedAt})`,
    count: sql<number>`count(*)`,
  }).from(schema.challengeCompletions)
    .where(sql`${schema.challengeCompletions.completedAt} >= datetime('now', '-7 days')`)
    .groupBy(sql`date(${schema.challengeCompletions.completedAt})`)

  return c.json({ total: total[0]?.count || 0, last7 })
})

// ========== AI 写诗 ==========
entertainment.post('/ai-poem', async (c) => {
  const { topic, style } = await c.req.json() as { topic: string; style?: string }
  if (!topic) return c.json({ error: '请输入主题' }, 400)

  const styleMap: Record<string, string> = {
    classical: '古风（五言或七言绝句，押韵）',
    modern: '现代诗（自由体，意象丰富）',
    acrostic: '藏头诗（每句首字连起来是主题）',
    humor: '打油诗（幽默诙谐，通俗易懂）',
  }
  const styleDesc = styleMap[style || 'modern'] || '现代诗'

  let poem = ''
  try {
    poem = await callAI(c.env, [{
      role: 'system',
      content: `你是一个才华横溢的诗人。请根据用户的要求写一首${styleDesc}。
要求：4-8行，语言优美，有意境。直接输出诗句，不要解释。`
    }, {
      role: 'user',
      content: `主题：${topic}`
    }])
  } catch {
    poem = '灵感如星辰，\n散落在心间。\n轻轻拾起一颗，\n便是永恒。'
  }

  return c.json({ poem, topic, style: style || 'modern' })
})

// ========== AI 塔罗牌 ==========
const TAROT_CARDS = [
  { name: '愚者', meaning: '新的开始、冒险、自由' },
  { name: '魔术师', meaning: '创造力、意志力、技巧' },
  { name: '女祭司', meaning: '直觉、智慧、神秘' },
  { name: '女皇', meaning: '丰收、母性、美丽' },
  { name: '皇帝', meaning: '权威、稳定、领导力' },
  { name: '教皇', meaning: '传统、精神指导、信仰' },
  { name: '恋人', meaning: '爱情、选择、和谐' },
  { name: '战车', meaning: '胜利、意志力、前进' },
  { name: '力量', meaning: '勇气、耐心、内在力量' },
  { name: '隐士', meaning: '内省、独处、智慧' },
  { name: '命运之轮', meaning: '转折、命运、机遇' },
  { name: '正义', meaning: '公正、真相、因果' },
  { name: '倒吊人', meaning: '放下、牺牲、新视角' },
  { name: '死神', meaning: '结束、转变、重生' },
  { name: '节制', meaning: '平衡、耐心、调和' },
  { name: '恶魔', meaning: '束缚、欲望、物质' },
  { name: '塔', meaning: '突变、破坏、觉醒' },
  { name: '星星', meaning: '希望、灵感、宁静' },
  { name: '月亮', meaning: '幻觉、直觉、潜意识' },
  { name: '太阳', meaning: '成功、快乐、活力' },
  { name: '审判', meaning: '重生、觉醒、反思' },
  { name: '世界', meaning: '完成、成就、圆满' },
]

entertainment.post('/tarot', async (c) => {
  const { question, spread } = await c.req.json()
  if (!question) return c.json({ error: '请输入你的问题' }, 400)

  const db = drizzle(c.env.DB, { schema })
  const spreadSize = spread === 'three' ? 3 : spread === 'celtic' ? 10 : 1

  // 随机抽牌
  const shuffled = [...TAROT_CARDS].sort(() => Math.random() - 0.5)
  const drawn = shuffled.slice(0, spreadSize)

  const spreadNames: Record<string, string> = {
    single: '单张牌',
    three: '过去-现在-未来',
    celtic: '凯尔特十字',
  }

  let interpretation = ''
  try {
    const cardsDesc = drawn.map((card, i) => {
      const positions = spread === 'celtic'
        ? ['当前处境', '挑战', '过去基础', '近期过去', '可能结果', '近期未来', '自我态度', '环境影响', '希望与恐惧', '最终结果']
        : spread === 'three' ? ['过去', '现在', '未来'] : ['当前指引']
      return `第${i + 1}张「${card.name}」(${positions[i] || ''})：${card.meaning}`
    }).join('\n')

    interpretation = await callAI(c.env, [{
      role: 'system',
      content: `你是一个资深塔罗牌解读师。请根据牌面和问题，给出温暖、有深度的解读。
解读要：1) 结合每张牌的位置含义 2) 回应用户的问题 3) 给出建议
总字数控制在200字以内。`
    }, {
      role: 'user',
      content: `问题：${question}\n牌阵：${spreadNames[spread || 'single']}\n抽到的牌：\n${cardsDesc}`
    }])
  } catch {
    interpretation = '塔罗牌在沉默中等待，建议你静心思考后再次提问。'
  }

  const id = crypto.randomUUID()
  await db.insert(schema.tarotReadings).values({
    id, question, spread: spread || 'single',
    cards: JSON.stringify(drawn), interpretation,
  })

  return c.json({ id, question, spread: spread || 'single', cards: drawn, interpretation })
})

entertainment.get('/tarot/history', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const history = await db.select().from(schema.tarotReadings).orderBy(desc(schema.tarotReadings.createdAt)).limit(20)
  return c.json(history)
})

export default entertainment
