import React, { useState } from 'react'
import { Button } from '../common/Button'
import { SignatureModal } from '../common/SignatureModal'
import { OutgoingNoticeFormNo } from '../../types/case'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { useSignatureLinkStore } from '../../store/useSignatureLinkStore'
import { showToast, showLinkDialog, showConfirmAlert, confirmBody } from '../../lib/swal'
import { OUTGOING_NOTICES, outgoingSubmitted, outgoingTrackMatches } from '../../lib/formSignature'

interface OutgoingNoticeSignatureProps {
  formNo: OutgoingNoticeFormNo
  /** เลขคำร้องของแฟ้มที่เปิดแบบนี้ — ไม่มีเมื่อเปิดจากคลังแบบฟอร์มโดยไม่ผูกแฟ้ม */
  caseNo?: string
}

const Notice: React.FC<{ tone?: 'info' | 'warn'; children: React.ReactNode }> = ({ tone = 'info', children }) => (
  <p
    className={`rounded-lg border border-dashed p-3 text-[0.8rem] leading-relaxed ${
      tone === 'warn' ? 'border-gold bg-gold-soft text-warning' : 'border-[#aebdca] bg-soft text-muted'
    }`}
  >
    <i className={`fa-solid ${tone === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-info'} mr-1.5`} />
    {children}
  </p>
)

/**
 * ลายมือชื่อเลขาธิการ ป.ป.ท. บนหนังสือส่งออกรายฉบับ (คบ.8 / คบ.9 / คบ.10)
 * ลงนามที่หน้าแบบฟอร์มของฉบับนั้นที่เดียว รูปแบบเดียวกับความเห็นตามลำดับชั้นใน คบ.6
 */
