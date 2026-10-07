import { CaseItem, MonthlyReport, ProtectionMethodNo } from '../types/case'
import { deriveEpisode, summarizeEpisode, EpisodeSummary } from './episode'
import { daysUntil } from './utils'

/**
 * แท็บ 10 — ติดตามและรายงานผลการคุ้มครอง (คบ.13) ตาม User_Flow v5 แท็บ 02 (WIT1001-WIT1013)
 *
 * โมดูลนี้อนุมาน "รอบรายงาน" จากข้อมูลจริงในแฟ้มเท่านั้น ไม่มี state แยกของหน้า:
 *  - รอบที่เปิดอยู่ = MonthlyReport ล่าสุดที่ยังไม่ถูกล็อก (WIT1010)
 *  - ล็อกแล้วถือว่ารอบนั้นปิด และรอบถัดไปเริ่มจาก WIT1004 ใหม่
 *
 * วันสะสมและเพดาน 180 วัน อ่านจาก episode.ts แหล่งเดียวกับหน้า 08A/11A/11B
 * เพื่อไม่ให้ยอดในหน้านี้ต่างจากหน้าอื่น (คิดจากวันเริ่มจริง ไม่ใช่วันอัปโหลดเอกสาร)
 */

export interface Kb13Step {
  /** รหัสกิจกรรมในผัง — ใช้อ้างกลับไปที่ผังเมื่อมีคำถามว่าขั้นนี้มาจากไหน */
  code: string
  label: string
  done: boolean
}

export interface Kb13Progress {
  steps: Kb13Step[]
  /** จำนวนขั้นที่ทำแล้ว — นับสะสมจากต้น หยุดที่ขั้นแรกที่ยังไม่เสร็จ */
  doneCount: number
  total: number
  /** ขั้นที่ค้างเพราะเงื่อนไขนอกเหนือการกรอกข้อมูล (เช่น ยังไม่มีวิธีใดเริ่มปฏิบัติจริง) */
  blockedIndex?: number
}

/** รอบรายงานที่ยังเปิดอยู่ — รอบล่าสุดที่ยังไม่ถูกล็อกตาม WIT1010 */
export const openKb13Round = (caseItem: Pick<CaseItem, 'monthlyReports'>): MonthlyReport | undefined => {
  const rounds = caseItem.monthlyReports || []
  const last = rounds[rounds.length - 1]
  return last && !last.lockedAt ? last : undefined
}

/** รอบล่าสุดที่ปิดแล้ว — ใช้เป็นฐานของ WIT1012 / WIT1013 */
export const lastLockedKb13Round = (caseItem: Pick<CaseItem, 'monthlyReports'>): MonthlyReport | undefined =>
  [...(caseItem.monthlyReports || [])].reverse().find((r) => Boolean(r.lockedAt))

/** WIT1005 ถือว่าจัดทำครบเมื่อมีช่วงรายงาน คำสั่ง/จำนวนวัน ผู้ปฏิบัติ และสรุปผลครบทุกช่อง */
export const isKb13RoundDrafted = (round?: MonthlyReport): boolean =>
  Boolean(round?.periodFrom && round?.periodTo && round?.orderRef && round?.operators && round?.summary)

export interface Kb13MethodMismatch {
  /** วิธีที่รายงานว่าปฏิบัติจริง แต่ไม่ได้รับอนุมัติ */
  extra: ProtectionMethodNo[]
  /** วิธีที่ได้รับอนุมัติ แต่ไม่ได้ปฏิบัติ/ไม่ได้รายงานในรอบนี้ */
  missing: ProtectionMethodNo[]
  matches: boolean
}

/**
 * WIT1008 — เทียบวิธีที่รายงานว่าปฏิบัติจริงกับวิธีที่ได้รับอนุมัติ
 * ไม่ตรงกันเมื่อมีวิธีใดวิธีหนึ่งอยู่ในฝั่งเดียว (รายงานแต่ไม่ได้อนุมัติ หรืออนุมัติแต่ไม่ได้รายงาน)
 */
export const compareKb13Methods = (
  approved: ProtectionMethodNo[] = [],
  reported: ProtectionMethodNo[] = []
): Kb13MethodMismatch => {
  const extra = reported.filter((m) => !approved.includes(m))
  const missing = approved.filter((m) => !reported.includes(m))
  return { extra, missing, matches: extra.length === 0 && missing.length === 0 }
}

export interface Kb13DueStatus {
  /** วันครบกำหนดรอบถัดไปที่ตั้งไว้ (WIT1003 / WIT1012) */
  dueAt?: string
  /** จำนวนวันที่เหลือถึงกำหนด — ติดลบคือเลยกำหนดแล้ว */
  daysLeft: number | null
  due: boolean
  overdue: boolean
  episode: EpisodeSummary
}

/**
 * WIT1003 — แจ้งรอบ คบ.13 ก่อนครบกำหนด และตรวจยอดสะสม TEMPORARY + MAIN รวมไม่เกินเพดาน
 * ถือว่า "ถึงรอบ" เมื่อเหลือไม่เกิน 7 วัน หรือเลยกำหนดแล้ว
 */
