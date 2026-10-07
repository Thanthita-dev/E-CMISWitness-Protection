import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '../common/Button'
import { CaseItem, MonthlyReport, ReviewOutcome } from '../../types/case'
import { kb13DueStatus, needsReview } from '../../lib/kb13'
import { PROTECTION_REVIEW_BLOCK_DAYS } from '../../lib/episode'
import { addDays, currentReportPeriod, formatThaiDate, thaiMonthName } from '../../lib/utils'
import { REVIEW_OUTCOMES } from '../../lib/constants'
import { showToast, showConfirmAlert } from '../../lib/swal'
import { useCaseStore } from '../../store/useCaseStore'

interface ReviewBranchModalProps {
  caseItem: CaseItem
  locked: MonthlyReport
  open: boolean
  onClose: () => void
}

const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * WIT1011 — ใกล้ครบกำหนดหรือจำเป็นต้องทบทวน? แยกเป็น WIT1012 / WIT1013
 *
 * เปิดจากปุ่ม "ประเมิน" ที่แถวรอบล่าสุดใน "รอบรายงานที่ผ่านมา" แทนที่จะแปะการ์ดนี้ไว้ท้ายหน้าตลอด
 * เพราะขั้นนี้ใช้ครั้งเดียวต่อรอบตอนรอบปิดแล้วและยังไม่เปิดรอบใหม่ ไม่ใช่สิ่งที่ต้องเห็นค้างอยู่ทุกครั้ง
 *
 * โมดัลนี้เป็น "จุดแยกทาง" ไม่ใช่หน้าทำงานของ 11A/11B/11C/11D — งานจริงของแต่ละแขนงอยู่ที่หน้าของมันเอง
 * (11A/11C/11D ที่ /termination, 11B ที่แฟ้ม, WIT1149 ที่ /article14) โมดัลทำได้แค่สองอย่างคือ
 * เดินแขนง WIT1012 ให้จบในที่เดียว และส่งงานเข้า 11A แล้วชี้ปลายทางของ WIT1108-WIT1111 ให้ถูกตัว
 */
