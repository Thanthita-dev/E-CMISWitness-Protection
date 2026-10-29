/**
 * ช่องข้อมูลที่ต้องตั้งชื่อเองของแบบฟอร์มและหนังสือประกอบ
 *
 * ช่องส่วนใหญ่สร้างอัตโนมัติจากต้นฉบับ (หัวบันทึก ผู้ลงนาม ช่องความเห็น และจุดไข่ปลา) ใน additionalForms.ts
 * ไฟล์นี้กำหนดเฉพาะจุดที่ต้นฉบับไม่มีคำนำหน้าให้จับ หรือจุดที่ใช้ค่าเดียวกันทั้งฉบับ
 * `b` คือ key ของย่อหน้าตามลำดับใน Word (ดู --dump ของ scripts/import-additional-forms.py)
 * `text` ต้องตรงกับข้อความต้นฉบับทุกตัวอักษร (มีเทสต์ตรวจ)
 */
export interface FieldRef {
  b: string
  text: string
  nth?: number
}

export interface FieldDef {
  id: string
  label: string
  group: string
  multiline?: boolean
  at: FieldRef[]
}

export interface FieldLink {
  /** ชนิดช่องอัตโนมัติ: person, refNo, date, docNo, blank */
  kind: string
  /** ข้อความก่อนช่องต้องลงท้ายตามนี้ จึงถือเป็นข้อมูลเดียวกันทั้งฉบับ */
  after: RegExp
  id: string
  label: string
}

export interface FieldSpec {
  fields?: FieldDef[]
  links?: FieldLink[]
}

const HEAD = 'หัวหนังสือ'
const CONTACT = 'ส่วนท้ายหนังสือ'

/** เลขสำนวนคดีที่อ้างในหัวเรื่องและเนื้อความ เป็นสำนวนเดียวกันทั้งฉบับ */
const CASE_NO: FieldLink = { kind: 'refNo', after: /สำนวนคดี(?:เลขที่|เรื่องที่)\s*$/, id: 'caseNo', label: 'เลขสำนวนคดี' }
/** ชื่อพยานผู้ได้รับความคุ้มครองที่อ้างแบบ "พยานราย/พยานชื่อ" */
const WITNESS: FieldLink = { kind: 'person', after: /พยาน(?:ราย|ชื่อ)\s*$/, id: 'witnessName', label: 'ชื่อพยาน' }

const letterFooter = (base: number): FieldDef[] => [
  { id: 'ownerUnit', label: 'ส่วนราชการเจ้าของเรื่อง', group: CONTACT, at: [{ b: String(base), text: 'กองอำนวยการต่อต้านการทุจริต' }] },
  { id: 'ownerPhone', label: 'โทรศัพท์', group: CONTACT, at: [{ b: String(base + 1), text: 'โทร. ๐-๒๕๐๒-๖๖๗๐ ต่อ ๔๒๒๒' }] },
  { id: 'ownerFax', label: 'โทรสาร', group: CONTACT, at: [{ b: String(base + 2), text: 'โทรสาร ๐-๒๕๐๒-๖๙๔๓' }] },
]

export const FIELD_SPECS: Record<string, FieldSpec> = {
  'chairman-signature': {
    links: [CASE_NO, WITNESS],
    fields: [
      { id: 'recipient2', label: 'เรียน (ส่วนเสนอต่อ)', group: 'ส่วนเสนอประธานกรรมการ', at: [{ b: '13', text: 'ประธานกรรมการ ป.ป.ท.' }] },
    ],
  },
  'case-owner-notice': {
    // หัวบันทึกข้อความพิมพ์ไว้ในหัวกระดาษ ข้อความในย่อหน้าแรกวางทับเส้นจุดของหัวบันทึก
    links: [CASE_NO, WITNESS],
    fields: [
      { id: 'department', label: 'ส่วนราชการ', group: HEAD, at: [{ b: '0', text: 'กอท. กลุ่มงานอำนวยการด้านคุ้มครองพยาน    โทร. 42๒๒' }] },
      { id: 'docNo', label: 'ที่', group: HEAD, at: [{ b: '1', text: 'ปป ๐๐๑2/' }] },
      { id: 'date', label: 'วันที่', group: HEAD, at: [{ b: '1', text: 'สิงหาคม  ๒๕6๖' }] },
      { id: 'subject', label: 'เรื่อง', group: HEAD, at: [{ b: '2', text: 'แจ้งผลการพิจารณากรณีพยานขอให้คุ้มครอง' }] },
    ],
  },
  'board-proposal': { links: [CASE_NO, WITNESS] },
  'extension-memo': { links: [CASE_NO, WITNESS] },
  'witness-extension-notice': {
    links: [CASE_NO],
    fields: [
      { id: 'recipient', label: 'เรียน (ชื่อพยาน)', group: HEAD, at: [{ b: '8', text: 'นาย.........................................' }] },
      { id: 'endDate', label: 'คุ้มครองถึงวันที่', group: 'เนื้อความ', at: [{ b: '11', text: '๓๑ กรกฎาคม ๒๕๖6' }] },
      ...letterFooter(24),
      { id: 'coordinator', label: 'ชื่อผู้ประสานงาน', group: CONTACT, at: [{ b: '27', text: '(...................................)' }] },
    ],
  },
  'police-extension-request': {
    links: [CASE_NO, WITNESS],
    fields: [
      { id: 'enclosureNo', label: 'สิ่งที่ส่งมาด้วย · เลขที่หนังสือ', group: HEAD, at: [{ b: '10', text: 'ปป ๐๐๑๒/         ' }] },
      { id: 'enclosureDate', label: 'สิ่งที่ส่งมาด้วย · ลงวันที่', group: HEAD, at: [{ b: '10', text: '     เมษายน ๒๕๖6' }] },
      ...letterFooter(22),
      { id: 'coordinator', label: 'ชื่อผู้ประสานงาน', group: CONTACT, at: [{ b: '25', text: '(.....................................)' }] },
    ],
  },
  'extension-expense': { links: [CASE_NO, WITNESS] },
}
