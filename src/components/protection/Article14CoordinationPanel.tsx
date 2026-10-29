import { requiresReferralCommittee } from '../../lib/referralDocumentIdentity'
import { isRightsReferral } from '../../lib/referralDocumentIdentity'
import React, { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '../../components/common/Button'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Article14Step, CaseItem, CoordinationAgencyType } from '../../types/case'
import { ARTICLE14_AGENCIES, ARTICLE14_AGENCY_ORDER, ARTICLE14_STEP_LABELS, DEFAULT_ARTICLE14_AGENCY, OFFICIAL_LETTER_CHANNELS, PROTECTION_TOTAL_CAP_DAYS, article14Agency, isArticle14AgencyType } from '../../lib/constants'
import { canProposeAgencyReferral, deriveEpisode, isEarlyArticle14, summarizeEpisode } from '../../lib/episode'
import { showToast, showConfirmAlert } from '../../lib/swal'
import { ATTACHMENT_ACCEPT, getAttachmentRejection } from '../../lib/fileValidation'
import { Article14EscalationCard, latestArticle14Escalation } from '../../components/protection/Article14EscalationCard'
import { sarabanInTransit } from '../../lib/saraban'
import { VoiceTextarea } from '../../components/common/VoiceTextarea'

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

export const Article14CoordinationPanel: React.FC<{ caseItem: CaseItem; role: string; initialAgency?: CoordinationAgencyType }> = ({ caseItem, role, initialAgency }) => {
  const {
    openArticle14,
    reviewArticle14,
    recordArticle14Resolution,
    addOfficialLetter,
    completeArticle14Handover,
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
    <section className="ws-card space-y-4 p-5" data-testid="referral-coordination-in-dossier">
      <h2 className="ws-section-title">ประสานกรมคุ้มครองสิทธิฯ หลังมติคณะกรรมการ</h2>
      {/* WIT0859 — บันทึกการนำส่งหนังสือถึงกรม (เลขสารบรรณเดิม) */}
      {a14?.step === 'letter_sent' && isOfficer && !hasOutgoingLetter && (
        <div className="space-y-2 border-t border-slate-200 pt-3" data-testid="article14-delivery-form">
          <div className="text-sm font-bold text-navy">บันทึกการนำส่งหนังสือถึง {agency.office}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="ws-label mb-1 block">เลขที่หนังสือ <span className="text-danger">*</span></span>
              <input
                value={letter.registryNo}
                onChange={(e) => setLetter((p) => ({ ...p, registryNo: e.target.value }))}
                placeholder="เลขที่หนังสือ (สารบรรณเดิม)"
                className="ws-input w-full"
              />
            </label>
            <label className="block min-w-0">
              <span className="ws-label mb-1 block">วันที่นำส่ง</span>
              <input
                type="date"
                value={letter.registryDate}
                onChange={(e) => setLetter((p) => ({ ...p, registryDate: e.target.value }))}
                className="ws-input w-full"
              />
            </label>
            <label className="block min-w-0">
              <span className="ws-label mb-1 block">ช่องทางนำส่ง</span>
              <select
                value={letter.channel}
                onChange={(e) => setLetter((p) => ({ ...p, channel: e.target.value }))}
                className="ws-input w-full"
              >
                {OFFICIAL_LETTER_CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="ws-label mb-1 block">ผู้รับหนังสือที่{agency.short}</span>
              <input
                value={letter.contactPerson}
                onChange={(e) => setLetter((p) => ({ ...p, contactPerson: e.target.value }))}
                placeholder="ชื่อผู้รับ / หน่วยรับหนังสือ (ถ้ามี)"
                className="ws-input w-full"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              data-testid="article14-record-delivery"
              onClick={async () => {
                if (!letter.registryNo.trim()) {
                  showToast('กรุณาระบุเลขที่หนังสือจากระบบสารบรรณ')
                  return
                }
                if (!(await confirmAction('ยืนยันบันทึกการนำส่ง', `เลขที่ ${letter.registryNo} ถึง ${agency.office}`, 'ยืนยันบันทึก'))) return
                addOfficialLetter(caseItem.no, {
                  direction: 'outgoing',
                  context: 'article14',
                  subject: `หนังสือแจ้งผลการพิจารณาและประสานส่งต่อการคุ้มครองไปยัง${agency.name} (${approvalRef})`,
                  registryNo: letter.registryNo,
                  registryDate: letter.registryDate,
                  agency: agency.office,
                  contactPerson: letter.contactPerson.trim() || undefined,
                  channel: letter.channel as 'direct' | 'post' | 'official_other',
                  sentAt: new Date().toISOString(),
                })
                showToast(`บันทึกการนำส่งหนังสือแล้ว — รอบันทึกการได้รับหนังสือตอบรับจาก${agency.short}`)
              }}
              className="min-h-[44px] rounded-lg bg-navy px-4 py-2.5 text-[0.88rem] font-semibold text-white hover:bg-blue transition"
            >
              <i className="fa-solid fa-paper-plane mr-1.5" aria-hidden="true" />
              บันทึกการนำส่ง
            </Button>
          </div>
        </div>
      )}

      {/* สรุปการนำส่งที่บันทึกแล้ว — ทุกบทบาทเห็นเพื่อติดตาม */}
      {a14 && outgoingLetter && (
        <div data-testid="article14-delivery-summary" className="rounded-xl border border-line bg-soft p-3 text-[0.8rem] text-slate-700 space-y-0.5">
          <div className="font-bold text-navy">
            <i className="fa-solid fa-paper-plane mr-1.5" aria-hidden="true" />
            บันทึกการนำส่งแล้ว
          </div>
          <div>
            เลขที่ {outgoingLetter.registryNo} · วันที่นำส่ง {outgoingLetter.registryDate} · ช่องทาง{' '}
            {OFFICIAL_LETTER_CHANNELS.find((c) => c.value === outgoingLetter.channel)?.label || '-'}
            {outgoingLetter.contactPerson ? ` · ผู้รับ ${outgoingLetter.contactPerson}` : ''}
          </div>
        </div>
      )}

      {/* WIT0860 — รับหนังสือตอบรับขาเข้าจากกรม บันทึกเข้าแฟ้มก่อนเตรียมส่งมอบ (WIT0861) */}
      {a14?.step === 'letter_sent' && isOfficer && (
        <div className="space-y-2 border-t border-slate-200 pt-3" data-testid="article14-reply-form">
          <div className="text-sm font-bold text-navy">บันทึกการได้รับหนังสือตอบรับจาก {agency.office}</div>
          {!hasOutgoingLetter ? (
            <p data-testid="article14-reply-locked" className="rounded-lg border border-line bg-soft p-2.5 text-[0.8rem] text-slate-600">
              ต้องบันทึกการนำส่งหนังสือถึง{agency.short}ก่อน จึงจะบันทึกการได้รับหนังสือตอบรับและส่งมอบได้
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  value={reply.registryNo}
                  onChange={(e) => setReply((p) => ({ ...p, registryNo: e.target.value }))}
                  placeholder={`เลขที่หนังสือตอบรับของ${agency.short}`}
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
                  placeholder={`ผู้ประสานของ${agency.short}`}
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
                  placeholder={`เงื่อนไขของ${agency.short} (ถ้ามี)`}
                  className="ws-input"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg bg-navy px-4 text-[0.88rem] font-semibold text-white transition hover:bg-blue">
                  <i className="fa-solid fa-cloud-arrow-up text-[0.8rem]" />
                  แนบหนังสือตอบรับของ{agency.short}
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
                    showToast(`กรุณาระบุเลขที่หนังสือ ผู้ประสาน วันนัด และแนบหนังสือตอบรับของ${agency.short}`)
                    return
                  }
                  if (!(await confirmAction('ยืนยันบันทึกการได้รับหนังสือตอบรับ', `เลขที่ ${reply.registryNo} · วันนัด ${reply.appointmentAt}`, 'ยืนยันบันทึก'))) return
                  recordArticle14Reply(caseItem.no, {
                    ...reply,
                    registryDate: reply.registryDate || todayIso(),
                  })
                  showToast(`บันทึกการได้รับหนังสือตอบรับจาก${agency.short}แล้ว — เตรียมส่งมอบได้`)
                }}
                className="min-h-[44px] rounded-lg bg-navy px-4 py-2.5 text-[0.88rem] font-semibold text-white hover:bg-blue transition"
              >
                <i className="fa-solid fa-inbox mr-1.5" aria-hidden="true" />
                บันทึกการได้รับหนังสือตอบรับ
              </Button>
            </>
          )}
        </div>
      )}

      {a14 && ['response_received', 'handover_ready'].includes(a14.step) && (
        <div data-testid="article14-reply-summary" className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900 space-y-0.5">
          <div>
            <strong>บันทึกการได้รับหนังสือตอบรับ:</strong> เลขที่ {a14.replyRegistryNo} · ลงวันที่ {a14.replyRegistryDate} · ผู้ประสาน {a14.replyContactPerson}
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
              showToast(`ส่งมอบแล้ว — ปิด Episode มาตรการเบื้องต้นและเชื่อม Episode ของ${agency.short}`)
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

      {/* WIT0860 แขนง — งานเสนอผู้มีอำนาจหลังกรมดำเนินการไม่ได้ (คงอยู่จนกว่าจะอนุมัติแนวทางใหม่) */}
      {(a14?.step === 'delivery_failed' || latestArticle14Escalation(caseItem)) && (
        <div className="border-t border-slate-200 pt-3">
          <Article14EscalationCard caseItem={caseItem} />
        </div>
      )}

      {a14?.step === 'handover_done' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900">
          ส่งมอบให้{agency.short} เรียบร้อยแล้ว — {agency.office} เริ่มมาตรการตั้งแต่{' '}
          {a14.successorStartedAt?.slice(0, 10)} · ฐานกฎหมาย: {a14.successorLegalBasis}
        </div>
      )}
    </section>
  )
}
