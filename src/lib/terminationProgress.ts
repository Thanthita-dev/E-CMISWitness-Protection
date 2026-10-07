import { CaseItem } from '../types/case'
import { MethodProgress, MethodStep } from './methodProgress'
import { daysUntil } from './utils'

/**
 * ความคืบหน้าของกระบวนการยุติการคุ้มครอง แท็บ 11C → 11D (WIT1124-WIT1148)
 *
 * อนุมานจากข้อมูลจริงในแฟ้มทั้งหมด ไม่มี wizard ให้กดยืนยันเหมือนแท็บ 02/10
 * จึงอ่านจากร่องรอยที่แต่ละขั้นทิ้งไว้ — terminationTrigger / kb15.status /
 * terminationApproval / kb16.signedAt / kb17.dispatchedAt / kb17.deliveredAt / closedAt
 *
 * กฎ WIT1130 สะท้อนอยู่ในลำดับขั้น: การรับ คบ.7 หรือจัดทำ คบ.15 ยังไม่ทำให้คุ้มครองสิ้นสุด
 * ขั้น "ยุติ" จริงเกิดที่ WIT1139 (คำสั่ง คบ.16 ที่ลงนาม) เท่านั้น
 */
export interface TerminationProgress extends MethodProgress {
  /** เหตุที่กระบวนการเดินต่อไม่ได้ — ใช้แสดงใต้หมุดที่ค้าง */
  blockedReason?: string
}

export const getTerminationProgress = (caseItem: CaseItem): TerminationProgress => {
  const kb15 = caseItem.kb15
  const approval = caseItem.terminationApproval
  const kb16 = caseItem.kb16
  const kb17 = caseItem.kb17

  /** คบ.15 ที่ยังเป็นร่างหรือถูกส่งคืนแก้ไข ยังไม่นับว่า "จัดทำ" เสร็จ — ต้องเสนอขึ้นไปแล้ว (WIT1131) */
  const kb15Submitted = Boolean(kb15) && kb15!.status !== 'draft' && kb15!.status !== 'returned'

  const steps: MethodStep[] = [
    {
      code: 'WIT1125',
      label: 'บันทึกเหตุเริ่มยุติ',
      done: Boolean(caseItem.terminationTrigger) || Boolean(kb15),
    },
    { code: 'WIT1129', label: 'จัดทำ คบ.15', done: kb15Submitted },
    { code: 'WIT1134', label: 'เห็นชอบ · เสนอผู้มีอำนาจ', done: kb15?.status === 'endorsed' },
    { code: 'WIT1137', label: 'อนุมัติให้ยุติ', done: approval?.approved === true },
    { code: 'WIT1138', label: 'ร่างคำสั่ง คบ.16', done: Boolean(kb16) },
    { code: 'WIT1139', label: 'ลงนาม คบ.16', done: Boolean(kb16?.signedAt) },
    { code: 'WIT1142', label: 'ส่งหนังสือแจ้ง คบ.17', done: Boolean(kb17?.dispatchedAt) },
    { code: 'WIT1145', label: 'พยานรับจริง · เริ่มนับอุทธรณ์', done: Boolean(kb17?.deliveredAt) },
    {
      code: 'WIT1148',
      label: 'ปิดงานคุ้มครอง',
      done: Boolean(caseItem.closedAt) && caseItem.stage === 'terminated',
    },
  ]

  /** นับสะสมจากต้น หยุดที่ขั้นแรกที่ยังไม่เสร็จ — เหมือน getMethodProgress ไม่ให้ขั้นท้ายติ๊กข้ามขั้นหน้า */
  let doneCount = 0
  for (const s of steps) {
    if (!s.done) break
    doneCount += 1
  }

  let blockedIndex: number | undefined
  let blockedReason: string | undefined

  if (kb15?.status === 'returned') {
    blockedIndex = 1
    blockedReason = `คบ.15 ถูกส่งคืนแก้ไข${kb15.reviewNote ? ` — ${kb15.reviewNote}` : ''}`
  } else if (approval && !approval.approved) {
    blockedIndex = 3
    blockedReason = `ไม่อนุมัติให้ยุติ — คุ้มครองต่อภายใต้คำสั่งเดิม${approval.note ? ` · ${approval.note}` : ''}`
  } else if (caseItem.appealFiledAt && caseItem.appealAgainst === 'kb17' && !caseItem.appealResolution) {
    /** WIT1147 — มีอุทธรณ์คำสั่งยุติภายในกำหนด ปิดงานไม่ได้จนกว่าคณะกรรมการจะวินิจฉัย */
    blockedIndex = steps.length - 1
    blockedReason = 'มีอุทธรณ์คำสั่งยุติภายในกำหนด — รอผลวินิจฉัยก่อนปิดงาน'
  }

  return { steps, doneCount, total: steps.length, blockedIndex, blockedReason }
}

