import React, { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useFormDraftStore, selectCaseDraft } from '../../store/useFormDraftStore'
import { Button } from '../common/Button'
import { ThaiDateHint } from '../common/ThaiDateHint'
import { SectionCard } from './SectionCard'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem, Kb15Report, TerminationTrigger } from '../../types/case'
import { TERMINATION_REASONS, TERMINATION_TRIGGERS } from '../../lib/constants'
import { showToast } from '../../lib/swal'
import { Kb15ReviewActions } from './Kb15ReviewActions'

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const TRIGGER_CHOICES = [
  { value: 'witness_kb7', label: 'พยานขอยุติ', caption: 'คบ.7', icon: 'fa-user' },
  { value: 'external_letter', label: 'หนังสือภายนอก', caption: 'รับผ่านสารบรรณ', icon: 'fa-envelope-open-text' },
  { value: 'due_or_officer', label: 'เจ้าหน้าที่เสนอ / ครบกำหนด', caption: 'ผลประเมินล่าสุด', icon: 'fa-clipboard-check' },
] as const

/** WIT1126-WIT1128 — สิ่งที่ต้องกรอกต่างกันตามแขนงของเหตุยุติ (ใช้ร่วมกับ ReviewSection ที่แท็บ 11A) */
export const TRIGGER_FIELDS: Record<
  TerminationTrigger['source'],
  { code: string; refLabel: string; docLabel?: string; detailLabel: string }
> = {
  witness_kb7: {
    code: 'WIT1126',
    refLabel: 'เลขที่ คบ.7 / เลขรับคำขอในระบบ',
    docLabel: 'ไฟล์ คบ.7 ที่พยานลงนาม',
    detailLabel: 'เหตุผลที่พยานขอยุติ',
  },
  external_letter: {
    code: 'WIT1127',
    refLabel: 'เลขที่หนังสือจากสารบรรณเดิม',
    docLabel: 'ไฟล์หนังสือขอยุติจากภายนอก',
    detailLabel: 'หน่วยงานผู้มีหนังสือ',
  },
  due_or_officer: {
    code: 'WIT1128',
    refLabel: 'คำสั่งที่ครบกำหนด',
    detailLabel: 'ข้อเท็จจริงและผลประเมินล่าสุดที่ใช้อ้าง',
  },
}

/**
 * ขั้น 11C — จัดทำเรื่องยุติการคุ้มครอง (คบ.7 / คบ.15) · WIT1124-WIT1134
 *
 * กฎที่หน้านี้บังคับ (WIT1130): การยุติยังไม่เกิดขึ้นเพียงเพราะรับ คบ.7 หรือจัดทำ คบ.15
 * ต้องรอคำสั่ง คบ.16 ที่ลงนามและถึงวันที่มีผลก่อน
 */
