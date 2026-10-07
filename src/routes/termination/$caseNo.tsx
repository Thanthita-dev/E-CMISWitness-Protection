import React from 'react'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { BackLink } from '../../components/common/BackLink'
import { DetailHeaderCard } from '../../components/common/DetailHeaderCard'
import { CurrentStepCard } from '../../components/common/CurrentStepCard'
import { NumberedStepper, type StepperStep } from '../../components/common/NumberedStepper'
import { Kb15Section } from '../../components/protection/Kb15Section'
import { Kb16Section } from '../../components/protection/Kb16Section'
import { Kb17Section } from '../../components/protection/Kb17Section'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { deriveEpisode, summarizeEpisode } from '../../lib/episode'
import { getTerminationProgress } from '../../lib/terminationProgress'
import { formatThaiDate } from '../../lib/utils'
import { CaseLockScope } from '../../components/common/CaseLockScope'

export const Route = createFileRoute('/termination/$caseNo')({
  component: TerminationCasePage,
})

/**
 * แท็บ 11C → 11D ของสำนวนเดียว
 * 11C จัดทำเรื่องยุติ (คบ.7/คบ.15) → 11D คำสั่งยุติ (คบ.16) แจ้งผล (คบ.17) อุทธรณ์ และปิดงาน
 */
function TerminationCasePage() {
  const { caseNo } = useParams({ from: '/termination/$caseNo' })
  const { currentRole } = useAuthStore()
  const caseItem = useCaseStore((s) => s.cases.find((c) => c.no === caseNo))

  if (!caseItem) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-lg font-bold text-slate-700">ไม่พบข้อมูลแฟ้มคำร้อง {caseNo}</h2>
        <Link to="/termination" className="text-sm font-semibold text-blue mt-2 inline-block hover:underline">
          กลับรายการยุติการคุ้มครอง
        </Link>
      </div>
    )
  }

  const summary = summarizeEpisode(caseItem.episode || deriveEpisode(caseItem))
  const progress = getTerminationProgress(caseItem)
  const currentStep = progress.steps[progress.doneCount]
  const termSteps: StepperStep[] = progress.steps.map((st, i) => ({
    key: st.code,
    label: st.label,
    sublabel: i === progress.blockedIndex ? 'ค้างอยู่' : undefined,
    state: st.done && i < progress.doneCount ? 'done' : i === progress.doneCount ? 'current' : 'pending',
  }))

  return (
    <CaseLockScope caseItem={caseItem} className="space-y-6">
      <BackLink to="/termination">กลับรายการยุติการคุ้มครอง</BackLink>

      <DetailHeaderCard
        kicker="ยุติการคุ้มครองและปิดงาน"
        refNo={caseItem.no}
        title={`ยุติการคุ้มครองและปิดงาน — ${caseItem.person}`}
        meta={['จัดทำ คบ.15 ออกคำสั่ง คบ.16 แจ้ง คบ.17 และปิดงานเมื่อพ้นกรอบอุทธรณ์']}
        status={<span className="ws-status">{caseItem.status}</span>}
        owner={`ผู้รับผิดชอบ: ${caseItem.owner}`}
      />

      {/* ขั้นตอนที่สำนวนเดินมาถึงตลอดเส้น 11C → 11D — อ่านอย่างเดียว กดไม่ได้ */}
      <CurrentStepCard
        current={currentStep?.label ?? 'ปิดงานคุ้มครองแล้ว'}
        next={progress.steps[progress.doneCount + 1]?.label}
        index={Math.min(progress.doneCount + 1, progress.total)}
        total={progress.total}
        caption={[
          `ความคืบหน้าการยุติการคุ้มครอง · ${progress.doneCount}/${progress.total} ขั้น`,
          progress.blockedReason,
        ]}
      >
        <NumberedStepper steps={termSteps} ariaLabel="ความคืบหน้าการยุติการคุ้มครอง" />
      </CurrentStepCard>

      {/* WIT1124 — ฐานข้อมูลของสำนวนที่รับเข้ากระบวนการยุติ */}
      <div className="rounded-lg border border-line bg-soft p-3 text-[0.8rem] leading-relaxed text-slate-600">
        สถานะ {caseItem.status} · สะสม {summary.cumulative}/{summary.cap} วัน
        {summary.remaining > 0 ? ` · คงเหลือ ${summary.remaining} วัน` : ' · ครบเพดานแล้ว'} · คำสั่งเดิมสิ้นสุด{' '}
        {formatThaiDate(caseItem.protectionEndAt)}
      </div>

      <Kb15Section caseItem={caseItem} role={currentRole} />
      <Kb16Section caseItem={caseItem} role={currentRole} />
      <Kb17Section caseItem={caseItem} role={currentRole} />

      <div className="flex flex-wrap gap-4">
        <Link
          to="/protection-review/$caseNo"
          params={{ caseNo: caseItem.no }}
          className="text-[0.8rem] font-semibold text-blue hover:underline"
        >
          ทบทวนผลการคุ้มครอง
        </Link>
        <Link
          to="/dossier/$caseNo"
          params={{ caseNo: caseItem.no }}
          className="text-[0.8rem] font-semibold text-blue hover:underline"
        >
          เปิดแฟ้ม {caseItem.no}
        </Link>
      </div>
    </CaseLockScope>
  )
}
