import { beforeEach, describe, expect, it } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { useFormDraftStore } from '../store/useFormDraftStore'
import { useNotificationStore } from '../store/useNotificationStore'
import type { CaseItem } from '../types/case'
import { activeSarabanCheckpoint, sarabanCheckpointProgress, sarabanDefaultRecipient, sarabanRecipientsFor, sarabanRecordFor, sarabanStampsFor, suggestSarabanInput, validateSarabanInput } from './saraban'
import { isMyQueueCase } from './permissions'
import { canViewHandoffCase, isHandoffQueueCase } from './protectionHandoff'
import { passDirectorToDeputy, passSarabanCheckpoint, recordSarabanCheckpoint } from './sarabanTestHelpers'

const NO = '0501/2569'
const initial = (): CaseItem => ({
  no: NO, form: 'คบ.1', person: 'นางสาวกมลชนก บุญรักษา', stage: 'director_review',
  status: 'รอ ผอ.สำนัก/กองพิจารณา', owner: 'นายวีระยุทธ พิทักษ์ธรรม', next: 'ผอ. ลงนาม คบ.6', risk: 'สูง',
  assignedOfficerUserId: 'OFF-001', assignedOfficer: 'นางสาวอรุณี ใจมั่น',
  mainCaseNo: 'กบค. 001/2569', documents: [{ id: 'SRC-1', category: 'source', name: 'เอกสารต้นทาง.pdf' }], assignmentHistory: [],
})
const store = () => useCaseStore.getState()
const current = () => store().cases.find((c) => c.no === NO)!
const role = (r: Parameters<ReturnType<typeof useAuthStore.getState>['setRole']>[0]) => useAuthStore.getState().setRole(r)
/** ผู้รับตั้งต้นของจุดนั้น — เลขสารบรรณออกต่อผู้รับ ไม่ใช่ต่อ คบ. */
const def = (cp: Parameters<typeof sarabanDefaultRecipient>[1]) => sarabanDefaultRecipient(current(), cp)
const input = (number = '541') => ({ number, date: '2026-10-12', time: '09:30' })

/** เลขาธิการอนุมัติ — เตรียมแฟ้มให้อยู่ขั้น external_pending ตามที่ secretaryApprove ต้องการ */
const approve = (destination: 'got' | 'original_owner') => {
  useCaseStore.setState({ cases: [{ ...initial(), stage: 'external_pending', kb6SecretarySignedAt: '2026-10-07T08:00:00.000Z' }] })
  role('secretary')
  return store().secretaryApprove(NO, 'ลธ. 501/2569', 'สมควรคุ้มครอง', destination, 'ดำเนินการตามวิธีที่อนุมัติ', 30)
}

beforeEach(() => {
  localStorage.clear()
  useCaseStore.setState({ cases: [initial()], activeCaseNo: NO })
  useAuthStore.setState({ currentOfficerUserId: 'OFF-001' })
  role('director')
  const noticeFields = { เลขที่หนังสือ: 'ปป 001', ปีหนังสือ: '501', วันที่: '7', เดือน: 'ตุลาคม', 'พ.ศ.': '2569', คำร้องลงวันที่: '1 ตุลาคม 2569' }
  useFormDraftStore.setState({ drafts: { 6: { 'รูปแบบคุ้มครองที่เลือก': [1] }, 9: noticeFields, 10: { ...noticeFields } }, draftCaseNo: { 6: NO, 9: NO, 10: NO }, caseDrafts: {} })
  useNotificationStore.setState({ notifications: [], unreadCount: 0 })
})