export const OutgoingNoticeSignature: React.FC<OutgoingNoticeSignatureProps> = ({ formNo, caseNo }) => {
  const { currentRole } = useAuthStore()
  const { getCase, signOutgoingNotice, returnKb8ForRevision } = useCaseStore()
  const updateField = useFormDraftStore((s) => s.updateField)
  const createSignatureLink = useSignatureLinkStore((s) => s.createLink)
  const [showSignModal, setShowSignModal] = useState(false)
  /** TC-072 — เหตุผลที่เลขาธิการฯ ส่งกลับแก้ไข คบ.8 เฉพาะฉบับนี้ (คบ.9/คบ.10 ไม่มีทาง Revision) */
  const [kb8ReturnReason, setKb8ReturnReason] = useState('')

  const meta = OUTGOING_NOTICES[formNo]
  const caseItem = caseNo ? getCase(caseNo) : undefined

  if (!caseItem) {
    return (
      <Notice>
        เปิดแบบ {meta.code} จากแฟ้มคำร้องเพื่อลงนามหนังสือส่งออก — หน้านี้เปิดจากคลังแบบฟอร์มจึงยังไม่ผูกกับแฟ้มใด
      </Notice>
    )
  }

  if (formNo === 9 || formNo === 10) return <Notice>
    {caseItem.resultNotices?.[formNo]?.original ? `คบ.${formNo} ลงนามจำลองพร้อมผลพิจารณาแล้ว ฉบับลงนามเดิมเก็บไว้แบบแก้ทับไม่ได้ การเติมรายละเอียดต้องทำจากงานของผู้รับผิดชอบตามสิทธิ` : `คบ.${formNo} เป็นร่างในชุดเสนอ คบ.1 / คบ.3 / คบ.6 เลขาธิการลงนามจำลองเฉพาะหนังสือที่ตรงกับผลพิจารณาเมื่อยืนยันผลในแฟ้ม`}
  </Notice>

  const isAdmin = currentRole === 'admin'
  const isSecretary = currentRole === 'secretary' || isAdmin
  const signedAt = meta.signedAt(caseItem)
  const signedBy = meta.signedBy(caseItem)

  /** หนังสือฉบับนี้ต้องตรงกับผลพิจารณาของแฟ้ม จึงจะเสนอลงนามได้ */
  if (!outgoingTrackMatches(meta, caseItem)) {
    return (
      <Notice tone="warn">
        แฟ้ม {caseItem.no}{' '}
        {caseItem.activity7State
          ? `อยู่ในเส้นทาง${caseItem.activity7State === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ'} จึงไม่ใช้ ${meta.code}`
          : 'ยังไม่มีผลพิจารณาจากเลขาธิการ ป.ป.ท. จึงยังลงนามหนังสือส่งออกไม่ได้'}
      </Notice>
    )
  }

  const submitted = outgoingSubmitted(meta, caseItem)
  const isTurn = isSecretary && submitted && !signedAt

  const handleConfirmSign = (signerName: string) => {
    signOutgoingNotice(caseItem.no, formNo, signerName)
    /** เติมชื่อผู้ลงนามลงในช่องของแบบฟอร์ม เพื่อให้ฉบับพิมพ์ A4 ตรงกับผู้ลงนามจริง */
    if (meta.nameField && signerName.trim()) updateField(formNo, meta.nameField, signerName)
    setShowSignModal(false)
    showToast(`ลงนาม ${meta.code} เรียบร้อยแล้ว`)
  }

  /**
   * TC-072 — ส่งกลับแก้ไข คบ.8 (เหมือน คบ.6/คบ.10/คบ.14/คบ.15) เฉพาะฉบับนี้เท่านั้น
   * คบ.9/คบ.10 เป็นหนังสือแจ้งผลฉบับสุดท้าย ไม่มีทาง Revision — คงพฤติกรรมลงนามอย่างเดียวไว้
   */
  const handleReturnKb8 = () => {
    if (!kb8ReturnReason.trim()) {
      showToast('กรุณาระบุเหตุผลที่ส่งกลับแก้ไข คบ.8', 'warning')
      return
    }
    const reason = kb8ReturnReason.trim()
    showConfirmAlert({
      icon: 'warning',
      title: 'ยืนยันส่งกลับแก้ไข คบ.8?',
      html: confirmBody(
        `ส่งกลับแก้ไข คบ.8 ฉบับที่ ${caseItem.kb8Version || 1} ของแฟ้ม ${caseItem.no}`,
        [['เหตุผลที่ส่งกลับ', reason]],
        'แฟ้มกลับไปให้เจ้าหน้าที่จัดทำ คบ.8 เป็นฉบับใหม่ (ฉบับเดิมยังเก็บไว้) และต้องเสนอเข้ารอบลงนามอีกครั้ง'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันส่งกลับ',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      returnKb8ForRevision(caseItem.no, reason, signedBy || undefined)
      setKb8ReturnReason('')
      showToast('ส่งกลับแก้ไข คบ.8 แล้ว')
    })
  }

  const handleGenerateLink = () => {
    const token = createSignatureLink({
      title: `ลงนาม ${meta.code} ก่อนส่งออกภายนอก`,
      signerRole: 'เลขาธิการ ป.ป.ท.',
      defaultSignerName: signedBy || '',
      target: { kind: 'outgoingNotice', caseNo: caseItem.no, formNo },
    })
    setShowSignModal(false)
    showLinkDialog('สร้างลิงก์เซ็นทางไกลสำเร็จ', `${window.location.origin}/sign/${token}`)
  }

  return (
    <div className="space-y-2.5">
      <div className="rounded-lg border border-line bg-blue-soft p-3 text-[0.88rem] leading-relaxed text-navy">
        <i className="fa-solid fa-file-signature mr-1.5" />
        หนังสือส่งออกลงนามที่รายการแบบฟอร์มในแฟ้ม — แฟ้ม {caseItem.no}
        {meta.track === 'approved' && ' จะนำส่งได้เมื่อลงนามครบทั้ง คบ.8 และ คบ.9'}
      </div>

      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 ${
          signedAt ? 'border-success bg-success-soft' : isTurn ? 'border-blue bg-white' : 'border-line bg-white'
        }`}
      >
        <div className="min-w-0">
          <strong className="block text-[0.95rem] font-semibold text-navy">
            {meta.code} · {meta.label}
          </strong>
          <span className="block text-[0.8rem] text-muted">
            {signedAt
              ? `ลงนามแล้ว ${signedAt}${signedBy ? ` โดย ${signedBy}` : ''}`
              : !submitted
              ? 'รอเจ้าหน้าที่เสนอเรื่องเข้ารอบลงนามจากแฟ้มคำร้อง'
              : isTurn
              ? 'ถึงคิวลงนามของท่าน'
              : 'รอเลขาธิการ ป.ป.ท. ลงนาม'}
          </span>
        </div>

        {signedAt ? (
          <span className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-success-soft px-3 py-[0.68rem] text-[0.88rem] font-semibold text-success-dark">
            <i className="fa-solid fa-circle-check" />
            ลงนามแล้ว
          </span>
        ) : isTurn ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => setShowSignModal(true)}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy-mid px-4 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-navy transition"
            >
              <i className="fa-solid fa-pen-nib" />
              ลงนาม {meta.code}
            </Button>
            {formNo === 8 && (
              <Button
                type="button"
                data-testid="kb8-return-for-revision"
                onClick={handleReturnKb8}
                className="rounded-lg border border-danger bg-danger-soft p-3 text-[0.88rem] leading-relaxed text-danger-dark"
              >
                <i className="fa-solid fa-rotate-left" />
                ส่งกลับแก้ไข
              </Button>
            )}
          </div>
        ) : (
          <span className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-line bg-soft px-3 py-[0.68rem] text-[0.88rem] font-semibold text-muted">
            ยังไม่ถึงคิว
          </span>
        )}
      </div>

      {/* TC-072 — เหตุผลที่ต้องระบุก่อนกดส่งกลับแก้ไข คบ.8 */}
      {formNo === 8 && isTurn && (
        <div className="rounded-lg border border-danger bg-danger-soft p-3 space-y-1.5">
          <label htmlFor="kb8-return-reason-input" className="block text-[0.8rem] font-bold text-danger-dark">
            เหตุผลที่ส่งกลับแก้ไข คบ.8 (กรอกก่อนกด &quot;ส่งกลับแก้ไข&quot;)
          </label>
          <input
            id="kb8-return-reason-input"
            data-testid="kb8-return-reason-input"
            value={kb8ReturnReason}
            onChange={(e) => setKb8ReturnReason(e.target.value)}
            placeholder="เช่น รายชื่อชุดคุ้มครองไม่ครบตามที่อนุมัติ"
            className="ws-input"
          />
        </div>
      )}

      {/* คู่ฉบับของเส้นทางอนุมัติ — เห็นได้ว่าอีกฉบับลงนามครบหรือยัง */}
      {meta.track === 'approved' && (
        <div className="flex flex-wrap gap-2 text-[0.8rem]">
          {([8, 9] as const)
            .filter((n) => n !== formNo)
            .map((n) => {
              const other = OUTGOING_NOTICES[n]
              const otherSignedAt = other.signedAt(caseItem)
              return (
                <span
                  key={n}
                  className={`rounded-full px-3 py-1 font-bold ${
                    otherSignedAt ? 'bg-success-soft text-success' : 'bg-gold-soft text-gold-dark'
                  }`}
                >
                  {other.code} {otherSignedAt ? `ลงนามแล้ว ${otherSignedAt}` : 'ยังไม่ได้ลงนาม'}
                </span>
              )
            })}
        </div>
      )}

      {showSignModal && (
        <SignatureModal
          isOpen
          title={`ลงนาม ${meta.code} ก่อนส่งออกภายนอก`}
          signerRole="เลขาธิการ ป.ป.ท."
          defaultSignerName={signedBy || ''}
          onClose={() => setShowSignModal(false)}
          onConfirm={(signerName) => handleConfirmSign(signerName)}
          onGenerateLink={handleGenerateLink}
        />
      )}
    </div>
  )
}
