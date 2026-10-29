import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useFormDraftStore } from '../store/useFormDraftStore'
import { useAuthStore } from '../store/useAuthStore'
import { useNotificationStore } from '../store/useNotificationStore'
import type { CaseItem } from '../types/case'
import { ARTICLE19_REASONS, terminationReasonText } from './terminationRules'
import { TERMINATION_CLAUSES } from './constants'
import { currentTerminationReport, terminationSubmissionErrors, terminationHeadName } from './terminationDraft'
import { passSarabanCheckpoint } from './sarabanTestHelpers'
vi.mock('./swal', () => ({ showToast: vi.fn(), showConfirmAlert: vi.fn() }))

const NO = '9903/2569'
const store = () => useCaseStore.getState()
const forms = () => useFormDraftStore.getState()
const current = () => store().getCase(NO)!
const role = (r: string) => useAuthStore.getState().setRole(r as never)
const leg = () => { expect(passSarabanCheckpoint(NO)).toBe(true); expect(passSarabanCheckpoint(NO)).toBe(true) }
const prepare = () => {
  forms().signDocument('kb15-officer', useAuthStore.getState().getCurrentUserAccount()!.name, undefined, NO)
  expect(terminationSubmissionErrors(current())).toEqual([])
  store().draftKb15(NO, { trigger: 'due_or_officer', summary: ARTICLE19_REASONS[0], triggerRef: 'ข้อเท็จจริง 1' })
  // Existing separately submitted cases remain supported.
  store().updateCase(NO, { kb15: { ...current().kb15!, bundledForms: false }, kb16: undefined, kb17: undefined })
}
const approve = () => {
  role('supervisor'); store().reviewKb15(NO, true, 'เห็นชอบ ผบชต')
  role('director'); store().reviewKb15(NO, true, 'เห็นชอบ ผอ.')
  leg()
  role('deputy_secretary'); store().reviewKb15(NO, true, 'เห็นชอบ รองเลขาธิการ')
  role('secretary'); store().reviewKb15(NO, true, 'เห็นชอบ เลขาธิการ')
  expect(current().terminationApproval?.approved).toBe(true)
  leg(); role('officer')
}
const order = () => {
  store().issueKb16(NO, { orderNo: '999/2569', reason: 'ไม่ควรใช้ค่าจากผู้เรียก', issuedAt: '2026-10-28', effectiveAt: '2026-10-28' })
  store().submitKb16ForSignature(NO)
  leg(); role('secretary'); store().signKb16(NO)
  expect(current().kb16?.signedAt).toBeTruthy()
  leg(); role('officer')
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-28T10:00:00+07:00'))
  localStorage.clear()
  role('officer')
  const head = useAuthStore.getState().getCurrentUserAccount()!.name
  const c: CaseItem = {
    no: NO, person: 'พยานทดสอบ', form: 'คำร้อง', stage: 'protection', status: '', owner: head, next: '', risk: 'สูง',
    orgUnitId: 'pacc-reg-1', assignedOfficerUserId: 'OFF-REG1', assignmentHistory: [], kb8SignedAt: '2026-06-01',
    episode: { id: 'EP', openedAt: '2026-06-01', phases: [{ id: 'P', kind: 'MAIN', startedAt: '2026-06-01', orderRef: '1/2569' }] },
    terminationTrigger: { source: 'due_or_officer', recordedAt: '2026-10-28', recordedBy: head, ref: 'ข้อเท็จจริง 1' },
  }
  useCaseStore.setState({ cases: [c], activeCaseNo: NO })
  useNotificationStore.setState({ notifications: [], unreadCount: 0 })
  useFormDraftStore.setState({ drafts: {}, draftCaseNo: {}, caseDrafts: {}, signatures: {}, signatureCases: {}, locks: {}, revisions: {}, draftTouched: {} })
  forms().ensureDraftForCase(8, NO, { 'ชุดชื่อ1': head })
  forms().ensureDraftForCase(15, NO, { 'ชื่อพยาน': c.person, 'ข้อระเบียบ': TERMINATION_CLAUSES[3].label, 'เหตุยุติ': ARTICLE19_REASONS[0], 'ข้อเท็จจริง': 'ผลตรวจยืนยันไม่มีเหตุให้คุ้มครองต่อ', 'สรุปผล': 'รายงานการตรวจ 1', 'วันที่เกิดเหตุ': '2026-10-27', 'วันที่เสนอให้สิ้นสุด': '2026-10-28', 'อ้างอิงเหตุยุติ': 'ข้อเท็จจริง 1' })
})