describe('ทะเบียนสารบรรณ — ผอ.สำนัก/กอง → รองเลขาธิการ', () => {
  it('ผอ. ส่งแล้วไปธุรการสำนัก/กอง ออกเลขส่ง → ธุรการ สลธ. ลงเลขรับ → รองเลขาธิการ', () => {
    expect(store().getNextStage(current())).toBe('director_outgoing_registry')
    store().forwardCase(NO, 'director_outgoing_registry')
    expect(current().stage).toBe('director_outgoing_registry')
    expect(current().sarabanRound).toBe(1)
    expect(current().status).toBe('รอธุรการสำนัก/กอง ออกเลขทะเบียนส่ง')
    expect(current().deputyReviewState).toBeUndefined()
    expect(activeSarabanCheckpoint(current())).toBe('director_outgoing')
    expect(isMyQueueCase('secretary_receiver', current(), 'SECREC-001')).toBe(false)

    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(current().stage).toBe('secretary_incoming_registry')
    expect(current().owner).toBe('นางสาวกนกวรรณ สารบรรณ')
    expect(isMyQueueCase('secretary_receiver', current(), 'SECREC-001')).toBe(true)

    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(current().stage).toBe('deputy_review')
    expect(current().deputyReviewState).toBe('pending')
    expect(current().status).toBe('รอรองเลขาธิการ ป.ป.ท. กลั่นกรอง')
    // ตราประทับของแต่ละ คบ. เก็บทั้งขาออกและขาเข้า — ผู้รับรายเดียวต่อจุด จึงมีทะเบียนจุดละ 1 เลขครอบคลุมทั้งชุด
    expect(sarabanStampsFor(current(), 6).map((r) => r.checkpoint)).toEqual(['director_outgoing', 'secretary_incoming'])
    expect(sarabanStampsFor(current(), 1).map((r) => r.number)).toEqual(sarabanStampsFor(current(), 6).map((r) => r.number))
    expect(current().sarabanRecords).toHaveLength(2)
    expect(current().sarabanRecords![0].forms).toEqual([1, 3, 6])
  })

  it('ส่งต่อไม่ได้จนกว่าจะลงเลขครบทุกผู้รับ และต้องเป็นธุรการของจุดนั้น', () => {
    store().forwardCase(NO, 'director_outgoing_registry')
    const to = def('director_outgoing')
    role('director')
    expect(store().recordSaraban(NO, 'director_outgoing', to, input())).toBe(false) // ไม่ใช่ธุรการ
    role('secretary_receiver')
    expect(store().recordSaraban(NO, 'director_outgoing', to, input())).toBe(false) // ผิดจุด/ผิดธุรการ
    role('receiver')
    expect(store().recordSaraban(NO, 'secretary_incoming', def('secretary_incoming'), input())).toBe(false) // จุดนี้ยังไม่ถึง
    expect(store().recordSaraban(NO, 'director_outgoing', 'ผู้รับที่ไม่อยู่ในรายการ', input())).toBe(false)
    expect(store().recordSaraban(NO, 'director_outgoing', to, { ...input(), number: ' ' })).toBe(false)
    expect(store().recordSaraban(NO, 'director_outgoing', to, { ...input(), date: '' })).toBe(false)
    expect(store().submitSarabanCheckpoint(NO)).toBe(false)
    // ผู้รับรายเดียว = เลขเดียวครอบคลุม คบ.1/3/6 ทั้งชุด
    expect(store().recordSaraban(NO, 'director_outgoing', to, input('540'))).toBe(true)
    expect(sarabanCheckpointProgress(current(), 'director_outgoing')).toMatchObject({ complete: true, forms: [1, 3, 6] })
    // เพิ่มผู้รับอีกราย — ต้องได้เลขของตนเองก่อนส่ง
    expect(store().addSarabanRecipient(NO, 'director_outgoing', ' ')).toBe(false)
    expect(store().addSarabanRecipient(NO, 'director_outgoing', to)).toBe(false) // ซ้ำ
    expect(store().addSarabanRecipient(NO, 'director_outgoing', 'สำนักงานเลขาธิการ (สำเนา)')).toBe(true)
    expect(sarabanRecipientsFor(current(), 'director_outgoing')).toEqual([to, 'สำนักงานเลขาธิการ (สำเนา)'])
    expect(sarabanCheckpointProgress(current(), 'director_outgoing')).toMatchObject({ complete: false })
    expect(store().submitSarabanCheckpoint(NO)).toBe(false)
    expect(store().recordSaraban(NO, 'director_outgoing', 'สำนักงานเลขาธิการ (สำเนา)', input('541'))).toBe(true)
    // ตราประทับบน คบ. ทุกฉบับในชุดแสดงเลขของทุกผู้รับ
    for (const n of [1, 3, 6]) expect(sarabanStampsFor(current(), n).map((r) => r.number)).toEqual(['540', '541'])
    expect(store().removeSarabanRecipient(NO, 'director_outgoing', 'สำนักงานเลขาธิการ (สำเนา)')).toBe(false) // ลงเลขแล้วลบไม่ได้
    role('director')
    expect(store().submitSarabanCheckpoint(NO)).toBe(false) // ผอ. ส่งแทนธุรการไม่ได้
    role('receiver')
    expect(store().submitSarabanCheckpoint(NO)).toBe(true)
    expect(current().stage).toBe('secretary_incoming_registry')
    expect(store().submitSarabanCheckpoint(NO)).toBe(false) // ส่งซ้ำไม่ได้
  })

  it('ผู้รับที่เพิ่มเองลบได้ถ้ายังไม่ลงเลข ผู้รับตั้งต้นลบไม่ได้ และข้อมูลเดิมที่ลงรายฉบับยังนับเป็นผู้รับตั้งต้น', () => {
    store().forwardCase(NO, 'director_outgoing_registry')
    role('receiver')
    const to = def('director_outgoing')
    expect(store().addSarabanRecipient(NO, 'director_outgoing', 'ผู้รับเพิ่ม')).toBe(true)
    expect(store().removeSarabanRecipient(NO, 'director_outgoing', to)).toBe(false)
    expect(store().removeSarabanRecipient(NO, 'director_outgoing', 'ผู้รับเพิ่ม')).toBe(true)
    expect(sarabanRecipientsFor(current(), 'director_outgoing')).toEqual([to])
    // ข้อมูลเดิม: ทะเบียนรายฉบับไม่มี recipient/forms
    const legacy = { id: 'SRB-old', checkpoint: 'director_outgoing' as const, direction: 'outgoing' as const, formNo: 3, number: '500', date: '2026-10-01', time: '09:00', unitName: 'x', clerkUserId: 'u', clerkName: 'ก', recordedAt: '', round: 1 }
    useCaseStore.setState({ cases: [{ ...current(), sarabanRecords: [legacy] }] })
    // เลขเดิมฉบับเดียวยังไม่ครอบคลุมทั้งชุด คบ.1/3/6 — จุดนั้นยังไม่ครบ
    expect(sarabanCheckpointProgress(current(), 'director_outgoing').complete).toBe(false)
    // เลขเดิมรวมกันครอบคลุมทั้งชุด — นับเป็นของผู้รับตั้งต้น
    const legacy1 = { ...legacy, id: 'SRB-old1', formNo: 1, number: '498' }
    const legacy6 = { ...legacy, id: 'SRB-old6', formNo: 6, number: '502' }
    useCaseStore.setState({ cases: [{ ...current(), sarabanRecords: [legacy1, legacy, legacy6] }] })
    expect(sarabanCheckpointProgress(current(), 'director_outgoing').complete).toBe(true)
    useCaseStore.setState({ cases: [{ ...current(), sarabanRecords: [legacy] }] })
    expect(sarabanStampsFor(current(), 3).map((r) => r.number)).toEqual(['500'])
    expect(sarabanStampsFor(current(), 1)).toEqual([])
  })

  it('ลงเลขซ้ำให้ผู้รับเดิมของรอบเดียวกัน ฉบับล่าสุดแทนที่ และบันทึกผู้ลงทะเบียน', () => {
    store().forwardCase(NO, 'director_outgoing_registry')
    role('receiver')
    expect(store().recordSaraban(NO, 'director_outgoing', def('director_outgoing'), input('540'))).toBe(true)
    expect(store().recordSaraban(NO, 'director_outgoing', def('director_outgoing'), input('999'))).toBe(true)
    const rec = sarabanRecordFor(current(), 'director_outgoing', def('director_outgoing'))!
    expect(rec.number).toBe('999')
    expect(rec.direction).toBe('outgoing')
    expect(rec.clerkUserId).toBe('REC-001')
    expect(rec.id.startsWith('SRB-')).toBe(true)
    expect(current().sarabanRecords).toHaveLength(1)
    expect(current().assignmentHistory!.length).toBeGreaterThanOrEqual(2)
  })

  it('ตีกลับจากรองเลขาธิการไม่ผ่านธุรการ และเสนอใหม่เพิ่มรอบทะเบียน', () => {
    store().forwardCase(NO, 'director_outgoing_registry')
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(current().stage).toBe('deputy_review')
    store().returnCase(NO, 'นายพิพัฒน์ ศรีสุวรรณ', 'ข้อมูลไม่ครบ', 'แก้ไข', 'officer', 'deputy_secretary')
    expect(current().stage).toBe('staff_review')
    // ส่งคืนลงหน่วยผ่านธุรการ สลธ. → ธุรการหน่วย (ชุดนำส่ง flow decision) ซึ่งเป็นรอบทะเบียนของขาลงเอง
    expect(current().sarabanDispatch?.flow).toBe('decision')
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(current().sarabanDispatch).toBeUndefined()
    expect(current().stage).toBe('staff_review')
    expect(current().sarabanRound).toBe(2)
    // เสนอใหม่
    store().forwardCase(NO, 'director_review')
    store().forwardCase(NO, 'director_outgoing_registry')
    expect(current().sarabanRound).toBe(3)
    expect(sarabanRecordFor(current(), 'director_outgoing', def('director_outgoing'))).toBeUndefined()
    expect(store().submitSarabanCheckpoint(NO)).toBe(false)
    expect(passDirectorToDeputy(NO)).toBe(true)
    expect(current().stage).toBe('deputy_review')
    expect(sarabanRecordFor(current(), 'secretary_incoming', def('secretary_incoming'))!.round).toBe(3)
  })
})

