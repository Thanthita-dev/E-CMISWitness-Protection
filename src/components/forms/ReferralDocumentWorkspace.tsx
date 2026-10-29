import { SignatureModal } from '../common/SignatureModal'
import { useCaseStore } from '../../store/useCaseStore'
import { showToast } from '../../lib/swal'
import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useVisibleCases } from '../../hooks/useVisibleCases'
import { useAuthStore } from '../../store/useAuthStore'
import { selectCaseDraft, useFormDraftStore } from '../../store/useFormDraftStore'
import { getAdditionalForm } from '../../lib/additionalForms'
import { hasReferralDocument, referralFormNo, type ReferralDocumentId } from '../../lib/referralDocumentIdentity'
import { canEditReferralDocument, ensureReferralDocument, referralValues, saveReferralDocument, type ReferralDocumentMeta } from '../../lib/referralDocuments'
import { AdditionalFormEditor } from './AdditionalFormEditor'
import { Button } from '../common/Button'

export function ReferralDocumentWorkspace({ id, caseNo, onBack }: { showHistory?: boolean; id: ReferralDocumentId; caseNo?: string; onBack: () => void }) {
  const cases = useVisibleCases()
  const role = useAuthStore(s => s.currentRole)
  const [signOpen, setSignOpen] = React.useState(false)
  const forms = useFormDraftStore()
  const navigate = useNavigate()
  const [selectedCase, setSelectedCase] = React.useState('')
  const c = cases.find(item => item.no === caseNo)
  const template = getAdditionalForm(id)!
  const n = c ? referralFormNo(c, id) : 0
  const fields = c ? selectCaseDraft(forms, n, c.no) : {}
  const meta = fields._referralMeta as ReferralDocumentMeta | undefined
  const attached = Boolean(c && hasReferralDocument(c, id))
  const readOnly = !c || !attached || !canEditReferralDocument(c, id)
  const canSign = Boolean(c && id === 'chairman-signature' && ['secretary', 'admin'].includes(role) && ['secretary_review', 'committee_pending'].includes(c.article14?.step || '') && !c.sarabanDispatch && !c.article14?.secretarySignature)
  const draft = referralValues(c, id, fields)
  const attach = (no: string) => {
    if (ensureReferralDocument(no, id) === null) return
    void navigate({ to: '/forms', search: { additional: id, caseNo: no } })
  }
  if (caseNo && !c) return <div className="ws-card p-5">ไม่พบแฟ้มหรือไม่มีสิทธิ์เปิดแฟ้มนี้ <Button variant="secondary" size="md" onClick={onBack}>กลับ</Button></div>
  return <div className="space-y-4" data-testid="referral-document-workspace" data-document-id={meta?.id}>
    {!c ? <section className="ws-card space-y-3 p-4">
      <p className="text-sm text-muted">ตัวอย่างต้นฉบับ · เลือกแฟ้มเพื่อแนบและจัดทำร่าง</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1"><span className="ws-label">เลือกแฟ้มคำร้อง</span><select className="ws-input w-full" value={selectedCase} onChange={e => setSelectedCase(e.target.value)}>
          <option value="">— เลือกแฟ้ม —</option>
          {cases.filter(item => canEditReferralDocument(item, id) || hasReferralDocument(item, id)).map(item => <option key={item.no} value={item.no}>{item.no} · {item.person}</option>)}
        </select></label>
        <Button variant="primary" size="md" disabled={!selectedCase} onClick={() => {
          const item = cases.find(item => item.no === selectedCase)
          if (item && hasReferralDocument(item, id)) void navigate({ to: '/forms', search: { additional: id, caseNo: item.no } })
          else attach(selectedCase)
        }}>แนบเข้าแฟ้ม / เปิดร่างเดิม</Button>
      </div>
    </section> : !attached && canEditReferralDocument(c, id) ? <Button variant="primary" size="md" onClick={() => attach(c.no)}>แนบเข้าแฟ้ม</Button> : null}
    {canSign && <Button variant="primary" size="md" onClick={() => setSignOpen(true)}><i className="fa-solid fa-signature" />ลงนามเลขาธิการ</Button>}
    <SignatureModal isOpen={signOpen} title="ลงนามบันทึกเสนอประธานกรรมการ" signerRole="เลขาธิการ ป.ป.ท." defaultSignerName={useAuthStore.getState().getCurrentUserAccount()?.name || ''} onClose={() => setSignOpen(false)} onConfirm={(name, image) => {
      if (c && useCaseStore.getState().signArticle14Secretary(c.no, name, image)) { setSignOpen(false); showToast('ลงนามในเอกสารแล้ว') }
    }} />
    <AdditionalFormEditor key={`${id}:${caseNo || 'preview'}:${c?.article14?.secretarySignature?.at || ''}`} template={template}
      onBack={c ? () => { void navigate({ to: '/dossier/$caseNo', params: { caseNo: c.no } }) } : onBack}
      signatureAction={canSign ? { fieldId: 'signer:17', label: 'ลงนามเลขาธิการ', onSign: () => setSignOpen(true) } : undefined}
      document={{ draft, readOnly, label: c ? `แฟ้ม ${c.no}` : 'ตัวอย่างต้นฉบับ', onSave: value => { if (c) saveReferralDocument(c.no, id, value) } }} />
  </div>
}
