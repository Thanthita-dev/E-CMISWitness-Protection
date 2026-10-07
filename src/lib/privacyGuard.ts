import { CaseItem, MethodPrivacy } from '../types/case'
import { UserRole } from '../types/user'
import { privacyWindow } from './episode'

/**
 * 08A-3 (WIT0831-0837) — บังคับใช้มาตรการปกปิดข้อมูลจริงที่จุดใช้งาน
 *
 * ฟิลด์ restrictSearch/restrictDownload/restrictPrint/restrictForward เดิมถูกเก็บไว้ในแฟ้มเฉย ๆ
 * โดยไม่มีจุดใดอ่านไปใช้ ที่นี่จึงเป็นแหล่งเดียวที่ทุกหน้า (ทะเบียน / แฟ้ม / แบบฟอร์ม) เรียกใช้ร่วมกัน
 * เพื่อไม่ให้แต่ละหน้าตีความมาตรการต่างกัน
 */

export type PrivacyAction = 'search' | 'download' | 'print' | 'forward'

const ACTION_FLAG: Record<PrivacyAction, keyof MethodPrivacy> = {
  search: 'restrictSearch',
  download: 'restrictDownload',
  print: 'restrictPrint',
  forward: 'restrictForward',
}

export const PRIVACY_ACTION_LABELS: Record<PrivacyAction, string> = {
  search: 'ค้นหาข้อมูลพยาน',
  download: 'ดาวน์โหลดเอกสาร',
  print: 'สั่งพิมพ์เอกสาร',
  forward: 'ส่งต่อข้อมูล',
}

/**
 * บทบาทที่ต้องคงสิทธิ์ขั้นต่ำไว้เสมอ แม้ตั้งค่ามาตรการปิดกั้นทุกบทบาท
 * เจ้าหน้าที่ผู้รับผิดชอบสำนวนต้องทำงานต่อได้ ไม่งั้นมาตรการปกปิดจะปิดกั้นเกินความจำเป็น
 */
export const PRIVACY_MINIMUM_ROLES: UserRole[] = ['officer', 'case_owner', 'admin']

/** มาตรการปกปิดที่ "มีผลอยู่จริง" ของสำนวนนี้ — active และยังไม่พ้นช่วงเวลาที่อนุมัติ */
export function activePrivacyPolicy(caseItem: Pick<CaseItem, 'methodTracks'>): Partial<MethodPrivacy> | undefined {
  const track = (caseItem.methodTracks || []).find((t) => t.method === 3)
  if (!track || track.status !== 'active' || !track.privacy) return undefined
  /** สิทธิ์ที่ให้ไว้สิ้นผลตามวันที่กำหนด — พ้นกำหนดแล้วถือว่ามาตรการไม่มีผลบังคับต่อ (WIT0836) */
  if (privacyWindow(track.privacy).expired) return undefined
  return track.privacy
}

/**
 * ผู้ใช้บทบาทนี้ถูกมาตรการปกปิดบล็อกการกระทำนี้หรือไม่
 * บล็อกเมื่อมีมาตรการที่มีผล + เปิดข้อจำกัดของการกระทำนั้น + บทบาทไม่อยู่ใน allowedRoles
 */
export function isPrivacyBlocked(
  caseItem: Pick<CaseItem, 'methodTracks'>,
  role: UserRole,
  action: PrivacyAction
): boolean {
  if (PRIVACY_MINIMUM_ROLES.includes(role)) return false
  const policy = activePrivacyPolicy(caseItem)
  if (!policy) return false
  if (!policy[ACTION_FLAG[action]]) return false
  const allowed = policy.allowedRoles || []
  return !allowed.includes(role)
}

/** ข้อความแจ้งผู้ใช้เมื่อถูกบล็อก — ใช้ถ้อยคำเดียวกันทุกหน้า */
export const privacyBlockedMessage = (action: PrivacyAction) =>
  `ข้อมูลสำนวนนี้อยู่ภายใต้มาตรการปกปิดข้อมูลพยาน — บัญชีของท่านไม่อยู่ในขอบเขตที่ได้รับอนุมัติให้${PRIVACY_ACTION_LABELS[action]}`
