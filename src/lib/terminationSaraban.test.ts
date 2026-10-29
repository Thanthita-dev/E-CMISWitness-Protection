import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { useNotificationStore } from '../store/useNotificationStore'
import type { CaseItem } from '../types/case'
import { sarabanInTransit } from './saraban'
import { passSarabanCheckpoint } from './sarabanTestHelpers'

/** ยุติการคุ้มครอง — คบ.15/16/17 ข้ามหน่วย ↔ สำนักงานเลขาธิการต้องผ่านธุรการ และอำนาจเป็นของเลขาธิการเท่านั้น */
vi.mock('./swal', () => ({ showToast: vi.fn() }))
const NO = '9903/2569'
const base = (extra: Partial<CaseItem> = {}): CaseItem => ({
  no: NO, form: 'คำร้อง', person: 'พยานตัวอย่าง', stage: 'termination_review',
  status: 'จัดทำ คบ.15 ฉบับที่ 1 · รอผอ.สำนัก/กองตรวจ', owner: 'ผอ.สำนัก/กอง', next: 'ตรวจ คบ.15', risk: 'ต่ำ',
  assignedOfficerUserId: 'OFF-REG1', orgUnitId: 'pacc-reg-1', assignmentHistory: [],
  kb15: { version: 1, trigger: 'due_or_officer', regulationClause: 4, article19Reason: 1, summary: 'ไม่มีเหตุที่จะให้การคุ้มครองต่อไปแล้ว', facts: 'ผลตรวจ', evidenceNote: 'รายงานตรวจ.pdf', occurredAt: '2026-10-01', proposedEndAt: '2026-11-01', createdAt: '2026-10-01', createdBy: 'y', status: 'submitted', approvalStage: 'supervisor' } as CaseItem['kb15'],
  ...extra,
})
const store = () => useCaseStore.getState()
const current = () => store().cases.find((c) => c.no === NO)!
const asRole = (r: string) => useAuthStore.getState().setRole(r as never)

beforeEach(() => {
  localStorage.clear()
  useCaseStore.setState({ cases: [base()], activeCaseNo: NO })
  useNotificationStore.setState({ notifications: [], unreadCount: 0 })
  asRole('supervisor')
})

