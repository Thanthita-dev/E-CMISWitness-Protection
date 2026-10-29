import { Article14CoordinationPanel } from '../components/protection/Article14CoordinationPanel'
import { requiresReferralCommittee } from '../lib/referralDocumentIdentity'
import { ReferralDocumentsPanel } from '../components/dossier/ReferralDocumentsPanel'
import { isRightsReferral } from '../lib/referralDocumentIdentity'
import { useVisibleCases } from '../hooks/useVisibleCases'
import React, { useState } from 'react'
import { createFileRoute, Link, Navigate, useNavigate } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { Button } from '../components/common/Button'
import { useCaseStore } from '../store/useCaseStore'
import { CaseLockScope } from '../components/common/CaseLockScope'
import { useAuthStore } from '../store/useAuthStore'
import { Article14Step, CaseItem, CoordinationAgencyType } from '../types/case'
import { ARTICLE14_AGENCIES, ARTICLE14_AGENCY_ORDER, ARTICLE14_STEP_LABELS, DEFAULT_ARTICLE14_AGENCY, OFFICIAL_LETTER_CHANNELS, PROTECTION_TOTAL_CAP_DAYS, article14Agency, isArticle14AgencyType } from '../lib/constants'
import { canProposeAgencyReferral, deriveEpisode, isEarlyArticle14, summarizeEpisode } from '../lib/episode'
import { showToast, showConfirmAlert } from '../lib/swal'
import { ATTACHMENT_ACCEPT, getAttachmentRejection } from '../lib/fileValidation'
import { Article14EscalationCard, latestArticle14Escalation } from '../components/protection/Article14EscalationCard'
import { Article14ReviewFlow } from '../components/protection/Article14ReviewFlow'
import { sarabanInTransit } from '../lib/saraban'
import { VoiceTextarea } from '../components/common/VoiceTextarea'

export const Route = createFileRoute('/article14')({
  /** agency — หน่วยงานปลายทางที่เลือกในป็อปอัป "เสนอส่งต่อหน่วยงานอื่น" ใช้เป็นค่าเริ่มต้นของฟอร์มเสนอ */
  validateSearch: (search: Record<string, unknown>): { caseNo?: string; agency?: CoordinationAgencyType } => ({
    caseNo: typeof search.caseNo === 'string' ? search.caseNo : undefined,
    agency: isArticle14AgencyType(search.agency) ? search.agency : undefined,
  }),
  component: Article14Page,
})


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
 * หน้า 08C — ส่งต่อหน่วยงานอื่นตามข้อ 14 (กรมการปกครอง / ตำรวจ / ทหาร / กรมคุ้มครองสิทธิและเสรีภาพ)
 *
 * คนละเส้นทางกับวิธีที่ 4 ตามข้อ 15(4): เสนอตามลำดับชั้น ผบช.ชั้นต้น → ผอ.สำนัก/กอง → รองเลขาธิการ → เลขาธิการ
 * แล้วเจ้าหน้าที่บันทึกการนำส่งหนังสือถึงกรมและการได้รับหนังสือตอบรับ
 * เริ่มดำเนินการก่อนครบเพดานเพื่อไม่ให้การคุ้มครองขาดช่วง
 */
