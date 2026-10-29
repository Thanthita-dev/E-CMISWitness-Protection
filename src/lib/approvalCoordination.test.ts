import { beforeEach, expect, it } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useFormDraftStore } from '../store/useFormDraftStore'
import { useAuthStore } from '../store/useAuthStore'
import type { CaseItem } from '../types/case'
import { approvalMethods, approvalCoordinationAgency } from './approvalCoordination'
import { prepareApprovalLetters, reviewApprovalLetter, saveApprovalLetter, signApprovalLetter } from './approvalCoordinationActions'
const NO = 'APPROVAL-TEST'
const current = () => useCaseStore.getState().getCase(NO)!
const initial = (): CaseItem => ({ no: NO, form: 'คบ.1', person: 'พยานทดสอบ', stage: 'external_pending', status: '', owner: '', next: '', risk: 'สูง', kb6SecretarySignedAt: '2026-10-28', assignedOfficerUserId: 'OFF-001', assignedOfficer: 'ทดสอบ', documents: [], assignmentHistory: [] })
const kb6 = (agency: string) => useFormDraftStore.setState({ drafts: { 6: { รูปแบบคุ้มครองที่เลือก: [4], หน่วยงานรูปแบบข้อ4: agency } }, draftCaseNo: { 6: NO }, caseDrafts: {}, signatures: {}, locks: {}, revisions: {} })
beforeEach(() => { useCaseStore.setState({ cases: [initial()] }); useAuthStore.getState().setRole('secretary'); kb6('ส่งให้กรมการปกครอง') })
it('uses legacy ordered methods but respects explicit changed or empty KB6 choices', () => {
  const c = { ...initial(), orderedMethods: [4], methodChoice: { agencyType: 'military' } } as CaseItem
  expect(approvalCoordinationAgency(c, {})).toBe('military')
  expect(approvalMethods(c, { รูปแบบคุ้มครองที่เลือก: [] })).toEqual([])
  expect(approvalCoordinationAgency(c, { รูปแบบคุ้มครองที่เลือก: [1] })).toBeUndefined()
  expect(approvalCoordinationAgency(c, { รูปแบบคุ้มครองที่เลือก: ['4'], หน่วยงานรูปแบบข้อ4: 'police' })).toBe('police')
})
it.each(['ส่งให้กรมการปกครอง', 'ส่งให้ทหาร', 'ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ'])('prepares and signs %s with KB9 once, without police content', agency => {
  kb6(agency)
  const store = useCaseStore.getState()
  expect(store.beginPreliminaryDecision(NO, 'approved')).toBe(true)
  const id = current().coordinationApproval!.id
  prepareApprovalLetters(NO)
  expect(current().coordinationApproval!.id).toBe(id)
  expect(current().policeLetters).toBeUndefined()
  expect(current().coordinationApproval!.draft.body).not.toContain('เจ้าหน้าที่ตำรวจ')
  const input = { decisionNo: '501', reason: 'ตามข้อเท็จจริง', destination: 'original_owner' as const, instruction: '', durationDays: 30, fields: {} }
  expect(store.savePreliminaryDecision(NO, 9, input)).toBe(true)
  expect(store.confirmPreliminaryDecision(NO, 9)).toBe(false)
  expect(signApprovalLetter(NO)).toBe(false)
  expect(reviewApprovalLetter(NO)).toBe(true)
  expect(signApprovalLetter(NO, 'data:image/png;base64,test')).toBe(true)
  const signature = structuredClone(current().coordinationApproval!.signature)
  expect(signApprovalLetter(NO)).toBe(true)
  expect(current().coordinationApproval!.signature).toEqual(signature)
  expect(saveApprovalLetter(NO, { ...current().coordinationApproval!.draft, body: 'เปลี่ยน' })).toBe(false)
  expect(store.confirmPreliminaryDecision(NO, 9, 'data:image/png;base64,test')).toBe(true)
  expect(current().kb9Signed).toBe(true)
  expect(current().coordinationApproval!.signature).toEqual(signature)
})
it('prepares two police originals even when approval begins on a legacy case', () => {
  kb6('ส่งให้ตำรวจ')
  useCaseStore.getState().beginPreliminaryDecision(NO, 'approved')
  expect(Object.keys(current().policeLetters!.letters)).toEqual(['station', 'national'])
  const ids = Object.values(current().policeLetters!.letters).map(l => l.id)
  prepareApprovalLetters(NO)
  expect(Object.values(current().policeLetters!.letters).map(l => l.id)).toEqual(ids)
})
it('invalidates review after an edit and never creates letters for method 1', () => {
  prepareApprovalLetters(NO)
  reviewApprovalLetter(NO)
  saveApprovalLetter(NO, { ...current().coordinationApproval!.draft, body: 'แก้ไขก่อนลงนาม' })
  expect(current().coordinationApproval!.reviewedKey).toBeUndefined()
  useCaseStore.setState({ cases: [initial()] })
  useFormDraftStore.setState({ drafts: { 6: { รูปแบบคุ้มครองที่เลือก: [1] } } })
  prepareApprovalLetters(NO)
  expect(current().coordinationApproval).toBeUndefined()
  expect(current().policeLetters).toBeUndefined()
})
