import { describe, it, expect } from 'vitest'
import type { CaseItem, MonthlyReport } from '../types/case'
import { monthlyReportStats } from './monthlyReportStats'

const round = (period: string, extra: Partial<MonthlyReport> = {}): MonthlyReport => ({
  id: period + (extra.source || 'kb13'), period, submittedAt: '', submittedBy: '', summary: '', incidentCount: 0, ...extra,
})
const signed = { officerSignedAt: 'x', witnessSignedAt: 'x' }
const letter = { agency: 'สภ.เมือง', letterNo: '1', letterDate: '', receivedAt: '', receiveNo: '', documentName: 'a.pdf', documentUrl: 'data:', recordedAt: '', recordedBy: '' }
const mk = (no: string, monthlyReports?: MonthlyReport[], protectedNow = true) =>
  ({ no, monthlyReports, actualStartedAt: protectedNow ? '2026-09-01' : undefined }) as unknown as CaseItem

describe('monthlyReportStats', () => {
  it('นับ คบ.13 / หนังสือภายนอก / ค้าง และข้ามเรื่องที่ไม่ได้คุ้มครอง', () => {
    const cases = [
      mk('A', [round('10/2569', signed)]),
      mk('B', [round('2026-10', { source: 'external', externalLetter: letter })]),
      mk('C', [round('09/2569', signed)]),
      mk('D'),
      mk('E', [round('10/2569', signed)], false),
      mk('F', [round('10/2569')]),
      mk('G', [round('10/2569', { source: 'external' })]),
      { ...mk('H', [round('10/2569', signed)]), closedAt: '2026-10-02' } as CaseItem,
    ]
    // F/G เปิดรอบแล้วแต่ยังไม่ลงนาม/ยังไม่บันทึกหนังสือ จึงยังค้าง
    expect(monthlyReportStats(cases, '10/2569')).toEqual({ underProtection: 6, kb13: 1, external: 1, pending: 4 })
  })
})
