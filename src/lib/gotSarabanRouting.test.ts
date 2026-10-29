import { expect, it } from 'vitest'
import { canRecordSaraban, dispatchUnitFor, isSarabanQueueCase, sarabanClerkRole, SARABAN_STAGES } from './saraban'
import { canViewHandoffCase } from './protectionHandoff'
import type { CaseItem } from '../types/case'

it('routes native GOT outgoing work to GOT clerks, including existing dispatches', () => {
  const c = { orgUnitId: 'central-gmc', stage: SARABAN_STAGES.director_outgoing } as CaseItem
  expect(dispatchUnitFor(c)).toEqual({ role: 'got_receiver', unitId: 'central-gmc' })
  expect(canViewHandoffCase('got_receiver', c, 'GOT-CLERK')).toBe(true)
  expect(sarabanClerkRole(c, 'director_outgoing')).toBe('got_receiver')
  expect(isSarabanQueueCase('got_receiver', c, 'central-gmc')).toBe(true)
  const pending = { ...c, sarabanDispatch: { checkpoint: 'director_outgoing', unitId: 'central-gmc', unitClerkRole: 'receiver' } } as CaseItem
  expect(canRecordSaraban('got_receiver', pending, 'director_outgoing', 'central-gmc')).toBe(true)
  expect(isSarabanQueueCase('receiver', pending, 'central-gmc')).toBe(false)
  expect(sarabanClerkRole(pending, 'secretary_incoming')).toBe('secretary_receiver')
})
