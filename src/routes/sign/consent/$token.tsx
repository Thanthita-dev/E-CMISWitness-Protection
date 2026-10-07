import React, { useEffect, useState } from 'react'
import { createFileRoute, useParams } from '@tanstack/react-router'
import { Button } from '../../../components/common/Button'
import { SignaturePad } from '../../../components/common/SignaturePad'
import { ConsentDocumentPaper, KB1_PAGE_COUNT } from '../../../components/forms/ConsentDocumentPaper'
import { useConsentSigningStore } from '../../../store/useConsentSigningStore'
import { useCaseStore } from '../../../store/useCaseStore'
import { useNotificationStore } from '../../../store/useNotificationStore'
import { showToast } from '../../../lib/swal'
import { effectiveStatus, formatConsentDateTime } from '../../../lib/consentSigning'

/**
 * หน้าลงลายมือชื่อยินยอมของผู้ขอคุ้มครอง (คบ.1) — เปิดจากลิงก์ ไม่ต้องเข้าระบบเจ้าหน้าที่
 * หน้าตาเดียวกับหน้า "ลงลายมือชื่ออิเล็กทรอนิกส์" (/sign/$token) แต่ต้องอ่านเอกสาร คบ.1 ฉบับที่ส่งให้ครบทุกหน้าก่อนรับรอง
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

  const [signerName, setSignerName] = useState(req?.recipient.name ?? '')
  const [page, setPage] = useState(1)
  const [seenPages, setSeenPages] = useState<Set<number>>(() => new Set([1]))
  const [fitPaper, setFitPaper] = useState(true)
  const [isCertified, setIsCertified] = useState(false)
  const [signatureImage, setSignatureImage] = useState<string | undefined>(undefined)

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

  const allPagesSeen = seenPages.size >= KB1_PAGE_COUNT
  const goPage = (n: number) => {
    setPage(n)
    setSeenPages((prev) => new Set(prev).add(n))
  }

  const blockReason = !allPagesSeen
    ? `กรุณาเปิดอ่านเอกสารให้ครบทั้ง ${KB1_PAGE_COUNT} หน้า`
    : !signerName.trim()
      ? 'กรุณากรอกชื่อ-สกุลผู้ลงนาม'
      : !signatureImage
        ? 'กรุณาวาดลายมือชื่อในกรอบ'
        : !isCertified
          ? 'กรุณาติ๊กรับรองว่าได้อ่านเอกสารและข้อมูลถูกต้อง'
          : ''

  const handleConfirm = () => {
    if (blockReason || !signatureImage) return
    if (!completeSigning(token, signatureImage, signerName.trim())) return
    /** ผลกลับเข้าระบบ: ปลดด่าน "รอพยานลงนาม คบ.1" ของแฟ้ม (เขียนสถานะเท่านั้น หน้านี้ไม่อ่านข้อมูลแฟ้ม) */
    const caseStore = useCaseStore.getState()
    const target = caseStore.cases.find((c) => c.no === req.caseNo)
    if (target?.kb1SignaturePending) caseStore.confirmKb1Signature(req.caseNo, signerName.trim())
    else caseStore.logHistory(req.caseNo, 'ผู้ขอคุ้มครองลงลายมือชื่อยินยอมใน คบ.1 ผ่านลิงก์', signerName.trim(), `เอกสารฉบับที่ ${req.version} (Prototype)`)
    useNotificationStore.getState().addNotification({
      caseNo: req.caseNo,
      type: 'consent-signed',
      toName: req.createdBy,
      channel: 'ในระบบ',
      message: `${signerName.trim()} ลงลายมือชื่อยินยอมใน คบ.1 ฉบับที่ ${req.version} ผ่านลิงก์แล้ว (สาธิต)`,
      urgency: 'ปกติ',
    })
    showToast('บันทึกลายมือชื่ออิเล็กทรอนิกส์แล้ว')
  }

  return (
    <div className="min-h-screen bg-soft py-8 px-4 flex items-center justify-center">
      <div className="ws-card w-full max-w-lg overflow-hidden" data-testid="consent-sign-form">
        <div className="border-b border-line bg-soft px-5 py-3.5">
          <p className="ws-kicker">ลงลายมือชื่ออิเล็กทรอนิกส์</p>
          <div className="flex items-center gap-2 text-navy font-bold text-[1rem]">
            <i className="fa-solid fa-file-signature text-blue" aria-hidden="true" />
            <span>ลงลายมือชื่อยินยอมเข้าสู่มาตรการคุ้มครองพยาน (คบ.1)</span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[0.88rem] text-muted leading-relaxed">
            กรุณาอ่านเอกสาร คบ.1 ให้ครบทุกหน้า กรอกชื่อ-สกุล วาดลายมือชื่ออิเล็กทรอนิกส์ และรับรองความถูกต้องก่อนกดยืนยันลงลายมือชื่อ
            <span className="block text-[0.8rem]">ลิงก์หมดอายุ {formatConsentDateTime(req.expiresAt)}</span>
          </p>

          {/* เอกสารฉบับที่ส่งให้ลงชื่อ — ข้อความเดิมของแบบฟอร์ม คบ.1 */}
          <div className="space-y-2" data-testid="consent-step-read">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="ws-label mb-0">เอกสาร คบ.1 ฉบับที่ {req.version}</span>
              <span className="text-[0.8rem] font-semibold text-muted">อ่านแล้ว {seenPages.size}/{KB1_PAGE_COUNT} หน้า</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button type="button" disabled={page <= 1} onClick={() => goPage(page - 1)} variant="secondary" size="sm" aria-label="หน้าก่อนหน้า">
                <i className="fa-solid fa-chevron-left" />
              </Button>
              {Array.from({ length: KB1_PAGE_COUNT }, (_, i) => i + 1).map((n) => (
                <Button
                  key={n}
                  type="button"
                  onClick={() => goPage(n)}
                  aria-label={`หน้า ${n}`}
                  aria-current={page === n ? 'page' : undefined}
                  variant={page === n ? 'primary' : 'secondary'}
                  size="sm"
                  className={page !== n && seenPages.has(n) ? 'border-success text-success' : ''}
                >
                  {n}
                </Button>
              ))}
              <Button type="button" disabled={page >= KB1_PAGE_COUNT} onClick={() => goPage(page + 1)} variant="secondary" size="sm" aria-label="หน้าถัดไป" data-testid="consent-next-page">
                <i className="fa-solid fa-chevron-right" />
              </Button>
              <Button type="button" onClick={() => setFitPaper((v) => !v)} aria-pressed={!fitPaper} variant="ghost" size="sm" className="ml-auto">
                <i className={`fa-solid ${fitPaper ? 'fa-magnifying-glass-plus' : 'fa-magnifying-glass-minus'}`} />
                {fitPaper ? 'ขยาย' : 'ย่อ'}
              </Button>
            </div>
            <div className="rounded-lg bg-[#525659] p-2">
              <ConsentDocumentPaper snapshot={req.snapshot} page={page} fit={fitPaper} />
            </div>
          </div>

          <div className="ws-field">
            <label className="ws-label" htmlFor="consentSignerName">
              ชื่อ-สกุล ผู้ลงนาม (ผู้ยื่นคำร้อง) *
            </label>
            <input id="consentSignerName" type="text" value={signerName} onChange={(e) => setSignerName(e.target.value)} className="ws-input" />
          </div>

          <SignaturePad onChange={setSignatureImage} />

          <label className={`flex items-start gap-2.5 pt-1 ${allPagesSeen ? 'cursor-pointer' : 'opacity-60'}`}>
            <input
              type="checkbox"
              checked={isCertified}
              disabled={!allPagesSeen}
              data-testid="consent-ack-checkbox"
              onChange={(e) => setIsCertified(e.target.checked)}
              className="ws-checkbox mt-0.5"
            />
            <span className="text-[0.88rem] text-ink leading-relaxed">
              ข้าพเจ้าได้อ่านเอกสาร คบ.1 ฉบับนี้ครบทั้ง {KB1_PAGE_COUNT} หน้าแล้ว และขอรับรองว่าข้อมูลและข้อความข้างต้นถูกต้องตรงตามความเป็นจริงทุกประการ
            </span>
          </label>
        </div>

        <div className="flex items-center flex-wrap justify-between gap-2.5 bg-soft px-5 py-3.5 border-t border-line">
          <span className="text-[0.75rem] text-muted">
            <i className="fa-solid fa-flask mr-1" />
            ข้อมูลสำหรับสาธิต · ลายมือชื่อในหน้านี้ไม่มีผลทางกฎหมาย
          </span>
          <Button type="button" disabled={Boolean(blockReason)} onClick={handleConfirm} variant="primary" size="md" data-testid="consent-sign-button" title={blockReason || undefined}>
            <i className="fa-solid fa-check" />
            ยืนยันลงลายมือชื่อ
          </Button>
          {blockReason && (
            <p className="w-full text-right text-[0.8rem] font-semibold text-warning" data-testid="consent-block-reason">
              {blockReason}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
