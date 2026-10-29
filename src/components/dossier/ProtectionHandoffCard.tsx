import { protectionMonths, monthLabel } from '../../lib/protectionMonths'
import React from 'react'
import { SignedDecisionSendCard } from './SignedDecisionSendCard'
import { createPortal } from 'react-dom'
import { Link } from '@tanstack/react-router'
import type { CaseItem } from '../../types/case'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { Button } from '../common/Button'
import { Badge } from '../common/Badge'
import { GOT_UNIT_NAME, HANDOFF_STATUS, canOperateHandoff, gotAssignableOfficers, roleForCase } from '../../lib/protectionHandoff'
import { kb11Gate } from '../../lib/formSignature'
import { METHOD_LABELS } from '../../lib/episode'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'
import { VoiceTextarea } from '../common/VoiceTextarea'

type HandoffAction = 'receive' | 'submit' | 'assign' | 'accept'

/** ข้อความสถานะตามทะเบียนสารบรรณ — การรับเรื่องที่ปลายทางทำผ่าน SarabanTransitCard (ลงเลขรับครบแล้วจึงส่ง) */
const registryStatus = (h: NonNullable<CaseItem['protectionHandoff']>): string | undefined => {
  if (h.step === 'pending_outgoing') return 'รอธุรการสำนักงานเลขาธิการ ออกเลขทะเบียนส่ง'
  if (h.step === 'pending_receipt') return h.destination === 'got' ? 'รอธุรการคดี กอท. ลงเลขทะเบียนรับ' : 'รอธุรการสำนัก/กอง เจ้าของสำนวนเดิม ลงเลขทะเบียนรับ'
  return undefined
}

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
  /** การรับเรื่องเข้าทะเบียน กอท. ย้ายไปที่ SarabanTransitCard (ลงเลขรับ → ส่ง) จึงไม่มีปุ่มรับเรื่องในการ์ดนี้อีก */
  const canReceive = false
  /** ตำแหน่งของ กอท. ในเมนูใช้บทบาททั่วไปกับบัญชี กอท. — ตัดสินจากหน้าที่ กอท. ของบัญชีในแฟ้มนี้ */
  const duty = roleForCase(currentRole, caseItem)
  const canAccept = duty === 'got_officer' && h?.step === 'assigned' && h.assigneeUserId === currentOfficerUserId
  const receiptOpen = (canReceive || canAccept) && dismissedReceipt !== receiptKey
  React.useEffect(() => {
    if (receiptOpen && !receiptDialog.current?.open) receiptDialog.current?.showModal()
    else if (!receiptOpen && receiptDialog.current?.open) receiptDialog.current.close()
  }, [receiptOpen])
  if (!h) return null
  if (h.step === 'pending_send') return <SignedDecisionSendCard caseItem={caseItem} />

  const officers = gotAssignableOfficers()
  const selected = officers.find((u) => u.id === assigneeId)
  const canSubmit = duty === 'got_receiver' && h.step === 'received'
  const canAssign = duty === 'got_director' && h.step === 'pending_assignment'
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
          void showToast(action === 'receive' ? 'รับเรื่องเข้าคิว กอท. แล้ว' : 'รับงานเรียบร้อยแล้ว')
        } else setError('สถานะงานหรือสิทธิ์เปลี่ยนไปแล้ว กรุณาเปิดแฟ้มเพื่อตรวจสอบอีกครั้ง')
        return
      }
      const recipient = action === 'submit' ? 'ผอ. กอท.' : action === 'assign' ? selected!.name : h.assigneeName || 'ธุรการคดี กอท.'
      const result = await showConfirmAlert({
        title: `${actionLabel[action]}?`,
        html: confirmBody('ตรวจสอบข้อมูลก่อนยืนยัน', [
          ['เลขคำร้อง', caseItem.no], ['ผลพิจารณาเดิม', `${caseItem.decisionNumber || '-'} · ${protectionMonths(caseItem) ? monthLabel(protectionMonths(caseItem)) : '-'}`],
          ['ผู้รับงาน', recipient],
          ['คำสั่ง / หมายเหตุ', note.trim() || 'ไม่ระบุ'],
        ], action === 'assign' ? 'มอบหมายให้ดำเนินการตามผลพิจารณาเดิม' : 'ใช้เรื่องและเอกสารในแฟ้มเดิมต่อเนื่อง'),
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
            <p className="text-[0.8rem] text-muted">ผอ. กอท. มอบหมายเจ้าหน้าที่ดำเนินการตามผลพิจารณา</p>
          </div>
        </div>
        <span data-testid="handoff-status" className="rounded-full bg-gold-soft px-3 py-1 text-[0.8rem] font-semibold text-gold-dark">รอมอบหมายผู้รับผิดชอบ</span>
      </header>
      <div className="rounded-xl border border-line bg-soft p-3.5 text-[0.88rem] leading-relaxed text-muted">
        <p><i className="fa-solid fa-circle-info mr-1.5" aria-hidden="true" />{caseItem.activity7State === 'rejected' ? 'ไม่อนุมัติให้ความคุ้มครอง' : `อนุมัติให้ความคุ้มครอง ${protectionMonths(caseItem) ? monthLabel(protectionMonths(caseItem)) : '—'}`}</p>
        <ul className="mt-1 space-y-1 text-ink">
          {(caseItem.orderedMethods || []).map((method) => <li key={method}>{METHOD_LABELS[method]}</li>)}
        </ul>
        {h.secretaryInstruction && <p className="mt-1 whitespace-pre-wrap break-words">ข้อสั่งการเลขาธิการ: {h.secretaryInstruction}</p>}
      </div>
      <div className="ws-field">
        <label htmlFor="gotAssignee" className="block text-[0.8rem] font-semibold text-slate-700 mb-1">เลือกเจ้าหน้าที่ผู้รับผิดชอบ <span className="text-danger">*</span></label>
        <select id="gotAssignee" data-testid="got-assignee-select" className="ws-input w-full text-ink" value={assigneeId} onChange={(e) => { setAssigneeId(e.target.value); setError('') }}>
          <option value="">เลือกผู้รับผิดชอบ</option>
          {officers.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.position} ({GOT_UNIT_NAME})</option>)}
        </select>
      </div>
      <div className="ws-field">
        <label htmlFor="gotHandoffNote" className="block text-[0.8rem] font-semibold text-slate-700 mb-1">คำสั่งมอบหมาย <span className="text-danger">*</span></label>
        <VoiceTextarea id="gotHandoffNote" data-testid="got-handoff-note" className="ws-input w-full" rows={2} value={note} onChange={(e) => { setNote(e.target.value); setError('') }} />
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
          <h2 className="text-[1.1rem] font-bold text-navy">ผู้รับผิดชอบหลังพิจารณา</h2>
          <p className="mt-1 text-[0.8rem] text-muted">{h.destination === 'got' ? GOT_UNIT_NAME : 'ดำเนินงานโดยเจ้าของสำนวนเดิม'}</p>
        </div>
        <Badge variant={h.step === 'accepted' ? 'success' : 'warning'} icon={h.step === 'accepted' ? 'circle-check' : 'clock'}>
          {h.step === 'accepted' ? 'รับงานแล้ว' : 'อยู่ระหว่างส่งต่อ'}
        </Badge>
      </header>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t border-line pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-[0.8rem] text-muted">{h.step === 'accepted' ? 'เจ้าของสำนวนปัจจุบัน' : 'ผู้รับงานขั้นนี้'}</p>
          <p data-testid="handoff-current-recipient" className="mt-1 break-words text-[1.1rem] font-bold text-navy">{h.step === 'accepted' ? h.assigneeName || caseItem.owner : caseItem.owner}</p>
          <p data-testid="handoff-status" className="mt-1 text-[0.88rem] text-muted">{h.destination === 'original_owner' && h.step === 'accepted' ? 'รับเลขแล้ว · ส่งงานให้เจ้าของสำนวนเดิมดำเนินการต่อ' : registryStatus(h) || HANDOFF_STATUS[h.step]}</p>
          {registryStatus(h) && <p className="mt-1 text-[0.8rem] text-muted">ลงทะเบียนสารบรรณที่การ์ดทะเบียนด้านบน — ไม่มีการกดรับเรื่องซ้ำในการ์ดนี้</p>}
        </div>
        {caseItem.activity7State !== 'rejected' && <div className="shrink-0 border-l border-line pl-4">
          <p className="text-[0.8rem] text-muted">ระยะเวลาที่อนุมัติ</p>
          <p className="mt-1 text-[1.1rem] font-bold text-navy">{protectionMonths(caseItem) || '—'} <span className="text-[0.88rem] font-normal text-muted">เดือน</span></p>
        </div>}
      </div>

      <div className="space-y-2">
        {caseItem.activity7State !== 'rejected' && <><h3 className="text-[0.8rem] text-muted">วิธีคุ้มครองที่อนุมัติ</h3>
        <ul className="space-y-1 text-[0.88rem] font-semibold text-ink">
          {(caseItem.orderedMethods || []).length ? caseItem.orderedMethods!.map((method) => <li key={method} className="flex items-start gap-2"><i className="fa-solid fa-check mt-1 text-blue" aria-hidden="true" /><span>{METHOD_LABELS[method]}</span></li>) : <li>ตามแบบ คบ.6 ในแฟ้ม</li>}
        </ul></>}
        {h.secretaryInstruction && <p className="break-words whitespace-pre-wrap text-[0.88rem] text-ink"><span className="text-muted">ข้อสั่งการเลขาธิการ: </span>{h.secretaryInstruction}</p>}
        {h.assignmentInstruction && <p className="break-words whitespace-pre-wrap text-[0.88rem] text-ink"><span className="text-muted">คำสั่งมอบหมาย ผอ. กอท.: </span>{h.assignmentInstruction}</p>}
      </div>

      <details className="border-t border-line pt-3">
        <summary className="cursor-pointer text-[0.88rem] font-semibold text-navy">ผลพิจารณาและเอกสารอ้างอิง</summary>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-[0.88rem] sm:grid-cols-2">
          <div><dt className="text-muted">ผลพิจารณา</dt><dd>{caseItem.activity7State === 'rejected' ? 'ไม่อนุมัติให้ความคุ้มครอง' : 'อนุมัติให้ความคุ้มครอง'} · {caseItem.decisionNumber || '—'}</dd></div>
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
            <label htmlFor="gotAssignee" className="ws-label">ผู้รับผิดชอบจากบุคลากรที่มีสิทธิรับงาน <span className="text-danger">*</span></label>
            <select id="gotAssignee" data-testid="got-assignee-select" className="ws-input w-full" value={assigneeId} onChange={(e) => { setAssigneeId(e.target.value); setError('') }}>
              <option value="">เลือกผู้รับผิดชอบ</option>
              {officers.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.position}</option>)}
            </select>
          </div>}
          <div className="ws-field">
            <label htmlFor="gotHandoffNote" className="ws-label">{canAssign ? <>คำสั่งมอบหมาย <span className="text-danger">*</span></> : 'หมายเหตุ'}</label>
            <VoiceTextarea id="gotHandoffNote" data-testid="got-handoff-note" className="ws-input w-full" rows={3} value={note} onChange={(e) => { setNote(e.target.value); setError('') }} />
          </div>
          {error && <p role="alert" className="text-[0.88rem] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
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
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl bg-white p-0 text-ink shadow-card backdrop:bg-[rgba(4,17,36,.52)]">
        <div className="p-5 sm:p-6 space-y-5">
          <header className="border-b border-line pb-4">
            <p className="text-[0.8rem] font-semibold text-muted">กองอำนวยการต่อต้านทุจริต</p>
            <h2 className="mt-1 text-xl font-bold text-navy">{canAccept ? 'รับมอบหมายสำนวน' : 'รับเรื่อง'}</h2>
            <p className="mt-2 text-sm text-muted">คำร้อง {caseItem.no} · {caseItem.person}</p>
          </header>
          <div className={`rounded-xl border px-5 py-4 ${caseItem.activity7State === 'rejected' ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <p className={`text-sm font-semibold ${caseItem.activity7State === 'rejected' ? 'text-rose-700' : 'text-emerald-700'}`}>ผลพิจารณาของเลขาธิการ ป.ป.ท.</p>
            <div className="mt-2 flex items-start gap-3">
              <i className={`fa-solid ${caseItem.activity7State === 'rejected' ? 'fa-circle-xmark text-rose-700' : 'fa-circle-check text-emerald-700'} mt-1 text-2xl`} aria-hidden="true" />
              <p className={`text-2xl font-bold leading-snug ${caseItem.activity7State === 'rejected' ? 'text-rose-900' : 'text-emerald-900'}`}>{caseItem.activity7State === 'rejected' ? 'ไม่อนุมัติให้ความคุ้มครอง' : 'อนุมัติให้ความคุ้มครอง'}</p>
            </div>
            {caseItem.resultReason && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{caseItem.resultReason}</p>}
          </div>
          <dl className="text-sm">
            <dt className="text-muted">ผู้รับผิดชอบสำนวน</dt>
            <dd className="mt-1 font-semibold text-navy">{h.assigneeName || caseItem.owner}</dd>
          </dl>
          {h.assignmentInstruction && <div className="rounded-lg bg-soft px-4 py-3">
            <p className="text-[0.8rem] font-semibold text-muted">คำสั่งมอบหมาย ผอ. กอท.</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{h.assignmentInstruction}</p>
          </div>}
          <details className="border-y border-line py-3 text-sm">
            <summary className="cursor-pointer font-semibold text-navy">เอกสารอ้างอิง ({(caseItem.documents || []).filter((doc) => !doc.deleted).length})</summary>
            <ul className="mt-3 space-y-2 text-muted">
              {(caseItem.documents || []).filter((doc) => !doc.deleted).map((doc) => <li key={doc.id} className="flex items-start gap-2"><i className="fa-regular fa-file-lines mt-1 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{doc.name}</span></li>)}
            </ul>
          </details>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
        <footer className="flex justify-end border-t border-line bg-soft px-5 py-4 sm:px-6">
          <Button type="button" variant="primary" size="md" className="w-full sm:w-auto" disabled={busy} data-testid={canAccept ? 'got-accept-button' : 'got-receive-button'} onClick={() => confirmAction(canAccept ? 'accept' : 'receive')}>
            <i className="fa-solid fa-check" aria-hidden="true" />{canAccept ? 'ยืนยันรับงาน' : 'ยืนยันรับเรื่อง'}
          </Button>
        </footer>
      </dialog>, document.body)}
  </>
}