export const ReviewBranchModal: React.FC<ReviewBranchModalProps> = ({ caseItem, locked, open, onClose }) => {
  const { sendToProtectionReview, setNextReportDue, openKb13Round: openRound } = useCaseStore()
  const status = kb13DueStatus(caseItem)
  const shouldReview = needsReview(caseItem)
  const [selectedBranch, setSelectedBranch] = useState<'continue' | 'review'>(shouldReview ? 'review' : 'continue')
  const [reason, setReason] = useState(
    status.episode.atCap
      ? `ครบเพดาน ${status.episode.cap} วันแล้วแต่ยังมีภัย — ขอทบทวนเพื่อส่งต่อกรมคุ้มครองสิทธิฯ`
      : locked.nextProposal || ''
  )
  const [dueAt, setDueAt] = useState(caseItem.nextReportDueAt?.slice(0, 10) || addDays(todayIso(), 30).slice(0, 10))

  if (!open) return null

  const handoff = caseItem.reviewHandoff
  const atCap = status.episode.atCap
  /** เหลือ ≤ 7 วันก่อนครบเพดาน (รวมครบเพดานแล้ว) — บังคับทบทวนที่ 11A ก่อน ห้ามเลือก WIT1012 ต่อ (TC-122) */
  const blockContinue = status.episode.blockContinue
  const proposals = caseItem.reviewProposals || []
  const latestProposal = proposals[proposals.length - 1]
  const period = currentReportPeriod()

  /** WIT1107 — แขนงที่เลือกได้หลัง 11A เห็นชอบ พร้อมปลายทางจริงในระบบของแต่ละแขนง */
  const branches: {
    code: string
    outcome: ReviewOutcome
    to: React.ReactNode
    blocked?: boolean
  }[] = [
    {
      code: 'WIT1108',
      outcome: 'continue',
      to: <span>กลับไปรายงานผลการคุ้มครอง (หน้านี้) เพื่อกำหนดรอบ คบ.13 ถัดไป</span>,
    },
    {
      code: 'WIT1109',
      outcome: 'extend',
      blocked: atCap,
      to: atCap ? (
        <span>ทำไม่ได้ — ครบเพดาน {status.episode.cap} วันแล้ว</span>
      ) : (
        <Link to="/protection-extension/$caseNo" params={{ caseNo: caseItem.no }} className="font-bold underline">
          ขยายเวลา (คบ.14) · ขยายได้ไม่เกิน {status.episode.remaining} วัน
        </Link>
      ),
    },
    {
      code: 'WIT1110',
      outcome: 'change_method',
      to: (
        <Link to="/protection-methods" className="font-bold underline">
          เสนออนุมัติและปรับ คบ.11 — เปลี่ยนเป็นวิธีที่ 1 จึงจัดทำ/แก้ คบ.8
        </Link>
      ),
    },
    {
      code: 'WIT1111',
      outcome: 'terminate',
      to: (
        <Link to="/termination/$caseNo" params={{ caseNo: caseItem.no }} className="font-bold underline">
          จัดทำเรื่องยุติ (คบ.15) แล้วต่อคำสั่งยุติ (คบ.16–17)
        </Link>
      ),
    },
    {
      code: 'WIT1149',
      outcome: 'article14',
      to: (
        <Link to="/article14" className="font-bold underline">
          จัดทำเรื่องส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ
        </Link>
      ),
    },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,17,36,.52)] p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col ws-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line bg-soft px-5 py-3.5">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-navy-deep">
              <i className="fa-solid fa-diagram-project text-blue" />
              <span>ประเมินแนวทางหลังปิดรอบ</span>
            </div>
            <p className="mt-0.5 text-[0.8rem] text-muted">
              ใกล้ครบกำหนดหรือจำเป็นต้องทบทวน? เดินได้แขนงเดียวต่อรอบ
            </p>
          </div>
          <Button onClick={onClose} aria-label="ปิด" className="rounded-lg p-1 text-muted hover:bg-slate-200 text-[0.8rem]">
            <i className="fa-solid fa-xmark text-sm" />
          </Button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {/* ฐานตัดสินใจของทั้งสองแขนง — ยอดสะสมคิดจากวันเริ่มจริงที่ episode.ts ที่เดียวกับ 11A */}
          <div className="rounded-lg border border-line bg-soft p-3 text-[0.8rem] leading-relaxed text-slate-600">
            รอบล่าสุด งวด {thaiMonthName(locked.period)} · ความเสี่ยง {locked.riskLevel || '-'} · สะสม{' '}
            <strong>{status.episode.cumulative}</strong> วัน คงเหลือ <strong>{status.episode.remaining}</strong> วัน
            จากเพดานรวม {status.episode.cap} วัน
          </div>

          {atCap && (
            <p className="rounded-xl border border-rose-300 bg-rose-50/80 p-2.5 text-[0.8rem] leading-relaxed text-rose-900">
              <i className="fa-solid fa-ban mr-1.5" />
              ครบเพดาน {status.episode.cap} วันแล้ว ห้ามขยายด้วย คบ.14 และห้ามย้อนหลังวัน
              หากยังมีภัยให้ทบทวนผลการคุ้มครอง แล้วไปเส้นทางส่งต่อกรมคุ้มครองสิทธิฯ
            </p>
          )}

          {!atCap && blockContinue && (
            <p className="ws-callout text-[0.85rem] leading-relaxed">
              <i className="fa-solid fa-triangle-exclamation mr-1.5" />
              ยอดวันคุ้มครองสะสมเหลือ ≤ {PROTECTION_REVIEW_BLOCK_DAYS} วันก่อนครบเพดาน {status.episode.cap} วัน —
              ต้องเข้าสู่การทบทวนผลการคุ้มครองก่อนดำเนินการต่อ เลือกแขนง "ยังคุ้มครองต่อ" ไม่ได้อีก
            </p>
          )}

          {/* เลือกแขนงด้วยแท็บ — ดูได้ทีละแขนง สลับได้อิสระก่อนกดยืนยันจริง */}
          <div className="flex gap-2">
            <Button
              type="button"
              aria-label="เลือกแขนง ยังคุ้มครองต่อ"
              onClick={() => !blockContinue && setSelectedBranch('continue')}
              disabled={blockContinue}
              className={`flex-1 rounded-xl border p-3 text-left transition ${
                blockContinue
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-60'
                  : selectedBranch === 'continue'
                    ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <strong className="block text-[0.8rem] text-navy-deep">
                ยังคุ้มครองต่อ
                {!shouldReview && !blockContinue && <span className="ml-1.5 font-normal text-emerald-700">— แนะนำ</span>}
                {blockContinue && <span className="ml-1.5 font-normal text-rose-700">— ถูกบล็อก</span>}
              </strong>
              <span className="mt-1 block text-[0.8rem] text-muted">ตั้งรอบถัดไปและเปิดรอบใหม่</span>
            </Button>
            <Button
              type="button"
              aria-label="เลือกแขนง ต้องทบทวน"
              onClick={() => setSelectedBranch('review')}
              className={`flex-1 rounded-xl border p-3 text-left transition ${
                selectedBranch === 'review'
                  ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <strong className="block text-[0.8rem] text-navy-deep">
                ต้องทบทวน
                {shouldReview && <span className="ml-1.5 font-normal text-amber-700">— แนะนำ</span>}
              </strong>
              <span className="mt-1 block text-[0.8rem] text-muted">ส่งเข้าทบทวนผลการคุ้มครอง</span>
            </Button>
          </div>

          {/* ---------- WIT1012 — ยังคุ้มครองต่อ: ตั้งรอบถัดไปและเปิดรอบใหม่ให้จบในที่เดียว ---------- */}
          {selectedBranch === 'continue' && !blockContinue && (
          <section className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-3 space-y-2">
            <strong className="block text-[0.8rem] text-navy-deep">ยังคุ้มครองต่อ</strong>
            <p className="text-[0.8rem] leading-relaxed text-slate-600">
              กำหนดรอบ คบ.13 ถัดไป แล้วเปิดรอบรายงานใหม่ได้จากที่นี่เลย
              {caseItem.nextReportDueAt && (
                <span className="mt-1 block font-semibold text-slate-700">
                  ตั้งไว้แล้ว: {formatThaiDate(caseItem.nextReportDueAt)}
                </span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label="กำหนดรอบรายงานถัดไป"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="ws-input"
              />
              <Button
                type="button"
                disabled={!dueAt || Boolean(handoff)}
                onClick={() => {
                  showConfirmAlert({
                    icon: 'question',
                    title: 'ยืนยันตั้งรอบถัดไปและเปิดรอบใหม่?',
                    text: `กำหนดรอบ คบ.13 ถัดไปวันที่ ${formatThaiDate(dueAt)} แล้วเปิดรอบรายงานใหม่งวด ${thaiMonthName(period)}`,
                    showCancelButton: true,
                    confirmButtonText: 'ยืนยัน',
                    cancelButtonText: 'ยกเลิก',
                  }).then((res) => {
                    if (!res.isConfirmed) return
                    setNextReportDue(caseItem.no, new Date(dueAt).toISOString())
                    openRound(caseItem.no, {
                      period,
                      periodFrom: locked.periodTo || todayIso(),
                      periodTo: dueAt,
                      evidenceRefs: [],
                    })
                    showToast(`ตั้งรอบถัดไปและเปิดรอบรายงานงวด ${thaiMonthName(period)} แล้ว`)
                    onClose()
                  })
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                <i className="fa-solid fa-folder-plus mr-1.5" />
                ตั้งรอบถัดไปและเปิดรอบใหม่
              </Button>
            </div>
            {handoff && (
              <p className="text-[0.8rem] text-muted">
                รอบนี้เดินแขนง "ต้องทบทวน" ไปแล้ว — เดินได้แขนงเดียวต่อรอบ
              </p>
            )}
          </section>
          )}

          {/* ---------- WIT1013 — ส่งทบทวนเข้าแท็บ 11A ---------- */}
          {selectedBranch === 'review' && (
          <section className="rounded-xl border border-amber-300 bg-amber-50/60 p-3 space-y-2">
            <strong className="block text-[0.8rem] text-navy-deep">ต้องทบทวน</strong>
            <p className="text-[0.8rem] leading-relaxed text-slate-600">
              ส่ง คบ.13 ล่าสุด ผลประเมินความเสี่ยง คำสั่งปัจจุบัน และยอดวันสะสมไปทบทวนผลการคุ้มครอง
            </p>

            {handoff ? (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-[0.8rem] leading-relaxed text-emerald-900 space-y-1">
                <strong className="block">
                  <i className="fa-solid fa-paper-plane mr-1.5" />
                  ส่งทบทวนแล้วเมื่อ {handoff.at} โดย {handoff.by}
                </strong>
                <span className="block">
                  งวด {handoff.period ? thaiMonthName(handoff.period) : '-'} · ความเสี่ยง {handoff.riskLevel} · คำสั่ง{' '}
                  {handoff.orderRef} · สะสม {handoff.cumulativeDays} วัน คงเหลือ {handoff.remainingDays} วัน
                </span>
                <span className="block">เหตุผล: {handoff.reason}</span>
              </div>
            ) : (
              <>
                <label className="block">
                  <span className="ws-label">เหตุผลที่ต้องทบทวน</span>
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="ws-input w-full"
                  />
                </label>
                <Button
                  type="button"
                  disabled={!reason}
                  onClick={() => {
                    showConfirmAlert({
                      icon: 'question',
                      title: 'ยืนยันส่งเข้าทบทวนผลการคุ้มครอง?',
                      text: `ส่ง คบ.13 งวด ${thaiMonthName(locked.period)} พร้อมเหตุผล: "${reason}"`,
                      showCancelButton: true,
                      confirmButtonText: 'ยืนยัน',
                      cancelButtonText: 'ยกเลิก',
                    }).then((res) => {
                      if (!res.isConfirmed) return
                      sendToProtectionReview(caseItem.no, reason)
                      showToast('ส่งเข้าทบทวนผลการคุ้มครองแล้ว')
                    })
                  }}
                  className="rounded-lg bg-amber-600 px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-amber-700 transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <i className="fa-solid fa-arrow-right-long mr-1.5" />
                  ส่งเข้าทบทวนผลการคุ้มครอง
                </Button>
              </>
            )}
          </section>
          )}

          {/* ---------- ปลายทางของ WIT1107 หลัง 11A เห็นชอบ — โมดัลชี้ทาง ไม่ตัดสินแทน ---------- */}
          {handoff && (
            <section className="space-y-2 rounded-lg border border-line bg-blue-soft p-3">
              <strong className="block text-[0.8rem] text-navy-deep">
                <i className="fa-solid fa-signs-post mr-1.5 text-blue" />
                แนวทางที่เลือกได้หลังผู้บังคับบัญชาเห็นชอบ
              </strong>
              <p className="text-[0.8rem] leading-relaxed text-blue-900">
                จัดทำข้อเสนอและให้ผู้บังคับบัญชาตรวจที่หน้า{' '}
                <Link to="/protection-review/$caseNo" params={{ caseNo: caseItem.no }} className="font-bold underline">
                  ทบทวนผลการคุ้มครอง
                </Link>{' '}
                — เลือกแนวทางได้เมื่อข้อเสนอผ่านการตรวจแล้ว
              </p>

              {latestProposal && (
                <p className="rounded-lg border border-slate-200 bg-white p-2.5 text-[0.8rem] text-slate-700">
                  ข้อเสนอล่าสุด:{' '}
                  {REVIEW_OUTCOMES.find((o) => o.value === latestProposal.proposedOutcome)?.label ||
                    latestProposal.proposedOutcome}{' '}
                  ·{' '}
                  {latestProposal.status === 'pending'
                    ? 'รอผู้บังคับบัญชาตรวจ'
                    : latestProposal.status === 'endorsed'
                      ? 'ผ่านการตรวจแล้ว — เลือกแนวทางได้'
                      : 'ส่งคืนแก้ไข'}
                </p>
              )}

              <ul className="space-y-1.5">
                {branches.map((b) => {
                  const label = REVIEW_OUTCOMES.find((o) => o.value === b.outcome)?.label || b.outcome
                  return (
                    <li
                      key={b.code}
                      className={`rounded-lg border p-2.5 text-[0.8rem] leading-relaxed ${
                        b.blocked ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <strong className="block">
                        {label}
                      </strong>
                      {b.to}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            <Link
              to="/dossier/$caseNo"
              params={{ caseNo: caseItem.no }}
              className="min-h-[44px] rounded-lg border border-[#9aabba] bg-white px-4 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
            >
              <i className="fa-solid fa-folder-open mr-1.5" />
              เปิดแฟ้ม {caseItem.no}
            </Link>
            <Link
              to="/protection-review/$caseNo"
              params={{ caseNo: caseItem.no }}
              className="min-h-[44px] rounded-lg border border-[#9aabba] bg-white px-4 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
            >
              <i className="fa-solid fa-scale-balanced mr-1.5" />
              ทบทวนผลการคุ้มครอง
            </Link>
            <Link
              to="/termination/$caseNo"
              params={{ caseNo: caseItem.no }}
              className="min-h-[44px] rounded-lg border border-[#9aabba] bg-white px-4 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
            >
              <i className="fa-solid fa-flag-checkered mr-1.5" />
              จัดทำเรื่องยุติ / คำสั่งยุติ
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
