import React from 'react'
import type { CaseItem } from '../../types/case'
import { SARABAN_CHECKPOINT_META, SARABAN_CHECKPOINT_ORDER, currentSarabanRound, formatSarabanDate, sarabanRecordForms } from '../../lib/saraban'

/** ประวัติทะเบียนรับ-ส่งของแฟ้ม แยกตามจุดลงทะเบียน (พับเก็บได้) */
export const SarabanHistory: React.FC<{ caseItem: CaseItem; className?: string }> = ({ caseItem, className = '' }) => {
  const records = caseItem.sarabanRecords || []
  if (!records.length) return null
  return (
    <details data-testid="saraban-history" className={className}>
      <summary className="cursor-pointer text-[0.88rem] font-semibold text-navy">ประวัติทะเบียนรับ-ส่ง ({records.length} รายการ)</summary>
      <div className="mt-3 space-y-3">
        {SARABAN_CHECKPOINT_ORDER.map((point) => {
          const rows = records.filter((r) => r.checkpoint === point)
          if (!rows.length) return null
          return (
            <div key={point}>
              <h3 className="text-[0.8rem] font-semibold text-muted">{SARABAN_CHECKPOINT_META[point].label}</h3>
              <ul className="mt-1 space-y-1 text-[0.88rem] text-ink">
                {rows.map((r) => (
                  <li key={r.id} data-testid={`saraban-history-row-${point}`} className="break-words">
                    {r.recipient ? <>ถึง {r.recipient} · </> : null}{sarabanRecordForms(r).map((n) => `คบ.${n}`).join(', ')} · {SARABAN_CHECKPOINT_META[point].numberLabel} {r.number}{r.documentNumber ? ` · หนังสือ ${r.documentNumber}` : ''} · {formatSarabanDate(r.date)} {r.time} น. · {r.clerkName}
                    {r.round !== currentSarabanRound(caseItem) && <span className="text-muted"> (รอบเสนอที่ {r.round})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </details>
  )
}
