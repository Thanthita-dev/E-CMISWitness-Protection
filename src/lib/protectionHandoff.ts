import { assignmentCaseUnit, type AssignmentCase } from './officerAssignment'
import type { CaseItem, Kb15ApprovalStage, ProtectionHandoffStep } from '../types/case'
import type { UserRole } from '../types/user'
import { ECMIS_USER_DIRECTORY, userNameById } from './constants'
import { useAuthStore } from '../store/useAuthStore'

/** คำร้องที่ กอท. รับเอง ใช้สายมอบหมายของหน่วยก่อนมีการส่งมอบหลังอนุมัติ */
export function isGotIntakeCase(c: AssignmentCase & Pick<CaseItem, 'protectionHandoff'>): boolean {
  return !c.protectionHandoff && !c.gotRevision && assignmentCaseUnit(c) === 'central-gmc'
}

/** บทบาททั่วไปที่ตำแหน่งของ กอท. ใช้ กับหน้าที่งานรับมอบหลังอนุมัติที่บัญชี กอท. ทำได้เพิ่ม */
const GOT_DUTY: Partial<Record<UserRole, UserRole>> = {
  director: 'got_director',
  supervisor: 'got_supervisor',
  officer: 'got_officer',
  case_owner: 'got_officer',
  receiver: 'got_receiver',
}

/**
 * ตำแหน่งของ กอท. ในเมนูเลือกบทบาท = บทบาททั่วไป (เหมือนเขต) + บัญชีผู้ใช้ของ กอท.
 * บัญชีของ กอท. จึงทำงานรับมอบหลังเลขาธิการอนุมัติ (ส่งต่อ กอท.) ได้ด้วย
 */
export function gotDutyOf(role: UserRole): UserRole | null {
  if (role.startsWith('got_')) return role
  const duty = GOT_DUTY[role]
  if (!duty) return null
  return useAuthStore.getState().getCurrentUserAccount()?.roles.includes(duty) ? duty : null
}

/** บทบาทที่ใช้ตัดสินสิทธิ์ในแฟ้มนี้ — แฟ้มที่ส่งต่อ กอท. ใช้หน้าที่ กอท. ของบัญชีที่เลือกอยู่ */
export function roleForCase(role: UserRole, c: Pick<CaseItem, 'protectionHandoff'> & Partial<Pick<CaseItem, 'gotRevision' | 'orgUnitId' | 'receivedByUserId' | 'assignedOfficerUserId'>>): UserRole {
  if ((!c.gotRevision && c.protectionHandoff?.destination !== 'got') || role.startsWith('got_')) return role
  return gotDutyOf(role) ?? role
}

export const GOT_UNIT_NAME = 'กองอำนวยการต่อต้านทุจริต (กอท.)'
export const gotAssignableOfficers = () => ECMIS_USER_DIRECTORY.filter(
  (u) => u.active && u.orgUnitId === 'central-gmc' && u.roles.includes('got_officer') && u.roles.includes('protection_owner')
)

export const HANDOFF_STATUS: Record<ProtectionHandoffStep, string> = {
  pending_send: 'ลงนามแล้ว · รอเลขาธิการส่งให้ธุรการออกเลข',
  pending_outgoing: 'รอธุรการสำนักงานเลขาธิการ ออกเลขทะเบียนส่ง',
  pending_receipt: 'ออกเลขทะเบียนส่งแล้ว — รอธุรการปลายทางลงเลขทะเบียนรับ',
  received: 'ธุรการคดี กอท. รับเรื่องแล้ว — รอส่งเสนอ ผอ. กอท.',
  pending_assignment: 'รอ ผอ. กอท. มอบหมาย',
  assigned: 'มอบหมายแล้ว — รอผู้รับผิดชอบรับงาน',
  accepted: 'รับงานแล้ว — ดำเนินการตามผลพิจารณา',
  active: 'อยู่ระหว่างดำเนินการคุ้มครอง',
}

