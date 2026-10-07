import { legacyMonthLabel, monthLabel, protectionMonths } from '../../lib/protectionMonths'
import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '../common/Button'
import { SectionCard } from './SectionCard'
import { useCaseStore } from '../../store/useCaseStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { CaseItem, ReviewOutcome, TerminationTrigger } from '../../types/case'
import { PROTECTION_TOTAL_CAP_DAYS, REVIEW_OUTCOMES, TERMINATION_TRIGGERS } from '../../lib/constants'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'
import { ATTACHMENT_ACCEPT, getAttachmentRejection } from '../../lib/fileValidation'
import { TRIGGER_FIELDS } from './Kb15Section'

const todayIso = () => new Date().toISOString().slice(0, 10)

/** WIT1107-WIT1111 / WIT1149 — ปลายทางจริงของแต่ละแขนง ใช้บอกล่วงหน้าก่อนกดเลือก */
const BRANCH_META: Record<ReviewOutcome, { code: string; icon: string; destination: string }> = {
  continue: {
    code: 'WIT1108',
    icon: 'fa-arrows-rotate',
    destination: 'กลับไปรายงานผลการคุ้มครอง เพื่อกำหนดรอบ คบ.13 ถัดไป',
  },
  extend: {
    code: 'WIT1109',
    icon: 'fa-calendar-plus',
    destination: 'ไปหน้าขยายเวลา (คบ.14)',
  },
  change_method: {
    code: 'WIT1110',
    icon: 'fa-list-check',
    destination: 'เสนออนุมัติและปรับ คบ.11 — เปลี่ยนเป็นวิธีที่ 1 จึงจัดทำ/แก้ คบ.8',
  },
  terminate: {
    code: 'WIT1111',
    icon: 'fa-flag-checkered',
    destination: 'เปิดแฟ้มแล้วกรอกแบบ คบ.15 ยุติการคุ้มครอง แล้วต่อคำสั่งยุติ (คบ.16–17)',
  },
  article14: {
    code: 'WIT1149',
    icon: 'fa-building-columns',
    destination: 'ไปหน้าส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ',
  },
}

/** WIT1104-WIT1107 — สามขั้นย่อยของ 11A ที่ต้องเดินเรียงกัน */
const STEPS = [
  { key: 'draft', label: 'จัดทำข้อเสนอ', code: 'WIT1104-1105' },
  { key: 'review', label: 'ผู้บังคับบัญชาตรวจ', code: 'WIT1106' },
  { key: 'branch', label: 'ส่งไปตามแนวทาง', code: 'WIT1107' },
] as const

const FIELDS = [
  {
    key: 'riskSummary' as const,
    label: 'ผลประเมินความเสี่ยงและความจำเป็น',
    placeholder: 'ระดับความเสี่ยงปัจจุบัน ภัยที่ยังคงอยู่ และความจำเป็นที่ต้องคุ้มครองต่อ',
    required: true,
  },
  {
    key: 'performanceSummary' as const,
    label: 'ผลการปฏิบัติตามวิธีที่ใช้อยู่',
    placeholder: 'ผลการคุ้มครองตามวิธีที่ได้รับอนุมัติในรอบที่ผ่านมา',
  },
  {
    key: 'issues' as const,
    label: 'ปัญหาและความเหมาะสมของวิธี',
    placeholder: 'อุปสรรคที่พบ และวิธีที่ใช้อยู่ยังเหมาะสมหรือไม่',
  },
]

/**
 * ขั้น 11A — ทบทวนผลการคุ้มครองและจำแนกแนวทาง (WIT1104-WIT1107)
 *
 * เดินสามขั้นตามผัง: จัดทำข้อเสนอ (WIT1105) → ผู้บังคับบัญชาตรวจ (WIT1106) → ส่งไปตามแนวทาง (WIT1107)
 *
 * WIT1107 ในผังเป็น "จุดแยกทาง" ไม่ใช่จุดเลือกใหม่ — แนวทางถูกเลือกไปแล้วที่ WIT1105
 * และผ่านการเห็นชอบที่ WIT1106 ขั้นนี้จึงมีแค่ปุ่มเดียวคือส่งงานไปยังปลายทางของแขนงนั้น
 * อยากเปลี่ยนแนวทางต้องให้ผู้บังคับบัญชาส่งคืนแก้ไขข้อเสนอเท่านั้น
 */
