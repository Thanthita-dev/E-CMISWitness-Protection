import { beforeEach, describe, expect, it } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { useFormDraftStore } from '../store/useFormDraftStore'
import { useNotificationStore } from '../store/useNotificationStore'
import type { CaseItem } from '../types/case'
import { KB6_SIGNERS, canEditKb6Opinion } from './formSignature'
import { isGotReviewCase, isHandoffQueueCase, canViewHandoffCase } from './protectionHandoff'
import { isMyQueueCase } from './permissions'
import { activeSarabanCheckpoint, dispatchUnitFor } from './saraban'
import { ECMIS_USER_DIRECTORY } from './constants'
import { passSarabanCheckpoint } from './sarabanTestHelpers'

/** FB-018 — รองเลขาธิการฯ เห็นควร / ไม่เห็นควร และปลายทางส่งกลับ (เจ้าของเรื่อง / กอท.) */

const NO = '0501/2569'
const GOT_OFFICER_ID = 'GOT-OFF-001'
const initial = (): CaseItem => ({
  no: NO, form: 'คบ.1', person: 'นางสาวกมลชนก บุญรักษา', stage: 'deputy_review',
  status: 'รอรองเลขาธิการ ป.ป.ท. กลั่นกรอง', owner: 'นายพิพัฒน์ ศรีสุวรรณ', next: 'รองเลขาธิการฯ กลั่นกรอง', risk: 'สูง',
  assignedOfficerUserId: 'OFF-001', assignedOfficer: 'นางสาวอรุณี ใจมั่น',
  mainCaseNo: 'กบค. 001/2569', documents: [{ id: 'SRC-1', category: 'source', name: 'เอกสารต้นทาง.pdf' }], assignmentHistory: [],
  kb6PreparedAt: '2026-10-01T08:00:00.000Z',
  kb6SupervisorSignedAt: '2026-10-02', kb6DirectorSignedAt: '2026-10-03',
})
const store = () => useCaseStore.getState()
const current = () => store().cases.find((c) => c.no === NO)!
const role = (r: Parameters<ReturnType<typeof useAuthStore.getState>['setRole']>[0]) => useAuthStore.getState().setRole(r)

beforeEach(() => {
  localStorage.clear()
  useCaseStore.setState({ cases: [initial()], activeCaseNo: NO })
  useAuthStore.setState({ currentOfficerUserId: 'OFF-001' })
  role('deputy_secretary')
  useFormDraftStore.setState({ drafts: { 6: { 'รูปแบบคุ้มครองที่เลือก': [1] } }, draftCaseNo: { 6: NO }, caseDrafts: {} })
  useNotificationStore.setState({ notifications: [], unreadCount: 0 })
})

