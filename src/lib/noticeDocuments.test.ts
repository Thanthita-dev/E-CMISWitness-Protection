import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNoticeDraft, missingNoticeFields, NOTICE_FIELD_POLICY, noticeCanSign, signNoticeSnapshot } from './noticeDocuments'
import type { CaseItem } from '../types/case'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { useFormDraftStore } from '../store/useFormDraftStore'
import { useNotificationStore } from '../store/useNotificationStore'

const NO = 'WP-2569-000501'
const initial = (): CaseItem => ({
  no: NO, form: 'คบ.1', person: 'นางสาวกมลชนก บุญรักษา', stage: 'external_pending',
  status: 'รอเลขาธิการพิจารณา', owner: 'เลขาธิการ ป.ป.ท.', next: 'พิจารณา', risk: 'สูง',
  assignedOfficerUserId: 'OFF-001', assignedOfficer: 'นางสาวอรุณี ใจมั่น',
  mainCaseNo: 'กบค. 001/2569', createdAt: '2026-10-01T08:00:00.000Z',
})

const policyBeforeTests = structuredClone(NOTICE_FIELD_POLICY)
const store = () => useCaseStore.getState()
const current = () => store().getCase(NO)!
const role = (r: Parameters<ReturnType<typeof useAuthStore.getState>['setRole']>[0]) => useAuthStore.getState().setRole(r)
const approve = (destination: 'got' | 'original_owner' = 'original_owner') => store().secretaryApprove(NO, 'ลธ. 501/2569', 'สมควรคุ้มครอง', destination, 'ดำเนินการตามวิธีที่อนุมัติ', 30)
const document = (formNo: 9 | 10 = 9) => current().resultNotices![formNo]!
/** Policy fixture for testing the guarded mechanism only; this is not a production field approval. */
const configureDeferredTestPolicy = () => Object.assign(NOTICE_FIELD_POLICY, {
  confirmed: true, allowedAfterSigning: ['เลขที่หนังสือ'], requiredForSend: ['เลขที่หนังสือ'],
  confirmedBy: 'เจ้าของนโยบายทดสอบเท่านั้น', confirmedAt: '2026-10-07T08:00:00Z',
})

