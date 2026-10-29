import type { CaseItem } from '../types/case'
import { deriveEpisode } from './episode'
import { isExternalRound, isKb13RoundReadyToReceive } from './kb13'

export interface MonthlyReportStats {
  underProtection: number
  kb13: number
  external: number
  pending: number
}

// period เก็บได้ทั้ง 'MM/พ.ศ.' (currentReportPeriod) และ 'YYYY-MM' → แปลงเป็น 'YYYY-MM' (ค.ศ.) ก่อนเทียบ
const normalizePeriod = (period: string) => {
  if (/^\d{4}-\d{2}$/.test(period)) return period
  const [month, year] = period.split('/').map(Number)
  return month && year ? `${year > 2400 ? year - 543 : year}-${String(month).padStart(2, '0')}` : period
}

// อยู่ระหว่างคุ้มครอง = มี Episode ที่เริ่มจริงแล้วและยังไม่ปิด (ฐานเดียวกับแท็บ 10) — ไม่อิงข้อความ status ที่มีหลายแบบ
export const isUnderProtection = (c: CaseItem) => {
  const episode = deriveEpisode(c)
  return Boolean(episode?.phases?.length) && !episode?.closedAt && !c.closedAt
}

/** นับสถานะรายงานรอบเดือน `period` ของเรื่องที่อยู่ระหว่างคุ้มครอง (คบ.13 / หนังสือภายนอก / ค้าง) */
export function monthlyReportStats(cases: CaseItem[], period: string): MonthlyReportStats {
  const target = normalizePeriod(period)
  const stats: MonthlyReportStats = { underProtection: 0, kb13: 0, external: 0, pending: 0 }
  for (const c of cases) {
    if (!isUnderProtection(c)) continue
    stats.underProtection += 1
    // นับว่าได้รับแล้วเมื่อรายงานพร้อมตรวจรับ (คบ.13 ลงนามครบ / บันทึกรับหนังสือพร้อมไฟล์) — แค่เปิดรอบยังถือว่าค้าง
    const rounds = (c.monthlyReports || []).filter((r) => normalizePeriod(r.period) === target)
    const received = rounds.find((r) => r.lockedAt || r.reviewedAt || isKb13RoundReadyToReceive(r))
    if (!received) stats.pending += 1
    else if (isExternalRound(received)) stats.external += 1
    else stats.kb13 += 1
  }
  return stats
}
