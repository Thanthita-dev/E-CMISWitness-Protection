import { CoordinationLetterPreview, letterRecipientFor } from '../protection/CoordinationLetterComposer'
import { POLICE_TITLES } from '../../lib/policeLetters'
import { canPostTerminationNotice } from '../../lib/postalReceipt'
import React from 'react'
import { Link } from '@tanstack/react-router'
import type { CaseItem } from '../../types/case'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { Button } from '../common/Button'
import { VoiceTextarea } from '../common/VoiceTextarea'
import { SarabanNumberDialog } from './SarabanNumberDialog'
import { DocumentWorkspace } from '../forms/DocumentWorkspace'
import { FormPaperViewer } from '../forms/FormPaperViewer'
import { activateCaseForms } from '../../lib/formPrefill'
import { sarabanRouteFor, sarabanSubmitLabelFor } from './sarabanDisplay'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'
import { FORMS_CATALOG } from '../../lib/constants'
import {
  SARABAN_CHECKPOINT_META, activeSarabanCheckpoint, canRecordSaraban, formatSarabanDate, sarabanRecordFor, sarabanRecordForms,
  sarabanCheckpointProgress, sarabanDefaultRecipient, sarabanFormsFor, sarabanUnitName, sarabanCheckpointLabel } from '../../lib/saraban'

interface SarabanWorkspaceProps {
  caseItem: CaseItem
  /** เรียกหลังส่งต่อสำเร็จ — หน้าลงทะเบียนใช้กลับไปรายการ */
  onSubmitted?: () => void
}

/**
 * พื้นที่ลงทะเบียนสารบรรณของแฟ้มหนึ่งเรื่อง (ใช้เฉพาะหน้า /saraban/$caseNo) — แบบเดียวกับหน้าออกเลขของงานหมายจับ
 * แสดงเอกสารทุกฉบับในชุดเป็นกระดาษ · แผงผู้รับ: ออกเลข/ลงรับรายผู้รับ (ตราประทับขึ้นบนกระดาษ) → หมายเหตุ → ยืนยันส่งต่อ
 */
