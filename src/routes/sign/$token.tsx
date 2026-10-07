import React, { useState } from 'react'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { Button } from '../../components/common/Button'
import { SignaturePad } from '../../components/common/SignaturePad'
import { useSignatureLinkStore } from '../../store/useSignatureLinkStore'
import { useCaseStore } from '../../store/useCaseStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { showToast } from '../../lib/swal'
import { formatThaiDateTime } from '../../lib/utils'

/** Public, no-login signing screen opened from a shared "generate signing link" — for signers outside the system. */
export const Route = createFileRoute('/sign/$token')({
  component: SignPage,
})

function StatusScreen({ icon, tone, title, description }: { icon: string; tone: string; title: string; description: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-soft p-4">
      <div className="ws-card w-full max-w-md p-6 text-center">
        <i className={`fa-solid ${icon} text-3xl ${tone} mb-3`} />
        <h1 className="mb-1 text-[1.1rem] font-bold text-navy">{title}</h1>
        <p className="text-[0.88rem] text-muted leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

function SignPage() {
  const { token } = useParams({ from: '/sign/$token' })
  const link = useSignatureLinkStore((s) => s.links[token])
  const completeLink = useSignatureLinkStore((s) => s.completeLink)
  const confirmKb1Signature = useCaseStore((s) => s.confirmKb1Signature)
  const signKb6 = useCaseStore((s) => s.signKb6)
  const signOutgoingNotice = useCaseStore((s) => s.signOutgoingNotice)
  const signDocument = useFormDraftStore((s) => s.signDocument)

  const [signerName, setSignerName] = useState(link?.defaultSignerName ?? '')
  const [isCertified, setIsCertified] = useState(false)
  const [signatureImage, setSignatureImage] = useState<string | undefined>(undefined)
  const [justSigned, setJustSigned] = useState(false)

  if (!link) {
    return (
      <StatusScreen
        icon="fa-link-slash"
        tone="text-danger"
        title="ไม่พบลิงก์เซ็นชื่อ"
        description="ลิงก์นี้อาจไม่ถูกต้อง หรือเปิดจากอุปกรณ์/เบราว์เซอร์คนละเครื่องกับที่สร้างลิงก์ (สาธิต — ยังไม่มีระบบหลังบ้านจริง) กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่"
      />
    )
  }

  if (link.target.kind === 'outgoingNotice' && (link.target.formNo === 9 || link.target.formNo === 10)) {
    return <StatusScreen icon="fa-circle-info" tone="text-warning" title="หนังสือแจ้งผลลงนามพร้อมผลพิจารณา" description="คบ.9 / คบ.10 ลงนามจำลองเฉพาะฉบับที่ตรงกับผลในชุดเสนอที่หน้าเลขาธิการ ลิงก์ลงนามเดิมนี้ไม่ใช่ช่องทางลงนามซ้ำหรือเปลี่ยนฉบับหนังสือ" />
  }

  if (justSigned || link.status === 'signed') {
    return (
      <StatusScreen
        icon="fa-circle-check"
        tone="text-success"
        title="ลงลายมือชื่อเรียบร้อยแล้ว"
        description={`ลงนามโดย ${link.signerName || signerName} เมื่อ ${formatThaiDateTime(link.signedAt ? new Date(link.signedAt) : new Date())}`}
      />
    )
  }

  const handleConfirm = () => {
    switch (link.target.kind) {
      case 'formDraft':
        signDocument(link.target.key, signerName, signatureImage)
        break
      case 'kb1Case':
        confirmKb1Signature(link.target.caseNo, signerName)
        break
      case 'kb6':
        signKb6(link.target.caseNo, link.target.role, signerName)
        break
      case 'outgoingNotice':
        signOutgoingNotice(link.target.caseNo, link.target.formNo, signerName)
        break
    }
    completeLink(token, signerName, signatureImage)
    setJustSigned(true)
    showToast('บันทึกลายมือชื่ออิเล็กทรอนิกส์แล้ว')
  }

  return (
    <div className="min-h-screen bg-soft py-8 px-4 flex items-center justify-center">
      <div className="ws-card w-full max-w-lg overflow-hidden">
        <div className="border-b border-line bg-soft px-5 py-3.5">
          <p className="ws-kicker">ลงลายมือชื่ออิเล็กทรอนิกส์</p>
          <div className="flex items-center gap-2 text-navy font-bold text-[1rem]">
            <i className="fa-solid fa-file-signature text-blue" aria-hidden="true" />
            <span>{link.title}</span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[0.88rem] text-muted leading-relaxed">
            กรุณากรอกชื่อ-สกุล วาดลายมือชื่ออิเล็กทรอนิกส์ และรับรองความถูกต้องก่อนกดยืนยันลงลายมือชื่อ
          </p>

          <div className="ws-field">
            <label className="ws-label" htmlFor="signerName">
              ชื่อ-สกุล ผู้ลงนาม ({link.signerRole}) *
            </label>
            <input
              id="signerName"
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="ws-input"
            />
          </div>

          <SignaturePad onChange={setSignatureImage} />

          <label className="flex items-start gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isCertified}
              onChange={(e) => setIsCertified(e.target.checked)}
              className="ws-checkbox mt-0.5"
            />
            <span className="text-[0.88rem] text-ink leading-relaxed">
              ข้าพเจ้าขอรับรองว่าข้อมูลและข้อความข้างต้นถูกต้องตรงตามความเป็นจริงทุกประการ
            </span>
          </label>
        </div>

        <div className="flex items-center flex-wrap justify-end gap-2.5 bg-soft px-5 py-3.5 border-t border-line">
          <Button
            type="button"
            disabled={!signerName.trim() || !isCertified}
            onClick={handleConfirm}
            variant="primary"
            size="md"
          >
            <i className="fa-solid fa-check" />
            ยืนยันลงลายมือชื่อ
          </Button>
        </div>
      </div>
    </div>
  )
}
