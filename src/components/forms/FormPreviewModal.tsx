import { Button } from '../common/Button'
import React from 'react'
import { FormPaperViewer } from './FormPaperViewer'
import { FORMS_CATALOG } from '../../lib/constants'

interface FormPreviewModalProps {
  formId: number | null
  onClose: () => void
}

/** ดูเอกสาร A4 แบบอ่านอย่างเดียว — สำหรับผู้ที่ไม่ได้รับมอบหมายเป็นเจ้าของสำนวนนี้ */
export const FormPreviewModal: React.FC<FormPreviewModalProps> = ({ formId, onClose }) => {
  if (formId === null) return null
  const formMeta = FORMS_CATALOG.find((f) => f.n === formId) || FORMS_CATALOG[0]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,17,36,.52)] p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`ดูเอกสาร ${formMeta.code} - ${formMeta.t}`}
        className="ws-card flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line bg-soft px-5 py-3">
          <div className="flex min-w-0 items-center gap-2 text-[1.05rem] font-bold text-navy">
            <i className="fa-solid fa-file-lines text-blue" />
            <span>
              {formMeta.code} - {formMeta.t}
            </span>
          </div>
          <Button type="button" variant="icon" size="icon" aria-label="ปิด" onClick={onClose}>
            <i className="fa-solid fa-xmark text-sm" />
          </Button>
        </div>

        <div className="overflow-y-auto p-5">
          <FormPaperViewer formId={formId} />
        </div>
      </div>
    </div>
  )
}