describe('ยุติการคุ้มครองผ่านธุรการ', () => {
  it('ลงนาม คบ.15 ตามลำดับชั้น: ผอ. → ธุรการทั้งสองฝั่ง → รองเลขาธิการ → เลขาธิการพิจารณาพร้อมลงนาม ขากลับผ่านธุรการ', () => {
    // ผบช.ชั้นต้นกลั่นกรองก่อน ผอ.กอง
    store().reviewKb15(NO, true, 'ครบถ้วน')
    expect(current().kb15?.approvalStage).toBe('director')
    expect(current().sarabanDispatch).toBeUndefined()

    asRole('director')
    store().reviewKb15(NO, true, 'ครบถ้วน')
    expect(current().kb15).toMatchObject({ status: 'submitted', approvalStage: 'deputy_secretary' })
    expect(current().sarabanDispatch).toMatchObject({ flow: 'termination', direction: 'up', forms: [1, 3, 15, 16, 17] })
    // รองเลขาธิการยังลงนามไม่ได้ระหว่างรอธุรการ
    asRole('deputy_secretary')
    store().reviewKb15(NO, true, 'เห็นชอบ')
    expect(current().kb15?.approvalStage).toBe('deputy_secretary')

    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(sarabanInTransit(current(), 'termination')).toBe(true)
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(current().sarabanDispatch).toBeUndefined()

    // เลขาธิการพิจารณายุติไม่ได้ก่อนลงนาม คบ.15
    asRole('secretary')
    store().decideTerminationApproval(NO, true, 'อนุมัติ')
    expect(current().terminationApproval).toBeUndefined()

    asRole('deputy_secretary')
    store().reviewKb15(NO, true, 'เห็นชอบ')
    expect(current().kb15?.approvalStage).toBe('secretary')
    expect(current().sarabanDispatch).toBeUndefined()

    asRole('secretary')
    store().reviewKb15(NO, true, 'ลงนาม')
    expect(current().kb15?.status).toBe('endorsed')
    expect(current().kb15?.approvalHistory?.map((h) => h.role)).toEqual(['supervisor', 'director', 'deputy_secretary', 'secretary'])

    store().decideTerminationApproval(NO, true, 'อนุมัติ')
    expect(current().terminationApproval?.approved).toBe(true)
    expect(current().sarabanDispatch).toMatchObject({ flow: 'termination', direction: 'down', forms: [1, 3, 15, 16, 17] })
    // เจ้าหน้าที่ร่าง คบ.16 ไม่ได้จนกว่าผลจะถึงหน่วย
    asRole('officer')
    store().issueKb16(NO, { orderNo: '1/2569', issuedAt: '2026-10-01', effectiveAt: '2026-11-01', reason: 'x' } as never)
    expect(current().kb16).toBeUndefined()
    passSarabanCheckpoint(NO)
    passSarabanCheckpoint(NO)
    expect(current().sarabanDispatch).toBeUndefined()
    store().issueKb16(NO, { orderNo: '1/2569', issuedAt: '2026-10-01', effectiveAt: '2026-11-01', reason: 'x' } as never)
    expect(current().kb16?.status).toBe('draft')
  })

  it('ทุกชั้นส่งคืน คบ.15 กลับเจ้าหน้าที่ — ผอ.ส่งคืนในหน่วย ส่วนรองเลขาธิการ/เลขาธิการส่งคืนผ่านธุรการขากลับ', () => {
    asRole('supervisor')
    store().reviewKb15(NO, false, 'แก้เหตุผล')
    expect(current().kb15).toMatchObject({ status: 'returned', approvalStage: undefined })
    expect(current().sarabanDispatch).toBeUndefined()

    useCaseStore.setState({ cases: [base({ kb15: { ...base().kb15!, approvalStage: 'deputy_secretary' } })] })
    asRole('deputy_secretary')
    store().reviewKb15(NO, false, 'แก้หลักฐาน')
    expect(current().kb15?.status).toBe('returned')
    expect(current().sarabanDispatch).toMatchObject({ flow: 'termination', direction: 'down', forms: [1, 3, 15, 16, 17] })

    useCaseStore.setState({ cases: [base({ kb15: { ...base().kb15!, approvalStage: 'secretary' } })] })
    asRole('secretary')
    store().reviewKb15(NO, false, 'แก้ข้อระเบียบ')
    expect(current().kb15?.status).toBe('returned')
    expect(current().sarabanDispatch).toMatchObject({ direction: 'down' })
  })

  it('ผอ.หน่วยอนุมัติ/ลงนามยุติไม่ได้ — เฉพาะเลขาธิการ', () => {
    useCaseStore.setState({ cases: [base({ kb15: { ...base().kb15!, status: 'endorsed' } })] })
    asRole('director')
    store().decideTerminationApproval(NO, true, 'อนุมัติ')
    expect(current().terminationApproval).toBeUndefined()
    expect(current().sarabanDispatch).toBeUndefined()
  })

  it('คบ.16: เสนอและรับกลับพร้อมเอกสารทั้งแฟ้ม', () => {
    useCaseStore.setState({ cases: [base({
      kb15: { ...base().kb15!, status: 'endorsed' }, stage: 'termination_order', owner: 'เจ้าหน้าที่', terminationApproval: { decidedAt: 'x', decidedBy: 'y', approved: true, note: '' },
      kb16: { orderNo: '1/2569', issuedAt: '2026-10-01', effectiveAt: '2026-11-01', reason: 'x', status: 'draft' } as never,
    })] })
    asRole('officer')
    store().submitKb16ForSignature(NO)
    expect(current().sarabanDispatch).toMatchObject({ direction: 'up', forms: [1, 3, 15, 16, 17] })
    passSarabanCheckpoint(NO)
    passSarabanCheckpoint(NO)
    asRole('director')
    store().signKb16(NO)
    expect(current().kb16?.signedAt).toBeUndefined()
    asRole('secretary')
    store().signKb16(NO)
    expect(current().kb16?.signedAt).toBeTruthy()
    expect(current().sarabanDispatch).toMatchObject({ direction: 'down', forms: [1, 3, 15, 16, 17] })
  })
})
