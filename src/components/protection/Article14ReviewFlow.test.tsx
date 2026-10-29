import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Article14ReviewFlow } from './Article14ReviewFlow'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { hasReferralDocument } from '../../lib/referralDocumentIdentity'
import type { CaseItem } from '../../types/case'

vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
vi.mock('../../lib/swal', () => ({ showConfirmAlert: vi.fn(async () => ({ isConfirmed: true })), confirmBody: vi.fn(() => ''), showToast: vi.fn() }))
afterEach(cleanup)
it('submits directly from the dossier and prepares both letters without a separate save', async () => {
  localStorage.clear()
  sessionStorage.clear()
  const item = { no: 'TEST-REFERRAL', person: 'Test', form: 'คบ.1', stage: 'article14', status: '', owner: '', next: '', risk: 'สูง', orgUnitId: 'central-wp', assignedOfficerUserId: 'OFF-001', assignmentHistory: [], article14: { step: 'proposal_draft', openedAt: '2026-10-28', openedBy: 'Test', threatSummary: 'Existing threat', riskAssessment: 'Existing risk', revisions: [] } } as CaseItem
  useAuthStore.setState({ currentOfficerUserId: 'OFF-001', loginUsername: null })
  useAuthStore.getState().setRole('officer')
  useCaseStore.setState({ cases: [item], activeCaseNo: item.no })
  useFormDraftStore.setState({ drafts: {}, draftCaseNo: {}, caseDrafts: {}, locks: {}, signatures: {}, revisions: {}, draftTouched: {} })
  const Page = () => {
    const c = useCaseStore(s => s.cases[0])
    return <Article14ReviewFlow caseItem={c} role="officer" canEdit variant="footer" />
  }
  render(<Page />)
  expect(screen.queryByTestId('article14-prepare-in-dossier')).not.toBeInTheDocument()
  expect(screen.queryByTestId('article14-letter-unsaved')).not.toBeInTheDocument()
  expect(screen.getByTestId('article14-submit-review')).toBeEnabled()
  fireEvent.click(screen.getByTestId('article14-submit-review'))
  await waitFor(() => expect(useCaseStore.getState().getCase(item.no)?.article14?.step).toBe('supervisor_review'))
  const prepared = useCaseStore.getState().getCase(item.no)!
  expect(prepared.article14).toMatchObject({ step: 'supervisor_review', threatSummary: 'Existing threat', riskAssessment: 'Existing risk' })
  expect(prepared.article14?.letterVersion).toBe(1)
  expect(hasReferralDocument(prepared, 'chairman-signature')).toBe(true)
  expect(hasReferralDocument(prepared, 'rights-assistance-letter')).toBe(true)
  expect(screen.queryByTestId('article14-prepare-in-dossier')).not.toBeInTheDocument()
  expect(screen.queryByTestId('article14-submit-review')).not.toBeInTheDocument()
})
