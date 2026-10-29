import type { CoordinationAgencyType } from '../types/case'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { canEditFormsInDossier } from './permissions'
import { canProposeAgencyReferral } from './episode'
import { ensureReferralDocument } from './referralDocuments'

/** Prepare documents only; submission remains an explicit action in the dossier. */
export function startReferralInDossier(caseNo: string, agency: CoordinationAgencyType): boolean {
  const c = useCaseStore.getState().getCase(caseNo)
  const auth = useAuthStore.getState()
  if (!c || !canEditFormsInDossier(auth.currentRole, c, auth.currentOfficerUserId)) return false
  if (c.article14) return true
  if (!canProposeAgencyReferral(c)) return false
  useCaseStore.getState().openArticle14(caseNo, {
    targetAgencyType: agency, threatSummary: '', riskAssessment: '',
  })
  if (!useCaseStore.getState().getCase(caseNo)?.article14) return false
  if (agency === 'rlpd') {
    ensureReferralDocument(caseNo, 'chairman-signature')
    ensureReferralDocument(caseNo, 'rights-assistance-letter')
  }
  return true
}
