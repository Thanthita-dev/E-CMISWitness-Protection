import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MethodChoicePanel } from './MethodChoicePanel'
import { useCaseStore } from '../../store/useCaseStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { useAuthStore } from '../../store/useAuthStore'
import type { CaseItem } from '../../types/case'
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: any) => <a>{children}</a> }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const NO = 'AUTO-KB6'
beforeEach(() => {
  useAuthStore.getState().setRole('got_officer')
  useCaseStore.setState({ cases: [{ no: NO, form: 'คบ.1', person: 'พยาน', stage: 'method_operation', status: '', owner: '', next: '', risk: 'สูง', orderedMethods: [4], approvedMethods: [4] } as CaseItem] })
  useFormDraftStore.setState({ drafts: { 6: { หน่วยงานรูปแบบข้อ4: 'ส่งให้กรมการปกครอง' } }, draftCaseNo: { 6: NO }, caseDrafts: {}, signatures: {}, locks: {}, revisions: {} })
})
it('opens the KB6 method and destination once under StrictMode without a selection screen', () => {
  const choose = vi.spyOn(useCaseStore.getState(), 'chooseOperationMethods')
  render(<React.StrictMode><MethodChoicePanel caseItem={useCaseStore.getState().getCase(NO)!} orderBase="ผลอนุมัติคำร้องหลัก" /></React.StrictMode>)
  expect(choose).toHaveBeenCalledTimes(1)
  expect(useCaseStore.getState().getCase(NO)?.methodChoice).toMatchObject({ mode: 'kb6', methods: [4], agencyType: 'dopa' })
  expect(screen.queryByTestId('method-choice-panel')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'ยืนยันและเปิดงาน' })).not.toBeInTheDocument()
})
it('does not invent a method when the approved petition has none', () => {
  useCaseStore.getState().updateCase(NO, { orderedMethods: [], approvedMethods: [] })
  render(<MethodChoicePanel caseItem={useCaseStore.getState().getCase(NO)!} orderBase="ผลอนุมัติคำร้องหลัก" />)
  expect(screen.getByText('ไม่พบวิธีคุ้มครองใน คบ.6')).toBeInTheDocument()
  expect(useCaseStore.getState().getCase(NO)?.methodChoice).toBeUndefined()
})
