import { Button } from "./Button"
import { SignaturePad } from "./SignaturePad"
import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { VoiceTextarea } from './VoiceTextarea'
import { useAuthStore } from '../../store/useAuthStore'
import { demoSignature, saveSignatureFor, savedSignatureFor } from '../../lib/savedSignature'

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
  /**
   * ผู้ลงนามภายนอกที่ไม่มีบัญชีในระบบ (เช่น ผู้ขอคุ้มครองลงชื่อผ่านลิงก์)
   * ไม่มีลายมือชื่อดิจิทัล/ใบรับรอง ไม่มีลายมือชื่อที่บันทึกไว้ของบัญชี และไม่มีช่องตำแหน่ง — วาดลายมือชื่ออย่างเดียว
   */
  external?: boolean
  /** false = ปิดไม่ได้ (หน้าลงชื่อผ่านลิงก์ที่มีแค่หน้าต่างนี้) — ไม่มีปุ่มปิด/ยกเลิก */
  dismissible?: boolean
  confirmLabel?: string
  /** ข้อความใต้ชื่อผู้ลงนาม (ไม่ระบุ = คำอธิบายของลายมือชื่อตามบัญชี) */
  nameHint?: string
}

/** ปุ่มสลับสองตัวเลือกแบบเดียวกับหน้าลงนามของงานหมายจับ */
const Segmented = <T extends string>({ value, options, onChange, small }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; small?: boolean }) => (
  <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-lg bg-[#eef2f6] p-1">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={value === option.value}
        onClick={() => onChange(option.value)}
        className={`rounded-md px-3 ${small ? 'min-h-[36px] py-1 text-[0.8rem]' : 'min-h-[42px] py-1.5 text-[0.88rem]'} transition ${
          value === option.value ? 'bg-white font-semibold text-navy-deep shadow-[0_1px_3px_rgba(20,40,70,0.15)]' : 'text-[#4a5b70] hover:text-navy'
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
)

/**
 * หน้าต่างลงนาม — ใช้ลายมือชื่อที่บันทึกไว้ของบัญชีนี้ (หรือลายมือชื่อจำลอง) ลงใหม่ หรือลงนามด้วยใบรับรองดิจิทัล
 * ลายมือชื่อผูกกับบัญชีที่เข้าสู่ระบบ การแก้ชื่อในช่องไม่เปลี่ยนเจ้าของลายมือชื่อ
 */
export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  title,
  signerRole,
  defaultSignerName,
  onClose,
  onConfirm,
  onGenerateLink,
  opinion,
  external = false,
  nameHint,
  dismissible = true,
  confirmLabel = 'ยืนยันลงนาม',
}) => {
  const loginUsername = useAuthStore((s) => s.loginUsername)
  const currentRole = useAuthStore((s) => s.currentRole)
  const account = loginUsername || currentRole
  const [signerName, setSignerName] = useState(defaultSignerName)
  const [position, setPosition] = useState('')
  const [method, setMethod] = useState<'esign' | 'certificate'>('esign')
  const [version, setVersion] = useState(0)
  const stored = external ? undefined : savedSignatureFor(account)
  const saved = external ? undefined : stored?.image || demoSignature(account)
  const savedIsDemo = !stored || stored.source === 'demo'
  const [useSaved, setUseSaved] = useState(Boolean(saved))
  const [drawn, setDrawn] = useState<string | undefined>(undefined)
  const [remember, setRemember] = useState(true)
  const [pin, setPin] = useState('')
  void version

  if (!isOpen) return null

  const chosenImage = useSaved && saved ? saved : drawn
  const opinionMissing = Boolean(opinion?.required && !opinion.value.trim())
  const ready = Boolean(signerName.trim()) && (method === 'esign' ? Boolean(chosenImage) : pin.length >= 4) && !opinionMissing

  const handleSave = () => {
    if (!external && method === 'esign' && !useSaved && drawn && remember) saveSignatureFor(account, { image: drawn, source: 'drawn' })
    onConfirm(signerName.trim(), method === 'esign' ? chosenImage : undefined)
  }

  /** วางที่ระดับหน้า — ผู้เรียกบางรายอยู่ในแบบกรอกที่ซ่อนไว้ (โหมดกรอกบนเอกสาร) */
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,17,36,0.52)] p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-[42rem] flex-col overflow-hidden rounded-xl bg-white shadow-[0_20px_50px_rgba(8,43,80,0.25)]"
      >
        <div className="flex items-center justify-between gap-3 px-6 pb-2 pt-5">
          <div className="flex min-w-0 items-center gap-2.5 text-[1.05rem] font-bold text-navy-deep">
            <i className="fa-solid fa-signature" aria-hidden="true" />
            <span>{title}</span>
          </div>
          {dismissible && <Button onClick={onClose} variant="icon" size="icon" aria-label="ปิด" className="text-slate-500">
            <i className="fa-solid fa-xmark" />
          </Button>}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-5 pt-2">
          <div>
            <label htmlFor="signature-name-input" className="block text-[0.9rem] font-semibold text-ink">
              ชื่อ-สกุล ผู้ลงนาม <span className="text-danger">*</span>
            </label>
            <p className="mb-1.5 text-[0.78rem] text-muted">{nameHint ?? `ลงนามในฐานะ${signerRole} · ลายมือชื่อเป็นของบัญชีที่เข้าสู่ระบบ การแก้ชื่อไม่เปลี่ยนเจ้าของลายมือชื่อ`}</p>
            <input
              id="signature-name-input"
              type="text"
              value={signerName}
              data-testid="signature-name-input"
              onChange={(e) => setSignerName(e.target.value)}
              className="ws-input"
            />
          </div>

          {!external && <>
            <div>
              <label htmlFor="signature-position-input" className="mb-1.5 block text-[0.9rem] font-semibold text-ink">ตำแหน่ง</label>
              <input id="signature-position-input" type="text" value={position} onChange={(e) => setPosition(e.target.value)} className="ws-input" />
            </div>

            <p className="text-[0.8rem] text-muted">บัญชีผู้ลงนาม: {account}</p>
          </>}

          {opinion && (
            <div>
              <label htmlFor="signature-opinion-input" className="ws-label">
                {opinion.label}
                {opinion.required && <span className="text-danger"> *</span>}
              </label>
              <VoiceTextarea
                id="signature-opinion-input"
                rows={3}
                value={opinion.value}
                placeholder={opinion.placeholder}
                data-testid="signature-opinion-input"
                onChange={(e) => opinion.onChange(e.target.value)}
                className="ws-input"
              />
              {opinionMissing && <p className="ws-error mt-1">ต้องบันทึกความเห็นก่อนจึงจะลงนามรับรองได้</p>}
            </div>
          )}

          {!external && <Segmented
            value={method}
            onChange={setMethod}
            options={[{ value: 'esign', label: 'ลายมือชื่ออิเล็กทรอนิกส์' }, { value: 'certificate', label: 'ลายมือชื่อดิจิทัล (ใบรับรอง)' }]}
          />}

          {method === 'esign' ? (
            <>
              {saved && (
                <Segmented
                  small
                  value={useSaved ? 'saved' : 'new'}
                  onChange={(value) => setUseSaved(value === 'saved')}
                  options={[{ value: 'saved', label: savedIsDemo ? 'ใช้ลายมือชื่อจำลองของบัญชีนี้' : 'ใช้ลายมือชื่อที่บันทึกไว้' }, { value: 'new', label: 'ลงลายมือชื่อใหม่' }]}
                />
              )}
              {useSaved && saved ? (
                <div data-testid="signature-saved" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3">
                  <img src={saved} alt={`ลายมือชื่อของบัญชี ${account}`} className="h-[76px] max-w-[260px] object-contain" />
                  {savedIsDemo
                    ? <span className="text-[0.8rem] text-[#9a6a00]">ลายมือชื่อจำลอง (Demo) เฉพาะบัญชีนี้</span>
                    : <button type="button" className="text-[0.8rem] font-semibold text-danger hover:underline" onClick={() => { saveSignatureFor(account, undefined); setVersion((v) => v + 1) }}>ลบลายมือชื่อที่บันทึกไว้</button>}
                </div>
              ) : (
                <>
                  <SignaturePad onChange={setDrawn} />
                  {!external && <label className="flex cursor-pointer items-center gap-2.5 text-[0.88rem] text-ink">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="ws-checkbox" />
                    บันทึกลายมือชื่อนี้ไว้ใช้ครั้งต่อไป ไม่ต้องเซ็นใหม่
                  </label>}
                </>
              )}
            </>
          ) : (
            <div className="space-y-3 rounded-lg border border-line bg-[#f7f9fb] p-4">
              <p className="text-[0.85rem] text-ink">ใบรับรองของบัญชี {account} — ระบบออกใบรับรองให้เมื่อลงนามครั้งแรก และใช้ใบเดิมในครั้งต่อไป</p>
              <div>
                <label htmlFor="signature-pin-input" className="block text-[0.9rem] font-semibold text-ink">รหัส PIN ใบรับรอง</label>
                <p className="mb-1.5 text-[0.78rem] text-muted">อย่างน้อย 4 หลัก</p>
                <input id="signature-pin-input" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} className="ws-input" />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line px-6 py-4">
          {onGenerateLink && (
            <Button type="button" onClick={onGenerateLink} variant="secondary" size="md" className="mr-auto">
              <i className="fa-solid fa-link" />
              สร้างลิงก์ให้เซ็นทางไกล
            </Button>
          )}
          {dismissible && <Button type="button" onClick={onClose} variant="secondary" size="md">
            ยกเลิก
          </Button>}
          <Button type="button" disabled={!ready} onClick={handleSave} data-testid="signature-confirm-button" variant="primary" size="md">
            <i className="fa-solid fa-check" />
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
