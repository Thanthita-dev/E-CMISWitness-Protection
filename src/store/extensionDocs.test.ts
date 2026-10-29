import { it, expect, beforeEach } from 'vitest'
import { useCaseStore } from './useCaseStore'
import { useAuthStore } from './useAuthStore'
import { useFormDraftStore } from './useFormDraftStore'
import { passSarabanCheckpoint } from '../lib/sarabanTestHelpers'
import { getActiveExtensionDocs, extensionKb6PendingSigner } from '../lib/formSignature'

const NO = 'WP-TEST-EXTDOCS'
const iso = (d: Date) => d.toISOString()
const addDaysIso = (base: string, n: number) => { const d = new Date(base); d.setDate(d.getDate() + n); return iso(d).slice(0, 10) }
const get = () => useCaseStore.getState().getCase(NO)!
const as = (role: string) => useAuthStore.setState({ currentRole: role as never })
const forms = () => useFormDraftStore.getState()

function seedCase() {
  const start = new Date(); start.setDate(start.getDate() - 80)
  const end = new Date(start); end.setMonth(end.getMonth() + 3)
  useCaseStore.setState({ cases: [{ no: NO, form: 'คบ.1', person: 'ทดสอบ', status: 'กำลังคุ้มครอง', stage: 'protection', owner: 'x', next: '-', risk: 'สูง', assignedOfficer: 'นางสาวอรุณี ใจมั่น', actualStartedAt: iso(start), protectionEndAt: iso(end), protectionMonths: 3, episode: { id: 'EP', openedAt: iso(start), phases: [{ id: 'PH', kind: 'MAIN', startedAt: iso(start) }] } } as never], activeCaseNo: NO })
}
function draft(months: number) {
  const c = get()
  const from = addDaysIso(c.protectionEndAt!, 1), to = addDaysIso(from, months * 30)
  as('officer')
  useCaseStore.getState().draftKb14(NO, { reason: 'ยังมีภัย', durationDays: months * 30, durationMonths: months, periodFrom: from, periodTo: to, formSnapshot: { 'เหตุผลขยายเวลา': 'ยังมีภัย' } } as never, 'นางสาวอรุณี ใจมั่น')
  return get().extensionRequests!.at(-1)!
}
/** ผ่านจุดธุรการให้ครบทุกขา (ขาออกหน่วย → ขาเข้า สลธ. หรือกลับกัน) */
const settle = () => { while (get().sarabanDispatch) if (!passSarabanCheckpoint(NO)) break }
const review = (role: string, endorse = true, note = 'เห็นชอบ') => { as(role); useCaseStore.getState().reviewKb14(NO, get().extensionRequests!.at(-1)!.id, endorse, note); settle() }
/** รอบขยายเวลาที่แนบ คบ.6 — ชั้นผู้ตรวจลงนาม คบ.6 ก่อน แล้วจึงส่งต่อ */
const signAndForward = (role: string) => { as(role); useCaseStore.getState().signExtensionKb6(NO, 'เห็นชอบ'); review(role) }

beforeEach(() => {
  useFormDraftStore.setState({ drafts: {}, draftCaseNo: {}, draftTouched: {}, locks: {}, revisions: {}, signatures: {}, caseDrafts: {} } as never)
  seedCase(); as('officer')
})

it('start → ฉบับที่ 2 พร้อมข้อมูลเดิม และฉบับเดิมอยู่ใน revisions; เรียกซ้ำไม่สร้างฉบับใหม่', () => {
  forms().ensureDraftForCase(3, NO, {})
  forms().ensureDraftForCase(6, NO, {})
  forms().updateField(3, 'ชื่อ', 'สมชาย')
  const r = useCaseStore.getState().startExtensionDocs(NO)!
  expect(r).toEqual({ round: 1, kb3Version: 2, kb6Version: 2 })
  expect(forms().revisions[3]).toHaveLength(1)
  expect(forms().revisions[6]).toHaveLength(1)
  expect(forms().getDraft(3)['ชื่อ']).toBe('สมชาย')
  expect(forms().revisions[3][0].snapshot['ชื่อ']).toBe('สมชาย')
  expect(get().extensionDocs?.kb6Version).toBe(2)
  expect(get().extraForms).toContain(14)
  const again = useCaseStore.getState().startExtensionDocs(NO)!
  expect(again).toEqual(r)
  expect(forms().revisions[6]).toHaveLength(1)
})

