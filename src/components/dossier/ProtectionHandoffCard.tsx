import { protectionMonths, monthLabel } from '../../lib/protectionMonths'
import React from 'react'
import { createPortal } from 'react-dom'
import { Link } from '@tanstack/react-router'
import type { CaseItem } from '../../types/case'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { Button } from '../common/Button'
import { Badge } from '../common/Badge'
import { GOT_UNIT_NAME, HANDOFF_STATUS, canOperateHandoff, gotAssignableOfficers } from '../../lib/protectionHandoff'
import { kb11Gate } from '../../lib/formSignature'
import { METHOD_LABELS } from '../../lib/episode'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'

type HandoffAction = 'receive' | 'submit' | 'assign' | 'accept'

/** ใช้แฟ้มเดิม เป็นการส่ง/มอบหมายงานตามผลอนุมัติ ไม่ใช่การพิจารณาคำร้องรอบใหม่ */
export const ProtectionHandoffCard: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const { currentRole, currentOfficerUserId } = useAuthStore()
  const advance = useCaseStore((s) => s.advanceProtectionHandoff)
  const [assigneeId, setAssigneeId] = React.useState('')
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const confirming = React.useRef(false)
  const h = caseItem.protectionHandoff
  const [dismissedReceipt, setDismissedReceipt] = React.useState('')
  const receiptDialog = React.useRef<HTMLDialogElement>(null)
  const receiptKey = `${caseItem.no}:${currentRole}`
  const canReceive = currentRole === 'got_receiver' && h?.step === 'pending_receipt'
  const canAccept = currentRole === 'got_officer' && h?.step === 'assigned' && h.assigneeUserId === currentOfficerUserId
  const receiptOpen = (canReceive || canAccept) && dismissedReceipt !== receiptKey
  React.useEffect(() => {
    if (receiptOpen && !receiptDialog.current?.open) receiptDialog.current?.showModal()
    else if (!receiptOpen && receiptDialog.current?.open) receiptDialog.current.close()
  }, [receiptOpen])
  if (!h) return null

  const officers = gotAssignableOfficers()
  const selected = officers.find((u) => u.id === assigneeId)
  const canSubmit = currentRole === 'got_receiver' && h.step === 'received'
  const canAssign = currentRole === 'got_director' && h.step === 'pending_assignment'
  const canProceed = canOperateHandoff(currentRole, caseItem, currentOfficerUserId) && kb11Gate(caseItem).unlocked && Boolean(caseItem.kb11Signed)
  const actionLabel: Record<HandoffAction, string> = {
    receive: 'รับเรื่อง', submit: 'ส่งเสนอ ผอ. กอท.', assign: 'ยืนยันมอบหมาย', accept: 'รับงานและดำเนินการต่อ',
  }

  const confirmAction = async (action: HandoffAction) => {
    if (confirming.current) return
    if (action === 'assign' && (!selected || !note.trim())) {
      setError('เลือกผู้รับผิดชอบและระบุคำสั่งมอบหมายก่อนยืนยัน')
      return
    }
    confirming.current = true
    setBusy(true)
    setError('')
    try {
      if (action === 'receive' || action === 'accept') {
        if (advance(caseItem.no, action, note)) {
          setNote('')
          void showToast(action === 'receive' ? 'รับเรื่องเข้าคิว กอท. แล้ว' : 'รับงานคุ้มครองเรียบร้อยแล้ว')
        } else setError('สถานะงานหรือสิทธิ์เปลี่ยนไปแล้ว กรุณาเปิดแฟ้มเพื่อตรวจสอบอีกครั้ง')
        return
      }
      const recipient = action === 'submit' ? 'ผอ. กอท.' : action === 'assign' ? selected!.name : h.assigneeName || 'ธุรการคดี กอท.'
      const result = await showConfirmAlert({
        title: `${actionLabel[action]}?`,
        html: confirmBody('ตรวจสอบข้อมูลก่อนยืนยัน', [
          ['เลขคำร้อง', caseItem.no], ['ผลอนุมัติเดิม', `${caseItem.decisionNumber || '-'} · ${protectionMonths(caseItem) ? monthLabel(protectionMonths(caseItem)) : '-'}`],
          ['ผู้รับงาน', recipient],
          ['คำสั่ง / หมายเหตุ', note.trim() || 'ไม่ระบุ'],
        ], action === 'assign' ? 'มอบหมายให้ดำเนินการตามผลอนุมัติเดิม' : 'ใช้เรื่องและเอกสารในแฟ้มเดิมต่อเนื่อง'),
        showCancelButton: true, confirmButtonText: actionLabel[action], cancelButtonText: 'ยกเลิก',
      })
      if (result.isConfirmed) {
        if (advance(caseItem.no, action, note, assigneeId)) { setNote(''); setAssigneeId('') }
        else setError('สถานะงานหรือสิทธิ์เปลี่ยนไปแล้ว กรุณาเปิดแฟ้มเพื่อตรวจสอบอีกครั้ง')
      }
    } finally {
      confirming.current = false
      setBusy(false)
    }
  }

  if (canAssign) return (
    <section data-testid="protection-handoff-card" className="ws-card border-l-4 border-l-gold p-5 space-y-4">
      <header className="flex flex-col gap-2 border-b border-amber-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-dark text-white">
            <i className="fa-solid fa-user-check text-base" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-[1.1rem] font-bold leading-snug text-navy">มอบหมายและจัดสรรผู้รับผิดชอบ</h2>
            <p className="text-[0.8rem] text-muted">ผอ. กอท. มอบหมายเจ้าหน้าที่ดำเนินการคุ้มครองตามผลอนุมัติ</p>
          </div>
        </div>
        <span data-testid="handoff-status" className="rounded-full bg-gold-soft px-3 py-1 text-[0.8rem] font-semibold text-gold-dark">รอมอบหมายผู้รับผิดชอบ</span>
      </header>
      <div className="rounded-xl border border-line bg-soft p-3.5 text-[0.88rem] leading-relaxed text-muted">
        <p><i className="fa-solid fa-circle-info mr-1.5" aria-hidden="true" />อนุมัติให้ความคุ้มครอง {protectionMonths(caseItem) ? monthLabel(protectionMonths(caseItem)) : '—'}</p>
        <ul className="mt-1 space-y-1 text-ink">
          {(caseItem.orderedMethods || []).map((method) => <li key={method}>{METHOD_LABELS[method]}</li>)}
        </ul>
        {h.secretaryInstruction && <p className="mt-1 whitespace-pre-wrap break-words">ข้อสั่งการเลขาธิการ: {h.secretaryInstruction}</p>}
      </div>
      <div className="ws-field">
        <label htmlFor="gotAssignee" className="block text-[0.8rem] font-semibold text-slate-700 mb-1">เลือกเจ้าหน้าที่ผู้รับผิดชอบ *</label>
        <select id="gotAssignee" data-testid="got-assignee-select" className="ws-input w-full text-ink" value={assigneeId} onChange={(e) => { setAssigneeId(e.target.value); setError('') }}>
          <option value="">เลือกผู้รับผิดชอบ</option>
          {officers.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.position} ({GOT_UNIT_NAME})</option>)}
        </select>
      </div>
      <div className="ws-field">
        <label htmlFor="gotHandoffNote" className="block text-[0.8rem] font-semibold text-slate-700 mb-1">คำสั่งมอบหมาย *</label>
        <textarea id="gotHandoffNote" data-testid="got-handoff-note" className="ws-input w-full" rows={2} value={note} onChange={(e) => { setNote(e.target.value); setError('') }} />
      </div>
      {error && <p role="alert" className="text-[0.88rem] text-danger">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-amber-100 pt-2">
        <Button type="button" variant="primary" size="md" disabled={busy} data-testid="got-assign-button" onClick={() => confirmAction('assign')}>
          <i className="fa-solid fa-user-check" aria-hidden="true" />มอบหมายผู้รับผิดชอบ
        </Button>
      </div>
    </section>
  )

  const card = (
    <section data-testid="protection-handoff-card" className="ws-card space-y-4 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[1.1rem] font-bold text-navy">ผู้รับผิดชอบหลังอนุมัติ</h2>
          <p className="mt-1 text-[0.8rem] text-muted">{h.destination === 'got' ? GOT_UNIT_NAME : 'ดำเนินงานโดยเจ้าของสำนวนเดิม'}</p>
        </div>
        <Badge variant={h.step === 'accepted' ? 'success' : 'warning'} icon={h.step === 'accepted' ? 'circle-check' : 'clock'}>
          {h.step === 'accepted' ? 'รับงานแล้ว' : 'อยู่ระหว่างส่งต่อ'}
        </Badge>
      </header>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t border-line pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-[0.8rem] text-muted">{h.step === 'accepted' ? 'ผู้รับผิดชอบดำเนินการคุ้มครองปัจจุบัน' : 'ผู้รับงานขั้นนี้'}</p>
          <p data-testid="handoff-current-recipient" className="mt-1 break-words text-[1.1rem] font-bold text-navy">{h.step === 'accepted' ? h.assigneeName || caseItem.owner : caseItem.owner}</p>
          <p data-testid="handoff-status" className="mt-1 text-[0.88rem] text-muted">{h.destination === 'original_owner' && h.step === 'accepted' ? 'อนุมัติแล้ว — ส่งงานให้เจ้าของสำนวนเดิมดำเนินการต่อ' : HANDOFF_STATUS[h.step]}</p>
        </div>
        <div className="shrink-0 border-l border-line pl-4">
          <p className="text-[0.8rem] text-muted">ระยะเวลาที่อนุมัติ</p>
          <p className="mt-1 text-[1.1rem] font-bold text-navy">{protectionMonths(caseItem) || '—'} <span className="text-[0.88rem] font-normal text-muted">เดือน</span></p>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-[0.8rem] text-muted">วิธีคุ้มครองที่อนุมัติ</h3>
        <ul className="space-y-1 text-[0.88rem] font-semibold text-ink">
          {(caseItem.orderedMethods || []).length ? caseItem.orderedMethods!.map((method) => <li key={method} className="flex items-start gap-2"><i className="fa-solid fa-check mt-1 text-blue" aria-hidden="true" /><span>{METHOD_LABELS[method]}</span></li>) : <li>ตามแบบ คบ.6 ในแฟ้ม</li>}
        </ul>
        {h.secretaryInstruction && <p className="break-words whitespace-pre-wrap text-[0.88rem] text-ink"><span className="text-muted">ข้อสั่งการเลขาธิการ: </span>{h.secretaryInstruction}</p>}
        {h.assignmentInstruction && <p className="break-words whitespace-pre-wrap text-[0.88rem] text-ink"><span className="text-muted">คำสั่งมอบหมาย ผอ. กอท.: </span>{h.assignmentInstruction}</p>}
      </div>

      <details className="border-t border-line pt-3">
        <summary className="cursor-pointer text-[0.88rem] font-semibold text-navy">ผลอนุมัติและเอกสารอ้างอิง</summary>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-[0.88rem] sm:grid-cols-2">
          <div><dt className="text-muted">ผลพิจารณา</dt><dd>อนุมัติให้ความคุ้มครอง · {caseItem.decisionNumber || '—'}</dd></div>
          <div><dt className="text-muted">เจ้าของสำนวนเดิม (อ้างอิง)</dt><dd>{h.originalOwnerName}</dd></div>
        </dl>
        <h3 className="mt-3 text-[0.8rem] text-muted">เอกสารประกอบในแฟ้มเดิม</h3>
        <ul className="mt-1 space-y-1 break-words text-[0.88rem] text-ink">
          {(caseItem.documents || []).filter((doc) => !doc.deleted).map((doc) => <li key={doc.id}>{doc.name}{doc.reference ? ` · ${doc.reference}` : ''}{doc.signed ? ' · ลงนามแล้ว' : ''}</li>)}
        </ul>
        <p className="mt-2 text-[0.8rem] text-muted">เปิดเอกสารได้จากรายการเอกสารในแฟ้มนี้{caseItem.demoData ? ' · ข้อมูลสำหรับสาธิต' : ''}</p>
      </details>
      {(canReceive || canSubmit || canAssign || canAccept) && (
        <div className="space-y-3 border-t border-line pt-4">
          {canAssign && <div className="ws-field">
            <label htmlFor="gotAssignee" className="ws-label">ผู้รับผิดชอบจากบุคลากรที่มีสิทธิรับงาน *</label>
            <select id="gotAssignee" data-testid="got-assignee-select" className="ws-input w-full" value={assigneeId} onChange={(e) => { setAssigneeId(e.target.value); setError('') }}>
              <option value="">เลือกผู้รับผิดชอบ</option>
              {officers.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.position}</option>)}
            </select>
          </div>}
          <div className="ws-field">
            <label htmlFor="gotHandoffNote" className="ws-label">{canAssign ? 'คำสั่งมอบหมาย *' : 'หมายเหตุ'}</label>
            <textarea id="gotHandoffNote" data-testid="got-handoff-note" className="ws-input w-full" rows={3} value={note} onChange={(e) => { setNote(e.target.value); setError('') }} />
          </div>
          {error && <p role="alert" className="text-[0.88rem] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {(canReceive || canAccept) && <Button type="button" variant="secondary" size="md" onClick={() => setDismissedReceipt(receiptKey)}>ไว้ภายหลัง</Button>}
            {canReceive && <Button type="button" variant="primary" size="md" disabled={busy} data-testid="got-receive-button" onClick={() => confirmAction('receive')}>{actionLabel.receive}</Button>}
            {canSubmit && <Button type="button" variant="primary" size="md" disabled={busy} data-testid="got-submit-button" onClick={() => confirmAction('submit')}>{actionLabel.submit}</Button>}
            {canAssign && <Button type="button" variant="primary" size="md" disabled={busy} data-testid="got-assign-button" onClick={() => confirmAction('assign')}>{actionLabel.assign}</Button>}
            {canAccept && <Button type="button" variant="primary" size="md" disabled={busy} data-testid="got-accept-button" onClick={() => confirmAction('accept')}>{actionLabel.accept}</Button>}
          </div>
        </div>
      )}
      {canProceed && <Link to="/protection-methods" className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-navy px-4 py-2 text-[0.88rem] font-semibold text-white transition hover:bg-navy-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">ไปดำเนินการตามวิธีคุ้มครอง</Link>}
    </section>
  )
  if (!canReceive && !canAccept) return card
  return <>
    <div className="flex justify-end">
      <Button type="button" variant="primary" size="md" onClick={() => setDismissedReceipt('')}>{canAccept ? 'เปิดหน้ารับงาน กอท.' : 'เปิดหน้ารับเรื่อง กอท.'}</Button>
    </div>
    {createPortal(
      <dialog ref={receiptDialog} aria-label={canAccept ? 'รับงานคุ้มครอง กอท.' : 'รับเรื่องหลังอนุมัติ กอท.'} onCancel={() => setDismissedReceipt(receiptKey)}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl bg-soft p-0 text-ink shadow-card backdrop:bg-[rgba(4,17,36,.52)]">
        {card}
      </dialog>, document.body)}
  </>
}