export const handoffReady = (c: Pick<CaseItem, 'protectionHandoff'>) =>
  !c.protectionHandoff || ['accepted', 'active'].includes(c.protectionHandoff.step)

/** แฟ้มที่ส่งต่อ กอท. และผู้รับผิดชอบรับงานแล้ว — งานกลั่นกรองตามลำดับชั้นย้ายมาที่สายบังคับบัญชาของ กอท. */
export const gotReviewChain = (c?: (Pick<CaseItem, 'protectionHandoff'> & Partial<Pick<CaseItem, 'gotRevision' | 'orgUnitId' | 'receivedByUserId' | 'assignedOfficerUserId'>>) | null): boolean =>
  Boolean(c && isGotIntakeCase(c)) || Boolean(c?.gotRevision) || (c?.protectionHandoff?.destination === 'got' && handoffReady(c))

/**
 * ผู้กลั่นกรองขั้น ผบช.ต้น / ผอ. ของแฟ้มนี้ — กอท. เป็นอีกหน่วยหนึ่งเหมือนเขต (แต่อยู่ส่วนกลาง)
 * แฟ้มที่ส่งต่อ กอท. แล้วจึงเดินลำดับชั้นในสาย กอท. ทั้งหมด (ผบช.ต้น กอท. → ผอ. กอท.)
 * ผบช.ต้น / ผอ. ของสำนัก/กองเดิมไม่รับงานของแฟ้มนี้แล้ว ส่วนรองเลขาธิการ/เลขาธิการยังเป็นส่วนกลางตามเดิม
 */
export function reviewerRoleFor(level: 'supervisor' | 'director', c?: (Pick<CaseItem, 'protectionHandoff'> & Partial<Pick<CaseItem, 'gotRevision' | 'orgUnitId' | 'receivedByUserId' | 'assignedOfficerUserId'>>) | null): UserRole {
  if (!gotReviewChain(c)) return level
  return level === 'supervisor' ? 'got_supervisor' : 'got_director'
}

export function isReviewerFor(role: string, level: 'supervisor' | 'director', c?: (Pick<CaseItem, 'protectionHandoff'> & Partial<Pick<CaseItem, 'gotRevision' | 'orgUnitId' | 'receivedByUserId' | 'assignedOfficerUserId'>>) | null): boolean {
  if (role === 'admin') return true
  const effective = c ? roleForCase(role as UserRole, c) : role
  return effective === reviewerRoleFor(level, c)
}

/** ผู้ตรวจ คบ.14 (และผู้ลงนาม คบ.6 ฉบับขยายเวลา) ในขั้นนี้ของแฟ้มนี้ */
export function isKb14StageReviewer(role: string, stage: string, c?: Pick<CaseItem, 'protectionHandoff'> | null): boolean {
  if (stage === 'supervisor' || stage === 'director') return isReviewerFor(role, stage, c)
  return role === 'admin' || role === stage
}

/** ชั้นที่ คบ.15 รออยู่ — ข้อมูลเดิมที่ยังไม่มี approvalStage ถือว่ารอ ผอ.กอง/สำนัก */
export const kb15PendingStage = (c?: Pick<CaseItem, 'kb15'> | null): Kb15ApprovalStage | null =>
  c?.kb15?.status === 'submitted' ? c.kb15.approvalStage || 'director' : null

/** ผู้ตรวจ/ลงนาม คบ.15 ในชั้นที่แฟ้มรออยู่: ผอ.กอง/สำนัก → รองเลขาธิการ → เลขาธิการ */
export function isKb15StageReviewer(role: string, c?: (Pick<CaseItem, 'kb15' | 'protectionHandoff'> & Partial<Pick<CaseItem, 'gotRevision' | 'orgUnitId' | 'receivedByUserId' | 'assignedOfficerUserId'>>) | null): boolean {
  const stage = kb15PendingStage(c)
  if (!stage) return false
  if (stage === 'supervisor' || stage === 'director') return isReviewerFor(role, stage, c)
  return role === 'admin' || role === stage
}

