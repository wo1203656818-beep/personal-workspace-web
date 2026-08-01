import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, gte, lte } from 'drizzle-orm'
import * as schema from '../schema'
import type { Env } from '../types'

const calendar = new Hono<{ Bindings: Env }>()

// 获取指定月份的所有日历数据
calendar.get('/items', async (c) => {
  try {
    const month = c.req.query('month') // yyyy-MM
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return c.json({ error: '月份格式无效，请使用 yyyy-MM' }, 400)
    }

    const db = drizzle(c.env.DB, { schema })

    // 计算月份范围
    const monthStart = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`

    // 并行查询三个表
    const [taskRows, journalRows, habitRows] = await Promise.all([
      db
        .select({
          id: schema.tasks.id,
          title: schema.tasks.title,
          listId: schema.tasks.listId,
          isCompleted: schema.tasks.isCompleted,
          dueDate: schema.tasks.dueDate,
        })
        .from(schema.tasks)
        .where(
          and(
            gte(schema.tasks.dueDate, monthStart),
            lte(schema.tasks.dueDate, monthEnd),
          ),
        ),

      db
        .select({
          id: schema.journalEntries.id,
          title: schema.journalEntries.title,
          mood: schema.journalEntries.mood,
          date: schema.journalEntries.date,
        })
        .from(schema.journalEntries)
        .where(
          and(
            gte(schema.journalEntries.date, monthStart),
            lte(schema.journalEntries.date, monthEnd),
          ),
        ),

      db
        .select({
          habitId: schema.habitCheckins.habitId,
          date: schema.habitCheckins.date,
          habitName: schema.habits.name,
        })
        .from(schema.habitCheckins)
        .innerJoin(schema.habits, eq(schema.habitCheckins.habitId, schema.habits.id))
        .where(
          and(
            gte(schema.habitCheckins.date, monthStart),
            lte(schema.habitCheckins.date, monthEnd),
          ),
        ),
    ])

    // 按天聚合
    const days: Record<string, { tasks: any[]; journals: any[]; habits: any[] }> = {}

    for (const task of taskRows) {
      const d = task.dueDate!
      if (!days[d]) days[d] = { tasks: [], journals: [], habits: [] }
      days[d].tasks.push(task)
    }

    for (const journal of journalRows) {
      const d = journal.date
      if (!days[d]) days[d] = { tasks: [], journals: [], habits: [] }
      days[d].journals.push(journal)
    }

    // 按天聚合习惯（同一天同一习惯多次打卡只计一次）
    const habitDaySet = new Set<string>()
    for (const habit of habitRows) {
      const key = `${habit.date}-${habit.habitId}`
      if (habitDaySet.has(key)) continue
      habitDaySet.add(key)
      const d = habit.date
      if (!days[d]) days[d] = { tasks: [], journals: [], habits: [] }
      days[d].habits.push({
        habitId: habit.habitId,
        habitName: habit.habitName,
      })
    }

    return c.json({ month, days })
  } catch (err) {
    console.error('Calendar error:', err)
    return c.json({ error: '服务器内部错误' }, 500)
  }
})

export default calendar