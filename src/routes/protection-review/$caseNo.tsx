import React from 'react'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { BackLink } from '../../components/common/BackLink'
import { DetailHeaderCard } from '../../components/common/DetailHeaderCard'
import { ReviewSection } from '../../components/protection/ReviewSection'
import { MethodChangeCard } from '../../components/protection/MethodChangeCard'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { showToast } from '../../lib/swal'
import { deriveEpisode, summarizeEpisode } from '../../lib/episode'
import { formatThaiDate, thaiMonthName } from '../../lib/utils'
import { CaseLockScope } from '../../components/common/CaseLockScope'

export const Route = createFileRoute('/protection-review/$caseNo')({
  component: ProtectionReviewDetailPage,
})

/** WIT1107 — ปลายทางจริงในระบบของแต่ละแนวทางหลังเลือกแล้วที่ 11A */
const DESTINATIONS: Record<string, { code: string; label: React.ReactNode }> = {
  continue: {
    code: 'WIT1108',
    label: <span>กลับไปรายงานผลการคุ้มครอง เพื่อกำหนดรอบ คบ.13 ถัดไป</span>,
  },
  extend: {
    code: 'WIT1109',
    label: <span>เปิดแฟ้มแล้วกรอกแบบ คบ.14 ขยายระยะเวลา ตรวจเอกสาร และเสนอตามลำดับชั้น</span>,
  },
  change_method: {
    code: 'WIT1110',
    label: <span>เสนออนุมัติและปรับ คบ.11 — เปลี่ยนเป็นวิธีที่ 1 จึงจัดทำ/แก้ คบ.8</span>,
  },
  terminate: {
    code: 'WIT1111',
    label: <span>เปิดแฟ้มแล้วกรอกแบบ คบ.15 รายงานยุติการคุ้มครอง ตรวจเอกสาร แล้วต่อคำสั่งยุติ (คบ.16–17)</span>,
  },
  article14: {
    code: 'WIT1149',
    label: <span>จัดทำเรื่องส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ</span>,
  },
}

