import React, { useEffect } from 'react'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { SignatureModal } from '../../../components/common/SignatureModal'
import { useConsentSigningStore } from '../../../store/useConsentSigningStore'
import { useCaseStore } from '../../../store/useCaseStore'
import { useNotificationStore } from '../../../store/useNotificationStore'
import { showToast } from '../../../lib/swal'
import { effectiveStatus, formatConsentDateTime } from '../../../lib/consentSigning'

/**
 * หน้าลงลายมือชื่อยินยอมของผู้ขอคุ้มครอง (คบ.1) — เปิดจากลิงก์ ไม่ต้องเข้าระบบเจ้าหน้าที่
 * ลงชื่ออย่างเดียว ไม่แสดงเอกสาร คบ. — ใช้หน้าต่างลงนามเดียวกับเจ้าหน้าที่ (ไม่มีลายมือชื่อดิจิทัล)
 * หน้านี้อ่านเฉพาะคำขอของลิงก์นี้ (snapshot เอกสาร) ไม่อ่านแฟ้มคำร้อง สำนวน หรือพยานรายอื่น
 * Prototype: ลายมือชื่อในหน้านี้ไม่มีผลทางกฎหมาย
 */
export const Route = createFileRoute('/sign/consent/$token')({
  component: ConsentSignPage,
})

function StatusScreen({ icon, tone, title, children, testId }: { icon: string; tone: string; title: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-soft p-4">
      <div className="ws-card w-full max-w-md p-6 text-center" data-testid={testId}>
        <i className={`fa-solid ${icon} text-3xl ${tone} mb-3`} />
        <h1 className="mb-1 text-[1.1rem] font-bold text-navy">{title}</h1>
        <div className="text-[0.88rem] text-muted leading-relaxed space-y-1">{children}</div>
      </div>
    </div>
  )
}

function ConsentSignPage() {
  const { token } = useParams({ from: '/sign/consent/$token' })
  const req = useConsentSigningStore((s) => s.requests[token])
  const markOpened = useConsentSigningStore((s) => s.markOpened)
  const markExpired = useConsentSigningStore((s) => s.markExpired)
  const completeSigning = useConsentSigningStore((s) => s.completeSigning)


  const status = req ? effectiveStatus(req) : undefined

  useEffect(() => {
    if (!req) return
    if (status === 'expired') markExpired(token)
    else markOpened(token)
  }, [req, status, token, markOpened, markExpired])

  if (!req) {
    return (
      <StatusScreen icon="fa-link-slash" tone="text-rose-500" title="ไม่พบลิงก์ลงชื่อ" testId="consent-not-found">
        <p>ลิงก์อาจไม่ถูกต้อง หรือเปิดจากอุปกรณ์/เบราว์เซอร์คนละเครื่องกับที่เจ้าหน้าที่สร้างลิงก์ (สาธิต — ยังไม่มีระบบหลังบ้านจริง) กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่</p>
      </StatusScreen>
    )
  }

  if (status === 'signed') {
    return (
      <StatusScreen icon="fa-circle-check" tone="text-emerald-500" title="ลงลายมือชื่อเรียบร้อยแล้ว" testId="consent-signed">
        <p>
          ลงนามโดย {req.signerName || req.recipient.name} เมื่อ <strong data-testid="consent-signed-at">{formatConsentDateTime(req.signedAt)}</strong>
        </p>
        <p>เอกสาร คบ.1 ฉบับที่ {req.version}</p>
        <p className="font-semibold text-success">เจ้าหน้าที่ได้รับข้อมูลลายมือชื่อของท่านแล้ว ท่านปิดหน้านี้ได้</p>
      </StatusScreen>
    )
  }

  if (status === 'expired') {
    return (
      <StatusScreen icon="fa-clock" tone="text-rose-500" title="ลิงก์หมดอายุแล้ว" testId="consent-expired">
        <p>ลิงก์นี้หมดอายุเมื่อ {formatConsentDateTime(req.expiresAt)} กรุณาติดต่อเจ้าหน้าที่ผู้ส่งลิงก์เพื่อขอลิงก์ใหม่</p>
      </StatusScreen>
    )
  }

  if (status === 'cancelled') {
    return (
      <StatusScreen icon="fa-ban" tone="text-slate-500" title="ลิงก์นี้ถูกยกเลิกแล้ว" testId="consent-cancelled">
        <p>เจ้าหน้าที่ยกเลิกลิงก์นี้แล้ว จึงใช้ลงชื่อไม่ได้ {req.replacedBy ? 'หากได้รับลิงก์ใหม่ กรุณาใช้ลิงก์ล่าสุด' : 'กรุณาติดต่อเจ้าหน้าที่ผู้ส่งลิงก์'}</p>
      </StatusScreen>
    )
  }

  /** ผลกลับเข้าระบบ: ปลดด่าน "รอพยานลงนาม คบ.1" ของแฟ้ม (เขียนสถานะเท่านั้น หน้านี้ไม่อ่านข้อมูลแฟ้ม) */
  const handleConfirm = (signerName: string, signatureImage?: string) => {
    if (!signerName.trim() || !signatureImage) return
    if (!completeSigning(token, signatureImage, signerName.trim())) return
    const caseStore = useCaseStore.getState()
    const target = caseStore.cases.find((c) => c.no === req.caseNo)
    if (target?.kb1SignaturePending) caseStore.confirmKb1Signature(req.caseNo, signerName.trim())
    else caseStore.logHistory(req.caseNo, 'ผู้ขอคุ้มครองลงลายมือชื่อยินยอมใน คบ.1 ผ่านลิงก์', signerName.trim(), `เอกสารฉบับที่ ${req.version}`)
    useNotificationStore.getState().addNotification({
      caseNo: req.caseNo,
      type: 'consent-signed',
      toName: req.createdBy,
      channel: 'ในระบบ',
      message: `${signerName.trim()} ลงลายมือชื่อยินยอมใน คบ.1 ฉบับที่ ${req.version} ผ่านลิงก์แล้ว`,
      urgency: 'ปกติ',
    })
    showToast('บันทึกลายมือชื่ออิเล็กทรอนิกส์แล้ว')
  }

  /** ผู้ขอคุ้มครองลงชื่ออย่างเดียว (ไม่แสดงเอกสาร คบ.) — หน้าต่างลงนามแบบเดียวกับเจ้าหน้าที่ ไม่มีลายมือชื่อดิจิทัล */
  return (
    <div className="min-h-screen bg-soft" data-testid="consent-sign-form">
      <SignatureModal
        isOpen
        external
        dismissible={false}
        title="ลงลายมือชื่อยินยอมเข้าสู่มาตรการคุ้มครองพยาน (คบ.1)"
        signerRole="ผู้ยื่นคำร้อง"
        nameHint={`ลงนามในฐานะผู้ยื่นคำร้อง · ลิงก์หมดอายุ ${formatConsentDateTime(req.expiresAt)}`}
        defaultSignerName={req.recipient.name}
        onClose={() => undefined}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
