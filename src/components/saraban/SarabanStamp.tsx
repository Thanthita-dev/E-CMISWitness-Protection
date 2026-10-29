import React from 'react'
import { useCaseStore } from '../../store/useCaseStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { FormCaseScope } from '../forms/FormCaseScope'
import type { SarabanRecord } from '../../types/case'
import { SARABAN_CHECKPOINT_META, formatSarabanDate, sarabanStampsFor } from '../../lib/saraban'

/** ตราประทับรับ/ส่งหนังสือ — หมึกน้ำเงินเข้ม ขอบ 2px เส้นประต่อท้ายค่าเหมือนตราประทับราชการ */
export const SarabanStamp: React.FC<{ record: SarabanRecord; formNo?: number }> = ({ record, formNo = record.formNo }) => {
  const meta = SARABAN_CHECKPOINT_META[record.checkpoint]
  const line = (label: string, value: string) => (
    <div className="flex items-baseline gap-1 whitespace-nowrap">
      <span>{label}</span>
      <span className="min-w-0 flex-1 border-b border-dotted border-[#1a2a6c] px-1 text-center font-bold">{value}</span>
    </div>
  )
  return (
    <div
      data-testid={`saraban-stamp-${record.checkpoint}-${formNo}`}
      className="w-[168px] -rotate-1 rounded-[3px] border-2 border-[#1a2a6c] bg-white/80 px-2 py-1 text-[11px] leading-[1.45] text-[#1a2a6c]"
    >
      <div className="mb-0.5 border-b border-[#1a2a6c] pb-0.5 text-center text-[11px] font-bold leading-tight">{record.unitName}</div>
      {record.recipient && <div className="truncate text-center text-[10px]" title={record.recipient}>ถึง {record.recipient}</div>}
      {line(meta.numberLabel, record.number)}
      {line('วันที่', formatSarabanDate(record.date))}
      {line('เวลา', `${record.time.replace(':', '.')} น.`)}
    </div>
  )
}

/** ตราประทับทุกจุดของ คบ. ฉบับนั้น วางมุมขวาบนของหน้า 1 — overlay ไม่กระทบขอบกระดาษของแบบ */
export const SarabanStampStack: React.FC<{ caseNo?: string; formNo: number; originalDocument?: boolean }> = ({ caseNo, formNo, originalDocument = false }) => {
  const scopeCaseNo = React.useContext(FormCaseScope)
  const ownerCaseNo = useFormDraftStore((s) => s.draftCaseNo[formNo])
  const resolved = caseNo ?? scopeCaseNo ?? ownerCaseNo
  const caseItem = useCaseStore((s) => (resolved ? s.cases.find((c) => c.no === resolved) : undefined))
  const appealDocument = (formNo === 3 || formNo === 6) && Boolean(caseItem?.appealFolder?.addendum)
  const stampCase = caseItem && appealDocument ? {
    ...caseItem,
    sarabanRecords: caseItem.sarabanRecords?.filter((record) => {
      const appealRecord = Boolean(record.subject?.includes('อุทธรณ์'))
      return originalDocument ? !appealRecord : appealRecord
    }),
  } : caseItem
  const stamps = sarabanStampsFor(stampCase, formNo)
  if (stamps.length === 0) return null
  return (
    <div data-testid="saraban-stamp-stack" className="pointer-events-none absolute right-3 top-2 z-10 flex flex-col items-end gap-1.5 print:right-3">
      {stamps.map((r) => <SarabanStamp key={r.id} record={r} formNo={formNo} />)}
    </div>
  )
}
