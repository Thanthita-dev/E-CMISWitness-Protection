import React, { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { Button } from '../components/common/Button'
import { useCaseStore } from '../store/useCaseStore'
import { CaseLockScope } from '../components/common/CaseLockScope'
import { useAuthStore } from '../store/useAuthStore'
import { Article14Step, CaseItem } from '../types/case'
import { ARTICLE14_TARGET_AGENCY, OFFICIAL_LETTER_CHANNELS, PROTECTION_TOTAL_CAP_DAYS } from '../lib/constants'
import { deriveEpisode, summarizeEpisode } from '../lib/episode'
import { showToast, showConfirmAlert } from '../lib/swal'
import { ATTACHMENT_ACCEPT, getAttachmentRejection } from '../lib/fileValidation'
import { Article14EscalationCard, latestArticle14Escalation } from '../components/protection/Article14EscalationCard'

export const Route = createFileRoute('/article14')({
  validateSearch: (search: Record<string, unknown>): { caseNo?: string } => ({ caseNo: typeof search.caseNo === 'string' ? search.caseNo : undefined }),
  component: Article14Page,
})

const STEP_LABELS: Record<Article14Step, string> = {
  proposal_draft: 'จัดทำ/แก้ไขข้อเสนอ',
  supervisor_review: 'ผู้บังคับบัญชาตรวจ',
  secretary_review: 'เลขาธิการฯ พิจารณาเสนอคณะกรรมการ',
  committee_pending: 'รอมติคณะกรรมการ ป.ป.ท.',
  committee_rejected: 'คณะกรรมการไม่เห็นชอบ',
  letter_sent: 'ประสานหน่วยงานผู้รับ',
  /** WIT0860 แขนง — กรมแจ้งว่าดำเนินการไม่ได้ ต้องเสนอผู้มีอำนาจทันทีไม่ให้คุ้มครองขาดช่วง */
  delivery_failed: 'กรมแจ้งว่าดำเนินการไม่ได้ · เสนอผู้มีอำนาจ',
  response_received: 'ได้รับผลประสานแล้ว',
  handover_ready: 'เตรียมส่งมอบ',
  handover_done: 'ส่งมอบและเริ่มมาตรการแล้ว',
}

const todayIso = () => new Date().toISOString().slice(0, 10)

/** ทุกจุดที่เป็น "การยืนยัน" ในหน้านี้ใช้ modal ยืนยันร่วมกัน ไม่มีปุ่มที่กดแล้วมีผลทันที */
const confirmAction = async (title: string, text: string, confirmButtonText = 'ยืนยัน') => {
  const res = await showConfirmAlert({
    icon: 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: 'ยกเลิก',
  })
  return res.isConfirmed
}

/**
 * หน้า 08C — ส่งกรมคุ้มครองสิทธิและเสรีภาพตามข้อ 14
 *
 * คนละเส้นทางกับวิธีที่ 4 ตามข้อ 15(4): ต้องผ่านมติคณะกรรมการ ป.ป.ท. ก่อน
 * และเริ่มดำเนินการก่อนครบเพดานเพื่อไม่ให้การคุ้มครองขาดช่วง
 */
function Article14Page() {
  const { caseNo } = Route.useSearch()
  const cases = useCaseStore((s) => s.cases)
  const { currentRole } = useAuthStore()

  /**
   * สำนวนที่เปิดเรื่องข้อ 14 แล้ว · ใกล้/ถึงเพดานจนควรเปิด
   * หรือ WIT0713 — ผลพิจารณาจากแท็บ 07 ระบุว่า "เห็นควรตามข้อ 14" ตั้งแต่ต้น
   * (ทางเข้าที่สองตามผัง — ไม่ต้องรอให้คุ้มครองใกล้ครบเพดาน 180 วัน)
   */
  const candidates = cases.filter((c) => {
    if (caseNo && c.no !== caseNo) return false
    if (c.article14) return true
    /** WIT1149 — ผลทบทวน 11A ให้ไปข้อ 14 (stage 'article14') ต้องขึ้นเป็นสำนวนให้เปิดเรื่องต่อที่ 08C ได้ */
    if (c.stage === 'article14') return true
    if (['terminated', 'withdrawn'].includes(c.stage)) return false
    if (c.article14Referral) return true
    const summary = summarizeEpisode(c.episode || deriveEpisode(c))
    return summary.atCap || summary.nearCap
  })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="งานคุ้มครองพยาน · ส่งต่อกรมคุ้มครองสิทธิฯ"
        title="ส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ"
        description={`ทางเข้า 2 ทาง — คุ้มครองครบเพดานรวม 6 เดือนแต่ยังมีภัย (มาจากการทบทวนผลการคุ้มครอง) หรือเลขาธิการฯ เห็นควรส่งต่อตั้งแต่ชั้นผลพิจารณาและคำสั่ง`}
      />

      <div className="ws-callout text-sm leading-relaxed space-y-1">
        <div>
          <i className="fa-solid fa-triangle-exclamation mr-1.5" />
          เริ่มดำเนินการ<strong>ก่อนครบเพดาน</strong>เพื่อไม่ให้การคุ้มครองขาดช่วง
        </div>
        <div>
          ห้ามต่อ คบ.14 เกินเพดาน · ห้ามย้อนหลังวัน · เส้นทางนี้{' '}
          <strong>ไม่ถือเป็นวิธีที่ 4 (ประสานหน่วยงานอื่น)</strong> จึงต้องผ่านมติคณะกรรมการ ป.ป.ท.
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="ws-card border-dashed p-10 text-center text-[0.88rem] text-muted">
          ยังไม่มีสำนวนที่เข้าเงื่อนไขส่งต่อกรมคุ้มครองสิทธิฯ
        </div>
      ) : (
        <div className="space-y-5">
          {candidates.map((c) => (
            <CaseLockScope key={c.no} caseItem={c}>
              <Article14Panel caseItem={c} role={currentRole} />
            </CaseLockScope>
          ))}
        </div>
      )}
    </div>
  )
}