function Article14Page() {
  const { caseNo, agency } = Route.useSearch()
  const cases = useVisibleCases()
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
    /** เปิดจากแฟ้ม/ภาพรวม (?caseNo=) — เคสที่เริ่มคุ้มครองแล้ว รวมถึงวิธีที่ 4 เสนอส่งต่อได้ทุกเมื่อ ไม่ต้องรอใกล้ครบเพดาน */
    if (caseNo && canProposeAgencyReferral(c)) return true
    const summary = summarizeEpisode(c.episode || deriveEpisode(c))
    return summary.atCap || summary.nearCap
  })

  if (caseNo && candidates.some(c => c.article14 && isRightsReferral(c))) return <Navigate to="/dossier/$caseNo" params={{ caseNo }} />

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="งานคุ้มครองพยาน · ส่งต่อหน่วยงานอื่น"
        title="ส่งต่อหน่วยงานอื่นช่วยคุ้มครองพยาน"
        description={`ทางเข้า 3 ทาง — คุ้มครองใกล้ครบ/ครบเพดานรวม 6 เดือนแต่ยังมีภัย · เลขาธิการฯ เห็นควรส่งต่อตั้งแต่ชั้นผลพิจารณาและคำสั่ง · หรือเจ้าหน้าที่เห็นควรเสนอก่อนครบ 6 เดือน · เรื่องส่งกรมคุ้มครองสิทธิฯ ต้องผ่านคณะกรรมการอนุมัติ`}
      />

      <div className="ws-callout text-sm leading-relaxed space-y-1">
        <div>
          <i className="fa-solid fa-triangle-exclamation mr-1.5" />
          เริ่มดำเนินการ<strong>ก่อนครบเพดาน</strong>เพื่อไม่ให้การคุ้มครองขาดช่วง
        </div>
        <div>
          ห้ามต่อ คบ.14 เกินเพดาน · ห้ามย้อนหลังวัน · เส้นทางนี้{' '}
          <strong>ไม่ถือเป็นวิธีที่ 4 (ประสานหน่วยงานอื่น)</strong> จึงต้องเสนอตามลำดับชั้นจนถึงเลขาธิการ
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="ws-card border-dashed p-10 text-center text-[0.88rem] text-muted">
          ยังไม่มีสำนวนที่เข้าเงื่อนไขส่งต่อหน่วยงานอื่น
        </div>
      ) : (
        <div className="space-y-5">
          {candidates.map((c) => (
            <CaseLockScope key={c.no} caseItem={c}>
              {c.article14 && isRightsReferral(c) ? <Link to="/dossier/$caseNo" params={{ caseNo: c.no }} className="ws-card flex items-center justify-between p-5 font-semibold text-navy"><span>{c.no} · {c.person}</span><span>เปิดแฟ้ม</span></Link> : <Article14Panel caseItem={c} role={currentRole} initialAgency={agency} />}
            </CaseLockScope>
          ))}
        </div>
      )}
    </div>
  )
}

