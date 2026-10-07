import React from 'react'
import { createFileRoute, Link, Outlet, useMatches } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { CaseItem } from '../types/case'
import { useCaseStore } from '../store/useCaseStore'
import { PROTECTION_TOTAL_CAP_DAYS } from '../lib/constants'
import { deriveEpisode, summarizeEpisode } from '../lib/episode'
import { formatThaiDate } from '../lib/utils'

export const Route = createFileRoute('/termination')({
  component: TerminationLayout,
})

/**
 * แท็บ 11C/11D — หน้ารวมสำนวนที่อยู่ในขั้นทบทวนหรือยุติ
 * งานจริงของแต่ละสำนวนอยู่ที่ /termination/$caseNo เพื่อให้เดินเส้นทางต่อจาก 11A ได้ตรงตัว
 */
function TerminationLayout() {
  const matches = useMatches()
  const onDetail = matches.some((m) => m.routeId === '/termination/$caseNo')
  return onDetail ? <Outlet /> : <TerminationListPage />
}

/** ขั้นตอนที่สำนวนไปถึงแล้วในเส้นทาง 11C → 11D */
function terminationStep(c: CaseItem): { label: string; tone: string } {
  if (c.closedAt && c.stage === 'terminated') return { label: 'ปิดงานแล้ว', tone: 'bg-slate-100 text-slate-600' }
  if (c.stage === 'appeal' && c.appealAgainst === 'kb17')
    return { label: 'อยู่ระหว่างอุทธรณ์', tone: 'bg-warning-soft text-warning' }
  if (c.kb17?.deliveredAt) return { label: 'อยู่ในกรอบอุทธรณ์', tone: 'bg-warning-soft text-warning' }
  if (c.kb17?.dispatchedAt) return { label: 'นำส่ง คบ.17 แล้ว', tone: 'bg-blue-100 text-blue-800' }
  if (c.kb16?.signedAt) return { label: 'ลงนาม คบ.16 แล้ว', tone: 'bg-blue-100 text-blue-800' }
  if (c.kb16) return { label: 'ร่าง คบ.16 · รอลงนาม', tone: 'bg-blue-100 text-blue-800' }
  if (c.terminationApproval && !c.terminationApproval.approved)
    return { label: 'ไม่อนุมัติให้ยุติ · คุ้มครองต่อ', tone: 'bg-danger-soft text-danger-dark' }
  if (c.kb15?.status === 'endorsed') return { label: 'เสนอผู้มีอำนาจ', tone: 'bg-blue-100 text-blue-800' }
  if (c.kb15) return { label: `คบ.15 ฉบับที่ ${c.kb15.version} · ${c.kb15.status === 'returned' ? 'ส่งคืนแก้' : 'รอตรวจ'}`, tone: 'bg-slate-100 text-slate-700' }
  if (c.terminationTrigger) return { label: 'รับเหตุยุติแล้ว', tone: 'bg-slate-100 text-slate-700' }
  return { label: 'ยังไม่เริ่มเรื่องยุติ', tone: 'bg-slate-100 text-slate-600' }
}

function TerminationListPage() {
  const cases = useCaseStore((s) => s.cases)

  const active = cases.filter((c) =>
    ['protection', 'termination_review', 'termination_order', 'terminated', 'method_operation', 'appeal'].includes(c.stage)
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="งานคุ้มครองพยาน · ยุติและปิดงาน"
        title="ยุติการคุ้มครองและปิดงาน"
        description={`จัดทำ คบ.15 ออกคำสั่ง คบ.16 แจ้ง คบ.17 และปิดงานเมื่อพ้นกรอบอุทธรณ์ (เพดานรวม ${PROTECTION_TOTAL_CAP_DAYS} วัน)`}
      />

      {active.length === 0 ? (
        <div className="ws-card border-dashed p-10 text-center text-[0.88rem] text-muted">
          ยังไม่มีสำนวนที่อยู่ในขั้นทบทวนหรือยุติ
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((c) => {
            const summary = summarizeEpisode(c.episode || deriveEpisode(c))
            const step = terminationStep(c)
            return (
              <Link
                key={c.no}
                to="/termination/$caseNo"
                params={{ caseNo: c.no }}
                className="flex flex-col gap-2 ws-card p-4 transition hover:border-blue hover:shadow sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h3 className="text-base font-bold text-navy">
                    {c.no} · {c.person}
                  </h3>
                  <p className="text-[0.8rem] text-muted">
                    {c.status} · สะสม {summary.cumulative}/{summary.cap} วัน
                    {summary.remaining > 0 ? ` · คงเหลือ ${summary.remaining} วัน` : ' · ครบเพดานแล้ว'}
                    {c.protectionEndAt ? ` · สิ้นสุด ${formatThaiDate(c.protectionEndAt)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-[0.58rem] py-[0.28rem] text-[0.74rem] font-semibold ${step.tone}`}>{step.label}</span>
                  <i className="fa-solid fa-chevron-right text-[0.8rem] text-muted" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
