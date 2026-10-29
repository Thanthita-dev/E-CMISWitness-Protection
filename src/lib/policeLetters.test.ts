import { beforeEach, describe, expect, it } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { useFormDraftStore } from '../store/useFormDraftStore'
import type { CaseItem } from '../types/case'
import { createPoliceBundle, policeAllSigned, policeMissing, policeRequired, policeRevisionKey } from './policeLetters'
import { preparePoliceLetters, savePoliceData, requestPoliceNumbers, issuePoliceNumbers, signPoliceLetters, sendPoliceLetter, revisePoliceLetters } from './policeLetterActions'
import { passSarabanCheckpoint, passDirectorToDeputy } from './sarabanTestHelpers'
import { KB11_SIGN_SLOTS } from './formSignature'
import { ECMIS_USER_DIRECTORY } from './constants'
import { advancePoliceRevision, dispatchPoliceRevision } from './policeLetterActions'
import { SARABAN_STAGES } from './saraban'

const NO = 'POLICE-0501/2569'
const store = () => useCaseStore.getState()
const current = () => store().cases.find(c => c.no === NO)!
const role = (r: Parameters<ReturnType<typeof useAuthStore.getState>['setRole']>[0]) => useAuthStore.getState().setRole(r)
const kb6 = { รูปแบบคุ้มครองที่เลือก: [4], หน่วยงานรูปแบบข้อ4: 'ส่งให้ตำรวจ', ระยะเวลาคุ้มครองวัน: 30 }
const base = (): CaseItem => ({ no: NO, form: 'คบ.1', person: 'พยานทดสอบ', stage: 'staff_review', status: 'จัดทำ', owner: 'เจ้าหน้าที่', next: '', risk: 'สูง', orgUnitId: 'central-wp', assignedOfficerUserId: 'OFF-001', assignedOfficer: 'นางสาวอรุณี ใจมั่น', kb6SecretarySignedAt: '2026-10-27T00:00:00Z', documents: [], assignmentHistory: [], methodTracks: [{ method: 4, status: 'pending', coordination: { agencyType: 'police', agency: '', responseStatus: 'awaiting' } }] })
const decision = { decisionNo: 'ลธ. 501/2569', reason: 'คุ้มครองตามข้อเท็จจริงทดสอบ', instruction: 'ดำเนินการ', durationDays: 30, destination: 'original_owner' as const, fields: {} }
const numbers = { station: { registryNo: 'ปป ๐๐๑๒/101', registryDate: '2026-10-27' }, national: { registryNo: 'ปป ๐๐๑๒/102', registryDate: '2026-10-27' } }
function prepared() {
  expect(preparePoliceLetters(NO)).toBe(true)
  const data = { ...current().policeLetters!.data, age: '40', citizenId: '1234567890123', house: '1', village: '2', subdistrict: 'ทดสอบ', district: 'ทดสอบ', province: 'นนทบุรี', phone: '020000000', station: 'สถานีตำรวจภูธรทดสอบ', months: '1', start: '2026-11-01', end: '2026-12-01', contact: 'เจ้าหน้าที่ทดสอบ', contactPhone: '020000000' }
  expect(savePoliceData(NO, data)).toBe(true)
}
function secretary() {
  store().updateCase(NO, { stage: 'external_pending' }); role('secretary')
  expect(store().beginPreliminaryDecision(NO, 'approved')).toBe(true)
  expect(store().savePreliminaryDecision(NO, 9, decision)).toBe(true)
  expect(requestPoliceNumbers(NO)).toBe(true)
  role('secretary_receiver'); expect(issuePoliceNumbers(NO, numbers)).toBe(true); role('secretary')
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear()
  useCaseStore.setState({ cases: [base()], activeCaseNo: NO })
  useAuthStore.setState({ currentOfficerUserId: 'OFF-001', loginUsername: null })
  role('officer')
  useFormDraftStore.setState({ drafts: { 6: kb6 }, draftCaseNo: { 6: NO }, caseDrafts: {}, locks: {}, signatures: {}, revisions: {}, draftTouched: {} })
})
describe('หนังสือตำรวจในรอบอนุมัติเดียว', () => {
  it('ถ้อยคำต้นฉบับ แยกผู้รับ ไม่เพิ่ม คบ.11 และไม่เติมข้อมูลส่วนบุคคลที่ไม่มี', () => {
    const b = createPoliceBundle(base(), {}, kb6, 'เจ้าหน้าที่')
    expect(b.data.citizenId).toBe(''); expect(b.data.start).toBe('')
    expect(b.letters.station.draft.body).toContain('มาตรา 53')
    expect(b.letters.national.draft.body).toContain('ได้มีหนังสือขอความอนุเคราะห์ไปยัง')
    expect(b.letters.station.draft.body).not.toContain('คบ.11')
    expect(b.letters.national.id).not.toBe(b.letters.station.id)
  })
  it('สร้างเพียงสองฉบับ และไม่สร้างใหม่เมื่อเปิดหรือเตรียมซ้ำ', () => {
    prepared(); const ids = Object.values(current().policeLetters!.letters).map(l => l.id)
    expect(preparePoliceLetters(NO)).toBe(true)
    expect(Object.values(current().policeLetters!.letters).map(l => l.id)).toEqual(ids)
    expect(current().officialLetters || []).toHaveLength(0)
  })
  it('เดินสายผู้ตรวจและสารบรรณเดิมโดยเก็บหนังสือชุดเดียว', () => {
    prepared(); const id = current().policeLetters!.letters.station.id
    store().forwardCase(NO, 'supervisor_review'); expect(current().stage).toBe('supervisor_review')
    role('supervisor'); store().forwardCase(NO, 'director_review'); expect(current().stage).toBe('director_review')
    role('director'); store().forwardCase(NO, SARABAN_STAGES.director_outgoing)
    expect(passDirectorToDeputy(NO)).toBe(true); expect(current().stage).toBe('deputy_review')
    role('deputy_secretary'); store().forwardCase(NO, 'external_pending'); expect(current().stage).toBe('external_pending')
    expect(current().policeLetters!.letters.station.id).toBe(id)
  })
  it('ข้อมูลไม่ครบและยังไม่ได้ตรวจฉบับปัจจุบัน ลงนามไม่ได้', () => {
    prepared(); secretary()
    expect(signPoliceLetters(NO, 'stale').ok).toBe(false)
    const b = current().policeLetters!; b.data.contactPhone = ''
    expect(policeMissing(b)).toContain('โทรศัพท์หน่วยงานติดต่อ')
    expect(signPoliceLetters(NO, policeRevisionKey(b)).ok).toBe(false)
    expect(current().kb9Signed).not.toBe(true)
  })
  it('ธุรการ สลธ. เท่านั้นเตรียมเลข เลขซ้ำสองฉบับไม่ได้', () => {
    prepared(); store().updateCase(NO, { stage: 'external_pending' }); role('secretary'); requestPoliceNumbers(NO)
    expect(issuePoliceNumbers(NO, numbers)).toBe(false)
    role('receiver'); expect(issuePoliceNumbers(NO, numbers)).toBe(false)
    role('secretary_receiver'); expect(issuePoliceNumbers(NO, { station: numbers.station, national: numbers.station })).toBe(false)
    expect(issuePoliceNumbers(NO, numbers)).toBe(true)
    expect(current().policeLetters!.letters.national.draft.enclosure).toContain(numbers.station.registryNo)
  })
  it('สำเร็จบางฉบับ บันทึกสถานะจริง ลองใหม่เฉพาะฉบับค้าง ไม่ลงนามซ้ำ', () => {
    prepared(); secretary()
    const key = policeRevisionKey(current().policeLetters!)
    const first = signPoliceLetters(NO, key, 'data:image/png;base64,test', kind => { if (kind === 'national') throw Error('provider unavailable') })
    expect(first.signed).toEqual(['station']); expect(first.pending).toEqual(['national'])
    expect(store().confirmPreliminaryDecision(NO, 9)).toBe(false)
    const station = structuredClone(current().policeLetters!.letters.station)
    expect(signPoliceLetters(NO, key).ok).toBe(true)
    expect(current().policeLetters!.letters.station).toEqual(station)
    expect(store().confirmPreliminaryDecision(NO, 9)).toBe(true)
    expect(current().kb9Signed).toBe(true)
    expect(store().confirmPreliminaryDecision(NO, 9)).toBe(false)
    expect(current().policeLetters!.events.filter(e => e.action.startsWith('ลงนามหนังสือ')).length).toBe(2)
  })
  it('ผ่านธุรการหลังลงนามและนำส่งสถานีตำรวจก่อนฉบับชาติพร้อมสำเนาถูกฉบับ', () => {
    prepared(); secretary(); expect(signPoliceLetters(NO, policeRevisionKey(current().policeLetters!)).ok).toBe(true)
    expect(store().confirmPreliminaryDecision(NO, 9)).toBe(true)
    expect(store().sendSignedDecision(NO)).toBe(true)
    expect(passSarabanCheckpoint(NO)).toBe(true); expect(passSarabanCheckpoint(NO)).toBe(true)
    role('officer')
    expect(sendPoliceLetter(NO, 'national', 'direct', '')).toBe(false)
    expect(sendPoliceLetter(NO, 'station', 'post', '')).toBe(false)
    expect(sendPoliceLetter(NO, 'station', 'direct', '')).toBe(true)
    expect(sendPoliceLetter(NO, 'station', 'direct', '')).toBe(false)
    expect(sendPoliceLetter(NO, 'national', 'direct', '')).toBe(true)
    expect(current().officialLetters).toHaveLength(2)
    expect(current().officialLetters![1].note).toContain(current().policeLetters!.letters.station.id)
    expect(current().kb11Signed).not.toBe(true)
    expect(current().methodTracks![0].coordination?.handoverCompletedAt).toBeUndefined()
  })
  it('ผู้รับผิดชอบนำส่งฉบับลงนามได้แม้ไม่มีสถานะเตรียมเลข โดยรักษาฉบับลงนามเดิม', () => {
    prepared(); secretary(); expect(signPoliceLetters(NO, policeRevisionKey(current().policeLetters!)).ok).toBe(true)
    expect(store().confirmPreliminaryDecision(NO, 9)).toBe(true)
    expect(store().sendSignedDecision(NO)).toBe(true)
    expect(passSarabanCheckpoint(NO)).toBe(true); expect(passSarabanCheckpoint(NO)).toBe(true)
    const bundle = current().policeLetters!
    store().updateCase(NO, { policeLetters: { ...bundle, letters: {
      station: { ...bundle.letters.station, numberedAt: undefined },
      national: { ...bundle.letters.national, numberedAt: undefined },
    } } })
    role('officer')
    expect(sendPoliceLetter(NO, 'station', 'post', 'EMS-111900')).toBe(true)
    expect(current().policeLetters!.letters.station.signedHtml).toBe(bundle.letters.station.signedHtml)
    expect(sendPoliceLetter(NO, 'national', 'direct', '')).toBe(true)
    expect(current().officialLetters).toHaveLength(2)
  })
  it('ฉบับลงนามแก้ทับไม่ได้ ฉบับแก้ไขเก็บต้นฉบับและไม่มีลายมือชื่อเดิม', () => {
    prepared(); secretary(); signPoliceLetters(NO, policeRevisionKey(current().policeLetters!))
    const original = structuredClone(current().policeLetters!.letters.station)
    role('admin'); expect(savePoliceData(NO, { ...current().policeLetters!.data, station: 'ใหม่' })).toBe(false)
    expect(revisePoliceLetters(NO, 'แก้สถานีตำรวจ')).toBe(true)
    expect(current().policeLetters!.archives[0]).toEqual(original)
    expect(current().policeLetters!.letters.station.signedAt).toBeUndefined()
    expect(current().policeLetters!.letters.station.draft.signatureImage).toBeUndefined()
    expect(current().policeLetters!.letters.station.id).not.toBe(original.id)
  })
  it('วิธีอื่นและปลายทางอื่นไม่บังคับหนังสือตำรวจ', () => {
    for (const agency of ['ส่งให้กรมการปกครอง', 'ส่งให้ทหาร', 'ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ']) expect(policeRequired(base(), { ...kb6, หน่วยงานรูปแบบข้อ4: agency })).toBe(false)
    expect(policeRequired(base(), { ...kb6, รูปแบบคุ้มครองที่เลือก: [1] })).toBe(false)
  })
  it('ไม่หยิบข้อมูลข้ามแฟ้ม', () => {
    useFormDraftStore.setState({ drafts: { 6: kb6, 2: { เลขบัตรประชาชน: 'ข้อมูลบุคคลอีกแฟ้ม', บ้านเลขที่: 'ห้ามคัดลอก' } }, draftCaseNo: { 6: NO, 2: 'OTHER' } })
    expect(preparePoliceLetters(NO)).toBe(true)
    expect(current().policeLetters!.data.citizenId).toBe('')
    expect(current().policeLetters!.data.house).toBe('')
    prepared(); const other = { ...base(), no: 'OTHER', person: 'คนละแฟ้ม' }
    store().addCase(other)
    expect(preparePoliceLetters('OTHER')).toBe(false)
    expect(current().policeLetters!.data.witness).toBe('พยานทดสอบ')
    expect(store().getCase('OTHER')!.policeLetters).toBeUndefined()
  })
  it('ผู้ตรวจแต่ละชั้นส่งกลับแก้ไขได้โดยใช้หนังสือเดิม ไม่สร้างร่างซ้ำ', () => {
    prepared(); const id = current().policeLetters!.letters.station.id
    for (const [reviewer, stage] of [['supervisor', 'supervisor_review'], ['director', 'director_review'], ['deputy_secretary', 'deputy_review']] as const) {
      store().updateCase(NO, { stage }); role(reviewer)
      expect(store().returnCase(NO, reviewer, 'แก้หนังสือ', 'ตรวจข้อมูลสถานี', 'officer', reviewer)).toBe(true)
      expect(current().stage).toBe('staff_review')
      role('officer')
      expect(savePoliceData(NO, { ...current().policeLetters!.data, contact: `ผู้ประสานงาน ${reviewer}` })).toBe(true)
      expect(current().policeLetters!.letters.station.id).toBe(id)
    }
  })
  it('สาย กอท. แก้ชุดเดิมหลังรองเลขาธิการส่งกลับได้ เจ้าของเดิมแก้ไม่ได้', () => {
    prepared(); store().updateCase(NO, { stage: 'deputy_review' }); role('deputy_secretary')
    expect(store().returnCase(NO, 'รองเลขาธิการ', 'หนังสือ', 'กอท. ตรวจเพิ่มเติม', 'officer', 'deputy_secretary', { destination: 'got' })).toBe(true)
    role('officer'); expect(savePoliceData(NO, { ...current().policeLetters!.data, contact: 'คนเดิม' })).toBe(false)
    const got = ECMIS_USER_DIRECTORY.find(u => u.id === current().gotRevision!.assigneeUserId)!
    role('got_officer'); useAuthStore.setState({ currentOfficerUserId: got.id })
    expect(savePoliceData(NO, { ...current().policeLetters!.data, contact: got.name })).toBe(true)
    const id = current().policeLetters!.letters.station.id
    store().forwardCase(NO, 'supervisor_review'); role('got_supervisor'); store().forwardCase(NO, 'director_review')
    expect(current().policeLetters!.letters.station.id).toBe(id)
  })
  it('หลังอนุมัติ ฉบับแก้ไขผ่านผู้ตรวจใหม่ ลงนามใหม่และผ่านธุรการ โดยไม่ลงนาม คบ.9 ซ้ำ', () => {
    prepared(); secretary(); signPoliceLetters(NO, policeRevisionKey(current().policeLetters!))
    expect(store().confirmPreliminaryDecision(NO, 9)).toBe(true)
    store().sendSignedDecision(NO); passSarabanCheckpoint(NO); passSarabanCheckpoint(NO)
    const originalKb9 = structuredClone(current().resultNotices![9]!.original)
    role('officer'); expect(revisePoliceLetters(NO, 'แก้ผู้ประสานงาน')).toBe(true)
    expect(savePoliceData(NO, { ...current().policeLetters!.data, contact: 'ผู้ประสานงานใหม่' })).toBe(true)
    expect(advancePoliceRevision(NO, 'submit')).toBe(true)
    role('supervisor'); expect(advancePoliceRevision(NO, 'approve')).toBe(true)
    role('director'); expect(advancePoliceRevision(NO, 'approve')).toBe(true)
    role('deputy_secretary'); expect(advancePoliceRevision(NO, 'approve')).toBe(true)
    role('secretary'); expect(requestPoliceNumbers(NO)).toBe(true)
    role('secretary_receiver'); expect(issuePoliceNumbers(NO, { station: { ...numbers.station, registryNo: 'ปป 0012/103' }, national: { ...numbers.national, registryNo: 'ปป 0012/104' } })).toBe(true)
    role('secretary'); expect(signPoliceLetters(NO, policeRevisionKey(current().policeLetters!)).ok).toBe(true)
    role('officer'); expect(sendPoliceLetter(NO, 'station', 'direct', '')).toBe(false)
    role('secretary_receiver'); expect(dispatchPoliceRevision(NO)).toBe(true)
    role('officer'); expect(sendPoliceLetter(NO, 'station', 'direct', '')).toBe(true)
    expect(current().resultNotices![9]!.original).toEqual(originalKb9)
    expect(current().policeLetters!.archives).toHaveLength(2)
  })
  it('หนังสือตอบรับอ้างฉบับส่งออก และยังบังคับความยินยอม คบ.11 ก่อนส่งมอบ คบ.12', () => {
    prepared(); secretary(); signPoliceLetters(NO, policeRevisionKey(current().policeLetters!)); store().confirmPreliminaryDecision(NO, 9)
    store().sendSignedDecision(NO); passSarabanCheckpoint(NO); passSarabanCheckpoint(NO); role('officer')
    sendPoliceLetter(NO, 'station', 'direct', ''); sendPoliceLetter(NO, 'national', 'direct', '')
    store().addOfficialLetter(NO, { direction: 'incoming', context: 'method4', methodNo: 4, subject: 'หนังสือตอบรับดำเนินการคุ้มครองพยาน', agency: current().policeLetters!.data.station, registryNo: 'สภ.1', documentName: 'ตอบรับ.pdf', receivedAt: '2026-10-28T00:00:00Z' })
    expect(current().officialLetters!.at(-1)!.replyToLetterId).toBe(current().policeLetters!.letters.station.id)
    store().updateMethodTrack(NO, 4, { coordination: { ...current().methodTracks![0].coordination, responseStatus: 'accepted', acceptedAt: '2026-10-28T00:00:00Z', replyEvidenceName: 'ตอบรับ.pdf' } })
    store().completeMethod4Handover(NO, { handoverCompletedAt: '2026-11-01T00:00:00Z' })
    expect(current().methodTracks![0].coordination!.handoverCompletedAt).toBeUndefined()
    store().updateCase(NO, { dispatchedAt: '2026-10-28T00:00:00Z', deliveredAt: '2026-10-28T01:00:00Z', deliveryRecipient: current().person, deliveryAckType: 'ใบตอบรับ' })
    const forms = useFormDraftStore.getState()
    forms.ensureDraftForCase(11, NO, {})
    for (const slot of KB11_SIGN_SLOTS) forms.signDocument(slot.key, slot.label)
    store().recordConsent(NO, { ref: 'kb11', consented: true, by: current().person, evidence: 'ลงนามครบสองฝ่าย' })
    expect(current().kb11Signed).toBe(true)
    store().completeMethod4Handover(NO, { handoverCompletedAt: '2026-11-01T00:00:00Z' })
    expect(current().methodTracks![0].coordination!.handoverCompletedAt).toBe('2026-11-01T00:00:00.000Z')
  })

})
