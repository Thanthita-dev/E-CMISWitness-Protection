import React, { useState } from 'react'
import type { CaseItem } from '../../types/case'
import { useAuthStore } from '../../store/useAuthStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { terminationHeadName, terminationSignatures, canSignTerminationPreparer } from '../../lib/terminationDraft'
import { SignatureModal } from '../common/SignatureModal'
import { PaperSignRegistration } from '../forms/paper/paperSign'

export function Kb15HeadSignature({ caseItem }: { caseItem?: CaseItem }) {
  const [open, setOpen] = useState(false)
  const auth = useAuthStore()
  useFormDraftStore()
  if (!caseItem) return null
  const head = terminationHeadName(caseItem)
  const sign = terminationSignatures(caseItem, 15)['kb15-officer']
  const signer = auth.getCurrentUserAccount()?.name || head
  const allowed = canSignTerminationPreparer(caseItem) && (!caseItem.kb15 || ['draft', 'returned'].includes(caseItem.kb15.status))
  const start = () => {
    setOpen(true)
  }
  return <>
    <PaperSignRegistration signKey="kb15-officer" handler={allowed && !sign?.signed ? { onSign: start } : null} />
    <SignatureModal isOpen={open} title="ลงนาม คบ.15" signerRole="หัวหน้าชุดปฏิบัติการ" defaultSignerName={signer} onClose={() => setOpen(false)} onConfirm={(_name, image) => {
      useFormDraftStore.getState().signDocument('kb15-officer', signer, image, caseItem.no)
      setOpen(false)
    }} />
  </>
}
