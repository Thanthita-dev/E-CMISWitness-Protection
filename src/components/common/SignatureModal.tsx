import { Button } from "./Button"
import { SignaturePad } from "./SignaturePad"
import React, { useState } from 'react'

interface SignatureModalProps {
  isOpen: boolean
  title: string
  signerRole: string
  defaultSignerName: string
  onClose: () => void
  onConfirm: (signerName: string, signatureImage?: string) => void
  /** When provided, shows a "generate remote signing link" option instead of signing in-app right now. */
  onGenerateLink?: () => void
  /**
   * ช่องบันทึกความเห็นของผู้ลงนาม — ใช้กับการลงนามที่ระเบียบกำหนดให้ "บันทึกความเห็น" ก่อน "ลงนามรับรอง"
   * (WIT0507 ข้อ 10–13 ของ คบ.6) เมื่อ required ระบบจะไม่ให้กดยืนยันจนกว่าจะมีความเห็น
   */
  opinion?: {
    label: string
    value: string
    onChange: (value: string) => void
    required?: boolean
    placeholder?: string
  }
}

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  title,
  signerRole,
  defaultSignerName,
  onClose,
  onConfirm,
  onGenerateLink,
  opinion,
}) => {
  const [signerName, setSignerName] = useState(defaultSignerName)
  const [isCertified, setIsCertified] = useState(false)
  const [signatureImage, setSignatureImage] = useState<string | undefined>(undefined)

  if (!isOpen) return null

  const handleSave = () => {
    onConfirm(signerName, signatureImage)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,17,36,0.52)] p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="ws-card flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-line bg-[#f6f8fa] px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2 text-[1.05rem] font-bold text-navy">
            <i className="fa-solid fa-file-signature text-blue" />
            <span>{title}</span>
          </div>
          <Button onClick={onClose} variant="icon" size="icon" aria-label="ปิด" className="text-slate-500">
            <i className="fa-solid fa-xmark text-sm" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <label className="ws-label">
              ชื่อ-สกุล ผู้ลงนาม ({signerRole}) *
            </label>
            <input
              type="text"
              value={signerName}
              data-testid="signature-name-input"
              onChange={(e) => setSignerName(e.target.value)}
              className="ws-input"
            />
          </div>

          {opinion && (
            <div>
              <label htmlFor="signature-opinion-input" className="ws-label">
                {opinion.label}
                {opinion.required && ' *'}
              </label>
              <textarea
                id="signature-opinion-input"
                rows={3}
                value={opinion.value}
                placeholder={opinion.placeholder}
                data-testid="signature-opinion-input"
                onChange={(e) => opinion.onChange(e.target.value)}
                className="ws-input"
              />
              {opinion.required && !opinion.value.trim() && (
                <p className="ws-error mt-1">
                  ต้องบันทึกความเห็นก่อนจึงจะลงนามรับรองได้
                </p>
              )}
            </div>
          )}

          <SignaturePad onChange={setSignatureImage} />

          <label className="flex items-start gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isCertified}
              data-testid="signature-certify-checkbox"
              onChange={(e) => setIsCertified(e.target.checked)}
              className="ws-checkbox mt-0.5"
            />
            <span className="text-[0.88rem] leading-relaxed text-ink">
              ข้าพเจ้าขอรับรองว่าข้อมูลและข้อความข้างต้นถูกต้องตรงตามความเป็นจริงทุกประการ
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line bg-[#f6f8fa] px-5 py-3.5">
          {onGenerateLink && (
            <Button
              type="button"
              onClick={onGenerateLink}
              variant="secondary"
              size="md"
              className="mr-auto"
            >
              <i className="fa-solid fa-link" />
              สร้างลิงก์ให้เซ็นทางไกล
            </Button>
          )}
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            size="md"
          >
            ยกเลิก
          </Button>
          <Button
            type="button"
            disabled={!signerName.trim() || !isCertified || Boolean(opinion?.required && !opinion.value.trim())}
            onClick={handleSave}
            data-testid="signature-confirm-button"
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