describe('ทะเบียนสารบรรณ — หลังเลขาธิการอนุมัติ', () => {
  it('ปลายทาง กอท.: ธุรการ สลธ. ออกเลขส่ง → ธุรการ กอท. ลงเลขรับ → รับเรื่อง', () => {
    expect(approve('got')).toBe(true)
    expect(current().protectionHandoff?.step).toBe('pending_outgoing')
    expect(current().owner).toBe('นางสาวกนกวรรณ สารบรรณ')
    expect(isHandoffQueueCase('got_receiver', current(), 'GOT-REC-001')).toBe(false)
    expect(canViewHandoffCase('got_receiver', current(), 'GOT-REC-001')).toBe(false)
    expect(useNotificationStore.getState().notifications[0].toUserId).toBe('SECREC-001')
    expect(sarabanCheckpointProgress(current(), 'secretary_outgoing').forms).toEqual([1, 3, 6, 9])
    expect(sarabanCheckpointProgress(current(), 'secretary_outgoing').recipients).toHaveLength(1)

    role('got_receiver')
    expect(store().advanceProtectionHandoff(NO, 'receive')).toBe(false)
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(current().protectionHandoff?.step).toBe('pending_receipt')
    expect(isHandoffQueueCase('got_receiver', current(), 'GOT-REC-001')).toBe(true)
    expect(useNotificationStore.getState().notifications[0].toUserId).toBe('GOT-REC-001')

    // ยังไม่ลงเลขรับ รับเรื่องไม่ได้
    role('got_receiver')
    expect(store().advanceProtectionHandoff(NO, 'receive')).toBe(false)
    expect(store().addSarabanRecipient(NO, 'destination_incoming', 'ผู้รับอีกราย')).toBe(false) // ขาเข้าเพิ่มผู้รับไม่ได้
    expect(sarabanCheckpointProgress(current(), 'destination_incoming').recipients).toHaveLength(1)
    expect(store().recordSaraban(NO, 'destination_incoming', def('destination_incoming'), input('720'))).toBe(true)
    role('receiver')
    expect(store().recordSaraban(NO, 'destination_incoming', def('destination_incoming'), input('720'))).toBe(false)
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(current().protectionHandoff?.step).toBe('received')
    expect(current().protectionHandoff?.events).toHaveLength(3)
    role('got_receiver')
    expect(store().advanceProtectionHandoff(NO, 'submit')).toBe(true)
    expect(current().protectionHandoff?.step).toBe('pending_assignment')
  })

  it('ปลายทางเจ้าของสำนวนเดิม: ธุรการสำนัก/กอง ลงเลขรับแล้วจึงรับงาน (accepted)', () => {
    expect(approve('original_owner')).toBe(true)
    expect(current().protectionHandoff?.step).toBe('pending_outgoing')
    expect(current().protectionHandoff?.assigneeUserId).toBeUndefined()
    expect(isMyQueueCase('officer', current(), 'OFF-001')).toBe(true)
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(current().protectionHandoff?.step).toBe('pending_receipt')
    expect(current().owner).toBe('นายสมบัติ รับสารบรรณ')
    expect(activeSarabanCheckpoint(current())).toBe('destination_incoming')
    role('secretary_receiver')
    expect(store().recordSaraban(NO, 'destination_incoming', def('destination_incoming'), input())).toBe(false)
    role('receiver')
    expect(store().submitSarabanCheckpoint(NO)).toBe(false)
    expect(recordSarabanCheckpoint(NO)).toBe(true)
    expect(current().protectionHandoff?.step).toBe('pending_receipt')
    expect(store().submitSarabanCheckpoint(NO)).toBe(true)
    const h = current().protectionHandoff!
    expect(h.step).toBe('accepted')
    expect(h.assigneeUserId).toBe('OFF-001')
    expect(h.acceptedAt).toBeTruthy()
    expect(h.events).toHaveLength(3)
    expect(current().owner).toBe('นางสาวอรุณี ใจมั่น')
    expect(current().status).toBe('อนุมัติและลงนาม คบ.9 แล้ว · ส่งเจ้าของสำนวนเดิมดำเนินการต่อ')
    expect(activeSarabanCheckpoint(current())).toBeNull()
    expect(useNotificationStore.getState().notifications[0].toUserId).toBe('OFF-001')
  })
})

