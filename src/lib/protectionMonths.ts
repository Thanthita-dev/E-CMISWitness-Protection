import type { CaseItem } from '../types/case'
import { parseAnyDate } from './utils'

/** Calendar arithmetic in Bangkok; clamps Jan 31 + 1 month to February's last day. */
export function calendarDate(value: string | Date): string {
  const date = parseAnyDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
export function addProtectionMonths(value: string | Date, months: number): string {
  const [y, m, d] = calendarDate(value).split('-').map(Number)
  if (!y || !m || !d) return ''
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}
export const protectionMonths = (c: Pick<CaseItem, 'protectionMonths' | 'protectionDays'>) => c.protectionMonths ?? (c.protectionDays ? Number((c.protectionDays / 30).toFixed(1)) : 0)
export const monthLabel = (months: number) => `${Number(months.toFixed(1))} เดือน`
export const legacyMonthLabel = (days: number) => monthLabel(days / 30)
export function calendarDays(from: string, to: string): number {
  return Math.round((Date.parse(`${calendarDate(to)}T00:00:00Z`) - Date.parse(`${calendarDate(from)}T00:00:00Z`)) / 86400000)
}

export function calendarMonthsBetween(from: string | Date, to: string | Date): number {
  const start = calendarDate(from), end = calendarDate(to)
  if (!start || !end || end <= start) return 0
  const [sy, sm] = start.split('-').map(Number), [ey, em] = end.split('-').map(Number)
  let whole = (ey - sy) * 12 + em - sm
  if (addProtectionMonths(start, whole) > end) whole--
  const anchor = addProtectionMonths(start, whole), next = addProtectionMonths(start, whole + 1)
  return whole + calendarDays(anchor, end) / Math.max(1, calendarDays(anchor, next))
}
