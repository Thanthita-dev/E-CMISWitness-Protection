import { useCaseStore } from '../store/useCaseStore'
import { useFormDraftStore, selectCaseDraft } from '../store/useFormDraftStore'
import { useAuthStore } from '../store/useAuthStore'
import { isCaseClosed } from './permissions'
import { approvalCoordinationAgency, coordinationApprovalKey, makeCoordinationApproval } from './approvalCoordination'
import { createPoliceBundle, policePersonalFields } from './policeLetters'
import { buildLetterHtml, letterRecipientFor } from '../components/protection/CoordinationLetterComposer'
import type { CoordinationLetterDraft } from '../types/case'

export function prepareApprovalLetters(no: string) {
  const store = useCaseStore.getState(), c = store.cases.find(c => c.no === no)
  if (!c || isCaseClosed(c)) return
  const forms = useFormDraftStore.getState(), kb6 = selectCaseDraft(forms, 6, no)
  const agency = approvalCoordinationAgency(c, kb6)
  if (agency === 'police' && !c.policeLetters) store.updateCase(no, { policeLetters: createPoliceBundle(c, policePersonalFields(forms, no), kb6, useAuthStore.getState().getCurrentUserAccount()?.name || '') })
  if (agency && agency !== 'police' && !c.coordinationApproval?.signature && c.coordinationApproval?.agencyType !== agency) store.updateCase(no, { coordinationApproval: makeCoordinationApproval(c, agency) })
}
export function saveApprovalLetter(no: string, draft: CoordinationLetterDraft) {
  const store = useCaseStore.getState(), c = store.cases.find(c => c.no === no)
  const a = c?.coordinationApproval
  if (!c || !a || a.signature || isCaseClosed(c)) return false
  const auth = useAuthStore.getState()
  const officer = ['officer', 'case_owner', 'got_officer'].includes(auth.currentRole) && c.assignedOfficerUserId === auth.currentOfficerUserId && ['staff_review', 'officer_intake'].includes(c.stage)
  if (auth.currentRole !== 'admin' && !officer && !(auth.currentRole === 'secretary' && c.stage === 'external_pending')) return false
  store.updateCase(no, { coordinationApproval: { ...a, draft: { ...draft, signerPosition: 'เลขาธิการคณะกรรมการ ป.ป.ท.', signatureImage: undefined }, reviewedKey: undefined } })
  return true
}
export function reviewApprovalLetter(no: string) {
  const store = useCaseStore.getState(), c = store.cases.find(c => c.no === no), a = c?.coordinationApproval
  if (!c || !a || !['secretary', 'admin'].includes(useAuthStore.getState().currentRole) || c.stage !== 'external_pending') return false
  store.updateCase(no, { coordinationApproval: { ...a, reviewedKey: coordinationApprovalKey(a) } })
  return true
}
export function signApprovalLetter(no: string, image?: string) {
  const store = useCaseStore.getState(), c = store.cases.find(c => c.no === no), a = c?.coordinationApproval
  const auth = useAuthStore.getState(), actor = auth.getCurrentUserAccount()
  if (!c || !a || !actor || c.stage !== 'external_pending' || !['secretary', 'admin'].includes(auth.currentRole)) return false
  if (approvalCoordinationAgency(c, selectCaseDraft(useFormDraftStore.getState(), 6, no)) !== a.agencyType) return false
  if (a.signature) return true
  if (a.reviewedKey !== coordinationApprovalKey(a) || !a.draft.subject.trim() || !a.draft.body.trim() || c.preliminaryDecision?.formNo !== 9 || !c.kb6SecretarySignedAt) return false
  const draft = { ...a.draft, signerName: actor.name, signerPosition: 'เลขาธิการคณะกรรมการ ป.ป.ท.', signatureImage: image }
  const signature = { at: new Date().toISOString(), by: actor.name, userId: actor.id, draft, html: buildLetterHtml({ draft, recipient: letterRecipientFor(a.agency, a.agencyType), unit: actor.unit || '', garudaSrc: '/assets/forms/official/emblem/garuda-letter.png' }) }
  store.updateCase(no, { coordinationApproval: { ...a, signature } })
  store.logHistory(no, 'ลงนามหนังสือประสานพร้อมชุด คบ.9', actor.name, `${a.draft.subject} · ${a.agency} · ${a.id}`)
  return true
}