export const kb15StageLabel = (stage: Kb15ApprovalStage, c?: (Pick<CaseItem, 'protectionHandoff'> & Partial<Pick<CaseItem, 'gotRevision' | 'orgUnitId' | 'receivedByUserId' | 'assignedOfficerUserId'>>) | null): string =>
  stage === 'supervisor' ? reviewLevelLabel('supervisor', c) : stage === 'director' ? reviewLevelLabel('director', c) : stage === 'deputy_secretary' ? 'รองเลขาธิการ' : 'เลขาธิการ'

/**
 * งานรอกลั่นกรองในขั้นนี้ของแฟ้ม กอท. — คบ.14 คำขอถอนตัว ข้อเสนอหลังพยานไม่ยินยอม/หน่วยงานปฏิเสธ และเรื่องตามข้อ 14
 * ใช้ร่วมกันระหว่างหน้าคิวงานกับตัวนับเมนู งานของฉัน ของ ผบช.ต้น กอท. และ ผอ. กอท.
 */
export function isGotReviewCase(c: CaseItem, level: 'supervisor' | 'director'): boolean {
  /** FB-018 — รอบแก้ไข คบ.6 ที่รองเลขาธิการฯ ส่งกลับให้ กอท. ทำต่อ: ขั้นกลั่นกรองเป็นของสาย กอท. */
  if (c.gotRevision && c.stage === `${level}_review`) return true
  if (!gotReviewChain(c)) return false
  const extension = c.extensionRequests?.at(-1)
  return Boolean(extension?.formSnapshot && ['submitted', 'pending'].includes(extension.status) && (extension.approvalStage || 'supervisor') === level) ||
    c.withdrawalRequest?.approvalStage === level ||
    (c.consentDeclineProposals || []).at(-1)?.stage === level ||
    (c.coordinationProposals || []).at(-1)?.stage === level ||
    c.article14?.step === `${level}_review`
}

/** ชื่อชั้นผู้กลั่นกรองที่แสดงในสถานะ/ประวัติแฟ้ม */
export const reviewLevelLabel = (level: 'supervisor' | 'director', c?: (Pick<CaseItem, 'protectionHandoff'> & Partial<Pick<CaseItem, 'gotRevision' | 'orgUnitId' | 'receivedByUserId' | 'assignedOfficerUserId'>>) | null): string =>
  gotReviewChain(c) ? (level === 'supervisor' ? 'ผบช.ต้น กอท.' : 'ผอ. กอท.') : (level === 'supervisor' ? 'ผบช.ชั้นต้น' : 'ผอ.สำนัก/กอง')

export const protectionResponsibleName = (c: CaseItem) =>
  c.gotRevision?.assigneeName || c.protectionHandoff?.assigneeName || c.assignedOfficer || userNameById('OFF-001')

/** เจ้าของสำนวนต้นทางดูอ้างอิงได้ แต่สิทธิทำงานย้ายตามผู้รับผิดชอบปัจจุบัน */
export function canOperateHandoff(role: UserRole, c: Pick<CaseItem, 'protectionHandoff'>, userId: string): boolean {
  role = roleForCase(role, c)
  const h = c.protectionHandoff
  if (!h) return !role.startsWith('got_')
  if (!handoffReady(c)) return false
  if (role === 'admin') return true
  if (h.destination === 'got') return role === 'got_officer' && h.assigneeUserId === userId
  return (role === 'officer' || role === 'case_owner') && h.assigneeUserId === userId
}

