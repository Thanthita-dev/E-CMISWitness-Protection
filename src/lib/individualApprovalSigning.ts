import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { selectCaseDraft, useFormDraftStore } from '../store/useFormDraftStore'
import { approvalCoordinationAgency, approvalMethods } from './approvalCoordination'
import { policeAllSigned } from './policeLetters'
import { signNoticeSnapshot } from './noticeDocuments'

/** Each original is retained immediately; the approval handoff opens only once all required originals exist. */
export function finishIndividualApproval(no: string): boolean {
  const store = useCaseStore.getState(), c = store.cases.find(c => c.no === no)
  if (!c?.approvalNoticeSignature) return false
  if (c.resultNotices?.[9]?.original) return true
  const kb6 = selectCaseDraft(useFormDraftStore.getState(), 6, no)
  const agency = approvalCoordinationAgency(c, kb6)
  if (approvalMethods(c, kb6).includes(4) && (!agency || (agency === 'police' ? !policeAllSigned(c.policeLetters) : !c.coordinationApproval?.signature))) return false
  if (!store.confirmPreliminaryDecision(no, 9, c.approvalNoticeSignature.signatureImage)) return false
  const updated = store.getCase(no)!, notice = updated.resultNotices![9]!
  store.updateCase(no, { kb9SignedAt: c.approvalNoticeSignature.signedAt, kb9SignedBy: c.approvalNoticeSignature.signedBy, resultNotices: { ...updated.resultNotices, 9: { ...notice, original: c.approvalNoticeSignature, versions: [c.approvalNoticeSignature] } } })
  return true
}
export function signIndividualNotice(no: string, image?: string): boolean {
  const store = useCaseStore.getState(), c = store.cases.find(c => c.no === no)
  const auth = useAuthStore.getState(), actor = auth.getCurrentUserAccount(), d = c?.preliminaryDecision
  if (!c || !actor || !['secretary', 'admin'].includes(auth.currentRole) || c.stage !== 'external_pending' || !d?.savedAt || d.formNo !== 9 || !d.decisionNo.trim() || !c.kb6SecretarySignedAt || !c.resultNotices?.[9]) return false
  if (!c.approvalNoticeSignature) {
    const original = signNoticeSnapshot(c.resultNotices[9], c, new Date().toISOString(), actor.name, d.decisionNo, d.reason).original!
    store.updateCase(no, { approvalNoticeSignature: { ...original, signatureImage: image } })
    store.logHistory(no, 'ลงนาม คบ.9 แยกรายฉบับในรอบอนุมัติ', actor.name, 'เก็บฉบับลงนามแล้ว รอหนังสือประกอบที่จำเป็นครบก่อนส่งงาน')
  }
  finishIndividualApproval(no)
  return true
}
