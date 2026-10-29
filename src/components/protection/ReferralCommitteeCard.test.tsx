import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ReferralCommitteeCard } from './ReferralCommitteeCard'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import type { CaseItem } from '../../types/case'
import { MySwal } from '../../lib/swal'
vi.mock('../../lib/swal', () => ({ MySwal: { fire: vi.fn(), showValidationMessage: vi.fn() }, showToast: vi.fn() }))
const base = (): CaseItem => ({ no: 'BOARD-TEST', person: 'Test', stage: 'article14', orgUnitId: 'pacc-reg-1', assignedOfficerUserId: 'OFF-REG1', article14: { step: 'committee_pending', revisions: [], secretaryAt: 'today', committeeSentAt: 'today', secretarySignature: { name: 'Secretary', at: 'today' } } } as unknown as CaseItem)
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); useAuthStore.getState().setRole('committee'); useCaseStore.setState({ cases: [base()] }) })
afterEach(cleanup)
it('shows the resolution actions in the dossier and records the approved resolution', async () => {
  vi.mocked(MySwal.fire).mockResolvedValue({ isConfirmed: true, value: { no: '1/2569', note: 'Approved' } } as never)
  render(<ReferralCommitteeCard caseItem={base()} />)
  expect(screen.getByRole('button', { name: 'ไม่อนุมัติส่งต่อ' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'ส่งกลับแก้ไข' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'อนุมัติส่งต่อ' }))
  await waitFor(() => expect(useCaseStore.getState().getCase('BOARD-TEST')?.article14?.committeeApproved).toBe(true))
  expect(useCaseStore.getState().getCase('BOARD-TEST')?.sarabanDispatch?.direction).toBe('down')
})
it('does not show resolution actions to the secretary or before a signature exists', () => {
  useAuthStore.getState().setRole('secretary')
  const view = render(<ReferralCommitteeCard caseItem={base()} />)
  expect(screen.queryByRole('button', { name: 'อนุมัติส่งต่อ' })).not.toBeInTheDocument()
  useAuthStore.getState().setRole('committee')
  const c = base(); c.article14!.secretarySignature = undefined
  view.rerender(<ReferralCommitteeCard caseItem={c} />)
  expect(screen.queryByRole('button', { name: 'อนุมัติส่งต่อ' })).not.toBeInTheDocument()
})
it('returns the case through registry and requires a fresh signature', () => {
  useCaseStore.getState().returnArticle14Committee('BOARD-TEST', 'Correct the letter')
  const c = useCaseStore.getState().getCase('BOARD-TEST')!
  expect(c.article14?.step).toBe('proposal_draft')
  expect(c.article14?.secretarySignature).toBeUndefined()
  expect(c.article14?.revisions.at(-1)?.reason).toBe('Correct the letter')
  expect(c.sarabanDispatch?.direction).toBe('down')
})