describe('เดินเอกสารยุติในแฟ้มเดิม', () => {
  it('คบ.15/16/17 ขึ้นชุดเดียวและส่งกลับหลังลงนามครบ', () => {
    forms().ensureDraftForCase(16, NO, { 'เลขที่คำสั่ง': '123', 'ปีคำสั่ง': '2569', 'วันที่ออกคำสั่ง': '2026-10-28', 'วันที่มีผล': '2026-10-28' })
    forms().ensureDraftForCase(17, NO, { 'เรื่อง': 'แจ้งยุติ' })
    forms().signDocument('kb15-officer', useAuthStore.getState().getCurrentUserAccount()!.name, undefined, NO)
    store().draftKb15(NO, { trigger: 'due_or_officer', summary: ARTICLE19_REASONS[0] })
    expect(current().extraForms).toEqual(expect.arrayContaining([15, 16, 17]))
    expect(current().kb16?.orderNo).toBe('123/2569')
    role('supervisor'); store().reviewKb15(NO, true, 'เห็นชอบ')
    role('director'); store().reviewKb15(NO, true, 'เห็นชอบ')
    leg()
    role('deputy_secretary'); store().reviewKb15(NO, true, 'เห็นชอบ')
    role('secretary'); store().reviewKb15(NO, true, 'เห็นชอบ')
    expect(current().sarabanDispatch).toBeUndefined()
    expect(current().kb16?.status).toBe('submitted')
    expect(current().kb17?.status).toBe('submitted')
    store().signKb16(NO)
    expect(current().kb16?.signedAt).toBeTruthy()
    expect(current().sarabanDispatch).toBeUndefined()
    store().signKb17(NO)
    expect(current().kb17?.signedAt).toBeTruthy()
    expect(current().sarabanDispatch?.direction).toBe('down')
    expect(current().sarabanDispatch?.forms).toEqual(expect.arrayContaining([15, 16, 17]))
  })

  it('ส่งรายงานที่ลงนามแล้วต่อครบลำดับได้โดยไม่ตรวจช่องหลักฐานซ้ำ', () => {
    forms().updateField(15, 'สรุปผล', '')
    prepare()
    approve()
    expect(current().kb15?.status).toBe('endorsed')
    expect(current().kb15?.approvalHistory?.map(h => h.role)).toEqual(['supervisor', 'director', 'deputy_secretary', 'secretary'])
  })

  it('ส่ง คบ.15 ที่ลงนามแล้วได้แม้ข้อเท็จจริงและช่องร่างยังว่าง', () => {
    forms().updateField(15, 'ข้อเท็จจริง', '')
    forms().updateField(15, 'วันที่เกิดเหตุ', '')
    forms().signDocument('kb15-officer', useAuthStore.getState().getCurrentUserAccount()!.name, undefined, NO)
    expect(terminationSubmissionErrors(current())).toEqual([])
    store().draftKb15(NO, { trigger: 'due_or_officer', summary: ARTICLE19_REASONS[0] })
    expect(current().kb15?.status).toBe('submitted')
  })
  it('ไม่ใช้หัวหน้าชุดจากคำสั่งอีกแฟ้มมาลงนาม คบ.15', () => {
    const expected = terminationHeadName(current())
    expect(expected).toBeTruthy()
    forms().ensureDraftForCase(8, 'OTHER/2569', { 'ชุดชื่อ1': expected })
    expect(terminationHeadName(current())).toBe('')
    expect(terminationSubmissionErrors(current()).some(e => e.includes('หัวหน้าชุด'))).toBe(true)
  })
  it('สลับแฟ้มแล้วร่าง คบ.15/17 และลายมือชื่อไม่ปะปนหรือสูญหาย', () => {
    const original = structuredClone(forms().drafts[15])
    forms().ensureDraftForCase(15, 'OTHER/2569', { 'ข้อระเบียบ': TERMINATION_CLAUSES[1].label })
    expect(forms().drafts[15]['ข้อระเบียบ']).toBe(TERMINATION_CLAUSES[1].label)
    forms().ensureDraftForCase(15, NO, {})
    expect(forms().drafts[15]).toEqual(original)
    forms().ensureDraftForCase(17, NO, { 'เหตุยุติ': 'เหตุแฟ้มแรก' })
    forms().ensureDraftForCase(17, 'OTHER/2569', { 'เหตุยุติ': 'เหตุอีกแฟ้ม' })
    forms().ensureDraftForCase(17, NO, {})
    expect(forms().drafts[17]['เหตุยุติ']).toBe('เหตุแฟ้มแรก')
  })
  it.each([1, 2, 3] as const)('เหตุ 18(%s) ยังเดิน คบ.15–17 ครบ ไม่ต้องสร้างคำร้องหรือส่งต่อซ้ำ', (clause) => {
    forms().updateField(15, 'ข้อระเบียบ', TERMINATION_CLAUSES[clause - 1].label)
    forms().updateField(15, 'เหตุยุติ', TERMINATION_CLAUSES[clause - 1].label)
    forms().updateField(15, 'วันที่เกิดเหตุ', '2026-10-28')
    if (clause === 1) {
      forms().ensureDraftForCase(7, NO, { 'ชื่อผู้ยื่น': 'พยาน', 'นามสกุลผู้ยื่น': 'ทดสอบ', 'เหตุผลการยุติ': 'ประสงค์ขอยุติ', 'วันที่ขอให้ยุติ': '2026-10-28' })
      expect(terminationSubmissionErrors(current()).some(e => e.includes('คบ.7'))).toBe(true)
      store().updateCase(NO, { documents: [{ id: 'KB7-1', name: 'คำร้อง.pdf', category: 'official', signed: true, uploadedAt: '2026-10-28', uploadedBy: 'เจ้าหน้าที่' }] })
      forms().updateField(15, 'หลักฐานคำร้อง คบ.7', 'คำร้อง.pdf')
      forms().updateField(15, 'วันที่รับคำร้อง คบ.7', '2026-10-28')
    } else if (clause === 2) {
      store().updateCase(NO, { protectionEndAt: '2026-10-28' })
    } else {
      store().updateCase(NO, { article14: { step: 'handover_done', openedAt: '2026-10-01', openedBy: 'เจ้าหน้าที่', threatSummary: 'ยังมีภัย', riskAssessment: 'สูง', revisions: [], replyDocumentName: 'รับคุ้มครอง.pdf', handoverCompletedAt: '2026-10-28', successorStartedAt: '2026-10-28', successorLegalBasis: 'กฎหมายคุ้มครองพยานในคดีอาญา' } })
    }
    prepare(); approve(); order()
    store().draftKb17(NO, { documentName: 'คบ17.pdf' })
    store().submitKb17ForSignature(NO); leg(); role('secretary'); store().signKb17(NO); leg(); role('officer')
    store().dispatchKb17(NO, { documentName: 'คบ17.pdf', registryNo: 'ปป 1', registryDate: '2026-10-28' })
    store().recordKb17DeliveryAttempt(NO, { channel: 'in_person', attemptedAt: '2026-10-27', result: 'success', evidence: 'รับ.pdf' })
    expect(current().kb17?.deliveredAt).toBeUndefined()
    store().recordKb17Delivery(NO, '2026-10-28', 'รับจริง.pdf')
    expect(current().kb17?.appealDueAt).toBeUndefined()
    expect(current().kb17?.reason).toBe(current().kb16?.reason)
    expect(current().kb17?.orderEffectiveAt).toBe(current().kb15?.proposedEndAt)
    store().closeProtectionCase(NO)
    expect(current().terminationDocumentsClosedAt).toBeTruthy()
    expect(store().cases).toHaveLength(1)
    expect(forms().draftCaseNo[7]).toBe(clause === 1 ? NO : undefined)
    const intake = { channel: 'letter', registryNo: 'รับ 2', firstReceivedAt: '2026-10-28', documentName: 'อุทธรณ์.pdf', evidenceDataUrl: 'data:application/pdf;base64,AAA' } as never
    store().openKb17Appeal(NO, 'ขอทบทวนคำสั่ง', intake)
    expect(current().appealFiledAt).toBeTruthy()
  })
  it('ร่างไม่ใช่อนุมัติ/ลงนาม ผู้จัดทำทั่วไปลงนามแทนหัวหน้าชุดไม่ได้ และส่งซ้ำไม่สร้างรายงานใหม่', () => {
    expect(current().kb15).toBeUndefined()
    forms().signDocument('kb15-officer', 'ผู้อื่น', undefined, NO)
    expect(forms().signatures['kb15-officer']).toBeUndefined()
    prepare()
    expect(current().kb15?.version).toBe(1)
    expect(current().kb15?.status).toBe('submitted')
    expect(current().episode?.closedAt).toBeUndefined()
    store().draftKb15(NO, { trigger: 'due_or_officer', summary: 'ทับฉบับเดิม' })
    expect(current().kb15?.version).toBe(1)
    expect(current().kb15?.summary).toBe(ARTICLE19_REASONS[0])
  })
  it('หัวหน้า → ผอ. → รองเลขาธิการ → เลขาธิการ ตัดสินครั้งเดียว คบ.16 ลงนามแยก ผ่านสารบรรณเดิม', () => {
    prepare(); approve()
    const decision = structuredClone(current().terminationApproval)
    store().decideTerminationApproval(NO, false, 'พยายามตัดสินซ้ำ')
    expect(current().terminationApproval).toEqual(decision)
    expect(current().kb15?.approvalHistory?.map(h => h.role)).toEqual(['supervisor', 'director', 'deputy_secretary', 'secretary'])
    order()
    expect(current().kb16?.reason).toBe(terminationReasonText(current().kb15))
    expect(current().episode?.closedAt).toBe('2026-10-28')
    expect(current().closedAt).toBeUndefined()
    const signed = structuredClone(current().kb16)
    store().issueKb16(NO, { orderNo: 'ทับฉบับเดิม', reason: '', issuedAt: '', effectiveAt: '' })
    store().updateCase(NO, { kb16: { ...current().kb16!, reason: 'แก้หลังลงนาม' } })
    expect(current().kb16).toEqual(signed)
  })
  it('ส่งกลับแก้ไขเก็บรายงานเดิม ลายมือชื่อเดิม และเริ่มลงนามใหม่', () => {
    prepare(); role('supervisor'); store().reviewKb15(NO, false, 'ต้องเพิ่มข้อเท็จจริง')
    expect(current().kb15?.status).toBe('returned')
    role('officer')
    expect(forms().reviseForm(15, 'เจ้าหน้าที่', 'เพิ่มข้อเท็จจริงตามส่งกลับ')).toBe(2)
    expect(forms().revisions[15][0].caseSnapshot?.kb15?.headSignature?.signed).toBe(true)
    expect(forms().signatures['kb15-officer']).toBeUndefined()
    forms().updateField(15, 'ข้อเท็จจริง', 'ข้อเท็จจริงที่ตรวจเพิ่มเติม')
    prepare()
    expect(current().kb15?.version).toBe(2)
    expect(current().kb15?.previousVersions?.[0].report?.approvalHistory?.[0].endorsed).toBe(false)
  })
  it('ปิดเอกสารได้ก่อนหมด 30 วัน โดยไม่ปิดงานส่งต่อหรือการรับอุทธรณ์', () => {
    prepare(); approve(); order()
    store().draftKb17(NO, { documentName: 'คบ17.pdf' })
    expect(current().kb17?.orderNo).toBe('999/2569')
    store().submitKb17ForSignature(NO); leg(); role('secretary'); store().signKb17(NO); leg(); role('officer')
    store().dispatchKb17(NO, { documentName: 'คบ17.pdf', registryNo: 'ปป 1', registryDate: '2026-10-28' })
    store().recordKb17Delivery(NO, '2026-10-27', 'วันรับก่อนส่ง.pdf')
    expect(current().kb17?.deliveredAt).toBeUndefined()
    store().recordKb17Delivery(NO, '2026-10-28', 'ใบรับแจ้ง.pdf')
    expect(current().kb17?.appealDueAt).toBe('2026-11-27')
    store().updateCase(NO, { article14: { step: 'letter_sent', openedAt: '', openedBy: '', threatSummary: '', riskAssessment: '', revisions: [] } })
    store().closeProtectionCase(NO)
    expect(current().terminationDocumentsClosedAt).toBeTruthy()
    expect(current().closedAt).toBeUndefined()
    expect(current().article14?.step).toBe('letter_sent')
    const episode = structuredClone(current().episode)
    const intake = { channel: 'letter', registryNo: 'รับ 2', firstReceivedAt: '2026-10-28', documentName: 'อุทธรณ์.pdf', evidenceDataUrl: 'data:application/pdf;base64,AAA' } as never
    store().openKb17Appeal(NO, 'ขอทบทวนคำสั่ง', intake)
    expect(current().appealFiledAt).toBeTruthy()
    expect(current().episode).toEqual(episode)
    expect(current().terminationDocumentsClosedAt).toBeTruthy()
  })
  it('แก้คำสั่งลงนามต้องสร้างฉบับใหม่ และประวัติเดิมคงเลขคำสั่ง/วันที่/เหตุไว้ครบ', () => {
    prepare(); approve(); order()
    forms().ensureDraftForCase(16, NO, {})
    const signed = structuredClone(current().kb16)
    expect(forms().reviseForm(16, 'เจ้าหน้าที่', 'แก้เลขคำสั่ง')).toBe(2)
    expect(forms().revisions[16][0].caseSnapshot?.kb16).toEqual(signed)
    expect(current().kb16?.signedAt).toBeUndefined()
    expect(current().kb16?.status).toBe('draft')
    expect(current().episode?.closedAt).toBe('2026-10-28')
  })
})
