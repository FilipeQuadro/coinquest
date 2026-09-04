export interface SelectedMonth {
  year: number
  month: number
}

const MIN_YEAR = 1970
const MAX_YEAR = 9999

export function monthFromDate(date = new Date()): SelectedMonth {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
  }
}

export function validateSelectedMonth(month: SelectedMonth): string | null {
  if (!Number.isInteger(month.year) || month.year < MIN_YEAR || month.year > MAX_YEAR) {
    return 'Ano invalido.'
  }

  if (!Number.isInteger(month.month) || month.month < 0 || month.month > 11) {
    return 'Mes invalido.'
  }

  return null
}

export function referenceDateFromMonth(month: SelectedMonth) {
  return new Date(month.year, month.month, 1, 12, 0, 0, 0)
}

export function nextMonth(month: SelectedMonth): SelectedMonth {
  if (month.month === 11) return { year: month.year + 1, month: 0 }
  return { year: month.year, month: month.month + 1 }
}

export function previousMonth(month: SelectedMonth): SelectedMonth {
  if (month.month === 0) return { year: month.year - 1, month: 11 }
  return { year: month.year, month: month.month - 1 }
}

export function addMonths(month: SelectedMonth, offset: number): SelectedMonth {
  const date = new Date(month.year, month.month + offset, 1, 12, 0, 0, 0)
  return monthFromDate(date)
}

export function isSameMonth(a: SelectedMonth, b: SelectedMonth) {
  return a.year === b.year && a.month === b.month
}

export function compareMonths(a: SelectedMonth, b: SelectedMonth) {
  return (a.year - b.year) || (a.month - b.month)
}

export function isMonthBefore(a: SelectedMonth, b: SelectedMonth) {
  return compareMonths(a, b) < 0
}

export function isMonthAfter(a: SelectedMonth, b: SelectedMonth) {
  return compareMonths(a, b) > 0
}

export function lastDayOfMonth(month: SelectedMonth) {
  return new Date(month.year, month.month + 1, 0, 12, 0, 0, 0).getDate()
}

export function clampDayToMonth(dayOfMonth: number, month: SelectedMonth) {
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1) return 1
  return Math.min(dayOfMonth, lastDayOfMonth(month))
}

export function plannedDateForMonth(dayOfMonth: number, month: SelectedMonth) {
  return new Date(month.year, month.month, clampDayToMonth(dayOfMonth, month), 12, 0, 0, 0)
}

export function isDateInMonth(isoDate: string, month: SelectedMonth) {
  const date = new Date(isoDate)
  return Number.isFinite(date.getTime()) && date.getFullYear() === month.year && date.getMonth() === month.month
}

export function formatMonthYear(month: SelectedMonth) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(referenceDateFromMonth(month))
}

export function formatMonthName(month: SelectedMonth) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(referenceDateFromMonth(month))
}

export function toMonthInputValue(month: SelectedMonth) {
  return `${month.year}-${String(month.month + 1).padStart(2, '0')}`
}

export function parseMonthInputValue(value: string): SelectedMonth | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return null

  const month = {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
  }

  return validateSelectedMonth(month) ? null : month
}

export function toDateInputValue(isoDate: string) {
  const date = new Date(isoDate)
  if (!Number.isFinite(date.getTime())) return ''

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function toTimeInputValue(isoDate: string) {
  const date = new Date(isoDate)
  if (!Number.isFinite(date.getTime())) return ''

  return [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ].join(':')
}

export function todayDateInputValue(date = new Date()) {
  return toDateInputValue(date.toISOString())
}

export function currentTimeInputValue(date = new Date()) {
  return toTimeInputValue(date.toISOString())
}

export function localDateTimeToIso(dateValue: string, timeValue = '12:00') {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue)
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue)

  if (!dateMatch || !timeMatch) return null

  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2]) - 1
  const day = Number(dateMatch[3])
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  const date = new Date(year, month, day, hour, minute, 0, 0)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null
  }

  return date.toISOString()
}
