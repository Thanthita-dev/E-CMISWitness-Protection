import React, { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '../common/Button'
import { Badge } from '../common/Badge'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem, MonthlyReport, ProtectionMethodNo } from '../../types/case'
import { METHOD_LABELS, deriveEpisode } from '../../lib/episode'
import { getKb13Progress, kb13DueStatus, lastLockedKb13Round, needsReview, openKb13Round } from '../../lib/kb13'
import { MethodProgressStepper } from './MethodProgressStepper'
import { ReviewBranchModal } from './ReviewBranchModal'
import { ReceiveReportModal } from './ReceiveReportModal'
import { OpenRoundModal } from './OpenRoundModal'
import { formatThaiDate, currentReportPeriod, thaiMonthName, addDays } from '../../lib/utils'
import { showToast } from '../../lib/swal'
import { protectionMethodSwitchNotice, toggleProtectionMethod } from '../../lib/constants'

const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * แท็บ 10 — ติดตามและรายงานผลการคุ้มครอง (คบ.13) ตามผัง WIT1001-WIT1013
 *
 * หน้าเดินเป็นรอบ: เปิดรอบ (WIT1004) → จัดทำ (WIT1005) → ลงนามสองช่องที่รายการแบบฟอร์มในแฟ้ม
 * (WIT1006/WIT1007) → ตรวจรับ (WIT1008) → บันทึกสถานะ (WIT1009) → ล็อก (WIT1010)
 * แล้วแยกสองแขนงที่ WIT1011 — กำหนดรอบถัดไป (WIT1012) หรือส่งทบทวนที่แท็บ 11A (WIT1013)
 *
 * การลงนามไม่ทำที่แผงนี้ ใช้รายการแบบฟอร์มในแฟ้มที่เดียวตามกติกาเดิมของระบบ (formSignature.ts)
 */
/** หน้าของ wizard หนึ่งหน้า = หนึ่งการ์ดเดิม ผูกกับรหัสขั้นใน getKb13Progress เพื่อไม่ต้องคำนวณ "เสร็จหรือยัง" ซ้ำสองที่ */
type WizardPageKey = 'episode' | 'cycle' | 'open' | 'draft' | 'signature' | 'receive' | 'status' | 'lock'

const PAGE_CODES: Record<WizardPageKey, string[]> = {
  episode: ['WIT1001', 'WIT1002'],
  cycle: ['WIT1003'],
  open: ['WIT1004'],
  draft: ['WIT1005'],
  signature: ['WIT1006', 'WIT1007'],
  receive: ['WIT1008'],
  status: ['WIT1009'],
  lock: ['WIT1010'],
}

const CODE_TO_PAGE: Record<string, WizardPageKey> = Object.entries(PAGE_CODES).reduce(
  (acc, [key, codes]) => {
    codes.forEach((c) => (acc[c] = key as WizardPageKey))
    return acc
  },
  {} as Record<string, WizardPageKey>
)