describe('การลงนามและเติมรายละเอียดหนังสือใน store', () => {
  beforeEach(() => {
    localStorage.clear()
    useCaseStore.setState({ cases: [{ ...initial(), kb6SecretarySignedAt: '2026-10-07T08:00:00Z', documents: [], assignmentHistory: [] }], activeCaseNo: NO })
    useAuthStore.setState({ currentOfficerUserId: 'OFF-001' })
    role('secretary')
    useFormDraftStore.setState({ drafts: { 6: { 'รูปแบบคุ้มครองที่เลือก': [1] } }, draftCaseNo: {}, caseDrafts: {}, locks: {}, revisions: {}, signatures: {} })
    useNotificationStore.setState({ notifications: [], unreadCount: 0 })
  })
  afterEach(() => {
    Object.keys(NOTICE_FIELD_POLICY).forEach((key) => delete (NOTICE_FIELD_POLICY as unknown as Record<string, unknown>)[key])
    Object.assign(NOTICE_FIELD_POLICY, structuredClone(policyBeforeTests))
  })

  it('เตรียม คบ.9/10 ครั้งเดียวในแฟ้มเดิมและไม่ลงนามเมื่อช่องก่อนลงนามยังขาด', () => {
    Object.assign(NOTICE_FIELD_POLICY, { confirmed: false, allowedAfterSigning: [], requiredForSend: ['เลขที่หนังสือ'] })
    expect(store().prepareResultNotices(NO)).toBe(true)
    const preparedAt = document().preparedAt
    expect(store().prepareResultNotices(NO)).toBe(true)
    expect(Object.keys(current().resultNotices!)).toHaveLength(2)
    expect(document().preparedAt).toBe(preparedAt)
    expect(approve()).toBe(false)
    expect(current().activity7State).toBeUndefined()
    expect(current().documents).toHaveLength(0)
    expect(document().original).toBeUndefined()
  })

  for (const formNo of [9, 10] as const) {
    it(`ผลพิจารณาลงนามเฉพาะ คบ.${formNo} ไม่ซ้ำ แล้วเติมรุ่นใหม่และส่งฉบับที่ตรวจครบ`, () => {
      configureDeferredTestPolicy()
      if (formNo === 9) expect(approve()).toBe(true)
      else store().secretaryReject(NO, 'ลธ. 501/2569', 'ไม่เข้าหลักเกณฑ์ทดสอบ')
      const original = structuredClone(document(formNo).original)
      const outcome = current().activity7State
      const signedAt = current().secretarySignedAt
      expect(document(formNo).status).toBe('signed_incomplete')
      expect(current().resultNotices![formNo === 9 ? 10 : 9]?.original).toBeUndefined()
      expect(current().protectionHandoff?.destination).toBe(formNo === 9 ? 'original_owner' : undefined)
      if (formNo === 9) expect(approve()).toBe(false)
      else store().secretaryReject(NO, 'คำสั่งซ้ำ', 'เหตุผลซ้ำ')
      expect(document(formNo).versions).toHaveLength(1)
      expect(current().documents).toHaveLength(1)
      role('officer')
      store().recordDispatch(NO, 'ไปรษณีย์ตอบรับด่วน (EMS)', 'TEST501')
      expect(current().dispatchedAt).toBeUndefined()
      expect(store().checkResultNoticeReady(NO)).toBe(false)
      expect(store().completeResultNotice(NO, formNo, { เลขาธิการ: 'เปลี่ยนผู้ลงนาม' })).toBe(false)
      expect(store().completeResultNotice(NO, formNo, { สาระสำคัญ: 'เปลี่ยนผล' })).toBe(false)
      expect(store().completeResultNotice(NO, formNo, { เลขที่หนังสือ: 'ปป 501/2569' })).toBe(true)
      expect(store().completeResultNotice(NO, formNo, { เลขที่หนังสือ: 'ปป 501/2569' })).toBe(false)
      expect(document(formNo).versions).toHaveLength(2)
      expect(document(formNo).audit).toHaveLength(1)
      expect(document(formNo).audit[0]).toMatchObject({ userId: 'OFF-001', version: 2, changes: [{ field: 'เลขที่หนังสือ', before: '', after: 'ปป 501/2569' }] })
      expect(document(formNo).versions[1].signatureVerification).toBe('not_covered_by_original_signature')
      expect(document(formNo).versions[1].signedAt).toBe(original!.signedAt)
      expect(document(formNo).original).toEqual(original)
      expect(current().activity7State).toBe(outcome)
      expect(current().secretarySignedAt).toBe(signedAt)
      expect(document(formNo).status).toBe('completed')
      store().recordDispatch(NO, 'ไปรษณีย์ตอบรับด่วน (EMS)', 'TEST501')
      expect(document(formNo).dispatches).toHaveLength(0)
      expect(store().checkResultNoticeReady(NO)).toBe(true)
      expect(store().checkResultNoticeReady(NO)).toBe(false)
      store().recordDispatch(NO, 'ไปรษณีย์ตอบรับด่วน (EMS)', 'TEST501')
      store().recordDispatch(NO, 'ไปรษณีย์ตอบรับด่วน (EMS)', 'TEST501')
      expect(document(formNo).status).toBe('sent')
      expect(document(formNo).dispatches).toHaveLength(1)
      expect(current().dispatchHistory).toHaveLength(1)
      expect(document(formNo).dispatches[0].snapshot).toEqual(document(formNo).versions[1])
      expect(document(formNo).dispatches[0].snapshot).not.toBe(document(formNo).versions[1])
      expect(document(formNo).dispatches[0].evidence.kind).toBe('dispatch_record')
      expect(store().completeResultNotice(NO, formNo, { เลขที่หนังสือ: 'แก้หลังส่ง' })).toBe(false)
      store().recordDelivery(NO, '2026-10-08T08:00:00Z', { recipient: current().person, ackType: 'ใบตอบรับ', ackDocument: 'ใบตอบรับสาธิต.pdf' })
      expect(document(formNo).dispatches[0].receipt).toMatchObject({ recipient: current().person, documentName: 'ใบตอบรับสาธิต.pdf' })
      expect(document(formNo).original).toEqual(original)
    })
  }

  it('GOT ต้องธุรการรับ → ผอ.มอบหมาย → ผู้ได้รับมอบหมายรับงานก่อนเติม', () => {
    configureDeferredTestPolicy()
    expect(approve('got')).toBe(true)
    role('officer')
    expect(store().completeResultNotice(NO, 9, { เลขที่หนังสือ: 'ห้ามเจ้าของเดิม' })).toBe(false)
    role('got_receiver')
    expect(store().completeResultNotice(NO, 9, { เลขที่หนังสือ: 'ห้ามธุรการ' })).toBe(false)
    expect(store().advanceProtectionHandoff(NO, 'assign', 'ข้ามผอ.', 'GOT-OFF-001')).toBe(false)
    expect(store().advanceProtectionHandoff(NO, 'receive')).toBe(true)
    expect(store().advanceProtectionHandoff(NO, 'submit')).toBe(true)
    role('got_director')
    expect(store().completeResultNotice(NO, 9, { เลขที่หนังสือ: 'ห้ามผอ.' })).toBe(false)
    expect(store().advanceProtectionHandoff(NO, 'assign', 'มอบหมาย', 'GOT-OFF-001')).toBe(true)
    role('got_officer')
    expect(store().completeResultNotice(NO, 9, { เลขที่หนังสือ: 'ยังไม่รับงาน' })).toBe(false)
    expect(store().advanceProtectionHandoff(NO, 'accept')).toBe(true)
    useAuthStore.getState().setOfficerUserId('GOT-OFF-002')
    expect(store().completeResultNotice(NO, 9, { เลขที่หนังสือ: 'ห้ามคนอื่น' })).toBe(false)
    useAuthStore.getState().setOfficerUserId('GOT-OFF-001')
    expect(store().completeResultNotice(NO, 9, { เลขที่หนังสือ: 'ปป GOT501' })).toBe(true)
    expect(document().audit[0].userId).toBe('GOT-OFF-001')
  })

  it('generic updates ไม่เปลี่ยนฉบับลงนาม ผล หรือเวลาลงนาม และ refresh คืนประวัติได้', async () => {
    configureDeferredTestPolicy()
    expect(approve()).toBe(true)
    const signed = structuredClone(current())
    store().updateCase(NO, { activity7State: 'rejected', decisionNumber: 'เปลี่ยน', secretarySignedAt: 'เปลี่ยน', resultNotices: {} })
    expect(current()).toEqual(signed)
    role('officer')
    expect(store().completeResultNotice(NO, 9, { เลขที่หนังสือ: 'ปป 501' })).toBe(true)
    const persisted = localStorage.getItem('ecmis-case-storage-v2')!
    const before = structuredClone(current())
    useCaseStore.setState({ cases: [] })
    localStorage.setItem('ecmis-case-storage-v2', persisted)
    await useCaseStore.persist.rehydrate()
    expect(current()).toEqual(before)
    expect(document().original).toEqual(signed.resultNotices![9]!.original)
    expect(document().audit).toHaveLength(1)
  })

  it('กรณีไม่อนุมัติ จำกัดการเติม ตรวจ และส่งให้เจ้าของสำนวนที่รับผิดชอบจริง', () => {
    configureDeferredTestPolicy()
    store().secretaryReject(NO, 'ลธ. 501/2569', 'ไม่เข้าหลักเกณฑ์ทดสอบ')
    const signed = structuredClone(current())
    for (const value of ['receiver', 'secretary', 'got_receiver', 'got_director', 'got_officer', 'officer'] as const) {
      role(value)
      if (value === 'officer') useAuthStore.getState().setOfficerUserId('OFF-002')
      expect(store().completeResultNotice(NO, 10, { เลขที่หนังสือ: 'ไม่มีสิทธิ' }), value).toBe(false)
      expect(store().checkResultNoticeReady(NO), value).toBe(false)
      store().recordDispatch(NO, 'EMS', 'ผิดสิทธิ')
      store().recordDelivery(NO, '2026-10-08T08:00:00Z', { recipient: 'ผิดสิทธิ', ackType: 'ใบตอบรับ', ackDocument: 'ผิดสิทธิ.pdf' })
      expect(current(), value).toEqual(signed)
    }
    role('officer')
    useAuthStore.getState().setOfficerUserId('OFF-001')
    expect(store().completeResultNotice(NO, 10, { เลขที่หนังสือ: 'ปป 501' })).toBe(true)
    expect(store().checkResultNoticeReady(NO)).toBe(true)
    const ready = structuredClone(current())
    role('got_receiver')
    store().recordDispatch(NO, 'EMS', 'ผิดสิทธิ')
    expect(current()).toEqual(ready)
    role('officer')
    useAuthStore.getState().setOfficerUserId('OFF-001')
    store().recordDispatch(NO, 'EMS', '501')
    const sent = structuredClone(current())
    role('got_officer')
    store().recordDelivery(NO, '2026-10-08T08:00:00Z', { recipient: 'ผิดสิทธิ', ackType: 'ใบตอบรับ', ackDocument: 'ผิดสิทธิ.pdf' })
    expect(current()).toEqual(sent)
    expect(current().protectionHandoff).toBeUndefined()
  })

  it('รายการที่เจ้าของงานอนุญาตจริงกรอกครบทั้งหกช่องได้ แต่ข้อมูลลงนามหรือผลแก้ไม่ได้', () => {
    expect(NOTICE_FIELD_POLICY.confirmed).toBe(true)
    expect([...NOTICE_FIELD_POLICY.allowedAfterSigning].sort()).toEqual(Object.keys(completeFields).sort())
    expect(approve()).toBe(true)
    role('officer')
    expect(store().completeResultNotice(NO, 9, { วันที่อนุมัติ: 'เปลี่ยนวันที่อนุมัติ' })).toBe(false)
    expect(store().completeResultNotice(NO, 9, { signedAt: 'เปลี่ยนวันลงนาม' })).toBe(false)
    expect(store().completeResultNotice(NO, 9, completeFields)).toBe(true)
    expect(document().status).toBe('completed')
    const signed = structuredClone(current())
    role('secretary')
    store().signOutgoingNotice(NO, 9, 'ลงนามซ้ำ')
    store().signOutgoingNotice(NO, 10, 'ลงนามอีกผล')
    expect(current()).toEqual(signed)
  })

  it('รับอุทธรณ์จากผลไม่อนุมัติใหม่ได้ โดยยังเก็บฉบับลงนามเดิมและฉบับที่ส่ง', () => {
    configureDeferredTestPolicy()
    store().secretaryReject(NO, 'ลธ. 501/2569', 'ไม่เข้าหลักเกณฑ์ทดสอบ')
    role('officer')
    expect(store().completeResultNotice(NO, 10, { เลขที่หนังสือ: 'ปป 501' })).toBe(true)
    expect(store().checkResultNoticeReady(NO)).toBe(true)
    store().recordDispatch(NO, 'EMS', '501')
    store().recordDelivery(NO, '2026-10-08T08:00:00Z', { recipient: current().person, ackType: 'ใบตอบรับ', ackDocument: 'ใบตอบรับสาธิต.pdf' })
    const notice = structuredClone(document(10))
    store().fileAppeal(NO, 'ขอพิจารณาข้อเท็จจริงเพิ่มเติม', { channel: 'letter', registryNo: 'รับ 502/2569', firstReceivedAt: '2026-10-09T08:00:00Z', evidenceDocumentName: 'คำอุทธรณ์สาธิต.pdf' })
    expect(current().stage).toBe('appeal')
    expect(current().appealFolder?.stage).toBe('received')
    expect(current().activity7State).toBe('committee')
    expect(document(10)).toEqual(notice)
    expect(document(10).original?.outcome).toBe('rejected')
    store().checkAppealFolder(NO, {})
    for (const level of ['officer', 'supervisor', 'director', 'deputy', 'secretary'] as const) {
      role(level === 'deputy' ? 'deputy_secretary' : level)
      store().recordAppealOpinion(NO, level, 'ความเห็นประกอบอุทธรณ์ทดสอบ')
    }
    role('committee')
    store().scheduleAppealAgenda(NO, 'วาระ 501/2569')
    useFormDraftStore.setState({ signatures: { 'kb6-supervisor': { signed: true, signerName: 'ผู้ลงนามเดิม', signedAt: '08/10/2569 04:00' } } })
    store().recordAppealResolution(NO, { resolutionNo: 'มติ 501/2569', outcome: 'overturn', note: 'ข้อเท็จจริงใหม่ให้การคุ้มครอง' })
    expect(current().activity7State).toBe('pending')
    expect(current().stage).toBe('staff_review')
    expect(current().appealFolder?.stage).toBe('resolved')
    expect(current().kb6Version).toBe(2)
    expect(current().appealKb6Version).toBe(2)
    expect(current().kb6PreviousVersions?.[0].version).toBe(1)
    expect(current().kb6SecretarySignedAt).toBeUndefined()
    expect(current().kb6PreparedAt).toBeUndefined()
    expect(useFormDraftStore.getState().draftCaseNo[6]).toBe(NO)
    expect(useFormDraftStore.getState().getRevisions(6)).toHaveLength(1)
    expect(useFormDraftStore.getState().getRevisions(6)[0].signatures?.['kb6-supervisor'].signed).toBe(true)
    expect(useFormDraftStore.getState().signatures['kb6-supervisor']).toBeUndefined()
    store().prepareAppealKb6Revision(NO)
    store().recordAppealResolution(NO, { resolutionNo: 'มติซ้ำ', outcome: 'overturn', note: 'ซ้ำ' })
    expect(current().appealResolution?.resolutionNo).toBe('มติ 501/2569')
    expect(current().kb6Version).toBe(2)
    expect(useFormDraftStore.getState().getRevisions(6)).toHaveLength(1)
    expect(current().appealKb6PreviousResult?.deliveredAt).toBe('2026-10-08T08:00:00Z')
    expect(document(10)).toEqual(notice)
    store().updateCase(NO, { resultNotices: {}, resultReason: 'แก้เหตุผลเดิมหลังมติอุทธรณ์' })
    expect(document(10)).toEqual(notice)
    role('officer')
    store().markKb6Prepared(NO)
    store().forwardCase(NO, 'supervisor_review')
    expect(current().stage).toBe('supervisor_review')
    role('supervisor')
    store().signKb6(NO, 'supervisor')
    store().forwardCase(NO, 'director_review')
    role('director')
    store().signKb6(NO, 'director')
    store().forwardCase(NO, 'deputy_review')
    role('deputy_secretary')
    store().signKb6(NO, 'deputy')
    store().forwardCase(NO, 'external_pending')
    role('secretary')
    store().signKb6(NO, 'secretary')
    expect(approve()).toBe(true)
    expect(document(9).original?.outcome).toBe('approved')
    expect(document(10)).toEqual(notice)
  })

  it('generic updateCase เปลี่ยนสถานะเพื่อหลบล็อกฉบับลงนาม แล้วแก้ metadata รอบสองไม่ได้', () => {
    configureDeferredTestPolicy()
    store().secretaryReject(NO, 'ลธ. 501/2569', 'ไม่เข้าหลักเกณฑ์ทดสอบ')
    const signed = structuredClone(current())
    store().updateCase(NO, { appealKb6Version: 2 })
    expect(current().appealKb6Version).toBeUndefined()
    for (const outcome of ['returned', 'pending', undefined, 'article14', 'committee'] as const) {
      store().updateCase(NO, { activity7State: outcome })
      expect(current()).toEqual(signed)
      store().updateCase(NO, { resultNotices: {}, resultReason: 'แก้เหตุผล', secretarySignedAt: 'แก้วันลงนาม', kb10SignedBy: 'เปลี่ยนผู้ลงนาม', decisionNumber: 'เปลี่ยนคำสั่ง' })
      expect(current()).toEqual(signed)
    }
  })

  it('คำสั่งส่งกลับหรือส่งต่อข้อ14 หลังลงนามไม่อนุมัติแล้วไม่เปลี่ยนผลเดิม', () => {
    configureDeferredTestPolicy()
    store().secretaryReject(NO, 'ลธ. 501/2569', 'ไม่เข้าหลักเกณฑ์ทดสอบ')
    const signed = structuredClone(current())
    store().secretaryReturn(NO, 'กลับแก้หลังลงนาม', 'ผิดขั้นตอน')
    expect(current()).toEqual(signed)
    store().secretaryReferArticle14(NO, 'คำสั่งซ้ำ', 'ผิดขั้นตอน')
    expect(current()).toEqual(signed)
  })

  it('ฉบับหนังสือของแฟ้มปิดแล้วไม่เปลี่ยนจากผู้รับผิดชอบหรือผู้ไม่มีสิทธิ', () => {
    configureDeferredTestPolicy()
    expect(approve()).toBe(true)
    role('officer')
    expect(store().completeResultNotice(NO, 9, { เลขที่หนังสือ: 'ปป 501' })).toBe(true)
    expect(store().checkResultNoticeReady(NO)).toBe(true)
    useCaseStore.setState({ cases: [{ ...current(), stage: 'terminated', closedAt: '2026-10-07T10:00:00Z' }] })
    const closed = structuredClone(current())
    for (const actor of ['officer', 'secretary', 'got_receiver', 'got_officer'] as const) {
      role(actor)
      expect(store().completeResultNotice(NO, 9, { เลขที่หนังสือ: 'แก้แฟ้มปิด' })).toBe(false)
      expect(store().checkResultNoticeReady(NO)).toBe(false)
      store().recordDispatch(NO, 'EMS', 'แฟ้มปิด')
      store().recordDelivery(NO, '2026-10-08T08:00:00Z', { recipient: 'แฟ้มปิด', ackType: 'ใบตอบรับ', ackDocument: 'แฟ้มปิด.pdf' })
      expect(current()).toEqual(closed)
    }
  })

  it('ส่งชุดเสนอเข้าสู่เลขาธิการ เปลี่ยนร่างเป็นรอลงนามทันทีโดยไม่ต้องเปิด modal', () => {
    useCaseStore.setState({ cases: [{ ...initial(), stage: 'staff_review' }] })
    role('officer')
    expect(store().prepareResultNotices(NO)).toBe(true)
    expect(document(9).status).toBe('draft')
    expect(document(10).status).toBe('draft')
    store().forwardCase(NO, 'supervisor_review', 'เสนอชุดเอกสารพร้อมหนังสือแจ้งผล')
    role('supervisor')
    store().forwardCase(NO, 'director_review', 'ผ่านความเห็นชั้นต้น')
    role('director')
    store().forwardCase(NO, 'deputy_review', 'ผ่าน ผอ.')
    role('deputy_secretary')
    store().forwardCase(NO, 'external_pending', 'เสนอเลขาธิการ')
    expect(current().stage).toBe('external_pending')
    expect(document(9).status).toBe('awaiting_signature')
    expect(document(10).status).toBe('awaiting_signature')
    expect(document(9).original).toBeUndefined()
    expect(document(10).original).toBeUndefined()
  })

  for (const formNo of [9, 10] as const) {
    it(`คบ.${formNo} ร่างเก่าที่ไม่รู้เจ้าของไม่ถูกยกให้แฟ้มแรก และสลับแฟ้มแล้วคืนเฉพาะข้อมูลของตน`, () => {
      const B = 'WP-2569-000502'
      const legacy = { เลขที่หนังสือ: 'OTHER-BOOK', เลขคำร้อง: 'OTHER-CASE', คำร้องลงวันที่: 'OTHER-DATE', สาระสำคัญ: 'OTHER-REASON' }
      const legacyLock = { lockedAt: '2026-09-01T08:00:00Z', lockedBy: 'UNKNOWN-LEGACY', reason: 'เจ้าของร่างไม่ทราบ' }
      const legacySignature = { signed: true, signerName: 'UNKNOWN-LEGACY', signedAt: '2026-09-01T08:00:00Z' }
      useCaseStore.setState({ cases: [initial(), { ...initial(), no: B, person: 'นายธันวา พยานสมมติ', createdAt: '2026-10-02T08:00:00Z' }] })
      useFormDraftStore.setState({ drafts: { [formNo]: { ...legacy } }, draftCaseNo: {}, caseDrafts: {}, draftTouched: { [formNo]: true }, signatures: { [`kb${formNo}-secretary`]: legacySignature }, locks: { [formNo]: legacyLock }, revisions: {}, legacyNoticeDrafts: {} })
      role('officer')
      const drafts = () => useFormDraftStore.getState()
      drafts().ensureDraftForCase(formNo, NO, { เลขที่หนังสือ: 'SEED-A', คำร้องลงวันที่: '2026-10-01' })
      expect(drafts().getDraft(formNo)).not.toMatchObject({ เลขที่หนังสือ: 'OTHER-BOOK' })
      expect(drafts().getDraft(formNo)['เลขคำร้อง']).not.toBe('OTHER-CASE')
      expect(drafts().getDraft(formNo)['สาระสำคัญ']).not.toBe('OTHER-REASON')
      expect(drafts().legacyNoticeDrafts?.[formNo]?.drafts[formNo]).toEqual(legacy)
      expect(drafts().legacyNoticeDrafts?.[formNo]?.locks[formNo]).toEqual(legacyLock)
      expect(drafts().legacyNoticeDrafts?.[formNo]?.signatures[`kb${formNo}-secretary`]).toEqual(legacySignature)
      expect(drafts().locks[formNo]).toBeUndefined()
      expect(drafts().signatures[`kb${formNo}-secretary`]).toBeUndefined()
      expect(drafts().draftCaseNo[formNo]).toBe(NO)
      drafts().updateField(formNo, 'เลขที่หนังสือ', 'A-BOOK')
      const ownedA = structuredClone(drafts().getDraft(formNo))
      drafts().ensureDraftForCase(formNo, B, { เลขที่หนังสือ: 'SEED-B', คำร้องลงวันที่: '2026-10-02' })
      expect(drafts().draftCaseNo[formNo]).toBe(B)
      expect(drafts().getDraft(formNo)['เลขที่หนังสือ']).not.toBe('A-BOOK')
      expect(drafts().getDraft(formNo)['เลขที่หนังสือ']).not.toBe('OTHER-BOOK')
      expect(drafts().getDraft(formNo)['เลขคำร้อง']).not.toBe('OTHER-CASE')
      expect(drafts().getDraft(formNo)['คำร้องลงวันที่']).toBe('2026-10-02')
      expect(drafts().getDraft(formNo)['สาระสำคัญ']).not.toBe('OTHER-REASON')
      drafts().updateField(formNo, 'เลขที่หนังสือ', 'B-BOOK')
      drafts().ensureDraftForCase(formNo, NO, {})
      expect(drafts().getDraft(formNo)).toEqual(ownedA)
      expect(drafts().legacyNoticeDrafts?.[formNo]?.drafts[formNo]).toEqual(legacy)
      expect(JSON.parse(localStorage.getItem('ecmis-form-draft-storage-v2')!).state.legacyNoticeDrafts[formNo].drafts[formNo]).toEqual(legacy)
    })
  }

  it('ขอบเขตแก้ร่าง9/10ไม่เปลี่ยนการรับร่าง legacy ของ คบ.3/6 เดิม', () => {
    const legacy3 = { ผู้ให้ถ้อยคำ: 'พยานจากร่างเดิม', บันทึกถ้อยคำ: 'ถ้อยคำเดิม' }
    const legacy6 = { ผลประเมินภัย: 'ผลเดิม', 'รูปแบบคุ้มครองที่เลือก': [1] }
    useFormDraftStore.setState({ drafts: { 3: legacy3, 6: legacy6 }, draftCaseNo: {}, caseDrafts: {}, draftTouched: {}, signatures: {}, locks: {}, revisions: {}, legacyNoticeDrafts: {} })
    for (const formNo of [3, 6]) {
      useFormDraftStore.getState().ensureDraftForCase(formNo, NO, { 'ข้อมูลตั้งต้นใหม่': 'ห้ามทับร่างเดิม3/6' })
      expect(useFormDraftStore.getState().getDraft(formNo)).toEqual(formNo === 3 ? legacy3 : legacy6)
      expect(useFormDraftStore.getState().draftCaseNo[formNo]).toBe(NO)
    }
    expect(useFormDraftStore.getState().legacyNoticeDrafts).toEqual({})
  })
})
const completeFields = {
  เลขที่หนังสือ: 'ปป 001', ปีหนังสือ: '501', วันที่: '7', เดือน: 'ตุลาคม', 'พ.ศ.': '2569', คำร้องลงวันที่: '1 ตุลาคม 2569',
}

