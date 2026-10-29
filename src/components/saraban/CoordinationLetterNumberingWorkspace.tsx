import React from 'react'
import type { CaseItem } from '../../types/case'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { Button } from '../common/Button'
import { Badge } from '../common/Badge'
import { VoiceTextarea } from '../common/VoiceTextarea'
import { CoordinationLetterPreview, letterRecipientFor } from '../protection/CoordinationLetterComposer'
import { CoordinationLetterSend } from '../protection/CoordinationLetterSend'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'
import { formatThaiDate } from '../../lib/utils'
import { formatSarabanDate } from '../../lib/saraban'
import {
  LETTER_NUMBERING_STATUS, canActAsLetterClerk, letterClerkUnitName, letterNumberingOf, suggestLetterNumber,
} from '../../lib/coordinationLetterNumbering'

/** ธุรการหน่วยเจ้าของเรื่องออกเลขหนังสือประสาน (วิธีที่ 4) แล้วนำส่ง หรือส่งคืนให้เจ้าหน้าที่แก้ไข (ใช้ในหน้า /saraban/$caseNo) */
export const CoordinationLetterNumberingWorkspace: React.FC<{ caseItem: CaseItem; onSubmitted?: () => void }> = ({ caseItem, onSubmitted }) => {
  const role = useAuthStore((s) => s.currentRole)
  const orgUnitId = useAuthStore((s) => s.currentOrgUnitId)
  const cases = useCaseStore((s) => s.cases)
  const issue = useCaseStore((s) => s.issueCoordinationLetterNumber)
  const returnLetter = useCaseStore((s) => s.returnCoordinationLetter)
  const n = letterNumberingOf(caseItem)
  const co = caseItem.methodTracks?.find((t) => t.method === 4)?.coordination
  const draft = co?.letterDraft
  const [input, setInput] = React.useState(() => suggestLetterNumber(cases))
  const [errors, setErrors] = React.useState<{ registryNo?: string; registryDate?: string }>({})
  const [returning, setReturning] = React.useState(false)
  const [returnNote, setReturnNote] = React.useState('')
  const [returnError, setReturnError] = React.useState('')

  if (!n || !draft) return null
  const canAct = canActAsLetterClerk(role, caseItem, orgUnitId)
  const unitName = letterClerkUnitName(n)
  const agencyNoun = (co?.agencyType || 'police') === 'police' ? 'สถานีตำรวจ' : 'หน่วยงาน'
  const shownDraft = n.status === 'pending' ? { ...draft, registryNo: input.registryNo, registryDate: input.registryDate } : draft

  const handleIssue = async () => {
    const next: typeof errors = {}
    if (!input.registryNo.trim()) next.registryNo = 'กรุณาระบุเลขหนังสือ'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.registryDate)) next.registryDate = 'กรุณาระบุวันที่หนังสือ'
    setErrors(next)
    if (Object.keys(next).length) return
    const res = await showConfirmAlert({
      title: 'ออกเลขหนังสือประสาน?',
      html: confirmBody('ตรวจสอบข้อมูลก่อนยืนยัน', [
        ['เลขคำร้อง', caseItem.no],
        ['เรื่อง', draft.subject],
        ['หน่วยงานปลายทาง', co?.agency || '-'],
        ['เลขที่หนังสือ', input.registryNo.trim()],
        ['ลงวันที่', formatSarabanDate(input.registryDate)],
      ], 'เมื่อยืนยัน เลขและวันที่จะแสดงบนหนังสือ และเจ้าหน้าที่หรือธุรการกดนำส่งหนังสือได้'),
      showCancelButton: true, confirmButtonText: 'ยืนยันออกเลข', cancelButtonText: 'ยกเลิก',
    })
    if (!res.isConfirmed) return
    if (issue(caseItem.no, input)) void showToast('ออกเลขหนังสือประสานแล้ว')
    else void showToast('สถานะงานหรือสิทธิ์เปลี่ยนไปแล้ว กรุณาตรวจสอบอีกครั้ง', 'warning')
  }

  const handleReturn = async () => {
    if (!returnNote.trim()) { setReturnError('กรุณาระบุสิ่งที่ต้องแก้ไข'); return }
    const res = await showConfirmAlert({
      icon: 'warning',
      title: 'ส่งคืนหนังสือให้เจ้าหน้าที่แก้ไข?',
      html: confirmBody('ตรวจสอบข้อมูลก่อนยืนยัน', [['เลขคำร้อง', caseItem.no], ['สิ่งที่ต้องแก้ไข', returnNote.trim()]], 'เจ้าหน้าที่จะแก้หนังสือได้อีกครั้ง แล้วส่งขอเลขใหม่'),
      showCancelButton: true, confirmButtonText: 'ยืนยันส่งคืน', cancelButtonText: 'ยกเลิก',
    })
    if (!res.isConfirmed) return
    if (returnLetter(caseItem.no, returnNote)) {
      void showToast('ส่งคืนหนังสือให้เจ้าหน้าที่แก้ไขแล้ว')
      onSubmitted?.()
    } else void showToast('สถานะงานหรือสิทธิ์เปลี่ยนไปแล้ว กรุณาตรวจสอบอีกครั้ง', 'warning')
  }

  return (
    <section data-testid="letter-numbering-workspace" data-status={n.status} className="ws-card space-y-4 border-l-4 border-l-gold p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[1.1rem] font-bold text-navy">ธุรการ{unitName} ออกเลขหนังสือประสาน (ขาออก) · วิธีที่ 4</h2>
          <p className="text-[0.85rem] text-muted">ส่งจาก {n.requestedBy} · {formatThaiDate(n.requestedAt)} · ถึง {co?.agency || '-'}</p>
        </div>
        <Badge variant={n.status === 'pending' ? 'warning' : 'success'} icon={n.status === 'pending' ? 'fa-clock' : 'fa-circle-check'}>
          {LETTER_NUMBERING_STATUS[n.status]}
        </Badge>
      </header>

      {!canAct && n.status !== 'sent' && (
        <div className="ws-callout text-[0.88rem]" data-testid="letter-numbering-readonly">
          ขั้นนี้ต้องให้ธุรการ{unitName}ดำเนินการ — บัญชีนี้ดูข้อมูลได้อย่างเดียว
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <dl className="grid gap-3 text-[0.88rem] sm:grid-cols-2">
            <div><dt className="ws-label">เรื่อง</dt><dd className="font-semibold text-navy">{draft.subject}</dd></div>
            <div><dt className="ws-label">ผู้ลงชื่อ</dt><dd>{draft.signerName || '-'} · {draft.signerPosition || '-'}</dd></div>
          </dl>

          {n.status === 'pending' && canAct && (
            <div className="space-y-3 border-t border-line pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="ws-field">
                  <label htmlFor="letterRegistryNo">เลขหนังสือประสาน <span className="text-danger">*</span></label>
                  <input id="letterRegistryNo" data-testid="letter-numbering-number" className="ws-input w-full" value={input.registryNo}
                    onChange={(e) => { setInput((p) => ({ ...p, registryNo: e.target.value })); setErrors((p) => ({ ...p, registryNo: undefined })) }} />
                  {errors.registryNo && <small role="alert" className="mt-0.5 block text-[0.8rem] font-semibold text-danger">{errors.registryNo}</small>}
                </div>
                <div className="ws-field">
                  <label htmlFor="letterRegistryDate">วันที่หนังสือประสาน <span className="text-danger">*</span></label>
                  <input id="letterRegistryDate" type="date" data-testid="letter-numbering-date" className="ws-input w-full" value={input.registryDate}
                    onChange={(e) => { setInput((p) => ({ ...p, registryDate: e.target.value })); setErrors((p) => ({ ...p, registryDate: undefined })) }} />
                  {errors.registryDate && <small role="alert" className="mt-0.5 block text-[0.8rem] font-semibold text-danger">{errors.registryDate}</small>}
                </div>
              </div>
              {returning ? (
                <div className="space-y-2">
                  <div className="ws-field">
                    <label htmlFor="letterReturnNote">สิ่งที่ต้องแก้ไข <span className="text-danger">*</span></label>
                    <VoiceTextarea id="letterReturnNote" data-testid="letter-numbering-return-note" className="ws-input w-full" rows={2} value={returnNote}
                      onChange={(e) => { setReturnNote(e.target.value); setReturnError('') }} />
                    {returnError && <small role="alert" className="mt-0.5 block text-[0.8rem] font-semibold text-danger">{returnError}</small>}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="secondary" size="md" onClick={() => { setReturning(false); setReturnNote(''); setReturnError('') }}>ยกเลิก</Button>
                    <Button type="button" variant="danger" size="md" data-testid="letter-numbering-return-confirm" onClick={handleReturn}>ส่งคืนเจ้าหน้าที่</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="secondary" size="md" data-testid="letter-numbering-return" onClick={() => setReturning(true)}>ส่งคืนแก้ไข</Button>
                  <Button type="button" variant="primary" size="md" data-testid="letter-numbering-issue" onClick={handleIssue}>ออกเลขหนังสือ</Button>
                </div>
              )}
            </div>
          )}

          {n.status !== 'pending' && (
            <div className="ws-callout text-[0.88rem]" data-testid="letter-numbering-issued">
              <i className="fa-solid fa-stamp mr-1.5" aria-hidden="true" />
              ออกเลขแล้ว: ที่ <strong>{draft.registryNo}</strong> ลงวันที่ {formatSarabanDate(draft.registryDate)}{n.numberedBy ? ` · โดย ${n.numberedBy}` : ''}
              {n.status === 'sent' && <> · นำส่งแล้ว{n.sentBy ? `โดย ${n.sentBy}` : ''}</>}
            </div>
          )}

          {n.status === 'numbered' && canAct && (
            <div className="border-t border-line pt-4">
              <CoordinationLetterSend caseItem={caseItem} agencyNoun={agencyNoun} onSent={onSubmitted} />
            </div>
          )}
        </div>
        <CoordinationLetterPreview draft={shownDraft} recipient={letterRecipientFor(co?.agency || '', co?.agencyType)} unit={unitName}
          caption={`ตัวอย่างหนังสือประสาน A4 · ${n.status === 'pending' ? 'ร่างพร้อมเลขที่จะออก' : 'ออกเลขแล้ว'}`} />
      </div>
    </section>
  )
}
