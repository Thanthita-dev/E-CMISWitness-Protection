import { approvalCoordinationAgency } from './approvalCoordination'
import type { CaseItem, CoordinationLetterDraft } from '../types/case'
import { addProtectionMonths } from './protectionMonths'

export type PoliceLetterKind = 'station' | 'national'
export const POLICE_KINDS: PoliceLetterKind[] = ['station', 'national']
export const POLICE_TITLES = { station: 'หนังสือถึงผู้กำกับการสถานีตำรวจ', national: 'หนังสือถึงผู้บัญชาการตำรวจแห่งชาติ' }
export const POLICE_SIGNER_POSITION = 'เลขาธิการคณะกรรมการ ป.ป.ท'
export interface PoliceLetterData {
  witness: string; age: string; citizenId: string; house: string; village: string; subdistrict: string; district: string; province: string; phone: string
  station: string; months: string; start: string; end: string; contact: string; contactPhone: string; fax: string
}
export interface PoliceLetterVersion {
  id: string; version: number; kind: PoliceLetterKind; draft: CoordinationLetterDraft
  status: 'draft' | 'review' | 'awaiting_number' | 'awaiting_signature' | 'signed' | 'sent'
  data: PoliceLetterData; signedAt?: string; signedBy?: string; signatureImage?: string; signedHtml?: string
  numberedAt?: string; numberedBy?: string; sentAt?: string; sentBy?: string; channel?: string; trackingNo?: string
  attachmentVersionId?: string; reviewKey?: string
}
export interface PoliceLetterBundle {
  revisionStage?: 'draft' | 'supervisor' | 'director' | 'deputy' | 'secretary' | 'awaiting_dispatch' | 'complete'
  revisionDispatchedAt?: string
  revisionDispatchedBy?: string
  decisionKey?: string
  data: PoliceLetterData; letters: Record<PoliceLetterKind, PoliceLetterVersion>; archives: PoliceLetterVersion[]
  events: { at: string; by: string; action: string; versionId?: string }[]
}
export const policeRequired = (c: CaseItem, kb6: Record<string, any>) =>
  approvalCoordinationAgency(c, kb6) === 'police'
