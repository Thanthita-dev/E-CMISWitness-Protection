import React, { useState } from 'react'
import { Button } from '../common/Button'
import { SignatureModal } from '../common/SignatureModal'
import { signaturesForCase, useFormDraftStore } from '../../store/useFormDraftStore'
import { useSignatureLinkStore } from '../../store/useSignatureLinkStore'
import { showToast, showLinkDialog } from '../../lib/swal'
import { KB3_SIGN_SLOTS } from '../../lib/formSignature'
import { CaseItem } from '../../types/case'
import { PaperSignRegistration } from './paper/paperSign'

interface Kb3SignatureActionsProps {
  caseItem?: CaseItem
  /** ฉบับถูกล็อกแล้ว (ชุดเสนอรับรองแล้ว) — ลงนามซ้ำไม่ได้ */
  locked?: boolean
}

/**
 * ลายมือชื่อท้ายบันทึกข้อเท็จจริง คบ.3 — ผู้ให้ถ้อยคำและเจ้าพนักงาน
 * ไม่บังคับให้ลงนามครบก่อนบันทึกแบบ เพื่อให้กดผ่านได้ลื่นในต้นแบบ
 */
export const Kb3SignatureActions: React.FC<Kb3SignatureActionsProps> = ({ caseItem, locked }) => {
  const getDraft = useFormDraftStore((s) => s.getDraft)
  const allSignatures = useFormDraftStore((s) => s.signatures)
  const signatureCases = useFormDraftStore((s) => s.signatureCases)
  /** ลายมือชื่อที่ลงในแฟ้มนี้เท่านั้น (ตัวอย่างที่ไม่มีแฟ้มกำกับยังไม่นับว่าลงนาม) */
  const signatures = React.useMemo(() => signaturesForCase(allSignatures, signatureCases, caseItem?.no), [allSignatures, signatureCases, caseItem?.no])
  const signDocument = useFormDraftStore((s) => s.signDocument)
  const createSignatureLink = useSignatureLinkStore((s) => s.createLink)
  const [activeSignKey, setActiveSignKey] = useState<string | null>(null)
  const draft = getDraft(3)

  const allSigned = KB3_SIGN_SLOTS.every((s) => signatures[s.key]?.signed)

  /** ลิงก์ลงชื่อผู้ให้ถ้อยคำของแฟ้มนี้ที่ยังรอลงชื่อ */
  const witnessPendingLink = useSignatureLinkStore((st) => Object.values(st.links).some((link) =>
    link.status === 'pending' && link.target.kind === 'formDraft' && link.target.key === 'kb3-witness' && link.target.caseNo === caseItem?.no))
  const shareWitnessLink = () => {
    const token = createSignatureLink({
      title: 'ลงลายมือชื่อผู้ให้ถ้อยคำ (คบ.3)',
      signerRole: 'ผู้ให้ถ้อยคำ',
      defaultSignerName: draft['ผู้ให้ถ้อยคำ'] || caseItem?.person || '',
      target: { kind: 'formDraft', key: 'kb3-witness', caseNo: caseItem?.no },
    })
    void showLinkDialog('ส่งลิงก์ให้ผู้ให้ถ้อยคำลงชื่อ', `${window.location.origin}/sign/${token}`)
  }

  const defaultNameFor = (key: string) =>
    key === 'kb3-witness'
      ? draft['ผู้ให้ถ้อยคำ'] || caseItem?.person || ''
      : caseItem?.assignedOfficer || ''

  const slot = KB3_SIGN_SLOTS.find((s) => s.key === activeSignKey)
  const signMeta = slot && {
    title: `ลงลายมือชื่อ${slot.label}`,
    signerRole: slot.role,
    defaultSignerName: defaultNameFor(slot.key),
  }

  return (
    <div className="space-y-2.5" data-testid="kb3-signatures">
      {/* บนกระดาษ: เจ้าพนักงานกดลงนามเอง · ผู้ให้ถ้อยคำลงชื่อเองผ่านลิงก์ที่เจ้าหน้าที่ส่งให้ (แบบเดียวกับผู้ยื่นคำร้อง คบ.1) */}
      <PaperSignRegistration signKey="kb3-officer" handler={locked ? null : { onSign: () => setActiveSignKey('kb3-officer') }} />
      <PaperSignRegistration signKey="kb3-witness" handler={locked || signatures['kb3-witness']?.signed ? null : witnessPendingLink
        ? { onSign: () => undefined, waitingLabel: 'รอผู้ให้ถ้อยคำลงชื่อผ่านลิงก์' }
        : { onSign: shareWitnessLink, label: 'ส่งลิงก์ลงชื่อ' }} />
      <div className="rounded-lg border border-line bg-blue-soft p-3 text-[0.88rem] leading-relaxed text-navy">
        <i className="fa-solid fa-file-signature mr-1.5" />
        ผู้ให้ถ้อยคำลงลายมือชื่อต่อหน้าเจ้าพนักงาน ลายมือชื่อจะแสดงบนแบบพิมพ์ทั้งหน้า 1 และหน้า 2
        {allSigned && <span className="ml-1 font-semibold text-success">— ลงนามครบแล้ว</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {KB3_SIGN_SLOTS.map((s) => {
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
                disabled={locked}
                onClick={() => setActiveSignKey(s.key)}
                title={locked ? 'ฉบับนี้ถูกล็อกแล้ว — ลงนามซ้ำไม่ได้' : undefined}
                className={`w-full flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg px-4 py-[0.68rem] text-[0.88rem] font-semibold text-white transition ${
                  locked ? 'bg-muted cursor-not-allowed' : 'bg-navy hover:bg-blue'
                }`}
              >
                <i className="fa-solid fa-pen-nib" />
                {sign?.signed ? 'ลงนามใหม่' : 'ลงลายมือชื่อ'}
              </Button>
            </div>
          )
        })}
      </div>

      {activeSignKey && signMeta && (
        <SignatureModal
          isOpen
          title={signMeta.title}
          signerRole={signMeta.signerRole}
          defaultSignerName={signMeta.defaultSignerName}
          onClose={() => setActiveSignKey(null)}
          onConfirm={(name, img) => {
            signDocument(activeSignKey, name, img, caseItem?.no)
            setActiveSignKey(null)
            showToast('บันทึกลายมือชื่ออิเล็กทรอนิกส์แล้ว')
          }}
          onGenerateLink={() => {
            const token = createSignatureLink({
              title: signMeta.title,
              signerRole: signMeta.signerRole,
              defaultSignerName: signMeta.defaultSignerName,
              target: { kind: 'formDraft', key: activeSignKey, caseNo: caseItem?.no },
            })
            setActiveSignKey(null)
            showLinkDialog('สร้างลิงก์เซ็นทางไกลสำเร็จ', `${window.location.origin}/sign/${token}`)
          }}
        />
      )}
    </div>
  )
}
