import React, { useState } from 'react'
import type { CaseItem } from '../../types/case'
import { useAuthStore } from '../../store/useAuthStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { isKb15StageReviewer, kb15PendingStage, kb15StageLabel } from '../../lib/protectionHandoff'
import { terminationSignatures } from '../../lib/terminationDraft'
import { sarabanInTransit } from '../../lib/saraban'
import { SignatureModal } from '../common/SignatureModal'
import { PaperSignRegistration } from '../forms/paper/paperSign'

export function Kb15ReviewerSignature({ caseItem }: { caseItem?: CaseItem }) {
  const [open, setOpen] = useState(false)
  const auth = useAuthStore()
  useFormDraftStore()
  const stage = kb15PendingStage(caseItem)
  if (!caseItem || !stage) return null
  const key = `kb15-${stage}`
  const signer = auth.getCurrentUserAccount()?.name || ''
  const allowed = isKb15StageReviewer(auth.currentRole, caseItem) && !sarabanInTransit(caseItem)
  const signed = terminationSignatures(caseItem, 15)[key]?.signed
  return <>
    <PaperSignRegistration signKey={key} handler={allowed && !signed ? { onSign: () => setOpen(true) } : null} />
    <SignatureModal isOpen={open} title={`ลงนาม คบ.15 · ${kb15StageLabel(stage, caseItem)}`} signerRole={kb15StageLabel(stage, caseItem)} defaultSignerName={signer} onClose={() => setOpen(false)} onConfirm={(_name, image) => {
      if (!isKb15StageReviewer(useAuthStore.getState().currentRole, caseItem)) return
      useFormDraftStore.getState().signDocument(key, signer, image, caseItem.no)
      setOpen(false)
    }} />
  </>
}
