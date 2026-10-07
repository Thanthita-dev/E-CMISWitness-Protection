import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../store/useAuthStore'
import { useCaseStore } from '../store/useCaseStore'
import { selectCaseDraft, useFormDraftStore } from '../store/useFormDraftStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { KB11_SIGN_SLOTS, kb11Gate } from './formSignature'
import type { CaseItem } from '../types/case'

const NO = 'WP-2569-000501'
const OTHER = 'WP-2569-000502'
const initial = (no = NO): CaseItem => ({
  no, form: 'คบ.1', person: no === NO ? 'นางสาวกมลชนก บุญรักษา' : 'นายสมชาย คนละแฟ้ม',
  stage: 'external_pending', status: 'รอพิจารณา', owner: 'เลขาธิการ ป.ป.ท.', next: 'พิจารณา', risk: 'สูง',
  assignedOfficerUserId: 'OFF-001', assignedOfficer: 'นางสาวอรุณี ใจมั่น',
  kb6SecretarySignedAt: '2026-10-07T08:00:00Z', documents: [], assignmentHistory: [],
})
const state = () => useCaseStore.getState()
const item = () => state().getCase(NO)!
const approve = (destination: 'original_owner' | 'got' = 'original_owner') => {
  expect(state().beginPreliminaryDecision(NO, 'approved')).toBe(true)
  expect(state().savePreliminaryDecision(NO, 9, {
    decisionNo: 'ลธ. 501/2569', reason: 'ให้คุ้มครองตามข้อเท็จจริง', instruction: 'ดำเนินการตามคำสั่ง',
    destination, durationDays: 30, fields: {},
  })).toBe(true)
  expect(state().confirmPreliminaryDecision(NO, 9)).toBe(true)
}
beforeEach(() => {
  localStorage.clear()
  useCaseStore.setState({ cases: [initial(), initial(OTHER)], activeCaseNo: NO })
  useAuthStore.setState({ currentOfficerUserId: 'OFF-001' })
  useAuthStore.getState().setRole('secretary')
  useFormDraftStore.setState({ drafts: { 6: { 'รูปแบบคุ้มครองที่เลือก': [2] } }, draftCaseNo: { 6: NO }, caseDrafts: {}, locks: {}, signatures: {}, revisions: {}, draftTouched: {} })
  useNotificationStore.setState({ notifications: [], unreadCount: 0 })
})

