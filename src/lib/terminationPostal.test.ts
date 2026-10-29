import { expect, it } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import type { CaseItem } from '../types/case'
import { passSarabanCheckpoint, recordSarabanCheckpoint } from './sarabanTestHelpers'

it('lets the destination clerk send signed KB17 and confirm receipt without routing to the owner', () => {
  const no = 'POST17'
  useCaseStore.setState({ cases: [{ no, person: 'Witness', stage: 'terminated', owner: 'Officer', status: '', next: '', assignmentHistory: [],
    kb17: { signedAt: '2026-10-12', documentName: 'KB17' },
    protectionHandoff: { destination: 'got', step: 'active', events: [] },
  } as unknown as CaseItem] })
  const store = useCaseStore.getState
  expect(store().openSarabanDispatch(no, { flow: 'termination', direction: 'down', forms: [17], subject: 'KB17' })).toBe(true)
  expect(passSarabanCheckpoint(no)).toBe(true)
  useAuthStore.getState().setRole('got_receiver')
  const input = { trackingNo: 'EMS17', sentAt: '2026-10-28', recipient: 'Witness', address: 'Address' }
  expect(store().sendAppealByPost(no, input)).toBe(false)
  expect(recordSarabanCheckpoint(no)).toBe(true)
  expect(store().sendAppealByPost(no, input)).toBe(true)
  expect(store().getCase(no)?.kb17?.deliveredAt).toBeUndefined()
  expect(store().sendAppealByPost(no, input)).toBe(false)
  expect(store().completeAppealPost(no, '2026-10-27', 'receipt')).toBe(false)
  expect(store().completeAppealPost(no, '2026-10-28', 'receipt')).toBe(true)
  expect(store().getCase(no)?.kb17?.deliveredAt).toBe('2026-10-28')
  expect(store().getCase(no)?.appealAgainst).toBe('kb17')
  expect(store().getCase(no)?.sarabanDispatch?.postal?.deliveredAt).toBe('2026-10-28')
})
