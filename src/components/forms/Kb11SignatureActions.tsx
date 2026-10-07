import React, { useState } from 'react'
import { protectionResponsibleName } from '../../lib/protectionHandoff'
import { Button } from '../common/Button'
import { SignatureModal } from '../common/SignatureModal'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { useCaseStore } from '../../store/useCaseStore'
import { useSignatureLinkStore } from '../../store/useSignatureLinkStore'
import { showToast, showLinkDialog } from '../../lib/swal'
import { KB11_SIGN_SLOTS, kb11Gate } from '../../lib/formSignature'
import { readRoutableProtectionMethods } from '../../lib/constants'
import { METHOD_LABELS } from '../../lib/episode'
import { ProtectionMethodNo } from '../../types/case'

interface Kb11SignatureActionsProps {
  /** เลขคำร้องของแฟ้มที่เปิดแบบ คบ.11 นี้ */
  caseNo?: string
  /** เรียกหลังบันทึกข้อตกลงเสร็จ เพื่อปิดโมดัลกลับไปที่แฟ้ม */
  onSaved?: () => void
}

/**
 * ลายมือชื่อท้ายบันทึกข้อตกลง คบ.11 — พยาน เจ้าพนักงาน และพยานในการทำข้อตกลงอีกสองคน
 * ลงนามจากรายการแบบฟอร์มในแฟ้มที่เดียว เช่นเดียวกับ คบ.6 และหนังสือส่งออก
 */