describe('FB-018 · ผลความเห็นรองเลขาธิการฯ', () => {
  it('ไม่ระบุผลความเห็น = เห็นควร (โหมดสาธิต) ส่งเลขาธิการฯ ได้และลงนามแล้วบันทึกเป็นเห็นควร', () => {
    expect(current().kb6DeputyOpinionChoice).toBeUndefined()
    store().signKb6(NO, 'deputy')
    expect(current().kb6DeputyOpinionChoice).toBe('agree')
    store().forwardCase(NO, 'external_pending', 'เห็นควร')
    expect(current().stage).toBe('external_pending')
    expect(current().deputyReviewState).toBe('screened')
    expect(current().kb6DeputyOpinionChoice).toBe('agree')
  })

  it('เลือกไม่เห็นควร: ส่งต่อเลขาธิการฯ ไม่ได้ และเลือกได้เฉพาะตอนอยู่ขั้นรองเลขาธิการฯ', () => {
    expect(store().setDeputyOpinionChoice(NO, 'disagree')).toBe(true)
    expect(current().kb6DeputyOpinionChoice).toBe('disagree')
    expect(current().assignmentHistory?.at(-1)?.action).toContain('ไม่เห็นควร')

    store().forwardCase(NO, 'external_pending', 'พยายามส่งต่อ')
    expect(current().stage).toBe('deputy_review')

    // เปลี่ยนเป็นเห็นควรแล้วส่งได้
    expect(store().setDeputyOpinionChoice(NO, 'agree')).toBe(true)
    store().forwardCase(NO, 'external_pending')
    expect(current().stage).toBe('external_pending')

    // พ้นขั้นแล้วเปลี่ยนผลความเห็นไม่ได้
    expect(store().setDeputyOpinionChoice(NO, 'disagree')).toBe(false)
  })

  it('ส่งกลับเจ้าของเรื่อง: กลับเจ้าหน้าที่ผู้รับผิดชอบผ่านธุรการ ล้างผลความเห็น ไม่มีรอบ กอท.', () => {
    store().setDeputyOpinionChoice(NO, 'disagree')
    store().returnCase(NO, 'รองเลขาธิการ ป.ป.ท.', 'วิธีคุ้มครองที่เสนอยังไม่สอดคล้องกับระดับภัย', 'ปรับวิธีคุ้มครอง', 'officer', 'deputy_secretary', { destination: 'owner' })
    const c = current()
    expect(c.stage).toBe('staff_review')
    expect(c.returned).toBe(true)
    expect(c.returnDestination).toBe('owner')
    expect(c.gotRevision).toBeUndefined()
    expect(c.kb6DeputyOpinionChoice).toBeUndefined()
    expect(c.kb6DeputySignedAt).toBeUndefined()
    expect(c.sarabanDispatch?.direction).toBe('down')
    expect(c.sarabanDispatch?.unitClerkRole).toBe('receiver')
    expect(c.assignmentHistory?.some((h) => String(h.detail).includes('ไม่เห็นควร'))).toBe(true)
  })

  it('ส่งกลับ กอท.: ผู้รับผิดชอบ กอท. ทำต่อ ผ่านธุรการ กอท. และเจ้าของเรื่องเดิมไม่เห็นเป็นงานของตน', () => {
    store().setDeputyOpinionChoice(NO, 'disagree')
    store().returnCase(NO, 'รองเลขาธิการ ป.ป.ท.', 'วิธีคุ้มครองที่เสนอยังไม่สอดคล้องกับระดับภัย', 'ให้ กอท. ปรับวิธีคุ้มครอง', 'officer', 'deputy_secretary', { destination: 'got' })
    let c = current()
    expect(c.stage).toBe('staff_review')
    expect(c.returnDestination).toBe('got')
    expect(c.gotRevision?.assigneeUserId).toBe(GOT_OFFICER_ID)
    expect(c.sarabanDispatch?.unitClerkRole).toBe('got_receiver')
    expect(c.assignmentHistory?.some((h) => String(h.detail).includes('กองอำนวยการต่อต้านทุจริต'))).toBe(true)
    // เจ้าของสำนวนเดิม (assignedOfficerUserId) ไม่เปลี่ยน — คงไว้ให้ขั้นอนุมัติหลังเสนอใช้ต่อ
    expect(c.assignedOfficerUserId).toBe('OFF-001')

    // ธุรการ สลธ. ออกเลขส่ง → ธุรการ กอท. ลงเลขรับ
    expect(activeSarabanCheckpoint(c)).toBe('secretary_outgoing')
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(passSarabanCheckpoint(NO)).toBe(true)
    c = current()
    expect(c.sarabanDispatch).toBeUndefined()
    expect(c.stage).toBe('staff_review')
    expect(c.owner).toBe(c.gotRevision?.assigneeName)

    expect(isMyQueueCase('officer', c, 'OFF-001')).toBe(false)
    expect(isMyQueueCase('got_officer', c, GOT_OFFICER_ID)).toBe(true)
    expect(isHandoffQueueCase('got_officer', c, GOT_OFFICER_ID)).toBe(true)
    expect(canViewHandoffCase('got_supervisor', c, 'GOT-SUP-001')).toBe(true)
  })

  it('กอท. แก้แล้วเสนอ ผบช.ต้น กอท. → ผอ. กอท. → ธุรการ → กลับรองเลขาธิการฯ และเห็นควรส่งเลขาธิการฯ ต่อได้', () => {
    store().returnCase(NO, 'รองเลขาธิการ ป.ป.ท.', 'ชุดเสนอไม่ครบ', 'ให้ กอท. แก้', 'officer', 'deputy_secretary', { destination: 'got' })
    passSarabanCheckpoint(NO)
    passSarabanCheckpoint(NO)
    expect(current().sarabanDispatch).toBeUndefined()

    store().forwardCase(NO, store().getNextStage(current()))
    expect(current().stage).toBe('supervisor_review')
    expect(isGotReviewCase(current(), 'supervisor')).toBe(true)
    const supSigner = KB6_SIGNERS.find((s) => s.role === 'supervisor')!
    expect(canEditKb6Opinion(supSigner, 'got_supervisor', current())).toBe(true)
    expect(canEditKb6Opinion(supSigner, 'supervisor', current())).toBe(true)

    store().forwardCase(NO, store().getNextStage(current()))
    expect(current().stage).toBe('director_review')
    expect(isGotReviewCase(current(), 'director')).toBe(true)
    const dirSigner = KB6_SIGNERS.find((s) => s.role === 'director')!
    expect(canEditKb6Opinion(dirSigner, 'got_director', current())).toBe(true)

    role('got_director')
    store().forwardCase(NO, store().getNextStage(current()))
    expect(current().stage).toBe('director_outgoing_registry')
    expect(current().sarabanOriginUnitId).toBe('central-gmc')
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(current().stage).toBe('deputy_review')
    expect(current().gotRevision).toBeDefined()

    role('deputy_secretary')
    store().signKb6(NO, 'deputy')
    store().forwardCase(NO, 'external_pending')
    expect(current().stage).toBe('external_pending')
    expect(current().gotRevision).toBeUndefined()
  })

  it('ส่งกลับ กอท. รอบแรกแล้วส่งกลับเจ้าของเรื่องรอบถัดไป: ล้างรอบ กอท. ออก', () => {
    store().returnCase(NO, 'รองเลขาธิการ ป.ป.ท.', 'ชุดเสนอไม่ครบ', 'ให้ กอท. แก้', 'officer', 'deputy_secretary', { destination: 'got' })
    expect(current().gotRevision).toBeDefined()
    useCaseStore.setState({ cases: [{ ...current(), stage: 'deputy_review', sarabanDispatch: undefined }] })
    store().returnCase(NO, 'รองเลขาธิการ ป.ป.ท.', 'ชุดเสนอไม่ครบ', 'ให้เจ้าของเรื่องแก้', 'officer', 'deputy_secretary', { destination: 'owner' })
    expect(current().gotRevision).toBeUndefined()
    expect(current().returnDestination).toBe('owner')
  })
  it('ลงนามข้อ 12 แล้วเปลี่ยนผลความเห็นไม่ได้ และเฉพาะรองเลขาธิการฯ/ผู้ดูแลระบบเปลี่ยนได้', () => {
    role('officer')
    expect(store().setDeputyOpinionChoice(NO, 'disagree')).toBe(false)
    role('deputy_secretary')
    expect(store().setDeputyOpinionChoice(NO, 'disagree')).toBe(true)
    store().signKb6(NO, 'deputy')
    expect(store().setDeputyOpinionChoice(NO, 'agree')).toBe(false)
    expect(current().kb6DeputyOpinionChoice).toBe('disagree')
  })

  it('ส่งกลับเจ้าของเรื่องหลังรอบ กอท.: ล้างหน่วยต้นทาง central-gmc ให้ธุรการหน่วยเจ้าของสำนวนรับเรื่อง', () => {
    useCaseStore.setState({ cases: [{ ...current(), gotRevision: { assigneeUserId: GOT_OFFICER_ID, assigneeName: 'x', at: 't', by: 'y' }, sarabanOriginUnitId: 'central-gmc' }] })
    expect(store().returnCase(NO, 'รองเลขาธิการ ป.ป.ท.', 'ชุดเสนอไม่ครบ', 'ให้เจ้าของเรื่องแก้', 'officer', 'deputy_secretary', { destination: 'owner' })).toBe(true)
    expect(current().sarabanOriginUnitId).toBeUndefined()
    expect(dispatchUnitFor(current())).toEqual({ role: 'receiver', unitId: expect.not.stringMatching(/^central-gmc$/) })
  })

  it('ส่งกลับ กอท. ไม่ได้เมื่อไม่มีผู้รับผิดชอบ กอท. ให้มอบ — คืน false และแฟ้มไม่เปลี่ยน', () => {
    const saved = ECMIS_USER_DIRECTORY.map((u) => u.active)
    ECMIS_USER_DIRECTORY.forEach((u) => { if (u.roles.includes('got_officer')) u.active = false })
    try {
      expect(store().returnCase(NO, 'รองเลขาธิการ ป.ป.ท.', 'ชุดเสนอไม่ครบ', 'ให้ กอท. แก้', 'officer', 'deputy_secretary', { destination: 'got' })).toBe(false)
      expect(current().stage).toBe('deputy_review')
      expect(current().gotRevision).toBeUndefined()
    } finally {
      ECMIS_USER_DIRECTORY.forEach((u, i) => { u.active = saved[i] })
    }
  })
})
