import { beforeEach, describe, expect, it } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { useFormDraftStore } from '../store/useFormDraftStore'
import { useNotificationStore, filterNotificationsForUser } from '../store/useNotificationStore'
import type { CaseItem } from '../types/case'
import { ECMIS_USER_DIRECTORY } from './constants'
import { canEditFormsInDossier, isAssignedProtectionOfficer, isMyQueueCase } from './permissions'
import { canOperateHandoff, gotAssignableOfficers, isHandoffQueueCase } from './protectionHandoff'
import { KB11_SIGN_SLOTS } from './formSignature'

const NO = 'WP-2569-000501'
const initial = (): CaseItem => ({
  no: NO, form: 'คบ.1', person: 'นางสาวกมลชนก บุญรักษา', stage: 'external_pending',
  status: 'รอเลขาธิการพิจารณา', owner: 'เลขาธิการ ป.ป.ท.', next: 'พิจารณา', risk: 'สูง',
  assignedOfficerUserId: 'OFF-001', assignedOfficer: 'นางสาวอรุณี ใจมั่น',
  mainCaseNo: 'กบค. 001/2569', kb6SecretarySignedAt: '2026-10-07T08:00:00.000Z',
  documents: [{ id: 'SRC-1', category: 'source', name: 'เอกสารต้นทาง.pdf' }], assignmentHistory: [],
})
const store = () => useCaseStore.getState()
const current = () => store().cases.find((c) => c.no === NO)!
const role = (r: Parameters<ReturnType<typeof useAuthStore.getState>['setRole']>[0]) => useAuthStore.getState().setRole(r)
const approve = (destination: 'got' | 'original_owner' = 'got') => store().secretaryApprove(NO, 'ลธ. 501/2569', 'สมควรคุ้มครอง', destination, 'ดำเนินการตามวิธีที่อนุมัติ', 30)
const progressToAssignment = () => {
  expect(approve()).toBe(true)
  role('got_receiver')
  expect(store().advanceProtectionHandoff(NO, 'receive', 'ตรวจเอกสารครบ')).toBe(true)
  expect(store().advanceProtectionHandoff(NO, 'submit', 'เสนอเพื่อมอบหมาย')).toBe(true)
  role('got_director')
}

beforeEach(() => {
  localStorage.clear()
  useCaseStore.setState({ cases: [initial()], activeCaseNo: NO })
  useAuthStore.setState({ currentOfficerUserId: 'OFF-001' })
  role('secretary')
  const noticeFields = { เลขที่หนังสือ: 'ปป 001', ปีหนังสือ: '501', วันที่: '7', เดือน: 'ตุลาคม', 'พ.ศ.': '2569', คำร้องลงวันที่: '1 ตุลาคม 2569' }
  useFormDraftStore.setState({ drafts: { 6: { 'รูปแบบคุ้มครองที่เลือก': [1] }, 9: noticeFields, 10: { ...noticeFields } }, draftCaseNo: { 6: NO, 9: NO, 10: NO }, caseDrafts: {} })
  useNotificationStore.setState({ notifications: [], unreadCount: 0 })
})