it('draftKb14 แนบสำเนาและล็อก; ลงนามตามลำดับ ผบ.→ผอ.→รอง; ส่งกลับแล้วล้างและปลดล็อก; ส่งใหม่คงฉบับเดิม', () => {
  seedCase()
  useCaseStore.getState().startExtensionDocs(NO)
  const req = draft(2)
  expect(req.docVersion).toBe(2)
  expect(req.kb3Snapshot).toBeTruthy()
  expect(req.kb6Snapshot).toBeTruthy()
  expect(forms().locks[3]).toBeTruthy()
  expect(forms().locks[6]).toBeTruthy()
  expect(getActiveExtensionDocs(get())?.editable).toBe(false)
  expect(extensionKb6PendingSigner(get(), 'supervisor')?.role).toBe('supervisor')
  expect(extensionKb6PendingSigner(get(), 'director')).toBeNull()

  signAndForward('supervisor')
  signAndForward('director')
  signAndForward('deputy_secretary')
  const r = get().extensionRequests!.at(-1)!
  expect(Object.keys(r.kb6Signatures!)).toEqual(['supervisor', 'director', 'deputy'])
  expect(forms().signatures['kb6-supervisor']).toMatchObject({ signed: true })
  expect(forms().signatures['kb6-deputy'].signed).toBe(true)
  expect(forms().getDraft(6)['ความเห็นผู้อำนวยการ']).toBeTruthy()
  expect(get().extensionRequests!.at(-1)!.approvalStage).toBe('secretary')
})

it('ส่งกลับแก้ → ล้างลายมือชื่อ คบ.6 ปลดล็อก แล้วส่งใหม่ docVersion เดิม', () => {
  seedCase()
  useCaseStore.getState().startExtensionDocs(NO)
  draft(2)
  signAndForward('supervisor')
  review('director', false, 'แก้ไข')
  let r = get().extensionRequests!.at(-1)!
  expect(r.status).toBe('returned')
  expect(r.kb6Signatures).toEqual({})
  expect(forms().locks[3]).toBeUndefined()
  expect(forms().locks[6]).toBeUndefined()
  expect(Object.keys(forms().signatures).filter((k) => k.startsWith('kb6-'))).toHaveLength(0)
  expect(forms().revisions[6]).toHaveLength(1)
  expect(getActiveExtensionDocs(get())?.editable).toBe(true)
  r = draft(2)
  expect(r.docVersion).toBe(2)
  expect(forms().revisions[6]).toHaveLength(1)
  expect(forms().locks[6]).toBeTruthy()
  expect(r.status).toBe('submitted')
})

it('เลขาธิการอนุมัติ → ลงนาม คบ.6 และต่อวันคุ้มครอง; รอบสองได้ฉบับที่ 3', () => {
  seedCase()
  useCaseStore.getState().startExtensionDocs(NO)
  const end0 = get().protectionEndAt
  draft(1)
  for (const role of ['supervisor', 'director', 'deputy_secretary']) signAndForward(role)
  as('secretary')
  const id = get().extensionRequests!.at(-1)!.id
  useCaseStore.getState().decideExtension(NO, id, true, 'อนุมัติ')
  expect(get().extensionRequests!.at(-1)!.status).toBe('pending')
  expect(useCaseStore.getState().signExtensionKb6(NO, 'อนุมัติ')).toBe(true)
  expect(get().extensionRequests!.at(-1)!.status).toBe('pending')
  useCaseStore.getState().decideExtension(NO, id, true, 'อนุมัติ')
  settle()
  const r = get().extensionRequests!.at(-1)!
  expect(r.status).toBe('approved')
  expect(r.kb6Signatures?.secretary?.opinion).toBe('อนุมัติ')
  expect(forms().signatures['kb6-secretary'].signed).toBe(true)
  expect(get().protectionEndAt).not.toBe(end0)
  expect(getActiveExtensionDocs(get())).toBeNull()

  as('officer')
  expect(useCaseStore.getState().startExtensionDocs(NO)).toEqual({ round: 2, kb3Version: 3, kb6Version: 3 })
  expect(forms().revisions[6]).toHaveLength(2)
  expect(forms().signatures['kb6-secretary']).toBeUndefined()
  const second = draft(1)
  expect(second.docVersion).toBe(3)
})

