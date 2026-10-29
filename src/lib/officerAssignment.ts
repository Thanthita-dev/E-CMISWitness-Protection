import type { CaseItem } from '../types/case'
import type { UserRole } from '../types/user'
import { ECMIS_USER_DIRECTORY, ORG_UNITS } from './constants'

export type AssignmentCase = Partial<Pick<CaseItem, 'orgUnitId' | 'receivedByUserId' | 'assignedOfficerUserId' | 'gotRevision'>>

/** แฟ้มเก่าใช้หน่วยงานผู้รับเรื่องก่อนเจ้าของสำนวน เพื่อไม่ให้การมอบหมายผิดเขตเปลี่ยนหน่วยงานต้นทาง */
export function assignmentCaseUnit(c: AssignmentCase): string | undefined {
  return c.orgUnitId ||
    ECMIS_USER_DIRECTORY.find((u) => u.id === c.receivedByUserId)?.orgUnitId ||
    ECMIS_USER_DIRECTORY.find((u) => u.id === c.assignedOfficerUserId)?.orgUnitId
}

const isCentralUnit = (id?: string | null) => Boolean(ORG_UNITS.find((u) => u.id === id)?.isCentral)

/** หน่วยส่วนกลางนับเป็นสังกัดเดียวกันสำหรับ ผอ. ส่วนกลาง (ผอ. เขตต้องตรงเขต) */
export function canAssignInUnit(role: UserRole, unitId: string | null, c: AssignmentCase): boolean {
  if (role === 'admin') return true
  if ((role !== 'director' && role !== 'got_director') || !unitId) return false
  /** FB-018 — รอบแก้ไขที่ รองเลขาธิการฯ ส่งให้ กอท.: ผอ. กอท. ส่งชุดเสนอต่อได้แม้แฟ้มเป็นของหน่วยอื่น */
  if (role === 'got_director' && c.gotRevision) return true
  const caseUnit = assignmentCaseUnit(c)
  return caseUnit === unitId || (role === 'director' && isCentralUnit(caseUnit) && isCentralUnit(unitId))
}

/** ผอ. เขตเห็นเฉพาะเจ้าหน้าที่ในเขตตน ผอ. ส่วนกลางเห็นเจ้าหน้าที่ส่วนกลางทุกหน่วย (ผอ. กอท. เห็นเฉพาะ กอท.) */
export function assignableOfficers(role: UserRole, unitId: string | null) {
  if (!['director', 'got_director', 'admin'].includes(role)) return []
  return ECMIS_USER_DIRECTORY.filter((u) => u.active &&
    (role === 'admin' || u.orgUnitId === unitId || (role === 'director' && isCentralUnit(unitId) && isCentralUnit(u.orgUnitId))) &&
    u.roles.some((r) => (role === 'director' ? ['officer', 'case_owner'] : ['officer', 'case_owner', 'got_officer']).includes(r)))
}
