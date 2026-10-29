import type { CaseItem, CoordinationLetterNumbering } from '../types/case'
import type { UserRole } from '../types/user'
import { ECMIS_USER_DIRECTORY, ORG_UNITS } from './constants'
import { GOT_UNIT_NAME } from './protectionHandoff'

/**
 * ธุรการหน่วยเจ้าของเรื่องออกเลขหนังสือประสาน (ขาออก) ของวิธีที่ 4
 * เจ้าหน้าที่จัดทำหนังสือ → ส่งธุรการออกเลข → ธุรการออกเลข/วันที่ (หรือส่งคืนแก้ไข) → เจ้าหน้าที่หรือธุรการกดนำส่ง
 * งานของธุรการอยู่ในคิวทะเบียนสารบรรณ (/saraban) แยกจากชุดนำส่ง คบ. (sarabanDispatch)
 */

type Method4Scope = Pick<CaseItem, 'methodTracks'>

export const letterNumberingOf = (c: Method4Scope | null | undefined): CoordinationLetterNumbering | undefined =>
  c?.methodTracks?.find((t) => t.method === 4)?.coordination?.letterNumbering

/** ธุรการยังมีงานค้าง — ออกเลข หรือนำส่งหลังออกเลข */
export const letterNumberingOpen = (n?: CoordinationLetterNumbering): n is CoordinationLetterNumbering =>
  n?.status === 'pending' || n?.status === 'numbered'

/** เจ้าหน้าที่แก้หนังสือไม่ได้ตั้งแต่ส่งธุรการจนนำส่ง — แก้ได้อีกเมื่อธุรการส่งคืน */
export const letterLockedForOfficer = (n?: CoordinationLetterNumbering) => n?.status === 'pending' || n?.status === 'numbered' || n?.status === 'sent'

const isCentralUnit = (id?: string | null) => Boolean(ORG_UNITS.find((u) => u.id === id)?.isCentral)

export const letterClerkUnitName = (n: Pick<CoordinationLetterNumbering, 'clerkRole' | 'unitId'>): string =>
  n.clerkRole === 'got_receiver' ? GOT_UNIT_NAME : ORG_UNITS.find((u) => u.id === n.unitId)?.name || 'สำนัก/กอง'

/** ธุรการผู้รับผิดชอบ — ใช้เป็นชื่อผู้ดำเนินการเมื่อ Admin สาธิตแทน */
export const letterClerkAccount = (n: Pick<CoordinationLetterNumbering, 'clerkRole' | 'unitId'>) => {
  const active = ECMIS_USER_DIRECTORY.filter((u) => u.active && u.roles.includes(n.clerkRole))
  if (n.clerkRole !== 'receiver') return active[0]
  return active.find((u) => u.orgUnitId === n.unitId)
    || (isCentralUnit(n.unitId) ? active.find((u) => isCentralUnit(u.orgUnitId)) : undefined)
    || active[0]
}

/** บทบาทนี้เป็นธุรการของหน่วยที่ต้องออกเลข (ธุรการ เขต 1 ไม่เห็นงานของส่วนกลาง) — ไม่ระบุหน่วย = ไม่ตรวจ */
const isLetterClerk = (role: UserRole, n: CoordinationLetterNumbering, orgUnitId?: string | null) => {
  if (role !== n.clerkRole) return false
  if (role !== 'receiver' || !orgUnitId) return true
  return orgUnitId === n.unitId || (isCentralUnit(orgUnitId) && isCentralUnit(n.unitId))
}

/** ออกเลข / ส่งคืน / นำส่ง ในฐานะธุรการ */
export const canActAsLetterClerk = (role: UserRole, c: Method4Scope, orgUnitId?: string | null): boolean => {
  const n = letterNumberingOf(c)
  return letterNumberingOpen(n) && (role === 'admin' || isLetterClerk(role, n, orgUnitId))
}

/** แฟ้มที่อยู่ในคิวธุรการของบทบาทนี้ (Admin ไม่นับเป็นคิว) */
export const isLetterNumberingQueueCase = (role: UserRole, c: Method4Scope, orgUnitId?: string | null): boolean => {
  const n = letterNumberingOf(c)
  return letterNumberingOpen(n) && isLetterClerk(role, n, orgUnitId)
}

/** แฟ้มที่ธุรการบทบาทนี้เคยออกเลขให้และนำส่งแล้ว — แท็บ "ลงทะเบียนแล้ว" */
export const isLetterNumberingDoneCase = (role: UserRole, c: Method4Scope, orgUnitId?: string | null): boolean => {
  const n = letterNumberingOf(c)
  return n?.status === 'sent' && (role === 'admin' || isLetterClerk(role, n, orgUnitId))
}

export const LETTER_NUMBERING_STATUS: Record<CoordinationLetterNumbering['status'], string> = {
  pending: 'รอธุรการออกเลข',
  returned: 'ธุรการส่งคืนแก้ไข',
  numbered: 'ออกเลขแล้ว · รอนำส่ง',
  sent: 'นำส่งแล้ว',
}

/** ค่าตั้งต้นให้ธุรการกดผ่านได้ลื่น: เลขถัดไปของทะเบียนส่งหนังสือประสาน (ทุกแฟ้ม) และวันที่ปัจจุบัน */
export const suggestLetterNumber = (cases: Method4Scope[], now = new Date()) => {
  const used = cases.filter((c) => {
    const s = letterNumberingOf(c)?.status
    return s === 'numbered' || s === 'sent'
  }).length
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    registryNo: `ปท ${801 + used}/${now.getFullYear() + 543}`,
    registryDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  }
}
