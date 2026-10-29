import { PoliceLetterBundlePanel } from './PoliceLetterBundlePanel'
import { canPreparePolice, sendPoliceLetter } from '../../lib/policeLetterActions'
import React, { useState } from 'react'
import type { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { POLICE_TITLES, policeRevisionKey } from '../../lib/policeLetters'
import { signPoliceLetters } from '../../lib/policeLetterActions'
import { reviewApprovalLetter, signApprovalLetter } from '../../lib/approvalCoordinationActions'
import { finishIndividualApproval } from '../../lib/individualApprovalSigning'
import { CoordinationLetterPreview, letterRecipientFor } from './CoordinationLetterComposer'
import { DocumentWorkspace, DocumentPageHead, DocumentActionBar } from '../forms/DocumentWorkspace'
import { SignatureModal } from '../common/SignatureModal'
import { Button } from '../common/Button'

export function CoordinationSigningWorkspace({ caseItem, document, onBack }: { caseItem: CaseItem; document: 'station' | 'national' | 'agency'; onBack: () => void }) {
  const c = useCaseStore(s => s.cases.find(c => c.no === caseItem.no)) || caseItem
  const auth = useAuthStore(), [open, setOpen] = useState(false), [error, setError] = useState(''), [editing, setEditing] = useState(false), [channel, setChannel] = useState<'post' | 'direct' | 'official_other'>('post'), [tracking, setTracking] = useState('')
  const letter = document === 'agency' ? undefined : c.policeLetters?.letters[document]
  const generic = document === 'agency' ? c.coordinationApproval : undefined
  const draft = letter?.draft || generic?.signature?.draft || generic?.draft
  if (!draft) return <div className="ws-card p-5"><p>ยังไม่มีหนังสือฉบับนี้ในแฟ้ม</p><Button size="md" variant="secondary" onClick={onBack}>กลับแฟ้มคำร้อง</Button></div>
  const signed = !!(letter?.signedAt || generic?.signature)
  const canSign = !signed && ['secretary', 'admin'].includes(auth.currentRole) && c.stage === 'external_pending'
  const title = document === 'agency' ? `หนังสือประสาน${generic!.agency}` : POLICE_TITLES[document]
  const recipient = document === 'agency' ? letterRecipientFor(generic!.agency, generic!.agencyType) : document === 'national' ? 'ผู้บัญชาการตำรวจแห่งชาติ' : `ผู้กำกับการ${c.policeLetters!.data.station}`
  const sign = (_: string, image?: string) => {
    if (!canSign) return
    if (document === 'agency') {
      reviewApprovalLetter(c.no)
      if (!signApprovalLetter(c.no, image)) { setError('กรุณาบันทึกร่างผลพิจารณา คบ.9 ให้ครบก่อนลงนาม'); setOpen(false); return }
    } else {
      const result = signPoliceLetters(c.no, policeRevisionKey(c.policeLetters!), image, undefined, [document])
      if (!result.ok) { setError(result.errors.join(' · ')); setOpen(false); return }
    }
    finishIndividualApproval(c.no)
    setError(''); setOpen(false)
  }
  const deliveryVisible = !!letter?.signedAt && canPreparePolice(c) && !!c.protectionHandoff
  const delivery = deliveryVisible ? <section className="ws-card space-y-4 p-5" data-testid="police-delivery-card">
    <h2 className="text-[1.05rem] font-bold text-navy">นำส่งหนังสือ</h2><p className="text-muted">{title}</p>
    {letter?.sentAt ? <div className="ws-callout"><strong>บันทึกการนำส่งแล้ว</strong><p>{new Date(letter.sentAt).toLocaleString('th-TH')}</p><p>{letter.channel === 'post' ? 'ไปรษณีย์' : letter.channel === 'direct' ? 'นำส่งโดยตรง' : 'ช่องทางราชการอื่น'}</p>{letter.trackingNo && <p>เลขติดตาม: {letter.trackingNo}</p>}</div> : <>
      <label className="block"><span className="ws-label">ช่องทางนำส่ง</span><select aria-label="ช่องทางนำส่ง" className="ws-input w-full" value={channel} onChange={e => setChannel(e.target.value as typeof channel)}><option value="post">ไปรษณีย์ตอบรับด่วน (EMS)</option><option value="direct">นำส่งโดยตรง</option><option value="official_other">ช่องทางราชการอื่น</option></select></label>
      <label className="block"><span className="ws-label">เลขติดตามพัสดุ / หลักฐานนำส่ง</span><input aria-label="เลขติดตามพัสดุ" className="ws-input w-full" value={tracking} onChange={e => setTracking(e.target.value)} /></label>
      {document === 'national' && !c.policeLetters?.letters.station.sentAt && <p className="ws-callout">นำส่งฉบับสถานีตำรวจก่อน เพื่อแนบสำเนากับฉบับนี้</p>}
      <Button size="md" variant="primary" className="w-full" disabled={document === 'national' && !c.policeLetters?.letters.station.sentAt} onClick={() => {
        if (document === 'agency') return
        if (channel === 'post' && !tracking.trim()) { setError('กรุณาระบุเลขติดตามพัสดุ'); return }
        const ok = sendPoliceLetter(c.no, document, channel, tracking)
        setError(ok ? '' : 'ยังนำส่งไม่ได้ กรุณาตรวจว่าลงนามครบและผู้รับผิดชอบรับงานแล้ว หากเป็นฉบับแก้ไขต้องส่งคืนผู้รับผิดชอบก่อนนำส่ง')
      }}><i className="fa-solid fa-truck-fast" aria-hidden="true" />บันทึกการนำส่ง</Button>
    </>}
  </section> : undefined
  return <section className="space-y-4" data-testid="individual-coordination-signing">
    <DocumentPageHead title={title} meta={`แฟ้ม ${c.no}`} status={<span className={`ws-status ${signed ? 'success' : ''}`}>{signed ? 'ลงนามแล้ว' : c.preliminaryDecision?.formNo === 9 ? 'รอลงนาม' : 'ร่างรอผลพิจารณา'}</span>} actions={<Button size="md" variant="secondary" onClick={onBack}>กลับแฟ้มคำร้อง</Button>} />
    {!signed && document !== 'agency' && canPreparePolice(c) && <div className="flex gap-2"><Button size="sm" variant={!editing ? 'primary' : 'secondary'} onClick={() => setEditing(false)}>เอกสาร</Button><Button size="sm" variant={editing ? 'primary' : 'secondary'} onClick={() => setEditing(true)}>กรอกผ่านแบบฟอร์ม</Button></div>}
    <DocumentWorkspace mode="document" aside={delivery}>
    {editing && document !== 'agency' && canPreparePolice(c) ? <PoliceLetterBundlePanel caseItem={c} initialKind={document} /> : <CoordinationLetterPreview draft={draft} recipient={recipient} unit="" caption={title} html={letter?.signedHtml || generic?.signature?.html} onSign={canSign ? () => setOpen(true) : undefined} />}
    </DocumentWorkspace>
    {signed && !deliveryVisible && <p className="ws-readonly">ลงนามฉบับนี้แล้ว · กลับแฟ้มเพื่อตรวจเอกสารที่เหลือในรอบอนุมัติเดียวกัน</p>}
    {error && <p role="alert" className="ws-callout text-danger">{error}</p>}
    <SignatureModal isOpen={open} title={`ลงนาม${title}`} confirmLabel="ยืนยันลงนามฉบับนี้" signerRole="เลขาธิการคณะกรรมการ ป.ป.ท." defaultSignerName={auth.getCurrentUserAccount()?.name || ''} onClose={() => setOpen(false)} onConfirm={sign} />
    <DocumentActionBar back={<Button size="md" variant="secondary" onClick={onBack}>กลับแฟ้มคำร้อง</Button>}>{(canSign || signed) && <Button size="lg" variant="primary" disabled={!canSign} onClick={() => setOpen(true)}><i className="fa-solid fa-pen-nib" />{signed ? 'ลงนามแล้ว' : 'ลงนามหนังสือฉบับนี้'}</Button>}</DocumentActionBar>
  </section>
}