export const kb13DueStatus = (caseItem: CaseItem, asOf?: string | Date): Kb13DueStatus => {
  const dueAt = caseItem.nextReportDueAt
  const daysLeft = dueAt ? daysUntil(dueAt, asOf) : null
  return {
    dueAt,
    daysLeft,
    due: daysLeft !== null && daysLeft <= 7,
    overdue: daysLeft !== null && daysLeft < 0,
    episode: summarizeEpisode(caseItem.episode || deriveEpisode(caseItem), asOf),
  }
}

/**
 * WIT1011 — ใกล้ครบกำหนดหรือจำเป็นต้องทบทวน?
 * ต้องทบทวนเมื่อชนเพดานรวม ใกล้ชนเพดาน หรือรอบล่าสุดเสนอให้ทบทวน (ระดับความเสี่ยงสูงขึ้น)
 */
export const needsReview = (caseItem: CaseItem, asOf?: string | Date): boolean => {
  const { episode, overdue } = kb13DueStatus(caseItem, asOf)
  if (episode.atCap || episode.nearCap) return true
  if (overdue) return true
  const last = lastLockedKb13Round(caseItem)
  return last?.riskLevel === 'สูง' || last?.riskLevel === 'วิกฤต'
}

/**
 * ความคืบหน้าของรอบรายงานปัจจุบัน (WIT1001-WIT1013)
 *
 * ขั้นสองขั้นแรกเป็นข้อมูลที่ระบบแสดงให้เอง จึงเสร็จทันทีที่มี Episode ที่เริ่มจริงแล้ว
 * ถ้ายังไม่มีวิธีใดเริ่มปฏิบัติจริง (ยังไม่มี Episode) ให้ค้างที่ WIT1001 — ยังติดตามอะไรไม่ได้
 */
export const getKb13Progress = (caseItem: CaseItem, asOf?: string | Date): Kb13Progress => {
  const episode = caseItem.episode || deriveEpisode(caseItem)
  const hasEpisode = Boolean(episode?.phases?.length)
  const round = openKb13Round(caseItem)
  /** รอบที่เพิ่งล็อกไปถือว่าผ่านทุกขั้นของรอบนั้นแล้ว — ใช้ตัดสินขั้นท้ายเมื่อไม่มีรอบเปิดอยู่ */
  const closed = round ? undefined : lastLockedKb13Round(caseItem)
  const active = round || closed

  const steps: Kb13Step[] = [
    { code: 'WIT1001', label: 'รับ Episode เดียว (TEMPORARY/MAIN)', done: hasEpisode },
    { code: 'WIT1002', label: 'แสดง Phase และวันสะสมต่อเนื่อง', done: hasEpisode },
    {
      code: 'WIT1003',
      label: 'แจ้งรอบ คบ.13 และตรวจเพดานรวม',
      done: Boolean(caseItem.nextReportDueAt) || (caseItem.monthlyReports || []).length > 0,
    },
    { code: 'WIT1004', label: 'รวบรวมผลทุกวิธีเข้ารอบรายงาน', done: Boolean(active) },
    { code: 'WIT1005', label: 'จัดทำ คบ.13 ของรอบนี้', done: isKb13RoundDrafted(active) },
    { code: 'WIT1006', label: 'เจ้าหน้าที่ผู้ปฏิบัติลงนาม', done: Boolean(active?.officerSignedAt) },
    { code: 'WIT1007', label: 'พยานลงนามรับรอง', done: Boolean(active?.witnessSignedAt) },
    { code: 'WIT1008', label: 'รับและตรวจผลเทียบวิธีที่อนุมัติ', done: Boolean(active?.reviewedAt) },
    { code: 'WIT1009', label: 'บันทึกสถานะล่าสุดและข้อเสนอ', done: Boolean(active?.riskLevel) },
    { code: 'WIT1010', label: 'ล็อกฉบับลงนามเป็นรอบรายงานใหม่', done: Boolean(active?.lockedAt) },
    { code: 'WIT1011', label: 'ประเมินว่าต้องทบทวนหรือไม่', done: Boolean(caseItem.nextReportDueAt || caseItem.reviewHandoff) },
    { code: 'WIT1012', label: 'กำหนดรอบ คบ.13 ถัดไป', done: Boolean(caseItem.nextReportDueAt) },
    { code: 'WIT1013', label: 'ส่งเข้าทบทวนผลการคุ้มครอง', done: Boolean(caseItem.reviewHandoff) },
  ]

  /**
   * WIT1012 กับ WIT1013 เป็นสองแขนงของ WIT1011 — เดินแขนงใดแขนงหนึ่งก็ถือว่าจบรอบ
   * ถ้าไม่เติมให้ครบ แถบความคืบหน้าจะค้างที่ขั้นรองสุดท้ายตลอดทั้งที่รอบนั้นปิดไปแล้ว
   */
  if (caseItem.reviewHandoff) {
    steps[11] = { ...steps[11], done: true }
  }

  const firstPending = steps.findIndex((s) => !s.done)
  const doneCount = firstPending === -1 ? steps.length : firstPending
  return {
    steps,
    doneCount,
    total: steps.length,
    blockedIndex: hasEpisode ? undefined : 0,
  }
}
