import React from 'react'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { useCaseStore } from '../../store/useCaseStore'
import { CASE_CLOSED_NOTICE, isCaseClosed } from '../../lib/permissions'

/**
 * แฟ้มที่หน้าแบบฟอร์มกำลังเปิดอยู่ (จาก ?caseNo=) — ให้ช่องกรอก/แท็บไฟล์ในแบบรู้ว่าแฟ้มปิดงานคุ้มครองแล้วหรือไม่
 * ไม่ระบุ = ใช้แฟ้มที่ร่างของแบบนั้นผูกอยู่ (draftCaseNo) แทน
 */
export const FormCaseScope = React.createContext<string | undefined>(undefined)

/** WIT1148 — แบบ คบ. ฉบับนี้อยู่ในแฟ้มที่ปิดงานคุ้มครองแล้วหรือไม่ (ล็อกทั้งแฟ้ม ดู/พิมพ์/ดาวน์โหลดได้เท่านั้น) */
export const useIsFormCaseClosed = (formId: number): boolean => {
  const scopeCaseNo = React.useContext(FormCaseScope)
  const ownerCaseNo = useFormDraftStore((s) => s.draftCaseNo[formId])
  const caseNo = scopeCaseNo ?? ownerCaseNo
  return useCaseStore((s) => isCaseClosed(caseNo ? s.cases.find((c) => c.no === caseNo) : undefined))
}

/** ป้ายแจ้งแฟ้มที่ปิดงานคุ้มครองแล้ว (WIT1148) — ใช้ทั้งหน้าแฟ้มและหน้าแบบฟอร์ม */
export const CaseClosedBanner: React.FC = () => (
  <div
    data-testid="case-closed-banner"
    role="status"
    className="ws-readonly text-[0.88rem] font-semibold leading-relaxed text-ink"
  >
    <i className="fa-solid fa-lock mr-1.5" />
    {CASE_CLOSED_NOTICE}
  </div>
)
