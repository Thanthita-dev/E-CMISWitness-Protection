import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { BackLink } from '../../components/common/BackLink'
import { DetailHeaderCard } from '../../components/common/DetailHeaderCard'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem, ProtectionMethodNo, ProtectionMethodTrack } from '../../types/case'
import { METHOD_LABELS, METHOD_STATUS_LABELS } from '../../lib/episode'
import { MethodPanel } from '../../components/protection/MethodPanels'
import { CurrentStepCard } from '../../components/common/CurrentStepCard'
import { NumberedStepper, type StepperStep } from '../../components/common/NumberedStepper'
import { getMethodProgress } from '../../lib/methodProgress'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { CaseLockScope } from '../../components/common/CaseLockScope'

interface MethodSearch {
  caseNo?: string
}

export const Route = createFileRoute('/protection-method/$method')({
  validateSearch: (search: Record<string, unknown>): MethodSearch => ({
    caseNo: typeof search.caseNo === 'string' ? search.caseNo : undefined,
  }),
  component: MethodPage,
})

/**
 * หน้า 08A-1 / 08A-2 / 08A-3 / 08B — เส้นทางปฏิบัติของวิธีเดียว
 * แต่ละวิธีเดินคู่ขนานกันได้ และมีสถานะ (ACTIVE) ของตัวเอง
 */
function MethodPage() {
  const { method } = Route.useParams()
  const { caseNo } = Route.useSearch()
  const methodNo = Number(method) as ProtectionMethodNo

  const caseItem = useCaseStore((s) => s.cases.find((c) => c.no === caseNo) || s.cases[0])
  const track = (caseItem?.methodTracks || []).find((t) => t.method === methodNo)

  if (!caseItem || ![1, 2, 3, 4].includes(methodNo)) {
    return <div className="p-10 text-center text-sm text-muted">ไม่พบวิธีคุ้มครองที่ระบุ</div>
  }

  return (
    <CaseLockScope caseItem={caseItem} className="space-y-6">
      <BackLink to="/protection-methods">กลับหน้าวิธีคุ้มครอง</BackLink>

      <DetailHeaderCard
        kicker="ดำเนินการตามวิธีคุ้มครอง"
        refNo={caseItem.no}
        title={`${METHOD_LABELS[methodNo]} — ${caseItem.person}`}
        meta={[`สถานะปัจจุบัน: ${track ? METHOD_STATUS_LABELS[track.status] : 'ยังไม่เปิดเส้นทางนี้'}`]}
        status={track ? <span className="ws-status">{METHOD_STATUS_LABELS[track.status]}</span> : undefined}
        owner={`ผู้รับผิดชอบ: ${caseItem.owner}`}
        actions={
          <Link
            to="/dossier/$caseNo"
            params={{ caseNo: caseItem.no }}
            className="inline-flex min-h-[44px] items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition hover:bg-slate-50"
          >
            <i className="fa-solid fa-folder-open" />
            เปิดแฟ้ม
          </Link>
        }
      />

      {!track ? (
        <div className="ws-card border-dashed p-10 text-center text-[0.88rem] text-muted">
          ยังไม่ได้เปิดเส้นทางวิธีนี้ — กลับไปที่หน้าแยกแนวทางเพื่อเลือกวิธีที่ได้รับอนุมัติ
        </div>
      ) : (
        <>
          <MethodStepCard caseItem={caseItem} track={track} />
          <MethodPanel caseItem={caseItem} track={track} />
          <MethodExitLinks caseItem={caseItem} />
        </>
      )}
    </CaseLockScope>
  )
}

/**
 * ทางออกของทุกเส้นทาง — WIT0821 / WIT0829 / WIT0837 / WIT0851 จบที่แท็บ 10 ติดตามการคุ้มครอง
 * และย้อนกลับไปหน้าแยกแนวทาง 08A เพื่อเปิดหรือดูวิธีอื่นที่เดินคู่ขนานกันอยู่
 */
const MethodExitLinks: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => (
  <section className="ws-callout space-y-2">
    <p className="text-[0.88rem] leading-relaxed">
      <i className="fa-solid fa-circle-info mr-1.5" />
      เมื่อวิธีนี้เริ่มปฏิบัติจริง (ACTIVE) แล้ว ให้ไปติดตามรอบรายงาน คบ.13 และวันสะสมของ Episode ที่หน้ารายงานผลการคุ้มครอง
    </p>
    <div className="flex flex-wrap gap-2">
      <Link
        to="/protection-monitor"
        search={{ caseNo: caseItem.no }}
        className="flex items-center gap-1.5 rounded-lg bg-navy min-h-[44px] px-4 py-2 text-[0.88rem] font-semibold text-white hover:bg-blue transition"
      >
        <i className="fa-solid fa-shield-halved" />
        ไปรายงานผลการคุ้มครอง (คบ.13)
      </Link>
      <Link
        to="/protection-methods"
        className="flex items-center gap-1.5 rounded-lg border border-[#9aabba] bg-white min-h-[44px] px-4 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
      >
        <i className="fa-solid fa-diagram-project" />
        กลับหน้าดำเนินการตามวิธีคุ้มครอง
      </Link>
      <Link
        to="/dossier/$caseNo"
        params={{ caseNo: caseItem.no }}
        className="flex items-center gap-1.5 rounded-lg border border-[#9aabba] bg-white min-h-[44px] px-4 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
      >
        <i className="fa-solid fa-folder-open" />
        กลับแฟ้ม {caseItem.no}
      </Link>
    </div>
  </section>
)

/** ความคืบหน้าของวิธีนี้ — ข้อมูลเดียวกับ getMethodProgress ที่แฟ้มคำร้องใช้ (อ่านอย่างเดียว) */
const MethodStepCard: React.FC<{ caseItem: CaseItem; track: ProtectionMethodTrack }> = ({ caseItem, track }) => {
  const kb8Draft = useFormDraftStore((s) => s.drafts[8])
  const progress = getMethodProgress(caseItem, track, { kb8Drafted: Boolean(kb8Draft && Object.keys(kb8Draft).length > 0) })
  const { steps, doneCount, total, blockedIndex } = progress
  const currentStep = steps[doneCount]
  const stepperSteps: StepperStep[] = steps.map((st, i) => ({
    key: st.code,
    label: st.label,
    sublabel: i === blockedIndex ? 'ค้างอยู่' : undefined,
    state: i < doneCount ? 'done' : i === doneCount ? 'current' : 'pending',
  }))
  return (
    <CurrentStepCard
      current={currentStep?.label ?? 'ครบทุกขั้นตอนแล้ว'}
      next={steps[doneCount + 1]?.label}
      index={Math.min(doneCount + 1, total)}
      total={total}
      caption={[`ความคืบหน้าของวิธีนี้ · ${doneCount}/${total} ขั้น`]}
    >
      <NumberedStepper steps={stepperSteps} ariaLabel="ความคืบหน้าของวิธีคุ้มครอง" />
    </CurrentStepCard>
  )
}
