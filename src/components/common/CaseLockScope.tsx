import React from 'react'
import { CaseItem } from '../../types/case'
import { isCaseClosed } from '../../lib/permissions'
import { CaseClosedBanner } from '../forms/FormCaseScope'
import { useAuthStore } from '../../store/useAuthStore'
import { canViewHandoffCase, handoffBlocksOperations } from '../../lib/protectionHandoff'

/**
 * WIT1148 — ครอบส่วนปฏิบัติงานของแฟ้มหนึ่ง: ถ้าปิดงานคุ้มครองแล้วจะแสดงป้ายแจ้งและปิดปุ่ม/ช่องกรอกทุกตัวด้านใน
 * (ลิงก์นำทางยังกดได้ ดู/พิมพ์/ดาวน์โหลดทำที่หน้าแฟ้มและหน้าแบบฟอร์ม) — แฟ้มที่ยังไม่ปิดแสดงตามเดิมทุกอย่าง
 * `className` คือคลาสของกล่องเนื้อหา (เช่น space-y-6) ซึ่งใช้กับ fieldset แทนเมื่อถูกล็อก เพื่อให้ระยะห่างเท่าเดิม
 */
export const CaseLockScope: React.FC<{
  caseItem?: Pick<CaseItem, 'closedAt' | 'stage' | 'protectionHandoff'> | null
  className?: string
  children: React.ReactNode
}> = ({ caseItem, className, children }) => {
  const { currentRole, currentOfficerUserId } = useAuthStore()
  if (caseItem && !canViewHandoffCase(currentRole, caseItem, currentOfficerUserId)) {
    return <div className="ws-card p-8 text-center">ไม่มีสิทธิ์เปิดข้อมูลของแฟ้มนี้ในบทบาทปัจจุบัน</div>
  }
  if (caseItem && handoffBlocksOperations(currentRole, caseItem, currentOfficerUserId)) {
    return <div className={className}>
      <p className="ws-readonly text-[0.88rem]" data-testid="handoff-readonly">ดูข้อมูลอ้างอิงได้ ผู้รับผิดชอบดำเนินการคุ้มครองต้องรับงานตามลำดับการส่งต่อก่อน</p>
      <fieldset disabled className="m-0 min-w-0 border-0 p-0">{children}</fieldset>
    </div>
  }
  if (!isCaseClosed(caseItem)) return className ? <div className={className}>{children}</div> : <>{children}</>
  return (
    <div className={className}>
      <CaseClosedBanner />
      <fieldset disabled data-testid="case-lock-scope" className={`m-0 min-w-0 border-0 p-0 ${className || ''}`}>
        {children}
      </fieldset>
    </div>
  )
}
