import { describe, expect, it } from 'vitest'
import {
  isDateInMonth,
  clampDayToMonth,
  compareMonths,
  localDateTimeToIso,
  monthFromDate,
  nextMonth,
  parseMonthInputValue,
  plannedDateForMonth,
  previousMonth,
  referenceDateFromMonth,
  toDateInputValue,
  toMonthInputValue,
  toTimeInputValue,
  validateSelectedMonth,
} from './month'

describe('SelectedMonth helpers', () => {
  it('creates a selected month from a local Date', () => {
    expect(monthFromDate(new Date(2026, 7, 29, 9, 30))).toEqual({ year: 2026, month: 7 })
  })

  it('navigates from August to September', () => {
    expect(nextMonth({ year: 2026, month: 7 })).toEqual({ year: 2026, month: 8 })
    expect(previousMonth({ year: 2026, month: 8 })).toEqual({ year: 2026, month: 7 })
  })

  it('handles December to January', () => {
    expect(nextMonth({ year: 2026, month: 11 })).toEqual({ year: 2027, month: 0 })
  })

  it('handles January to previous December', () => {
    expect(previousMonth({ year: 2026, month: 0 })).toEqual({ year: 2025, month: 11 })
  })

  it('uses a local noon reference date to avoid date-only timezone drift', () => {
    const referenceDate = referenceDateFromMonth({ year: 2026, month: 7 })

    expect(referenceDate.getFullYear()).toBe(2026)
    expect(referenceDate.getMonth()).toBe(7)
    expect(referenceDate.getDate()).toBe(1)
    expect(referenceDate.getHours()).toBe(12)
  })

  it('builds ISO timestamps from local date and time input values', () => {
    const iso = localDateTimeToIso('2026-08-31', '23:45')

    expect(iso).toBeTruthy()
    expect(toDateInputValue(iso ?? '')).toBe('2026-08-31')
    expect(toTimeInputValue(iso ?? '')).toBe('23:45')
  })

  it('rejects invalid local dates', () => {
    expect(localDateTimeToIso('2026-02-31', '10:00')).toBeNull()
    expect(localDateTimeToIso('2026-08-10', '25:00')).toBeNull()
  })

  it('checks date membership by selected month', () => {
    const iso = localDateTimeToIso('2026-09-01', '10:00') ?? ''

    expect(isDateInMonth(iso, { year: 2026, month: 8 })).toBe(true)
    expect(isDateInMonth(iso, { year: 2026, month: 7 })).toBe(false)
  })

  it('compares selected months without translated strings', () => {
    expect(compareMonths({ year: 2026, month: 7 }, { year: 2026, month: 7 })).toBe(0)
    expect(compareMonths({ year: 2026, month: 8 }, { year: 2026, month: 7 })).toBeGreaterThan(0)
    expect(compareMonths({ year: 2025, month: 11 }, { year: 2026, month: 0 })).toBeLessThan(0)
  })

  it('formats and parses month input values', () => {
    expect(toMonthInputValue({ year: 2026, month: 8 })).toBe('2026-09')
    expect(parseMonthInputValue('2026-09')).toEqual({ year: 2026, month: 8 })
    expect(parseMonthInputValue('2026-13')).toBeNull()
  })

  it('clamps planned day to the valid last day of the month', () => {
    expect(clampDayToMonth(31, { year: 2027, month: 1 })).toBe(28)
    expect(clampDayToMonth(31, { year: 2028, month: 1 })).toBe(29)
    expect(new Date(plannedDateForMonth(31, { year: 2026, month: 8 })).getDate()).toBe(30)
  })

  it('validates month bounds', () => {
    expect(validateSelectedMonth({ year: 2026, month: 0 })).toBeNull()
    expect(validateSelectedMonth({ year: 2026, month: 12 })).toBe('Mes invalido.')
    expect(validateSelectedMonth({ year: 1969, month: 0 })).toBe('Ano invalido.')
  })
})