const Article14Panel: React.FC<{ caseItem: CaseItem; role: string }> = ({ caseItem, role }) => {
  const {
    openArticle14,
    reviewArticle14,
    recordArticle14Resolution,
    addOfficialLetter,
    completeArticle14Handover,
    recordArticle14DeliveryFailure,
    recordArticle14Reply,
  } = useCaseStore()
  const a14 = caseItem.article14
  /** WIT0713 — เรื่องนี้เข้า 08C เพราะผลพิจารณาของเลขาธิการฯ ไม่ใช่เพราะใกล้ครบเพดาน */
  const referral = caseItem.article14Referral
  const summary = summarizeEpisode(caseItem.episode || deriveEpisode(caseItem))

  const [draft, setDraft] = useState({
    threatSummary: '',
    riskAssessment: '',
    recommendedMeasure: 'general' as 'general' | 'special',
  })
  const [note, setNote] = useState('')
  const [resolution, setResolution] = useState({ no: '', note: '' })
  const [letter, setLetter] = useState({ registryNo: '', registryDate: todayIso(), channel: 'direct' })
  const [handover, setHandover] = useState({
    handoverCompletedAt: todayIso(),
    successorStartedAt: todayIso(),
    successorLegalBasis: 'พระราชบัญญัติคุ้มครองพยานในคดีอาญา พ.ศ. 2546 (มาตรการทั่วไป)',
  })
  /** WIT0860 — หนังสือตอบรับขาเข้าจากกรม */
  const [reply, setReply] = useState({
    registryNo: '',
    registryDate: todayIso(),
    contactPerson: '',
    channel: 'direct' as 'direct' | 'post' | 'official_other',
    appointmentAt: '',
    conditions: '',
    documentName: '',
  })
  const [failure, setFailure] = useState({ reason: '', approach: '', note: '' })

  /** WIT0859 — ต้องมีหนังสือขาออกถึงกรมก่อน จึงบันทึกหนังสือตอบรับ (WIT0860) ได้ */
  const hasOutgoingLetter = (caseItem.officialLetters || []).some((l) => l.context === 'article14' && l.direction === 'outgoing')

  const isOfficer = ['officer', 'case_owner', 'admin'].includes(role)
  const isSupervisor = ['supervisor', 'admin'].includes(role)
  const isSecretary = ['secretary', 'deputy_secretary', 'admin'].includes(role)
  const isCommittee = ['committee', 'admin'].includes(role)

  return (
    <section className="ws-card p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <p className="ws-kicker">เส้นทางส่งต่อกรมคุ้มครองสิทธิฯ</p>
          <h3 className="text-base font-bold text-navy">
            {caseItem.no} · {caseItem.person}
          </h3>
          <p className="text-[0.8rem] text-muted">
            คุ้มครองสะสม {Number((summary.cumulative / summary.cap * 6).toFixed(1))} เดือน · สูงสุด 6 เดือน
            {a14 ? ` · ขั้นตอน: ${STEP_LABELS[a14.step]}` : ''}
          </p>
          {referral ? (
            <p
              data-testid="article14-referral-badge"
              className="mt-1.5 inline-flex items-start gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[0.8rem] font-semibold text-blue-800"
            >
              <i className="fa-solid fa-file-circle-check mt-0.5" />
              <span>
                มาจากผลพิจารณาและคำสั่ง — เห็นควรส่งต่อกรมคุ้มครองสิทธิฯ · {referral.decisionNo} · {referral.at}
                <span className="block font-normal text-blue-700">{referral.reason}</span>
              </span>
            </p>
          ) : null}
        </div>
        <Link
          to="/dossier/$caseNo"
          params={{ caseNo: caseItem.no }}
          className="inline-flex min-h-[38px] items-center rounded-lg border border-[#9aabba] bg-white px-3 py-1.5 text-[0.85rem] font-semibold text-navy hover:bg-slate-50 transition"
        >
          เปิดแฟ้ม
        </Link>
      </div>

      {/* WIT0713/WIT0852 — ใกล้ครบเพดาน (เหลือ ≤30 วัน) แต่ยังไม่ถึงเพดาน — ชวนเริ่มเรื่องข้อ 14 ล่วงหน้า */}
      {!a14 && !summary.atCap && summary.nearCap && (
        <div
          data-testid="article14-near-cap-hint"
          className="ws-callout text-sm leading-relaxed"
        >
          <i className="fa-solid fa-hourglass-half mr-1.5" />
          คุ้มครองสะสมใกล้ครบเพดานแล้ว (ใกล้ครบ 6 เดือน) — แนะนำให้<strong>เริ่มจัดทำเรื่องส่งต่อกรมคุ้มครองสิทธิฯ ตั้งแต่ตอนนี้</strong>
          เพื่อให้ทันก่อนครบเพดาน มาตรการคุ้มครองปัจจุบันยังคงมีผลอยู่ตามเดิมจนกว่ามาตรการใหม่จะเริ่มใช้จริง
          ไม่ต้องรอให้ถึงเพดานก่อนจึงเริ่มเรื่อง
        </div>
      )}

      {/* WIT0854 — จัดทำเรื่องเสนอ */}
      {(!a14 || a14.step === 'proposal_draft') && isOfficer && (
        <div className="space-y-3">
          <label className="block">
            <span className="ws-label mb-1 block">เหตุความไม่ปลอดภัยที่ยังคงอยู่ *</span>
            <textarea
              rows={3}
              value={draft.threatSummary}
              onChange={(e) => setDraft((p) => ({ ...p, threatSummary: e.target.value }))}
              className="ws-input w-full"
            />
          </label>
          <label className="block">
            <span className="ws-label mb-1 block">
              รายงานผล / ประเมินความเสี่ยง (อ้าง คบ.13 และคำสั่งเดิม) *
            </span>
            <textarea
              rows={3}
              value={draft.riskAssessment}
              onChange={(e) => setDraft((p) => ({ ...p, riskAssessment: e.target.value }))}
              className="ws-input w-full"
            />
          </label>
          <label className="block">
            <span className="ws-label mb-1 block">ความเห็นว่าควรใช้มาตรการใด</span>
            <select
              value={draft.recommendedMeasure}
              onChange={(e) => setDraft((p) => ({ ...p, recommendedMeasure: e.target.value as 'general' | 'special' }))}
              className="ws-input w-full"
            >
              <option value="general">มาตรการทั่วไป</option>
              <option value="special">มาตรการพิเศษ</option>
            </select>
          </label>
          <Button
            type="button"
            data-testid="submit-article14-proposal"
            onClick={async () => {
              if (!draft.threatSummary.trim() || !draft.riskAssessment.trim()) {
                showToast('กรุณากรอกเหตุความไม่ปลอดภัยและผลประเมินความเสี่ยง')
                return
              }
              const confirmed = await showConfirmAlert({
                icon: 'question',
                title: a14 ? 'ยืนยันเสนอ Revision ใหม่' : 'ยืนยันเสนอเรื่องส่งต่อกรมคุ้มครองสิทธิฯ',
                text: `เสนอใช้มาตรการ${draft.recommendedMeasure === 'special' ? 'พิเศษ' : 'ทั่วไป'} — เรื่องจะเข้าคิวผู้บังคับบัญชาตรวจ ก่อนเสนอเลขาธิการฯ และคณะกรรมการ ป.ป.ท.`,
                showCancelButton: true,
                confirmButtonText: 'ยืนยันเสนอ',
                cancelButtonText: 'ยกเลิก',
              })
              if (!confirmed.isConfirmed) return
              openArticle14(caseItem.no, draft)
              showToast('เสนอเรื่องส่งต่อกรมคุ้มครองสิทธิฯ ตามลำดับชั้นแล้ว')
            }}
            className="min-h-[44px] rounded-lg bg-navy px-5 py-2.5 text-[0.88rem] font-semibold text-white hover:bg-blue transition"
          >
            <i className="fa-solid fa-file-arrow-up mr-1.5" />
            {a14 ? 'เสนอ Revision ใหม่' : 'จัดทำและเสนอเรื่องส่งต่อกรมคุ้มครองสิทธิฯ'}
          </Button>
        </div>
      )}

      {a14 && (
        <div className="rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-700 space-y-1">
          <div>
            <strong>เหตุภัย:</strong> {a14.threatSummary}
          </div>
          <div>
            <strong>ประเมินความเสี่ยง:</strong> {a14.riskAssessment}
          </div>
          <div>
            <strong>เสนอใช้:</strong> มาตรการ{a14.recommendedMeasure === 'special' ? 'พิเศษ' : 'ทั่วไป'}
          </div>
          {a14.revisions.length > 0 && (
            <div className="pt-1 text-[0.8rem] text-warning">
              ส่งคืนแก้ไขแล้ว {a14.revisions.length} ครั้ง — ล่าสุด: {a14.revisions[a14.revisions.length - 1].reason}
            </div>
          )}
        </div>
      )}

      {/* WIT0855-0856 — กลั่นกรองตามลำดับชั้น */}
      {a14 && ((a14.step === 'supervisor_review' && isSupervisor) || (a14.step === 'secretary_review' && isSecretary)) && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ความเห็นประกอบ / เหตุผลที่ส่งคืนแก้ไข"
            className="ws-input w-full"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              data-testid="article14-endorse-button"
              onClick={async () => {
                const step = a14.step === 'supervisor_review' ? 'supervisor' : 'secretary'
                if (!(await confirmAction('ยืนยันเห็นชอบและเสนอขั้นถัดไป', 'บันทึกความเห็นประกอบและส่งเรื่องขึ้นตามลำดับชั้น', 'ยืนยันเห็นชอบ'))) return
                reviewArticle14(caseItem.no, step, true, note || 'เห็นชอบ')
                setNote('')
                showToast('บันทึกความเห็นและเสนอขั้นถัดไปแล้ว')
              }}
              className="min-h-[44px] rounded-lg bg-success px-4 py-2.5 text-[0.88rem] font-semibold text-white hover:bg-emerald-800 transition"
            >
              เห็นชอบ · เสนอขั้นถัดไป
            </Button>
            <Button
              type="button"
              data-testid="article14-return-button"
              onClick={async () => {
                if (!note.trim()) {
                  showToast('กรุณาระบุเหตุผลที่ส่งคืนแก้ไข')
                  return
                }
                const step = a14.step === 'supervisor_review' ? 'supervisor' : 'secretary'
                if (!(await confirmAction('ยืนยันส่งคืนแก้ไข', note, 'ยืนยันส่งคืน'))) return
                reviewArticle14(caseItem.no, step, false, note)
                setNote('')
                showToast('ส่งคืนแก้ไขและบันทึก Revision แล้ว')
              }}
              className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition"
            >
              ส่งคืนแก้ไข
            </Button>
          </div>
        </div>
      )}

      {/* WIT0857 — มติคณะกรรมการ */}
      {a14?.step === 'committee_pending' && isCommittee && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={resolution.no}
              onChange={(e) => setResolution((p) => ({ ...p, no: e.target.value }))}
              placeholder="เลขที่มติ / ครั้งที่ประชุม"
              className="ws-input"
            />
            <input
              value={resolution.note}
              onChange={(e) => setResolution((p) => ({ ...p, note: e.target.value }))}
              placeholder="สาระสำคัญของมติ"
              className="ws-input"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              data-testid="article14-committee-approve"
              onClick={async () => {
                if (!resolution.no.trim()) {
                  showToast('กรุณาระบุเลขที่มติ')
                  return
                }
                if (!(await confirmAction('ยืนยันมติเห็นชอบส่งกรมคุ้มครองสิทธิฯ', `มติที่ ${resolution.no}`, 'ยืนยันมติ'))) return
                recordArticle14Resolution(caseItem.no, resolution.no, true, resolution.note)
                showToast('บันทึกมติเห็นชอบส่งกรมคุ้มครองสิทธิฯ แล้ว')
              }}
              className="min-h-[44px] rounded-lg bg-success px-4 py-2.5 text-[0.88rem] font-semibold text-white hover:bg-emerald-800 transition"
            >
              มติ: เห็นชอบส่งกรม
            </Button>
            <Button
              type="button"
              data-testid="article14-committee-reject"
              onClick={async () => {
                if (!resolution.no.trim()) {
                  showToast('กรุณาระบุเลขที่มติ')
                  return
                }
                if (!(await confirmAction('ยืนยันมติไม่เห็นชอบ', `มติที่ ${resolution.no} — ดำเนินการตามคำสั่งเดิมต่อไป`, 'ยืนยันมติ'))) return
                recordArticle14Resolution(caseItem.no, resolution.no, false, resolution.note)
                showToast('บันทึกมติไม่เห็นชอบ — ดำเนินการตามคำสั่งเดิม')
              }}
              className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition"
            >
              มติ: ไม่เห็นชอบ
            </Button>
          </div>
        </div>
      )}

      {a14?.step === 'committee_rejected' && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-900">
          คณะกรรมการไม่เห็นชอบ (มติที่ {a14.committeeResolutionNo}) — ดำเนินการตามคำสั่งเดิม
          เมื่อมาตรการเดิมสิ้นสุดให้เข้าสู่{' '}
          <Link to="/termination" className="font-bold underline">
            กระบวนการยุติ
          </Link>
        </div>
      )}

      {/* WIT0859-0860 — หนังสือขาออก/ขาเข้า */}
      {a14?.step === 'letter_sent' && isOfficer && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <div className="text-sm font-bold text-navy">หนังสือแจ้ง/ประสาน {ARTICLE14_TARGET_AGENCY}</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              value={letter.registryNo}
              onChange={(e) => setLetter((p) => ({ ...p, registryNo: e.target.value }))}
              placeholder="เลขที่หนังสือ (สารบรรณเดิม)"
              className="ws-input"
            />
            <input
              type="date"
              value={letter.registryDate}
              onChange={(e) => setLetter((p) => ({ ...p, registryDate: e.target.value }))}
              className="ws-input"
            />
            <select
              value={letter.channel}
              onChange={(e) => setLetter((p) => ({ ...p, channel: e.target.value }))}
              className="ws-input"
            >
              {OFFICIAL_LETTER_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            onClick={async () => {
              if (!letter.registryNo.trim()) {
                showToast('กรุณาระบุเลขที่หนังสือจากระบบสารบรรณ')
                return
              }
              if (!(await confirmAction('ยืนยันบันทึกหนังสือขาออก', `เลขที่ ${letter.registryNo} ถึง ${ARTICLE14_TARGET_AGENCY}`, 'ยืนยันบันทึก'))) return
              addOfficialLetter(caseItem.no, {
                direction: 'outgoing',
                context: 'article14',
                subject: `หนังสือแจ้งมติและประสานส่งต่อการคุ้มครองไปยังกรมคุ้มครองสิทธิและเสรีภาพ (มติที่ ${a14.committeeResolutionNo})`,
                registryNo: letter.registryNo,
                registryDate: letter.registryDate,
                agency: ARTICLE14_TARGET_AGENCY,
                channel: letter.channel as 'direct' | 'post' | 'official_other',
                sentAt: new Date().toISOString(),
              })
              showToast('บันทึกหนังสือขาออกแล้ว')
            }}
            className="min-h-[44px] rounded-lg bg-navy px-4 py-2.5 text-[0.88rem] font-semibold text-white hover:bg-blue transition"
          >
            บันทึกหนังสือขาออก
          </Button>
        </div>
      )}

      {/* WIT0860 — รับหนังสือตอบรับขาเข้าจากกรม บันทึกเข้าแฟ้มก่อนเตรียมส่งมอบ (WIT0861) */}
      {a14?.step === 'letter_sent' && isOfficer && (
        <div className="space-y-2 border-t border-slate-200 pt-3" data-testid="article14-reply-form">
          <div className="text-sm font-bold text-navy">บันทึกหนังสือตอบรับจาก {ARTICLE14_TARGET_AGENCY}</div>
          {!hasOutgoingLetter ? (
            <p data-testid="article14-reply-locked" className="rounded-lg border border-line bg-soft p-2.5 text-[0.8rem] text-slate-600">
              ต้องบันทึกหนังสือขาออกถึงกรมก่อน จึงจะบันทึกหนังสือตอบรับและส่งมอบได้
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  value={reply.registryNo}
                  onChange={(e) => setReply((p) => ({ ...p, registryNo: e.target.value }))}
                  placeholder="เลขที่หนังสือตอบรับของกรม"
                  className="ws-input"
                />
                <input
                  type="date"
                  aria-label="วันที่หนังสือตอบรับ"
                  value={reply.registryDate}
                  onChange={(e) => setReply((p) => ({ ...p, registryDate: e.target.value }))}
                  className="ws-input"
                />
                <input
                  value={reply.contactPerson}
                  onChange={(e) => setReply((p) => ({ ...p, contactPerson: e.target.value }))}
                  placeholder="ผู้ประสานของกรม"
                  className="ws-input"
                />
                <select
                  aria-label="ช่องทางประสาน"
                  value={reply.channel}
                  onChange={(e) => setReply((p) => ({ ...p, channel: e.target.value as 'direct' | 'post' | 'official_other' }))}
                  className="ws-input"
                >
                  {OFFICIAL_LETTER_CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <label className="block sm:col-span-1">
                  <span className="sr-only">วันนัดส่งมอบ</span>
                  <input
                    type="date"
                    aria-label="วันนัดส่งมอบ"
                    value={reply.appointmentAt}
                    onChange={(e) => setReply((p) => ({ ...p, appointmentAt: e.target.value }))}
                    className="ws-input w-full"
                  />
                </label>
                <input
                  value={reply.conditions}
                  onChange={(e) => setReply((p) => ({ ...p, conditions: e.target.value }))}
                  placeholder="เงื่อนไขของกรม (ถ้ามี)"
                  className="ws-input"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg bg-navy px-4 text-[0.88rem] font-semibold text-white transition hover:bg-blue">
                  <i className="fa-solid fa-cloud-arrow-up text-[0.8rem]" />
                  แนบหนังสือตอบรับของกรม
                  <input
                    type="file"
                    accept={ATTACHMENT_ACCEPT}
                    className="hidden"
                    data-testid="article14-reply-file"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (!file) return
                      const rejection = getAttachmentRejection(file)
                      if (rejection) {
                        showToast(rejection, 'error')
                        return
                      }
                      setReply((p) => ({ ...p, documentName: file.name }))
                    }}
                  />
                </label>
                {reply.documentName && (
                  <span className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[0.8rem] font-semibold text-emerald-800">
                    <i className="fa-solid fa-paperclip" />
                    {reply.documentName}
                  </span>
                )}
              </div>
              <Button
                type="button"
                data-testid="article14-record-reply"
                onClick={async () => {
                  if (!reply.registryNo.trim() || !reply.contactPerson.trim() || !reply.appointmentAt || !reply.documentName) {
                    showToast('กรุณาระบุเลขที่หนังสือ ผู้ประสาน วันนัด และแนบหนังสือตอบรับของกรม')
                    return
                  }
                  if (!(await confirmAction('ยืนยันบันทึกหนังสือตอบรับจากกรม', `เลขที่ ${reply.registryNo} · วันนัด ${reply.appointmentAt}`, 'ยืนยันบันทึก'))) return
                  recordArticle14Reply(caseItem.no, {
                    ...reply,
                    registryDate: reply.registryDate || todayIso(),
                  })
                  showToast('บันทึกหนังสือตอบรับจากกรมแล้ว — เตรียมส่งมอบได้')
                }}
                className="min-h-[44px] rounded-lg bg-navy px-4 py-2.5 text-[0.88rem] font-semibold text-white hover:bg-blue transition"
              >
                บันทึกหนังสือตอบรับจากกรม
              </Button>
            </>
          )}
        </div>
      )}

      {a14 && ['response_received', 'handover_ready'].includes(a14.step) && (
        <div data-testid="article14-reply-summary" className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900 space-y-0.5">
          <div>
            <strong>หนังสือตอบรับจากกรม:</strong> เลขที่ {a14.replyRegistryNo} · ลงวันที่ {a14.replyRegistryDate} · ผู้ประสาน {a14.replyContactPerson}
          </div>
          <div>
            วันนัด {a14.replyAppointmentAt} · เงื่อนไข: {a14.replyConditions || '-'} · ไฟล์: {a14.replyDocumentName}
          </div>
        </div>
      )}

      {/* WIT0861-0863 — ส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่ (เปิดหลังบันทึกหนังสือตอบรับ WIT0860 แล้วเท่านั้น) */}
      {a14 && ['response_received', 'handover_ready'].includes(a14.step) && isOfficer && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <div className="text-sm font-bold text-navy">ส่งมอบจริงและเริ่มมาตรการภายใต้หน่วยงานใหม่</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="ws-label mb-1 block">วันส่งมอบจริง</span>
              <input
                type="date"
                value={handover.handoverCompletedAt}
                onChange={(e) => setHandover((p) => ({ ...p, handoverCompletedAt: e.target.value }))}
                className="ws-input w-full"
              />
            </label>
            <label className="block">
              <span className="ws-label mb-1 block">วันเริ่มมาตรการของหน่วยงานใหม่</span>
              <input
                type="date"
                value={handover.successorStartedAt}
                onChange={(e) => setHandover((p) => ({ ...p, successorStartedAt: e.target.value }))}
                className="ws-input w-full"
              />
            </label>
            <label className="block">
              <span className="ws-label mb-1 block">ฐานกฎหมายของหน่วยงานใหม่</span>
              <input
                value={handover.successorLegalBasis}
                onChange={(e) => setHandover((p) => ({ ...p, successorLegalBasis: e.target.value }))}
                className="ws-input w-full"
              />
            </label>
          </div>
          <Button
            type="button"
            onClick={async () => {
              if (
                !(await confirmAction(
                  'ยืนยันส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่',
                  'Episode มาตรการเบื้องต้นของ ป.ป.ท. จะถูกปิดตามวันที่มีผล',
                  'ยืนยันส่งมอบ'
                ))
              )
                return
              completeArticle14Handover(caseItem.no, {
                handoverCompletedAt: handover.handoverCompletedAt,
                successorStartedAt: new Date(handover.successorStartedAt).toISOString(),
                successorLegalBasis: handover.successorLegalBasis,
              })
              showToast('ส่งมอบแล้ว — ปิด Episode มาตรการเบื้องต้นและเชื่อม Episode ของกรม')
            }}
            className="min-h-[44px] rounded-lg bg-success px-5 py-2.5 text-[0.88rem] font-semibold text-white hover:bg-emerald-800 transition"
          >
            <i className="fa-solid fa-people-arrows mr-1.5" />
            บันทึกส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่
          </Button>
          <p className="text-[0.8rem] text-muted">
            Episode มาตรการเบื้องต้นของ ป.ป.ท. จะปิดตามวันที่มีผล และคงประวัติการส่งมอบไว้ในแฟ้ม
          </p>
        </div>
      )}

      {/* WIT0860 แขนง — กรมคุ้มครองสิทธิฯ แจ้งว่าดำเนินการไม่ได้ */}
      {a14?.step === 'letter_sent' && isOfficer && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <div className="text-[0.8rem] font-bold text-rose-700">
            <i className="fa-solid fa-triangle-exclamation mr-1.5" />
            {ARTICLE14_TARGET_AGENCY} แจ้งว่าดำเนินการไม่ได้
          </div>
          <label className="block">
            <span className="ws-label mb-1 block">เหตุที่ดำเนินการไม่ได้ *</span>
            <textarea
              rows={2}
              value={failure.reason}
              onChange={(e) => setFailure((p) => ({ ...p, reason: e.target.value }))}
              placeholder="ระบุเหตุผลตามหนังสือแจ้งของกรม"
              className="ws-input w-full"
            />
          </label>
          <label className="block">
            <span className="ws-label mb-1 block">แนวทางที่เสนอ *</span>
            <input
              value={failure.approach}
              onChange={(e) => setFailure((p) => ({ ...p, approach: e.target.value }))}
              placeholder="เช่น คงมาตรการเดิม/ประสานหน่วยงานอื่น/เสนอคณะกรรมการใหม่"
              className="ws-input w-full"
            />
          </label>
          <textarea
            rows={2}
            value={failure.note}
            onChange={(e) => setFailure((p) => ({ ...p, note: e.target.value }))}
            placeholder="หมายเหตุประกอบ (ไม่บังคับ)"
            className="ws-input w-full"
          />
          <Button
            type="button"
            data-testid="article14-delivery-failed"
            onClick={async () => {
              if (!failure.reason.trim() || !failure.approach.trim()) {
                showToast('กรุณาระบุเหตุที่ดำเนินการไม่ได้และแนวทางที่เสนอ')
                return
              }
              if (
                !(await confirmAction(
                  'ยืนยันบันทึกว่ากรมดำเนินการไม่ได้',
                  'ระบบจะเปิดงานเสนอผู้มีอำนาจ (ผบช.ชั้นต้น → ผอ.สำนัก/กอง) ทันที มาตรการคุ้มครองเดิมยังคงมีผลอยู่ระหว่างพิจารณา',
                  'ยืนยันบันทึก'
                ))
              )
                return
              recordArticle14DeliveryFailure(caseItem.no, {
                failedReason: failure.reason.trim(),
                proposedApproach: failure.approach.trim(),
                note: failure.note.trim() || undefined,
              })
              setFailure({ reason: '', approach: '', note: '' })
              showToast('บันทึกแล้ว — เสนอผู้มีอำนาจพิจารณาแนวทางใหม่ตามลำดับชั้น')
            }}
            className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition"
          >
            <i className="fa-solid fa-ban mr-1.5" />
            บันทึกว่ากรมดำเนินการไม่ได้
          </Button>
        </div>
      )}

      {/* WIT0860 แขนง — งานเสนอผู้มีอำนาจหลังกรมดำเนินการไม่ได้ (คงอยู่จนกว่าจะอนุมัติแนวทางใหม่) */}
      {(a14?.step === 'delivery_failed' || latestArticle14Escalation(caseItem)) && (
        <div className="border-t border-slate-200 pt-3">
          <Article14EscalationCard caseItem={caseItem} />
        </div>
      )}

      {a14?.step === 'handover_done' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900">
          ส่งมอบให้กรมคุ้มครองสิทธิฯ เรียบร้อยแล้ว — {ARTICLE14_TARGET_AGENCY} เริ่มมาตรการตั้งแต่{' '}
          {a14.successorStartedAt?.slice(0, 10)} · ฐานกฎหมาย: {a14.successorLegalBasis}
        </div>
      )}
    </section>
  )
}