describe('เลขาธิการลงนาม คบ.9 แล้วเจ้าหน้าที่จัดทำข้อตกลง คบ.11', () => {
  it('เลือกผลและบันทึกร่างไม่สร้างลายมือชื่อสุดท้ายของทั้งสองแบบ', () => {
    expect(state().beginPreliminaryDecision(NO, 'approved')).toBe(true)
    expect(item().kb9Signed).not.toBe(true)
    expect(item().kb11Signed).not.toBe(true)
    expect(item().activity7State).not.toBe('approved')
    expect(item().protectionHandoff).toBeUndefined()
    expect(useNotificationStore.getState().notifications).toHaveLength(0)
  })
  for (const destination of ['original_owner', 'got'] as const) {
    it(`เลขาธิการลงนามเฉพาะ คบ.9 ส่งงาน ${destination} โดยยังไม่ถือว่าพยานยินยอม`, () => {
      approve(destination)
      const c = item()
      expect(c.kb9Signed).toBe(true)
      expect((c as unknown as Record<string, unknown>).kb11Approval).toBeUndefined()
      expect(c.kb11Signed).not.toBe(true)
      expect(c.consents?.some((consent) => consent.ref === 'kb11' && consent.consented)).not.toBe(true)
      expect(c.protectionHandoff?.destination).toBe(destination)
      expect(kb11Gate(c).unlocked).toBe(false)
      expect(Object.entries(useFormDraftStore.getState().signatures).filter(([key, value]) => key.startsWith('kb11-') && value.signed)).toHaveLength(0)
    })
  }
  it('ยืนยันซ้ำไม่สร้างฉบับ ประวัติ หรือแจ้งเตือนซ้ำ', () => {
    approve()
    const before = structuredClone(item())
    const notifications = structuredClone(useNotificationStore.getState().notifications)
    expect(state().confirmPreliminaryDecision(NO, 9)).toBe(false)
    expect(item()).toEqual(before)
    expect(useNotificationStore.getState().notifications).toEqual(notifications)
  })
  it('ไม่อนุมัติลงนามเฉพาะ คบ.10 และไม่สร้างลายมือชื่อ คบ.11', () => {
    expect(state().beginPreliminaryDecision(NO, 'rejected')).toBe(true)
    expect(state().savePreliminaryDecision(NO, 10, { decisionNo: 'ลธ. 501/2569', reason: 'ไม่เข้าเงื่อนไข', instruction: '', durationDays: 30, fields: {} })).toBe(true)
    expect(state().confirmPreliminaryDecision(NO, 10)).toBe(true)
    expect(item().kb10Signed).toBe(true)
    expect(item().kb9Signed).not.toBe(true)
    expect(item().kb11Signed).not.toBe(true)
    expect(item().protectionHandoff).toBeUndefined()
  })
  it('ร่างข้อตกลงของแต่ละแฟ้มไม่เขียนทับหรือรั่วไปยังแฟ้มอื่น', () => {
    const forms = useFormDraftStore.getState()
    forms.ensureDraftForCase(11, NO, { 'สถานที่ทำข้อตกลง': 'สถานที่เฉพาะแฟ้ม A' })
    forms.updateField(11, 'สถานที่ทำข้อตกลง', 'แฟ้ม A ฉบับแก้ไข')
    forms.ensureDraftForCase(11, OTHER, { 'สถานที่ทำข้อตกลง': 'แฟ้ม B' })
    forms.updateField(11, 'สถานที่ทำข้อตกลง', 'แก้เฉพาะแฟ้ม B')
    expect(selectCaseDraft(useFormDraftStore.getState(), 11, NO)['สถานที่ทำข้อตกลง']).toBe('แฟ้ม A ฉบับแก้ไข')
    expect(selectCaseDraft(useFormDraftStore.getState(), 11, OTHER)['สถานที่ทำข้อตกลง']).toBe('แก้เฉพาะแฟ้ม B')
    forms.ensureDraftForCase(11, NO, {})
    expect(forms.getDraft(11)['สถานที่ทำข้อตกลง']).toBe('แฟ้ม A ฉบับแก้ไข')
  })
  it('แฟ้มเก่าที่อนุมัติ คบ.9 อย่างเดียวไม่ถูกสร้างลายมือชื่อ คบ.11 ย้อนหลัง', () => {
    useCaseStore.setState({ cases: [{ ...initial(), stage: 'approved', activity7State: 'approved', kb9Signed: true, kb9SignedAt: '2026-09-01', kb9SignedBy: 'ผู้ลงนามเดิม' }] })
    const before = structuredClone(item())
    expect(state().confirmPreliminaryDecision(NO, 9)).toBe(false)
    expect(item()).toEqual(before)
    expect(item().kb11Signed).not.toBe(true)
  })
  it('ลายมือชื่อเลขาธิการ คบ.9 ไม่ผ่านประตูเริ่มปฏิบัติแทนข้อตกลงพยาน', () => {
    approve()
    useAuthStore.getState().setRole('officer')
    state().setApprovedMethods(NO, [2])
    state().setMethodStatus(NO, 2, 'active')
    expect(item().methodTracks?.find((track) => track.method === 2)?.status).not.toBe('active')
    expect(item().actualStartedAt).toBeUndefined()
    expect(item().kb11Signed).not.toBe(true)
  })
  it('API ยืนยันข้อตกลงต้องมีหลักฐานรับ คบ.9 และลายมือชื่อครบ 4 ช่อง', () => {
    approve()
    useAuthStore.getState().setRole('officer')
    const consent = { ref: 'kb11' as const, consented: true, by: 'พยาน A', evidence: 'ลงนามครบ' }
    state().updateCase(NO, { kb11Signed: true })
    state().recordConsent(NO, consent)
    expect(item().kb11Signed).not.toBe(true)
    state().updateCase(NO, { dispatchedAt: '2026-10-08T08:00:00Z', deliveredAt: '2026-10-08T09:00:00Z', deliveryRecipient: item().person, deliveryAckType: 'ใบตอบรับไปรษณีย์ (EMS)' })
    const forms = useFormDraftStore.getState()
    forms.ensureDraftForCase(11, NO, {})
    for (const slot of KB11_SIGN_SLOTS.slice(0, 3)) forms.signDocument(slot.key, slot.label)
    state().recordConsent(NO, consent)
    expect(item().kb11Signed).not.toBe(true)
    forms.signDocument(KB11_SIGN_SLOTS[3].key, KB11_SIGN_SLOTS[3].label)
    state().recordConsent(NO, consent)
    expect(item().kb11Signed).toBe(true)
    expect(item().consents?.filter((entry) => entry.ref === 'kb11' && entry.consented)).toHaveLength(1)
  })
})

describe('ร่างข้อตกลง คบ.11 แยกตามแฟ้ม', () => {
  it('ข้อมูลลายมือชื่อเก่าที่ไม่ผูกแฟ้มไม่ติดไปกับแฟ้มใหม่', () => {
    useFormDraftStore.setState({
      drafts: { 11: { 'ชื่อพยาน': 'พยานของข้อมูลเก่า' } }, draftCaseNo: {},
      signatures: { 'kb11-witness': { signed: true, signerName: 'พยานเก่า', signedAt: '2026-09-01' } },
    })
    const forms = useFormDraftStore.getState()
    forms.ensureDraftForCase(11, NO, { 'ชื่อพยาน': 'พยานแฟ้ม A' })
    expect(selectCaseDraft(useFormDraftStore.getState(), 11, NO)['ชื่อพยาน']).toBe('พยานแฟ้ม A')
    expect(useFormDraftStore.getState().signatures['kb11-witness']).toBeUndefined()
    forms.signDocument('kb11-witness', 'พยาน A')
    forms.ensureDraftForCase(11, OTHER, { 'ชื่อพยาน': 'พยานแฟ้ม B' })
    expect(useFormDraftStore.getState().signatures['kb11-witness']).toBeUndefined()
    expect(selectCaseDraft(useFormDraftStore.getState(), 11, NO)['ชื่อพยาน']).toBe('พยานแฟ้ม A')
    forms.ensureDraftForCase(11, NO, {})
    expect(useFormDraftStore.getState().signatures['kb11-witness']?.signerName).toBe('พยาน A')
  })
})
