import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'
import { fetchPhysicalEntropy, fetchUniformEntropy } from '../entropy'
import { todayCST } from '../time'
import { callAI } from '../utils/ai-client'

const tools = new Hono<{ Bindings: Env }>()

tools.post('/coin/flip', async (c) => {
  const { value: randomValue, source } = await fetchPhysicalEntropy()
  const result = randomValue < 128 ? 'tails' : 'heads'
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()

  // AI 解读
  let interpretation = ''
  try {
    interpretation = await callAI(c.env, [{
      role: 'system',
      content: `你是天意解读助手。用一句话给出玄学解读，30字以内。`
    }, {
      role: 'user',
      content: `用户抛掷天意硬币得到"${result === 'heads' ? '阳/正面' : '阴/反面'}"，请解读。`
    }])
  } catch (e) { console.error('[coin] AI 解读失败:', e) }

  await db.insert(schema.coinFlips).values({
    id,
    result,
    entropySource: source,
    rawValue: randomValue,
    interpretation,
  })

  return c.json({ result, source, rawValue: randomValue, interpretation })
})

tools.get('/coin/history', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.coinFlips).orderBy(desc(schema.coinFlips.createdAt))
  return c.json(rows)
})

// ========== 决策小工具：答案之书 & 每日一签 ==========

// 答案之书：64条，取意易经六十四卦与道佛智慧
const ANSWERS = [
  '乾元亨利贞，天行健，去做。',
  '否极泰来，时机将至。',
  '潜龙勿用，再等等。',
  '利见大人，贵人将至。',
  '含章可贞，内敛为上。',
  '括囊无咎，收敛锋芒。',
  '鸣谦贞吉，谦受益。',
  '鸣豫凶，不可沉溺安逸。',
  '观我生进退，审时度势。',
  '不远复，迷途知返。',
  '无妄往吉，无妄之行。',
  '大畜利贞，积蓄力量。',
  '颐贞吉，养正则吉。',
  '大过栋桡，非常之时需非常之策。',
  '习坎有孚，险中求信。',
  '离丽也，附丽正道。',
  '咸感也，以心感应。',
  '恒久也，持之以恒。',
  '遁之时义大矣哉，该退则退。',
  '大壮利贞，壮而守正。',
  '晋明出地上，光明在前。',
  '明夷艰贞，韬光养晦。',
  '家人言有物，言行一致。',
  '睽小事吉，小事可成。',
  '蹇利西南，绕道而行。',
  '解利西南，宽以待人。',
  '损损下益上，有舍才有得。',
  '益益动而巽，日进无疆。',
  '夬扬于王庭，果断宣示。',
  '姤女壮勿用取女，谨慎为上。',
  '萃聚也，团结一心。',
  '升地中生木，循序渐进。',
  '困困而不失其所亨，困境见品格。',
  '井改邑不改井，万变不离其宗。',
  '革汤武革命，顺天应人。',
  '鼎取新也，革故鼎新。',
  '震亨震来虩虩，敬畏则安。',
  '艮其背，止于当止。',
  '渐进以正，循序渐进。',
  '归妹征凶，勿急于求成。',
  '丰宜日中，盛极必衰。',
  '旅琐琐斯其所取灾，谨慎处世。',
  '巽小亨，柔顺通达。',
  '兑说也，和悦为贵。',
  '涣亨，散而复聚。',
  '节亨苦节不可贞，适度为佳。',
  '中孚豚鱼吉，至诚感通。',
  '小过可小事不可大事，小事吉。',
  '既济亨小利贞，初吉终乱。',
  '未济亨小狐汔济，将成未成。',
  '天道亏盈而益谦。',
  '地势坤厚德载物。',
  '山止川行，动静皆宜。',
  '泽中有雷，蓄势待发。',
  '风雷相益，借力而行。',
  '水火既济，阴阳调和。',
  '天地不交否，暂守为宜。',
  '泽火革，除旧布新。',
  '雷风恒，守常应变。',
  '山泽损，减损增益。',
  '风山渐，稳步推进。',
  '火地晋，步步高升。',
  '地山谦，满招损谦受益。',
  '天火同人，志同道合。',
  '火天大有，大有可为。',
]