/** TC-151/TC-153 — ผลตรวจเงื่อนไขก่อนปิดงานคุ้มครอง (WIT1148) */
export interface CloseGuardResult {
  allowed: boolean
  /** เหตุผลที่ยังปิดงานไม่ได้ ทีละข้อ — ว่างเมื่อ allowed === true */
  reasons: string[]
  /** จำนวนวันที่เหลือก่อนพ้นกำหนดอุทธรณ์ (เมื่อเริ่มนับแล้วแต่ยังไม่พ้นกำหนด) */
  daysLeft?: number
}

/**
 * TC-151 — ปิดงานได้ต่อเมื่อ (พ้นกรอบอุทธรณ์ 30 วันนับจากวันรับจริง/ถือว่าได้รับ หรือมีผลอุทธรณ์แล้ว)
 * และไม่มีงานค้าง (รอบ คบ.13 ที่ยังไม่ปิดรอบ / คำขอขยายเวลาที่ยังไม่พิจารณาแล้วเสร็จ)
 *
 * TC-153 — ถ้ายังไม่มีวันรับจริงหรือวันที่ถือว่าได้รับตามระเบียบ ยังไม่เริ่มนับกรอบอุทธรณ์เลย
 * จึงปิดงานไม่ได้ไม่ว่ากรณีใด
 */
export const evaluateCloseGuard = (caseItem: CaseItem): CloseGuardResult => {
  const reasons: string[] = []
  const kb17 = caseItem.kb17
  const appealFiled = Boolean(caseItem.appealFiledAt) && caseItem.appealAgainst === 'kb17'
  const appealResolved = Boolean(caseItem.appealResolution)
  let daysLeft: number | undefined

  if (!kb17?.deliveredAt) {
    reasons.push('ยังไม่เริ่มนับกรอบอุทธรณ์ — ยังไม่มีวันที่พยานได้รับจริงหรือวันที่ถือว่าได้รับตามระเบียบ')
  } else if (!appealFiled) {
    const left = daysUntil(kb17.appealDueAt)
    if (left !== null && left >= 0 && !appealResolved) {
      daysLeft = left
      reasons.push(`เหลืออีก ${left} วันจึงพ้นกำหนดอุทธรณ์`)
    }
  } else if (!appealResolved) {
    reasons.push('มีอุทธรณ์คำสั่งยุติภายในกำหนด — รอผลวินิจฉัยก่อนปิดงาน')
  }

  /**
   * รอบ คบ.13 ที่ตรวจรับ/ลงนามครบแล้ว (พร้อมล็อกตาม WIT1010) แต่ยังไม่ถูกล็อก ถือเป็นงานค้างจริง
   * ส่วนรอบล่าสุดที่ยังไม่ถึงขั้นตรวจรับ/ลงนามเป็นรอบเปิดตามปกติระหว่างคุ้มครอง ไม่นับเป็นงานค้าง
   */
  const outstandingKb13Round = (caseItem.monthlyReports || []).some(
    (r) => Boolean(r.officerSignedAt && r.witnessSignedAt && r.reviewedAt && r.riskLevel) && !r.lockedAt
  )
  if (outstandingKb13Round) reasons.push('มีรอบรายงาน คบ.13 ที่ตรวจรับครบแล้วแต่ยังไม่ปิดรอบ (ค้างงาน)')

  const openExtension = (caseItem.extensionRequests || []).some(
    (r) => r.status === 'submitted' || r.status === 'pending'
  )
  if (openExtension) reasons.push('มีคำขอขยายเวลาคุ้มครองที่ยังไม่พิจารณาแล้วเสร็จ (ค้างงาน)')

  return { allowed: reasons.length === 0, reasons, daysLeft }
}
