import { DocumentViewButton } from '../common/DocumentViewButton'
import { completedProtectionOriginals } from '../../lib/referralDocumentIdentity'
import React, { useEffect, useState } from 'react'
import type { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { useFormDraftStore, selectCaseDraft } from '../../store/useFormDraftStore'
import { useAuthStore } from '../../store/useAuthStore'
import { approvalCoordinationAgency, approvalMethods, coordinationApprovalKey } from '../../lib/approvalCoordination'
import { prepareApprovalLetters, reviewApprovalLetter, saveApprovalLetter } from '../../lib/approvalCoordinationActions'
import { PoliceLetterBundlePanel } from './PoliceLetterBundlePanel'
import { CoordinationLetterComposer, CoordinationLetterPreview, letterRecipientFor, printCoordinationLetter } from './CoordinationLetterComposer'
import { Button } from '../common/Button'
import { POLICE_TITLES } from '../../lib/policeLetters'

export function ApprovalCoordinationPanel({ caseItem, compact = false, signing = false, onPoliceReviewed, onOpenSigning }: {
  caseItem: CaseItem; compact?: boolean; signing?: boolean; onPoliceReviewed?: (key: string) => void; onOpenSigning?: (document: 'station' | 'national' | 'agency') => void
}) {
  const c = useCaseStore(s => s.cases.find(c => c.no === caseItem.no)) || caseItem
  const kb6 = useFormDraftStore(s => selectCaseDraft(s, 6, c.no))
  const auth = useAuthStore()
  const agency = approvalCoordinationAgency(c, kb6)
  const [opened, setOpened] = useState<string | null>(null)
  useEffect(() => { if (approvalMethods(c, kb6).includes(4)) prepareApprovalLetters(c.no) }, [c.no, agency, kb6])
  if (c.preliminaryDecision?.formNo === 10 || (!c.preliminaryDecision && c.kb6SecretarySignedAt && c.kb6SecretaryOpinionChoice === 'disagree') || c.activity7State === 'rejected') return null
  if (!approvalMethods(c, kb6).includes(4)) return null
  if (!agency) return <p role="alert" className="ws-callout">วิธีที่ 4: ยังไม่ระบุหน่วยงานปลายทางใน คบ.6 กรุณาระบุหน่วยงานเพื่อเตรียมหนังสือประสานในชุดเสนอ</p>
  const a = c.coordinationApproval
  const officer = ['officer', 'case_owner', 'got_officer'].includes(auth.currentRole) && c.assignedOfficerUserId === auth.currentOfficerUserId && ['staff_review', 'officer_intake'].includes(c.stage)
  const editable = !a?.signature && (auth.currentRole === 'admin' || officer || (auth.currentRole === 'secretary' && c.stage === 'external_pending'))
  const entries = agency === 'police' ? (['station', 'national'] as const).map(kind => ({ key: kind, title: POLICE_TITLES[kind], signed: !!c.policeLetters?.letters[kind].signedAt }))
    : [{ key: 'agency', title: `หนังสือประสาน${a?.agency || 'หน่วยงานอื่น'}`, signed: !!a?.signature }]
  const content = agency === 'police' ? <PoliceLetterBundlePanel key={opened || 'station'} caseItem={c} signing={signing} initialKind={opened === 'national' ? 'national' : 'station'} onReviewed={onPoliceReviewed} /> : a ? <section data-testid="approval-agency-letter" className="space-y-3 border-t border-line pt-4">
    <h3 className="font-semibold text-navy">หนังสือประสาน{a.agency} · ชุดเสนอเดียวกับ คบ.6 / คบ.9</h3>
    {a.signature ? <><p className="ws-readonly">ลงนามแล้วโดย {a.signature.by} · {new Date(a.signature.at).toLocaleString('th-TH')} · เก็บฉบับลงนามแยกจากเลขทะเบียนสารบรรณ</p><CoordinationLetterPreview draft={a.signature.draft} recipient={letterRecipientFor(a.agency, a.agencyType)} unit="" caption="ฉบับลงนามที่เก็บไว้" html={a.signature.html} /><Button variant="secondary" onClick={() => printCoordinationLetter(a.signature!.html)}>เปิด / พิมพ์ฉบับลงนาม</Button></>
      : <CoordinationLetterComposer caseItem={c} stationName={a.agency} agencyType={a.agencyType} draft={a.draft} locked={!editable} onChange={draft => saveApprovalLetter(c.no, draft)} />}
    {signing && !a.signature && <Button type="button" variant="secondary" data-testid="bundle-reviewed-agency" onClick={() => reviewApprovalLetter(c.no)}>{a.reviewedKey === coordinationApprovalKey(a) ? 'ตรวจหนังสือประสานแล้ว' : 'ยืนยันว่าเปิดตรวจหนังสือประสานแล้ว'}</Button>}
  </section> : null
  const completedOriginal = completedProtectionOriginals(c)
  return <section className="space-y-3" data-testid="approval-coordination-documents">
    {compact && entries.map(entry => <div key={entry.key} className={`rounded-xl border px-3 py-2 transition ${entry.signed || completedOriginal ? 'border-[#9fd0b4] bg-[#eef8f2]' : 'border-[#e6cf86] bg-[#fdf8e7]'}`} data-testid={`approval-letter-row-${entry.key}`}>
      <div className="grid min-h-[4rem] grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_10rem]">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-9 min-w-12 shrink-0 items-center justify-center rounded-lg bg-blue-soft px-2 text-[0.8rem] font-bold text-blue" title="หนังสือประกอบชุด คบ.6 · ลงนามพร้อม คบ.9"><i className="fa-solid fa-file-lines" aria-hidden="true" /><span className="sr-only">หนังสือประกอบ</span></span>
          <div className="min-w-0"><strong className="block text-[0.88rem] font-semibold text-navy">{entry.title}</strong></div>
        </div>
        <div className="flex min-w-0 sm:justify-center"><span className={`ws-status text-center ${entry.signed || completedOriginal ? 'success' : ''}`}>{entry.signed ? 'ลงนามแล้ว' : completedOriginal ? 'ดำเนินการแล้ว · ฉบับเดิม' : signing || c.preliminaryDecision?.formNo === 9 ? 'รอลงนาม' : 'ร่างรอผลพิจารณา'}</span></div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
          {entry.signed || completedOriginal || !onOpenSigning ? (
            <DocumentViewButton aria-expanded={opened === entry.key} onClick={() => setOpened(opened === entry.key ? null : entry.key)} />
          ) : <Button type="button" variant="secondary" size="md" onClick={() => onOpenSigning(entry.key as 'station' | 'national' | 'agency')}><i className="fa-solid fa-pen-to-square text-xs" aria-hidden="true" />เปิดแบบฟอร์ม</Button>}
        </div>
      </div>
    </div>)}
    {(!compact || opened) && content}
  </section>
}
