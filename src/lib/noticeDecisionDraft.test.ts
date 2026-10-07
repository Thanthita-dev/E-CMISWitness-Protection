import { beforeEach, describe, expect, it } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { useFormDraftStore } from '../store/useFormDraftStore'
import { useNotificationStore } from '../store/useNotificationStore'
import type { CaseItem } from '../types/case'

const NO = 'WP-2569-000501'
const initial = (): CaseItem => ({
  no: NO, form: 'คบ.1', person: 'นางสาวกมลชนก บุญรักษา', stage: 'external_pending',
  status: 'รอเลขาธิการพิจารณา', owner: 'เลขาธิการ ป.ป.ท.', next: 'พิจารณา', risk: 'สูง',
  assignedOfficerUserId: 'OFF-001', assignedOfficer: 'นางสาวอรุณี ใจมั่น',
  mainCaseNo: 'กบค. 001/2569', createdAt: '2026-10-01T08:00:00Z',
  kb6SecretarySignedAt: '2026-10-07T08:00:00Z', documents: [], assignmentHistory: [],
})
const store = () => useCaseStore.getState()
const current = () => store().getCase(NO)!
const savedInput = (destination: 'original_owner' | 'got' = 'original_owner') => ({
  decisionNo: 'ลธ. 501/2569', reason: 'เห็นควรคุ้มครองพยานตามข้อเท็จจริงสมมติ',
  destination, instruction: 'ให้ดำเนินการตามผลพิจารณา', durationDays: 30,
  fields: { เลขที่หนังสือ: 'ปป 001' },
})
const noFinalEffects = () => {
  expect(current().activity7State).not.toBe('approved')
  expect(current().activity7State).not.toBe('rejected')
  expect(current().kb9Signed).not.toBe(true)
  expect(current().kb10Signed).not.toBe(true)
  expect(current().secretarySignedAt).toBeUndefined()
  expect(current().protectionHandoff).toBeUndefined()
  expect(current().dispatchedAt).toBeUndefined()
  expect(current().documents).toHaveLength(0)
  expect(useNotificationStore.getState().notifications).toHaveLength(0)
}

beforeEach(() => {
  localStorage.clear()
  useCaseStore.setState({ cases: [initial()], activeCaseNo: NO })
  useAuthStore.setState({ currentOfficerUserId: 'OFF-001' })
  useAuthStore.getState().setRole('secretary')
  useFormDraftStore.setState({ drafts: { 6: { 'รูปแบบคุ้มครองที่เลือก': [1] } }, draftCaseNo: { 6: NO }, caseDrafts: {}, locks: {}, signatures: {}, revisions: {}, draftTouched: {} })
  useNotificationStore.setState({ notifications: [], unreadCount: 0 })
})