export const policeDate = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '...........................'
  return new Date(`${iso}T12:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
}
const blank = (s: string) => s.trim() || '...........................'
/** Transcribed from the two customer DOCX files, including the original legal wording. */
export function policeBody(kind: PoliceLetterKind, d: PoliceLetterData) {
  const address = `${blank(d.house)} หมู่ที่ ${blank(d.village)} ตำบล${blank(d.subdistrict)} อำเภอ${blank(d.district)} จังหวัด${blank(d.province)}`
  const legal = 'ซึ่งพยานถือเป็นบุคคลตามมาตรา 53 แห่งพระราชบัญญัติมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๑ และที่แก้ไขเพิ่มเติม เป็นพยานที่สามารถให้ข้อมูลอันเป็นประโยชน์ต่อการดำเนินการเกี่ยวกับการป้องกันและปราบปรามการทุจริตในภาครัฐ ขณะนี้คดีอยู่ในระหว่างการดำเนินการของสำนักงาน ป.ป.ท.'
  const costs = 'ทั้งนี้ สำนักงาน ป.ป.ท. จะรับผิดชอบค่าใช้จ่ายจากการปฏิบัติหน้าที่ อันเป็นไปตามระเบียบสำนักนายกรัฐมนตรี ว่าด้วยค่าใช้จ่ายและวิธีการเบิกจ่ายตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. 2565 และที่แก้ไขเพิ่มเติม'
  const protection = `ในการเข้าพื้นที่ตรวจตรา ดูแล รักษาความปลอดภัย บริเวณสถานที่พักของพยาน ที่ทำงาน และสถานที่ใกล้เคียง เป็นเวลา ${blank(d.months)} เดือน นับแต่วันที่ ${policeDate(d.start)} ถึงวันที่ ${policeDate(d.end)}`
  return kind === 'station'
    ? `ด้วย ${blank(d.witness)} อายุ ${blank(d.age)} ปี บัตรประจำตัวประชาชนเลขที่ ${blank(d.citizenId)} ภูมิลำเนาอยู่ที่ ${address} โทรศัพท์หมายเลข ${blank(d.phone)} พยานในสำนวนคดีของสำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ (สำนักงาน ป.ป.ท.) ได้ยื่นคำร้องขอให้มีการคุ้มครองพยาน ${legal}\n\nสำนักงาน ป.ป.ท. จึงใคร่ขอความอนุเคราะห์มายังท่าน เพื่อพิจารณาจัดเจ้าหน้าที่ตำรวจในพื้นที่ให้ความคุ้มครองพยานราย ${blank(d.witness)} ${protection} ${costs}`
    : `ด้วยสำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ (สำนักงาน ป.ป.ท.) ได้รับคำร้องขอให้มีการคุ้มครองพยานตามมาตรการคุ้มครองเบี้องต้น จาก${blank(d.witness)} อายุ ${blank(d.age)} ปี บัตรประจำตัวประชาชนเลขที่ ${blank(d.citizenId)} ภูมิลำเนาอยู่ที่ ${address} พยานในสำนวนคดีของสำนักงาน ป.ป.ท. ${legal}\n\nในการนี้ สำนักงาน ป.ป.ท. ได้มีหนังสือขอความอนุเคราะห์ไปยังผู้กำกับการ${blank(d.station)} เพื่อพิจารณาจัดเจ้าหน้าที่ตำรวจในพื้นที่ให้ความคุ้มครองพยานราย ${blank(d.witness)} ${protection} รายละเอียดปรากฏตามสิ่งที่ส่งมาด้วย ${costs}`
}
export function policeDraft(kind: PoliceLetterKind, data: PoliceLetterData): CoordinationLetterDraft {
  return { registryNo: '', registryDate: '', subject: 'ขอความอนุเคราะห์จัดเจ้าหน้าที่ตำรวจให้ความคุ้มครองพยาน', body: policeBody(kind, data), signerName: '', signerPosition: POLICE_SIGNER_POSITION, policeKind: kind, contact: data.contact, contactPhone: data.contactPhone, fax: data.fax }
}
export function createPoliceBundle(c: CaseItem, kb2: Record<string, any>, kb6: Record<string, any>, by: string): PoliceLetterBundle {
  const co = c.methodTracks?.find(t => t.method === 4)?.coordination
  const data: PoliceLetterData = {
    witness: c.person || '', age: String(kb2['อายุ'] || ''), citizenId: String(kb2['เลขบัตรประชาชน'] || ''), house: String(kb2['บ้านเลขที่'] || ''), village: String(kb2['หมู่ที่'] || ''), subdistrict: String(kb2['ตำบล'] || ''), district: String(kb2['อำเภอ'] || ''), province: String(kb2['จังหวัด'] || ''), phone: String(kb2['เบอร์โทรศัพท์'] || kb2['โทรศัพท์'] || ''),
    station: co?.agency || '', months: c.protectionMonths ? String(c.protectionMonths) : kb6['ระยะเวลาคุ้มครองวัน'] ? String(Number(kb6['ระยะเวลาคุ้มครองวัน']) / 30) : '', start: c.actualStartedAt?.slice(0, 10) || '', end: c.protectionEndAt?.slice(0, 10) || '', contact: co?.contactPerson || '', contactPhone: co?.contactPhone || '', fax: '',
  }
  const letter = (kind: PoliceLetterKind): PoliceLetterVersion => ({ id: crypto.randomUUID(), version: 1, kind, draft: policeDraft(kind, data), status: 'draft', data: { ...data } })
  return { data, letters: { station: letter('station'), national: letter('national') }, archives: [], events: [{ at: new Date().toISOString(), by, action: 'เตรียมหนังสือตำรวจสองฉบับพร้อมชุด คบ.6' }] }
}
export const policeRevisionKey = (b: PoliceLetterBundle) => JSON.stringify(POLICE_KINDS.map(k => ({ id: b.letters[k].id, draft: { ...b.letters[k].draft, signerName: '', signatureImage: undefined }, data: b.letters[k].data })))
export const policeAllSigned = (b?: PoliceLetterBundle) => !!b && POLICE_KINDS.every(k => !!b.letters[k].signedAt)
export const POLICE_DATA_LABELS: Record<keyof PoliceLetterData, string> = { witness: 'ชื่อพยาน', age: 'อายุ', citizenId: 'เลขบัตรประชาชน', house: 'บ้านเลขที่', village: 'หมู่ที่', subdistrict: 'ตำบล', district: 'อำเภอ', province: 'จังหวัด', phone: 'โทรศัพท์พยาน', station: 'ชื่อสถานีตำรวจ', months: 'ระยะเวลา (เดือน)', start: 'วันเริ่มคุ้มครอง', end: 'วันสิ้นสุดคุ้มครอง', contact: 'ผู้ประสานงาน', contactPhone: 'โทรศัพท์หน่วยงานติดต่อ', fax: 'โทรสาร' }
export function policeMissing(b?: PoliceLetterBundle, durationDays?: number): string[] {
  if (!b) return ['หนังสือตำรวจทั้งสองฉบับ']
  const required: (keyof PoliceLetterData)[] = ['witness', 'age', 'citizenId', 'house', 'subdistrict', 'district', 'province', 'station', 'months', 'start', 'end', 'contact', 'contactPhone']
  const errors = required.filter(k => !b.data[k].trim()).map(k => POLICE_DATA_LABELS[k])
  if (!(Number(b.data.months) > 0)) errors.push('ระยะเวลาคุ้มครองต้องมากกว่าศูนย์')
  if (b.data.start && b.data.end && b.data.end <= b.data.start) errors.push('วันสิ้นสุดต้องหลังวันเริ่ม')
  if (b.data.start && b.data.end && Number.isInteger(Number(b.data.months)) && addProtectionMonths(b.data.start, Number(b.data.months)) !== b.data.end) errors.push('วันเริ่ม–สิ้นสุดไม่ตรงระยะเวลาในหนังสือ')
  if (durationDays && Math.abs(Number(b.data.months) * 30 - durationDays) > 0.01) errors.push('ระยะเวลาในหนังสือไม่ตรงผลอนุมัติ')
  for (const kind of POLICE_KINDS) {
    const l = b.letters[kind]
    if (!l.draft.registryNo || !l.draft.registryDate) errors.push(`${POLICE_TITLES[kind]}: เลขและวันที่จากธุรการ สลธ.`)
    if (l.data.witness !== b.data.witness || l.data.months !== b.data.months || l.data.start !== b.data.start || l.data.end !== b.data.end || l.data.station !== b.data.station) errors.push(`${POLICE_TITLES[kind]}: ข้อมูลไม่ตรงชุดเสนอ`)
    for (const value of [b.data.witness, `${b.data.months} เดือน`, policeDate(b.data.start), policeDate(b.data.end), ...(kind === 'national' ? [b.data.station] : [])]) if (value.trim() && !l.draft.body.includes(value)) errors.push(`${POLICE_TITLES[kind]}: เนื้อหาไม่ตรงข้อมูลร่วม (${value})`)
    if (!l.draft.body.trim()) errors.push(`${POLICE_TITLES[kind]}: เนื้อหา`)
  }
  return errors
}

/** Unlike the generic form selector, personal data must have an explicit case owner. */
export function policePersonalFields(s: { drafts: Record<number, Record<string, any>>; draftCaseNo: Record<number, string | undefined>; caseDrafts: Record<string, { drafts: Record<number, Record<string, any>> }> }, no: string): Record<string, any> {
  const own = (id: number) => s.draftCaseNo[id] === no ? s.drafts[id] || {} : s.caseDrafts[no]?.drafts[id] || {}
  const kb2 = own(2), kb1 = own(1)
  return { ...kb2, เลขบัตรประชาชน: kb1['พยานเลขบัตรประชาชน'] || kb2['เลขบัตรประชาชน'] || '', เบอร์โทรศัพท์: kb1['พยานโทรศัพท์'] || kb2['เบอร์โทรศัพท์'] || '' }
}