export const Kb11SignatureActions: React.FC<Kb11SignatureActionsProps> = ({ caseNo, onSaved }) => {
  const { getDraft, signatures, signDocument, lockForm } = useFormDraftStore()
  const { getCase, updateCase, logHistory, setApprovedMethods, recordConsent } = useCaseStore()
  const createSignatureLink = useSignatureLinkStore((s) => s.createLink)
  const draft = getDraft(11)
  const caseItem = caseNo ? getCase(caseNo) : undefined
  const [activeSignKey, setActiveSignKey] = useState<string | null>(null)

  if (!caseItem) {
    return (
      <p className="ws-readonly text-[0.88rem] leading-relaxed text-muted">
        <i className="fa-solid fa-circle-info mr-1.5" />
        เปิดแบบ คบ.11 จากแฟ้มคำร้องเพื่อลงลายมือชื่อในบันทึกข้อตกลง — หน้านี้ยังไม่ผูกกับแฟ้มใด
      </p>
    )
  }

  /** TC-065 — ต้องลงนามครบทุกช่องตามแบบ คบ.11 (พยาน/เจ้าพนักงาน/พยานในการทำข้อตกลง 2 คน) จึงบันทึกข้อตกลงได้ */
  const allSigned = KB11_SIGN_SLOTS.every((s) => signatures[s.key]?.signed)
  const someSigned = KB11_SIGN_SLOTS.some((s) => signatures[s.key]?.signed)
  const incompleteSignatures = someSigned && !allSigned
  const agreementSaved = Boolean(caseItem.kb11Signed)

  /** วิธีที่เสนอไว้ในข้อ 8.2 ของ คบ.6 — เปิดเป็นเส้นทาง 08A-1/08A-2/08A-3/08B ทันทีที่พยานลงนาม */
  const kb6Methods = readRoutableProtectionMethods(getDraft(6)) as ProtectionMethodNo[]

  const handleSaveAgreement = () => {
    if (!allSigned || !kb11Gate(caseItem).unlocked) { showToast('ต้องบันทึกการรับแจ้ง คบ.9 และลงนามข้อตกลง คบ.11 ครบก่อนบันทึก', 'warning'); return }
    const actor = protectionResponsibleName(caseItem)
    updateCase(caseItem.no, { kb11Signed: true })
    /**
     * WIT0810 → WIT0811 — ลายมือชื่อในแบบ คบ.11 คือ "พยานยินยอม" ของประตู WIT0809
     * ต้องบันทึกเป็นความยินยอมในแฟ้มด้วย ไม่งั้นหน้า 08A ยังเห็นประตูนี้ค้างอยู่
     * ทั้งที่ข้อตกลงลงนามครบแล้ว
     */
    recordConsent(caseItem.no, {
      ref: 'kb11',
      consented: true,
      by: signatures['kb11-witness']?.signerName || caseItem.person,
      evidence: 'ลายมือชื่อครบถ้วนในบันทึกข้อตกลง คบ.11',
    })
    /** พยานลงนามยอมรับความคุ้มครองแล้ว — ล็อกแบบ คบ.11 ถาวร ห้ามแก้ไขทับอีก */
    lockForm(11, actor, 'พยานลงนามยอมรับการคุ้มครองแล้ว ห้ามแก้ไขข้อตกลง')
    logHistory(
      caseItem.no,
      'ลงนามบันทึกข้อตกลงการคุ้มครองพยาน (คบ.11)',
      actor,
      'พยานและเจ้าพนักงาน ป.ป.ท. ลงลายมือชื่อในข้อตกลงครบถ้วน'
    )

    /** WIT0813 — พยานยินยอมแล้ว จึงแยกแนวทางคุ้มครองตามวิธีที่ติ๊กไว้ใน คบ.6 ให้อัตโนมัติ */
    if (kb6Methods.length > 0) {
      setApprovedMethods(caseItem.no, kb6Methods, actor)
      logHistory(
        caseItem.no,
        'เปิดเส้นทางปฏิบัติตามวิธีคุ้มครองที่เสนอใน คบ.6',
        actor,
        kb6Methods.map((m) => METHOD_LABELS[m]).join(' · ')
      )
    }

    showToast(
      kb6Methods.includes(1)
        ? `บันทึกข้อตกลง คบ.11 แล้ว — เปิดเส้นทางปฏิบัติ ${kb6Methods.length} วิธี และเปิดจัดทำ คบ.8 ตามวิธีที่ 1`
        : kb6Methods.length > 0
        ? `บันทึกข้อตกลง คบ.11 แล้ว — เปิดเส้นทางปฏิบัติ ${kb6Methods.length} วิธีตาม คบ.6`
        : 'บันทึกข้อตกลง คบ.11 เรียบร้อยแล้ว'
    )
    onSaved?.()
  }

  return (
    <div className="space-y-2.5">
      <div className="rounded-lg border border-line bg-blue-soft p-3 text-[0.88rem] leading-relaxed text-navy">
        <i className="fa-solid fa-file-signature mr-1.5" />
        ลายมือชื่อท้ายบันทึกข้อตกลงลงนามที่รายการแบบฟอร์มในแฟ้มนี้ — แฟ้ม {caseItem.no}{' '}
        จะบันทึกข้อตกลงได้เมื่อทั้งพยานและเจ้าพนักงานลงลายมือชื่อครบ
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {KB11_SIGN_SLOTS.map((s) => {
          const sign = signatures[s.key]
          return (
            <div key={s.key} className="rounded-lg border border-line bg-white p-4 space-y-3">
              <div className="text-[0.95rem] font-semibold text-navy">{s.label}</div>
              <div className="rounded-lg bg-soft border border-line p-4 text-center">
                {sign?.signed ? (
                  <div>
                    <div className="text-sm font-bold text-navy-mid italic font-serif underline decoration-blue-500">
                      {sign.signerName}
                    </div>
                    <div className="text-[0.8rem] text-success font-bold mt-1">✓ ลงนามแล้ว ({sign.signedAt})</div>
                  </div>
                ) : (
                  <div className="text-[0.8rem] text-muted italic">ยังไม่ได้ลงลายมือชื่อ</div>
                )}
              </div>
              <Button
                type="button"
                disabled={agreementSaved}
                onClick={() => setActiveSignKey(s.key)}
                title={agreementSaved ? 'บันทึกข้อตกลงและล็อกฉบับแล้ว — ลงนามซ้ำไม่ได้' : undefined}
                className={`w-full flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg px-4 py-[0.68rem] text-[0.88rem] font-semibold text-white transition ${
                  agreementSaved ? 'bg-muted cursor-not-allowed' : 'bg-navy hover:bg-blue'
                }`}
              >
                <i className="fa-solid fa-pen-nib" />
                {sign?.signed ? 'ลงนามใหม่' : 'ลงลายมือชื่อ'}
              </Button>
            </div>
          )
        })}
      </div>

      {incompleteSignatures && !agreementSaved && (
        <p
          data-testid="kb11-incomplete-signatures"
          className="flex items-start gap-1.5 ws-callout text-[0.88rem] font-semibold"
        >
          <i className="fa-solid fa-triangle-exclamation mt-0.5" />
          <span>ลายมือชื่อยังไม่ครบตามแบบ คบ.11 (ต้องมีพยาน เจ้าพนักงาน และพยานในการทำข้อตกลงอีก 2 คน) —
            ยังบันทึกและล็อกข้อตกลงฉบับนี้ไม่ได้</span>
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={!allSigned || agreementSaved}
          onClick={handleSaveAgreement}
          className={`flex items-center gap-1.5 min-h-[44px] rounded-lg px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white transition ${
            allSigned && !agreementSaved ? 'bg-success hover:bg-success-dark' : 'bg-muted cursor-not-allowed'
          }`}
          title={agreementSaved ? 'บันทึกข้อตกลงแล้ว' : allSigned ? undefined : 'ต้องมีลายมือชื่อครบทุกช่องตามแบบ คบ.11'}
        >
          <i className="fa-solid fa-check" />
          {agreementSaved ? 'บันทึกข้อตกลงแล้ว' : 'บันทึกข้อตกลง คบ.11'}
        </Button>
      </div>

      {activeSignKey && (() => {
        const slot = KB11_SIGN_SLOTS.find((s) => s.key === activeSignKey)
        const signMeta = {
          title: `ลงลายมือชื่อ${slot?.label || ''}`,
          signerRole: slot?.role || '',
          defaultSignerName:
            activeSignKey === 'kb11-witness'
              ? draft['ชื่อพยาน'] || caseItem.person || ''
              : activeSignKey === 'kb11-officer'
              ? protectionResponsibleName(caseItem)
              : '',
        }

        return (
          <SignatureModal
            isOpen
            title={signMeta.title}
            signerRole={signMeta.signerRole}
            defaultSignerName={signMeta.defaultSignerName}
            onClose={() => setActiveSignKey(null)}
            onConfirm={(name, img) => {
              signDocument(activeSignKey, name, img)
              setActiveSignKey(null)
              showToast('บันทึกลายมือชื่ออิเล็กทรอนิกส์แล้ว')
            }}
            onGenerateLink={() => {
              const token = createSignatureLink({
                title: signMeta.title,
                signerRole: signMeta.signerRole,
                defaultSignerName: signMeta.defaultSignerName,
                target: { kind: 'formDraft', key: activeSignKey },
              })
              setActiveSignKey(null)
              showLinkDialog('สร้างลิงก์เซ็นทางไกลสำเร็จ', `${window.location.origin}/sign/${token}`)
            }}
          />
        )
      })()}
    </div>
  )
}
