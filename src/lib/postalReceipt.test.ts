import { expect, it } from 'vitest'
import type { CaseItem } from '../types/case'
import { restorePostalReceipt } from './postalReceipt'
import { kb11Gate } from './formSignature'

it('recovers a clerk-confirmed receipt and unlocks คบ.11', () => {
  const c = { kb9Signed: true, activity7State: 'approved', protectionHandoff: { postal: {
    sentAt: '2026-10-28', deliveredAt: '2026-10-28', recipient: 'ผู้รับทดสอบ',
  } } } as CaseItem
  const repaired = restorePostalReceipt(c)
  expect(kb11Gate(repaired).unlocked).toBe(true)
  expect(restorePostalReceipt(repaired)).toBe(repaired)
})

it('does not mark an undelivered letter as received', () => {
  const c = { kb9Signed: true, protectionHandoff: { postal: { sentAt: '2026-10-28' } } } as CaseItem
  expect(restorePostalReceipt(c)).toBe(c)
  expect(kb11Gate(c).unlocked).toBe(false)
})

it('clerk confirmation saves the receipt used by คบ.11 before reporting success', async () => {
  const { useCaseStore } = await import('../store/useCaseStore')
  const { useAuthStore } = await import('../store/useAuthStore')
  const c = { no: 'POST-TEST', kb9Signed: true, activity7State: 'approved', stage: 'notice', dispatchedAt: '2026-10-28', protectionHandoff: {
    destination: 'got', step: 'pending_receipt', events: [], postal: {
      sentAt: '2026-10-28', recipient: 'ผู้รับทดสอบ', trackingNo: 'TEST', address: 'ทดสอบ', recordedBy: 'ธุรการ',
    },
  } } as unknown as CaseItem
  useCaseStore.setState({ cases: [c] })
  useAuthStore.getState().setRole('got_receiver')
  expect(useCaseStore.getState().completeAppealPost(c.no, '2026-10-28', 'ยืนยันการรับ')).toBe(true)
  const saved = useCaseStore.getState().getCase(c.no)!
  expect(saved.deliveredAt).toBe('2026-10-28')
  expect(saved.protectionHandoff?.postal?.deliveredAt).toBe(saved.deliveredAt)
  expect(kb11Gate(saved).unlocked).toBe(true)
})
