import { useAuthStore } from '../store/useAuthStore'
import { canOperateHandoff, protectionResponsibleName } from './protectionHandoff'
import type { CaseItem, Kb15Report } from '../types/case'
import { selectCaseDraft, useFormDraftStore } from '../store/useFormDraftStore'
import { terminationReportFromDraft, validateTerminationBasis } from './terminationRules'

export function terminationSignatures(c: CaseItem, form: number): Record<string, { signed: boolean; signerName: string; signedAt: string; signatureImage?: string }> {
  const s = useFormDraftStore.getState()
  return s.draftCaseNo[form] === c.no ? s.signatures : s.caseDrafts[c.no]?.signatures || {}
}

export function terminationHeadName(c: CaseItem): string {
  const s = useFormDraftStore.getState()
  // ตำแหน่งหัวหน้าชุดจากคำสั่ง/แบบที่ผ่านการอนุมัติเดิม ไม่ถือว่าเจ้าของสำนวนทุกคนเป็นหัวหน้าชุด
  for (const form of c.kb8SignedAt ? [8, 6] : c.fastTrack?.kb5SignedAt ? [5, 4] : [6]) {
    const fields = s.draftCaseNo[form] === c.no ? s.drafts[form] : s.caseDrafts[c.no]?.drafts[form]
    const name = fields?.['ชุดชื่อ1']
    if (typeof name === 'string' && name.trim()) return name.trim()
  }
  return ''
}

export function canSignTerminationPreparer(c: CaseItem): boolean {
  const auth = useAuthStore.getState()
  const name = auth.getCurrentUserAccount()?.name
  if (!['protection', 'officer', 'case_owner', 'got_officer', 'admin'].includes(auth.currentRole)) return false
  if (c.protectionHandoff && !canOperateHandoff(auth.currentRole, c, auth.currentOfficerUserId)) return false
  return Boolean(name && [terminationHeadName(c), protectionResponsibleName(c)].includes(name))
}

export function currentTerminationReport(c: CaseItem): Partial<Kb15Report> {
  const s = useFormDraftStore.getState()
  return {
    ...terminationReportFromDraft(c, selectCaseDraft(s, 15, c.no), selectCaseDraft(s, 7, c.no), Boolean(terminationSignatures(c, 7)['kb7-applicant']?.signed)),
    headSignature: terminationSignatures(c, 15)['kb15-officer'],
  }
}

export function terminationSubmissionErrors(c: CaseItem): string[] {
  const report = currentTerminationReport(c)
  // A signed report is ready for submission; do not revalidate draft fields.
  if (c.terminationTrigger && report.headSignature?.signed) return []
  const errors = validateTerminationBasis(c, report)
  if (!c.terminationTrigger) errors.unshift('กรุณาบันทึกที่มาของเรื่องยุติในแฟ้มเดิม')
  if (!report.triggerRef) errors.push('กรุณาระบุเลขอ้างอิงเหตุยุติ')
  if (!report.headSignature?.signed || ![terminationHeadName(c), protectionResponsibleName(c)].includes(report.headSignature.signerName)) errors.push('รอหัวหน้าชุดปฏิบัติการตามคำสั่งเดิมลงนาม คบ.15')
  return errors
}
