import { legacyMonthLabel, monthLabel, protectionMonths } from '../../lib/protectionMonths'
import React from 'react'
import type { CaseItem, CoordinationLetterDraft } from '../../types/case'
import { Button } from '../common/Button'
import { formatThaiDate } from '../../lib/utils'

export const defaultCoordinationLetter = (c: CaseItem): CoordinationLetterDraft => ({
  registryNo: '', registryDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
  subject: 'ขอความร่วมมือในการคุ้มครองพยาน', signerName: '', signerPosition: '',
  body: `สำนักงาน ป.ป.ท. ได้อนุมัติให้ความคุ้มครองแก่ ${c.person} ตามคำร้องเลขที่ ${c.no} โดยใช้วิธีประสานหน่วยงานอื่นให้คุ้มครอง ระยะเวลา ${protectionMonths(c) ? monthLabel(protectionMonths(c)) : '…'} ตามผลอนุมัติเลขที่ ${c.decisionNumber || '…'}\n\nจึงขอความร่วมมือจากสถานีตำรวจของท่านพิจารณาดำเนินการคุ้มครองพยานตามข้อตกลง คบ.11 และแจ้งผลการพิจารณาตอบรับเป็นหนังสือ เพื่อประสานรายละเอียดการดำเนินการต่อไป`,
})
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
export const CoordinationLetterComposer: React.FC<{
  caseItem: CaseItem; stationName: string; draft: CoordinationLetterDraft; onChange: (draft: CoordinationLetterDraft) => void
}> = ({ caseItem, stationName, draft, onChange }) => {
  const update = (key: keyof CoordinationLetterDraft, value: string) => onChange({ ...draft, [key]: value })
  const recipient = stationName ? `ผู้กำกับการ${stationName}` : 'ผู้กำกับการสถานีตำรวจที่ประสาน'
  const date = draft.registryDate ? formatThaiDate(draft.registryDate) : '…'
  const download = () => {
    const html = `<!doctype html><html lang="th"><meta charset="utf-8"><title>หนังสือประสาน ${esc(caseItem.no)}</title><style>@page{size:A4;margin:25mm}body{font-family:serif;font-size:16pt;line-height:1.6}article{max-width:160mm;margin:auto}p{white-space:pre-wrap}.right{text-align:right}.signature{margin:35mm 0 0 65mm}button{margin:1rem}@media print{button{display:none}}</style><button onclick="window.print()">พิมพ์หนังสือ A4</button><article><p class="right">สำนักงาน ป.ป.ท.</p><p>ที่ ${esc(draft.registryNo || '…')}</p><p class="right">${esc(date)}</p><p>เรื่อง ${esc(draft.subject)}</p><p>เรียน ${esc(recipient)}</p><p>${esc(draft.body)}</p><p>จึงเรียนมาเพื่อโปรดพิจารณา</p><div class="signature"><p>ขอแสดงความนับถือ</p><p>(${esc(draft.signerName || '…')})<br>${esc(draft.signerPosition || '…')}</p></div></article></html>`
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `หนังสือประสาน_${caseItem.no}.html`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="scroll-mt-24 space-y-4" data-testid="coordination-letter-composer">
    <h3 className="text-[1.1rem] font-bold text-navy">จัดทำหนังสือประสานสถานีตำรวจ</h3>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="space-y-3">
        <label className="block"><span className="ws-label">เรื่อง</span><input className="ws-input w-full" value={draft.subject} onChange={(e) => update('subject', e.target.value)} /></label>
        <label className="block"><span className="ws-label">เนื้อหาหนังสือประสาน</span><textarea className="ws-input w-full" rows={9} value={draft.body} onChange={(e) => update('body', e.target.value)} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="ws-label">เลขหนังสือประสาน *</span><input data-testid="coordination-letter-number" className="ws-input w-full" value={draft.registryNo} onChange={(e) => update('registryNo', e.target.value)} /></label>
          <label className="block"><span className="ws-label">วันที่หนังสือประสาน</span><input type="date" className="ws-input w-full" value={draft.registryDate} onChange={(e) => update('registryDate', e.target.value)} /></label>
          <label className="block"><span className="ws-label">ชื่อผู้ลงชื่อในหนังสือ</span><input className="ws-input w-full" value={draft.signerName} onChange={(e) => update('signerName', e.target.value)} /></label>
          <label className="block"><span className="ws-label">ตำแหน่งผู้ลงชื่อ</span><input className="ws-input w-full" value={draft.signerPosition} onChange={(e) => update('signerPosition', e.target.value)} /></label>
        </div>
        <Button type="button" variant="secondary" size="md" onClick={download}>ดาวน์โหลดหนังสือสำหรับพิมพ์ A4</Button>
      </div>
      <div className="min-w-0 rounded-xl bg-soft p-3">
        <p className="mb-2 text-[0.8rem] font-semibold text-muted">ตัวอย่างหนังสือประสาน A4 · ร่าง</p>
        <article data-testid="coordination-letter-preview" className="min-h-[620px] break-words bg-paper p-5 text-[0.88rem] leading-loose text-ink sm:p-8">
          <p className="text-right">สำนักงาน ป.ป.ท.</p><p>ที่ {draft.registryNo || '…'}</p><p className="text-right">{date}</p>
          <p className="mt-5">เรื่อง {draft.subject}</p><p>เรียน {recipient}</p>
          <p className="mt-5 whitespace-pre-wrap">{draft.body}</p><p className="mt-5">จึงเรียนมาเพื่อโปรดพิจารณา</p>
          <div className="mt-12 text-center"><p>ขอแสดงความนับถือ</p><p className="mt-8">({draft.signerName || '…'})</p><p>{draft.signerPosition || '…'}</p></div>
        </article>
      </div>
    </div>
  </section>
}
