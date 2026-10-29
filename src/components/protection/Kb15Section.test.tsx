import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Kb15Section } from './Kb15Section'
import { useCaseStore } from '../../store/useCaseStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { TERMINATION_CLAUSES } from '../../lib/constants'
import type { CaseItem } from '../../types/case'
const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate, Link: () => null }))
afterEach(cleanup)
it('selecting expiry replaces the previous clause and opens KB15 directly', async () => {
  const c = { no: 'EXPIRY-TEST', person: 'พยานทดสอบ', form: 'คบ.1', stage: 'protection' } as CaseItem
  useCaseStore.setState({ cases: [c] })
  useFormDraftStore.setState({ drafts: { 15: { ข้อระเบียบ: TERMINATION_CLAUSES[0].label, เหตุยุติ: 'เหตุเดิม' } }, draftCaseNo: { 15: c.no }, locks: {}, caseDrafts: {}, signatures: {} })
  render(<Kb15Section caseItem={c} role="got_officer" />)
  fireEvent.click(screen.getByRole('radio', { name: TERMINATION_CLAUSES[1].label }))
  await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/form/$formId', params: { formId: '15' }, search: { caseNo: c.no, from: 'termination' } }))
  expect(useFormDraftStore.getState().drafts[15]['ข้อระเบียบ']).toBe(TERMINATION_CLAUSES[1].label)
})
