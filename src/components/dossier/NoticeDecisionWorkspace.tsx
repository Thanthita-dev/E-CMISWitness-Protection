import React, { useEffect, useRef, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import type { CaseItem, ProtectionHandoffDestination } from '../../types/case'
import { NOTICE_DETAIL_FIELDS, hasSignedResultNotice, type NoticeDecisionDraftInput } from '../../lib/noticeDocuments'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { PROTECTION_MAX_DAYS, readRoutableProtectionMethods } from '../../lib/constants'
import { useFormDraftStore, selectCaseDraft } from '../../store/useFormDraftStore'
import { Button } from '../common/Button'
import { FormPaperViewer } from '../forms/FormPaperViewer'

interface NoticeDecisionWorkspaceProps {
  caseItem: CaseItem
  onBack: () => void
  onConfirmed: () => void
  onDirtyChange?: (dirty: boolean) => void
}
const UNSAVED_WARNING = 'มีข้อมูลที่ยังไม่บันทึก ต้องการออกโดยไม่บันทึกหรือไม่?'
const FRIENDLY_LABELS: Record<string, string> = {
  เลขที่หนังสือ: 'ที่ ปป', ปีหนังสือ: 'เลขหนังสือ', วันที่: 'วัน', เดือน: 'เดือน', 'พ.ศ.': 'พ.ศ.', คำร้องลงวันที่: 'วันที่คำร้องที่อ้างถึง',
}
const draftInput = (item: CaseItem): NoticeDecisionDraftInput => {
  const selected = item.preliminaryDecision
  const notice = selected ? item.resultNotices?.[selected.formNo] : undefined
  return {
    decisionNo: selected?.decisionNo || '', reason: selected?.reason || '', instruction: selected?.instruction || '',
    destination: selected?.destination, durationDays: selected?.durationDays || item.protectionDays || 30,
    fields: Object.fromEntries(NOTICE_DETAIL_FIELDS.map((key) => [key, notice?.fields[key] || ''])),
  }
}

const workingDraftKey = (item: CaseItem) => `ecmis-notice-working:${item.no}:${item.preliminaryDecision?.formNo}`
const recoverWorkingInput = (item: CaseItem): NoticeDecisionDraftInput => {
  const saved = draftInput(item)
  try {
    const raw = sessionStorage.getItem(workingDraftKey(item))
    const working = raw ? JSON.parse(raw) : null
    if (working?.baseline === JSON.stringify(saved) && working.input && typeof working.input.reason === 'string' && typeof working.input.decisionNo === 'string' && working.input.fields) return working.input
  } catch { /* ข้อมูลการกู้คืนที่อ่านไม่ได้ไม่แทนร่างที่บันทึกจริง */ }
  return saved
}

/** เลือกผลเป็นร่างก่อน แล้วตรวจและยืนยันจริงจากพื้นที่เอกสารเดียวกัน */
export const NoticeDecisionWorkspace: React.FC<NoticeDecisionWorkspaceProps> = ({ caseItem, onBack, onConfirmed, onDirtyChange }) => {
  const draft = caseItem.preliminaryDecision
  const auth = useAuthStore()
  const [input, setInput] = useState(() => recoverWorkingInput(caseItem))
  const [savedInput, setSavedInput] = useState(() => JSON.stringify(draftInput(caseItem)))
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [largePreview, setLargePreview] = useState(false)
  const submitting = useRef(false)
  const leaveAllowed = useRef(false)
  const dirty = JSON.stringify(input) !== savedInput
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useBlocker({
    disabled: !dirty,
    enableBeforeUnload: dirty,
    shouldBlockFn: () => {
      if (!dirtyRef.current || leaveAllowed.current) return false
      if (!window.confirm(UNSAVED_WARNING)) return true
      sessionStorage.removeItem(workingDraftKey(caseItem))
      leaveAllowed.current = true
      return false
    },
  })
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => {
    const next = draftInput(caseItem)
    setInput(recoverWorkingInput(caseItem)); setSavedInput(JSON.stringify(next)); setError(''); setSavedMessage('')
    leaveAllowed.current = false
  }, [caseItem.no, draft?.formNo])

  useEffect(() => {
    const key = workingDraftKey(caseItem)
    if (dirty) sessionStorage.setItem(key, JSON.stringify({ baseline: savedInput, input }))
    else sessionStorage.removeItem(key)
  }, [caseItem.no, draft?.formNo, dirty, input, savedInput])

  if (!draft || hasSignedResultNotice(caseItem)) return null
  const formNo = draft.formNo
  const editable = ['secretary', 'admin'].includes(auth.currentRole) && caseItem.stage === 'external_pending'
  const update = (patch: Partial<NoticeDecisionDraftInput>) => { setInput((old) => ({ ...old, ...patch })); setError(''); setSavedMessage('') }
  const save = (): boolean => {
    let ok = false
    try { ok = useCaseStore.getState().savePreliminaryDecision(caseItem.no, formNo, input) } catch {
      setError('บันทึกไม่สำเร็จ กรุณาลองใหม่ ข้อมูลที่กรอกยังอยู่ในหน้านี้')
      return false
    }
    if (!ok) { setError('บันทึกไม่สำเร็จ กรุณาตรวจสิทธิหรือสถานะของแฟ้ม ข้อมูลที่กรอกยังอยู่ในหน้านี้'); return false }
    setSavedInput(JSON.stringify(input)); dirtyRef.current = false
    sessionStorage.removeItem(workingDraftKey(caseItem))
    setSavedMessage('บันทึกร่างแล้ว — ยังไม่ได้ยืนยันผล ลงนาม หรือส่งงาน')
    setError('')
    return true
  }
  const confirm = (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting.current) return
    if (!input.decisionNo.trim()) { setError('กรุณาระบุเลขอ้างอิงผลพิจารณา'); return }
    if (!input.reason.trim()) { setError('กรุณาระบุเหตุผลประกอบผลพิจารณา'); return }
    if (formNo === 9 && !input.destination) { setError('กรุณาเลือกผู้รับผิดชอบดำเนินการต่อ'); return }
    if (!caseItem.kb6SecretarySignedAt) { setError('ต้องลงนามความเห็นข้อ 13 ใน คบ.6 ก่อนยืนยันผล'); return }
    submitting.current = true; setBusy(true)
    try {
      if (!save()) return
      if (!useCaseStore.getState().confirmPreliminaryDecision(caseItem.no, formNo)) {
        setError('ยืนยันไม่สำเร็จ กรุณาตรวจสิทธิ สถานะแฟ้ม และผู้รับผิดชอบ ร่างที่บันทึกยังอยู่และลองใหม่ได้')
        setSavedMessage('')
        return
      }
      leaveAllowed.current = true
      onConfirmed()
    } catch {
      setError('ยืนยันไม่สำเร็จ กรุณาลองใหม่ ร่างและข้อมูลที่กรอกยังอยู่ในหน้านี้')
      setSavedMessage('')
    } finally { submitting.current = false; setBusy(false) }
  }
  const back = () => {
    if (dirtyRef.current && !window.confirm(UNSAVED_WARNING)) return
    sessionStorage.removeItem(workingDraftKey(caseItem))
    leaveAllowed.current = true
    onBack()
  }
  const methods = readRoutableProtectionMethods(selectCaseDraft(useFormDraftStore.getState(), 6, caseItem.no))
  const previewContext: CaseItem = { ...caseItem, resultReason: input.reason, resultAt: new Date().toISOString(), protectionDays: input.durationDays,
    kb9SignedAt: undefined, kb9SignedBy: undefined, kb10SignedAt: undefined, kb10SignedBy: undefined, secretarySignedAt: undefined, secretarySignedBy: undefined }
  const previewFields = { ...input.fields, ...(formNo === 10 ? { สาระสำคัญ: input.reason } : { วันที่อนุมัติ: new Date().toISOString() }) }
  return <section className="ws-card p-4 md:p-5 space-y-4" data-testid="notice-decision-workspace" aria-labelledby="notice-decision-title">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
      <div><h3 id="notice-decision-title" className="text-[1.1rem] font-bold text-navy">คบ.{formNo} · {formNo === 9 ? 'หนังสือแจ้งตอบรับการคุ้มครอง' : 'หนังสือแจ้งไม่ให้การคุ้มครอง'}</h3>
        <p className="mt-1 text-[0.88rem] text-muted">เลขคำร้อง <strong data-testid="notice-decision-case-no" className="text-ink">{caseItem.no}</strong>{caseItem.mainCaseNo && <> · เลขสำนวน {caseItem.mainCaseNo}</>}</p>
      </div>
      <span data-testid="notice-decision-status" className="ws-status"><i className="fa-solid fa-file-pen mr-1" aria-hidden="true" />ร่าง รอยืนยันลงนาม</span>
    </header>
    {!editable && <p role="status" className="ws-readonly">บทบาทปัจจุบันดูร่างได้ แต่ไม่มีสิทธิแก้ไขหรือยืนยันลงนามหนังสือฉบับนี้</p>}
    <form onSubmit={confirm} className="space-y-4">
      <div className={`grid grid-cols-1 gap-4 items-start ${largePreview ? '' : 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]'}`}>
        <fieldset disabled={!editable || busy} className="m-0 min-w-0 border-0 p-0 space-y-4">
          <legend className="sr-only">ข้อมูลสำหรับยืนยันผลพิจารณา</legend>
          <label className="ws-field block"><span className="ws-label">เลขอ้างอิงผลพิจารณา *</span>
            <input data-testid="notice-decision-number" className="ws-input w-full" value={input.decisionNo} onChange={(event) => update({ decisionNo: event.target.value })} />
          </label>
          <label className="ws-field block"><span className="ws-label">{formNo === 9 ? 'เหตุผลประกอบผลอนุมัติ' : 'เหตุผลที่ไม่อนุมัติ'} *</span>
            <textarea data-testid="notice-decision-reason" className="ws-input w-full" rows={3} value={input.reason} onChange={(event) => update({ reason: event.target.value })} />
          </label>
          {formNo === 9 && <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="ws-field block"><span className="ws-label">ผู้รับผิดชอบดำเนินการต่อ *</span>
                <select data-testid="notice-decision-destination" className="ws-input w-full" value={input.destination || ''} onChange={(event) => update({ destination: (event.target.value || undefined) as ProtectionHandoffDestination | undefined })}>
                  <option value="">เลือกผู้รับผิดชอบ</option><option value="original_owner">เจ้าของสำนวนเดิม</option><option value="got">กอท.</option>
                </select>
              </label>
              <label className="ws-field block"><span className="ws-label">ระยะเวลาคุ้มครอง (วัน) *</span>
                <input data-testid="notice-decision-duration" className="ws-input w-full" type="number" min={1} max={PROTECTION_MAX_DAYS} value={input.durationDays} onChange={(event) => update({ durationDays: Number(event.target.value) })} />
              </label>
            </div>
            {input.destination && <p className="text-[0.88rem] text-muted">ผู้รับ: {input.destination === 'got' ? 'ธุรการคดี กอท. → เสนอ ผอ. มอบหมายผู้รับผิดชอบ' : caseItem.assignedOfficer || 'เจ้าของสำนวนเดิม'}</p>}
            {methods.length > 0 && <p className="text-[0.88rem] text-muted">วิธีคุ้มครองตาม คบ.6: {methods.map((method) => `วิธีที่ ${method}`).join(' · ')}</p>}
            <label className="ws-field block"><span className="ws-label">คำสั่ง / หมายเหตุ</span>
              <textarea data-testid="notice-decision-instruction" className="ws-input w-full" rows={2} value={input.instruction} onChange={(event) => update({ instruction: event.target.value })} />
            </label>
          </>}
          <div className="border-t border-line pt-3 space-y-3">
            <p className="text-[0.88rem] text-muted">รายละเอียดบางส่วนสามารถเติมหลังลงนามได้</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{['เลขที่หนังสือ', 'ปีหนังสือ'].map((field) => <label key={field} className="ws-field block"><span className="ws-label">{FRIENDLY_LABELS[field]}</span><input data-testid={`notice-decision-detail-${field}`} className="ws-input w-full" value={input.fields[field]} onChange={(event) => update({ fields: { ...input.fields, [field]: event.target.value } })} /></label>)}</div>
            <div><p className="ws-label">วันที่หนังสือ</p><div className="grid grid-cols-3 gap-2">{['วันที่', 'เดือน', 'พ.ศ.'].map((field) => <label key={field} className="ws-field block"><span className="ws-label">{FRIENDLY_LABELS[field]}</span><input data-testid={`notice-decision-detail-${field}`} className="ws-input w-full" value={input.fields[field]} onChange={(event) => update({ fields: { ...input.fields, [field]: event.target.value } })} /></label>)}</div></div>
            <label className="ws-field block"><span className="ws-label">{FRIENDLY_LABELS['คำร้องลงวันที่']}</span><input data-testid="notice-decision-detail-คำร้องลงวันที่" className="ws-input w-full" value={input.fields['คำร้องลงวันที่']} onChange={(event) => update({ fields: { ...input.fields, 'คำร้องลงวันที่': event.target.value } })} /></label>
          </div>
        </fieldset>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-[0.88rem] text-navy">ตัวอย่างเอกสาร A4</strong><Button type="button" variant="secondary" size="sm" data-testid="notice-decision-expand-preview" onClick={() => setLargePreview((old) => !old)} aria-expanded={largePreview}>{largePreview ? 'แสดงคู่กับช่องกรอก' : 'ขยายตัวอย่างเต็มพื้นที่'}</Button></div>
          <FormPaperViewer formId={formNo} caseNo={caseItem.no} noticeDraftPreview={{ fields: previewFields, caseContext: previewContext }} />
        </div>
      </div>
      <details className="text-[0.8rem] text-muted"><summary className="cursor-pointer">ข้อจำกัดการลงนามและประวัติร่าง</summary><p className="mt-2">ลายมือชื่อจำลอง ไม่มีผลทางกฎหมาย ฉบับ ณ เวลาลงนามจะเก็บแยกจากรายละเอียดที่เติมภายหลัง และไม่ถือว่าลายมือชื่อเดิมรับรองเนื้อหาที่เติมใหม่</p><p className="mt-1">{draft.savedAt ? `บันทึกร่างล่าสุด ${draft.savedAt} โดย ${draft.savedBy}` : 'ยังไม่ได้บันทึกการแก้ไขร่าง'} · ประวัติการเลือกผล {caseItem.preliminaryDecisionHistory?.length || 0} ครั้ง</p></details>
      {error && <p data-testid="notice-decision-error" role="alert" className="rounded-lg border border-danger bg-danger-soft p-3 text-danger-dark">{error}</p>}
      {savedMessage && <p data-testid="notice-decision-saved-message" role="status" className="ws-readonly">{savedMessage}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white pt-3" data-testid="notice-decision-actions">
        <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" size="md" data-testid="notice-decision-back" onClick={back} disabled={busy}>กลับไปเลือกผลพิจารณา</Button><Button type="button" variant="secondary" size="md" data-testid="notice-decision-save" onClick={save} disabled={!editable || busy}>บันทึกร่าง</Button></div>
        <Button type="submit" variant={formNo === 9 ? 'primary' : 'danger'} size="lg" className="w-full sm:w-auto" data-testid="notice-decision-confirm" disabled={!editable || busy}>{formNo === 9 ? 'ยืนยันอนุมัติและลงนาม คบ.9' : 'ยืนยันไม่อนุมัติและลงนาม คบ.10'}</Button>
      </div>
    </form>
  </section>
}