/** รักษางานลงนาม/กลั่นกรองเดิมของสายผู้บังคับบัญชา เมื่อผู้รับผิดชอบรับงานแล้ว */
export function handoffBlocksOperations(role: UserRole, c: Pick<CaseItem, 'protectionHandoff'> & Partial<Pick<CaseItem, 'receivedByUserId' | 'assignedOfficerUserId' | 'orgUnitId' | 'gotRevision'>>, userId: string): boolean {
  role = roleForCase(role, c)
  /** FB-018 — รอบแก้ไขที่ กอท. รับไปทำ: เจ้าของเรื่องเดิมดูอย่างเดียว ส่วน กอท. ลงมือตามขั้นของตน */
  if (c.gotRevision && !c.protectionHandoff) {
    if (role === 'officer' || role === 'case_owner') return true
    if (role === 'got_officer') return c.gotRevision.assigneeUserId !== userId
    if (role.startsWith('got_')) return role === 'got_receiver'
  }
  if (isGotIntakeCase(c) && role.startsWith('got_')) return !canViewHandoffCase(role, c, userId)
  if (!c.protectionHandoff) return role.startsWith('got_') && !isOwnIntakeCase(role, c, userId)
  role = roleForCase(role, c)
  /** ธุรการ (receiver/secretary_receiver) ดูแฟ้มและลงทะเบียนสารบรรณเท่านั้น ไม่ทำงานคุ้มครอง */
  if (role === 'receiver' || role === 'secretary_receiver') return true
  if (!handoffReady(c)) return true
  /** ผบช.ต้น กอท. และ ผอ. กอท. กลั่นกรองและลงนามตามลำดับชั้น เหมือนสายบังคับบัญชาของสำนัก/กอง */
  if (role === 'got_supervisor' || role === 'got_director') return false
  if (role.startsWith('got_') || role === 'officer' || role === 'case_owner') return !canOperateHandoff(role, c, userId)
  return false
}

export function visibleOperationCase(role: UserRole, c: CaseItem, userId: string): boolean {
  return canViewHandoffCase(role, c, userId) && !handoffBlocksOperations(role, c, userId)
}

/** คิวส่งต่อทั้งหมดใช้เงื่อนไขเดียวกันกับตัวนับเมนู งานของฉัน */
export function isHandoffQueueCase(role: UserRole, c: CaseItem, userId: string): boolean {
  role = roleForCase(role, c)
  // Returned termination documents belong in the assigned officer's work queue.
  if (role === 'got_officer' && !c.sarabanDispatch && !c.terminationDocumentsClosedAt &&
      (c.stage === 'termination_order' || (c.stage === 'termination_review' && c.kb15?.status === 'returned'))) {
    return canViewHandoffCase(role, c, userId)
  }
  /** FB-018 — งานแก้ไข คบ.6 ที่รองเลขาธิการฯ ส่งกลับให้ผู้รับผิดชอบ กอท. */
  if (c.gotRevision && !c.protectionHandoff) {
    if (c.sarabanDispatch) return false
    if (role === 'got_director') return c.stage === 'director_review'
    if (role === 'got_supervisor') return c.stage === 'supervisor_review'
    return role === 'got_officer' && c.gotRevision.assigneeUserId === userId && c.stage === 'staff_review'
  }
  if (isGotIntakeCase(c) && !c.sarabanDispatch) {
    if (role === 'got_director') return ['director_assign', 'director_review'].includes(c.stage)
    if (role === 'got_supervisor') return c.stage === 'supervisor_review'
    if (role === 'got_officer') return canViewHandoffCase(role, c, userId) && ['officer_intake', 'staff_review'].includes(c.stage)
  }
  const h = c.protectionHandoff
  if (!h || h.destination !== 'got') return false
  if (h.step === 'pending_send' || h.step === 'pending_outgoing') return false
  role = roleForCase(role, c)
  if (role === 'got_receiver') return h.step === 'pending_receipt' || h.step === 'received'
  if (c.appealFolder && !c.sarabanDispatch) {
    const stage = c.appealFolder.stage
    if (role === 'got_supervisor') return ['late_pending', 'supervisor'].includes(stage)
    if (role === 'got_director') return stage === 'director'
    if (role === 'got_officer') return h.assigneeUserId === userId && ['received', 'officer_opinion'].includes(stage)
  }
  if (role === 'got_director') return h.step === 'pending_assignment'
  if (role === 'got_officer') return h.assigneeUserId === userId && ['assigned', 'accepted', 'active'].includes(h.step)
  return false
}

