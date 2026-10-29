import React, { useState } from 'react'
import { Button } from '../common/Button'
import { SignatureModal } from '../common/SignatureModal'
import { PaperSignRegistration } from './paper/paperSign'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { showToast } from '../../lib/swal'
import { activateCaseForms } from '../../lib/formPrefill'
import {
  FAST_TRACK_DEFAULT_OPINION,
  FAST_TRACK_SIGNERS,
  FastTrackSigner,
  fastTrackSignerTurn,
  isFastTrackCase,
} from '../../lib/fastTrack'

interface FastTrackSignatureActionsProps {
  formId: 4 | 5
  /** เลขคำร้องของแฟ้มที่เปิดแบบนี้ — ไม่มีเมื่อเปิดจากคลังแบบฟอร์มโดยไม่ผูกแฟ้ม */
  caseNo?: string
}

/**
 * ปุ่ม "ลงนาม" ของแบบ คบ.4 / คบ.5 (เส้นทางเร่งด่วน) — วางไว้ท้ายหน้ากรอกแบบข้าง "บันทึกแบบ" เช่นเดียวกับ คบ.6
 * ความเห็นข้อ 13 ของ ผอ. กรอกในแบบ คบ.4 เอง (แหล่งเดียว) — โมดัลนี้จึงไม่มีช่องความเห็นซ้ำ
 * มีผู้ลงนามที่ "ถึงคิว" ได้ทีละคนตามขั้นของแฟ้ม ปุ่มจึงแสดงชื่อ "ลงนาม" เฉย ๆ
 */
export const FastTrackSignatureActions: React.FC<FastTrackSignatureActionsProps> = ({ formId, caseNo }) => {
  const { currentRole, getCurrentDirectorAccount } = useAuthStore()
  const getCase = useCaseStore((s) => s.getCase)
  const signatures = useFormDraftStore((s) => s.signatures)
  const signDocument = useFormDraftStore((s) => s.signDocument)
  const updateSignedField = useFormDraftStore((s) => s.updateSignedField)
  const [active, setActive] = useState<FastTrackSigner | null>(null)

  const caseItem = caseNo ? getCase(caseNo) : undefined
  if (!caseItem || !isFastTrackCase(caseItem)) return null

  const pendingSigner = FAST_TRACK_SIGNERS.find(
    (s) => s.formId === formId && !signatures[s.key]?.signed && fastTrackSignerTurn(s, caseItem, currentRole)
  )
  /** ผอ. ลงนาม คบ.4 (ข้อ 13) ก่อน แล้วจึงลงนามคำสั่ง คบ.5 */
  const waitingKb4 = pendingSigner?.key === 'kb5-director' && !signatures['kb4-director']?.signed

  const defaultSignerName = (signer: FastTrackSigner): string => {
    if (signer.byDirector) return getCurrentDirectorAccount()?.name || caseItem.owner || ''
    return String(useFormDraftStore.getState().getDraft(4)['ผู้เสนอ'] || '') || caseItem.assignedOfficer || ''
  }

  const handleConfirmSign = (signerName: string, img?: string) => {
    if (!active) return
    /** ผูกร่างกับแฟ้มนี้ก่อนเขียน แล้วเติมความเห็นตั้งต้นถ้าข้อที่ต้องมีความเห็นยังว่าง */
    activateCaseForms(caseItem, [active.formId])
    const draft = useFormDraftStore.getState().getDraft(active.formId)
    if (active.opinionField && !String(draft[active.opinionField] ?? '').trim()) {
      updateSignedField(active.formId, active.opinionField, FAST_TRACK_DEFAULT_OPINION)
    }
    signDocument(active.key, signerName, img)
    /** เติมชื่อผู้ลงนามลงในช่องของแบบ เพื่อให้ฉบับพิมพ์ A4 ตรงกับผู้ลงนามจริง */
    if (signerName.trim()) updateSignedField(active.formId, active.nameField, signerName)
    showToast(`ลงนาม${active.label}ใน คบ.${active.formId} แล้ว`)
    setActive(null)
  }

  return (
    <>
      {pendingSigner && <PaperSignRegistration signKey={pendingSigner.key} handler={waitingKb4 ? { onSign: () => undefined, waitingLabel: 'รอลงนาม คบ.4 ก่อน' } : { onSign: () => setActive(pendingSigner) }} />}
      {pendingSigner && waitingKb4 && (
        <p data-testid="kb5-sign-wait-kb4" className="text-[0.8rem] font-semibold text-amber-700">
          <i className="fa-solid fa-lock mr-1" />
          ต้องลงนามในแบบ คบ.4 ก่อน จึงลงนามคำสั่ง คบ.5 ได้
        </p>
      )}
      {pendingSigner && !waitingKb4 && (
        <Button
          type="button"
          onClick={() => setActive(pendingSigner)}
          data-testid={`kb${formId}-sign-button`}
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy-mid px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-navy transition"
        >
          <i className="fa-solid fa-pen-nib" aria-hidden="true" />
          ลงนาม
        </Button>
      )}

      {active && (
        <SignatureModal
          isOpen
          title={`ลงนาม${active.label}ในแบบ คบ.${active.formId}`}
          signerRole={active.signerRole}
          defaultSignerName={defaultSignerName(active)}
          onClose={() => setActive(null)}
          onConfirm={handleConfirmSign}
        />
      )}
    </>
  )
}
