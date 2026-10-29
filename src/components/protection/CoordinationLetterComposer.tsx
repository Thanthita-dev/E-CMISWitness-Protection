import { PAPER_SIGN_BUTTON_CLASS } from '../forms/paper/paperSign'
import { policePersonalFields, createPoliceBundle, policeDate } from '../../lib/policeLetters'
import { legacyMonthLabel, monthLabel, protectionMonths } from '../../lib/protectionMonths'
import { useFormDraftStore, selectCaseDraft } from '../../store/useFormDraftStore'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { CaseItem, CoordinationAgencyType, CoordinationLetterDraft } from '../../types/case'
import { COORDINATION_AGENCY_TYPES } from '../../lib/constants'
import { Button } from '../common/Button'
import { useAuthStore } from '../../store/useAuthStore'
import { VoiceTextarea } from '../common/VoiceTextarea'
import { caseNoFileSafe } from '../../lib/utils'
import { formatSarabanDate } from '../../lib/saraban'

export const defaultCoordinationLetter = (c: CaseItem, agencyType: CoordinationAgencyType = 'police'): CoordinationLetterDraft => agencyType === 'police' ? createPoliceBundle(c, policePersonalFields(useFormDraftStore.getState(), c.no), selectCaseDraft(useFormDraftStore.getState(), 6, c.no), '').letters.station.draft : ({
  registryNo: '', registryDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
  subject: 'ขอความร่วมมือในการคุ้มครองพยาน', signerName: '', signerPosition: '',
  body: `สำนักงาน ป.ป.ท. ได้อนุมัติให้ความคุ้มครองแก่ ${c.person} ตามคำร้องเลขที่ ${c.no} โดยใช้วิธีประสานหน่วยงานอื่นให้คุ้มครอง ระยะเวลา ${protectionMonths(c) ? monthLabel(protectionMonths(c)) : '…'} ตามผลอนุมัติเลขที่ ${c.decisionNumber || '…'}\n\nจึงขอความร่วมมือจากหน่วยงานของท่านพิจารณาดำเนินการคุ้มครองพยานตามข้อตกลง คบ.11 และแจ้งผลการพิจารณาตอบรับเป็นหนังสือ เพื่อประสานรายละเอียดการดำเนินการต่อไป`,
})
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
const GARUDA_SRC = '/assets/forms/official/emblem/garuda-letter.png'
const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const thaiDigits = (v: string | number) => String(v).replace(/[0-9]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'[Number(d)])
/** วันที่แบบหนังสือราชการ เช่น ๒๑ ตุลาคม ๒๕๖๙ (รับ yyyy-mm-dd ค.ศ.) */
const officialDate = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return '…'
  return thaiDigits(`${Number(m[3])} ${THAI_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`)
}
export const LETTER_CSS = `.wp-letter{box-sizing:border-box;width:210mm;min-height:297mm;padding:20mm 20mm 18mm 28mm;background:#fff;color:#000;font-family:"TH Sarabun New","Sarabun",serif;font-size:16pt;line-height:1.35;position:relative}
.wp-letter p{margin:0}.wp-letter .garuda{display:block;width:3cm;height:auto;margin:0 auto 2mm}
.wp-letter .head{display:flex;justify-content:space-between;align-items:flex-start;margin-top:2mm}.wp-letter .head .org{text-align:left;max-width:80mm}
.wp-letter .date{margin:0 0 0 80mm}.wp-letter .row{margin-top:2mm}.wp-letter .row .label{display:inline-block}
.wp-letter .body{margin-top:5mm;text-indent:25mm;text-align:justify;white-space:pre-wrap;overflow-wrap:anywhere}.wp-letter .body-p{text-indent:0}
.wp-letter .closing{margin-top:5mm;text-indent:25mm}
.wp-letter .sign{margin:6mm 0 0 80mm;text-align:center;width:80mm}.wp-letter .sign .space{height:20mm}
.wp-letter .foot{position:absolute;left:28mm;bottom:18mm;font-size:14pt;line-height:1.3}
.wp-letter.police{padding:10mm 25.4mm 17mm;font-size:16pt;line-height:1.08;min-height:297mm}
.wp-letter.police.national{padding-top:19mm}.wp-letter.police .garuda{height:28mm;width:auto;margin-bottom:0}
.wp-letter.police .head{margin-top:-8mm;min-height:22mm}.wp-letter.police .org{width:65mm;max-width:65mm}
.wp-letter.police .date{margin-top:3mm;margin-bottom:4mm;margin-left:80mm}
.wp-letter.police .body{margin-top:4mm;white-space:normal}.wp-letter.police .sign{margin-top:4mm;margin-left:72mm;width:80mm;break-inside:avoid}
.wp-letter.police .foot{position:static;left:auto;bottom:auto;margin-top:8mm;break-inside:avoid;font-size:16pt}.wp-letter.police .signature{height:18mm;max-width:60mm;object-fit:contain;margin:auto}
@font-face{font-family:"TH Sarabun New";src:url('/assets/fonts/THSarabunNew.ttf') format('truetype')}
@media print{.wp-letter{margin:0;box-shadow:none}.wp-letter p{orphans:3;widows:3}}`
export const buildLetterHtml = (o: {
  draft: CoordinationLetterDraft; recipient: string; unit: string; garudaSrc: string
}) => {
  const { draft, recipient, unit, garudaSrc } = o
  if (draft.policeKind) return `<article class="wp-letter police ${draft.policeKind}"><img class="garuda" src="${esc(garudaSrc)}" alt="ตราครุฑ">
<div class="head"><p>ที่ ${esc(draft.registryNo || 'ปป ๐๐๑๒/…………')}</p><div class="org"><p>สำนักงาน ป.ป.ท.</p><p>อาคารซอฟต์แวร์ปาร์ค ถนนแจ้งวัฒนะ</p><p>อำเภอปากเกร็ด จังหวัดนนทบุรี ๑๑๑๒๐</p></div></div>
<p class="date">${esc(policeDate(draft.registryDate))}</p><p class="row">เรื่อง&nbsp; ${esc(draft.subject)}</p><p class="row">เรียน&nbsp; ${esc(recipient)}</p>
${draft.policeKind === 'national' ? `<p class="row">สิ่งที่ส่งมาด้วย&nbsp; ${esc(draft.enclosure || 'สำเนาหนังสือ สำนักงาน ป.ป.ท. ลับ ด่วนที่สุด ที่ ปป ............../ ลงวันที่....................')}</p>` : ''}
${draft.body.split(/\n\s*\n/).map(p => `<p class="body">${esc(p)}</p>`).join('')}
<p class="closing">${draft.policeKind === 'national' ? 'จึงเรียนมาเพื่อโปรดพิจารณาอนุเคราะห์ต่อไปด้วย จักขอบคุณยิ่ง' : 'จึงเรียนมาเพื่อโปรดพิจารณา'}</p>
<div class="sign"><p>ขอแสดงความนับถือ</p>${draft.signatureImage ? `<img class="signature" src="${esc(draft.signatureImage)}" alt="ลายมือชื่อจำลอง">` : '<div class="space"></div>'}<p>(${esc(draft.signerName || '......................................')})</p><p>เลขาธิการคณะกรรมการ ป.ป.ท</p></div>
<div class="foot"><p>กองอำนวยการต่อต้านการทุจริต</p><p>โทร ${esc(draft.contactPhone || '.........................')}</p><p>โทรสาร. ${esc(draft.fax || '.........................')}</p><p>(${esc(draft.contact || '.........................................')})</p></div></article>`
  return `<div class="wp-letter"><img class="garuda" src="${esc(garudaSrc)}" alt="ตราครุฑ">
<div class="head"><p>ที่ ${esc(draft.registryNo || '………………')}</p><div class="org"><p>สำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ (สำนักงาน ป.ป.ท.)</p></div></div>
<p class="date">${esc(officialDate(draft.registryDate))}</p>
<p class="row">เรื่อง&nbsp;&nbsp;${esc(draft.subject)}</p>
<p class="row">เรียน&nbsp;&nbsp;${esc(recipient)}</p>
<p class="body">${esc(draft.body)}</p>
<p class="closing">จึงเรียนมาเพื่อโปรดพิจารณา</p>
<div class="sign"><p>ขอแสดงความนับถือ</p>${draft.signatureImage ? `<img style="height:18mm;max-width:60mm;object-fit:contain;margin:auto" src="${esc(draft.signatureImage)}" alt="ลายมือชื่อจำลอง">` : '<div class="space"></div>'}<p>(${esc(draft.signerName || '………………………………')})</p><p>${esc(draft.signerPosition || '………………………………')}</p></div>
<div class="foot"><p>${esc(unit || 'กลุ่มงานคุ้มครองพยาน')}</p><p>โทร. ………………………</p><p>ไปรษณีย์อิเล็กทรอนิกส์ ………………………</p></div></div>`
}
const toDataUrl = async (src: string) => {
  try {
    const blob = await (await fetch(src)).blob()
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(blob)
    })
  } catch { return new URL(src, window.location.origin).href }
}
const A4_PX = 794
export const letterRecipientFor = (stationName: string, agencyType: CoordinationAgencyType = 'police') => {
  const preset = COORDINATION_AGENCY_TYPES.find((t) => t.value === agencyType)
  return agencyType === 'police'
    ? stationName ? `ผู้กำกับการ${stationName}` : 'ผู้กำกับการสถานีตำรวจที่ประสาน'
    : stationName && stationName !== preset?.agency ? `หัวหน้าส่วนราชการ ${stationName}` : preset?.recipient || 'หัวหน้าหน่วยงานที่ประสาน'
}
/** ตัวอย่างหนังสือ A4 ย่อตามความกว้างกรอบ — ใช้ทั้งหน้าจัดทำหนังสือและหน้าธุรการออกเลข */
export const CoordinationLetterPreview: React.FC<{ draft: CoordinationLetterDraft; recipient: string; unit: string; caption: string; html?: string; onSign?: () => void }> = ({ draft, recipient, unit, caption, html, onSign }) => {
  const [scale, setScale] = useState(0.6)
  const [height, setHeight] = useState(1123)
  const paper = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = frame.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / A4_PX)))
    ro.observe(el); return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (!paper.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setHeight(Math.max(1123, paper.current?.scrollHeight || 1123)))
    ro.observe(paper.current); return () => ro.disconnect()
  }, [])
  const previewHtml = useMemo(() => html || buildLetterHtml({ draft, recipient, unit, garudaSrc: GARUDA_SRC }), [draft, recipient, unit, html])
  return <div className="min-w-0 rounded-xl bg-soft p-3">
    <p className="mb-2 text-[0.8rem] font-semibold text-muted">{caption}</p>
    <div ref={frame} className="mx-auto w-full overflow-hidden rounded-lg shadow-md" style={{ maxWidth: A4_PX, height: height * scale }}>
      <style>{LETTER_CSS}</style>
      <div ref={paper} data-testid="coordination-letter-preview" style={{ width: A4_PX, transform: `scale(${scale})`, transformOrigin: 'top left' }} onClick={event => { if ((event.target as HTMLElement).closest('[data-letter-sign]')) onSign?.() }} dangerouslySetInnerHTML={{ __html: onSign ? previewHtml.replace('<div class="space"></div>', `<div class="space" style="position:relative"><span class="paper-sign-slot print:hidden"><button type="button" data-letter-sign class="${PAPER_SIGN_BUTTON_CLASS}"><i class="fa-solid fa-pen text-[10px]" aria-hidden="true"></i>ลงนาม</button></span></div>`) : previewHtml }} />
    </div>
  </div>
}
export const CoordinationLetterComposer: React.FC<{
  caseItem: CaseItem; stationName: string; agencyType?: CoordinationAgencyType; draft: CoordinationLetterDraft; onChange: (draft: CoordinationLetterDraft) => void
  /** ส่งธุรการออกเลขแล้ว — แก้หนังสือไม่ได้จนกว่าธุรการจะส่งคืน */
  locked?: boolean
}> = ({ caseItem, stationName, agencyType = 'police', draft, onChange, locked }) => {
  const update = (key: keyof CoordinationLetterDraft, value: string) => onChange({ ...draft, [key]: value })
  const user = useAuthStore((s) => s.getCurrentUserAccount)()
  const recipient = draft.policeKind === 'national' ? 'ผู้บัญชาการตำรวจแห่งชาติ' : letterRecipientFor(stationName, agencyType)
  const unit = user?.unit || ''
  useEffect(() => {
    if (!draft.policeKind && !locked && !draft.signerName && !draft.signerPosition && user) onChange({ ...draft, signerName: user.name, signerPosition: user.position })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const download = async () => {
    const letter = buildLetterHtml({ draft, recipient, unit, garudaSrc: await toDataUrl(GARUDA_SRC) })
    const html = `<!doctype html><html lang="th"><meta charset="utf-8"><title>หนังสือประสาน ${esc(caseItem.no)}</title><style>@page{size:A4;margin:0}body{margin:0;background:#e5e7eb}${LETTER_CSS}.bar{padding:.75rem;text-align:center}.wp-letter{margin:0 auto}@media print{body{background:#fff}.bar{display:none}}</style><div class="bar"><button onclick="window.print()">พิมพ์หนังสือ A4</button></div>${letter}</html>`
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `หนังสือประสาน_${caseNoFileSafe(caseItem.no)}.html`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="scroll-mt-24 space-y-4" data-testid="coordination-letter-composer">
    <h3 className="text-[1.1rem] font-bold text-navy">จัดทำหนังสือประสาน{agencyType === 'police' ? 'สถานีตำรวจ' : 'หน่วยงาน'}</h3>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="space-y-3">
        <label className="block"><span className="ws-label">เรื่อง</span><input className="ws-input w-full" disabled={locked} value={draft.subject} onChange={(e) => update('subject', e.target.value)} /></label>
        <label className="block"><span className="ws-label">เนื้อหาหนังสือประสาน</span><VoiceTextarea className="ws-input w-full" rows={9} disabled={locked} value={draft.body} onChange={(e) => update('body', e.target.value)} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          {/** เลขและวันที่หนังสือออกโดยธุรการหน่วยเจ้าของเรื่อง — เจ้าหน้าที่ไม่กรอกเอง */}
          <label className="block"><span className="ws-label">เลขหนังสือประสาน</span><input data-testid="coordination-letter-number" className="ws-input w-full" disabled value={draft.registryNo} placeholder="ธุรการออกเลขให้" /></label>
          <label className="block"><span className="ws-label">วันที่หนังสือประสาน</span><input data-testid="coordination-letter-date" className="ws-input w-full" disabled value={draft.registryNo ? formatSarabanDate(draft.registryDate) : ''} placeholder="ธุรการลงวันที่ให้" /></label>
          <label className="block"><span className="ws-label">ชื่อผู้ลงชื่อในหนังสือ</span><input className="ws-input w-full" disabled={locked} value={draft.signerName} onChange={(e) => update('signerName', e.target.value)} /></label>
          <label className="block"><span className="ws-label">ตำแหน่งผู้ลงชื่อ</span><input className="ws-input w-full" disabled={locked || !!draft.policeKind} value={draft.signerPosition} onChange={(e) => update('signerPosition', e.target.value)} /></label>
        </div>
        <Button type="button" variant="secondary" size="md" onClick={() => printCoordinationLetter(buildLetterHtml({ draft, recipient, unit, garudaSrc: GARUDA_SRC }))}>พิมพ์ / บันทึก PDF ภาษาไทย</Button>
        {!draft.policeKind && <Button type="button" variant="secondary" size="md" onClick={download}>ดาวน์โหลดหนังสือสำหรับพิมพ์ A4</Button>}
      </div>
      <CoordinationLetterPreview draft={draft} recipient={recipient} unit={unit} caption={`ตัวอย่างหนังสือประสาน A4 · ${draft.registryNo ? 'ออกเลขแล้ว' : 'ร่าง'}`} />
    </div>
  </section>
}

/** The browser's PDF printer embeds the locally bundled Thai font and preserves selectable text. */
export async function printCoordinationLetter(html: string) {
  const frame = document.createElement('iframe')
  frame.title = 'พิมพ์หนังสือ / บันทึกเป็น PDF'
  frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument!
  doc.open(); doc.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><style>@page{size:A4;margin:0}body{margin:0}${LETTER_CSS}</style></head><body>${html}</body></html>`); doc.close()
  await doc.fonts.ready
  await Promise.all(Array.from(doc.images).map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve })))
  frame.contentWindow?.focus(); frame.contentWindow?.print()
  setTimeout(() => frame.remove(), 60000)
}