/**
 * ธุรการคดี กอท. รับคำร้องขอคุ้มครองพยานเข้าระบบได้เหมือนธุรการสำนัก/กอง
 * แฟ้มที่ตนรับเข้าเอง (ยังไม่ใช่งานส่งต่อหลังอนุมัติ) จึงเปิดและทำงานขั้นรับเรื่องได้
 */
export function isOwnIntakeCase(role: UserRole, c: Pick<CaseItem, 'protectionHandoff'> & Partial<Pick<CaseItem, 'receivedByUserId'>>, userId: string): boolean {
  return (role === 'got_receiver' || role === 'got_officer') && !c.protectionHandoff && Boolean(c.receivedByUserId) && c.receivedByUserId === userId
}

export function canViewHandoffCase(role: UserRole, c: Pick<CaseItem, 'protectionHandoff'> & Partial<Pick<CaseItem, 'receivedByUserId' | 'assignedOfficerUserId' | 'stage' | 'orgUnitId' | 'gotRevision' | 'sarabanDispatch' | 'nonApprovalDestination'>>, userId: string): boolean {
  role = roleForCase(role, c)
  if (!c.protectionHandoff && c.nonApprovalDestination === 'got' && role === 'got_receiver') return true
  /** FB-018 — รอบแก้ไขที่ กอท. รับไปทำ: สาย กอท. เห็นแฟ้ม (ธุรการ กอท. เห็นเฉพาะช่วงรอลงทะเบียน) */
  if (c.gotRevision && !c.protectionHandoff && role.startsWith('got_')) {
    if (role === 'got_officer') return c.gotRevision.assigneeUserId === userId
    if (role === 'got_receiver') return Boolean(c.sarabanDispatch)
    return role === 'got_supervisor' || role === 'got_director'
  }
  if (!role.startsWith('got_')) {
    if (role !== 'officer' && role !== 'case_owner') return true
    if (!userId) return false
    // ผู้รับผิดชอบเดิมยังเปิดแฟ้มของตนเพื่ออ้างอิงได้หลังส่งมอบ แต่แฟ้มคนอื่นไม่อยู่ในขอบเขต
    if (c.protectionHandoff) return c.protectionHandoff.originalOwnerUserId === userId ||
      c.protectionHandoff.assigneeUserId === userId || c.assignedOfficerUserId === userId
    return c.assignedOfficerUserId ? c.assignedOfficerUserId === userId : c.receivedByUserId === userId
  }
  if (isGotIntakeCase(c)) {
    if (role === 'got_director' || role === 'got_supervisor' || role === 'got_receiver') return true
    if (role === 'got_officer' && c.assignedOfficerUserId) return c.assignedOfficerUserId === userId
  }
  if (isOwnIntakeCase(role, c, userId)) return true
  const h = c.protectionHandoff
  if (h?.destination !== 'got') return false
  /** ก่อนธุรการ สลธ. ออกเลขส่ง แฟ้มยังไม่ถึง กอท. */
  if (h.step === 'pending_send' || h.step === 'pending_outgoing') return false
  if (role === 'got_receiver') return true
  if (role === 'got_director') return !['pending_receipt', 'received'].includes(h.step)
  /** ผบช.ต้น กอท. เปิดแฟ้มได้เมื่อผู้รับผิดชอบ กอท. รับงานแล้ว (ช่วงที่มีงานกลั่นกรอง) */
  if (role === 'got_supervisor') return handoffReady(c)
  return h.assigneeUserId === userId
}