const Article14Panel: React.FC<{ caseItem: CaseItem; role: string; initialAgency?: CoordinationAgencyType }> = ({ caseItem, role, initialAgency }) => {
  const {
    openArticle14,
    reviewArticle14,
    recordArticle14Resolution,
    addOfficialLetter,
    completeArticle14Handover,
    recordArticle14DeliveryFailure,
    recordArticle14Reply,
    sendArticle14ToCommittee,
  } = useCaseStore()
  const a14 = caseItem.article14
  /** WIT0713 — เรื่องนี้เข้า 08C เพราะผลพิจารณาของเลขาธิการฯ ไม่ใช่เพราะใกล้ครบเพดาน */
  const referral = caseItem.article14Referral
  const summary = summarizeEpisode(caseItem.episode || deriveEpisode(caseItem))
  /** เสนอก่อนครบ 6 เดือน — เปิดเรื่องแล้วยึดตามที่บันทึกไว้ ยังไม่เปิดให้คำนวณจากยอดสะสมปัจจุบัน */
  const early = a14 ? Boolean(a14.earlyReferral) : !referral && isEarlyArticle14(summary)

  const navigate = useNavigate()
  /** หน่วยงานปลายทาง — เปิดเรื่องแล้วยึดตามที่บันทึกไว้ ยังไม่เปิดใช้ที่เลือกในป็อปอัป (ค่าตั้งต้นกรมคุ้มครองสิทธิฯ) */
  const [agencyType, setAgencyType] = useState<CoordinationAgencyType>(a14?.targetAgencyType || initialAgency || DEFAULT_ARTICLE14_AGENCY)
  const agency = a14 && a14.step !== 'proposal_draft' ? article14Agency(caseItem) : ARTICLE14_AGENCIES[agencyType]
  const [draft, setDraft] = useState({
    threatSummary: a14?.threatSummary || '',
    riskAssessment: a14?.riskAssessment || '',
  })
  const [note, setNote] = useState('')
  const [resolution, setResolution] = useState({ no: '', note: '' })
  const [letter, setLetter] = useState({ registryNo: '', registryDate: todayIso(), channel: 'direct', contactPerson: '' })
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

  /** WIT0859 — ต้องมีหนังสือขาออกถึงหน่วยงานปลายทางก่อน จึงบันทึกหนังสือตอบรับ (WIT0860) ได้ */
  const outgoingLetter = (caseItem.officialLetters || []).find((l) => l.context === 'article14' && l.direction === 'outgoing')
  const hasOutgoingLetter = Boolean(outgoingLetter)
  /** เหตุที่อนุมัติส่งกรม — เส้นทางปัจจุบันคือเลขาธิการเห็นชอบ ข้อมูลเก่าอาจเป็นมติคณะกรรมการ */
  const approvalRef = a14?.committeeResolutionNo ? `มติที่ ${a14.committeeResolutionNo}` : `เลขาธิการเห็นชอบ ${a14?.secretaryAt || ''}`.trim()

  /** ชุดนำส่งค้างที่ธุรการ — เจ้าหน้าที่ยังเปิด/ส่ง/บันทึกหนังสือไม่ได้จนกว่าธุรการหน่วยลงเลขรับครบ */
  const inTransit = sarabanInTransit(caseItem, 'article14')
  const isOfficer = !inTransit && ['officer', 'case_owner', 'got_officer', 'admin'].includes(role)
  const isCommittee = ['committee', 'admin'].includes(role)

  return (
    <section className="ws-card p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <p className="ws-kicker">เส้นทางส่งต่อ{agency.short}</p>
          <h3 className="text-base font-bold text-navy">
            {caseItem.no} · {caseItem.person}
          </h3>
          <p className="text-[0.8rem] text-muted">
            คุ้มครองสะสม {Number((summary.cumulative / summary.cap * 6).toFixed(1))} เดือน · สูงสุด 6 เดือน
            {a14 ? ` · ขั้นตอน: ${ARTICLE14_STEP_LABELS[a14.step]}` : ''}
          </p>
          {referral ? (
            <p
              data-testid="article14-referral-badge"
              className="mt-1.5 inline-flex items-start gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[0.8rem] font-semibold text-blue-800"
            >
              <i className="fa-solid fa-file-circle-check mt-0.5" />
              <span>
                มาจากผลพิจารณาและคำสั่ง — เห็นควรส่งต่อหน่วยงานอื่น · {referral.decisionNo} · {referral.at}
                <span className="block font-normal text-blue-700">{referral.reason}</span>
              </span>
            </p>
          ) : null}
          {a14?.earlyReferral && (
            <p data-testid="article14-early-badge" className="ws-status mt-1.5">
              เสนอก่อนครบ 6 เดือน · ต้องผ่านคณะกรรมการ
            </p>
          )}
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
          คุ้มครองสะสมใกล้ครบเพดานแล้ว (ใกล้ครบ 6 เดือน) — แนะนำให้<strong>เริ่มจัดทำเรื่องส่งต่อ{agency.short} ตั้งแต่ตอนนี้</strong>
          เพื่อให้ทันก่อนครบเพดาน มาตรการคุ้มครองปัจจุบันยังคงมีผลอยู่ตามเดิมจนกว่ามาตรการใหม่จะเริ่มใช้จริง
          ไม่ต้องรอให้ถึงเพดานก่อนจึงเริ่มเรื่อง
        </div>
      )}

      {/* เสนอก่อนครบ 6 เดือน — เปิดได้ทุกเมื่อถ้าเห็นควร แต่ต้องผ่านคณะกรรมการหลังเลขาธิการเห็นชอบ */}
      {!a14 && early && (
        <div data-testid="article14-early-hint" className="ws-callout text-sm leading-relaxed">
          <i className="fa-solid fa-scale-balanced mr-1.5" aria-hidden="true" />
          คุ้มครองสะสม {Number((summary.cumulative / summary.cap * 6).toFixed(1))} เดือน ยังไม่ครบ 6 เดือน — เสนอส่งต่อ{agency.short}ได้หากเห็นควร
          โดยเสนอตามลำดับชั้นจนถึงเลขาธิการ แล้ว<strong>ส่งคณะกรรมการพิจารณา</strong>ก่อนส่งหนังสือถึงหน่วยงาน
          มาตรการคุ้มครองปัจจุบันยังคงมีผลระหว่างพิจารณา
        </div>
      )}

      {/* WIT0854 — จัดทำเรื่องเสนอ */}
      {/* สร้างหนังสือแจ้งกรมฯ แล้ว (เสนอครั้งแรกหรือ Revision) — ไม่แสดงฟอร์มซ้ำ ให้จัดทำหนังสือในแฟ้มแล้วส่งให้ผู้บังคับบัญชาชั้นต้น */}
      {(!a14 || (a14.step === 'proposal_draft' && !a14.revisionPreparedAt)) && isOfficer && (
        <div className="space-y-3">
          {/* หน่วยงานปลายทาง — ตัวเลือกชุดเดียวกับข้อ 4 ของ คบ.4/คบ.6 (ค่าตั้งต้นจากป็อปอัปหรือกรมคุ้มครองสิทธิฯ) */}
          <label className="block">
            <span className="ws-label mb-1 block">หน่วยงานที่เสนอส่งต่อ <span className="text-danger">*</span></span>
            <select
              data-testid="article14-target-agency"
              value={agencyType}
              onChange={(e) => setAgencyType(e.target.value as CoordinationAgencyType)}
              className="ws-input w-full"
            >
              {ARTICLE14_AGENCY_ORDER.map((value) => (
                <option key={value} value={value}>
                  {ARTICLE14_AGENCIES[value].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="ws-label mb-1 block">เหตุความไม่ปลอดภัยที่ยังคงอยู่ <span className="text-danger">*</span></span>
            <VoiceTextarea
              rows={3}
              value={draft.threatSummary}
              onChange={(e) => setDraft((p) => ({ ...p, threatSummary: e.target.value }))}
              className="ws-input w-full"
            />
          </label>
          <label className="block">
            <span className="ws-label mb-1 block">
              รายงานผล / ประเมินความเสี่ยง (อ้าง คบ.13 และคำสั่งเดิม) <span className="text-danger">*</span>
            </span>
            <VoiceTextarea
              rows={3}
              value={draft.riskAssessment}
              onChange={(e) => setDraft((p) => ({ ...p, riskAssessment: e.target.value }))}
              className="ws-input w-full"
            />
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
                title: a14?.revisions.length ? 'ยืนยันจัดทำ Revision ใหม่' : `ยืนยันจัดทำเรื่องส่งต่อ${agency.short}`,
                text: a14?.revisions.length
                  ? 'ระบบจะเพิ่มหนังสือแจ้งให้มีมาตรการช่วยเหลือแก่พยาน ฉบับใหม่เข้าแฟ้ม (เก็บฉบับเดิมไว้) แล้วพาไปแฟ้มเพื่อแก้ไขหนังสือ เรื่องยังอยู่กับเจ้าหน้าที่จนกว่าจะกดส่งให้ผู้บังคับบัญชาชั้นต้น'
                  : 'ระบบจะสร้างหนังสือแจ้งให้มีมาตรการช่วยเหลือแก่พยานเข้าแฟ้ม แล้วพาไปแฟ้มเพื่อจัดทำหนังสือ เรื่องยังอยู่กับเจ้าหน้าที่จนกว่าจะกดส่งให้ผู้บังคับบัญชาชั้นต้น',
                showCancelButton: true,
                confirmButtonText: 'ยืนยันจัดทำ',
                cancelButtonText: 'ยกเลิก',
              })
              if (!confirmed.isConfirmed) return
              openArticle14(caseItem.no, { ...draft, targetAgencyType: agencyType })
              const letterVersion = useCaseStore.getState().getCase(caseItem.no)?.article14?.letterVersion
              showToast(
                a14?.revisions.length
                  ? `เพิ่มหนังสือแจ้งให้มีมาตรการช่วยเหลือแก่พยาน ฉบับที่ ${letterVersion} เข้าแฟ้มแล้ว (ฉบับเดิมเก็บไว้เป็นประวัติ) — แก้ไขในแฟ้มแล้วส่งให้ผู้บังคับบัญชาชั้นต้น`
                  : 'สร้างหนังสือแจ้งให้มีมาตรการช่วยเหลือแก่พยานเข้าแฟ้มแล้ว — จัดทำหนังสือแล้วส่งให้ผู้บังคับบัญชาชั้นต้น'
              )
              navigate({ to: '/dossier/$caseNo', params: { caseNo: caseItem.no } })
            }}
            className="min-h-[44px] rounded-lg bg-navy px-5 py-2.5 text-[0.88rem] font-semibold text-white hover:bg-blue transition"
          >
            <i className="fa-solid fa-file-arrow-up mr-1.5" />
            {a14?.revisions.length ? 'จัดทำ Revision ใหม่ (เพิ่มหนังสือฉบับใหม่)' : `จัดทำเรื่องส่งต่อ${agency.short}`}
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
          {a14.revisions.length > 0 && (
            <div className="pt-1 text-[0.8rem] text-warning">
              ส่งคืนแก้ไขแล้ว {a14.revisions.length} ครั้ง — ล่าสุด: {a14.revisions[a14.revisions.length - 1].reason}
            </div>
          )}
        </div>
      )}

      {/* WIT0855-0856 — ส่ง/พิจารณาตามลำดับชั้น ผบช.ชั้นต้น → ผอ.สำนัก/กอง → รองเลขาธิการ → เลขาธิการ */}
      {isRightsReferral(caseItem) && (!initialAgency || initialAgency === 'rlpd') && <ReferralDocumentsPanel caseItem={caseItem} prepare />}
      <Article14ReviewFlow caseItem={caseItem} role={role} canEdit={isOfficer} />
      {inTransit && (a14?.step === 'letter_sent' || a14?.step === 'proposal_draft') && (
        <p className="text-[0.8rem] text-muted" data-testid="article14-in-transit-officer">
          <i className="fa-solid fa-route mr-1" aria-hidden="true" />
          อยู่ระหว่างธุรการลงทะเบียนนำส่ง — เจ้าหน้าที่ดำเนินการต่อได้เมื่อธุรการหน่วยลงเลขรับครบ
        </p>
      )}

      {/* เสนอก่อนครบ 6 เดือน — เลขาธิการเห็นชอบแล้ว เจ้าหน้าที่ส่งเรื่องให้คณะกรรมการ (พิจารณาในอีกกิจกรรม) */}
      {a14?.step === 'committee_pending' && requiresReferralCommittee(caseItem) && (
        <div data-testid="article14-committee-send" className="space-y-2 border-t border-slate-200 pt-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900">
            <i className="fa-solid fa-circle-check mr-1.5" aria-hidden="true" />
            เลขาธิการเห็นชอบเสนอส่งต่อ{agency.short}แล้ว ({a14.secretaryAt})
            {a14.secretaryNote && <span className="block text-emerald-800">ความเห็น: {a14.secretaryNote}</span>}
          </div>
          {a14.committeeSentAt ? (
            <p data-testid="article14-committee-sent" className="ws-callout text-sm leading-relaxed">
              <i className="fa-solid fa-paper-plane mr-1.5" aria-hidden="true" />
              ส่งคณะกรรมการพิจารณาแล้ว · {a14.committeeSentAt}
              {a14.committeeSentBy ? ` · โดย ${a14.committeeSentBy}` : ''} — รอผลพิจารณาของคณะกรรมการ
            </p>
          ) : isOfficer && !inTransit ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="primary"
                size="md"
                data-testid="article14-send-committee"
                onClick={async () => {
                  if (
                    !(await confirmAction(
                      'ยืนยันส่งให้คณะกรรมการ',
                      `ส่งเรื่องเสนอส่งต่อ${agency.short} ของแฟ้ม ${caseItem.no} ให้คณะกรรมการพิจารณาอนุมัติก่อนประสานหน่วยงานปลายทาง`,
                      'ยืนยันส่ง'
                    ))
                  )
                    return
                  sendArticle14ToCommittee(caseItem.no)
                  showToast('ส่งเรื่องให้คณะกรรมการพิจารณาแล้ว')
                }}
              >
                <i className="fa-solid fa-paper-plane text-xs" aria-hidden="true" />
                ส่งให้คณะกรรมการ
              </Button>
            </div>
          ) : (
            <p className="text-[0.8rem] text-muted">รอเจ้าหน้าที่เจ้าของสำนวนส่งเรื่องให้คณะกรรมการ</p>
          )}
        </div>
      )}

      {/* WIT0857 — มติคณะกรรมการ (ข้อมูลเก่าที่ค้างขั้นรอมติ) */}
      {a14?.step === 'committee_pending' && isCommittee && !inTransit && (!requiresReferralCommittee(caseItem) || Boolean(a14.committeeSentAt)) && (
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
                if (!(await confirmAction(`ยืนยันมติเห็นชอบส่ง${agency.short}`, `มติที่ ${resolution.no}`, 'ยืนยันมติ'))) return
                recordArticle14Resolution(caseItem.no, resolution.no, true, resolution.note)
                showToast(`บันทึกมติเห็นชอบส่ง${agency.short} แล้ว`)
              }}
              className="min-h-[44px] rounded-lg bg-success px-4 py-2.5 text-[0.88rem] font-semibold text-white hover:bg-emerald-800 transition"
            >
              มติ: เห็นชอบส่ง{agency.short}
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

      {/* เลขาธิการเห็นชอบแล้ว — ส่งคืนเจ้าหน้าที่ดำเนินการส่งหนังสือถึงกรม */}
      {a14?.step === 'letter_sent' && !a14.committeeResolutionNo && a14.secretaryAt && (
        <div data-testid="article14-secretary-approved" className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900">
          <i className="fa-solid fa-circle-check mr-1.5" aria-hidden="true" />
          เลขาธิการเห็นชอบส่งต่อ{agency.short} แล้ว ({a14.secretaryAt}) — เจ้าหน้าที่บันทึกการนำส่งหนังสือและการได้รับหนังสือตอบรับต่อ
          {a14.secretaryNote && <span className="block text-emerald-800">ความเห็น: {a14.secretaryNote}</span>}
        </div>
      )}

      {a14 && ['letter_sent', 'response_received', 'handover_ready', 'handover_done', 'delivery_failed'].includes(a14.step) && <Article14CoordinationPanel caseItem={caseItem} role={role} initialAgency={initialAgency} />}
    </section>
  )
}
