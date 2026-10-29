import { startReferralInDossier } from './startReferralInDossier'
import { beforeEach, expect, it } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { selectCaseDraft, useFormDraftStore } from '../store/useFormDraftStore'
import { ensureReferralDocument, referralValues, saveReferralDocument } from './referralDocuments'
import { article14LetterFormNo, referralFormNo, completedProtectionOriginals } from './referralDocumentIdentity'
import type { CaseItem } from '../types/case'
const base = (no: string): CaseItem => ({ no, person: no, form: 'คบ.1', stage: 'staff_review', status: 'จัดทำ', owner: 'เจ้าหน้าที่', next: '', risk: 'สูง', orgUnitId: 'central-wp', assignedOfficerUserId: 'OFF-001', assignedOfficer: 'นางสาวอรุณี ใจมั่น', documents: [], assignmentHistory: [] })
const current = (no = 'A') => useCaseStore.getState().getCase(no)!
const draft = (no = 'A') => selectCaseDraft(useFormDraftStore.getState(), referralFormNo(current(no), 'rights-assistance-letter'), no)
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear()
  useCaseStore.setState({ cases: [base('A'), base('B')], activeCaseNo: 'A' })
  useAuthStore.setState({ currentOfficerUserId: 'OFF-001', loginUsername: null }); useAuthStore.getState().setRole('officer')
  useFormDraftStore.setState({ drafts: {}, draftCaseNo: {}, caseDrafts: {}, locks: {}, signatures: {}, revisions: {}, draftTouched: {} })
})
it('preview is read-only and attachment is idempotent without starting approval', () => {
  const before = JSON.stringify(useCaseStore.getState().cases)
  referralValues(current(), 'rights-assistance-letter')
  expect(JSON.stringify(useCaseStore.getState().cases)).toBe(before)
  expect(useFormDraftStore.getState().drafts).toEqual({})
  const n = ensureReferralDocument('A', 'rights-assistance-letter')
  const identity = draft()._referralMeta.id
  expect(ensureReferralDocument('A', 'rights-assistance-letter')).toBe(n)
  expect(draft()._referralMeta.id).toBe(identity)
  expect(current().extraForms).toEqual([n]); expect(current().article14).toBeUndefined(); expect(current().stage).toBe('staff_review')
})
it('keeps per-case data, stable identity and saved revision history', () => {
  ensureReferralDocument('A', 'rights-assistance-letter')
  const values = referralValues(current(), 'rights-assistance-letter', draft())
  values.values.docNo = 'TEST-A'
  saveReferralDocument('A', 'rights-assistance-letter', values)
  ensureReferralDocument('B', 'rights-assistance-letter')
  expect(draft('B')._referralValues.values.docNo).not.toBe('TEST-A')
  ensureReferralDocument('A', 'rights-assistance-letter')
  expect(draft()._referralValues.values.docNo).toBe('TEST-A')
  expect(draft()._referralMeta.history).toHaveLength(1)
  saveReferralDocument('A', 'rights-assistance-letter', values)
  expect(draft()._referralMeta.history).toHaveLength(1)
})
it('workflow opens the same prepared draft', () => {
  ensureReferralDocument('A', 'rights-assistance-letter')
  const id = draft()._referralMeta.id
  useCaseStore.getState().openArticle14('A', { threatSummary: 'ทดสอบ', riskAssessment: 'สูง', targetAgencyType: 'rlpd' })
  expect(article14LetterFormNo(current())).toBe(20)
  expect(draft()._referralMeta.id).toBe(id)
  expect(current().article14?.step).toBe('proposal_draft')
})
it('preserves a prepared department document when workflow targets another agency', () => {
  ensureReferralDocument('A', 'rights-assistance-letter')
  const id = draft()._referralMeta.id
  useCaseStore.getState().openArticle14('A', { threatSummary: 'ทดสอบ', riskAssessment: 'สูง', targetAgencyType: 'police' })
  expect(article14LetterFormNo(current())).toBe(18)
  expect(draft()._referralMeta.id).toBe(id)
  expect(selectCaseDraft(useFormDraftStore.getState(), 18, 'A')._referralMeta).toBeUndefined()
  saveReferralDocument('A', 'rights-assistance-letter', referralValues(current(), 'rights-assistance-letter', draft()))
  expect(current().article14?.letterSavedVersion).toBeUndefined()
})
it('keeps existing legacy letter 18 and blocks a reviewer from saving', () => {
  useCaseStore.getState().updateCase('A', { extraForms: [18] })
  useFormDraftStore.setState({ drafts: { 18: { เลขที่หนังสือ: 'OLD' } }, draftCaseNo: { 18: 'A' } })
  expect(ensureReferralDocument('A', 'rights-assistance-letter')).toBe(18)
  expect(draft()._referralValues.values.docNo).toBe('OLD')
  useAuthStore.getState().setRole('supervisor')
  expect(ensureReferralDocument('A', 'chairman-signature')).toBeNull()
  expect(() => saveReferralDocument('A', 'rights-assistance-letter', { values: {}, paragraphs: {} })).toThrow()
})

it('marks prior protection documents complete only for a referral after approved protection began', () => {
  const c = { ...base('A'), activity7State: 'approved', actualStartedAt: '2026-05-01', article14: { step: 'proposal_draft', earlyReferral: false } } as CaseItem
  expect(completedProtectionOriginals(c)).toBe(true)
  expect(completedProtectionOriginals({ ...c, article14: { ...c.article14!, earlyReferral: true } })).toBe(true)
  expect(completedProtectionOriginals({ ...c, activity7State: undefined })).toBe(false)
  expect(completedProtectionOriginals({ ...c, actualStartedAt: undefined })).toBe(false)
  expect(completedProtectionOriginals(base('B'))).toBe(false)
})

it('starts a referral in the dossier with both documents and no automatic submission', () => {
  useCaseStore.getState().updateCase('A', { stage: 'protection', actualStartedAt: '2026-10-08' })
  expect(startReferralInDossier('A', 'rlpd')).toBe(true)
  expect(current().article14?.step).toBe('proposal_draft')
  expect(current().extraForms).toContain(19)
  expect(current().extraForms).toContain(article14LetterFormNo(current()))
  expect(current().article14?.secretarySignature).toBeUndefined()
  const before = JSON.stringify(current().article14)
  expect(startReferralInDossier('A', 'rlpd')).toBe(true)
  expect(JSON.stringify(current().article14)).toBe(before)
})
it('prepares the selected non-RLPD letter in the same dossier', () => {
  useCaseStore.getState().updateCase('A', { stage: 'protection', actualStartedAt: '2026-10-08' })
  expect(startReferralInDossier('A', 'police')).toBe(true)
  expect(current().article14?.targetAgencyType).toBe('police')
  expect(current().extraForms).toContain(18)
  expect(current().extraForms).not.toContain(19)
})