// 每日一签：64签，仿传统庙签格式
const FORTUNES = [
  { name: '乾卦', level: '大吉', poem: '龙飞九霄云程开，万里鹏程自此来。', interpret: '诸事大吉，主动推进，天时地利人和皆备。' },
  { name: '坤卦', level: '吉', poem: '厚德载物容万物，柔顺利贞行无阻。', interpret: '顺势而为，包容为上，合作比单打独斗更顺。' },
  { name: '屯卦', level: '中吉', poem: '春雷初动万物生，草创之时宜谨慎。', interpret: '万事开头难，坚持则通，勿急勿躁。' },
  { name: '蒙卦', level: '中吉', poem: '山下出泉蒙以养，虚心求教智慧长。', interpret: '放下成见，虚心学习，答案会在求索中浮现。' },
  { name: '需卦', level: '吉', poem: '云上于天需以待，饮食宴乐静心怀。', interpret: '耐心等待，时机未到强求无益，养精蓄锐。' },
  { name: '讼卦', level: '末吉', poem: '天水相违讼端起，宜止争端修内省。', interpret: '避免争论，退一步海阔天空，和解为上。' },
  { name: '师卦', level: '中吉', poem: '地中有水师以律，行师出征需正当。', interpret: '行事有章法，团队协作，以正道服人。' },
  { name: '比卦', level: '吉', poem: '地上有水比相亲，择善而从得助力。', interpret: '贵人运旺，主动结交良友，借力而行。' },
  { name: '小畜', level: '小吉', poem: '风行天上小畜密，积少成多方有成。', interpret: '小事可为，大事需缓，积累实力为要。' },
  { name: '履卦', level: '中吉', poem: '上天下泽履以礼，小心谨慎行坦途。', interpret: '按部就班，守规矩走正路，平安顺遂。' },
  { name: '泰卦', level: '大吉', poem: '天地交泰万物通，否极泰来福运隆。', interpret: '大吉大利，一切通达，把握良机果断行动。' },
  { name: '否卦', level: '末吉', poem: '天地不交否难通，宜守不宜进待转机。', interpret: '暂时蛰伏，不冒险不冲动，静待变化。' },
  { name: '同人', level: '吉', poem: '天火同人志相同，和同于人百事通。', interpret: '志同道合之人将至，合作共贏，团结力量大。' },
  { name: '大有', level: '大吉', poem: '火在天上大有明，自天佑之吉无不利。', interpret: '运势极旺，大有可为，正财正缘皆顺。' },
  { name: '谦卦', level: '吉', poem: '地中有山谦君子，满招损兮谦受益。', interpret: '谦虚低调，越谦越顺，勿张扬勿自满。' },
  { name: '豫卦', level: '中吉', poem: '雷出地奋豫以乐，顺时而动万事和。', interpret: '心态积极，顺势而行，但勿乐极生悲。' },
  { name: '随卦', level: '吉', poem: '泽中有雷随时义，顺天应人随缘去。', interpret: '随缘不随意，顺应大势，灵活应变。' },
  { name: '蛊卦', level: '中吉', poem: '山下有风蛊须治，振弊起衰正当时。', interpret: '旧事需清理，革新除弊，破旧方能立新。' },
  { name: '临卦', level: '大吉', poem: '泽上有地临以近，教思无穷容保民。', interpret: '好运临门，亲近良师益友，受益匪浅。' },
  { name: '观卦', level: '中吉', poem: '风行地上观天道，观我生兮进退明。', interpret: '观察形势再行动，三思而后行，审时度势。' },
  { name: '噬嗑', level: '小吉', poem: '雷电噬嗑合而分，果断决裂去障碍。', interpret: '障碍可除，需果断处理，犹豫反受其害。' },
  { name: '贲卦', level: '小吉', poem: '山下有火贲以文，修饰外表重内涵。', interpret: '外在修饰适度即可，内在充实更为重要。' },
  { name: '剥卦', level: '凶', poem: '山附于地剥将尽，不宜冒进宜守身。', interpret: '运势低迷，不宜进取，固守等待转机。' },
  { name: '复卦', level: '大吉', poem: '雷在地中复亨通，一阳来复万象新。', interpret: '否极泰来，重新开始，一切从头再来吉。' },
  { name: '无妄', level: '吉', poem: '天下雷行无妄动，至诚无妄行正道。', interpret: '不做妄念之事，坦荡行事，天佑善人。' },
  { name: '大畜', level: '吉', poem: '天在山中大畜厚，日新其德蓄光明。', interpret: '积蓄实力，厚积薄发，时机到时一飞冲天。' },
  { name: '颐卦', level: '中吉', poem: '山下有雷颐以养，节饮食慎言语。', interpret: '养身养心，节制为上，祸从口出慎言为佳。' },
  { name: '大过', level: '末吉', poem: '泽灭木兮大过时，独立不惧济危难。', interpret: '非常时期需非常之策，但风险亦大，慎行。' },
  { name: '坎卦', level: '凶', poem: '水流不盈习坎险，心亨行尚守诚信。', interpret: '险阻重重，唯有内心坚定、守信方能脱困。' },
  { name: '离卦', level: '中吉', poem: '明两作离大人继，附丽正道放光明。', interpret: '依附正道，远离邪念，光明在前。' },
  { name: '咸卦', level: '吉', poem: '山泽通气咸感应，以虚受人情意通。', interpret: '人缘极佳，以心换心，感情之事尤为顺遂。' },
  { name: '恒卦', level: '吉', poem: '雷风相与恒久远，守常应变道不穷。', interpret: '持之以恒方能成事，三分钟热度终无果。' },
  { name: '遁卦', level: '末吉', poem: '天下有山遁以远，君子远小人不恶。', interpret: '该退则退，远离是非，保全自身为上。' },
  { name: '大壮', level: '中吉', poem: '雷在天上大壮时，非礼弗履守正直。', interpret: '精力旺盛但需守正，壮而不妄方为真壮。' },
  { name: '晋卦', level: '大吉', poem: '明出地上晋光明，自昭明德日日新。', interpret: '步步高升，前途光明，努力终将被看见。' },
  { name: '明夷', level: '凶', poem: '明入地中明夷暗，内文明而外柔顺。', interpret: '韬光养晦之时，隐忍不发，保存实力。' },
  { name: '家人', level: '吉', poem: '风自火出家人和，言有物而行有恒。', interpret: '家庭和睦，家和万事兴，言行一致为要。' },
  { name: '睽卦', level: '末吉', poem: '上火下泽睽相违，小事可成大事非。', interpret: '意见分歧，求同存异，小事可为大事暂缓。' },
  { name: '蹇卦', level: '凶', poem: '山上有水蹇难行，反身修德待时通。', interpret: '举步维艰，内修己身，静待柳暗花明。' },
  { name: '解卦', level: '吉', poem: '雷雨作解百难消，宽以待人解纷扰。', interpret: '困难已解，宜宽厚待人，化干戈为玉帛。' },
  { name: '损卦', level: '中吉', poem: '山泽损损下益上，损益盈虚随时变。', interpret: '有失必有得，适当损失换取更大收获。' },
  { name: '益卦', level: '大吉', poem: '风雷益益动而巽，自天佑之吉大有。', interpret: '运势上升，助人即助己，善行带来好运。' },
  { name: '夬卦', level: '中吉', poem: '泽上于天夬以决，扬于王庭告四方。', interpret: '果断决策之时，但需公开公正，不可暗行。' },
  { name: '姤卦', level: '末吉', poem: '天下有风姤以遇，勿用取女慎始交。', interpret: '初遇之事需谨慎，不被表象迷惑，深入了解。' },
  { name: '萃卦', level: '吉', poem: '泽上于地萃以聚，团结一心力量聚。', interpret: '人聚财聚，合作共贏，独木难成林。' },
  { name: '升卦', level: '大吉', poem: '地中生木升以高，积小成大步步高。', interpret: '稳步上升，日积月累，终成大器。' },
  { name: '困卦', level: '凶', poem: '泽无水兮困穷时，致命遂志守诚信。', interpret: '困境之中不失志，守信待时终会脱困。' },
  { name: '井卦', level: '中吉', poem: '木上有水井养民，改邑不改井长存。', interpret: '万变不离其宗，坚守本心方为长久之道。' },
  { name: '革卦', level: '吉', poem: '泽中有火革故新，汤武革命顺天人。', interpret: '变革之时，除旧布新，顺势而变大吉。' },
  { name: '鼎卦', level: '大吉', poem: '木上有火鼎烹饪，取新去故立正位。', interpret: '鼎新之际，万象更新，把握时机开创新局。' },
  { name: '震卦', level: '中吉', poem: '洊雷震亨震虩虩，恐惧修省福自至。', interpret: '敬畏之心不可无，谨慎行事平安顺遂。' },
  { name: '艮卦', level: '末吉', poem: '兼山艮止于当止，时止时行皆有道。', interpret: '该停则停，该行则行，知止为智。' },
  { name: '渐卦', level: '吉', poem: '山上有木渐以进，循序渐进终有成。', interpret: '循序渐进，不可急于求成，水到渠成。' },
  { name: '归妹', level: '凶', poem: '泽上有雷归妹时，征凶无攸利可寻。', interpret: '关系或合作需谨慎，勿急于确定，多观察。' },
  { name: '丰卦', level: '中吉', poem: '雷电皆至丰以大，宜照天下勿自封。', interpret: '运势正盛，但居安思危，盛极必衰需警醒。' },
  { name: '旅卦', level: '末吉', poem: '山上有火旅途中，柔得中乎行小心。', interpret: '出行或变动需谨慎，漂泊不定守正为要。' },
  { name: '巽卦', level: '小吉', poem: '随风巽以申命行，小亨利有攸往行。', interpret: '以柔顺之道行事，小事可成，顺势而为。' },
  { name: '兑卦', level: '吉', poem: '丽泽兑以朋友讲，和悦待人善缘来。', interpret: '人缘极佳，和颜悦色迎人，好运自然来。' },
  { name: '涣卦', level: '中吉', poem: '风行水上涣以散，先王享帝立庙安。', interpret: '散中有聚，放下执念反而得到更多。' },
  { name: '节卦', level: '小吉', poem: '泽上有水节以度，苦节不可贞守中。', interpret: '节制有度，过犹不及，适中方为上策。' },
  { name: '中孚', level: '大吉', poem: '泽上有风中孚诚，豚鱼吉兮信及远。', interpret: '至诚感通，诚信待人，天佑诚者。' },
  { name: '小过', level: '中吉', poem: '山上有雷过小事，可小事兮不可大。', interpret: '小事可为，大事需缓，不宜好高骛远。' },
  { name: '既济', level: '末吉', poem: '水在火上既济成，初吉终乱慎终始。', interpret: '事已初成，但勿松懈，守成比创业更难。' },
  { name: '未济', level: '中吉', poem: '火在水上未济时，慎辨物居方待时。', interpret: '事未终了，继续努力，黎明前最暗。' },
]

