import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useCaseStore } from '../../store/useCaseStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { useAuthStore } from '../../store/useAuthStore'
import { ApprovalCoordinationPanel } from '../protection/ApprovalCoordinationPanel'
import { NoticeDecisionWorkspace } from './NoticeDecisionWorkspace'
import type { CaseItem } from '../../types/case'
vi.mock('@tanstack/react-router', () => ({ useBlocker: vi.fn() }))
afterEach(cleanup)
const NO = 'DISPLAY-4'
beforeEach(() => {
  useCaseStore.setState({ cases: [{ no: NO, form: 'คบ.1', person: 'พยาน', stage: 'external_pending', status: '', owner: '', next: '', risk: 'สูง', kb6SecretarySignedAt: '2026-10-28', assignedOfficerUserId: 'OFF-001' } as CaseItem] })
  useAuthStore.getState().setRole('secretary')
  useFormDraftStore.setState({ drafts: { 6: { รูปแบบคุ้มครองที่เลือก: [4], หน่วยงานรูปแบบข้อ4: 'ส่งให้กรมการปกครอง' } }, draftCaseNo: { 6: NO }, caseDrafts: {}, signatures: {}, locks: {}, revisions: {} })
})
it('shows an agency letter row beside dossier forms before KB9 approval, and opens its preview', () => {
  render(<ApprovalCoordinationPanel caseItem={useCaseStore.getState().getCase(NO)!} compact />)
  expect(screen.getByTestId('approval-letter-row-agency')).toHaveTextContent('กรมการปกครอง')
  fireEvent.click(screen.getByRole('button', { name: 'ดูเอกสาร' }))
  expect(screen.getByTestId('coordination-letter-preview')).toHaveTextContent('อธิบดีกรมการปกครอง')
})
it('shows KB9 plus agency letter and one bundle signature action in the approval workspace', () => {
  useCaseStore.getState().beginPreliminaryDecision(NO, 'approved')
  render(<NoticeDecisionWorkspace caseItem={useCaseStore.getState().getCase(NO)!} onBack={() => {}} onConfirmed={() => {}} />)
  expect(screen.getByTestId('approval-bundle-summary')).toHaveTextContent('กรมการปกครอง')
  expect(screen.getByTestId('approval-agency-letter')).toBeInTheDocument()
  expect(screen.getByTestId('notice-decision-confirm')).toHaveTextContent('ตรวจและลงนามเอกสารทั้งชุด')
})
it('shows both police letter rows without requiring an existing police bundle', () => {
  useFormDraftStore.setState({ drafts: { 6: { รูปแบบคุ้มครองที่เลือก: [4], หน่วยงานรูปแบบข้อ4: 'ส่งให้ตำรวจ' } } })
  render(<ApprovalCoordinationPanel caseItem={useCaseStore.getState().getCase(NO)!} compact />)
  expect(screen.getByTestId('approval-letter-row-station')).toBeInTheDocument()
  expect(screen.getByTestId('approval-letter-row-national')).toBeInTheDocument()
  expect(useCaseStore.getState().getCase(NO)!.policeLetters).toBeDefined()
})

it('routes both pending police letters to the same bundle signing workspace', () => {
  useFormDraftStore.setState({ drafts: { 6: { รูปแบบคุ้มครองที่เลือก: [4], หน่วยงานรูปแบบข้อ4: 'ส่งให้ตำรวจ' } } })
  useCaseStore.getState().beginPreliminaryDecision(NO, 'approved')
  const open = vi.fn()
  render(<ApprovalCoordinationPanel caseItem={useCaseStore.getState().getCase(NO)!} compact onOpenSigning={open} />)
  const buttons = screen.getAllByRole('button', { name: 'เปิดแบบฟอร์มเพื่อลงนาม' })
  expect(buttons).toHaveLength(2)
  buttons.forEach(button => fireEvent.click(button))
  expect(open).toHaveBeenCalledTimes(2)
})

// Completed originals must open for viewing, even when a signing route is available.
it('opens completed police originals for viewing instead of routing back to signing', () => {
  useCaseStore.getState().updateCase(NO, { stage: 'protection', activity7State: 'approved' })
  useFormDraftStore.setState({ drafts: { 6: { รูปแบบคุ้มครองที่เลือก: [4], หน่วยงานรูปแบบข้อ4: 'ส่งให้ตำรวจ' } } })
  const openSigning = vi.fn()
  render(<ApprovalCoordinationPanel caseItem={useCaseStore.getState().getCase(NO)!} compact onOpenSigning={openSigning} />)
  const buttons = screen.getAllByRole('button', { name: 'ดูเอกสาร' })
  expect(buttons).toHaveLength(2)
  fireEvent.click(buttons[0])
  expect(openSigning).not.toHaveBeenCalled()
  expect(buttons[0]).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByTestId('police-letter-bundle')).toBeInTheDocument()
})
