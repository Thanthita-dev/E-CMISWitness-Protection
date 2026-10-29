import React, { useState } from 'react'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { SignatureModal } from '../../components/common/SignatureModal'
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

  const [signedName, setSignedName] = useState('')
  const [justSigned, setJustSigned] = useState(false)

  if (!link) {
    return (
      <StatusScreen
        icon="fa-link-slash"
        tone="text-danger"
        title="ไม่พบลิงก์เซ็นชื่อ"
        description="ลิงก์นี้อาจไม่ถูกต้อง หรือเปิดจากอุปกรณ์/เบราว์เซอร์คนละเครื่องกับที่สร้างลิงก์ กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่"
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
        description={`ลงนามโดย ${link.signerName || signedName} เมื่อ ${formatThaiDateTime(link.signedAt ? new Date(link.signedAt) : new Date())}`}
      />
    )
  }

  const handleConfirm = (signerName: string, signatureImage?: string) => {
    if (!signerName.trim()) return
    switch (link.target.kind) {
      case 'formDraft':
        signDocument(link.target.key, signerName, signatureImage, link.target.caseNo)
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
    setSignedName(signerName)
    setJustSigned(true)
    showToast('บันทึกลายมือชื่ออิเล็กทรอนิกส์แล้ว')
  }

  /** ผู้ลงนามนอกระบบลงชื่ออย่างเดียว — หน้าต่างลงนามแบบเดียวกับเจ้าหน้าที่ ไม่มีลายมือชื่อดิจิทัล */
  return (
    <div className="min-h-screen bg-soft" data-testid="remote-sign-form">
      <SignatureModal
        isOpen
        external
        dismissible={false}
        title={link.title}
        signerRole={link.signerRole}
        nameHint={`ลงนามในฐานะ${link.signerRole}`}
        defaultSignerName={link.defaultSignerName}
        onClose={() => undefined}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
