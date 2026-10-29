import { canEditKb6Opinion, KB6_SIGNERS, canSignFormNow } from './formSignature'
import { expect, it } from 'vitest'
import { canCreateIntake, isCaseOwnedBy } from './permissions'
import { INTAKE_DOC_TYPES_BY_ROLE } from './constants'
import { canViewHandoffCase, handoffBlocksOperations, isHandoffQueueCase } from './protectionHandoff'
import type { CaseItem } from '../types/case'

it('allows the GOT officer to receive the same document types as an officer', () => {
  expect(canCreateIntake('got_officer')).toBe(true)
  expect(INTAKE_DOC_TYPES_BY_ROLE.got_officer).toEqual(INTAKE_DOC_TYPES_BY_ROLE.officer)
})
it('allows access to a personally received case without exposing another officers intake', () => {
  const c = { stage: 'officer_intake', receivedByUserId: 'GOT-1' } as CaseItem
  expect(canViewHandoffCase('got_officer', c, 'GOT-1')).toBe(true)
  expect(isCaseOwnedBy('got_officer', c, 'GOT-1')).toBe(true)
  expect(handoffBlocksOperations('got_officer', c, 'GOT-1')).toBe(false)
  expect(canViewHandoffCase('got_officer', c, 'GOT-2')).toBe(false)
  expect(handoffBlocksOperations('got_officer', c, 'GOT-2')).toBe(true)
})

it('shows native GOT intake to its director for assignment and preserves officer ownership', () => {
  const c = { stage: 'director_assign', orgUnitId: 'central-gmc', receivedByUserId: 'GOT-1' } as CaseItem
  expect(canViewHandoffCase('got_director', c, '')).toBe(true)
  expect(handoffBlocksOperations('got_director', c, '')).toBe(false)
  expect(isHandoffQueueCase('got_director', c, '')).toBe(true)
  const assigned = { ...c, assignedOfficerUserId: 'GOT-2', stage: 'staff_review' } as CaseItem
  expect(canViewHandoffCase('got_officer', assigned, 'GOT-2')).toBe(true)
  expect(handoffBlocksOperations('got_officer', assigned, 'GOT-2')).toBe(false)
  expect(canViewHandoffCase('got_officer', assigned, 'GOT-1')).toBe(false)
  expect(isHandoffQueueCase('got_officer', assigned, 'GOT-2')).toBe(true)
  expect(canViewHandoffCase('got_director', { ...c, orgUnitId: 'regional-1' }, '')).toBe(false)
})

it('requires each native GOT reviewer to sign KB6 in their own turn', () => {
  const c = { no: 'GOT-SIGN', stage: 'supervisor_review', orgUnitId: 'central-gmc' } as CaseItem
  const supervisor = KB6_SIGNERS.find(s => s.userRole === 'supervisor')!
  const director = KB6_SIGNERS.find(s => s.userRole === 'director')!
  expect(canEditKb6Opinion(supervisor, 'got_supervisor', c)).toBe(true)
  expect(canSignFormNow({ formNo: 6, currentRole: 'got_supervisor', caseItem: c, canEditDossier: false })).toBe(true)
  expect(canEditKb6Opinion(director, 'got_director', c)).toBe(false)
  expect(canEditKb6Opinion(director, 'got_director', { ...c, stage: 'director_review' })).toBe(true)
  expect(canEditKb6Opinion(supervisor, 'got_supervisor', { ...c, kb6SupervisorSignedAt: '2026-10-29' })).toBe(false)
})
