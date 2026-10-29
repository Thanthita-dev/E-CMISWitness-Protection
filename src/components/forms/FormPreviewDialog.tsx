import React from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../common/Button'
import { FormPaperViewer } from './FormPaperViewer'

interface FormPreviewDialogProps {
  formId: number
  caseNo?: string
  title: string
  confirmLabel: string
  onClose: () => void
  onConfirm: () => void
}

/** พรีวิวเอกสารครบทุกหน้าก่อนยืนยันบันทึก (แบบเดียวกับ "พรีวิวคำร้องก่อนยืนยัน" ของงานหมายจับ) */
export const FormPreviewDialog: React.FC<FormPreviewDialogProps> = ({ formId, caseNo, title, confirmLabel, onClose, onConfirm }) =>
  createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,17,36,0.52)] p-4 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-label={title} data-testid="form-save-preview"
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-[72rem] flex-col overflow-hidden rounded-xl bg-white shadow-[0_20px_50px_rgba(8,43,80,0.25)]">
        <div className="relative border-b border-line px-6 pb-5 pt-6 text-center">
          <h2 className="m-0 text-[clamp(1.3rem,1.1rem+0.6vw,1.75rem)] font-bold text-navy-deep">{title}</h2>
          <p className="mt-2 text-[0.95rem] text-muted">ตรวจภาพรวมเอกสารฉบับนี้ให้ครบทุกหน้า ก่อนยืนยันบันทึก</p>
          <Button onClick={onClose} variant="icon" size="icon" aria-label="ปิด" className="absolute right-4 top-4 text-slate-500">
            <i className="fa-solid fa-xmark" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#e9edf1] px-4 py-4">
          <div className="mx-auto max-w-[620px]">
            <FormPaperViewer formId={formId} caseNo={caseNo} bare preview />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 border-t border-line px-6 py-4">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>กลับไปแก้ไข</Button>
          <Button type="button" variant="primary" size="md" data-testid="form-save-preview-confirm" onClick={onConfirm}>
            <i className="fa-solid fa-check" aria-hidden="true" />{confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
