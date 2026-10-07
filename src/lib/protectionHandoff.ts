import type { CaseItem, ProtectionHandoffStep } from '../types/case'
import type { UserRole } from '../types/user'
import { ECMIS_USER_DIRECTORY } from './constants'

export const GOT_UNIT_NAME = 'กองอำนวยการต่อต้านทุจริต (กอท.)'
export const gotAssignableOfficers = () => ECMIS_USER_DIRECTORY.filter(
  (u) => u.active && u.orgUnitId === 'central-gmc' && u.roles.includes('got_officer') && u.roles.includes('protection_owner')
)

export const HANDOFF_STATUS: Record<ProtectionHandoffStep, string> = {
  pending_receipt: 'อนุมัติแล้ว — รอธุรการคดี กอท. รับเรื่อง',
  received: 'ธุรการคดี กอท. รับเรื่องแล้ว — รอส่งเสนอ ผอ. กอท.',
  pending_assignment: 'รอ ผอ. กอท. มอบหมาย',
  assigned: 'มอบหมายแล้ว — รอผู้รับผิดชอบรับงาน',
  accepted: 'รับงานแล้ว — ดำเนินการตามผลอนุมัติ',
  active: 'อยู่ระหว่างดำเนินการคุ้มครอง',
}

export const handoffReady = (c: Pick<CaseItem, 'protectionHandoff'>) =>
  !c.protectionHandoff || ['accepted', 'active'].includes(c.protectionHandoff.step)

export const protectionResponsibleName = (c: CaseItem) =>
  c.protectionHandoff?.assigneeName || c.assignedOfficer || 'นางสาวอรุณี ใจมั่น'

/** เจ้าของสำนวนต้นทางดูอ้างอิงได้ แต่สิทธิทำงานย้ายตามผู้รับผิดชอบปัจจุบัน */
export function canOperateHandoff(role: UserRole, c: Pick<CaseItem, 'protectionHandoff'>, userId: string): boolean {
  const h = c.protectionHandoff
  if (!h) return !role.startsWith('got_')
  if (!handoffReady(c)) return false
  if (role === 'admin') return true
  if (h.destination === 'got') return role === 'got_officer' && h.assigneeUserId === userId
  return (role === 'officer' || role === 'case_owner') && h.assigneeUserId === userId
}

/** รักษางานลงนาม/กลั่นกรองเดิมของสายผู้บังคับบัญชา เมื่อผู้รับผิดชอบรับงานแล้ว */
export function handoffBlocksOperations(role: UserRole, c: Pick<CaseItem, 'protectionHandoff'>, userId: string): boolean {
  if (!c.protectionHandoff) return role.startsWith('got_')
  if (role === 'receiver') return true
  if (!handoffReady(c)) return true
  if (role.startsWith('got_') || role === 'officer' || role === 'case_owner') return !canOperateHandoff(role, c, userId)
  return false
}

export function visibleOperationCase(role: UserRole, c: CaseItem, userId: string): boolean {
  return canViewHandoffCase(role, c, userId) && !handoffBlocksOperations(role, c, userId)
}

/** คิวส่งต่อทั้งหมดใช้เงื่อนไขเดียวกันกับตัวนับเมนู งานของฉัน */
export function isHandoffQueueCase(role: UserRole, c: CaseItem, userId: string): boolean {
  const h = c.protectionHandoff
  if (!h || h.destination !== 'got') return false
  if (role === 'got_receiver') return h.step === 'pending_receipt' || h.step === 'received'
  if (role === 'got_director') return h.step === 'pending_assignment'
  if (role === 'got_officer') return h.assigneeUserId === userId && ['assigned', 'accepted', 'active'].includes(h.step)
  return false
}

export function canViewHandoffCase(role: UserRole, c: Pick<CaseItem, 'protectionHandoff'>, userId: string): boolean {
  if (!role.startsWith('got_')) return true
  const h = c.protectionHandoff
  if (h?.destination !== 'got') return false
  if (role === 'got_receiver') return true
  if (role === 'got_director') return !['pending_receipt', 'received'].includes(h.step)
  return h.assigneeUserId === userId
}
