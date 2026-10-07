import { legacyMonthLabel, monthLabel, protectionMonths } from '../lib/protectionMonths'
import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { CaseItem } from '../types/case'
import { useCaseStore } from '../store/useCaseStore'
import { PROTECTION_TOTAL_CAP_DAYS } from '../lib/constants'
import { deriveEpisode, summarizeEpisode } from '../lib/episode'
import { formatThaiDate } from '../lib/utils'

export const Route = createFileRoute('/protection-extensions')({
  component: ProtectionExtensionListPage,
})

/** ขั้นที่สำนวนไปถึงในเส้นทาง 11B */
function extensionStep(c: CaseItem): { label: string; tone: string } {
  const requests = c.extensionRequests || []
  const latest = requests[requests.length - 1]
  if (!latest) return { label: 'รอจัดทำ คบ.14', tone: 'bg-warning-soft text-warning' }
  switch (latest.status) {
    case 'submitted':
      return { label: `คบ.14 v${latest.version || 1} · รอผู้ตรวจ`, tone: 'bg-slate-100 text-slate-700' }
    case 'returned':
      return { label: `คบ.14 v${latest.version || 1} · ส่งกลับแก้`, tone: 'bg-danger-soft text-danger-dark' }
    case 'pending':
      return { label: 'เสนอตามลำดับชั้น · รออนุมัติ', tone: 'bg-blue-100 text-blue-800' }
    case 'approved':
      return { label: `อนุมัติขยาย ${latest.durationMonths ? monthLabel(latest.durationMonths) : legacyMonthLabel(latest.durationDays)}`, tone: 'bg-success-soft text-success-dark' }
    default:
      return { label: 'ไม่อนุมัติ · คงคำสั่งเดิม', tone: 'bg-danger-soft text-danger-dark' }
  }
}

/**
 * แท็บ 11B — รายการสำนวนที่อยู่ในเส้นทางขยายระยะเวลา (คบ.14)
 * เข้าเกณฑ์เมื่อ 11A เลือกแนวทาง "ขยายเวลา" (WIT1109) หรือมีคำขอ คบ.14 ค้างอยู่แล้ว
 */
function ProtectionExtensionListPage() {
  const cases = useCaseStore((s) => s.cases)

  const pending = cases.filter((c) => {
    if ((c.extensionRequests || []).length > 0) return true
    const proposals = c.reviewProposals || []
    return proposals[proposals.length - 1]?.appliedOutcome === 'extend'
  })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="งานคุ้มครองพยาน · ขยายเวลา"
        title="ขยายระยะเวลาการคุ้มครอง (คบ.14)"
        description={`สำนวนที่รับผล "ขยายเวลา" จากการทบทวนผลการคุ้มครอง จัดทำ คบ.14 ตรวจเอกสาร และเสนอตามลำดับชั้น (เพดานรวม 6 เดือน)`}
      />

      {pending.length === 0 ? (
        <div className="ws-card border-dashed p-10 text-center text-[0.88rem] text-muted">
          ยังไม่มีสำนวนที่อยู่ในเส้นทางขยายระยะเวลา
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((c) => {
            const summary = summarizeEpisode(c.episode || deriveEpisode(c))
            const step = extensionStep(c)
            const pct = Math.min(100, Math.round((summary.cumulative / summary.cap) * 100))
            return (
              <Link
                key={c.no}
                to="/protection-extension/$caseNo"
                params={{ caseNo: c.no }}
                className="block ws-card p-5 transition hover:border-navy"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-bold text-navy">
                      {c.no} · {c.person}
                    </h3>
                    <p className="mt-0.5 text-sm text-muted">
                      สะสม {Number((summary.cumulative / summary.cap * 6).toFixed(1))} / 6 เดือน
                      {c.protectionEndAt ? ` · คำสั่งเดิมสิ้นสุด ${formatThaiDate(c.protectionEndAt)}` : ''}
                    </p>
                  </div>
                  <span className={`whitespace-nowrap rounded-full px-[0.58rem] py-[0.28rem] text-[0.74rem] font-semibold ${step.tone}`}>
                    {step.label}
                  </span>
                </div>

                {/* WIT1116 — เห็นระยะห่างจากเพดานได้ตั้งแต่หน้ารายการ */}
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full transition-all ${summary.atCap ? 'bg-rose-500' : summary.nearCap ? 'bg-amber-500' : 'bg-blue'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {summary.atCap && (
                  <p className="mt-1.5 text-[0.8rem] font-bold text-rose-700">
                    ครบเพดานแล้ว — ห้ามขยายด้วย คบ.14
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
