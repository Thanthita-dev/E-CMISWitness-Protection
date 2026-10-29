import { CaseItem, TerminationClause, TerminationTrigger } from '../types/case'
import { TERMINATION_CLAUSES } from './constants'
import { MethodProgress, MethodStep } from './methodProgress'
import { terminationEffectiveAt } from './terminationRules'

/** ไม่อนุมานเหตุหลักจากแหล่งที่มาของเรื่อง */
export const defaultTerminationClause = (_source?: TerminationTrigger['source']): TerminationClause | undefined => undefined

export const terminationClauseLabel = (clause?: TerminationClause): string | undefined =>
  TERMINATION_CLAUSES.find((c) => c.value === clause)?.label

/** แปลงข้อความที่เลือกในแบบ คบ.15 (เก็บเป็น label) กลับเป็นเลขข้อ */
export const terminationClauseFromLabel = (label?: string): TerminationClause | undefined =>
  TERMINATION_CLAUSES.find((c) => c.label === label)?.value

/** รับคำร้องไว้ตรวจพิจารณา แยกจากข้อความแจ้งสิทธิในแม่แบบ */
export const isTerminationAppealable = (caseItem: Pick<CaseItem, 'kb15'>): boolean => {
  // รับคำอุทธรณ์ไว้ตรวจได้ทุกเหตุ ไม่ใช้ข้อกำกับการพิมพ์ คบ.17 มาปิดกั้นการรับคำร้อง
  void caseItem
  return true
}

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

  /** คบ.15 ที่ยังเป็นร่างหรือถูกส่งคืนแก้ไข ยังไม่นับว่า "จัดทำ" เสร็จ — ต้องเสนอขึ้นไปแล้ว (WIT1129 จัดทำและส่งตรวจ) */
  const kb15Submitted = Boolean(kb15) && kb15!.status !== 'draft' && kb15!.status !== 'returned'
  /** ข้อมูลเดิมก่อนมีลำดับชั้นไม่มี approvalHistory — คบ.15 ที่เลขาธิการลงนามแล้วถือว่าผ่านทุกชั้น */
  const kb15Signed = (role: 'supervisor' | 'director' | 'deputy_secretary') =>
    kb15?.status === 'endorsed' ||
    (kb15?.status === 'submitted' && (kb15.approvalHistory || []).some((h) => h.role === role && h.endorsed))

  const steps: MethodStep[] = [
    {
      code: 'WIT1125',
      label: 'บันทึกเหตุเริ่มยุติ',
      done: Boolean(caseItem.terminationTrigger) || Boolean(kb15),
    },
    { code: 'WIT1129', label: 'จัดทำ คบ.15', done: kb15Submitted },
    /** ลงนาม คบ.15 ตามลำดับชั้น: ผอ.กอง/สำนัก → รองเลขาธิการ → เลขาธิการ */
    { code: 'KB15-SUPERVISOR', label: 'ผบช.ชั้นต้น ลงนาม คบ.15', done: kb15Signed('supervisor') },
    { code: 'WIT1134', label: 'ผอ.กอง/สำนัก ลงนาม คบ.15', done: kb15Signed('director') },
    { code: 'WIT1163', label: 'รองเลขาธิการ ลงนาม คบ.15', done: kb15Signed('deputy_secretary') },
    { code: 'WIT1162', label: 'เลขาธิการพิจารณาและลงนาม คบ.15', done: kb15?.status === 'endorsed' && approval?.approved === true },
    { code: 'WIT1138', label: 'ร่างคำสั่ง คบ.16', done: Boolean(kb16) },
    { code: 'WIT1139', label: 'ลงนาม คบ.16', done: Boolean(kb16?.signedAt) },
    { code: 'WIT1142', label: 'ส่งหนังสือแจ้ง คบ.17', done: Boolean(kb17?.dispatchedAt) },
    /** ทุกเหตุต้องบันทึกการรับแจ้ง */
    { code: 'WIT1145', label: 'บันทึกการรับแจ้ง', done: Boolean(kb17?.deliveredAt) },
    {
      code: 'WIT1148',
      label: 'ปิดงานเอกสารสิ้นสุด',
      done: Boolean(caseItem.terminationDocumentsClosedAt),
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
    blockedIndex = steps.findIndex((s) => s.code === 'WIT1162')
    blockedReason = `ไม่อนุมัติให้ยุติ — คุ้มครองต่อภายใต้คำสั่งเดิม${approval.note ? ` · ${approval.note}` : ''}`
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

/** ปิดเฉพาะงานเอกสารเมื่อครบคำสั่งและหลักฐานรับแจ้ง ไม่ปิดงานส่งต่อ/อุทธรณ์ */
export const evaluateCloseGuard = (caseItem: CaseItem): CloseGuardResult => {
  const reasons: string[] = []
  const kb17 = caseItem.kb17
  if (!caseItem.kb16?.signedAt) reasons.push('ยังไม่มีคำสั่ง คบ.16 ที่ลงนามแล้ว')
  if (!terminationEffectiveAt(caseItem)) reasons.push('ยังไม่ถึงวันที่สิ้นสุดหรือยังตรวจฐานเหตุไม่ครบ')
  if (!kb17?.signedAt || !kb17.dispatchedAt) reasons.push('ยังไม่ได้นำส่ง คบ.17 ฉบับลงนาม')
  if (!kb17?.deliveredAt || !kb17.receiptEvidence) reasons.push('ยังไม่มีวันรับแจ้งและหลักฐานการรับแจ้ง')
  return { allowed: reasons.length === 0, reasons }
}
