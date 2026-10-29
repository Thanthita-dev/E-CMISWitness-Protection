import React from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Kb15ReviewerSignature } from './Kb15ReviewerSignature'
import { FormPaperViewer } from '../forms/FormPaperViewer'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import type { CaseItem, Kb15ApprovalStage } from '../../types/case'

afterEach(cleanup)
it.each(['supervisor', 'director', 'deputy_secretary', 'secretary'] as Kb15ApprovalStage[])('opens only the current %s signature on paper', (stage) => {
  useAuthStore.getState().setRole(stage)
  useFormDraftStore.setState({ signatures: {}, caseDrafts: {}, draftCaseNo: {} })
  const c = { no: 'TEST/2569', orgUnitId: 'pacc-reg-1', assignedOfficerUserId: 'OFF-REG1', kb15: { status: 'submitted', approvalStage: stage, formSnapshot: { 'ข้อเท็จจริง': 'ฉบับที่ส่งแล้ว' } } } as unknown as CaseItem
  useCaseStore.setState({ cases: [c] })
  render(<>
    <Kb15ReviewerSignature caseItem={c} />
    <FormPaperViewer formId={15} caseNo={c.no} page={2} signable />
  </>)
  expect(screen.getByTestId(`paper-sign-kb15-${stage}`)).toBeEnabled()
  expect(screen.getAllByRole('button', { name: /^ลงนาม$/ })).toHaveLength(1)
})