describe('ตัวช่วยทะเบียน', () => {
  it('validate / suggest', () => {
    expect(Object.keys(validateSarabanInput({ number: '', date: '', time: '' }))).toHaveLength(3)
    expect(validateSarabanInput(suggestSarabanInput({}, 'director_outgoing'))).toEqual({})
  })
})

describe('ทะเบียนสารบรรณ — ธุรการตามหน่วยงาน และเลขแนะนำรายฉบับ', () => {
  it('ผอ. เขต 1 ส่งชุดเสนอ — ธุรการ เขต 1 เป็นผู้ออกเลขส่ง ธุรการส่วนกลางลงเลขไม่ได้', () => {
    useCaseStore.setState({ cases: [{ ...initial(), orgUnitId: 'pacc-reg-1' }] })
    useAuthStore.getState().setOrgUnitId('pacc-reg-1')
    store().forwardCase(NO, 'director_outgoing_registry')
    expect(current().sarabanOriginUnitId).toBe('pacc-reg-1')
    expect(current().owner).toBe('นายประเสริฐ ลงรับดี')

    role('receiver')
    useAuthStore.getState().setOrgUnitId('central-gmc')
    expect(store().recordSaraban(NO, 'director_outgoing', def('director_outgoing'), input())).toBe(false)

    useAuthStore.getState().setOrgUnitId('pacc-reg-1')
    expect(store().recordSaraban(NO, 'director_outgoing', def('director_outgoing'), input())).toBe(true)
    expect(sarabanRecordFor(current(), 'director_outgoing', def('director_outgoing'))?.clerkName).toBe('นายประเสริฐ ลงรับดี')
    expect(sarabanRecordFor(current(), 'director_outgoing', def('director_outgoing'))?.unitName).toBe('สำนักงาน ป.ป.ท. เขต 1')
  })

  it('เลขแนะนำของแต่ละผู้รับในจุดเดียวกันไม่ซ้ำกัน', () => {
    const scoped = { sarabanRecords: [], sarabanRound: 1, orgUnitId: 'central-gmc', sarabanRecipients: [{ checkpoint: 'director_outgoing' as const, round: 1, name: 'ผู้รับอีกราย' }] }
    const numbers = [sarabanDefaultRecipient(scoped, 'director_outgoing'), 'ผู้รับอีกราย'].map((n) => suggestSarabanInput(scoped, 'director_outgoing', new Date(), n).number)
    expect(new Set(numbers).size).toBe(2)
  })
})
