import React, { useState } from 'react'
import { Button } from '../common/Button'
import { ThaiDateHint } from '../common/ThaiDateHint'
import { SectionCard } from './SectionCard'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem, Kb15Report, TerminationTrigger } from '../../types/case'
import { TERMINATION_REASONS, TERMINATION_TRIGGERS } from '../../lib/constants'
import { formatThaiDate } from '../../lib/utils'
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
export const Kb15Section: React.FC<{ caseItem: CaseItem; role: string }> = ({ caseItem, role }) => {
  const { recordTerminationTrigger, addTerminationAdditionalReason, draftKb15 } = useCaseStore()
  const kb15 = caseItem.kb15
  const trigger = caseItem.terminationTrigger

  const isOfficer = ['officer', 'case_owner', 'got_officer', 'admin'].includes(role)
  const isSupervisor = ['supervisor', 'admin'].includes(role)

  const [triggerForm, setTriggerForm] = useState<Omit<TerminationTrigger, 'recordedAt' | 'recordedBy'>>({
    source: 'due_or_officer',
    ref: '',
    documentName: '',
    receivedAt: todayIso(),
    detail: '',
  })

  // TC-144 — แขนงที่ยังไม่ถูกใช้เป็นเหตุหลักหรือเหตุเสริม ใช้เพิ่มเหตุยุติที่เกิดพร้อมกันได้ครบถ้วน
  const usedSources = new Set([trigger?.source, ...(trigger?.additionalReasons || []).map((r) => r.source)])
  const remainingTriggers = TERMINATION_TRIGGERS.filter((t) => !usedSources.has(t.value as TerminationTrigger['source']))
  const [additionalForm, setAdditionalForm] = useState<{ source: TerminationTrigger['source'] | ''; ref: string; detail: string }>(
    { source: '', ref: '', detail: '' }
  )
  const additionalFields = additionalForm.source ? TRIGGER_FIELDS[additionalForm.source] : undefined
  const [form, setForm] = useState({
    trigger: 'due_or_officer' as Kb15Report['trigger'],
    triggerRef: '',
    summary: '',
    evidenceNote: '',
  })
  const fields = TRIGGER_FIELDS[triggerForm.source]

  return (
    <SectionCard
      title="เริ่มเรื่องยุติการคุ้มครอง"
      hint="บันทึกที่มา แล้วจัดทำ คบ.15 เสนอพิจารณา"
    >
      {/* ---------- WIT1125-WIT1128 — เหตุเริ่มยุติมาจากทางใด ---------- */}
      {trigger ? (
        <div className="rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-700 space-y-1">
          <div>
            <strong>เหตุเริ่มยุติ:</strong>{' '}
            {TERMINATION_TRIGGERS.find((t) => t.value === trigger.source)?.label || trigger.source}
          </div>
          {trigger.ref && <div>อ้างอิง: {trigger.ref}</div>}
          {trigger.documentName && (
            <div className="text-[0.8rem] text-muted">
              <i className="fa-solid fa-paperclip mr-1" />
              {trigger.documentName} — อัปโหลดเข้ากับแฟ้มเดิมแล้ว
            </div>
          )}
          {trigger.detail && <div className="text-[0.8rem] text-muted">{trigger.detail}</div>}
          <div className="text-[0.8rem] text-muted">
            บันทึกโดย {trigger.recordedBy} เมื่อ {trigger.recordedAt}
            {trigger.receivedAt ? ` · วันที่รับเรื่อง ${formatThaiDate(trigger.receivedAt)}` : ''}
          </div>

          {/* TC-144 — เหตุยุติเสริมที่เกิดพร้อมกัน (เช่น คบ.7 + ครบกำหนด) ยังเป็นเรื่องยุติเดียวในแฟ้มนี้ */}
          {(trigger.additionalReasons || []).length > 0 && (
            <div className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
              <span className="ws-label">เหตุยุติเสริม (เกิดพร้อมกัน)</span>
              {(trigger.additionalReasons || []).map((r, i) => (
                <div
                  key={`${r.source}-${i}`}
                  data-testid="termination-additional-reason"
                  className="rounded-lg border border-blue-200 bg-blue-50/50 p-2 text-[0.8rem]"
                >
                  <strong>{TERMINATION_TRIGGERS.find((t) => t.value === r.source)?.label || r.source}</strong>
                  {r.ref && <div>อ้างอิง: {r.ref}</div>}
                  {r.detail && <div className="text-muted">{r.detail}</div>}
                </div>
              ))}
            </div>
          )}

          {/* TC-144 — ยังคงให้เพิ่มเหตุยุติแขนงอื่นที่เกิดพร้อมกันได้ แม้บันทึกเหตุหลักไปแล้ว (ไม่สร้างเรื่องยุติใหม่) */}
          {isOfficer && remainingTriggers.length > 0 && (
            <div className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
              <span className="ws-label">เพิ่มเหตุยุติที่เกิดพร้อมกัน (ถ้ามี)</span>
              {/* ใช้ radio (ไม่ใช่ select) เพื่อไม่ปนกับ dropdown อื่นของแท็บนี้ */}
              <div className="grid gap-1.5">
                {remainingTriggers.map((t) => {
                  const value = t.value as TerminationTrigger['source']
                  return (
                    <label
                      key={t.value}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-[0.8rem] transition ${
                        additionalForm.source === value
                          ? 'border-blue bg-blue-50/60 text-navy-deep'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`additional-trigger-${caseItem.no}`}
                        checked={additionalForm.source === value}
                        onChange={() => setAdditionalForm({ source: value, ref: '', detail: '' })}
                        className="mt-0.5 accent-blue"
                      />
                      <span>
                        {t.label}
                      </span>
                    </label>
                  )
                })}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {additionalForm.source && (
                  <input
                    value={additionalForm.ref}
                    onChange={(e) => setAdditionalForm((p) => ({ ...p, ref: e.target.value }))}
                    placeholder={additionalFields?.refLabel}
                    className="ws-input"
                  />
                )}
              </div>
              {additionalForm.source && (
                <input
                  value={additionalForm.detail}
                  onChange={(e) => setAdditionalForm((p) => ({ ...p, detail: e.target.value }))}
                  placeholder={additionalFields?.detailLabel}
                  className="ws-input w-full"
                />
              )}
              <Button
                type="button"
                disabled={!additionalForm.source}
                onClick={() => {
                  if (!additionalForm.source) return
                  addTerminationAdditionalReason(caseItem.no, {
                    source: additionalForm.source,
                    ref: additionalForm.ref || undefined,
                    detail: additionalForm.detail || undefined,
                  })
                  setAdditionalForm({ source: '', ref: '', detail: '' })
                  showToast('เพิ่มเหตุยุติเสริมแล้ว — ยังเป็นเรื่องยุติเดียวในแฟ้มนี้')
                }}
                className="rounded-lg border border-blue bg-white px-4 py-1.5 text-[0.8rem] font-bold text-blue hover:bg-blue-50 transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                เพิ่มเหตุยุติเสริม
              </Button>
            </div>
          )}
        </div>
      ) : (
        isOfficer && (
          <div className="space-y-4" data-testid="termination-trigger-form">
            <fieldset>
              <legend className="ws-label">ที่มาของเรื่อง</legend>
              <div className="grid gap-3 md:grid-cols-3">
                {TRIGGER_CHOICES.map((choice) => (
                  <label key={choice.value} className={`flex min-h-[88px] cursor-pointer items-start gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-blue focus-within:ring-offset-2 ${triggerForm.source === choice.value ? 'border-blue bg-blue-soft text-navy' : 'border-line text-ink hover:bg-soft'}`}>
                    <input type="radio" name={`trigger-${caseItem.no}`} checked={triggerForm.source === choice.value} onChange={() => setTriggerForm((p) => ({ ...p, source: choice.value }))} className="mt-1 accent-blue" />
                    <span className="min-w-0"><span className="block text-[0.9rem] font-semibold">{choice.label}</span><span className="mt-1 block text-[0.8rem] text-muted">{choice.caption}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>

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
          {/* TC-144 — แสดงเหตุยุติเสริมทั้งหมดใน คบ.15 ด้วย เพื่อให้ครบถ้วนทุกทาง */}
          {(trigger?.additionalReasons || []).length > 0 && (
            <div className="text-[0.8rem] text-muted">
              เหตุยุติเสริม:{' '}
              {(trigger?.additionalReasons || [])
                .map((r) => TERMINATION_TRIGGERS.find((t) => t.value === r.source)?.label || r.source)
                .join(' · ')}
            </div>
          )}
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
