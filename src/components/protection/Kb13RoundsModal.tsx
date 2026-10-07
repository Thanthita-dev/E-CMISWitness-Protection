import React from 'react'
import { Button } from '../common/Button'
import { Badge } from '../common/Badge'
import { CaseItem, MonthlyReport } from '../../types/case'
import { METHOD_LABELS } from '../../lib/episode'
import { formatThaiDate, thaiMonthName } from '../../lib/utils'

interface Kb13RoundsModalProps {
  caseItem: CaseItem
  open: boolean
  onClose: () => void
}

/**
 * รอบรายงาน คบ.13 ที่ผ่านมา — เปิดดูจากแถว คบ.13 ในแฟ้มได้เลย ไม่ต้องเข้าหน้าแท็บ 10
 *
 * อ่านอย่างเดียวโดยตั้งใจ: การจัดทำ/ลงนาม/ปิดรอบยังทำที่หน้า protection-monitor ที่เดียว
 * เพื่อไม่ให้มีสองทางแก้ข้อมูลรอบเดียวกัน หน้านี้แค่ให้เห็นว่าส่งอะไรไปแล้วบ้าง
 */
export const Kb13RoundsModal: React.FC<Kb13RoundsModalProps> = ({ caseItem, open, onClose }) => {
  if (!open) return null

  /** รอบล่าสุดอยู่บนสุด — คนเปิดดูมักถามถึงรอบที่เพิ่งส่งไป */
  const rounds = [...(caseItem.monthlyReports || [])].reverse()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,17,36,.52)] p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col ws-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line bg-soft px-5 py-3.5">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-navy-deep">
              <i className="fa-solid fa-clock-rotate-left text-blue" />
              <span>รอบรายงาน คบ.13 ที่ผ่านมา</span>
            </div>
            <p className="mt-0.5 text-[0.8rem] text-muted">
              {caseItem.no} · {caseItem.person} — ทั้งหมด {rounds.length} รอบ (ดูอย่างเดียว)
            </p>
          </div>
          <Button onClick={onClose} aria-label="ปิด" className="rounded-lg p-1 text-muted hover:bg-slate-200 text-[0.8rem]">
            <i className="fa-solid fa-xmark text-sm" />
          </Button>
        </div>

        <div className="overflow-y-auto p-5">
          {rounds.length === 0 ? (
            <div className="ws-card border-dashed p-10 text-center text-[0.88rem] text-muted">
              ยังไม่มีรอบรายงาน คบ.13 ในแฟ้มนี้ — รอบแรกจะเกิดขึ้นเมื่อเปิดรอบที่หน้าติดตามและรายงานผล
            </div>
          ) : (
            <ol className="space-y-3">
              {rounds.map((r) => (
                <Kb13RoundRow key={r.id} round={r} />
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}

/** รายละเอียดหนึ่งรอบ — ครบทุกช่องที่กรอกไว้ตอนจัดทำ (WIT1005-WIT1012) โดยไม่มีปุ่มแก้ไข */
const Kb13RoundRow: React.FC<{ round: MonthlyReport }> = ({ round }) => (
  <li className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong className="text-[0.8rem] font-bold text-navy-deep">
        งวด {thaiMonthName(round.period)}
        {round.periodFrom && round.periodTo
          ? ` · ${formatThaiDate(round.periodFrom)}–${formatThaiDate(round.periodTo)}`
          : ''}
      </strong>
      <Badge variant={round.lockedAt ? 'success' : 'warning'}>
        {round.lockedAt ? 'ปิดรอบแล้ว' : 'กำลังดำเนินการ'}
      </Badge>
    </div>

    <p className="text-[0.8rem] leading-relaxed text-slate-600">{round.summary || 'ยังไม่ได้จัดทำเนื้อรายงาน'}</p>

    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-[0.8rem] text-slate-600 sm:grid-cols-2">
      <Field label="คำสั่งที่อ้าง" value={round.orderRef} />
      <Field label="จำนวนวันตามคำสั่ง" value={round.orderDays ? `${round.orderDays} วัน` : undefined} />
      <Field label="ผู้ปฏิบัติ" value={round.operators} />
      <Field
        label="วิธีที่ปฏิบัติจริง"
        value={round.methods?.length ? round.methods.map((m) => METHOD_LABELS[m]).join(' · ') : undefined}
      />
      <Field label="ความเสี่ยงล่าสุด" value={round.riskLevel} />
      <Field label="เหตุสำคัญในรอบ" value={`${round.incidentCount ?? 0} รายการ`} />
      <Field label="ปัญหา/อุปสรรค" value={round.issues} />
      <Field label="ข้อเสนอรอบถัดไป" value={round.nextProposal} />
      <Field
        label="เจ้าหน้าที่ลงนาม"
        value={round.officerSignedAt ? `${round.officerSignedBy || '-'} · ${round.officerSignedAt}` : undefined}
      />
      <Field
        label="พยานลงนามรับรอง"
        value={round.witnessSignedAt ? `${round.witnessSignedBy || '-'} · ${round.witnessSignedAt}` : undefined}
      />
      <Field
        label="ตรวจรับรายงาน"
        value={round.reviewedAt ? `${round.reviewedBy || '-'} · ${round.reviewedAt}` : undefined}
      />
      <Field label="ล็อกรอบเมื่อ" value={round.lockedAt} />
      <Field label="กำหนดรอบถัดไป" value={round.nextDueAt ? formatThaiDate(round.nextDueAt) : undefined} />
      <Field label="ส่งรายงานโดย" value={round.submittedBy ? `${round.submittedBy} · ${round.submittedAt}` : undefined} />
    </dl>

    {Boolean(round.evidenceRefs?.length) && (
      <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
        {round.evidenceRefs?.map((ref) => (
          <span key={ref} className="rounded-md bg-slate-100 px-2 py-0.5 text-[0.8rem] text-slate-600">
            <i className="fa-solid fa-paperclip mr-1 text-[0.8rem]" />
            {ref}
          </span>
        ))}
      </div>
    )}
  </li>
)

/** ช่องที่ยังไม่ได้กรอกไม่ต้องแสดง — รายการจะได้ไม่เต็มไปด้วยขีดกลาง */
const Field: React.FC<{ label: string; value?: string | number }> = ({ label, value }) =>
  value ? (
    <div className="flex gap-1.5">
      <dt className="shrink-0 text-muted">{label}:</dt>
      <dd className="text-slate-700">{value}</dd>
    </div>
  ) : null