export const ReviewSection: React.FC<{ caseItem: CaseItem; role: string; atCap: boolean; remaining: number }> = ({
  caseItem,
  role,
  atCap,
  remaining,
}) => {
  const { submitReviewProposal, decideReviewProposal, applyReviewOutcome, recordTerminationTrigger } = useCaseStore()
  const { ensureSetForForm, addFileToSet } = useFormDraftStore()
  const [form, setForm] = useState({
    riskSummary: '',
    performanceSummary: '',
    issues: '',
    proposedOutcome: 'continue' as ReviewOutcome,
    reason: '',
  })
  const [note, setNote] = useState('')

  /** WIT1125-WIT1128 — เลือกที่มาของการยุติล่วงหน้าตอนจัดทำข้อเสนอ เมื่อแนวทางที่เสนอคือ "เข้าสู่กระบวนการยุติ" */
  const [triggerForm, setTriggerForm] = useState<Omit<TerminationTrigger, 'recordedAt' | 'recordedBy'>>({
    source: 'witness_kb7',
    ref: '',
    documentName: '',
    receivedAt: todayIso(),
    detail: '',
  })
  const triggerFields = TRIGGER_FIELDS[triggerForm.source]
  /** WIT1127 — พรีวิวไฟล์หนังสือภายนอกที่เลือกไว้ ผูกเข้ากับแฟ้มเดิมตอนเสนอผลทบทวนจริง */
  const [externalLetterPreviewUrl, setExternalLetterPreviewUrl] = useState('')

  /** WIT1126 — พยานยื่น คบ.7 แล้ว แนบไฟล์เข้าชุดเอกสารของแบบ คบ.7 ในแฟ้มนี้ได้เลย ไม่ต้องพิมพ์ชื่อไฟล์เอง */
  const handleKb7Upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const rejection = getAttachmentRejection(file)
    if (rejection) {
      showToast(rejection, 'error')
      return
    }
    const setId = ensureSetForForm(7)
    addFileToSet(setId, {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      previewUrl: URL.createObjectURL(file),
    })
    setTriggerForm((p) => ({ ...p, documentName: file.name }))
    showToast('แนบไฟล์เข้าชุดเอกสาร คบ.7 ของแฟ้มนี้แล้ว')
  }

  /** WIT1127 — หนังสือขอยุติจากภายนอก แนบเข้ากับ "แฟ้มเดิม" ไม่เปิดแฟ้มใหม่ — เก็บพรีวิวไว้ก่อน แล้วผูกเข้าเอกสารของแฟ้มตอนเสนอผลทบทวน */
  const handleExternalLetterUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const rejection = getAttachmentRejection(file)
    if (rejection) {
      showToast(rejection, 'error')
      return
    }
    setExternalLetterPreviewUrl(URL.createObjectURL(file))
    setTriggerForm((p) => ({ ...p, documentName: file.name }))
    showToast('เลือกไฟล์หนังสือขอยุติจากภายนอกแล้ว — จะแนบเข้าแฟ้มเดิมตอนเสนอผลทบทวน')
  }

  const proposals = caseItem.reviewProposals || []
  const latest = proposals[proposals.length - 1]
  const isOfficer = ['officer', 'case_owner', 'got_officer', 'admin'].includes(role)
  const isSupervisor = ['supervisor', 'admin'].includes(role)

  const canDraft = isOfficer && (!latest || latest.status === 'returned') && !latest?.appliedOutcome
  const canBranch = latest?.status === 'endorsed' && !latest.appliedOutcome && isOfficer

  /**
   * WIT1107 — แขนงที่จะเดินจริง อ่านจากข้อเสนอที่เห็นชอบ ไม่ให้เลือกใหม่
   * ยกเว้นกรณีเห็นชอบให้ขยายแล้วเวลาผ่านไปจนครบเพดาน ต้องสลับเป็นข้อ 14 ตาม WIT1150
   * (store บังคับกฎเดียวกันนี้อยู่แล้ว ส่วนนี้ทำให้ผู้ใช้เห็นก่อนกด)
   */
  const divertedToArticle14 = latest?.proposedOutcome === 'extend' && atCap
  const effectiveOutcome: ReviewOutcome = divertedToArticle14 ? 'article14' : latest?.proposedOutcome || 'continue'
  const effectiveMeta = BRANCH_META[effectiveOutcome]

  /** ขั้นปัจจุบันของ 11A ใช้ระบายสี stepper */
  const activeStep = latest?.appliedOutcome ? 3 : latest?.status === 'endorsed' ? 2 : latest?.status === 'pending' ? 1 : 0

  return (
    <SectionCard
      title="ทบทวนผลการคุ้มครองและจำแนกแนวทาง"
      hint="คำนวณระยะสะสมจากวันเริ่มจริง ไม่ใช้วันอัปโหลด — แนวทางเลือกครั้งเดียวตอนจัดทำข้อเสนอ แล้วเดินตามผลที่ผู้บังคับบัญชาเห็นชอบ"
    >
      {/* ---------- Stepper — เห็นว่าอยู่ขั้นไหนและเหลืออีกกี่ขั้น ---------- */}
      <ol className="flex flex-wrap items-center gap-1.5">
        {STEPS.map((s, i) => {
          const done = i < activeStep
          const current = i === activeStep
          return (
            <li key={s.key} className="flex items-center gap-1.5">
              <span
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.8rem] font-bold transition ${
                  done
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : current
                      ? 'border-blue bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
              >
                <i className={`fa-solid ${done ? 'fa-circle-check' : current ? 'fa-circle-dot' : 'fa-circle'} text-[0.8rem]`} />
                {s.label}
              </span>
              {i < STEPS.length - 1 && <i className="fa-solid fa-chevron-right text-[8px] text-slate-300" />}
            </li>
          )
        })}
      </ol>

      {/* ---------- WIT1150 — ครบเพดานแล้วปิดแขนงขยายเวลาไว้ตั้งแต่ต้น ---------- */}
      {atCap && (
        <div className="rounded-lg border border-rose-300 bg-rose-50/70 p-3 text-[0.8rem] text-rose-900">
          <i className="fa-solid fa-ban mr-1.5" />
          ครบเพดานรวม 6 เดือนแล้ว — <strong>ห้ามขยายด้วย คบ.14</strong> หากยังมีภัยให้ไปเส้นทางส่งต่อกรมคุ้มครองสิทธิฯ
        </div>
      )}

      {/* ---------- WIT1104 / WIT1105 — จัดทำข้อเสนอผลทบทวน ---------- */}
      {canDraft && (
        <div className="space-y-3">
          {latest?.status === 'returned' && (
            <div className="ws-callout text-[0.85rem] leading-relaxed">
              <i className="fa-solid fa-rotate-left mr-1.5" />
              ส่งคืนแก้ไขเมื่อ {latest.reviewedAt} โดย {latest.reviewedBy}
              {latest.reviewNote ? ` · ${latest.reviewNote}` : ''}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-[0.8rem] font-semibold text-slate-600">
                  {f.label}
                  {f.required && <span className="ml-0.5 text-rose-600">*</span>}
                </span>
                <textarea
                  rows={3}
                  value={form[f.key]}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="ws-input w-full placeholder:text-slate-400"
                />
              </label>
            ))}
          </div>

          {/* แนวทางถูกเลือกที่ขั้นนี้ครั้งเดียว — WIT1107 เป็นแค่จุดแยกทางตามผลที่เห็นชอบ ไม่ให้เลือกซ้ำ */}
          <div>
            <span className="mb-1.5 block text-[0.8rem] font-semibold text-slate-600">
              แนวทางที่เสนอ<span className="ml-0.5 text-rose-600">*</span>
              <span className="ml-1 font-normal text-muted">
                — เลือกที่นี่ที่เดียว เมื่อผู้บังคับบัญชาเห็นชอบแล้วจะเดินตามแนวทางนี้
              </span>
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              {REVIEW_OUTCOMES.map((o) => {
                const value = o.value as ReviewOutcome
                const meta = BRANCH_META[value]
                const blocked = (value === 'extend' && atCap) || (value === 'article14' && !atCap)
                const selected = form.proposedOutcome === value
                return (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-[0.8rem] transition ${
                      blocked
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                        : selected
                          ? 'border-blue bg-blue-50/70 text-navy-deep'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-blue/50 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`proposed-${caseItem.no}`}
                      data-testid={`review-outcome-${value}`}
                      checked={selected}
                      disabled={blocked}
                      onChange={() => setForm((p) => ({ ...p, proposedOutcome: value }))}
                      className="mt-0.5 accent-blue"
                    />
                    <span className="min-w-0">
                      <span className="block font-bold">
                        <i className={`fa-solid ${meta.icon} mr-1.5 opacity-70`} />
                        {o.label}
                      </span>
                      <span className="mt-0.5 block text-[0.8rem] leading-relaxed text-muted">{o.hint}</span>
                      <span className="mt-1 block text-[0.8rem] font-semibold text-blue-800">
                        <i className="fa-solid fa-arrow-right-long mr-1" />
                        {blocked
                          ? value === 'article14'
                            ? `ทำไม่ได้ — ยังไม่ครบเพดาน 6 เดือน (เลือกได้เมื่อคุ้มครองครบเพดานแล้วยังมีภัย)`
                            : `ทำไม่ได้ — ครบเพดาน 6 เดือน`
                          : meta.destination}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* ---------- WIT1125-WIT1128 — เลือกที่มาของการยุติล่วงหน้า เมื่อแนวทางที่เสนอคือ "เข้าสู่กระบวนการยุติ" ---------- */}
          {form.proposedOutcome === 'terminate' && (
            <div className="space-y-2 rounded-lg border border-line bg-soft p-3">
              <span className="ws-label">
                เหตุเริ่มยุติมาจากทางใด
                <span className="ml-1 font-normal text-muted">— ใช้เตรียมข้อมูลไว้ล่วงหน้าให้ตอนกรอก คบ.15</span>
              </span>
              <div className="grid gap-1.5">
                {TERMINATION_TRIGGERS.map((t) => {
                  const value = t.value as TerminationTrigger['source']
                  return (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-[0.8rem] transition ${
                        triggerForm.source === value
                          ? 'border-blue bg-blue-50/60 text-navy-deep'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`termination-trigger-${caseItem.no}`}
                        checked={triggerForm.source === value}
                        onChange={() => setTriggerForm((p) => ({ ...p, source: value }))}
                        className="mt-0.5 accent-blue"
                      />
                      <span>
                        {t.label}
                      </span>
                    </label>
                  )
                })}
              </div>

              {/* WIT1126 — พยานยื่น คบ.7 แล้ว แนบไฟล์เข้าชุดเอกสาร คบ.7 ของแฟ้มนี้ได้ทันที */}
              {triggerForm.source === 'witness_kb7' ? (
                <div className="space-y-1.5">
                  <span className="block text-[0.8rem] text-muted">{triggerFields.docLabel}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-blue px-3.5 text-[0.8rem] font-bold text-white transition hover:bg-blue-dark">
                      <i className="fa-solid fa-cloud-arrow-up text-[0.8rem]" />
                      อัปโหลดไฟล์ คบ.7
                      <input type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={handleKb7Upload} />
                    </label>
                    {triggerForm.documentName && (
                      <span className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[0.8rem] font-semibold text-emerald-800">
                        <i className="fa-solid fa-paperclip" />
                        {triggerForm.documentName}
                      </span>
                    )}
                  </div>
                  <p className="text-[0.8rem] text-muted">แนบเข้าชุดเอกสาร คบ.7 ของแฟ้ม {caseItem.no} ทันที — ไม่บังคับต้องมีไฟล์ก่อนเสนอ</p>
                </div>
              ) : triggerForm.source === 'external_letter' ? (
                /* WIT1127 — หนังสือขอยุติจากภายนอก แนบไฟล์เข้ากับแฟ้มเดิมได้ทันที ไม่เปิดแฟ้มใหม่ */
                <div className="space-y-1.5">
                  <span className="block text-[0.8rem] text-muted">{triggerFields.docLabel}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-blue px-3.5 text-[0.8rem] font-bold text-white transition hover:bg-blue-dark">
                      <i className="fa-solid fa-cloud-arrow-up text-[0.8rem]" />
                      อัปโหลดหนังสือขอยุติ
                      <input type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={handleExternalLetterUpload} />
                    </label>
                    {triggerForm.documentName && (
                      <span className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[0.8rem] font-semibold text-emerald-800">
                        <i className="fa-solid fa-paperclip" />
                        {triggerForm.documentName}
                      </span>
                    )}
                  </div>
                  <p className="text-[0.8rem] text-muted">
                    แนบเข้ากับแฟ้มเดิม {caseItem.no} ตอนกดเสนอผลทบทวน — ไม่เปิดแฟ้มใหม่ และไม่บังคับต้องมีไฟล์ก่อนเสนอ
                  </p>
                </div>
              ) : (
                triggerFields.docLabel && (
                  <input
                    value={triggerForm.documentName}
                    onChange={(e) => setTriggerForm((p) => ({ ...p, documentName: e.target.value }))}
                    placeholder={`${triggerFields.docLabel} (อัปโหลดเข้าแฟ้ม ${caseItem.no})`}
                    className="ws-input w-full"
                  />
                )
              )}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-[0.8rem] font-semibold text-slate-600">
              เหตุผลและหลักฐานอ้างอิง<span className="ml-0.5 text-rose-600">*</span>
            </span>
            <input
              value={form.reason}
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
              placeholder="อ้างอิง คบ.13 คำสั่งเดิม และกรณีครบเพดานแต่ยังมีภัย"
              className="ws-input w-full placeholder:text-slate-400"
            />
          </label>

          <Button
            type="button"
            onClick={() => {
              if (!form.riskSummary.trim() || !form.reason.trim()) {
                showToast('กรุณากรอกผลประเมินความเสี่ยงและเหตุผล', 'warning')
                return
              }
              const proposedLabel =
                REVIEW_OUTCOMES.find((o) => o.value === form.proposedOutcome)?.label || form.proposedOutcome
              showConfirmAlert({
                icon: 'question',
                title: 'เสนอผลทบทวนให้ผู้บังคับบัญชาตรวจ?',
                html: confirmBody(
                  `จัดทำข้อเสนอผลทบทวนของแฟ้ม ${caseItem.no}`,
                  [
                    ['แนวทางที่เสนอ', proposedLabel],
                    ['ผลประเมินความเสี่ยงและความจำเป็น', form.riskSummary.trim()],
                    ['เหตุผลและหลักฐานอ้างอิง', form.reason.trim()],
                  ],
                  'แฟ้มย้ายไปอยู่กับ <strong>ผู้บังคับบัญชา</strong> เพื่อตรวจข้อเสนอ · แก้แนวทางได้ต่อเมื่อถูกส่งคืนแก้ไข'
                ),
                showCancelButton: true,
                confirmButtonText: 'ยืนยันเสนอผลทบทวน',
                cancelButtonText: 'ยกเลิก',
              }).then((res) => {
                if (!res.isConfirmed) return
                submitReviewProposal(caseItem.no, form)
                if (form.proposedOutcome === 'terminate') {
                  recordTerminationTrigger(
                    caseItem.no,
                    triggerForm,
                    undefined,
                    triggerForm.source === 'external_letter' ? externalLetterPreviewUrl || undefined : undefined
                  )
                }
                showToast('เสนอผลทบทวนให้ผู้บังคับบัญชาตรวจแล้ว')
              })
            }}
            data-testid="review-submit-proposal"
            className="rounded-lg bg-blue px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition"
          >
            <i className="fa-solid fa-paper-plane mr-1.5" />
            {latest?.status === 'returned' ? 'เสนอผลทบทวนอีกครั้ง' : 'เสนอผลทบทวน'}
          </Button>
        </div>
      )}

      {/* ---------- ข้อเสนอล่าสุด ---------- */}
      {latest && (
        <div className="space-y-2 rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-navy-deep">
              ข้อเสนอล่าสุด · {REVIEW_OUTCOMES.find((o) => o.value === latest.proposedOutcome)?.label}
            </strong>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[0.8rem] font-bold ${
                latest.status === 'endorsed'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : latest.status === 'returned'
                    ? 'border-rose-300 bg-rose-50 text-rose-800'
                    : 'border-amber-300 bg-amber-50 text-amber-800'
              }`}
            >
              {latest.status === 'pending'
                ? 'รอผู้บังคับบัญชาตรวจ'
                : latest.status === 'endorsed'
                  ? 'ผ่านการตรวจแล้ว'
                  : 'ส่งคืนแก้ไข'}
            </span>
          </div>
          <dl className="grid gap-2 sm:grid-cols-3">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <dt className="text-[0.8rem] text-muted">{f.label}</dt>
                <dd className="text-[0.8rem] leading-relaxed">{latest[f.key] || '-'}</dd>
              </div>
            ))}
          </dl>
          {/* WIT1125 — ให้ผู้บังคับบัญชาเห็นเหตุเริ่มยุติที่เจ้าหน้าที่เลือกไว้ตอนจัดทำข้อเสนอด้วย */}
          {latest.proposedOutcome === 'terminate' && caseItem.terminationTrigger && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-2.5 text-[0.8rem] text-navy-deep">
              <strong>
                เหตุเริ่มยุติมาจากทางใด:{' '}
                {TERMINATION_TRIGGERS.find((t) => t.value === caseItem.terminationTrigger?.source)?.label}
              </strong>
              {caseItem.terminationTrigger.documentName && (
                <div className="mt-0.5 text-slate-600">
                  <i className="fa-solid fa-paperclip mr-1" />
                  {caseItem.terminationTrigger.documentName}
                </div>
              )}
            </div>
          )}
          <div className="text-[0.8rem] text-muted">
            เสนอโดย {latest.createdBy} เมื่อ {latest.createdAt} · สะสม {latest.cumulativeDays} วัน คงเหลือ{' '}
            {latest.remainingDays} วัน
            {latest.reviewNote ? ` · ความเห็น: ${latest.reviewNote}` : ''}
          </div>
        </div>
      )}

      {/* ---------- WIT1106 — ผู้บังคับบัญชาตรวจข้อเสนอ ---------- */}
      {latest?.status === 'pending' && isSupervisor && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <p className="text-[0.8rem] text-muted">
            ตรวจข้อเสนอ เอกสารประกอบ และระยะเวลาคงเหลือ ส่งคืนให้แก้ไขได้โดยบันทึกเหตุผล
          </p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ความเห็น / เหตุผลที่ส่งคืน"
            className="ws-input w-full"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                showConfirmAlert({
                  icon: 'question',
                  title: 'เห็นชอบข้อเสนอผลทบทวน?',
                  html: confirmBody(
                    `ผู้บังคับบัญชาตรวจข้อเสนอของแฟ้ม ${caseItem.no}`,
                    [
                      [
                        'แนวทางที่เสนอ',
                        REVIEW_OUTCOMES.find((o) => o.value === latest.proposedOutcome)?.label || latest.proposedOutcome,
                      ],
                      ['เหตุผลที่เสนอ', latest.reason],
                      ['ความเห็นผู้บังคับบัญชา', note.trim() || 'เห็นชอบตามที่เสนอ'],
                    ],
                    'แฟ้มกลับไปอยู่กับ<strong>เจ้าหน้าที่ผู้รับผิดชอบ</strong> เพื่อส่งงานไปยังปลายทางของแนวทางที่เห็นชอบ'
                  ),
                  showCancelButton: true,
                  confirmButtonText: 'ยืนยันเห็นชอบ',
                  cancelButtonText: 'ยกเลิก',
                }).then((res) => {
                  if (!res.isConfirmed) return
                  decideReviewProposal(caseItem.no, latest.id, true, note || 'เห็นชอบตามที่เสนอ')
                  setNote('')
                  showToast('เห็นชอบข้อเสนอผลทบทวนแล้ว')
                })
              }}
              data-testid="review-endorse"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
            >
              เห็นชอบ
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!note.trim()) {
                  showToast('กรุณาระบุเหตุผลที่ส่งคืน', 'warning')
                  return
                }
                showConfirmAlert({
                  icon: 'warning',
                  title: 'ส่งคืนแก้ไขข้อเสนอผลทบทวน?',
                  html: confirmBody(
                    `ผู้บังคับบัญชาส่งคืนข้อเสนอของแฟ้ม ${caseItem.no}`,
                    [
                      [
                        'แนวทางที่เสนอ',
                        REVIEW_OUTCOMES.find((o) => o.value === latest.proposedOutcome)?.label || latest.proposedOutcome,
                      ],
                      ['เหตุผลที่ส่งคืน', note.trim()],
                    ],
                    'แฟ้มกลับไปอยู่กับ<strong>เจ้าหน้าที่ผู้รับผิดชอบ</strong> เพื่อแก้ไขข้อเสนอและเลือกแนวทางใหม่ แล้วเสนอมาอีกครั้ง'
                  ),
                  showCancelButton: true,
                  confirmButtonText: 'ยืนยันส่งคืนแก้ไข',
                  cancelButtonText: 'ยกเลิก',
                }).then((res) => {
                  if (!res.isConfirmed) return
                  decideReviewProposal(caseItem.no, latest.id, false, note)
                  setNote('')
                  showToast('ส่งคืนแก้ไขข้อเสนอแล้ว')
                })
              }}
              data-testid="review-return"
              className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition"
            >
              ส่งคืนแก้ไข
            </Button>
          </div>
        </div>
      )}

      {/* ---------- WIT1107 — จุดแยกทาง ไม่ใช่จุดเลือกใหม่ ---------- */}
      {canBranch && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <p className="text-[0.8rem] text-muted">
            แนวทางถูกเลือกไว้ตั้งแต่ตอนจัดทำข้อเสนอและผ่านการเห็นชอบแล้ว ขั้นนี้เหลือเพียงส่งงานไปยังปลายทาง
          </p>

          {/* แขนงที่จะเดินจริง — คิดเผื่อกรณีเวลาผ่านไปจนครบเพดานหลังเห็นชอบ */}
          <div
            className={`flex items-start gap-2.5 rounded-lg border p-3 text-[0.8rem] ${
              divertedToArticle14
                ? 'border-amber-300 bg-amber-50/70 text-amber-900'
                : 'border-blue bg-blue-50/70 text-navy-deep'
            }`}
          >
            <i className={`fa-solid ${effectiveMeta.icon} mt-0.5 text-sm opacity-70`} />
            <span className="min-w-0">
              <span className="block font-bold">
                {REVIEW_OUTCOMES.find((o) => o.value === effectiveOutcome)?.label}
              </span>
              <span className="mt-1 block text-[0.8rem] font-semibold">
                <i className="fa-solid fa-arrow-right-long mr-1" />
                {effectiveMeta.destination}
              </span>
              {/* WIT1150 — เห็นชอบให้ขยาย แต่ระหว่างรอครบเพดานไปแล้ว จึงสลับเป็นข้อ 14 */}
              {divertedToArticle14 && (
                <span className="mt-1.5 block leading-relaxed">
                  <i className="fa-solid fa-triangle-exclamation mr-1" />
                  แนวทางที่เห็นชอบคือ "ขยายระยะเวลา (คบ.14)" แต่ขณะนี้สะสมครบเพดาน 6 เดือนแล้ว
                  จึงขยายไม่ได้ ระบบจะเดินเส้นทางส่งต่อกรมคุ้มครองสิทธิฯ แทน — หากไม่ต้องการ ให้ผู้บังคับบัญชาส่งคืนแก้ไขข้อเสนอ
                </span>
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              onClick={() => {
                showConfirmAlert({
                  icon: divertedToArticle14 ? 'warning' : 'question',
                  title: divertedToArticle14 ? 'ส่งต่อกรมคุ้มครองสิทธิฯ แทนการขยายเวลา?' : 'ส่งงานไปตามแนวทางที่เห็นชอบ?',
                  html: confirmBody(
                    `จุดแยกทางของแฟ้ม ${caseItem.no}`,
                    [
                      ['แนวทางที่เห็นชอบ', REVIEW_OUTCOMES.find((o) => o.value === latest.proposedOutcome)?.label || '-'],
                      [
                        'แนวทางที่จะเดินจริง',
                        `${REVIEW_OUTCOMES.find((o) => o.value === effectiveOutcome)?.label}`,
                      ],
                      ['ปลายทาง', effectiveMeta.destination],
                    ],
                    divertedToArticle14
                      ? `ครบเพดานรวม 6 เดือนแล้ว จึงขยายด้วย คบ.14 ไม่ได้ — แฟ้มเดิน<strong>เส้นทางส่งต่อกรมคุ้มครองสิทธิฯ</strong> แทน`
                      : 'แฟ้มเปลี่ยนสถานะและเดินต่อตามแนวทางนี้ · เปลี่ยนแนวทางได้ต่อเมื่อผู้บังคับบัญชาส่งคืนแก้ไขข้อเสนอ'
                  ),
                  showCancelButton: true,
                  confirmButtonText: divertedToArticle14 ? 'ยืนยันส่งต่อกรมคุ้มครองสิทธิฯ' : 'ยืนยันดำเนินการ',
                  cancelButtonText: 'ยกเลิก',
                }).then((res) => {
                  if (!res.isConfirmed) return
                  applyReviewOutcome(caseItem.no, latest.proposedOutcome)
                  showToast(
                    divertedToArticle14
                      ? `ขยายไม่ได้ — ครบเพดาน 6 เดือน ระบบเปลี่ยนเป็นเส้นทางส่งต่อกรมคุ้มครองสิทธิฯ ให้แล้ว`
                      : `ดำเนินการตามแนวทาง: ${REVIEW_OUTCOMES.find((o) => o.value === effectiveOutcome)?.label}`,
                    divertedToArticle14 ? 'warning' : 'success'
                  )
                })
              }}
              data-testid="review-apply-outcome"
              className="rounded-lg bg-blue px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition"
            >
              <i className="fa-solid fa-signs-post mr-1.5" />
              {divertedToArticle14 ? 'ส่งต่อกรมคุ้มครองสิทธิฯ' : 'ดำเนินการตามแนวทางที่เห็นชอบ'}
            </Button>
            {effectiveOutcome === 'extend' && (
              <span className="text-[0.8rem] text-muted">
                ขยายได้ไม่เกิน {remaining} วันตามเพดานรวม 6 เดือน
              </span>
            )}
          </div>
        </div>
      )}

      {/* ---------- เลือกแนวทางแล้ว ---------- */}
      {latest?.appliedOutcome && (
        <div className="space-y-1 rounded-lg border border-emerald-300 bg-emerald-50/70 p-3 text-[0.8rem] text-emerald-900">
          <strong className="block">
            <i className="fa-solid fa-circle-check mr-1.5" />
            เลือกแนวทางแล้ว: {REVIEW_OUTCOMES.find((o) => o.value === latest.appliedOutcome)?.label}
          </strong>
          <span className="block text-[0.8rem]">
            {BRANCH_META[latest.appliedOutcome].destination}
            {latest.appliedAt ? ` · เมื่อ ${latest.appliedAt}` : ''}
          </span>
          {/* WIT1109 → 11B / WIT1111 → 11C — ปุ่มไปแท็บถัดไปของแนวทางที่เลือก */}
          {latest.appliedOutcome === 'extend' && (
            <Link
              to="/protection-extension/$caseNo"
              params={{ caseNo: caseItem.no }}
              data-testid="review-goto-11b"
              className="inline-block pt-1 text-[0.8rem] font-bold underline"
            >
              ไปหน้าขยายเวลา (คบ.14)
            </Link>
          )}
          {latest.appliedOutcome === 'terminate' && (
            <Link
              to="/termination/$caseNo"
              params={{ caseNo: caseItem.no }}
              data-testid="review-goto-11c"
              className="inline-block pt-1 text-[0.8rem] font-bold underline"
            >
              ไปหน้าจัดทำเรื่องยุติ (คบ.15)
            </Link>
          )}
          {latest.appliedOutcome === 'continue' && (
            <Link to="/protection-monitor" search={{ caseNo: caseItem.no }} className="inline-block pt-1 text-[0.8rem] font-bold underline">
              ไปรายงานผลการคุ้มครอง · กำหนดรอบ คบ.13 ถัดไป
            </Link>
          )}
        </div>
      )}
    </SectionCard>
  )
}
