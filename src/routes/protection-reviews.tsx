import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { useCaseStore } from '../store/useCaseStore'
import { REVIEW_OUTCOMES } from '../lib/constants'
import { thaiMonthName } from '../lib/utils'

export const Route = createFileRoute('/protection-reviews')({
  component: ProtectionReviewListPage,
})

/**
 * รายการทบทวน — สำนวนที่ส่งเข้าแท็บ 11A จาก WIT1013 (แขนง "ต้องทบทวน" ใน WIT1011)
 * และยังไม่ได้เลือกแนวทาง (WIT1107) ให้จบ — กดเข้ารายการเพื่อเดินขั้น 11A ต่อจนถึงเลือกแนวทาง
 */
function ProtectionReviewListPage() {
  const cases = useCaseStore((s) => s.cases)

  const pending = cases.filter((c) => {
    if (!c.reviewHandoff) return false
    const proposals = c.reviewProposals || []
    const latest = proposals[proposals.length - 1]
    return !latest?.appliedOutcome
  })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="งานคุ้มครองพยาน · ทบทวน"
        title="รายการทบทวน"
        description="สำนวนที่ส่งทบทวนจากรายงานผลการคุ้มครอง รอเลือกแนวทางก่อนไปต่อที่ขยายเวลา จัดทำเรื่องยุติ หรือส่งต่อกรมคุ้มครองสิทธิฯ"
      />

      {pending.length === 0 ? (
        <div className="ws-card border-dashed p-10 text-center text-[0.88rem] text-muted">
          ยังไม่มีสำนวนที่ส่งเข้าทบทวน
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((c) => {
            const handoff = c.reviewHandoff!
            const proposals = c.reviewProposals || []
            const latest = proposals[proposals.length - 1]
            const statusLabel = !latest
              ? 'รอจัดทำข้อเสนอผลทบทวน'
              : latest.status === 'pending'
                ? 'รอผู้บังคับบัญชาตรวจข้อเสนอ'
                : latest.status === 'returned'
                  ? 'ส่งคืนแก้ไขข้อเสนอ'
                  : 'ผ่านการตรวจแล้ว — รอเลือกแนวทาง'

            return (
              <Link
                key={c.no}
                to="/protection-review/$caseNo"
                params={{ caseNo: c.no }}
                className="block ws-card p-5 transition hover:border-navy"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-bold text-navy">
                      {c.no} · {c.person}
                    </h3>
                    <p className="mt-0.5 text-sm text-muted">
                      งวด {handoff.period ? thaiMonthName(handoff.period) : '-'} · ความเสี่ยง {handoff.riskLevel || '-'} ·
                      สะสม {handoff.cumulativeDays} วัน คงเหลือ {handoff.remainingDays} วัน
                    </p>
                  </div>
                  <span className="whitespace-nowrap rounded-full px-[0.58rem] py-[0.28rem] text-[0.74rem] font-semibold bg-warning-soft text-warning">
                    {statusLabel}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">เหตุผลที่ต้องทบทวน: {handoff.reason}</p>
                {latest && (
                  <p className="mt-1 text-[0.8rem] text-muted">
                    ข้อเสนอล่าสุด: {REVIEW_OUTCOMES.find((o) => o.value === latest.proposedOutcome)?.label}
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
