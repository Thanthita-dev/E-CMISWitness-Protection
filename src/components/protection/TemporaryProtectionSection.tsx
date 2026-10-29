import React from 'react'
import type { CaseItem } from '../../types/case'
import { METHOD_LABELS, METHOD_STATUS_LABELS } from '../../lib/episode'
import { formatThaiDateTime } from '../../lib/utils'

/**
 * งานคุ้มครองชั่วคราวตาม คบ.5 ที่แยกออกจากงานตามคำร้องหลักแล้ว — แสดงแบบอ่านอย่างเดียว
 * มีผลต่อจนวิธีแรกของคำร้องหลักเริ่มปฏิบัติจริง แล้วปิดเป็นประวัติ
 */
export const TemporaryProtectionSection: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const temporary = caseItem.temporaryProtection
  if (!temporary) return null
  const closed = Boolean(temporary.closedAt)
  const choiceLabel = temporary.methodChoice?.mode === 'kb4' ? 'ดำเนินการตาม คบ.4'
    : temporary.methodChoice?.mode === 'new' ? 'เลือกใหม่'
    : temporary.methodChoice?.mode === 'kb6' ? 'ดำเนินการตาม คบ.6' : undefined

  return <section className="ws-card p-5 space-y-3" data-testid="temporary-protection-section">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
      <div className="min-w-0">
        <p className="ws-kicker">คุ้มครองชั่วคราวตาม คบ.5</p>
        <h2 className="text-[1.1rem] font-bold text-navy">{caseItem.no} · {caseItem.person}</h2>
        <p className="text-[0.8rem] text-muted">
          ฐานคำสั่ง: คบ.5 (คำสั่งชั่วคราว){caseItem.fastTrack?.kb5OrderNo ? ` · เลขที่ ${caseItem.fastTrack.kb5OrderNo}` : ''}
          {choiceLabel ? ` · แนวทาง: ${choiceLabel}` : ''}
        </p>
      </div>
      <span className={`rounded-full px-[0.58rem] py-[0.28rem] text-[0.74rem] font-semibold ${closed ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-800'}`}>
        {closed ? 'ปิดแล้ว' : 'ยังมีผล'}
      </span>
    </header>
    <p className="text-[0.85rem] text-muted">
      {closed
        ? `ปิดเมื่อ ${formatThaiDateTime(temporary.closedAt!)} — ${temporary.closeReason || 'การคุ้มครองตามคำร้องหลักเริ่มปฏิบัติ'}`
        : 'มีผลต่อจนกว่าการคุ้มครองตามคำร้องหลักจะเริ่มปฏิบัติจริง — งานชุดนี้แยกจากงานตามคำร้องหลักและไม่ถูกแทนที่'}
    </p>
    {temporary.methodTracks.length > 0
      ? <ul className="grid gap-2 sm:grid-cols-2">
        {temporary.methodTracks.map((t) => <li key={t.method} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 text-sm font-bold text-navy">{METHOD_LABELS[t.method]}</span>
            <span className="shrink-0 rounded-full bg-white px-[0.58rem] py-[0.28rem] text-[0.74rem] font-semibold text-slate-700">{METHOD_STATUS_LABELS[t.status]}</span>
          </div>
          {t.method === 4 && t.coordination?.agency && <div className="mt-1 text-[0.8rem] text-muted">หน่วยงาน: {t.coordination.agency}</div>}
          {t.startedAt && <div className="mt-1 text-[0.8rem] text-muted">เริ่มจริง {formatThaiDateTime(t.startedAt)}</div>}
          {t.endedAt && <div className="text-[0.8rem] text-muted">สิ้นสุด {formatThaiDateTime(t.endedAt)}</div>}
        </li>)}
      </ul>
      : <p className="text-[0.85rem] text-muted">ไม่มีวิธีที่เปิดไว้ในงานชั่วคราว</p>}
  </section>
}