export const Kb15Section: React.FC<{ caseItem: CaseItem; role: string; initialSource?: 'witness_kb7' }> = ({ caseItem, role, initialSource }) => {
  const { recordTerminationTrigger, draftKb15 } = useCaseStore()
  const navigate = useNavigate()
  const kb7Draft = selectCaseDraft(useFormDraftStore.getState(), 7, caseItem.no)
  const openKb7 = () => navigate({ to: '/form/$formId', params: { formId: '7' }, search: { caseNo: caseItem.no, from: 'termination' } })
  const kb15 = caseItem.kb15
  const trigger = caseItem.terminationTrigger

  const isOfficer = ['officer', 'case_owner', 'got_officer', 'admin'].includes(role)
  const isSupervisor = ['supervisor', 'admin'].includes(role)

  const [triggerForm, setTriggerForm] = useState<Omit<TerminationTrigger, 'recordedAt' | 'recordedBy'>>({
    source: initialSource || 'due_or_officer',
    ref: '',
    documentName: '',
    receivedAt: todayIso(),
    detail: initialSource ? String(kb7Draft['เหตุผลการยุติ'] || '') : '',
  })

  const [form, setForm] = useState({
    trigger: 'due_or_officer' as Kb15Report['trigger'],
    triggerRef: '',
    summary: '',
    evidenceNote: '',
  })
  const fields = TRIGGER_FIELDS[triggerForm.source]

  return (
    <SectionCard
      title={trigger ? "จัดทำ คบ.15" : "เริ่มเรื่องยุติการคุ้มครอง"}
      hint={trigger ? undefined : "บันทึกที่มา แล้วจัดทำ คบ.15 เสนอพิจารณา"}
    >
      {/* ---------- WIT1125-WIT1128 — เหตุเริ่มยุติมาจากทางใด ---------- */}
      {!trigger && (
        isOfficer && (
          <div className="space-y-4" data-testid="termination-trigger-form">
            <fieldset>
              <legend className="ws-label">ที่มาของเรื่อง</legend>
              <div className="grid gap-3 md:grid-cols-3">
                {TRIGGER_CHOICES.map((choice) => (
                  <label key={choice.value} className={`flex min-h-[88px] cursor-pointer items-start gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-blue focus-within:ring-offset-2 ${triggerForm.source === choice.value ? 'border-blue bg-blue-soft text-navy' : 'border-line text-ink hover:bg-soft'}`}>
                    <input type="radio" name={`trigger-${caseItem.no}`} checked={triggerForm.source === choice.value} onChange={() => {
                    setTriggerForm((p) => ({ ...p, source: choice.value }))
                    if (choice.value === 'witness_kb7') void openKb7()
                  }} className="mt-1 accent-blue" />
                    <span className="min-w-0"><span className="block text-[0.9rem] font-semibold">{choice.label}</span><span className="mt-1 block text-[0.8rem] text-muted">{choice.caption}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>

            {triggerForm.source === 'witness_kb7' && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-soft p-4">
                <span className="font-semibold text-navy">คบ.7 · คำร้องขอยุติการคุ้มครองพยาน</span>
                <Button type="button" onClick={() => void openKb7()}>เปิดแบบ คบ.7</Button>
              </div>
            )}
            <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <label className="block">
                <span className="ws-label">{fields.refLabel} *</span>
                <input value={triggerForm.ref} onChange={(e) => setTriggerForm((p) => ({ ...p, ref: e.target.value }))} placeholder={fields.refLabel} className="ws-input w-full" />
              </label>
              <label className="block">
                <span className="ws-label">{triggerForm.source === 'due_or_officer' ? 'วันที่เสนอ / วันครบกำหนด' : 'วันที่รับเรื่อง'}</span>
                <input type="date" value={triggerForm.receivedAt} onChange={(e) => setTriggerForm((p) => ({ ...p, receivedAt: e.target.value }))} className="ws-input w-full" />
                <ThaiDateHint value={triggerForm.receivedAt} testId="kb15-received-be" />
              </label>
            </div>
            {fields.docLabel && <label className="block">
              <span className="ws-label">{fields.docLabel} *</span>
              <input value={triggerForm.documentName} onChange={(e) => setTriggerForm((p) => ({ ...p, documentName: e.target.value }))} placeholder={`${fields.docLabel} (อัปโหลดเข้าแฟ้ม ${caseItem.no})`} className="ws-input w-full" />
            </label>}
            <label className="block">
              <span className="ws-label">{triggerForm.source === 'external_letter' ? 'หน่วยงานผู้ส่งหนังสือ' : 'เหตุผลและข้อมูลประกอบ'}</span>
              <textarea rows={3} value={triggerForm.detail} onChange={(e) => setTriggerForm((p) => ({ ...p, detail: e.target.value }))} placeholder={fields.detailLabel} className="ws-input w-full" />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-[0.8rem] text-muted">มีผลยุติเมื่อ คบ.16 ลงนามและถึงวันที่กำหนด</p>
            <Button
              type="button"
              onClick={() => {
                if (!triggerForm.ref?.trim()) {
                  showToast(`กรุณาระบุ${fields.refLabel}`, 'warning')
                  return
                }
                if (fields.docLabel && !triggerForm.documentName?.trim()) {
                  showToast(`กรุณาระบุ${fields.docLabel}`, 'warning')
                  return
                }
                recordTerminationTrigger(caseItem.no, triggerForm)
                setForm((p) => ({
                  ...p,
                  trigger: triggerForm.source,
                  triggerRef: triggerForm.ref || '',
                }))
                showToast('บันทึกเหตุเริ่มยุติเข้ากับแฟ้มเดิมแล้ว')
              }}
              className="rounded-lg bg-blue px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition"
            >
              บันทึกเรื่องยุติ
            </Button>
            </div>
          </div>
        )
      )}

      {/* ---------- สถานะ คบ.15 ---------- */}
      {kb15 && (
        <div className="rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-700 space-y-1">
          <div>
            <strong>คบ.15 ฉบับที่ {kb15.version}</strong> ·{' '}
            {TERMINATION_TRIGGERS.find((t) => t.value === kb15.trigger)?.label}
          </div>
          <div>{kb15.summary}</div>
          {kb15.evidenceNote && <div className="text-[0.8rem] text-muted">{kb15.evidenceNote}</div>}
          <div>
            สถานะ:{' '}
            {kb15.status === 'submitted'
              ? 'รอผู้บังคับบัญชาตรวจ'
              : kb15.status === 'endorsed'
                ? 'เห็นชอบแล้ว — เสนอผู้มีอำนาจพิจารณาออกคำสั่งยุติ'
                : 'ส่งคืนแก้ไข'}
            {kb15.reviewNote ? ` · ${kb15.reviewNote}` : ''}
          </div>
          {(kb15.previousVersions || []).length > 0 && (
            <div className="text-[0.8rem] text-muted">
              เก็บฉบับเดิมไว้ {kb15.previousVersions?.length} ฉบับ — ไม่แก้ทับ
            </div>
          )}
        </div>
      )}

      {/* ---------- WIT1129 — จัดทำ คบ.15 ---------- */}
      {isOfficer && trigger && (!kb15 || kb15.status === 'returned') && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <p className="text-[0.8rem] text-muted">
            จัดทำ คบ.15 รายงานการให้ความคุ้มครองสิ้นสุด อ้างอิง คบ.7 หรือเหตุยุติ พร้อมหลักฐาน
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={form.trigger}
              onChange={(e) => setForm((p) => ({ ...p, trigger: e.target.value as Kb15Report['trigger'] }))}
              className="ws-input"
            >
              {TERMINATION_TRIGGERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              value={form.triggerRef}
              onChange={(e) => setForm((p) => ({ ...p, triggerRef: e.target.value }))}
              placeholder="อ้างอิง คบ.7 / เลขหนังสือภายนอก"
              className="ws-input"
            />
          </div>
          <select
            value={form.summary}
            onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))}
            className="ws-input w-full"
          >
            <option value="">— เลือกเหตุยุติ —</option>
            {TERMINATION_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <textarea
            rows={2}
            value={form.evidenceNote}
            onChange={(e) => setForm((p) => ({ ...p, evidenceNote: e.target.value }))}
            placeholder="หลักฐานประกอบและสรุปผลการคุ้มครอง"
            className="ws-input w-full"
          />
          <Button
            type="button"
            onClick={() => {
              if (!form.summary) {
                showToast('กรุณาเลือกเหตุยุติ', 'warning')
                return
              }
              draftKb15(caseItem.no, {
                ...form,
                triggerDocumentName: trigger.documentName,
                triggerReceivedAt: trigger.receivedAt,
              })
              showToast(kb15 ? 'จัดทำ คบ.15 เวอร์ชันใหม่ (เก็บฉบับเดิมไว้) แล้ว' : 'จัดทำ คบ.15 และเสนอตามลำดับชั้นแล้ว')
            }}
            className="rounded-lg bg-blue px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition"
          >
            {kb15 ? 'จัดทำ คบ.15 เวอร์ชันใหม่' : 'จัดทำ คบ.15 และเสนอ'}
          </Button>
        </div>
      )}

      {/* ---------- WIT1131 / WIT1132 / WIT1133 / WIT1134 — ตรวจและเสนอผู้มีอำนาจ ---------- */}
      {kb15?.status === 'submitted' && isSupervisor && <Kb15ReviewActions caseItem={caseItem} />}
    </SectionCard>
  )
}