describe('ส่งงานหลังอนุมัติในแฟ้มเดิม', () => {
  it('ต้องเลือกปลายทางและเป็นเลขาธิการ จึงอนุมัติและส่งงานได้', () => {
    expect(store().secretaryApprove(NO, 'ลธ. 501', 'เหตุผล', '' as 'got', '')).toBe(false)
    role('got_receiver')
    expect(approve()).toBe(false)
    expect(store().cases).toHaveLength(1)
    expect(current().activity7State).toBeUndefined()
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })

  it('เจ้าของสำนวนเดิมได้รับงานและแจ้งเตือน งานไม่เข้าคิว กอท. ส่งซ้ำไม่เพิ่มคำสั่ง', () => {
    expect(approve('original_owner')).toBe(true)
    const c = current()
    expect(c.protectionHandoff?.assigneeUserId).toBe('OFF-001')
    expect(c.orderedMethods).toEqual([1])
    expect(isMyQueueCase('officer', c, 'OFF-001')).toBe(true)
    expect(isHandoffQueueCase('got_receiver', c, 'GOT-REC-001')).toBe(false)
    expect(isHandoffQueueCase('got_director', c, 'GOT-DIR-001')).toBe(false)
    expect(canOperateHandoff('officer', c, 'OFF-001')).toBe(true)
    expect(approve('original_owner')).toBe(false)
    expect(current().documents).toHaveLength(2)
    expect(current().protectionHandoff?.events).toHaveLength(1)
    expect(useNotificationStore.getState().notifications.map((n) => n.toUserId)).toEqual(['OFF-001'])
  })

  it('ส่ง กอท. ต้องเริ่มที่ธุรการ และเก็บเจ้าของสำนวนเดิมแยกจากผู้รับผิดชอบ', () => {
    expect(approve()).toBe(true)
    const c = current()
    expect(c.protectionHandoff?.step).toBe('pending_receipt')
    expect(c.protectionHandoff?.assigneeUserId).toBeUndefined()
    expect(c.assignedOfficerUserId).toBe('OFF-001')
    expect(c.protectionHandoff?.originalOwnerName).toBe('นางสาวอรุณี ใจมั่น')
    expect(isMyQueueCase('officer', c, 'OFF-001')).toBe(false)
    expect(isAssignedProtectionOfficer('officer', c, 'OFF-001')).toBe(false)
    expect(isHandoffQueueCase('got_receiver', c, 'GOT-REC-001')).toBe(true)
    expect(isHandoffQueueCase('got_director', c, 'GOT-DIR-001')).toBe(false)
    expect(useNotificationStore.getState().notifications[0].toUserId).toBe('GOT-REC-001')
  })

  it('ข้ามธุรการ/ผอ. หรือให้ธุรการมอบหมายแทนไม่ได้ และรับ/ส่งซ้ำไม่เพิ่มประวัติ', () => {
    expect(approve()).toBe(true)
    role('got_director')
    expect(store().advanceProtectionHandoff(NO, 'assign', 'มอบหมาย', 'GOT-OFF-001')).toBe(false)
    role('got_receiver')
    expect(store().advanceProtectionHandoff(NO, 'submit')).toBe(false)
    expect(store().advanceProtectionHandoff(NO, 'receive')).toBe(true)
    expect(store().advanceProtectionHandoff(NO, 'receive')).toBe(false)
    expect(store().advanceProtectionHandoff(NO, 'assign', 'มอบหมาย', 'GOT-OFF-001')).toBe(false)
    expect(store().advanceProtectionHandoff(NO, 'submit')).toBe(true)
    expect(store().advanceProtectionHandoff(NO, 'submit')).toBe(false)
    expect(current().protectionHandoff?.events).toHaveLength(3)
    expect(current().activity7State).toBe('approved')
    expect(current().decisionNumber).toBe('ลธ. 501/2569')
  })

  it('ผอ. เลือกได้เฉพาะบุคลากร กอท. ที่มีสิทธิและต้องบันทึกคำสั่ง', () => {
    progressToAssignment()
    expect(store().advanceProtectionHandoff(NO, 'assign', 'มอบหมาย', 'OFF-001')).toBe(false)
    expect(store().advanceProtectionHandoff(NO, 'assign', '', 'GOT-OFF-001')).toBe(false)
    const account = ECMIS_USER_DIRECTORY.find((u) => u.id === 'GOT-OFF-002')!
    account.active = false
    try {
      expect(gotAssignableOfficers().map((u) => u.id)).not.toContain(account.id)
      expect(store().advanceProtectionHandoff(NO, 'assign', 'มอบหมาย', account.id)).toBe(false)
    } finally { account.active = true }
    expect(store().advanceProtectionHandoff(NO, 'assign', 'รับผิดชอบตามคำสั่งเดิม', 'GOT-OFF-002')).toBe(true)
    expect(store().advanceProtectionHandoff(NO, 'assign', 'ส่งซ้ำ', 'GOT-OFF-002')).toBe(false)
    expect(current().protectionHandoff?.assignmentInstruction).toBe('รับผิดชอบตามคำสั่งเดิม')
    expect(current().documents).toHaveLength(2)
    expect(current().activity7State).toBe('approved')
  })

  it('ผู้ที่ได้รับมอบหมายเท่านั้นรับงานได้ และเปิดโฟลว์คุ้มครองเดิมต่อได้', () => {
    progressToAssignment()
    expect(store().advanceProtectionHandoff(NO, 'assign', 'มอบหมาย', 'GOT-OFF-002')).toBe(true)
    role('got_officer') // บัญชีเริ่มต้น GOT-OFF-001
    expect(store().advanceProtectionHandoff(NO, 'accept')).toBe(false)
    useAuthStore.getState().setOfficerUserId('GOT-OFF-002')
    expect(canEditFormsInDossier('got_officer', current(), 'GOT-OFF-002')).toBe(false)
    expect(store().advanceProtectionHandoff(NO, 'accept', 'รับงานพร้อมเอกสาร')).toBe(true)
    expect(store().advanceProtectionHandoff(NO, 'accept')).toBe(false)
    expect(canEditFormsInDossier('got_officer', current(), 'GOT-OFF-002')).toBe(true)
    expect(isAssignedProtectionOfficer('got_officer', current(), 'GOT-OFF-002')).toBe(true)
    expect(current().assignedOfficerUserId).toBe('OFF-001')
    store().setApprovedMethods(NO, [1])
    expect(current().stage).toBe('notice') // Assignment alone cannot replace notice receipt and signed agreement.
    expect(store().checkResultNoticeReady(NO)).toBe(true)
    store().recordDispatch(NO, 'นำส่งโดยตรง', 'ส่ง-501')
    store().recordDelivery(NO, '2026-10-08T08:00:00Z', { recipient: current().person, ackType: 'ลงชื่อรับหนังสือ', ackDocument: 'หลักฐานรับ.pdf' })
    useFormDraftStore.getState().ensureDraftForCase(11, NO, {})
    useFormDraftStore.setState((state) => ({ signatures: { ...state.signatures, ...Object.fromEntries(KB11_SIGN_SLOTS.map((slot) => [slot.key, { signed: true, signerName: 'ผู้ลงนามทดสอบ', signedAt: '08/10/2569 15:00' }])) } }))
    store().updateCase(NO, { kb11Signed: true })
    store().recordConsent(NO, { ref: 'kb11', consented: true, by: current().person })
    store().setApprovedMethods(NO, [1])
    expect(current().stage).toBe('method_operation')
    expect(current().owner).toBe('นายธันวา พิทักษ์พยาน')
    store().setMethodStatus(NO, 1, 'active')
    expect(current().stage).toBe('protection')
    expect(current().protectionHandoff?.step).toBe('active')
    expect(current().activity7State).toBe('approved')
    expect(current().protectionHandoff?.events).toHaveLength(6)
    store().setMethodStatus(NO, 1, 'active')
    expect(current().protectionHandoff?.events).toHaveLength(6)
    expect(current().protectionHandoff?.events.every((e) => e.actorUserId && e.at && e.fromUserId && e.toUserId)).toBe(true)
  })

  it('เจ้าของสำนวนเดิมเปลี่ยนสถานะปฏิบัติงานแทน กอท. หรือส่งย้อนกลับเลขาธิการไม่ได้', () => {
    progressToAssignment()
    expect(store().advanceProtectionHandoff(NO, 'assign', 'มอบหมาย', 'GOT-OFF-001')).toBe(true)
    role('officer')
    const before = structuredClone(current())
    store().setApprovedMethods(NO, [1])
    store().recordConsent(NO, { ref: 'kb11', consented: true, by: current().person })
    store().submitOutgoingForSignature(NO)
    store().forwardCase(NO, 'external_pending', 'ส่งซ้ำ')
    store().assignOfficer(NO, 'OFF-002', 'เปลี่ยนเจ้าของ')
    expect(current()).toEqual(before)
    role('secretary')
    store().secretaryReject(NO, 'ซ้ำ', 'ไม่อนุมัติอีกครั้ง')
    store().secretaryReturn(NO, 'ซ้ำ', 'ส่งกลับหลังอนุมัติ')
    expect(current()).toEqual(before)
  })

  it('บันทึก persist ครบขั้น และแจ้งเตือนเฉพาะผู้รับงานถัดไป', async () => {
    progressToAssignment()
    expect(store().advanceProtectionHandoff(NO, 'assign', 'มอบหมาย', 'GOT-OFF-001')).toBe(true)
    const before = structuredClone(current())
    const serialized = JSON.parse(localStorage.getItem('ecmis-case-storage-v2')!).state.cases[0]
    expect(serialized.protectionHandoff).toEqual(before.protectionHandoff)
    useCaseStore.setState({ cases: [] })
    // จำลองข้อมูลที่ดิสก์ยังคงเดิมหลังบูตใหม่
    localStorage.setItem('ecmis-case-storage-v2', JSON.stringify({ state: { cases: [before], activeCaseNo: NO, customTransferAgencies: [] }, version: 0 }))
    await useCaseStore.persist.rehydrate()
    expect(current()).toEqual(before)
    const notes = useNotificationStore.getState().notifications
    expect(notes.map((n) => n.toUserId)).toEqual(['GOT-OFF-001', 'GOT-DIR-001', 'GOT-REC-001'])
    expect(filterNotificationsForUser(notes, ['OFF-001'], 'officer')).toHaveLength(0)
  })

  it('เส้นทางไม่อนุมัติและส่งกลับก่อนอนุมัติยังเป็นเส้นทางเดิม', () => {
    store().secretaryReject(NO, 'ลธ. ไม่อนุมัติ', 'เหตุผล')
    expect(current().activity7State).toBe('rejected')
    expect(current().protectionHandoff).toBeUndefined()
    expect(current().extraForms).toContain(10)
    useCaseStore.setState({ cases: [initial()] })
    store().secretaryReturn(NO, 'เอกสารไม่ครบ', 'ขอข้อมูลเพิ่ม')
    expect(current().activity7State).toBe('returned')
    expect(current().stage).toBe('director_review')
    expect(current().protectionHandoff).toBeUndefined()
  })
})