describe('นโยบายช่องหนังสือและฉบับจำลอง ณ เวลาลงนาม', () => {
  it('ใช้สำเนานโยบายต่อฉบับ ไม่รับการเปิดสิทธิภายหลังย้อนหลัง', () => {
    const draft = createNoticeDraft(9, initial(), '2026-10-07T08:00:00Z', 'เจ้าหน้าที่')
    expect(draft.policy).not.toBe(NOTICE_FIELD_POLICY)
    expect(draft.policy.allowedAfterSigning).not.toBe(NOTICE_FIELD_POLICY.allowedAfterSigning)
    const before = structuredClone(draft.policy)
    draft.policy.allowedAfterSigning.push('ช่องทดสอบ')
    expect(NOTICE_FIELD_POLICY.allowedAfterSigning).not.toContain('ช่องทดสอบ')
    expect(before.allowedAfterSigning).not.toContain('ช่องทดสอบ')
  })

  it('นโยบายที่ยังไม่ยืนยันห้ามใช้รายการช่องที่เสนอเพื่อข้ามข้อมูลก่อนลงนาม', () => {
    const draft = createNoticeDraft(9, initial(), '2026-10-07T08:00:00Z', 'เจ้าหน้าที่')
    // ข้อมูลทดสอบนโยบายเท่านั้น ไม่ใช่ข้อเสนออนุญาตช่องสำหรับระบบจริง
    draft.policy = { confirmed: false, allowedAfterSigning: ['ช่องทดสอบ'], requiredForSend: ['ช่องทดสอบ'] }
    expect(noticeCanSign(draft)).toBe(false)
    draft.policy.confirmed = true
    expect(noticeCanSign(draft)).toBe(true)
    expect(missingNoticeFields(draft)).toEqual(['ช่องทดสอบ'])
  })

  it('ช่องที่ต้องครบก่อนลงนามยังจำเป็น แม้อนุญาตบางช่องให้เติมภายหลัง', () => {
    const draft = createNoticeDraft(10, initial(), '2026-10-07T08:00:00Z', 'เจ้าหน้าที่')
    draft.policy = { confirmed: true, allowedAfterSigning: ['ช่องเติมภายหลังทดสอบ'], requiredForSend: ['ช่องก่อนลงนามทดสอบ', 'ช่องเติมภายหลังทดสอบ'] }
    expect(noticeCanSign(draft)).toBe(false)
    draft.fields['ช่องก่อนลงนามทดสอบ'] = 'ข้อมูลครบ'
    expect(noticeCanSign(draft)).toBe(true)
    draft.fields['ช่องก่อนลงนามทดสอบ'] = '   '
    expect(noticeCanSign(draft)).toBe(false)
  })

  for (const formNo of [9, 10] as const) {
    it(`คบ.${formNo} เก็บฉบับลงนามแยกจากร่างและระบุลายมือชื่อจำลอง`, () => {
      const draft = createNoticeDraft(formNo, initial(), '2026-10-07T08:00:00Z', 'เจ้าหน้าที่', completeFields)
      const signed = signNoticeSnapshot(draft, initial(), '2026-10-07T09:00:00Z', 'เลขาธิการทดสอบ', 'ลธ. 501/2569', 'เหตุผลทดสอบ')
      expect(signed.original?.outcome).toBe(formNo === 9 ? 'approved' : 'rejected')
      expect(signed.original?.formNo).toBe(formNo)
      expect(signed.original?.signatureMode).toBe('simulated')
      expect(signed.original?.signatureVerification).toBe('simulated_original')
      expect(signed.status).toBe('completed')
      expect(noticeCanSign(signed)).toBe(false)
      const original = structuredClone(signed.original)
      signed.fields['เลขที่หนังสือ'] = 'แก้ร่างตัวอย่าง'
      signed.versions[0].fields['เลขที่หนังสือ'] = 'แก้สำเนารุ่นตัวอย่าง'
      expect(signed.original).toEqual(original)
      expect(draft.original).toBeUndefined()
      expect(draft.fields['เลขาธิการ']).toBeUndefined()
    })
  }

  it('ลงนามโดยมีช่องเติมภายหลังที่ขาด สถานะไม่กลายเป็นพร้อมส่งหรือส่งแล้ว', () => {
    const draft = createNoticeDraft(9, initial(), '2026-10-07T08:00:00Z', 'เจ้าหน้าที่')
    draft.policy = { confirmed: true, allowedAfterSigning: ['ช่องเติมภายหลังทดสอบ'], requiredForSend: ['ช่องเติมภายหลังทดสอบ'] }
    const signed = signNoticeSnapshot(draft, initial(), '2026-10-07T09:00:00Z', 'เลขาธิการทดสอบ', 'ลธ. 501/2569', 'เหตุผลทดสอบ')
    expect(signed.status).toBe('signed_incomplete')
    expect(missingNoticeFields(signed)).toEqual(['ช่องเติมภายหลังทดสอบ'])
    expect(signed.dispatches).toEqual([])
  })
})
