import React from 'react'
import { FileManager } from '../common/FileManager'
import { FORMS_CATALOG } from '../../lib/constants'
import { useIsFormCaseClosed } from './FormCaseScope'

interface FormFilesPanelProps {
  /** แบบ คบ. ที่กำลังเปิดอยู่ — เป็นรากของโฟลเดอร์ที่มองเห็นในแท็บนี้ */
  formId: number
}

/**
 * แท็บ "รวมไฟล์ คบ." ในหน้ากรอกแบบฟอร์ม
 * จำกัดขอบเขตไว้ที่แบบ คบ. ฉบับที่เปิดอยู่ฉบับเดียว จึงอัปโหลดลงโฟลเดอร์ที่ยืนอยู่ได้ทันที
 * โดยไม่ต้องเลือกปลายทาง — การเลือกปลายทางมีเฉพาะตอนอัปโหลดที่รากของแฟ้ม
 */
export const FormFilesPanel: React.FC<FormFilesPanelProps> = ({ formId }) => {
  const meta = FORMS_CATALOG.find((f) => f.n === formId)
  /** WIT1148 — แฟ้มปิดงานคุ้มครองแล้ว: ดู/ดาวน์โหลดไฟล์ได้ แต่แนบ/ลบ/ย้ายไม่ได้ */
  const caseClosed = useIsFormCaseClosed(formId)

  return (
    <div className="space-y-4">
      <div className="border-b border-line pb-3">
        <h4 className="text-[1.05rem] font-bold text-navy">
          <i className="fa-solid fa-folder-open mr-1.5 text-blue" />
          ไฟล์แนบของแบบ {meta?.code || `คบ.${formId}`}
        </h4>
        <p className="text-[0.8rem] text-muted">
          จัดการไฟล์แนบของแบบฟอร์มนี้แบบโฟลเดอร์ — ลากไฟล์มาวาง ค้นหา เลือกหลายไฟล์เพื่อย้ายหรือลบได้
        </p>
      </div>

      <FileManager scope="form" formId={formId} canEdit={!caseClosed} />
    </div>
  )
}
