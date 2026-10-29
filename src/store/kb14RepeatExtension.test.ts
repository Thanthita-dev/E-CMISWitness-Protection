import { it, expect } from 'vitest'
import { useCaseStore } from './useCaseStore'
import { useAuthStore } from './useAuthStore'
import { passSarabanCheckpoint } from '../lib/sarabanTestHelpers'

const NO = 'WP-TEST-KB14-REPEAT'
const iso = (d: Date) => d.toISOString()
const addDaysIso = (base: string, n: number) => { const d = new Date(base); d.setDate(d.getDate() + n); return iso(d).slice(0, 10) }
const get = () => useCaseStore.getState().getCase(NO)!
const as = (role: string) => useAuthStore.setState({ currentRole: role as never })
/** ผ่านจุดธุรการให้ครบทุกขา (ขาออกหน่วย → ขาเข้า สลธ. หรือกลับกัน) */
const settle = () => { while (get().sarabanDispatch) if (!passSarabanCheckpoint(NO)) break }
function approveRound(months: number) {
  const c = get()
  const from = addDaysIso(c.protectionEndAt!, 1), to = addDaysIso(from, months * 30)
  as('officer')
  useCaseStore.getState().draftKb14(NO, { reason: 'ยังมีภัย', durationDays: months * 30, durationMonths: months, periodFrom: from, periodTo: to, formSnapshot: { 'เหตุผลขยายเวลา': 'ยังมีภัย' } } as never, 'นางสาวอรุณี ใจมั่น')
  const req = get().extensionRequests!.at(-1)!
  for (const role of ['supervisor', 'director', 'deputy_secretary']) { as(role); useCaseStore.getState().reviewKb14(NO, req.id, true, 'เห็นชอบ'); settle() }
  as('secretary'); useCaseStore.getState().decideExtension(NO, req.id, true, 'อนุมัติ'); settle()
  return get().extensionRequests!.at(-1)!
}

it('ขอขยายได้หลายครั้งจนครบเพดาน 6 เดือน', () => {
  const start = new Date(); start.setDate(start.getDate() - 80)
  const end = new Date(start); end.setMonth(end.getMonth() + 3)
  useCaseStore.setState({ cases: [{ no: NO, form: 'คบ.1', person: 'ทดสอบ', status: 'กำลังคุ้มครอง', stage: 'protection', owner: 'x', next: '-', risk: 'สูง', assignedOfficer: 'นางสาวอรุณี ใจมั่น', actualStartedAt: iso(start), protectionEndAt: iso(end), protectionMonths: 3, episode: { id: 'EP', openedAt: iso(start), phases: [{ id: 'PH', kind: 'MAIN', startedAt: iso(start) }] } } as never], activeCaseNo: NO })
  const first = approveRound(2)
  expect(first.status).toBe('approved')
  const second = approveRound(1)
  expect(get().extensionRequests).toHaveLength(2)
  expect(second.status).toBe('approved')
  expect(second.id).not.toBe(first.id)
  expect(get().protectionMonths).toBe(6)
  // ครบเพดานแล้ว ขอเพิ่มไม่ได้
  const before = get().extensionRequests!.length
  approveRound(1)
  expect(get().extensionRequests!.length).toBe(before)
  // รับทราบผลแล้วไม่ขึ้นซ้ำ
  useCaseStore.getState().acknowledgeExtensionDecision(NO, second.id, 'นางสาวอรุณี ใจมั่น')
  expect(get().extensionRequests!.at(-1)!.ownerAcknowledgedAt).toBeTruthy()
})