it('signExtensionKb6 ลงนามตามขั้นปัจจุบันอย่างเดียว ยังไม่ส่งต่อ', () => {
  seedCase()
  useCaseStore.getState().startExtensionDocs(NO)
  draft(1)
  as('director')
  expect(useCaseStore.getState().signExtensionKb6(NO)).toBe(false)
  as('supervisor')
  expect(useCaseStore.getState().signExtensionKb6(NO)).toBe(true)
  const r = get().extensionRequests!.at(-1)!
  expect(r.kb6Signatures?.supervisor).toBeTruthy()
  expect(r.approvalStage).toBe('supervisor')
  expect(r.status).toBe('submitted')
})

it('ยังไม่ลงนาม คบ.6 ส่งต่อชั้นถัดไปไม่ได้ แต่ส่งคืนแก้ไขได้', () => {
  seedCase()
  useCaseStore.getState().startExtensionDocs(NO)
  draft(1)
  review('supervisor')
  expect(get().extensionRequests!.at(-1)!.approvalStage).toBe('supervisor')
  expect(get().extensionRequests!.at(-1)!.status).toBe('submitted')
  signAndForward('supervisor')
  expect(get().extensionRequests!.at(-1)!.approvalStage).toBe('director')
  review('director')
  expect(get().extensionRequests!.at(-1)!.approvalStage).toBe('director')
  review('director', false, 'แก้ไขเหตุผล')
  expect(get().extensionRequests!.at(-1)!.status).toBe('returned')
})

it('คำขอแบบเดิมที่ไม่มี kb6Snapshot ทำงานเหมือนเดิม', () => {
  seedCase()
  const req = draft(1)
  expect(req.kb6Snapshot).toBeUndefined()
  expect(req.kb6Signatures).toBeUndefined()
  expect(forms().locks[6]).toBeUndefined()
  for (const role of ['supervisor', 'director', 'deputy_secretary']) review(role)
  as('secretary')
  useCaseStore.getState().decideExtension(NO, get().extensionRequests!.at(-1)!.id, true, 'อนุมัติ')
  settle()
  const r = get().extensionRequests!.at(-1)!
  expect(r.status).toBe('approved')
  expect(r.kb6Signatures).toBeUndefined()
  expect(getActiveExtensionDocs(get())).toBeNull()
})

it('เลขาธิการต้องลงนาม คบ.6 ก่อนทุกการตัดสินใจ · ไม่อนุมัติคงลายมือชื่อ · ส่งคืนล้างลายมือชื่อ', () => {
  seedCase()
  useCaseStore.getState().startExtensionDocs(NO)
  draft(1)
  for (const role of ['supervisor', 'director', 'deputy_secretary']) signAndForward(role)
  as('secretary')
  const id = get().extensionRequests!.at(-1)!.id
  useCaseStore.getState().decideExtension(NO, id, false, 'ไม่มีภัยแล้ว')
  review('secretary', false, 'แก้ไข')
  expect(get().extensionRequests!.at(-1)!.status).toBe('pending')

  useCaseStore.getState().signExtensionKb6(NO, 'ไม่อนุมัติ')
  useCaseStore.getState().decideExtension(NO, id, false, 'ไม่มีภัยแล้ว')
  settle()
  const r = get().extensionRequests!.at(-1)!
  expect(r.status).toBe('rejected')
  expect(r.kb6Signatures?.secretary).toBeTruthy()
})

it('เลขาธิการลงนามแล้วส่งคืนแก้ไข → ล้างลายมือชื่อ คบ.6 ทุกชั้น', () => {
  seedCase()
  useCaseStore.getState().startExtensionDocs(NO)
  draft(1)
  for (const role of ['supervisor', 'director', 'deputy_secretary']) signAndForward(role)
  as('secretary')
  useCaseStore.getState().signExtensionKb6(NO, 'แก้ไข')
  review('secretary', false, 'แก้ไขเหตุผล')
  const r = get().extensionRequests!.at(-1)!
  expect(r.status).toBe('returned')
  expect(r.kb6Signatures).toEqual({})
})