tools.post('/tools/answer', async (c) => {
  const { value: randomValue, source, uniformValue: idx } = await fetchUniformEntropy(ANSWERS.length)
  const result = ANSWERS[idx]
  const db = drizzle(c.env.DB, { schema })
  const id = crypto.randomUUID()

  await db.insert(schema.answerBookDraws).values({
    id,
    result,
    entropySource: source,
    rawValue: randomValue,
  })

  return c.json({ result, source, rawValue: randomValue })
})

tools.get('/tools/answer/history', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.answerBookDraws).orderBy(desc(schema.answerBookDraws.createdAt))
  return c.json(rows)
})

tools.post('/tools/fortune', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const today = todayCST()

  // 每日一签幂等：同一天直接返回已有结果
  const existing = await db.select().from(schema.dailyFortunes).where(eq(schema.dailyFortunes.date, today))
  if (existing.length > 0) {
    const row = existing[0]
    return c.json({ ...row, cached: true })
  }

  const { value: randomValue, source, uniformValue: idx } = await fetchUniformEntropy(FORTUNES.length)
  const fortune = FORTUNES[idx]
  const id = crypto.randomUUID()

  await db.insert(schema.dailyFortunes).values({
    id,
    date: today,
    result: fortune.name,
    interpretation: JSON.stringify({ level: fortune.level, poem: fortune.poem, interpret: fortune.interpret }),
    entropySource: source,
    rawValue: randomValue,
  })

  return c.json({ id, date: today, result: fortune.name, level: fortune.level, poem: fortune.poem, interpret: fortune.interpret, source, rawValue: randomValue, cached: false })
})

tools.get('/tools/fortune/history', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const rows = await db.select().from(schema.dailyFortunes).orderBy(desc(schema.dailyFortunes.date))
  return c.json(rows)
})

// ========== 同步日志 ==========

tools.get('/sync-logs', async (c) => {
  const db = drizzle(c.env.DB, { schema })
  const source = c.req.query('source')
  const status = c.req.query('status')

  let q = db.select().from(schema.syncLogs)
  const conditions = []
  if (source) conditions.push(eq(schema.syncLogs.source, source))
  if (status) conditions.push(eq(schema.syncLogs.status, status))
  if (conditions.length > 0) q = q.where(and(...conditions)) as typeof q

  const rows = await q.orderBy(desc(schema.syncLogs.createdAt))
  return c.json(rows)
})

export default tools
