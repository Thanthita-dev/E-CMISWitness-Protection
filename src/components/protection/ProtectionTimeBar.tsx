import type { CaseItem } from '../../types/case'
import { protectionMonths, monthLabel, calendarMonthsBetween } from '../../lib/protectionMonths'
import { formatThaiDate } from '../../lib/utils'
import { protectionSchedule } from '../../lib/protectionSchedule'
import { protectionResponsibleName } from '../../lib/protectionHandoff'

export function ProtectionTimeBar({ caseItem }: { caseItem: CaseItem }) {
  const co = caseItem.methodTracks?.find((t) => t.method === 4)?.coordination
  const { actualStart: start, end, provisional } = protectionSchedule(caseItem)
  const months = protectionMonths(caseItem)
  const span = start && end ? Math.max(1, end.getTime() - start.getTime()) : 1
  const elapsed = start ? Math.max(0, Date.now() - start.getTime()) : 0
  const percent = start && end ? Math.max(0, Math.min(100, Math.round(elapsed / span * 100))) : 0
  const remaining = end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000)) : null
  const endMonth = end ? end.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) : 'รอบันทึกวันเริ่มจริง'
  return <section className="rounded-xl border border-line bg-paper p-5 space-y-5" data-testid="protection-time-bar">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="ws-kicker">ระยะเวลาคุ้มครอง</p><h3 className="mt-1 text-2xl font-bold text-navy">{months ? monthLabel(months) : '—'}</h3></div>
      <span className="rounded-full bg-soft px-3 py-2 text-sm font-semibold text-navy">{!start ? 'รอเริ่มคุ้มครอง' : remaining === 0 ? 'ครบกำหนดคุ้มครอง' : `เหลือ ${monthLabel(end ? calendarMonthsBetween(new Date(), end) : 0)}`}</span>
    </div>
    <div>
      <div role="progressbar" aria-label="ระยะเวลาคุ้มครองที่ผ่านไป" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
        aria-valuetext={start ? `ผ่านไป ${percent}%` : 'ยังไม่เริ่มคุ้มครอง'} className="h-5 overflow-hidden rounded-full bg-soft">
        <div className="h-full rounded-full bg-blue" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm text-muted"><span>เริ่ม {start ? formatThaiDate(start) : 'ยังไม่บันทึก'}</span><span>{provisional ? 'กำหนดสิ้นสุดเบื้องต้น' : 'สิ้นสุด'} {end ? formatThaiDate(end) : 'ยังไม่กำหนด'}</span></div>
    </div>
    <dl className="grid gap-4 sm:grid-cols-2">
      <div><dt className="ws-label">เดือนที่สิ้นสุดการคุ้มครอง</dt><dd className="mt-1 font-bold text-navy">{endMonth}</dd></div>
      <div><dt className="ws-label">คุ้มครองโดย</dt><dd className="mt-1 font-bold text-navy">{co?.agency || protectionResponsibleName(caseItem) || 'ยังไม่ระบุ'}</dd>
        {co?.contactPerson && <p className="mt-1 text-sm text-muted">ผู้ประสานงาน: {co.contactPerson}{co.contactPhone ? ` · ${co.contactPhone}` : ''}</p>}</div>
    </dl>
    {provisional && end && <p className="text-sm text-muted">กำหนดเบื้องต้นจากวันลงนามอนุมัติและระยะเวลาที่อนุมัติ</p>}
  </section>
}
