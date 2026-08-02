import { api } from './client'

export interface CalendarTask {
  id: string
  title: string
  listId: string
  isCompleted: boolean
  dueDate: string
}

export interface CalendarJournal {
  id: string
  title: string
  mood: string | null
  date: string
}

export interface CalendarHabit {
  habitId: string
  habitName: string
}

export interface CalendarMood {
  weather: string
  note: string | null
}

export interface CalendarDay {
  tasks: CalendarTask[]
  journals: CalendarJournal[]
  habits: CalendarHabit[]
  focusMinutes: number
  focusCount: number
  moods: CalendarMood[]
  hasDigest: boolean
}

export interface CalendarMonthData {
  month: string
  days: Record<string, CalendarDay>
}

export const calendarApi = {
  getMonth: (month: string) =>
    api.get(`calendar/items?month=${month}`).json<CalendarMonthData>(),
}