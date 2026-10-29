import { getAdditionalForm, type AdditionalFormValues } from './additionalForms'
import { canEditFormsInDossier, isCaseClosed } from './permissions'
import { buildSeedForCase } from './formPrefill'
import { useAuthStore } from '../store/useAuthStore'
import { useCaseStore } from '../store/useCaseStore'
import { selectCaseDraft, useFormDraftStore } from '../store/useFormDraftStore'
import type { CaseItem } from '../types/case'
import { hasReferralDocument, isRightsReferral, referralFormNo, type ReferralDocumentId } from './referralDocumentIdentity'

export interface ReferralSavedRevision {
  revision: number
  at: string
  by: string
  draft: AdditionalFormValues
}
export interface ReferralDocumentMeta {
  id: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
  revision: number
  history: ReferralSavedRevision[]
}

const MAP: Record<ReferralDocumentId, Record<string, string>> = {
  'chairman-signature': { '5:3': 'ชื่อพยาน', '5:4': 'อายุ', '5:5': 'เลขบัตรประชาชน', '5:6': 'ภูมิลำเนา', '5:7': 'หมู่ที่', '5:8': 'ตำบล', '5:9': 'อำเภอ', '5:10': 'จังหวัด', '5:0': 'ครั้งที่ประชุม', '5:1': 'ระเบียบวาระ', '5:2': 'วันที่ประชุม' },
  'rights-assistance-letter': { docNo: 'เลขที่หนังสือ', date: 'วันที่หนังสือ', '7:0': 'ชื่อพยาน', '7:1': 'อายุ', '7:2': 'เลขบัตรประชาชน', '7:3': 'ภูมิลำเนา', '7:4': 'หมู่ที่', '7:5': 'ตำบล', '7:6': 'อำเภอ', '7:7': 'จังหวัด', '8:0': 'ครั้งที่ประชุม', '8:1': 'วันที่ประชุม', '8:2': 'ระเบียบวาระ', 'signer:13': 'ผู้ลงนาม' },
}

export function referralValues(c: CaseItem | undefined, id: ReferralDocumentId, fields: Record<string, any> = {}): AdditionalFormValues {
  if (fields._referralValues) {
    const draft = structuredClone(fields._referralValues) as AdditionalFormValues
    if (id === 'chairman-signature' && c?.article14?.secretarySignature) {
      const signature = c.article14.secretarySignature
      draft.values['signer:17'] = signature.name
      if (signature.image) draft.values['_signature:signer:17'] = signature.image
    }
    return draft
  }
  if (!c) return { values: {}, paragraphs: {} }
  const template = getAdditionalForm(id)!
  // Keep the original wording, addresses, recipients and signature positions; blank sample dates and personal data.
  const values = Object.fromEntries(template.fields.filter(f => /^(\d+:|signer:\d+$|date$)/.test(f.id)).map(f => [f.id, '']))
  const state = useFormDraftStore.getState()
  const kb1 = state.draftCaseNo[1] === c.no ? state.drafts[1] || {} : state.caseDrafts[c.no]?.drafts[1] || {}
  const seed: Record<string, any> = { ...buildSeedForCase(18, c), 'อายุ': kb1['อายุ'] || '', 'เลขบัตรประชาชน': kb1['เลขบัตรประชาชน'] || '', ...fields }
  for (const [key, source] of Object.entries(MAP[id])) values[key] = String(seed[source] || '')
  if (id === 'chairman-signature' && c.article14?.secretarySignature) {
    values['signer:17'] = c.article14.secretarySignature.name
    if (c.article14.secretarySignature.image) values['_signature:signer:17'] = c.article14.secretarySignature.image
  }
  return { values, paragraphs: {} }
}

export function canEditReferralDocument(c: CaseItem, id: ReferralDocumentId): boolean {
  const auth = useAuthStore.getState()
  if (isCaseClosed(c) || c.sarabanDispatch || !canEditFormsInDossier(auth.currentRole, c, auth.currentOfficerUserId)) return false
  const forms = useFormDraftStore.getState()
  const n = referralFormNo(c, id)
  const lock = forms.draftCaseNo[n] === c.no ? forms.locks[n] : forms.caseDrafts[c.no]?.locks[n]
  return !lock && (!c.article14 || c.article14.step === 'proposal_draft')
}

export function ensureReferralDocument(caseNo: string, id: ReferralDocumentId): number | null {
  const c = useCaseStore.getState().getCase(caseNo)
  if (!c || !canEditReferralDocument(c, id)) return null
  const n = referralFormNo(c, id)
  const forms = useFormDraftStore.getState()
  forms.ensureDraftForCase(n, c.no, n === 19 ? {} : buildSeedForCase(18, c))
  const fields = useFormDraftStore.getState().getDraft(n)
  if (!fields._referralMeta) {
    const at = new Date().toISOString()
    const by = useAuthStore.getState().getCurrentUserAccount()?.name || c.assignedOfficer || ''
    forms.updateField(n, '_referralMeta', { id: `${caseNo}:rlpd:${id}`, createdAt: at, createdBy: by, updatedAt: at, updatedBy: by, revision: 1, history: [] } satisfies ReferralDocumentMeta)
    forms.updateField(n, '_referralValues', referralValues(c, id, fields))
  }
  if (!hasReferralDocument(c, id) || !c.extraForms?.includes(n)) {
    useCaseStore.getState().updateCase(caseNo, { extraForms: Array.from(new Set([...(c.extraForms || []), n])) })
  }
  return n
}

export function saveReferralDocument(caseNo: string, id: ReferralDocumentId, draft: AdditionalFormValues): void {
  const n = ensureReferralDocument(caseNo, id)
  if (n === null) throw new Error('ไม่มีสิทธิ์แก้ไขเอกสารฉบับนี้')
  const forms = useFormDraftStore.getState()
  const fields = forms.getDraft(n)
  const meta = fields._referralMeta as ReferralDocumentMeta
  const changed = JSON.stringify(fields._referralValues) !== JSON.stringify(draft)
  const at = new Date().toISOString()
  const by = useAuthStore.getState().getCurrentUserAccount()?.name || meta.updatedBy
  if (changed) {
    forms.updateField(n, '_referralValues', structuredClone(draft))
    forms.updateField(n, '_referralMeta', { ...meta, updatedAt: at, updatedBy: by, revision: meta.revision + 1,
      history: [...meta.history, { revision: meta.revision, at: meta.updatedAt, by: meta.updatedBy, draft: structuredClone(fields._referralValues) }] })
  }
  // The workflow uses the same scoped draft. Only mark it saved; never approve, sign or dispatch on attachment/save.
  for (const [key, source] of Object.entries(MAP[id])) forms.updateField(n, source, draft.values[key] || '')
  if (id === 'rights-assistance-letter' && isRightsReferral(useCaseStore.getState().getCase(caseNo)!)) useCaseStore.getState().markArticle14LetterSaved(caseNo)
}
