import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CaseItem, ProtectionMethodNo } from '../../types/case'
import { METHOD_LABELS, METHOD_STATUS_LABELS, hasActiveMethod } from '../../lib/episode'
import { MethodPanel } from '../protection/MethodPanels'
import { MethodProgressStepper } from '../protection/MethodProgressStepper'
import { getMethodProgress } from '../../lib/methodProgress'
import { useFormDraftStore } from '../../store/useFormDraftStore'

interface ProtectionMethodTabsCardProps {
  caseItem: CaseItem
  /** วิธีที่ถูกเลือกจากหมุดเส้นทางด้านบน — ใช้เปิดแท็บให้ตรงกันโดยไม่ต้องออกจากแฟ้ม */
  activeMethod?: ProtectionMethodNo
  onChangeMethod?: (method: ProtectionMethodNo) => void
}

/** ชื่อแท็บ (flow: 08A-1/08A-2/08A-3/08B) — วิธีที่ 1–3 อยู่ในกลุ่ม 08A ส่วนวิธีที่ 4 เป็น 08B ประสานหน่วยงานอื่น */
const TAB_CODES: Record<ProtectionMethodNo, string> = {
  1: 'วิธีที่ 1',
  2: 'วิธีที่ 2',
  3: 'วิธีที่ 3',
  4: 'วิธีที่ 4',
}

const TAB_SHORT: Record<ProtectionMethodNo, string> = {
  1: 'จัดชุดคุ้มครอง',
  2: 'จัดสถานที่ปลอดภัย',
  3: 'ปกปิดข้อมูล',
  4: 'ประสานหน่วยงานอื่น',
}

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  preparing: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  blocked: 'bg-rose-100 text-rose-800',
  ended: 'bg-slate-200 text-slate-600',
}

/**
 * ขั้นที่ 6 (08A/08B) — แผงปฏิบัติรายวิธีในแฟ้มคำร้อง
 *
 * เปิดให้เห็นเมื่อพยานลงนาม คบ.11 แล้วเท่านั้น และแสดงเฉพาะวิธีที่ติ๊กไว้ในข้อ 8.2 ของ คบ.6
 * (เส้นทางถูกเปิดอัตโนมัติที่ Kb11SignatureActions) เจ้าหน้าที่จึงกรอกข้อมูลของทุกวิธีจบได้ในแฟ้มเดียว
 */
export const ProtectionMethodTabsCard: React.FC<ProtectionMethodTabsCardProps> = ({
  caseItem,
  activeMethod,
  onChangeMethod,
}) => {
  const tracks = caseItem.methodTracks || []
  const [internalMethod, setInternalMethod] = useState<ProtectionMethodNo | undefined>(tracks[0]?.method)
  /** ขั้น "จัดทำร่าง คบ.8" ของวิธีที่ 1 อยู่ในคลังร่างแบบฟอร์ม ไม่ได้อยู่ใน track */
  const kb8Draft = useFormDraftStore((s) => s.drafts[8])
  const progressCtx = { kb8Drafted: Boolean(kb8Draft && Object.keys(kb8Draft).length > 0) }

  /** วิธีที่เลือกจากภายนอก (หมุดเส้นทาง) มาก่อนเสมอ ส่วนภายในไว้ใช้ตอนกดแท็บเอง */
  const selected = activeMethod ?? internalMethod
  const track = tracks.find((t) => t.method === selected) || tracks[0]

  /** พยานยังไม่ลงนาม คบ.11 — ยังไม่เปิดแผงปฏิบัติรายวิธีตามที่ตกลงไว้ */
  if (!caseItem.kb11Signed || tracks.length === 0) return null

  const pick = (m: ProtectionMethodNo) => {
    setInternalMethod(m)
    onChangeMethod?.(m)
  }

  return (
    <div id="protection-method-tabs" className="ws-card p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-bold">
            <i className="fa-solid fa-shield-halved text-sm" />
          </div>
          <div>
            <h2 className="text-[1.1rem] font-bold leading-snug text-navy">ปฏิบัติตามวิธีคุ้มครองที่ตกลงไว้</h2>
            <p className="text-[0.8rem] text-muted">
              พยานลงนาม คบ.11 แล้ว — แสดงเฉพาะวิธีที่เสนอไว้ในข้อ 8.2 ของ คบ.6 แต่ละวิธีเดินคู่ขนานกันได้
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/**
           * ทางออกของ 08A/08B — มีวิธีใดถึง ACTIVE แล้ว (WIT0821/0829/0837/0851) จึงเดินต่อไปแท็บ 10 ได้
           * ปุ่มนี้เป็นทางเข้าแท็บ 10 จากในแฟ้มโดยตรง ไม่ต้องรอการ์ดปฏิบัติการซึ่งเปิดเมื่อมีใบตอบรับแล้วเท่านั้น
           */}
          {hasActiveMethod(caseItem) && (
            <Link
              to="/protection-monitor"
              search={{ caseNo: caseItem.no }}
              className="inline-flex min-h-[44px] items-center justify-center gap-[0.45rem] rounded-lg bg-navy px-4 py-[0.68rem] text-[0.88rem] font-semibold text-white transition hover:bg-blue"
            >
              <i className="fa-solid fa-file-waveform" />
              ไปรายงานผลการคุ้มครอง (คบ.13)
            </Link>
          )}
          <Link
            to="/protection-methods"
            className="inline-flex min-h-[44px] items-center justify-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition hover:bg-slate-50"
          >
            <i className="fa-solid fa-diagram-project" />
            หน้าดำเนินการตามวิธีคุ้มครอง
          </Link>
        </div>
      </div>

      {/* แท็บรายวิธี — โชว์เฉพาะวิธีที่เปิดเส้นทางไว้ */}
      <div className="flex flex-wrap gap-2" role="tablist">
        {tracks.map((t) => {
          const on = t.method === track?.method
          const p = getMethodProgress(caseItem, t, progressCtx)
          return (
            <button
              key={t.method}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pick(t.method)}
              className={`flex min-h-[44px] items-center gap-2 rounded-lg border px-3.5 py-2 text-left transition ${
                on ? 'border-navy bg-blue-soft text-navy' : 'border-[#9aabba] bg-white text-ink hover:bg-slate-50'
              }`}
            >
              <span className="text-[0.8rem] font-semibold">
                {TAB_CODES[t.method]}
                <span className="ml-1.5 font-semibold">{TAB_SHORT[t.method]}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.8rem] font-semibold ${STATUS_TONE[t.status]}`}>
                {METHOD_STATUS_LABELS[t.status]}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[0.8rem] font-semibold ${
                  t.status === 'blocked'
                    ? 'bg-rose-100 text-rose-800'
                    : p.doneCount === p.total
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
                title="ขั้นที่ทำแล้ว / ขั้นทั้งหมดของวิธีนี้"
              >
                {p.doneCount}/{p.total}
              </span>
            </button>
          )
        })}
      </div>

      {track && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="text-[0.8rem] font-semibold text-navy">
              {METHOD_LABELS[track.method]}
            </div>
            {track.startedAt && (
              <div className="mt-0.5 text-[0.8rem] text-muted">เริ่มจริง {track.startedAt.slice(0, 10)}</div>
            )}
          </div>

          <MethodProgressStepper
            progress={getMethodProgress(caseItem, track, progressCtx)}
            blockedReason={track.blockedReason}
          />

          <MethodPanel caseItem={caseItem} track={track} />
        </div>
      )}
    </div>
  )
}
