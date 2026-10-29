import React, { useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import type { CaseItem, TerminationClause } from '../../types/case'
import { useFormDraftStore, selectCaseDraft } from '../../store/useFormDraftStore'
import { useCaseStore } from '../../store/useCaseStore'
import { TERMINATION_CLAUSES, article14Agency } from '../../lib/constants'
import { clauseFromDraft, reasonOptions, terminationExpiry } from '../../lib/terminationRules'
import { showConfirmAlert } from '../../lib/swal'
import { formatThaiDate } from '../../lib/utils'
import { Button } from '../common/Button'
import { VoiceTextarea } from '../common/VoiceTextarea'

/** Both existing entry points edit the same case-scoped KB15 draft. */
export function TerminationReasonFields({ caseItem, section = 'all', onClauseSelected }: { caseItem?: CaseItem; section?: 'all' | 'choice' | 'details'; onClauseSelected?: (clause: TerminationClause) => void }) {
  const state = useFormDraftStore()
  const draft = selectCaseDraft(state, 15, caseItem?.no)
  const kb7 = selectCaseDraft(state, 7, caseItem?.no)
  useEffect(() => {
    if (caseItem) state.ensureDraftForCase(15, caseItem.no, { 'ชื่อพยาน': caseItem.person })
  }, [caseItem?.no])
  const clause = clauseFromDraft(draft)
  const locked = Boolean(state.locks[15] || (caseItem?.kb15 && caseItem.kb15.status !== 'returned' && caseItem.kb15.status !== 'draft'))
  const set = (key: string, value: string) => state.updateField(15, key, value)
  const expiry = caseItem ? terminationExpiry(caseItem) : undefined
  const options = reasonOptions(clause)
  const selectClause = async (value: string) => {
    const next = Number(value) as TerminationClause
    if (clause === next || locked) return
    if (draft['ข้อระเบียบ'] || draft['เหตุยุติ']) {
      const result = section === 'choice' ? { isConfirmed: true } : await showConfirmAlert({ title: 'เปลี่ยนเหตุสิ้นสุด?', text: 'เหตุย่อยและวันที่เกิดเหตุจะต้องตรวจใหม่ ข้อเท็จจริงและหลักฐานเดิมยังเก็บไว้ กรุณาตรวจความสอดคล้องก่อนเสนอ คบ.15', icon: 'warning', showCancelButton: true, confirmButtonText: 'เปลี่ยนเหตุและตรวจใหม่', cancelButtonText: 'ยกเลิก' })
      if (!result.isConfirmed) return
      state.updateField(15, 'ประวัติการเปลี่ยนเหตุ', [...(draft['ประวัติการเปลี่ยนเหตุ'] || []), { at: new Date().toISOString(), clause: draft['ข้อระเบียบ'], reason: draft['เหตุยุติ'], occurredAt: draft['วันที่เกิดเหตุ'], proposedEndAt: draft['วันที่เสนอให้สิ้นสุด'] }])
      if (caseItem) useCaseStore.getState().logHistory(caseItem.no, 'เปลี่ยนเหตุสิ้นสุดในร่าง คบ.15', caseItem.owner, `${draft['ข้อระเบียบ'] || 'ยังไม่ยืนยัน'} → ${TERMINATION_CLAUSES.find(c => c.value === next)?.label}`)
    }
    set('ข้อระเบียบ', TERMINATION_CLAUSES.find(c => c.value === next)?.label || '')
    set('เหตุยุติ', next === 4 ? '' : reasonOptions(next)[0] || '')
    set('วันที่เกิดเหตุ', '')
    set('วันที่เสนอให้สิ้นสุด', '')
    onClauseSelected?.(next)
  }
  return <fieldset disabled={locked} className="min-w-0 space-y-3">
    {section !== 'details' && <fieldset className="min-w-0" data-testid="kb15-clause-choices">
      <legend className="mb-2 text-[1rem] font-bold text-navy">ยุติการคุ้มครองเพราะเหตุใด <span className="text-danger">*</span></legend>
      <div className="divide-y divide-line rounded-lg border border-line overflow-hidden">
        {TERMINATION_CLAUSES.map(c => <label key={c.value} className={`flex min-h-[56px] items-start gap-3 px-4 py-3 transition-colors focus-within:ring-2 focus-within:ring-inset focus-within:ring-blue ${locked ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-soft'} ${clause === c.value ? 'bg-blue-soft text-navy' : 'text-ink'}`}>
          <input type="radio" name={`termination-clause-${caseItem?.no || 'draft'}`} value={c.value} checked={clause === c.value} onClick={() => { if (!locked && clause === c.value) onClauseSelected?.(c.value) }} onChange={() => void selectClause(String(c.value))} className="mt-1 h-4 w-4 shrink-0 accent-blue" />
          <span className={`min-w-0 text-[0.9rem] leading-relaxed ${clause === c.value ? 'font-semibold' : ''}`}>{c.label}</span>
        </label>)}
      </div>
    </fieldset>}
    {section !== 'details' && clause === 4 && <label className="block"><span className="ws-label">เหตุย่อยตามข้อ 19</span>
      <select className="ws-input w-full" data-testid="kb15-reason-select" value={draft['เหตุยุติ'] || ''} onChange={e => set('เหตุยุติ', e.target.value)}>
        <option value="">— เลือกเหตุ —</option>
        {draft['เหตุยุติ'] && !options.includes(draft['เหตุยุติ']) && <option value={draft['เหตุยุติ']} disabled>ข้อมูลเดิม: {draft['เหตุยุติ']} — ต้องตรวจยืนยันใหม่</option>}
        {options.map(r => <option key={r}>{r}</option>)}
      </select>
    </label>}
    {section !== 'choice' && <>
    <label className="block"><span className="ws-label">อ้างอิงเหตุยุติ</span><input className="ws-input w-full" value={draft['อ้างอิงเหตุยุติ'] || ''} onChange={e => set('อ้างอิงเหตุยุติ', e.target.value)} placeholder="เลขคำร้อง / หนังสือ / คำสั่งเดิม" /></label>
    {clause && clause !== 4 && draft['เหตุยุติ'] !== options[0] && <div className="text-[0.85rem] space-y-2">
      <p>เหตุที่บันทึกเดิม: {draft['เหตุยุติ'] || 'ยังไม่ระบุ'} · กรุณาตรวจหลักฐานและยืนยันให้ตรงกับเหตุหลัก</p>
      <Button type="button" onClick={async () => {
        const result = await showConfirmAlert({ title: 'ยืนยันเหตุจากหลักฐานเดิม?', text: options[0], showCancelButton: true, confirmButtonText: 'ยืนยันเหตุ', cancelButtonText: 'ยกเลิก' })
        if (!result.isConfirmed) return
        state.updateField(15, 'ประวัติการเปลี่ยนเหตุ', [...(draft['ประวัติการเปลี่ยนเหตุ'] || []), { at: new Date().toISOString(), clause: draft['ข้อระเบียบ'], reason: draft['เหตุยุติ'] }])
        set('เหตุยุติ', options[0])
      }}>ยืนยันเหตุยุติตามข้อ 18 ({clause})</Button>
    </div>}
    {clause === 1 && caseItem && <div className="rounded-lg border border-line bg-soft p-3 space-y-2 text-[0.85rem]">
      <Link to="/form/$formId" params={{ formId: '7' }} search={{ caseNo: caseItem.no, from: 'termination' }} className="font-semibold text-blue hover:underline">เปิด คบ.7 เดิมในแฟ้ม</Link>
      <p>ผู้ยื่น: {[kb7['ชื่อผู้ยื่น'], kb7['นามสกุลผู้ยื่น']].filter(Boolean).join(' ') || 'ยังไม่ระบุ'}</p>
      <p>เหตุผลคำร้อง: {kb7['เหตุผลการยุติ'] || 'ยังไม่มีคำร้องในแฟ้ม'}</p>
      <label className="block"><span className="ws-label">วันที่รับคำร้อง คบ.7</span><input type="date" className="ws-input w-full" value={draft['วันที่รับคำร้อง คบ.7'] || caseItem.terminationTrigger?.receivedAt || ''} onChange={e => { set('วันที่รับคำร้อง คบ.7', e.target.value); set('วันที่เกิดเหตุ', e.target.value) }} /></label>
      <label className="block"><span className="ws-label">วันที่พยานขอให้ยุติ</span><input type="date" className="ws-input w-full" value={kb7['วันที่ขอให้ยุติ'] || draft['วันที่ขอให้ยุติ'] || ''} disabled={Boolean(kb7['วันที่ขอให้ยุติ'])} onChange={e => set('วันที่ขอให้ยุติ', e.target.value)} /></label>
      <label className="block"><span className="ws-label">หลักฐานคำร้องที่ลงนามแล้วในแฟ้ม</span><input className="ws-input w-full" value={draft['หลักฐานคำร้อง คบ.7'] || caseItem.terminationTrigger?.documentName || ''} onChange={e => set('หลักฐานคำร้อง คบ.7', e.target.value)} placeholder="ชื่อเอกสารที่แนบในแฟ้ม หรือใช้ คบ.7 ที่ลงนามในระบบ" /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(draft['ตรวจลายมือชื่อคำร้อง คบ.7'])} onChange={e => {
        state.updateField(15, 'ตรวจลายมือชื่อคำร้อง คบ.7', e.target.checked)
      }} />ตรวจหลักฐานคำร้องแนบและลายมือชื่อผู้ยื่นแล้ว</label>
    </div>}
    {clause === 2 && expiry && <div className="rounded-lg border border-line bg-soft p-3 space-y-1 text-[0.85rem]" data-testid="termination-expiry">
      <p>คำสั่งล่าสุด: {expiry.orderRef || 'ยังไม่มีข้อมูลคำสั่ง'}</p>
      <p>ครบกำหนดรอบปัจจุบัน: {formatThaiDate(expiry.currentEndAt) || '—'}</p>
      <p>เพดานรวม 6 เดือน: {formatThaiDate(expiry.capAt) || '—'} · สะสม {expiry.cumulativeDays} วัน</p>
      <p>คำสั่งขยายเวลาที่อนุมัติ: {expiry.extensionIds.join(', ') || 'ไม่มี'}</p>
      {expiry.pending && <p className="text-amber-700">มีคำขอขยายเวลารอพิจารณา ต้องตรวจผลก่อนสรุปว่าครบกำหนด</p>}
      <p>เตรียมเรื่องล่วงหน้าได้ การบันทึกร่างยังไม่ทำให้สิ้นสุด และไม่จำเป็นต้องรอให้ภัยหมดไป</p>
      <Button type="button" onClick={() => { set('วันที่เกิดเหตุ', expiry.currentEndAt); set('อ้างอิงเหตุยุติ', expiry.orderRef) }}>ใช้ข้อมูลคำสั่งล่าสุด</Button>
    </div>}
    {clause === 3 && caseItem && <div className="rounded-lg border border-line bg-soft p-3 space-y-1 text-[0.85rem]" data-testid="termination-referral">
      <p>หน่วยงานปลายทาง: {article14Agency(caseItem).office}</p>
      <p>หลักฐาน: {caseItem.article14?.replyDocumentName || 'ยังไม่มีหลักฐานจากหน่วยงานปลายทาง'}</p>
      <p>วันที่ได้รับความคุ้มครองต่อ: {formatThaiDate(caseItem.article14?.successorStartedAt) || 'ยังไม่ยืนยัน'}</p>
      <p>การส่งหนังสือหรือรับเรื่องไว้พิจารณา ยังไม่ถือว่าได้รับความคุ้มครองแล้ว</p>
      <Link to="/article14" search={{ caseNo: caseItem.no }} className="font-semibold text-blue hover:underline">เปิดงานส่งต่อเดิม</Link>
      <Button type="button" onClick={() => { set('วันที่เกิดเหตุ', caseItem.article14?.successorStartedAt || ''); set('อ้างอิงเหตุยุติ', caseItem.article14?.replyRegistryNo || '') }}>ใช้ข้อมูลการคุ้มครองต่อ</Button>
    </div>}
    <label className="block"><span className="ws-label">ข้อเท็จจริง <span className="text-danger">*</span></span><VoiceTextarea className="ws-input w-full" rows={3} value={draft['ข้อเท็จจริง'] || ''} onChange={e => set('ข้อเท็จจริง', e.target.value)} /></label>
    <label className="block"><span className="ws-label">หลักฐานประกอบและสรุปผลการคุ้มครอง <span className="text-danger">*</span></span><VoiceTextarea className="ws-input w-full" rows={3} value={draft['สรุปผล'] || ''} onChange={e => set('สรุปผล', e.target.value)} /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block"><span className="ws-label">วันที่เกิดเหตุ</span><input type="date" className="ws-input w-full" value={draft['วันที่เกิดเหตุ'] || ''} onChange={e => set('วันที่เกิดเหตุ', e.target.value)} /></label>
      <label className="block"><span className="ws-label">วันที่เสนอให้สิ้นสุด</span><input type="date" className="ws-input w-full" value={draft['วันที่เสนอให้สิ้นสุด'] || ''} onChange={e => set('วันที่เสนอให้สิ้นสุด', e.target.value)} /></label>
    </div>
    {caseItem?.terminationTrigger?.recordedAt && <p className="text-[0.8rem] text-muted">วันที่บันทึกเรื่อง: {caseItem.terminationTrigger.recordedAt}</p>}
    </>}
    {locked && <p className="text-[0.8rem] text-muted">ฉบับนี้เสนอตรวจหรือลงนามแล้ว การแก้สาระต้องสร้างฉบับใหม่และเก็บฉบับเดิม</p>}
  </fieldset>
}
