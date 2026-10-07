import React from 'react'
import { Button } from '../common/Button'
import { FormPaperViewer } from './FormPaperViewer'
import { Kb11SignatureActions } from './Kb11SignatureActions'
import { Kb13SignatureActions } from './Kb13SignatureActions'
import { OutgoingNoticeSignature } from './OutgoingNoticeSignature'
import { FORMS_CATALOG } from '../../lib/constants'
import { getFormSignatureKind } from '../../lib/formSignature'
import { OutgoingNoticeFormNo } from '../../types/case'

interface FormSignatureModalProps {
  /** แบบ คบ. ที่กำลังลงนาม — null คือปิดโมดัล */
  formNo: number | null
  caseNo: string
  onClose: () => void
}

/**
 * ลงนามแบบ คบ. จากรายการแบบฟอร์มในแฟ้ม — เห็นฉบับพิมพ์ A4 และเซ็นในหน้าจอเดียว
 * โมดัลนี้อยู่ชั้น z-40 เพื่อให้ SignatureModal (z-50) ซ้อนขึ้นมาด้านบนได้
 */
export const FormSignatureModal: React.FC<FormSignatureModalProps> = ({ formNo, caseNo, onClose }) => {
  if (formNo === null) return null

  const kind = getFormSignatureKind(formNo)
  const meta = FORMS_CATALOG.find((f) => f.n === formNo) || FORMS_CATALOG[0]

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(4,17,36,.52)] p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`ลงนาม ${meta.code} - ${meta.t}`}
        className="ws-card flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line bg-soft px-5 py-3">
          <div className="flex min-w-0 items-center gap-2 text-[1.05rem] font-bold text-navy">
            <i className="fa-solid fa-file-signature text-blue" />
            <span>
              ลงนาม {meta.code} - {meta.t}
            </span>
          </div>
          <Button type="button" variant="icon" size="icon" aria-label="ปิด" onClick={onClose}>
            <i className="fa-solid fa-xmark text-sm" />
          </Button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* ฉบับพิมพ์ A4 ของแบบที่กำลังจะลงนาม — ตรวจทานก่อนเซ็นได้ในที่เดียว */}
          <div className="overflow-y-auto border-b border-line bg-soft p-4 lg:border-b-0 lg:border-r">
            <FormPaperViewer formId={formNo} />
          </div>

          <div className="overflow-y-auto p-4">
            {kind === 'kb6' && (
              <p className="ws-readonly text-[0.88rem] leading-relaxed text-muted">
                <i className="fa-solid fa-circle-info mr-1.5" />
                ลงนามความเห็นตามลำดับชั้นของ คบ.6 ได้จากปุ่ม "ลงนาม" ท้ายหน้ากรอกแบบ คบ.6 (/form/6) เท่านั้น
                — กรอกความเห็นของข้อที่ถึงคิวในแบบฟอร์มก่อน แล้วจึงลงนาม
              </p>
            )}
            {kind === 'outgoing' && (
              <OutgoingNoticeSignature formNo={formNo as OutgoingNoticeFormNo} caseNo={caseNo} />
            )}
            {kind === 'kb11' && <Kb11SignatureActions caseNo={caseNo} onSaved={onClose} />}
            {kind === 'kb13' && <Kb13SignatureActions caseNo={caseNo} onSaved={onClose} />}
            {!kind && (
              <p className="ws-readonly text-[0.88rem] leading-relaxed text-muted">
                <i className="fa-solid fa-circle-info mr-1.5" />
                แบบ {meta.code} ไม่มีขั้นตอนลงนามในระบบ
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
