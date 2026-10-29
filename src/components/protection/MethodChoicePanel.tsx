import React, { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '../common/Button'
import { useCaseStore } from '../../store/useCaseStore'
import { selectCaseDraft, useFormDraftStore } from '../../store/useFormDraftStore'
import type { CaseItem, CoordinationAgencyType, ProtectionMethodNo } from '../../types/case'
import {
  COORDINATION_AGENCY_TYPES,
  KB6_METHOD_SUBITEM_FIELDS,
  METHOD_CHOICE_LABELS,
  ROUTABLE_PROTECTION_METHODS,
  coordinationAgencyFromSubitem,
  protectionMethodSwitchNotice,
  toggleProtectionMethod,
} from '../../lib/constants'
import { methodWorkOpened } from '../../lib/methodProgress'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'

type ChoiceMode = 'base' | 'new'

const methodLine = (m: number) => `วิธีที่ ${m} ${METHOD_CHOICE_LABELS[m] || ''}`.trim()

/**
 * เจ้าหน้าที่ กอท. เลือกแนวทางตอนเปิดงาน — ดำเนินการตามวิธีที่เสนอใน คบ.6 หรือเลือกวิธีใหม่
 * กติกาเลือกใหม่เหมือน คบ.6: ข้อ 1–3 เลือกร่วมกันได้ ข้อ 4 เลือกเดี่ยวและระบุหน่วยงานปลายทางหนึ่งหน่วยงาน
 * เส้นทางเร่งด่วนที่ ผอ. อนุมัติ คบ.5 แล้วแต่ คบ.6 ยังไม่ลงนาม ใช้วิธีที่ขอไว้ใน คบ.4 เป็นฐานแทน
 */
export const MethodChoicePanel: React.FC<{ caseItem: CaseItem; orderBase: string }> = ({ caseItem, orderBase }) => {
  const chooseOperationMethods = useCaseStore((s) => s.chooseOperationMethods)
  const baseForm: 'kb4' | 'kb6' = caseItem.urgent && caseItem.kb5Approved && !caseItem.kb6Signed ? 'kb4' : 'kb6'
  const baseLabel = baseForm === 'kb4' ? 'คบ.4' : 'คบ.6'
  const baseSource = baseForm === 'kb4'
    ? caseItem.fastTrack?.proposedMethods
    : caseItem.orderedMethods?.length ? caseItem.orderedMethods : caseItem.approvedMethods
  const baseMethods = (baseSource || []).filter((m) => ROUTABLE_PROTECTION_METHODS.includes(m)) as ProtectionMethodNo[]
  /** "ดำเนินการตาม คบ.4/คบ.6" ใช้หน่วยงานที่เลือกไว้ในตัวเลือกย่อยข้อ 4 ของแบบฐาน ไม่ตกไปเป็นตำรวจ */
  const baseDraft = useFormDraftStore((s) => selectCaseDraft(s, baseForm === 'kb4' ? 4 : 6, caseItem.no))
  const baseAgencyType = baseMethods.includes(4) ? coordinationAgencyFromSubitem(baseDraft[KB6_METHOD_SUBITEM_FIELDS[4]]) : undefined
  const baseAgencyLabel = COORDINATION_AGENCY_TYPES.find((t) => t.value === baseAgencyType)?.label
  /** เรื่องเร่งด่วนที่ คบ.6 ยังไม่ลงนาม เหลือแค่ "ตาม คบ.4" — ซ่อน "เลือกใหม่" (ยกเว้นไม่มีวิธีใน คบ.4 ให้เลือกใหม่ได้ ไม่ให้งานค้าง) */
  const lockToBase = baseForm === 'kb4' && baseMethods.length > 0
  const [mode, setMode] = useState<ChoiceMode | ''>(lockToBase ? 'base' : baseMethods.length ? '' : 'new')
  const [selected, setSelected] = useState<ProtectionMethodNo[]>([])
  const [agencyType, setAgencyType] = useState<CoordinationAgencyType | ''>('')
  const [error, setError] = useState('')

  // The approved main petition already defines the method and destination.
  // Read the current store on each effect run so StrictMode cannot open it twice.
  useEffect(() => {
    if (baseForm !== 'kb6' || baseMethods.length === 0) return
    const current = useCaseStore.getState().getCase(caseItem.no)
    if (!current || methodWorkOpened(current)) return
    chooseOperationMethods(caseItem.no, { mode: 'kb6', methods: baseMethods, agencyType: baseAgencyType })
  }, [baseForm, caseItem.no, baseMethods.join(','), baseAgencyType, chooseOperationMethods])

  const toggle = (n: ProtectionMethodNo) => {
    const notice = protectionMethodSwitchNotice(selected, n)
    if (notice) showToast(notice, 'warning')
    setSelected(toggleProtectionMethod(selected, n))
    setError('')
  }

  const handleConfirm = () => {
    if (!mode) { setError('กรุณาเลือกแนวทางดำเนินการ'); return }
    const methods = mode === 'base' ? baseMethods : selected
    if (methods.length === 0) { setError('กรุณาเลือกวิธีคุ้มครองอย่างน้อยหนึ่งวิธี'); return }
    if (mode === 'new' && methods.includes(4) && !agencyType) { setError('กรุณาเลือกหน่วยงานที่จะส่งให้ดำเนินการตามข้อ 2.4'); return }
    setError('')
    const chosenAgency = mode === 'base' ? baseAgencyType : agencyType || undefined
    const agencyLabel = COORDINATION_AGENCY_TYPES.find((t) => t.value === chosenAgency)?.label
    showConfirmAlert({
      icon: 'question',
      title: mode === 'base' ? `ดำเนินการตามวิธีใน ${baseLabel}?` : 'ดำเนินการตามวิธีที่เลือกใหม่?',
      html: confirmBody(
        'เปิดงานตามวิธีคุ้มครองที่เลือก',
        [
          ['ฐานคำสั่ง', orderBase],
          ['แนวทาง', mode === 'base' ? `ดำเนินการตาม ${baseLabel}` : 'เลือกใหม่'],
          ['วิธีที่เลือก', methods.map((m) => `วิธีที่ ${m}`).join(' · ')],
          ...(agencyLabel && methods.includes(4) ? [['หน่วยงานปลายทาง', agencyLabel] as [string, string]] : []),
        ],
        'ระบบจะเปิดหน้าปฏิบัติของแต่ละวิธีที่เลือก — แต่ละวิธีเดินงานแยกกันได้'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันและเปิดงาน',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      chooseOperationMethods(caseItem.no, { mode: mode === 'base' ? baseForm : 'new', methods, agencyType: chosenAgency })
      showToast(`เปิดงานตามวิธีที่ ${methods.join(', ')} เรียบร้อยแล้ว`)
    })
  }

  const optionClass = (on: boolean) =>
    `flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left text-sm leading-relaxed transition ${
      on ? 'border-blue bg-blue-50/70 text-blue-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
    }`

  if (baseForm === 'kb6') {
    return <section className="ws-card p-5 space-y-3" aria-live="polite">
      {baseMethods.length > 0
        ? <p role="status" className="text-muted">กำลังเปิดงานตามวิธีคุ้มครองใน คบ.6</p>
        : <>
          <h2 className="font-bold text-navy">ไม่พบวิธีคุ้มครองใน คบ.6</h2>
          <p className="text-muted">ตรวจสอบวิธีคุ้มครองในแฟ้มคำร้องก่อนเปิดงาน</p>
          <Link to="/dossier/$caseNo" params={{ caseNo: caseItem.no }} className="inline-flex min-h-[44px] items-center font-semibold text-navy underline">เปิดแฟ้ม</Link>
        </>}
    </section>
  }

  return <section className="ws-card p-5 space-y-4" data-testid="method-choice-panel">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
      <div>
        <p className="ws-kicker">เลือกแนวทางดำเนินการ</p>
        <h2 className="text-[1.1rem] font-bold text-navy">{caseItem.no} · {caseItem.person}</h2>
        <p className="text-[0.8rem] text-muted">ฐานคำสั่ง: {orderBase}{caseItem.decisionNumber ? ` · เลขที่ ${caseItem.decisionNumber}` : ''}</p>
      </div>
      <Link to="/dossier/$caseNo" params={{ caseNo: caseItem.no }} className="inline-flex min-h-[44px] items-center rounded-lg border border-line px-3 py-2 font-semibold text-navy hover:bg-soft">เปิดแฟ้ม</Link>
    </header>

    <fieldset className="space-y-3">
      <legend className="mb-2 text-[0.8rem] font-semibold text-slate-700">{lockToBase ? `ดำเนินการตามวิธีใน ${baseLabel}` : `เลือกว่าจะดำเนินการตามวิธีใน ${baseLabel} หรือเลือกวิธีใหม่`}</legend>

      <label className={`${optionClass(mode === 'base')} ${baseMethods.length ? '' : 'cursor-not-allowed opacity-60'}`}>
        <input type="radio" name="method-choice-mode" value={baseForm} className="mt-1 h-[18px] w-[18px] shrink-0 accent-navy" checked={mode === 'base'} disabled={!baseMethods.length}
          onChange={() => { setMode('base'); setError('') }} data-testid={`method-choice-${baseForm}`} />
        <span className="min-w-0">
          <span className="block font-bold text-navy">1. ดำเนินการตาม {baseLabel}</span>
          {baseMethods.length
            ? <span className="mt-1 block text-[0.85rem] text-muted">
              {baseMethods.map(methodLine).join(' · ')}
              {baseAgencyLabel && <span className="block" data-testid="method-choice-base-agency">หน่วยงานปลายทาง: {baseAgencyLabel}</span>}
            </span>
            : <span className="mt-1 block text-[0.85rem] text-muted">ไม่พบวิธีคุ้มครองที่{baseForm === 'kb4' ? 'ขอ' : 'เสนอ'}ไว้ใน {baseLabel} — กรุณาเลือกใหม่</span>}
        </span>
      </label>

      {!lockToBase && <div className={`rounded-xl border ${mode === 'new' ? 'border-blue bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 p-3.5 text-sm leading-relaxed">
          <input type="radio" name="method-choice-mode" value="new" className="mt-1 h-[18px] w-[18px] shrink-0 accent-navy" checked={mode === 'new'}
            onChange={() => { setMode('new'); setError('') }} data-testid="method-choice-new" />
          <span className="min-w-0">
            <span className="block font-bold text-navy">2. เลือกใหม่</span>
            <span className="mt-1 block text-[0.85rem] text-muted">ข้อ 2.1–2.3 เลือกร่วมกันได้ · ข้อ 2.4 เลือกเดี่ยว</span>
          </span>
        </label>

        {mode === 'new' && <div className="space-y-2 border-t border-line px-3.5 pb-3.5 pt-3">
          {ROUTABLE_PROTECTION_METHODS.map((n) => {
            const m = n as ProtectionMethodNo
            const on = selected.includes(m)
            return <div key={m} className="space-y-2">
              <label className={optionClass(on)}>
                <input type="checkbox" className="mt-1 h-[18px] w-[18px] shrink-0 accent-navy" checked={on} onChange={() => toggle(m)} data-testid={`method-choice-option-${m}`} />
                <span className="min-w-0"><span className="font-bold">2.{m} </span>{METHOD_CHOICE_LABELS[m]}</span>
              </label>
              {m === 4 && on && <fieldset className="ml-4 space-y-2 border-l-2 border-line pl-4 sm:ml-8" data-testid="method-choice-agencies">
                <legend className="mb-1 text-[0.8rem] font-semibold text-slate-700">หน่วยงานที่จะส่งให้ดำเนินการ (เลือกหนึ่งหน่วยงาน)</legend>
                {COORDINATION_AGENCY_TYPES.map((t, i) => <label key={t.value} className={optionClass(agencyType === t.value)}>
                  <input type="radio" name="method-choice-agency" value={t.value} className="mt-1 h-[18px] w-[18px] shrink-0 accent-navy" checked={agencyType === t.value}
                    onChange={() => { setAgencyType(t.value); setError('') }} data-testid={`method-choice-agency-${t.value}`} />
                  <span className="min-w-0"><span className="font-bold">2.4.{i + 1} </span>{t.label}</span>
                </label>)}
              </fieldset>}
            </div>
          })}
        </div>}
      </div>}
    </fieldset>

    {error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
      <Button type="button" variant="primary" size="md" onClick={handleConfirm} data-testid="method-choice-confirm">
        <i className="fa-solid fa-diagram-project" aria-hidden="true" />
        ยืนยันและเปิดงาน
      </Button>
    </div>
  </section>
}
