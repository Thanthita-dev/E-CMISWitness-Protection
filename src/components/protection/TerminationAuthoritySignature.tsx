import React, { useState } from 'react'
import type { CaseItem } from '../../types/case'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { useFormDraftStore, selectCaseDraft } from '../../store/useFormDraftStore'
import { terminationReasonText } from '../../lib/terminationRules'
import { sarabanInTransit } from '../../lib/saraban'
import { SignatureModal } from '../common/SignatureModal'
import { PaperSignRegistration } from '../forms/paper/paperSign'

export function canSignTerminationAuthority(c: CaseItem, form: number, role: string): boolean {
  if (!['secretary', 'admin'].includes(role) || sarabanInTransit(c)) return false
  const atSecretary = c.kb15?.status === 'submitted' && c.kb15.approvalStage === 'secretary'
  const ready = atSecretary || Boolean(c.terminationApproval?.approved)
  if (form === 16) return !c.kb16?.signedAt && ready
  if (form === 17) return !c.kb17?.signedAt && ready && Boolean(c.kb16?.signedAt)
  return false
}

export function TerminationAuthoritySignature({ caseItem, form }: { caseItem: CaseItem; form: number }) {
  const [open, setOpen] = useState(false)
  const auth = useAuthStore()
  const allowed = canSignTerminationAuthority(caseItem, form, auth.currentRole)
  const key = form === 16 ? 'kb16-authority' : 'kb17-signer'
  const signer = auth.getCurrentUserAccount()?.name || ''
  return <>
    <PaperSignRegistration signKey={key} handler={allowed ? { onSign: () => setOpen(true) } : null} />
    <SignatureModal isOpen={open} title={`ลงนาม คบ.${form}`} signerRole="เลขาธิการ ป.ป.ท." defaultSignerName={signer} onClose={() => setOpen(false)} onConfirm={(_name, image) => {
      const store = useCaseStore.getState()
      const current = store.getCase(caseItem.no)
      if (!current || !canSignTerminationAuthority(current, form, useAuthStore.getState().currentRole)) return
      const draft = selectCaseDraft(useFormDraftStore.getState(), 16, caseItem.no)
      if (current.kb15) store.updateCase(caseItem.no, {
        kb15: { ...current.kb15, bundledForms: true },
        kb16: { ...current.kb16, orderNo: current.kb16?.orderNo || [draft['เลขที่คำสั่ง'], draft['ปีคำสั่ง']].filter(Boolean).join('/'), reason: terminationReasonText(current.kb15), issuedAt: current.kb16?.issuedAt || String(draft['วันที่ออกคำสั่ง'] || ''), effectiveAt: current.kb16?.effectiveAt || String(draft['วันที่มีผล'] || current.kb15.proposedEndAt || ''), kb15Version: current.kb15.version, status: 'submitted' },
        kb17: { ...current.kb17, documentName: current.kb17?.documentName || 'คบ.17', status: 'submitted' },
      })
      if (form === 16) store.signKb16(caseItem.no)
      else store.signKb17(caseItem.no)
      const updated = useCaseStore.getState().getCase(caseItem.no)
      if (form === 16 ? updated?.kb16?.signedAt : updated?.kb17?.signedAt) {
        if (form === 16 && updated?.kb16) store.updateCase(caseItem.no, { kb16: { ...updated.kb16, signatureImage: image } })
        if (form === 17 && updated?.kb17) store.updateCase(caseItem.no, { kb17: { ...updated.kb17, signatureImage: image } })
        setOpen(false)
      }
    }} />
  </>
}
