import type { CaseItem } from '../types/case'

export const REFERRAL_DOCUMENTS = [
  { id: 'chairman-signature', title: 'บันทึกเสนอประธานกรรมการ ป.ป.ท. ลงนาม ผ่านเลขาธิการ' },
  { id: 'rights-assistance-letter', title: 'หนังสือแจ้งให้มีมาตรการช่วยเหลือแก่พยาน ถึงอธิบดีกรมคุ้มครองสิทธิและเสรีภาพ' },
] as const
export type ReferralDocumentId = typeof REFERRAL_DOCUMENTS[number]['id']
export const isReferralDocumentId = (id?: string): id is ReferralDocumentId => REFERRAL_DOCUMENTS.some(d => d.id === id)
export const isRightsReferral = (c: CaseItem) => !c.article14?.targetAgencyType || c.article14.targetAgencyType === 'rlpd'

/** 18 remains the original multi-destination letter. A separate RLPD draft must not replace another destination. */
export const referralFormNo = (c: CaseItem, id: ReferralDocumentId) => id === 'chairman-signature' ? 19
  : c.extraForms?.includes(20) || !isRightsReferral(c) || (!c.article14 && !c.extraForms?.includes(18)) ? 20 : 18
export const article14LetterFormNo = (c: CaseItem) => isRightsReferral(c) ? referralFormNo(c, 'rights-assistance-letter') : 18
export const hasReferralDocument = (c: CaseItem, id: ReferralDocumentId) =>
  Boolean(c.extraForms?.includes(referralFormNo(c, id)) || (id === 'rights-assistance-letter' && isRightsReferral(c) && c.article14))

/** Existing originals are completed once protection is in progress, including older demo cases without signature metadata. */
export const completedProtectionOriginals = (c: CaseItem): boolean => Boolean(c.extensionDocs ||
  c.stage === 'protection' ||
  (c.activity7State === 'approved' && (c.actualStartedAt || c.protectionHandoff?.step === 'active' || c.methodTracks?.some(t => t.status === 'active'))))

/** เรื่องส่งกรมคุ้มครองสิทธิฯ ต้องผ่านมติคณะกรรมการ รวมกรณีครบ 6 เดือน */
export const requiresReferralCommittee = (c: CaseItem): boolean => isRightsReferral(c) || Boolean(c.article14?.earlyReferral)
