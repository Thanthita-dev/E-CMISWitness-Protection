import type { CaseItem } from '../types/case'
import { addProtectionMonths } from './protectionMonths'
import { addDays, parseAnyDate } from './utils'

export function protectionSchedule(c: CaseItem) {
  const co = c.methodTracks?.find((t) => t.method === 4)?.coordination
  const actualStart = parseAnyDate(co?.operationStartedAt || c.actualStartedAt || co?.handoverCompletedAt)
  const start = actualStart || parseAnyDate(c.kb9SignedAt || c.secretarySignedAt || co?.acceptedAt)
  const end = parseAnyDate(c.protectionEndAt) || (start && c.protectionDays ? parseAnyDate(c.protectionMonths ? addProtectionMonths(start, c.protectionMonths) : addDays(start, c.protectionDays)) : null)
  const periods: string[] = []
  if (start && end) {
    const month = new Date(start.getFullYear(), start.getMonth(), 1)
    const last = new Date(end.getFullYear(), end.getMonth(), 1)
    while (month <= last && periods.length < 240) {
      periods.push(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`)
      month.setMonth(month.getMonth() + 1)
    }
  }
  return { start, actualStart, end, periods, provisional: !actualStart }
}
