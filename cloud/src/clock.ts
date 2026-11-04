// Times in the site's own time zone, worked out with the platform's Intl, so no date library is needed.
// This file imports nothing, so automations.ts, mcp.ts and the back office can all use it.

export const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Weekday = (typeof weekdays)[number]

const shortDays: Record<string, Weekday> = { Fri: 'fri', Mon: 'mon', Sat: 'sat', Sun: 'sun', Thu: 'thu', Tue: 'tue', Wed: 'wed' }

// Making a formatter costs far more than using one, and the free plan allows only 10 ms of processor time.
const formats = new Map<string, Intl.DateTimeFormat>()
const formatFor = (zone: string) => {
  let format = formats.get(zone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { day: '2-digit', hour: '2-digit', hourCycle: 'h23', minute: '2-digit', month: '2-digit', timeZone: zone, weekday: 'short', year: 'numeric' })
    formats.set(zone, format)
  }
  return format
}

/** An IANA name such as Asia/Bangkok or UTC that this platform knows. */
export function validTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length > 64 || !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(zone)) return false
  try {
    formatFor(zone)
    return true
  } catch {
    return false
  }
}

/** The site's time zone, or UTC when none is set. */
export const zoneOf = (settings: { timeZone?: string } | null | undefined) => (validTimeZone(settings?.timeZone) ? settings!.timeZone! : 'UTC')

export type Local = { date: string; day: number; hour: number; minute: number; month: number; time: string; weekday: Weekday; year: number }

/** What a wall clock in the zone shows at this moment. */
export function localTime(ms: number, zone: string): Local {
  const parts: Record<string, string> = {}
  for (const part of formatFor(zone).formatToParts(new Date(ms))) parts[part.type] = part.value
  const [year, month, day, hour, minute] = [parts.year, parts.month, parts.day, parts.hour, parts.minute].map(Number)
  const pad = (value: number) => String(value).padStart(2, '0')
  return { date: `${year}-${pad(month)}-${pad(day)}`, day, hour: hour % 24, minute, month, time: `${pad(hour % 24)}:${pad(minute)}`, weekday: shortDays[parts.weekday] ?? 'mon', year }
}

/** The moment a date and wall-clock time happen in the zone. Checked twice, so it stays right across a summer time change. */
export function zonedTime(date: string, time: string, zone: string) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  const offset = (ms: number) => {
    const local = localTime(ms, zone)
    return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - Math.floor(ms / 60_000) * 60_000
  }
  const first = wall - offset(wall)
  return wall - offset(first)
}

export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
/** A calendar date's weekday, the same in every time zone. */
export const weekdayOf = (date: string) => weekdays[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]
const daysInMonth = (date: string) => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate()

export type Schedule =
  | { at: string; on: 'every_day'; weekdays?: Weekday[] }
  | { at: string; on: 'every_week'; weekday: Weekday }
  | { at: string; day: number; on: 'every_month' }
  | { at?: string; days: number; field: string; on: 'date_field'; side?: 'after' | 'before'; table: string }

export const scheduleKinds = ['every_day', 'every_week', 'every_month', 'date_field'] as const
export const isSchedule = (trigger: { on: string }): trigger is Schedule => (scheduleKinds as readonly string[]).includes(trigger.on)
/** Date reminders check once a day at this time. */
export const timeOf = (schedule: Schedule) => schedule.at ?? '09:00'

function fits(schedule: Schedule, date: string) {
  if (schedule.on === 'every_day') return !schedule.weekdays?.length || schedule.weekdays.includes(weekdayOf(date))
  if (schedule.on === 'every_week') return weekdayOf(date) === schedule.weekday
  // Day 31 means the last day in shorter months, so a monthly report never skips a month.
  if (schedule.on === 'every_month') return Number(date.slice(8, 10)) === Math.min(schedule.day, daysInMonth(date))
  return true
}

/** The first time the schedule is due after this moment. */
export function nextRun(schedule: Schedule, zone: string, after: number) {
  const start = localTime(after, zone).date
  // A month is the longest gap, so 70 days is always enough.
  for (let index = 0; index < 70; index++) {
    const date = addDays(start, index)
    if (!fits(schedule, date)) continue
    const at = zonedTime(date, timeOf(schedule), zone)
    if (at > after) return at
  }
  return null
}

/** The next few times, for a person to read. */
export function nextRuns(schedule: Schedule, zone: string, after: number, count = 3) {
  const times: number[] = []
  let from = after
  while (times.length < count) {
    const next = nextRun(schedule, zone, from)
    if (next === null) break
    times.push(next)
    from = next
  }
  return times
}

/** A moment as the owner reads it: 2026-05-01 09:00 (Asia/Bangkok). */
export const shownTime = (ms: number, zone: string) => {
  const local = localTime(ms, zone)
  return `${local.date} ${local.time} (${zone})`
}

/** The date a date reminder looks for on a given day: the day of the booking is that many days later, or earlier for a follow-up. */
export const targetDate = (schedule: Extract<Schedule, { on: 'date_field' }>, today: string) => addDays(today, schedule.side === 'after' ? -schedule.days : schedule.days)

export type Added = 'last_30_days' | 'last_7_days' | 'last_month' | 'this_month' | 'today' | 'yesterday'

/** The start and end, in UTC as the database stores times, of a period in the site's time zone. */
export function period(added: Added, now: number, zone: string): [string, string] {
  const today = localTime(now, zone).date
  const iso = (ms: number) => new Date(ms).toISOString()
  const midnight = (date: string) => iso(zonedTime(date, '00:00', zone))
  const firstOf = (date: string) => `${date.slice(0, 8)}01`
  const end = iso(now + 1)
  switch (added) {
    case 'today':
      return [midnight(today), end]
    case 'yesterday':
      return [midnight(addDays(today, -1)), midnight(today)]
    case 'last_7_days':
      return [iso(now - 7 * 86_400_000), end]
    case 'last_30_days':
      return [iso(now - 30 * 86_400_000), end]
    case 'this_month':
      return [midnight(firstOf(today)), end]
    case 'last_month':
      return [midnight(firstOf(addDays(firstOf(today), -1))), midnight(firstOf(today))]
  }
}