function ProtectionReviewDetailPage() {
  const { caseNo } = useParams({ from: '/protection-review/$caseNo' })
  const { currentRole } = useAuthStore()
  const caseItem = useCaseStore((s) => s.cases.find((c) => c.no === caseNo))
  const addExtraForm = useCaseStore((s) => s.addExtraForm)

  if (!caseItem) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-lg font-bold text-slate-700">ไม่พบข้อมูลแฟ้มคำร้อง {caseNo}</h2>
        <Link to="/protection-reviews" className="text-sm font-semibold text-blue mt-2 inline-block hover:underline">
          กลับรายการทบทวน
        </Link>
      </div>
    )
  }

  if (!caseItem.reviewHandoff) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-lg font-bold text-slate-700">สำนวน {caseNo} ยังไม่ถูกส่งเข้าทบทวน</h2>
        <Link to="/protection-reviews" className="text-sm font-semibold text-blue mt-2 inline-block hover:underline">
          กลับรายการทบทวน
        </Link>
      </div>
    )
  }

  const handoff = caseItem.reviewHandoff
  const summary = summarizeEpisode(caseItem.episode || deriveEpisode(caseItem))
  const proposals = caseItem.reviewProposals || []
  const latest = proposals[proposals.length - 1]
  const destination = latest?.appliedOutcome ? DESTINATIONS[latest.appliedOutcome] : undefined
  /** WIT1102 — วิธีคุ้มครองที่ปฏิบัติอยู่จริง อ่านจากเส้นทางรายวิธีก่อน แล้วค่อยถอยไปวิธีที่อนุมัติ */
  const activeMethods = (caseItem.methodTracks || []).filter((t) => t.status === 'active').map((t) => t.method)
  const shownMethods = activeMethods.length > 0 ? activeMethods : caseItem.approvedMethods || []
  const methodLabel = shownMethods.length > 0 ? shownMethods.map((n) => `วิธีที่ ${n}`).join(' · ') : '-'
  const capPercent = Math.min(100, Math.round((handoff.cumulativeDays / summary.cap) * 100))

  return (
    <CaseLockScope caseItem={caseItem} className="space-y-6">
      <BackLink to="/protection-reviews">กลับรายการทบทวน</BackLink>

      <DetailHeaderCard
        kicker="ทบทวนผลการคุ้มครอง"
        refNo={caseItem.no}
        title={`เลือกแนวทางการทบทวน — ${caseItem.person}`}
        meta={['ทบทวนผลการคุ้มครอง ประเมินความเสี่ยง และเลือกแนวทางที่ต้องดำเนินการต่อ']}
        status={<span className="ws-status">{caseItem.status}</span>}
        owner={`ผู้รับผิดชอบ: ${caseItem.owner}`}
      />

      {/* ---------- WIT1101 / WIT1102 — งานที่รับจากแท็บ 10 พร้อมฐานตัดสินใจทั้งชุด ---------- */}
      <section className="space-y-3 ws-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-[0.8rem] font-bold text-navy-deep">ข้อมูลประกอบการทบทวน</h3>
            <p className="mt-0.5 text-[0.8rem] text-muted">
              รับงานจากรายงานผลการคุ้มครอง เมื่อ {handoff.at} โดย {handoff.by}
            </p>
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'คบ.13 รอบล่าสุด', value: handoff.period ? thaiMonthName(handoff.period) : '-' },
            { label: 'ผลประเมินความเสี่ยง', value: handoff.riskLevel || '-' },
            { label: 'คำสั่งปัจจุบัน', value: handoff.orderRef || '-' },
            { label: 'วิธีคุ้มครองที่ใช้อยู่', value: methodLabel },
            { label: 'วันสิ้นสุดตามคำสั่ง', value: formatThaiDate(caseItem.protectionEndAt) || '-' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-line bg-soft px-3 py-2">
              <dt className="text-[0.8rem] text-muted">{item.label}</dt>
              <dd className="mt-0.5 text-[0.8rem] font-bold text-navy-deep">{item.value}</dd>
            </div>
          ))}
        </dl>

        {/* WIT1103 — ระยะสะสมเทียบเพดานรวม คิดจากวันเริ่มจริง ไม่ใช้วันอัปโหลด */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[0.8rem]">
            <span className="font-semibold text-slate-600">
              ระยะคุ้มครองสะสม{' '}
              <span className={`text-sm font-bold ${summary.atCap ? 'text-rose-700' : 'text-navy-deep'}`}>
                {handoff.cumulativeDays}
              </span>{' '}
              / {summary.cap} วัน
            </span>
            <span className={summary.atCap ? 'font-bold text-rose-700' : 'text-muted'}>
              {summary.atCap ? 'ครบเพดานแล้ว — ห้ามขยาย คบ.14' : `คงเหลือ ${handoff.remainingDays} วัน`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all ${summary.atCap ? 'bg-rose-500' : summary.nearCap ? 'bg-amber-500' : 'bg-blue'}`}
              style={{ width: `${capPercent}%` }}
            />
          </div>
        </div>

        <p className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-[0.8rem] leading-relaxed text-amber-900">
          <strong>เหตุผลที่ต้องทบทวน:</strong> {handoff.reason}
        </p>
      </section>

      <ReviewSection caseItem={caseItem} role={currentRole} atCap={summary.atCap} remaining={summary.remaining} />

      {/* WIT1110 — แขนง "เปลี่ยนวิธี/เงื่อนไข" ต้องเดินต่อได้จริง ไม่จบที่ป้ายสถานะ */}
      {latest?.appliedOutcome === 'change_method' && <MethodChangeCard caseItem={caseItem} />}

      {destination && (
        <section className="space-y-2 rounded-lg border border-line bg-blue-soft p-4">
          {/* ReviewSection แสดงผลลัพธ์ที่เลือกไว้แล้ว ส่วนนี้จึงเหลือแค่ทางไปต่อ ไม่ประกาศซ้ำ */}
          <strong className="block text-[0.8rem] text-navy-deep">
            <i className="fa-solid fa-signs-post mr-1.5 text-blue" />
            ขั้นตอนถัดไป
          </strong>
          <p className="rounded-lg border border-slate-200 bg-white p-2.5 text-[0.8rem] leading-relaxed text-slate-700">
            {destination.label}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              to="/dossier/$caseNo"
              params={{ caseNo: caseItem.no }}
              onClick={() => {
                /** WIT1109 — เลือกแนวทาง "ขยายเวลา" แล้ว ให้ คบ.14 รอเปิดกรอกอยู่ในแฟ้มเลย ไม่ต้องแยกไป 11B */
                if (latest?.appliedOutcome === 'extend') {
                  addExtraForm(caseItem.no, 14)
                  showToast('แนบแบบ คบ.14 เข้าแฟ้มรอกรอกแล้ว')
                }
                /** WIT1111 — เลือกแนวทาง "เข้าสู่กระบวนการยุติ" แล้ว ให้ คบ.15 รอเปิดกรอกอยู่ในแฟ้มเลย ไม่ต้องแยกไปแท็บ 11C */
                if (latest?.appliedOutcome === 'terminate') {
                  addExtraForm(caseItem.no, 15)
                  /** WIT1126 — ที่มาการยุติคือพยานยื่น คบ.7 ให้ คบ.7 รอเปิดกรอกอยู่ในแฟ้มเลยด้วย */
                  if (caseItem.terminationTrigger?.source === 'witness_kb7') {
                    addExtraForm(caseItem.no, 7)
                    showToast('แนบแบบ คบ.15 และ คบ.7 เข้าแฟ้มรอกรอกแล้ว')
                  } else {
                    showToast('แนบแบบ คบ.15 เข้าแฟ้มรอกรอกแล้ว')
                  }
                }
              }}
              className="rounded-lg border border-[#9aabba] bg-white min-h-[44px] px-4 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
            >
              <i className="fa-solid fa-folder-open mr-1.5" />
              เปิดแฟ้ม {caseItem.no}
            </Link>
            {latest?.appliedOutcome === 'article14' && (
              <Link
                to="/article14"
                className="rounded-lg border border-[#9aabba] bg-white min-h-[44px] px-4 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
              >
                <i className="fa-solid fa-building-columns mr-1.5" />
                ส่งต่อกรมคุ้มครองสิทธิฯ
              </Link>
            )}
          </div>
        </section>
      )}

    </CaseLockScope>
  )
}