export const Kb13MonitorPanel: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const progress = getKb13Progress(caseItem)
  const round = openKb13Round(caseItem)
  const locked = lastLockedKb13Round(caseItem)
  /** เหลือ ≤ 7 วันก่อนครบเพดานและมีรอบปิดค้างประเมิน — ห้ามเปิดรอบใหม่ตรงจากที่นี่ ต้องผ่านการทบทวน (11A) ก่อนเท่านั้น (TC-122) */
  const openRoundBlocked = Boolean(locked) && !round && kb13DueStatus(caseItem).episode.blockContinue

  /** เปิดรอบ(WIT1004) เข้าไปแทนที่จัดทำ-ลงนาม-ตรวจรับ-สถานะ-ปิดรอบ เมื่อมีรอบเปิดอยู่ ตรงกับที่การ์ดเดิมสลับกันแสดงอยู่แล้ว */
  const pageKeys = useMemo<WizardPageKey[]>(
    () => (round ? ['episode', 'cycle', 'draft', 'signature'] : ['episode', 'cycle', 'open']),
    [round]
  )

  const isPageDone = (key: WizardPageKey) =>
    PAGE_CODES[key].every((code) => progress.steps.find((s) => s.code === code)?.done)

  const defaultPageIndex = useMemo(() => {
    const idx = pageKeys.findIndex((k) => !isPageDone(k))
    return idx === -1 ? pageKeys.length - 1 : idx
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKeys, progress.doneCount])

  const [pageIndex, setPageIndex] = useState(defaultPageIndex)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [receiveModalOpen, setReceiveModalOpen] = useState(false)
  const [openRoundModalOpen, setOpenRoundModalOpen] = useState(false)
  const openRoundPeriod = currentReportPeriod()

  /** เดินหน้าอัตโนมัติทุกครั้งที่ข้อมูลจริงเปลี่ยนจนขั้นถัดไปเสร็จ (เช่นกดเปิดรอบ/จัดทำ/ตรวจรับสำเร็จ)
   * แต่ไม่รบกวนตอนผู้ใช้กดย้อนกลับไปดูหน้าที่ทำแล้วเอง เพราะตอนนั้น defaultPageIndex ไม่เปลี่ยน */
  useEffect(() => {
    setPageIndex(defaultPageIndex)
  }, [round?.id, Boolean(round), defaultPageIndex])

  const activeIndex = Math.min(pageIndex, pageKeys.length - 1)
  const activeKey = pageKeys[activeIndex]

  const handleStepClick = (stepIdx: number) => {
    const code = progress.steps[stepIdx]?.code
    const pageKey = code ? CODE_TO_PAGE[code] : undefined
    const targetIndex = pageKey ? pageKeys.indexOf(pageKey) : -1
    if (targetIndex === -1 || targetIndex > defaultPageIndex) return
    setPageIndex(targetIndex)
  }

  return (
    <div className="space-y-5">
      <MethodProgressStepper
        progress={progress}
        title="ความคืบหน้ารอบรายงานนี้"
        blockedReason="ยังไม่มีวิธีคุ้มครองใดเริ่มปฏิบัติจริง (ACTIVE) — ยังไม่มี Episode ให้ติดตาม"
        onStepClick={handleStepClick}
      />

      {activeKey === 'episode' && <EpisodeCard caseItem={caseItem} />}
      {activeKey === 'cycle' && <ReportCycleCard caseItem={caseItem} />}
      {activeKey === 'draft' && round && <DraftRoundCard caseItem={caseItem} round={round} />}
      {activeKey === 'signature' && round && <SignatureStatusCard caseItem={caseItem} round={round} />}

      <RoundHistory
        caseItem={caseItem}
        reviewableRoundId={locked && !round ? locked.id : undefined}
        onReview={() => setReviewModalOpen(true)}
        receivableRoundId={round?.id}
        onReceive={() => setReceiveModalOpen(true)}
        onOpenRound={activeKey === 'open' ? () => setOpenRoundModalOpen(true) : undefined}
        openRoundLabel={`เปิดรอบรายงานงวด ${thaiMonthName(openRoundPeriod)}`}
        openRoundBlocked={openRoundBlocked}
      />

      {locked && !round && (
        <ReviewBranchModal
          caseItem={caseItem}
          locked={locked}
          open={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
        />
      )}

      {round && (
        <ReceiveReportModal
          caseItem={caseItem}
          round={round}
          open={receiveModalOpen}
          onClose={() => setReceiveModalOpen(false)}
        />
      )}

      <OpenRoundModal caseItem={caseItem} open={openRoundModalOpen} onClose={() => setOpenRoundModalOpen(false)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ชิ้นส่วนที่ใช้ร่วมกัน
// ---------------------------------------------------------------------------

const Card: React.FC<{
  title: string
  hint?: string
  tone?: 'default' | 'muted'
  headerAction?: React.ReactNode
  children: React.ReactNode
}> = ({ title, hint, tone = 'default', headerAction, children }) => (
  <section
    className={`rounded-xl border p-5 space-y-3 ${
      tone === 'muted' ? 'border-slate-200 bg-slate-50/70' : 'border-line bg-paper'
    }`}
  >
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-2">
      <div>
        <h3 className="text-sm font-bold text-navy-deep">{title}</h3>
        {hint && <p className="text-[0.8rem] text-muted mt-0.5">{hint}</p>}
      </div>
      {headerAction}
    </div>
    {children}
  </section>
)

const TextField: React.FC<{
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
}> = ({ label, value, onChange, placeholder, type = 'text', disabled }) => (
  <label className="block">
    <span className="ws-label">{label}</span>
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="ws-input w-full disabled:bg-slate-100 disabled:text-slate-400"
    />
  </label>
)

const AreaField: React.FC<{
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  disabled?: boolean
}> = ({ label, value, onChange, rows = 3, disabled }) => (
  <label className="block">
    <span className="ws-label">{label}</span>
    <textarea
      rows={rows}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="ws-input w-full disabled:bg-slate-100 disabled:text-slate-400"
    />
  </label>
)

const Fact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-2.5">
    <span className="block text-[0.8rem] font-semibold text-muted">{label}</span>
    <strong className="block text-[0.8rem] text-navy-deep mt-0.5">{value}</strong>
  </div>
)

// ---------------------------------------------------------------------------
// WIT1001 / WIT1002 — Episode เดียว, Phase ปัจจุบัน และวันสะสมต่อเนื่อง
// ---------------------------------------------------------------------------

const PHASE_LABELS: Record<string, string> = { TEMPORARY: 'ชั่วคราว (TEMPORARY)', MAIN: 'คำร้องหลัก (MAIN)' }

const EpisodeCard: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const episode = caseItem.episode || deriveEpisode(caseItem)
  const { episode: summary } = kb13DueStatus(caseItem)

  if (!episode) {
    return (
      <Card title="Episode ของสำนวนนี้" hint="รับ Episode เดียว Phase: TEMPORARY / MAIN">
        <p className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-[0.8rem] leading-relaxed text-amber-900">
          <i className="fa-solid fa-triangle-exclamation mr-1.5" />
          ยังไม่มีวิธีคุ้มครองใดกดเริ่มปฏิบัติจริง จึงยังไม่มีวันเริ่มจริงให้ตั้งต้นนับวันสะสม —
          กลับไปที่หน้าดำเนินการตามวิธีคุ้มครอง เพื่อเริ่มปฏิบัติวิธีที่ได้รับอนุมัติก่อน
        </p>
        <Link
          to="/protection-methods"
          className="inline-flex items-center gap-1.5 min-h-[44px] rounded-lg border border-[#9aabba] bg-white px-4 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
        >
          <i className="fa-solid fa-diagram-project" />
          ไปหน้าดำเนินการตามวิธีคุ้มครอง
        </Link>
      </Card>
    )
  }

  const activeMethods = (caseItem.methodTracks || []).filter((t) => t.status === 'active')
  const pct = Math.min(100, Math.round((summary.cumulative / summary.cap) * 100))

  return (
    <Card
      title="Episode และวันสะสมต่อเนื่อง"
      hint="แสดง Phase ปัจจุบัน วันเริ่มจริง วันเปลี่ยน Phase/วันสิ้นสุด และยอดวันสะสมโดยไม่รีเซ็ต"
    >
      <div className="grid gap-2 sm:grid-cols-4">
        <Fact label="Phase ปัจจุบัน" value={PHASE_LABELS[summary.phaseKind || ''] || '-'} />
        <Fact label="วันเริ่มจริง" value={formatThaiDate(summary.startedAt)} />
        <Fact label="วันสะสมต่อเนื่อง" value={`${summary.cumulative} วัน`} />
        <Fact label="คงเหลือจากเพดาน" value={`${summary.remaining} จาก ${summary.cap} วัน`} />
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all ${
            summary.atCap ? 'bg-rose-500' : summary.nearCap ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="space-y-1.5">
        {episode.phases.map((p) => (
          <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-2.5 text-[0.8rem] text-slate-600">
            <strong className="text-navy-deep">{PHASE_LABELS[p.kind] || p.kind}</strong>
            {p.orderRef ? ` · ${p.orderRef}` : ''} — เริ่ม {formatThaiDate(p.startedAt)}
            {p.endedAt ? ` ถึง ${formatThaiDate(p.endedAt)}` : ' (ยังเปิดอยู่)'}
          </li>
        ))}
      </ol>

      <p className="text-[0.8rem] text-muted">
        วิธีที่กำลังปฏิบัติ:{' '}
        {activeMethods.length > 0
          ? activeMethods.map((t) => METHOD_LABELS[t.method]).join(' · ')
          : 'ยังไม่มีวิธีใดอยู่ในสถานะ ACTIVE'}
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// WIT1003 — แจ้งรอบ คบ.13 ก่อนครบกำหนด และตรวจเพดานรวม 6 เดือน
// ---------------------------------------------------------------------------

const ReportCycleCard: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const { setNextReportDue } = useCaseStore()
  const status = kb13DueStatus(caseItem)
  const [dueAt, setDueAt] = useState(caseItem.nextReportDueAt?.slice(0, 10) || addDays(todayIso(), 30).slice(0, 10))

  return (
    <Card
      title="รอบรายงานและเพดานระยะเวลา"
      hint="แจ้งรอบ คบ.13 ก่อนครบกำหนด และตรวจ TEMPORARY + MAIN รวมไม่เกิน 6 เดือน"
    >
      <div className="flex flex-wrap items-center gap-2">
        {status.dueAt ? (
          <Badge variant={status.overdue ? 'danger' : status.due ? 'warning' : 'success'}>
            รอบถัดไป {formatThaiDate(status.dueAt)}
            {status.daysLeft !== null &&
              (status.overdue ? ` · เลยกำหนด ${Math.abs(status.daysLeft)} วัน` : ` · อีก ${status.daysLeft} วัน`)}
          </Badge>
        ) : (
          <Badge variant="default">ยังไม่ได้กำหนดรอบรายงาน</Badge>
        )}
        {status.episode.atCap && <Badge variant="danger">ครบเพดาน {status.episode.cap} วันแล้ว</Badge>}
        {!status.episode.atCap && status.episode.nearCap && (
          <Badge variant="warning">ใกล้ครบเพดาน — เหลือ {status.episode.remaining} วัน</Badge>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48">
          <TextField label="กำหนดรอบรายงานถัดไป" value={dueAt} onChange={setDueAt} type="date" />
        </div>
        <Button
          type="button"
          onClick={() => {
            setNextReportDue(caseItem.no, new Date(dueAt).toISOString())
            showToast('กำหนดรอบรายงาน คบ.13 ถัดไปแล้ว')
          }}
          className="rounded-lg bg-blue px-4 py-2 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition"
        >
          <i className="fa-solid fa-bell mr-1.5" />
          ตั้งรอบแจ้งเตือน
        </Button>
      </div>

      {status.episode.atCap && (
        <p className="rounded-xl border border-rose-200 bg-rose-50/80 p-2.5 text-[0.8rem] leading-relaxed text-rose-900">
          <i className="fa-solid fa-triangle-exclamation mr-1.5" />
          คุ้มครองสะสมครบเพดาน {status.episode.cap} วันแล้ว — ขยายเวลาด้วย คบ.14 ไม่ได้อีก
          หากยังมีภัยให้ส่งเข้าทบทวนผลการคุ้มครอง แล้วส่งต่อกรมคุ้มครองสิทธิฯ
        </p>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// WIT1005 — จัดทำ คบ.13 ของรอบนี้
// ---------------------------------------------------------------------------

const DraftRoundCard: React.FC<{ caseItem: CaseItem; round: MonthlyReport }> = ({ caseItem, round }) => {
  const { submitKb13Round } = useCaseStore()
  const episode = caseItem.episode || deriveEpisode(caseItem)
  const defaultOrder = episode?.phases[episode.phases.length - 1]?.orderRef || 'คบ.8'

  const [orderRef, setOrderRef] = useState(round.orderRef || defaultOrder)
  const [orderDays, setOrderDays] = useState(String(round.orderDays || caseItem.protectionDays || ''))
  const [operators, setOperators] = useState(round.operators || caseItem.assignedOfficer || '')
  const [summary, setSummary] = useState(round.summary || '')
  const [methods, setMethods] = useState<ProtectionMethodNo[]>(
    round.methods || (caseItem.methodTracks || []).filter((t) => t.status === 'active').map((t) => t.method)
  )

  /** จัดทำแล้วและมีลายมือชื่อช่องใดช่องหนึ่งแล้ว ห้ามแก้เนื้อรายงานอีก ไม่งั้นสิ่งที่ลงนามไปกับสิ่งที่เก็บจะไม่ตรงกัน */
  const signedAny = Boolean(round.officerSignedAt || round.witnessSignedAt)

  const toggleMethod = (m: ProtectionMethodNo) => {
    const notice = protectionMethodSwitchNotice(methods, m)
    if (notice) showToast(notice, 'warning')
    setMethods(toggleProtectionMethod(methods, m))
  }

  return (
    <Card title={`จัดทำ คบ.13 งวด ${thaiMonthName(round.period)}`} hint="ช่วงรายงาน คำสั่ง/จำนวนวัน ผู้ปฏิบัติ และสรุปผลการดำเนินการ">
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="คำสั่งที่อ้างอิง" value={orderRef} onChange={setOrderRef} disabled={signedAny} />
        <TextField
          label="จำนวนวันตามคำสั่ง"
          value={orderDays}
          onChange={setOrderDays}
          type="number"
          disabled={signedAny}
        />
        <TextField label="ผู้ปฏิบัติในรอบนี้" value={operators} onChange={setOperators} disabled={signedAny} />
      </div>

      <div className="space-y-1.5">
        <span className="block text-[0.8rem] font-bold text-slate-700">วิธีคุ้มครองที่ปฏิบัติในรอบนี้</span>
        <div className="flex flex-wrap gap-2">
          {([1, 2, 3, 4] as ProtectionMethodNo[]).map((m) => (
            <button
              key={m}
              type="button"
              disabled={signedAny}
              onClick={() => toggleMethod(m)}
              className={`rounded-lg border px-3 py-1.5 text-[0.8rem] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                methods.includes(m)
                  ? 'border-blue bg-blue/10 text-blue-dark'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {METHOD_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <AreaField label="สรุปผลการดำเนินการ" value={summary} onChange={setSummary} rows={4} disabled={signedAny} />

      {round.evidenceRefs && round.evidenceRefs.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-line bg-soft p-2.5">
          {round.evidenceRefs.map((e, i) => (
            <li key={i} className="text-[0.8rem] text-slate-600">
              <i className="fa-solid fa-paperclip mr-1.5 text-muted" />
              {e}
            </li>
          ))}
        </ul>
      )}

      {signedAny ? (
        <p className="text-[0.8rem] font-semibold text-emerald-700">
          <i className="fa-solid fa-lock mr-1.5" />
          เริ่มลงนามแล้ว — แก้เนื้อรายงานของรอบนี้ไม่ได้อีก
        </p>
      ) : (
        <Button
          type="button"
          disabled={!orderRef || !operators || !summary}
          onClick={() => {
            submitKb13Round(caseItem.no, round.id, {
              orderRef,
              orderDays: Number(orderDays) || undefined,
              operators,
              summary,
              methods,
            })
            showToast('จัดทำ คบ.13 แล้ว — แนบแบบเข้าแฟ้มเพื่อลงนาม')
          }}
          className="rounded-lg bg-blue px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          <i className="fa-solid fa-file-pen mr-1.5" />
          จัดทำ คบ.13 และส่งลงนาม
        </Button>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// WIT1006 / WIT1007 — ลงนามที่รายการแบบฟอร์มในแฟ้ม แผงนี้แสดงสถานะอย่างเดียว
// ---------------------------------------------------------------------------

const SignatureStatusCard: React.FC<{ caseItem: CaseItem; round: MonthlyReport }> = ({ caseItem, round }) => {
  const drafted = Boolean(round.summary)

  return (
    <Card
      title="ลายมือชื่อท้ายรายงานรอบนี้"
      tone="muted"
      hint="เจ้าหน้าที่ผู้ปฏิบัติตรวจและลงนาม แล้วพยานตรวจข้อมูลและลงนามรับรอง"
    >
      {!drafted ? (
        <p className="text-[0.8rem] text-muted">ยังไม่ได้จัดทำเนื้อรายงาน — จัดทำรายงานรอบนี้ก่อนจึงจะลงนามได้</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <div
              className={`rounded-xl border p-2.5 text-[0.8rem] ${
                round.officerSignedAt ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-muted'
              }`}
            >
              <strong className="block">เจ้าหน้าที่ผู้ปฏิบัติ</strong>
              {round.officerSignedAt ? `✓ ${round.officerSignedBy} — ${round.officerSignedAt}` : 'รอลงนาม'}
            </div>
            <div
              className={`rounded-xl border p-2.5 text-[0.8rem] ${
                round.witnessSignedAt ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-muted'
              }`}
            >
              <strong className="block">พยานรับรอง</strong>
              {round.witnessSignedAt
                ? `✓ ${round.witnessSignedBy} — ${round.witnessSignedAt}`
                : round.officerSignedAt
                ? 'รอพยานลงนามรับรอง'
                : 'รอเจ้าหน้าที่ผู้ปฏิบัติลงนามก่อน'}
            </div>
          </div>

          <Link
            to="/dossier/$caseNo"
            params={{ caseNo: caseItem.no }}
            className="inline-flex items-center gap-1.5 min-h-[44px] rounded-lg border border-[#9aabba] bg-white px-4 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
          >
            <i className="fa-solid fa-signature" />
            ไปลงนามที่รายการแบบฟอร์มในแฟ้ม
          </Link>
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// ประวัติรอบรายงานที่ปิดแล้ว
// ---------------------------------------------------------------------------

const RoundHistory: React.FC<{
  caseItem: CaseItem
  reviewableRoundId?: string
  onReview: () => void
  receivableRoundId?: string
  onReceive: () => void
  onOpenRound?: () => void
  openRoundLabel?: string
  /** เหลือ ≤ 7 วันก่อนครบเพดาน — ห้ามเปิดรอบใหม่ตรงจากปุ่มนี้ ต้องกด "ประเมิน" เข้าทบทวนที่ 11A ก่อน (TC-122) */
  openRoundBlocked?: boolean
}> = ({ caseItem, reviewableRoundId, onReview, receivableRoundId, onReceive, onOpenRound, openRoundLabel, openRoundBlocked }) => {
  const rounds = [...(caseItem.monthlyReports || [])].reverse()
  if (rounds.length === 0 && !onOpenRound) return null

  const openRoundButton = onOpenRound && (
    <Button
      type="button"
      aria-label={openRoundLabel}
      aria-disabled={openRoundBlocked}
      onClick={openRoundBlocked ? undefined : onOpenRound}
      disabled={openRoundBlocked}
      title={openRoundBlocked ? 'ใกล้ครบเพดาน 6 เดือน — ต้องเข้าสู่การทบทวนผลการคุ้มครองก่อน กด "ประเมิน" ที่รอบล่าสุดด้านล่าง' : undefined}
      className={`shrink-0 rounded-lg px-4 py-2 text-[0.8rem] font-bold transition ${
        openRoundBlocked
          ? 'cursor-not-allowed bg-slate-200 text-slate-400'
          : 'bg-blue text-white hover:bg-blue-dark'
      }`}
    >
      <i className="fa-solid fa-folder-plus mr-1.5" />
      {openRoundLabel}
    </Button>
  )

  return (
    <Card title="รอบรายงานที่ผ่านมา" tone="muted" hint={`ทั้งหมด ${rounds.length} รอบ`} headerAction={openRoundButton}>
      {openRoundBlocked && (
        <p className="ws-callout text-[0.85rem] leading-relaxed">
          <i className="fa-solid fa-triangle-exclamation mr-1.5" />
          ใกล้ครบเพดาน 6 เดือน — เปิดรอบใหม่ตรงจากที่นี่ไม่ได้ ต้องกด "ประเมิน" ที่รอบล่าสุดด้านล่างเพื่อเข้าสู่การทบทวนผลการคุ้มครองก่อน
        </p>
      )}
      {rounds.length === 0 && <p className="text-[0.8rem] text-muted">ยังไม่มีรอบรายงานที่ผ่านมา</p>}
      <ol className="space-y-2">
        {rounds.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-[0.8rem] text-navy-deep">
                งวด {thaiMonthName(r.period)}
                {r.periodFrom && r.periodTo ? ` · ${formatThaiDate(r.periodFrom)}–${formatThaiDate(r.periodTo)}` : ''}
              </strong>
              <div className="flex items-center gap-2">
                <Badge variant={r.lockedAt ? 'success' : 'warning'}>{r.lockedAt ? 'ปิดรอบแล้ว' : 'กำลังดำเนินการ'}</Badge>
                {r.id === receivableRoundId && (
                  <Button
                    type="button"
                    onClick={onReceive}
                    className="rounded-lg border border-blue bg-blue/10 px-3 py-1 text-[0.8rem] font-bold text-blue-dark hover:bg-blue/20 transition"
                  >
                    <i className="fa-solid fa-inbox mr-1.5" />
                    {!r.reviewedAt
                      ? 'ตรวจรับรายงาน'
                      : !r.nextProposal
                        ? 'บันทึกสถานะ'
                        : 'ล็อกเป็นรอบรายงานใหม่'}
                  </Button>
                )}
                {r.id === reviewableRoundId && (
                  <Button
                    type="button"
                    onClick={onReview}
                    className="rounded-lg border border-blue bg-blue/10 px-3 py-1 text-[0.8rem] font-bold text-blue-dark hover:bg-blue/20 transition"
                  >
                    <i className="fa-solid fa-diagram-project mr-1.5" />
                    ประเมิน
                  </Button>
                )}
              </div>
            </div>
            <p className="text-[0.8rem] text-slate-600">{r.summary || 'ยังไม่ได้จัดทำเนื้อรายงาน'}</p>
            <p className="text-[0.8rem] text-muted">
              {r.orderRef ? `คำสั่ง ${r.orderRef}` : ''}
              {r.orderDays ? ` · ${r.orderDays} วัน` : ''}
              {r.riskLevel ? ` · ความเสี่ยง ${r.riskLevel}` : ''}
              {r.lockedAt ? ` · ล็อก ${r.lockedAt}` : ''}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  )
}
