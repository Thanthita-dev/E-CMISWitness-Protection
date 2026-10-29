import { CaseItem } from '../types/case'

/**
 * ลำดับงานของเจ้าของสำนวนหลัง ผอ.สำนัก/กอง มอบหมาย (ใช้ร่วมกันระหว่างแฟ้ม การ์ดคดีหลัก และการ์ดส่งงาน)
 *
 *   คบ.1 → เชื่อมโยงคดีหลัก → กลั่นกรองความเร่งด่วน (ปกติ / เร่งด่วน) → คบ.3 → คบ.6 หรือ คบ.4/คบ.5
 *
 * รับเรื่องเป็น คบ.1 ตั้งแต่ต้น = คบ.1 เสร็จก่อน ผอ. มอบหมาย · รับเป็นคำร้อง/คบ.2 = เจ้าของสำนวนจัดทำ คบ.1 หลังมอบหมาย
 * เจ้าหน้าที่รับเรื่องเอง = เชื่อมโยงคดีหลักแล้วตั้งแต่ขั้นรับเรื่อง จึงข้ามไปกลั่นกรองหลัง คบ.1 · ธุรการรับ = เจ้าของสำนวนเชื่อมโยงหลัง คบ.1
 * การกลั่นกรองต้องรอข้อมูลจาก คบ.1 เพราะก่อนหน้านั้นเจ้าหน้าที่ยังไม่ได้สอบถามข้อเท็จจริงจากพยาน
 */

/** ขั้นที่ลำดับงานนี้ยังมีผล — พ้น staff_review แล้วถือว่าทำครบทุกขั้นแล้ว */
const SEQUENCE_STAGES = ['receiver_intake', 'officer_intake', 'director_assign', 'staff_review']

/** จัดทำ คบ.1 แล้วหรือยัง */
export const kb1Completed = (caseItem: Pick<CaseItem, 'stage' | 'kb1CompletedAt'>): boolean =>
  Boolean(caseItem.kb1CompletedAt) || !SEQUENCE_STAGES.includes(caseItem.stage)

/** เชื่อมโยงคดีหลักแล้ว หรือบันทึกเหตุผล "ไม่พบคดี" แล้ว */
export const mainCaseResolved = (caseItem: Pick<CaseItem, 'linkedMainCaseId' | 'mainCaseNotFound'>): boolean =>
  Boolean(caseItem.linkedMainCaseId || caseItem.mainCaseNotFound)

/** กลั่นกรองความเร่งด่วนแล้วหรือยัง */
export const urgencyScreened = (caseItem: Pick<CaseItem, 'urgencyAssessedAt' | 'urgency'>): boolean =>
  Boolean(caseItem.urgencyAssessedAt || caseItem.urgency)

/** เชื่อมโยงคดีหลักได้เมื่อจัดทำ คบ.1 แล้ว */
export const canResolveMainCaseNow = (caseItem: CaseItem): boolean => kb1Completed(caseItem)

/** กลั่นกรองได้เมื่อจัดทำ คบ.1 และเชื่อมโยงคดีหลัก (หรือบันทึก "ไม่พบคดี") แล้ว */
export const canScreenUrgencyNow = (caseItem: CaseItem): boolean =>
  kb1Completed(caseItem) && mainCaseResolved(caseItem)

/** คบ.3 (รวมถึงการกดข้าม) เปิดได้เมื่อกลั่นกรองแล้ว — นอกขั้นเจ้าของสำนวนไม่บังคับลำดับนี้ */
export const kb3Unlocked = (caseItem: CaseItem): boolean =>
  caseItem.stage !== 'staff_review' || urgencyScreened(caseItem)

/** ขั้นถัดไปที่ยังค้างของเจ้าของสำนวน — ใช้แสดงข้อความนำทางในแฟ้ม (null = ผ่านลำดับนี้แล้ว) */
export const nextSequenceStep = (caseItem: CaseItem): 'kb1' | 'main_case' | 'screening' | null => {
  if (caseItem.stage !== 'staff_review') return null
  if (!kb1Completed(caseItem)) return 'kb1'
  if (!mainCaseResolved(caseItem)) return 'main_case'
  if (!urgencyScreened(caseItem)) return 'screening'
  return null
}
