import { it, expect } from 'vitest'
import { useCaseStore } from './useCaseStore'
import { currentMethod4Letters, method4ReplyRecorded } from '../lib/methodProgress'

const NO = 'WP-TEST-TEMP-MAIN'
const get = () => useCaseStore.getState().getCase(NO)!

function seedTemporaryWork() {
  useCaseStore.setState({ cases: [{ no: NO, form: 'คบ.1', person: 'ทดสอบ', status: '-', stage: 'staff_review', owner: 'x', next: '-', risk: 'สูง', assignedOfficer: 'x',
    urgent: true, kb5Approved: true, fastTrack: { step: 'approved', proposedMethods: [4] }, consents: [{ ref: 'kb5', consented: true, by: 'ทดสอบ' }],
    officialLetters: [
      { id: 'L-OUT', direction: 'outgoing', context: 'method4', subject: 'หนังสือประสาน', sentAt: '2026-10-01' },
      { id: 'L-IN', direction: 'incoming', context: 'method4', subject: 'หนังสือตอบรับดำเนินการคุ้มครองพยาน', receivedAt: '2026-10-02', documentName: 'ตอบรับ.pdf' },
    ] } as never], activeCaseNo: NO })
  const s = useCaseStore.getState()
  s.chooseOperationMethods(NO, { mode: 'kb4', methods: [4], agencyType: 'police' as never })
  s.updateMethodTrack(NO, 4, { status: 'active', startedAt: '2026-10-02T00:00:00Z', coordination: { agencyType: 'police', agency: 'สภ.ทดสอบ', responseStatus: 'accepted' } })
}

it('คำร้องหลักอนุมัติด้วยวิธีอื่น — งานชั่วคราวแยกเก็บ ไม่ถูกแทนที่', () => {
  seedTemporaryWork()
  expect(get().stage).toBe('staff_review')
  useCaseStore.getState().updateCase(NO, { activity7State: 'approved', orderedMethods: [3], kb9Signed: true, kb11Signed: true })
  useCaseStore.getState().setApprovedMethods(NO, [3], 'x')

  const c = get()
  expect(c.temporaryProtection?.methodTracks).toEqual([expect.objectContaining({ method: 4, status: 'active' })])
  expect(c.temporaryProtection?.methodChoice?.mode).toBe('kb4')
  expect(c.temporaryProtection?.closedAt).toBeUndefined()
  expect(c.methodTracks).toEqual([{ method: 3, status: 'pending' }])
  expect(c.methodChoice).toBeUndefined()
})

it('คำร้องหลักวิธีเดียวกัน — เปิดงานใหม่ ไม่ใช้งานและหนังสือของชั่วคราวต่อ', () => {
  seedTemporaryWork()
  useCaseStore.getState().updateCase(NO, { activity7State: 'approved', orderedMethods: [4], kb9Signed: true, kb11Signed: true })
  useCaseStore.getState().setApprovedMethods(NO, [4], 'x')

  const c = get()
  expect(c.methodTracks).toEqual([{ method: 4, status: 'pending' }])
  expect(c.temporaryProtection?.letterIds).toEqual(['L-OUT', 'L-IN'])
  expect(currentMethod4Letters(c)).toEqual([])
  expect(method4ReplyRecorded(c)).toBe(false)
})

it('วิธีแรกของคำร้องหลักเริ่มจริง — ปิดงานชั่วคราวเป็นประวัติ', () => {
  seedTemporaryWork()
  useCaseStore.getState().updateCase(NO, { activity7State: 'approved', orderedMethods: [3], kb9Signed: true, kb11Signed: true })
  useCaseStore.getState().setApprovedMethods(NO, [3], 'x')
  useCaseStore.getState().setMethodStatus(NO, 3, 'active')

  const c = get()
  expect(c.methodTracks?.[0].status).toBe('active')
  expect(c.temporaryProtection?.closedAt).toBeTruthy()
  expect(c.temporaryProtection?.methodTracks[0].status).toBe('ended')
  expect(c.stage).toBe('protection')
})