export const SarabanWorkspace: React.FC<SarabanWorkspaceProps> = ({ caseItem, onSubmitted }) => {
  const currentRole = useAuthStore((s) => s.currentRole)
  const orgUnitId = useAuthStore((s) => s.currentOrgUnitId) ?? undefined
  const submit = useCaseStore((s) => s.submitSarabanCheckpoint)
  const addRecipient = useCaseStore((s) => s.addSarabanRecipient)
  const removeRecipient = useCaseStore((s) => s.removeSarabanRecipient)
  const [activeForm, setActiveForm] = React.useState<number | string | null>(null)
  const [dialog, setDialog] = React.useState<{ name: string; index: number } | null>(null)
  const [newRecipient, setNewRecipient] = React.useState('')
  const [recipientError, setRecipientError] = React.useState('')
  const [note, setNote] = React.useState('')
  const [postOpen, setPostOpen] = React.useState(false)
  const [post, setPost] = React.useState({ trackingNo: '', sentAt: '', recipient: caseItem.person, address: '' })
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const confirming = React.useRef(false)
  const cp = activeSarabanCheckpoint(caseItem)
  React.useLayoutEffect(() => { activateCaseForms(caseItem) }, [caseItem.no])
  const appealBundle = caseItem.sarabanDispatch?.flow === 'appeal'
  const intake = caseItem.appealFolder?.intake
  const appealFiles = appealBundle ? (caseItem.documents || []).filter((doc) => !doc.deleted).map((doc) => ({
    ...doc,
    previewUrl: doc.previewUrl || (doc.name === caseItem.appealDocumentName ? intake?.channel === 'letter' ? intake.evidenceDataUrl : intake?.signedRecordDataUrl : undefined),
  })) : []

  /** เอกสารที่แสดง: ชุดเอกสารของจุดลงทะเบียนนี้ — ไม่มีงานค้าง = เอกสารที่เคยลงทะเบียนในแฟ้ม */
  const baseDocuments = cp
    ? sarabanFormsFor(caseItem, cp)
    : [...new Set((caseItem.sarabanRecords || []).flatMap((r) => sarabanRecordForms(r)))].sort((a, b) => a - b)
  const documents = !caseItem.preliminaryDecision && !caseItem.activity7State && !caseItem.extensionDocs && !caseItem.appealFolder && baseDocuments.includes(6) ? [...new Set([...baseDocuments, 9, 10])] : baseDocuments
  const includeLetters = !caseItem.extensionDocs && !caseItem.appealFolder && caseItem.preliminaryDecision?.formNo !== 10 && caseItem.activity7State !== 'rejected'
  const extraDocuments = [
    ...(includeLetters && caseItem.policeLetters ? (['station', 'national'] as const).map(kind => ({ id: `police-${kind}`, title: POLICE_TITLES[kind], kind })) : []),
    ...(includeLetters && caseItem.coordinationApproval ? [{ id: 'agency', title: `หนังสือประสาน${caseItem.coordinationApproval.agency}`, kind: 'agency' as const }] : []),
    ...(caseItem.attachedFormCopies || []).map(copy => ({ id: `copy-${copy.id}`, title: FORMS_CATALOG.find(f => f.n === copy.formNo)?.t || `คบ.${copy.formNo}`, kind: 'copy' as const })),
  ]
  const selectedExtra = extraDocuments.find(doc => doc.id === activeForm)
  const formNo = selectedExtra ? undefined : documents.includes(Number(activeForm ?? -1)) ? Number(activeForm) : documents[0]

  const documentNav = (documents.length > 0 || extraDocuments.length > 0) && (
    <nav aria-label="เอกสารในชุด" data-testid="saraban-bundle" className="flex flex-wrap gap-1.5">
      {documents.map((n, i) => {
        const f = FORMS_CATALOG.find((x) => x.n === n)
        const active = n === formNo
        return (
          <button key={n} type="button" aria-current={active ? 'page' : undefined} data-testid={`saraban-bundle-form-${n}`} title={f?.t}
            onClick={() => setActiveForm(n)}
            className={`flex min-h-[40px] items-center gap-2 rounded-md border px-2.5 py-1.5 text-[0.85rem] transition ${active ? 'border-[#9cb6d8] bg-blue-soft font-semibold text-navy' : 'border-transparent text-muted hover:bg-white'}`}>
            <span className={`grid h-6 w-6 flex-none place-items-center rounded-full border text-[0.75rem] ${active ? 'border-navy bg-navy text-white' : 'border-line'}`}>{i + 1}</span>
            {f?.code || `คบ.${n}`}{appealBundle && (n === 3 || n === 6) ? ' · ฉบับอุทธรณ์' : ''}
          </button>
        )
      })}
      {extraDocuments.map((doc, index) => <button key={doc.id} type="button" aria-current={selectedExtra?.id === doc.id ? 'page' : undefined} data-testid={`saraban-bundle-${doc.id}`} onClick={() => setActiveForm(doc.id)} className={`flex min-h-[40px] items-center gap-2 rounded-md border px-2.5 py-1.5 text-[0.85rem] transition ${selectedExtra?.id === doc.id ? 'border-[#9cb6d8] bg-blue-soft font-semibold text-navy' : 'border-transparent text-muted hover:bg-white'}`}>
        <span className={`grid h-6 w-6 flex-none place-items-center rounded-full border text-[0.75rem] ${selectedExtra?.id === doc.id ? 'border-navy bg-navy text-white' : 'border-line'}`}>{documents.length + index + 1}</span>{doc.title}
      </button>)}
    </nav>
  )
  const openForm = formNo !== undefined && (
    <Link to="/form/$formId" params={{ formId: String(formNo) }} search={{ caseNo: caseItem.no, tab: 'saraban' }}
      className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#9aabba] bg-white px-3.5 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50">
      <i className="fa-solid fa-arrow-up-right-from-square text-[0.8rem]" aria-hidden="true" />เปิดแบบฟอร์ม
    </Link>
  )
  const extraPaper = (() => {
    if (!selectedExtra) return null
    if (selectedExtra.kind === 'copy') {
      const copy = caseItem.attachedFormCopies!.find(copy => `copy-${copy.id}` === selectedExtra.id)!
      return <FormPaperViewer formId={copy.formNo} caseNo={caseItem.no} versionSnapshot={{ fields: copy.fields, signatures: {} }} snapshotCase={caseItem} bare preview />
    }
    if (selectedExtra.kind === 'agency') {
      const letter = caseItem.coordinationApproval!
      return <CoordinationLetterPreview draft={letter.signature?.draft || letter.draft} html={letter.signature?.html} recipient={letterRecipientFor(letter.agency, letter.agencyType)} unit="" caption={selectedExtra.title} />
    }
    const letter = caseItem.policeLetters!.letters[selectedExtra.kind]
    return <CoordinationLetterPreview draft={letter.draft} html={letter.signedHtml} recipient={selectedExtra.kind === 'national' ? 'ผู้บัญชาการตำรวจแห่งชาติ' : `ผู้กำกับการ${caseItem.policeLetters!.data.station}`} unit="" caption={selectedExtra.title} />
  })()
  const paper = extraPaper || (formNo !== undefined
    ? <div className="space-y-4">
        <FormPaperViewer formId={formNo} caseNo={caseItem.no} bare noticeDraftPreview={formNo === 10 && appealBundle && caseItem.appealKb10 ? { fields: caseItem.appealKb10.fields, caseContext: caseItem } : undefined} />
        {appealFiles.length > 0 && <section className="ws-card space-y-3 p-4">
          <h3 className="font-semibold text-navy">เอกสารแนบในแฟ้มอุทธรณ์</h3>
          {appealFiles.map((doc) => <div key={doc.id} className="flex items-center justify-between gap-3 border-t border-line pt-2 text-sm">
            <span>{doc.name}</span>
            {doc.previewUrl ? <a href={doc.previewUrl} download={doc.name} className="font-semibold text-blue underline">เปิด / ดาวน์โหลด</a> : <span className="text-muted">ไม่มีไฟล์แนบ</span>}
          </div>)}
        </section>}
      </div>
    : <div className="ws-card p-8 text-center text-[0.88rem] text-muted">ยังไม่มีเอกสารที่ลงทะเบียนในแฟ้มนี้</div>)

  if (!cp) {
    return (
      <section data-testid="saraban-workspace">
        <DocumentWorkspace mode="document" nav={documentNav || undefined} tools={openForm || undefined}
          aside={<div className="ws-card space-y-3 p-4">
            <div className="ws-callout text-[0.88rem]" data-testid="saraban-no-task">
              <i className="fa-solid fa-circle-info mr-1.5" aria-hidden="true" />
              {caseItem.appealFolder?.stage === 'director' ? 'รอ ผอ. ส่งแฟ้มให้ธุรการออกเลขเสนอรองเลขาธิการฯ' : 'แฟ้มนี้ไม่มีรายการรอลงรับหรือออกเลขในขณะนี้'}
            </div>
            <dl className="space-y-3 text-[0.88rem]">
              <div><dt className="text-muted">สถานะปัจจุบัน</dt><dd className="font-semibold text-navy">{caseItem.status}</dd></div>
              {caseItem.owner && <div><dt className="text-muted">ผู้รับผิดชอบขั้นปัจจุบัน</dt><dd>{caseItem.owner}</dd></div>}
              {caseItem.next && <div><dt className="text-muted">งานถัดไป</dt><dd>{caseItem.next}</dd></div>}
            </dl>
            <p className="text-[0.85rem] text-muted">ปุ่มลงรับ ออกเลข และส่งต่อจะแสดงเมื่อมีงานส่งมาถึงขั้นธุรการ เอกสารในหน้านี้เปิดดูย้อนหลังได้</p>
            <Link to="/dossier/$caseNo" params={{ caseNo: caseItem.no }} className="inline-flex min-h-[44px] items-center rounded-lg border border-line px-3 py-2 font-semibold text-navy">ดูสถานะและรายละเอียดแฟ้ม</Link>
          </div>}>
          {paper}
        </DocumentWorkspace>
      </section>
    )
  }

  const meta = { ...SARABAN_CHECKPOINT_META[cp], label: sarabanCheckpointLabel(caseItem, cp) }
  const forms = sarabanFormsFor(caseItem, cp)
  const progress = sarabanCheckpointProgress(caseItem, cp)
  const canAct = canRecordSaraban(currentRole, caseItem, cp, orgUnitId)
  const route = sarabanRouteFor(caseItem, cp)
  const label = sarabanSubmitLabelFor(caseItem, cp)
  const remaining = progress.recipients.length - progress.done.length
  const defaultRecipient = sarabanDefaultRecipient(caseItem, cp)
  /** ขาเข้ารับจากผู้ส่งรายเดียว — เพิ่มผู้รับได้เฉพาะขาออก */
  const canAddRecipient = canAct && meta.direction === 'outgoing'
  // งานส่งต่อรอบใหม่ต้องไม่รับสถานะไปรษณีย์จากรอบคุ้มครองเดิม
  const postal = caseItem.sarabanDispatch ? caseItem.sarabanDispatch.postal : caseItem.protectionHandoff?.postal
  const canPost = canPostTerminationNotice(caseItem) || cp === 'destination_incoming' && ((!caseItem.sarabanDispatch && Boolean(caseItem.protectionHandoff)) || (caseItem.sarabanDispatch?.flow === 'appeal' && caseItem.sarabanDispatch.direction === 'down' && Boolean(caseItem.appealResolution)))
  const action = meta.direction === 'incoming' ? 'ลงรับ' : 'ออกเลข'

  const handleAddRecipient = () => {
    if (!newRecipient.trim()) { setRecipientError('กรุณาระบุชื่อผู้รับ'); return }
    if (!addRecipient(caseItem.no, cp, newRecipient)) { setRecipientError('มีผู้รับรายนี้อยู่แล้วหรือเพิ่มไม่ได้'); return }
    setNewRecipient(''); setRecipientError('')
  }

  const handleSubmit = async () => {
    if (confirming.current) return
    if (!progress.complete) {
      setError(`ยังลงทะเบียนไม่ครบ — เหลืออีก ${remaining} ผู้รับ`)
      return
    }
    confirming.current = true
    setBusy(true)
    setError('')
    try {
      const result = await showConfirmAlert({
        title: `${label}?`,
        html: confirmBody('ตรวจสอบข้อมูลก่อนยืนยัน', [
          ['เลขคำร้อง', caseItem.no],
          ['จุดลงทะเบียน', meta.label],
          ['ชุดเอกสาร', [...forms.map((n) => `คบ.${n}`), ...(caseItem.coordinationApproval?.signature && !caseItem.extensionDocs && !caseItem.appealFolder ? [`หนังสือประสาน${caseItem.coordinationApproval.agency}`] : []), ...(caseItem.policeLetters && !caseItem.extensionDocs && !caseItem.appealFolder ? ['หนังสือถึงผู้กำกับการสถานีตำรวจ', 'หนังสือถึงผู้บัญชาการตำรวจแห่งชาติ'] : [])].join(', ')],
          ['ผู้รับที่ลงเลขแล้ว', progress.recipients.map((r) => r).join(', ')],
          ['ผู้รับถัดไป', route[2]],
          ['หมายเหตุ', note.trim() || 'ไม่ระบุ'],
        ], 'เมื่อยืนยัน เลขทะเบียนของจุดนี้จะถูกล็อกและแฟ้มถูกส่งต่อทันที'),
        showCancelButton: true, confirmButtonText: label, cancelButtonText: 'ยกเลิก',
      })
      if (!result.isConfirmed) return
      if (submit(caseItem.no, note.trim() || undefined)) {
        setNote('')
        void showToast(`${label} เรียบร้อยแล้ว`)
        onSubmitted?.()
      } else setError('สถานะงานหรือสิทธิ์เปลี่ยนไปแล้ว กรุณากลับไปที่รายการเพื่อตรวจสอบอีกครั้ง')
    } finally {
      confirming.current = false
      setBusy(false)
    }
  }

  const aside = (
    <>
      <section className="ws-card space-y-3 p-4" aria-label="ผู้รับ">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-[1.05rem] font-bold text-navy-deep">{meta.direction === 'incoming' ? 'รับจาก' : 'ผู้รับ'} ({progress.recipients.length})</h2>
          <span data-testid="saraban-progress" className="text-[0.8rem] text-muted">ลงทะเบียนแล้ว {progress.done.length}/{progress.recipients.length} ผู้รับ</span>
        </header>
        {!canAct && (
          <p className="ws-callout text-[0.85rem]" data-testid="saraban-readonly-note">
            {currentRole === 'admin' ? 'ขั้นนี้' : 'ขั้นนี้ต้องให้'}ธุรการ{sarabanUnitName(caseItem, cp)}ลงเลขทะเบียน — บัญชีนี้ดูข้อมูลได้อย่างเดียว
          </p>
        )}
        <ol className="m-0 list-none space-y-3 p-0">
          {progress.recipients.map((name, i) => {
            const record = sarabanRecordFor(caseItem, cp, name)
            return (
              <li key={name} data-testid={`saraban-recipient-${i}`} className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="break-words text-[0.92rem] font-bold text-navy-deep">{i + 1}. {name}</div>
                  <div data-testid={record ? `saraban-entry-${cp}-${i}` : `saraban-pending-${cp}-${i}`} className={`text-[0.8rem] ${record ? 'text-success' : 'text-muted'}`}>
                    {record
                      ? `${meta.numberLabel} ${record.number}${record.documentNumber ? ` · หนังสือ ${record.documentNumber}` : ''} · ${formatSarabanDate(record.date)} ${record.time} น.`
                      : canAct ? `ยังไม่${action}` : 'รอธุรการลงทะเบียน'}
                  </div>
                </div>
                {canAct && !postal && (
                  <div className="flex flex-none gap-1.5">
                    {name !== defaultRecipient && !record && (
                      <Button type="button" variant="secondary" size="icon" aria-label={`ลบผู้รับ ${name}`} title="ลบผู้รับ" data-testid={`saraban-recipient-remove-${i}`} onClick={() => removeRecipient(caseItem.no, cp, name)}>
                        <i className="fa-solid fa-trash" aria-hidden="true" />
                      </Button>
                    )}
                    <Button type="button" variant={record ? 'secondary' : 'primary'} size="md" data-testid={`saraban-recipient-number-${i}`} onClick={() => setDialog({ name, index: i })}>
                      {record ? 'แก้ไข' : action}
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        {canAddRecipient && (
          <div className="space-y-1 border-t border-line pt-3">
            <div className="flex gap-2">
              <label htmlFor="sarabanNewRecipient" className="sr-only">ชื่อผู้รับเพิ่มเติม</label>
              <input id="sarabanNewRecipient" data-testid="saraban-new-recipient-input" type="text" value={newRecipient} placeholder="เพิ่มผู้รับ..."
                className="min-h-[44px] min-w-0 flex-1 rounded-[7px] border border-[#aebdca] bg-white px-3 py-[0.66rem] text-[0.88rem] text-ink"
                onChange={(e) => { setNewRecipient(e.target.value); setRecipientError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRecipient() } }} />
              <Button type="button" variant="secondary" size="md" data-testid="saraban-add-recipient-confirm" onClick={handleAddRecipient}>เพิ่ม</Button>
            </div>
            {recipientError && <small role="alert" className="block text-[0.8rem] font-semibold text-danger">{recipientError}</small>}
          </div>
        )}
      </section>

      {canAct && (
        <section className="ws-card space-y-3 p-4" aria-label="ส่งต่อ">
          <div className="ws-field">
            <label htmlFor="sarabanNote">หมายเหตุ</label>
            <VoiceTextarea id="sarabanNote" data-testid="saraban-note" className="ws-input w-full" rows={2} value={note} onChange={(e) => { setNote(e.target.value); setError('') }} />
          </div>
          {error && <p role="alert" className="text-[0.88rem] text-danger">{error}</p>}
          {(!postal || (postal.deliveredAt && !caseItem.sarabanDispatch)) && <Button type="button" variant="primary" size="md" className="w-full" disabled={busy || !progress.complete} data-testid="saraban-submit-button" onClick={handleSubmit}>
            {canPost && caseItem.sarabanDispatch ? 'ส่งต่อเจ้าของสำนวน' : label}
          </Button>}
          {canPost && !postal && <Button type="button" variant="secondary" size="md" className="w-full" disabled={busy || !progress.complete} onClick={() => setPostOpen(!postOpen)}><i className="fa-solid fa-envelope" />ส่งไปรษณีย์ให้พยาน</Button>}
          {canPost && !progress.complete && <p className="text-sm text-muted">ลงเลขรับให้ครบก่อนเลือกส่งต่อหรือส่งไปรษณีย์</p>}
          {canPost && postOpen && !postal && <div className="space-y-3 border-t border-line pt-3">
            {([['trackingNo', 'เลขพัสดุ / ไปรษณีย์ลงทะเบียน'], ['sentAt', 'วันที่ส่ง'], ['recipient', 'ชื่อผู้รับ'], ['address', 'ที่อยู่จัดส่ง']] as const).map(([key, text]) => <label key={key} className="block"><span className="ws-label">{text}</span><input className="ws-input" type={key === 'sentAt' ? 'date' : 'text'} value={post[key]} onChange={(e) => setPost((old) => ({ ...old, [key]: e.target.value }))} /></label>)}
            <Button type="button" size="md" className="w-full" disabled={busy || !progress.complete || Object.values(post).some((value) => !value.trim())} onClick={async () => {
              const result = await showConfirmAlert({ title: 'ยืนยันส่งไปรษณีย์ให้พยาน?', html: confirmBody('ข้อมูลการจัดส่ง', [['ผู้รับ', post.recipient], ['ที่อยู่', post.address], ['เลขพัสดุ', post.trackingNo], ['วันที่ส่ง', post.sentAt]], 'บันทึกการส่งและรอผลนำส่ง'), showCancelButton: true, confirmButtonText: 'ยืนยันส่งไปรษณีย์', cancelButtonText: 'ยกเลิก' })
              if (!result.isConfirmed) return
              if (useCaseStore.getState().sendAppealByPost(caseItem.no, post)) { setPostOpen(false); showToast('บันทึกส่งไปรษณีย์แล้ว รอผลนำส่ง') } else setError('บันทึกไม่ได้ กรุณาตรวจเลขรับและสถานะงาน')
            }}>ยืนยันส่งไปรษณีย์</Button>
          </div>}
          {postal && <div className="space-y-3">
            <p className="font-semibold text-success">{postal.deliveredAt ? `พยานได้รับหนังสือแล้ว · ${postal.deliveredAt}` : 'ส่งไปรษณีย์แล้ว · รอผลนำส่ง'}</p><p className="text-sm">{postal.trackingNo} · {postal.recipient} · {postal.sentAt}</p>
            <Button type="button" size="md" className="w-full" disabled={Boolean(postal.deliveredAt)} onClick={async () => {
              const result = await showConfirmAlert({ title: 'ยืนยันว่าพยานได้รับหนังสือแล้ว?', text: 'ระบบจะบันทึกวันที่วันนี้เป็นวันที่พยานได้รับหนังสือ', showCancelButton: true, confirmButtonText: 'พยานได้รับหนังสือแล้ว', cancelButtonText: 'ยกเลิก' })
              if (!result.isConfirmed) return
              const now = new Date()
              const receivedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
              if (useCaseStore.getState().completeAppealPost(caseItem.no, receivedDate, 'ธุรการยืนยันว่าพยานได้รับหนังสือแล้ว')) { showToast('บันทึกว่าพยานได้รับหนังสือแล้ว') } else setError('บันทึกไม่ได้ กรุณาตรวจข้อมูลและสถานะงาน')
            }}>พยานได้รับหนังสือแล้ว</Button>
          </div>}
        </section>
      )}

    </>
  )

  return (
    <section data-testid="saraban-workspace" data-checkpoint={cp}>
      <DocumentWorkspace mode="document" nav={documentNav || undefined} tools={openForm || undefined} aside={aside}>
        {paper}
      </DocumentWorkspace>
      {dialog && <SarabanNumberDialog caseItem={caseItem} checkpoint={cp} recipient={dialog.name} index={dialog.index} onClose={() => setDialog(null)} />}
    </section>
  )
}
