import { it, expect, beforeEach } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { useFormDraftStore } from '../store/useFormDraftStore'
import { passSarabanCheckpoint } from './sarabanTestHelpers'
import { sarabanInTransit } from './saraban'
import { canSubmitKb14 } from './kb14Submit'
import { extensionKb6PendingSigner } from './formSignature'

const NO = 'WP-TEST-DSP-KB14'
const iso = (d: Date) => d.toISOString()
const addDaysIso = (base: string, n: number) => { const d = new Date(base); d.setDate(d.getDate() + n); return iso(d).slice(0, 10) }
const get = () => useCaseStore.getState().getCase(NO)!
const as = (role: string) => useAuthStore.setState({ currentRole: role as never })
const store = () => useCaseStore.getState()
const last = () => get().extensionRequests!.at(-1)!

function seed() {
  const start = new Date(); start.setDate(start.getDate() - 80)
  const end = new Date(start); end.setMonth(end.getMonth() + 3)
  useFormDraftStore.setState({ drafts: {}, draftCaseNo: {}, draftTouched: {}, locks: {}, revisions: {}, signatures: {}, caseDrafts: {} } as never)
  useCaseStore.setState({ cases: [{ no: NO, form: 'คบ.1', person: 'ทดสอบ', status: 'กำลังคุ้มครอง', stage: 'protection', owner: 'x', next: '-', risk: 'สูง', assignedOfficer: 'นางสาวอรุณี ใจมั่น', actualStartedAt: iso(start), protectionEndAt: iso(end), protectionMonths: 3, episode: { id: 'EP', openedAt: iso(start), phases: [{ id: 'PH', kind: 'MAIN', startedAt: iso(start) }] } } as never], activeCaseNo: NO })
  as('officer')
}
function draft() {
  const from = addDaysIso(get().protectionEndAt!, 1)
  store().draftKb14(NO, { reason: 'ยังมีภัย', durationDays: 30, durationMonths: 1, periodFrom: from, periodTo: addDaysIso(from, 30), formSnapshot: { 'เหตุผลขยายเวลา': 'ยังมีภัย' } } as never, 'นางสาวอรุณี ใจมั่น')
}
const review = (role: string, endorse = true) => { as(role); store().reviewKb14(NO, last().id, endorse, 'ความเห็น') }

beforeEach(seed)

it('ผอ.เห็นชอบ → ขาขึ้นผ่านธุรการหน่วยและธุรการ สลธ. ก่อนถึงรองเลขาธิการ', () => {
  draft()
  review('supervisor'); review('director')
  expect(get().sarabanDispatch).toMatchObject({ flow: 'kb14', direction: 'up', forms: [14], subject: 'คบ.14 บันทึกเพิ่มเติม ครั้งที่ 1 · ขอขยายระยะเวลา' })
  expect(sarabanInTransit(get(), 'kb14')).toBe(true)
  expect(last().approvalStage).toBe('deputy_secretary')
  /** รองเลขาธิการยังกระทำไม่ได้ขณะอยู่ระหว่างนำส่ง */
  review('deputy_secretary')
  expect(last().approvalStage).toBe('deputy_secretary')
  expect(last().approvalHistory).toHaveLength(2)
  expect(passSarabanCheckpoint(NO)).toBe(true)
  expect(get().sarabanDispatch).toBeTruthy()
  expect(passSarabanCheckpoint(NO)).toBe(true)
  expect(get().sarabanDispatch).toBeUndefined()
  review('deputy_secretary')
  expect(last().approvalStage).toBe('secretary')
})

it('เลขาธิการอนุมัติ → ผลลงหน่วยผ่านธุรการ; เจ้าของสำนวนรับทราบได้หลังธุรการหน่วยรับเข้า', () => {
  draft()
  for (const r of ['supervisor', 'director']) review(r)
  passSarabanCheckpoint(NO); passSarabanCheckpoint(NO)
  review('deputy_secretary')
  as('secretary')
  store().decideExtension(NO, last().id, true, 'อนุมัติ')
  expect(get().sarabanDispatch).toMatchObject({ flow: 'kb14', direction: 'down', subject: 'ผลพิจารณา คบ.14 บันทึกเพิ่มเติม ครั้งที่ 1 · อนุมัติ' })
  expect(last().status).toBe('approved')
  store().acknowledgeExtensionDecision(NO, last().id, 'x')
  expect(last().ownerAcknowledgedAt).toBeUndefined()
  passSarabanCheckpoint(NO); passSarabanCheckpoint(NO)
  expect(get().sarabanDispatch).toBeUndefined()
  store().acknowledgeExtensionDecision(NO, last().id, 'x')
  expect(last().ownerAcknowledgedAt).toBeTruthy()
})

it('ส่งคืนในหน่วยไม่ผ่านธุรการ แต่รองเลขาธิการส่งคืนลงหน่วยต้องผ่านธุรการ และเจ้าหน้าที่แก้ไม่ได้ระหว่างนำส่ง', () => {
  draft()
  review('supervisor', false)
  expect(get().sarabanDispatch).toBeUndefined()
  draft()
  for (const r of ['supervisor', 'director']) review(r)
  passSarabanCheckpoint(NO); passSarabanCheckpoint(NO)
  review('deputy_secretary', false)
  expect(get().sarabanDispatch).toMatchObject({ direction: 'down', subject: 'ส่งคืนแก้ไข คบ.14 บันทึกเพิ่มเติม ครั้งที่ 1 (แก้ไขครั้งที่ 1)' })
  as('officer')
  expect(canSubmitKb14(get(), 'officer')).toBe(false)
  const before = last().version
  draft()
  expect(last().version).toBe(before)
  expect(extensionKb6PendingSigner(get(), 'supervisor')).toBeNull()
  passSarabanCheckpoint(NO); passSarabanCheckpoint(NO)
  expect(canSubmitKb14(get(), 'officer')).toBe(true)
})