describe('เลือกผลเบื้องต้นและร่างหนังสือก่อนยืนยันจริง', () => {
  for (const [outcome, formNo] of [['approved', 9], ['rejected', 10]] as const) {
    it(`เลือก ${outcome} เปิดร่าง คบ.${formNo} เดิมโดยยังไม่ลงนามหรือส่งงาน`, () => {
      expect(store().beginPreliminaryDecision(NO, outcome)).toBe(true)
      expect(current().preliminaryDecision?.formNo).toBe(formNo)
      expect(current().resultNotices?.[formNo]?.original).toBeUndefined()
      const prepared = current().resultNotices?.[formNo]?.preparedAt
      const formCount = Object.keys(current().resultNotices || {}).length
      expect(store().beginPreliminaryDecision(NO, outcome)).toBe(true)
      expect(current().resultNotices?.[formNo]?.preparedAt).toBe(prepared)
      expect(Object.keys(current().resultNotices || {})).toHaveLength(formCount)
      noFinalEffects()
    })
  }

  it('บันทึกร่างและรีเฟรชคงข้อมูลโดยไม่มีผลพิจารณาหรือแจ้งเตือน', async () => {
    expect(store().beginPreliminaryDecision(NO, 'approved')).toBe(true)
    expect(store().savePreliminaryDecision(NO, 9, savedInput())).toBe(true)
    expect(current().preliminaryDecision).toMatchObject({ formNo: 9, decisionNo: 'ลธ. 501/2569', reason: savedInput().reason, destination: 'original_owner' })
    expect(current().resultNotices?.[9]?.fields['เลขที่หนังสือ']).toBe('ปป 001')
    noFinalEffects()
    const before = structuredClone(current())
    const serialized = localStorage.getItem('ecmis-case-storage-v2')!
    useCaseStore.setState({ cases: [] })
    localStorage.setItem('ecmis-case-storage-v2', serialized)
    await useCaseStore.persist.rehydrate()
    expect(current()).toEqual(before)
    noFinalEffects()
  })

  it('เปลี่ยนผลก่อนยืนยันใช้ร่างล่าสุดและเก็บร่างอีกแบบไว้ไม่ลบข้อมูล', () => {
    expect(store().beginPreliminaryDecision(NO, 'approved')).toBe(true)
    expect(store().savePreliminaryDecision(NO, 9, savedInput('got'))).toBe(true)
    const approvedDraft = structuredClone(current().noticeDecisionDrafts?.[9])
    expect(store().beginPreliminaryDecision(NO, 'rejected')).toBe(true)
    expect(current().preliminaryDecision?.formNo).toBe(10)
    expect(store().savePreliminaryDecision(NO, 10, { ...savedInput(), reason: 'ไม่เข้าเงื่อนไขสมมติ', fields: { เลขที่หนังสือ: 'ปป 002' } })).toBe(true)
    const rejectedDraft = structuredClone(current().noticeDecisionDrafts?.[10])
    expect(current().noticeDecisionDrafts?.[9]).toEqual(approvedDraft)
    expect(store().beginPreliminaryDecision(NO, 'approved')).toBe(true)
    expect(current().preliminaryDecision).toMatchObject({ formNo: 9, reason: savedInput().reason, destination: 'got' })
    expect(current().noticeDecisionDrafts?.[10]).toEqual(rejectedDraft)
    expect(current().resultNotices?.[9]?.fields['เลขที่หนังสือ']).toBe('ปป 001')
    expect(current().resultNotices?.[10]?.fields['เลขที่หนังสือ']).toBe('ปป 002')
    noFinalEffects()
  })

  for (const destination of ['original_owner', 'got'] as const) {
    it(`ยืนยันครั้งที่สองส่งเฉพาะ ${destination} ครั้งเดียวและไม่ลงนามทั้งสองแบบ`, () => {
      expect(store().beginPreliminaryDecision(NO, 'approved')).toBe(true)
      expect(store().savePreliminaryDecision(NO, 9, savedInput(destination))).toBe(true)
      noFinalEffects()
      expect(store().confirmPreliminaryDecision(NO, 9)).toBe(true)
      expect(current().activity7State).toBe('approved')
      expect(current().kb9Signed).toBe(true)
      expect(current().kb10Signed).not.toBe(true)
      expect(current().resultNotices?.[9]?.status).toBe('signed_incomplete')
      expect(current().protectionHandoff?.destination).toBe(destination)
      expect(current().protectionHandoff?.step).toBe(destination === 'got' ? 'pending_receipt' : 'accepted')
      const signed = structuredClone(current())
      const notifications = structuredClone(useNotificationStore.getState().notifications)
      expect(store().confirmPreliminaryDecision(NO, 9)).toBe(false)
      expect(store().beginPreliminaryDecision(NO, 'rejected')).toBe(false)
      expect(store().savePreliminaryDecision(NO, 10, savedInput())).toBe(false)
      expect(current()).toEqual(signed)
      expect(useNotificationStore.getState().notifications).toEqual(notifications)
      expect(notifications).toHaveLength(1)
      expect(current().documents).toHaveLength(1)
    })
  }

  it('ไม่อนุมัติยืนยันครั้งเดียว ลงนามเฉพาะ คบ.10 ตามเส้นแจ้งผลเดิม', () => {
    expect(store().beginPreliminaryDecision(NO, 'rejected')).toBe(true)
    expect(store().savePreliminaryDecision(NO, 10, { ...savedInput(), reason: 'ไม่เข้าเงื่อนไขสมมติ' })).toBe(true)
    expect(store().confirmPreliminaryDecision(NO, 10)).toBe(true)
    expect(current().activity7State).toBe('rejected')
    expect(current().kb10Signed).toBe(true)
    expect(current().kb9Signed).not.toBe(true)
    expect(current().resultNotices?.[10]?.status).toBe('signed_incomplete')
    expect(current().protectionHandoff).toBeUndefined()
    expect(current().owner).toBe('นางสาวอรุณี ใจมั่น')
    expect(store().confirmPreliminaryDecision(NO, 10)).toBe(false)
  })

  it('ยืนยันไม่สำเร็จคงร่างไว้ให้แก้และลองใหม่โดยไม่สร้างผลสำเร็จ', () => {
    expect(store().beginPreliminaryDecision(NO, 'approved')).toBe(true)
    const incomplete = { ...savedInput(), destination: undefined }
    expect(store().savePreliminaryDecision(NO, 9, incomplete)).toBe(true)
    const draft = structuredClone(current().preliminaryDecision)
    expect(store().confirmPreliminaryDecision(NO, 9)).toBe(false)
    expect(current().preliminaryDecision).toEqual(draft)
    noFinalEffects()
    expect(store().savePreliminaryDecision(NO, 9, savedInput())).toBe(true)
    expect(store().confirmPreliminaryDecision(NO, 9)).toBe(true)
    expect(current().activity7State).toBe('approved')
  })

  it('ผู้ไม่มีสิทธิเลือกผล บันทึก หรือยืนยันร่างเลขาธิการไม่ได้', () => {
    expect(store().beginPreliminaryDecision(NO, 'approved')).toBe(true)
    const before = structuredClone(current())
    useAuthStore.getState().setRole('officer')
    expect(store().beginPreliminaryDecision(NO, 'rejected')).toBe(false)
    expect(store().savePreliminaryDecision(NO, 9, savedInput())).toBe(false)
    expect(store().confirmPreliminaryDecision(NO, 9)).toBe(false)
    expect(current()).toEqual(before)
    noFinalEffects()
  })

  it('ยืนยันร่างที่ยังไม่ผ่านบันทึกไม่ได้ แม้ข้อมูลหลักใน state ดูครบ', () => {
    expect(store().beginPreliminaryDecision(NO, 'approved')).toBe(true)
    store().updateCase(NO, { preliminaryDecision: { ...current().preliminaryDecision!, reason: 'ข้อมูลยังไม่ผ่านบันทึก', destination: 'original_owner' } })
    expect(store().confirmPreliminaryDecision(NO, 9)).toBe(false)
    noFinalEffects()
  })

  for (const [outcome, formNo] of [['approved', 9], ['rejected', 10]] as const) {
    it(`ไม่ข้ามร่าง ${outcome} ด้วย API ลงนามอีกผลหรือ metadata ที่ไม่ตรงร่าง`, () => {
      expect(store().beginPreliminaryDecision(NO, outcome)).toBe(true)
      expect(store().savePreliminaryDecision(NO, formNo, savedInput())).toBe(true)
      const draft = structuredClone(current())
      expect(store().secretaryApprove(NO, 'คำสั่งไม่ตรงร่าง', 'เหตุผลที่ไม่ตรงร่าง', 'got', 'คำสั่งคนละชุด', 30)).toBe(false)
      expect(current()).toEqual(draft)
      store().secretaryReject(NO, 'คำสั่งไม่ตรงร่าง', 'เหตุผลที่ไม่ตรงร่าง')
      expect(current()).toEqual(draft)
      noFinalEffects()
      expect(store().confirmPreliminaryDecision(NO, formNo)).toBe(true)
      expect(current().activity7State).toBe(outcome)
      expect(current().resultNotices?.[formNo]?.original?.decisionNo).toBe(savedInput().decisionNo)
    })
  }
})
