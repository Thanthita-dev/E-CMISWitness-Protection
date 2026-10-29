import React, { useEffect, useState } from 'react'
import type { CaseItem } from '../../types/case'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { selectCaseDraft, useFormDraftStore } from '../../store/useFormDraftStore'
import { Button } from '../common/Button'
import { SignatureModal } from '../common/SignatureModal'
import { CoordinationLetterComposer, CoordinationLetterPreview, printCoordinationLetter } from './CoordinationLetterComposer'
import { dispatchPoliceRevision, advancePoliceRevision, isPoliceQueueCase, canPreparePolice, issuePoliceNumbers, preparePoliceLetters, requestPoliceNumbers, revisePoliceLetters, savePoliceData, savePoliceDraft, sendPoliceLetter, signPoliceLetters } from '../../lib/policeLetterActions'
import { policeAllSigned, policeMissing, policeRequired, policeRevisionKey, POLICE_DATA_LABELS, POLICE_KINDS, POLICE_TITLES, type PoliceLetterData, type PoliceLetterKind } from '../../lib/policeLetters'

const STATUS = { draft: 'ร่าง', review: 'รอตรวจพร้อมชุด คบ.6', awaiting_number: 'รอธุรการ สลธ. เตรียมเลขก่อนลงนาม', awaiting_signature: 'รอลงนาม', signed: 'ลงนามแล้ว', sent: 'นำส่งแล้ว' }
export const PoliceLetterBundlePanel: React.FC<{ caseItem: CaseItem; signing?: boolean; onReviewed?: (key: string) => void; initialKind?: PoliceLetterKind }> = ({ caseItem, signing, onReviewed, initialKind = 'station' }) => {
  const live = useCaseStore(s => s.cases.find(c => c.no === caseItem.no)) || caseItem
  const kb6 = useFormDraftStore(s => selectCaseDraft(s, 6, live.no))
  const auth = useAuthStore()
  const b = live.policeLetters
  const [kind, setKind] = useState<PoliceLetterKind>(initialKind)
  const [input, setInput] = useState<PoliceLetterData | undefined>(b?.data)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reviewed, setReviewed] = useState<Record<string, string>>({})
  const [revisionReason, setRevisionReason] = useState('')
  const [channel, setChannel] = useState<'direct' | 'post' | 'official_other'>('direct')
  const [tracking, setTracking] = useState('')
  const [revisionSign, setRevisionSign] = useState(false)
  const [numbers, setNumbers] = useState({ station: { registryNo: b?.letters.station.draft.registryNo || '', registryDate: b?.letters.station.draft.registryDate || '' }, national: { registryNo: b?.letters.national.draft.registryNo || '', registryDate: b?.letters.national.draft.registryDate || '' } })
  useEffect(() => { if (!b && (policeRequired(live, kb6) || (live.activity7State === 'approved' && live.methodTracks?.some(t => t.method === 4 && (!t.coordination?.agencyType || t.coordination.agencyType === 'police')))) && canPreparePolice(live)) preparePoliceLetters(live.no) }, [live.no, b, kb6])
  useEffect(() => { setInput(b?.data) }, [b?.data])
  const key = b ? policeRevisionKey(b) : ''
  useEffect(() => { onReviewed?.(POLICE_KINDS.every(k => reviewed[k] === key) ? key : '') }, [reviewed, key, onReviewed])
  if (!b) return policeRequired(live, kb6) ? <p role="alert" className="ws-callout">ยังไม่มีหนังสือตำรวจในชุดเสนอ เจ้าหน้าที่ต้องเตรียมทั้งสองฉบับก่อนส่ง คบ.6</p> : null
  const clerk = ['secretary_receiver', 'admin'].includes(auth.currentRole)
  const secretary = ['secretary', 'admin'].includes(auth.currentRole)
  const officer = canPreparePolice(live)
  const signed = POLICE_KINDS.some(k => b.letters[k].signedAt)
  const editable = officer && !signed && !POLICE_KINDS.some(k => b.letters[k].status === 'awaiting_number') && !signing
  const revisionSigning = secretary && b.revisionStage === 'secretary'
  const selected = b.letters[kind]
  const recipient = kind === 'national' ? 'ผู้บัญชาการตำรวจแห่งชาติ' : `ผู้กำกับการ${b.data.station || 'สถานีตำรวจ...........................'}`
  const pendingNumber = POLICE_KINDS.some(k => b.letters[k].status === 'awaiting_number')
  const action = (fn: () => boolean, success: string) => {
    setError(''); setMessage('')
    try { if (fn()) setMessage(success); else setError('ดำเนินการไม่สำเร็จ กรุณาตรวจข้อมูล สิทธิ และสถานะเอกสาร') } catch { setError('บันทึกไม่สำเร็จ ข้อมูลเดิมยังอยู่ กรุณาลองใหม่') }
  }
  return <section data-testid="police-letter-bundle" className="space-y-4 border-t border-line pt-5" aria-label="หนังสือตำรวจในชุดเสนอ">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-[1.1rem] font-bold text-navy">หนังสือประสานตำรวจในชุดเสนอเดียวกัน</h2><p className="text-sm text-muted">แฟ้ม {live.no} · ตรวจพร้อม คบ.6 และลงนามพร้อม คบ.9</p></div><span className="ws-status">{policeAllSigned(b) ? 'ลงนามครบสองฉบับ' : 'รอดำเนินการ'}</span></div>
    {editable && input && <details open><summary className="font-semibold cursor-pointer">ข้อมูลจากแฟ้มสำหรับหนังสือทั้งสองฉบับ</summary>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 py-3">{Object.entries(POLICE_DATA_LABELS).map(([field, label]) => <label key={field} className="ws-field"><span className="ws-label">{label}</span><input data-testid={`police-data-${field}`} className="ws-input w-full" type={field === 'start' || field === 'end' ? 'date' : 'text'} value={input[field as keyof PoliceLetterData]} onChange={e => setInput({ ...input, [field]: e.target.value })} /></label>)}</div>
      <p className="text-sm text-muted mb-2">บันทึกข้อมูลร่วมจะปรับเนื้อหาทั้งสองฉบับตามต้นฉบับ และล้างเลขที่เตรียมไว้เพื่อให้ธุรการตรวจใหม่</p>
      <Button type="button" variant="secondary" onClick={() => action(() => savePoliceData(live.no, input), 'บันทึกข้อมูลในหนังสือทั้งสองฉบับแล้ว')}>บันทึกข้อมูลร่วมในหนังสือ</Button>
    </details>}
    <div className="flex flex-wrap gap-2" aria-label="เลือกหนังสือตำรวจ">{POLICE_KINDS.map(k => <Button key={k} type="button" variant={kind === k ? 'primary' : 'secondary'} aria-pressed={kind === k} onClick={() => setKind(k)}>{POLICE_TITLES[k]} · ฉบับ {b.letters[k].version} · {STATUS[b.letters[k].status]}</Button>)}</div>
    {editable ? <CoordinationLetterComposer caseItem={live} stationName={b.data.station} draft={selected.draft} onChange={draft => action(() => savePoliceDraft(live.no, kind, draft), '')} /> : <CoordinationLetterPreview html={selected.signedHtml} draft={(signing || revisionSigning) && !selected.signedAt ? { ...selected.draft, signerName: auth.getCurrentUserAccount()?.name || selected.draft.signerName } : selected.draft} recipient={recipient} unit="" caption={`${POLICE_TITLES[kind]} · ${STATUS[selected.status]}`} />}
    {(signing || revisionSigning) && <Button type="button" variant="secondary" data-testid={`police-reviewed-${kind}`} onClick={() => setReviewed(r => ({ ...r, [kind]: key }))}>{reviewed[kind] === key ? 'ตรวจฉบับนี้แล้ว' : 'ยืนยันว่าเปิดตรวจหนังสือฉบับนี้แล้ว'}</Button>}
    {selected.signedHtml && <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => printCoordinationLetter(selected.signedHtml!)}>พิมพ์ / บันทึก PDF ฉบับลงนาม</Button>{kind === 'national' && b.letters.station.signedHtml && <Button type="button" variant="secondary" onClick={() => printCoordinationLetter(b.letters.station.signedHtml!)}>เปิดสำเนาหนังสือสถานีตำรวจที่แนบ</Button>}</div>}
    {secretary && !policeAllSigned(b) && <div className="space-y-2"><p className="text-sm text-muted">ธุรการ สลธ. เตรียมเลขและวันที่ก่อนยืนยันลงนาม เพื่อให้เอกสารลงนามและสำเนาที่อ้างถึงตรงกัน หลังลงนามส่งผ่านสารบรรณตามสายเดิม</p><Button type="button" variant="secondary" disabled={pendingNumber} onClick={() => action(() => requestPoliceNumbers(live.no), 'ส่งธุรการ สลธ. เตรียมเลขแล้ว ยังอยู่ในรอบอนุมัติเดิม')}>ขอธุรการ สลธ. เตรียมเลขก่อนลงนาม</Button></div>}
    {clerk && pendingNumber && <fieldset className="space-y-3"><legend className="font-semibold">เตรียมเลขและวันที่หนังสือก่อนลงนาม</legend>{POLICE_KINDS.map(k => <div key={k} className="grid sm:grid-cols-2 gap-3"><label><span className="ws-label">เลขหนังสือ {POLICE_TITLES[k]}</span><input data-testid={`police-number-${k}`} className="ws-input w-full" value={numbers[k].registryNo} onChange={e => setNumbers(n => ({ ...n, [k]: { ...n[k], registryNo: e.target.value } }))} /></label><label><span className="ws-label">วันที่ {POLICE_TITLES[k]}</span><input data-testid={`police-number-date-${k}`} type="date" className="ws-input w-full" value={numbers[k].registryDate} onChange={e => setNumbers(n => ({ ...n, [k]: { ...n[k], registryDate: e.target.value } }))} /></label></div>)}<Button type="button" onClick={() => action(() => issuePoliceNumbers(live.no, numbers), 'เตรียมเลขและวันที่ครบแล้ว ส่งคืนเลขาธิการตรวจลงนามในรอบเดิม')}>บันทึกเลขและวันที่ทั้งสองฉบับ</Button></fieldset>}
    {officer && policeAllSigned(b) && (!b.revisionStage || b.revisionStage === 'complete') && !selected.sentAt && <div className="space-y-3"><p className="text-sm">นำส่งฉบับสถานีตำรวจก่อน แล้วนำส่งฉบับสำนักงานตำรวจแห่งชาติพร้อมสำเนาฉบับลงนาม</p><div className="grid sm:grid-cols-2 gap-3"><label><span className="ws-label">ช่องทางนำส่ง</span><select className="ws-input w-full" value={channel} onChange={e => setChannel(e.target.value as typeof channel)}><option value="direct">นำส่งโดยตรง</option><option value="post">ไปรษณีย์</option><option value="official_other">ช่องทางราชการอื่น</option></select></label><label><span className="ws-label">เลขติดตาม / หลักฐานนำส่ง</span><input className="ws-input w-full" value={tracking} onChange={e => setTracking(e.target.value)} /></label></div><Button type="button" disabled={kind === 'national' && !b.letters.station.sentAt} onClick={() => action(() => sendPoliceLetter(live.no, kind, channel, tracking), 'บันทึกนำส่งแล้ว')}>ยืนยันนำส่ง{POLICE_TITLES[kind]}</Button></div>}
    {officer && signed && <details><summary className="cursor-pointer font-semibold">แก้สาระสำคัญและเสนอฉบับใหม่</summary><label className="block my-2"><span className="ws-label">เหตุผลที่แก้ไข</span><input className="ws-input w-full" value={revisionReason} onChange={e => setRevisionReason(e.target.value)} /></label><Button type="button" variant="secondary" onClick={() => action(() => revisePoliceLetters(live.no, revisionReason), 'เก็บฉบับเดิมแล้ว ฉบับใหม่ยังไม่มีลายมือชื่อ')}>สร้างฉบับแก้ไขเพื่อเสนอใหม่</Button></details>}
    {b.revisionStage && b.revisionStage !== 'complete' && <section className="space-y-3" aria-label="เสนอฉบับแก้ไข"><h3 className="font-semibold">ฉบับแก้ไข: {({ draft: 'ร่าง', supervisor: 'รอผู้บังคับบัญชาชั้นต้น', director: 'รอ ผอ.สำนัก/กอง', deputy: 'รอรองเลขาธิการ', secretary: 'รอเลขาธิการลงนาม', awaiting_dispatch: 'รอธุรการ สลธ. ส่งคืนผู้รับผิดชอบ' } as Record<string, string>)[b.revisionStage]}</h3>
      {b.revisionStage === 'draft' && officer && <Button type="button" onClick={() => action(() => advancePoliceRevision(live.no, 'submit'), 'ส่งฉบับแก้ไขให้ผู้ตรวจแล้ว')}>เสนอฉบับแก้ไขตามลำดับชั้น</Button>}
      {isPoliceQueueCase(auth.currentRole, live, auth.currentOrgUnitId) && !pendingNumber && b.revisionStage !== 'awaiting_dispatch' && <div className="space-y-2">{!revisionSigning && <Button type="button" onClick={() => action(() => advancePoliceRevision(live.no, 'approve'), 'ส่งฉบับแก้ไขให้ผู้ตรวจชั้นถัดไปแล้ว')}>เห็นชอบฉบับแก้ไขและส่งต่อ</Button>}<label className="block"><span className="ws-label">ข้อสั่งการส่งกลับแก้ไข</span><input className="ws-input w-full" value={revisionReason} onChange={e => setRevisionReason(e.target.value)} /></label><Button type="button" variant="secondary" onClick={() => action(() => advancePoliceRevision(live.no, 'return', revisionReason), 'ส่งกลับแก้ไขแล้ว')}>ส่งกลับแก้ไขหนังสือ</Button></div>}
      {revisionSigning && <Button type="button" disabled={!POLICE_KINDS.every(k => reviewed[k] === key)} onClick={() => { const missing = policeMissing(b, live.protectionDays); if (missing.length) setError(missing.join(' · ')); else setRevisionSign(true) }}>ลงนามเฉพาะหนังสือฉบับแก้ไขทั้งสองฉบับ</Button>}
    </section>}
    {clerk && b.revisionStage === 'awaiting_dispatch' && <Button type="button" onClick={() => action(() => dispatchPoliceRevision(live.no), 'ส่งคืนฉบับลงนามให้หน่วยผู้รับผิดชอบแล้ว')}>ตรวจชุดลงนามและส่งคืนผู้รับผิดชอบ</Button>}
    <SignatureModal isOpen={revisionSign} title="ลงนามหนังสือฉบับแก้ไข" signerRole="เลขาธิการคณะกรรมการ ป.ป.ท." defaultSignerName={auth.getCurrentUserAccount()?.name || ''} onClose={() => setRevisionSign(false)} onConfirm={(_, image) => { const result = signPoliceLetters(live.no, key, image); setRevisionSign(false); if (!result.ok) setError(result.errors.join(' · ')); else setMessage('ลงนามฉบับแก้ไขครบแล้ว รอธุรการ สลธ. ส่งคืนหน่วยผู้รับผิดชอบ') }} />
    <details><summary className="cursor-pointer font-semibold">ประวัติและหนังสือฉบับก่อนหน้า ({b.archives.length})</summary><ol className="space-y-1 my-3 text-sm">{b.events.map((e, i) => <li key={i}>{new Date(e.at).toLocaleString('th-TH')} · {e.by} · {e.action}</li>)}</ol>{b.archives.map(v => <div key={v.id} className="flex flex-wrap justify-between gap-2 border-t border-line py-2"><span>{POLICE_TITLES[v.kind]} ฉบับ {v.version} · {STATUS[v.status]} · {v.signedBy}</span>{v.signedHtml && <Button type="button" variant="secondary" onClick={() => printCoordinationLetter(v.signedHtml!)}>เปิดฉบับเดิม</Button>}</div>)}</details>
    {error && <p role="alert" className="text-danger">{error}</p>}{message && <p role="status" className="text-success">{message}</p>}
  </section>
}
