import type { RelatedPerson } from '../types/case'
import type { SignatureRecord } from '../components/forms/paper/PaperPrimitives'

/**
 * ลงลายมือชื่อยินยอมของผู้ขอคุ้มครองใน คบ.1 ผ่านลิงก์ (Prototype ตามข้อเสนอในที่ประชุม — ยังไม่ยืนยันสำหรับระบบจริง)
 *
 * หลักการ:
 * - ลิงก์หนึ่งผูกกับ "เอกสารฉบับเดียว" (snapshot ของ คบ.1 ณ เวลาที่ส่ง) ไม่ใช่ผูกกับแฟ้มทั้งแฟ้ม
 *   หน้าฝั่งผู้ขอคุ้มครองจึงอ่านเฉพาะ snapshot นี้ ไม่เปิดสำนวนหรือข้อมูลพยานรายอื่น
 * - ลายมือชื่อที่ได้ ใช้กับฉบับที่ลงชื่อเท่านั้น ถ้าเนื้อหา คบ.1 เปลี่ยนหลังลงชื่อ ต้องขอให้ลงชื่อฉบับใหม่
 *   ห้ามนำลายมือชื่อเดิมไปแสดงบนฉบับใหม่อัตโนมัติ
 * - ไม่มีการส่ง SMS/อีเมลจริง และลายมือชื่อจำลองไม่มีผลทางกฎหมาย
 */

/** ช่องทางส่งลิงก์ใน Prototype — ไม่มีการส่ง SMS/อีเมลจากระบบ */
export type ConsentChannel = 'manual' | 'qr'
export type ConsentRequestStatus = 'pending' | 'signed' | 'expired' | 'cancelled'
/** สถานะที่แสดงฝั่งเจ้าของสำนวน — รวม "ยังไม่ส่ง" ซึ่งไม่มีคำขอในระบบ */
export type ConsentDisplayStatus = 'not_sent' | ConsentRequestStatus

export const CONSENT_CHANNEL_LABELS: Record<ConsentChannel, string> = {
  manual: 'คัดลอกลิงก์ส่งเอง',
  qr: 'สแกน QR Code',
}

export const CONSENT_STATUS_META: Record<ConsentDisplayStatus, { label: string; tone: string; icon: string }> = {
  not_sent: { label: 'ยังไม่ส่ง', tone: 'bg-slate-100 text-slate-700 border-slate-300', icon: 'fa-circle-minus' },
  pending: { label: 'รอลงชื่อ', tone: 'bg-amber-50 text-amber-800 border-amber-300', icon: 'fa-hourglass-half' },
  signed: { label: 'ลงชื่อแล้ว', tone: 'bg-emerald-50 text-emerald-800 border-emerald-300', icon: 'fa-circle-check' },
  expired: { label: 'ลิงก์หมดอายุ', tone: 'bg-rose-50 text-rose-800 border-rose-300', icon: 'fa-clock' },
  cancelled: { label: 'ยกเลิก', tone: 'bg-slate-100 text-slate-600 border-slate-300', icon: 'fa-ban' },
}

/** อายุลิงก์ที่ให้เลือกใน Prototype — อายุจริงต้องยืนยันก่อนใช้งาน */
export const CONSENT_EXPIRY_OPTIONS: Array<{ hours: number; label: string }> = [
  { hours: 24, label: '24 ชั่วโมง' },
  { hours: 72, label: '3 วัน' },
  { hours: 168, label: '7 วัน' },
]
export const DEFAULT_CONSENT_EXPIRY_HOURS = 72


/** ช่องของ คบ.1 ที่ไม่ใช่ข้อความที่ผู้ขอคุ้มครองยินยอม (ข้อมูลช่องลงนามของเจ้าพนักงานเอง) */
const NON_CONTENT_FIELDS = new Set(['ตำแหน่งเจ้าพนักงาน'])

/** เอกสารฉบับที่ส่งให้ลงชื่อ — เก็บเท่าที่หน้ากระดาษ คบ.1 ต้องใช้ */
export interface ConsentDocumentSnapshot {
  draft: Record<string, any>
  relatedPersons: RelatedPerson[]
  /** ข้อมูลสำรองของหัวกระดาษที่ คบ.1 ดึงจากแฟ้ม (ชื่อผู้ยื่น / เลขเรื่องที่เกี่ยวข้อง / เจ้าพนักงาน) */
  fallback: { person?: string; mainCaseNo?: string; assignedOfficer?: string }
  /** ลายมือชื่อเจ้าพนักงาน ณ เวลาที่ส่ง (ถ้ามี) — แยกจากลายมือชื่อผู้ขอคุ้มครองโดยสิ้นเชิง */
  officerSign?: SignatureRecord
}

export interface ConsentRecipient {
  name: string
  phone?: string
  email?: string
}

export interface ConsentRequest {
  token: string
  caseNo: string
  /** ฉบับที่ของเอกสารในแฟ้มนี้ (นับเพิ่มเมื่อเนื้อหาเปลี่ยน) */
  version: number
  /** รหัสตรวจเนื้อหา — ใช้เทียบว่าเอกสารปัจจุบันยังเป็นฉบับเดียวกับที่ลงชื่อหรือไม่ */
  fingerprint: string
  snapshot: ConsentDocumentSnapshot
  recipient: ConsentRecipient
  channel: ConsentChannel
  createdAt: string
  createdBy: string
  expiresAt: string
  status: ConsentRequestStatus
  verifiedAt?: string
  signedAt?: string
  signerName?: string
  signatureImage?: string
  cancelledAt?: string
  cancelledBy?: string
  cancelReason?: string
  expiredAt?: string
  /** token ของลิงก์ที่ออกแทน (กรณียกเลิกแล้วออกลิงก์ใหม่) */
  replacedBy?: string
}

export type ConsentEventType = 'sent' | 'reissued' | 'cancelled' | 'expired' | 'opened' | 'verified' | 'signed'

export interface ConsentEvent {
  id: string
  caseNo: string
  token: string
  version: number
  type: ConsentEventType
  at: string
  actor: string
  detail?: string
}

export const CONSENT_EVENT_LABELS: Record<ConsentEventType, string> = {
  sent: 'ส่งลิงก์ให้ลงชื่อ',
  reissued: 'ออกลิงก์ใหม่',
  cancelled: 'ยกเลิกลิงก์',
  expired: 'ลิงก์หมดอายุ',
  opened: 'ผู้ขอคุ้มครองเปิดลิงก์',
  /** เหตุการณ์จากรุ่นก่อนที่มีขั้นยืนยันตัวตนจำลอง (คงไว้ให้อ่านประวัติเดิมได้) */
  verified: 'ยืนยันตัวตน (จำลอง)',
  signed: 'ผู้ขอคุ้มครองลงชื่อ',
}

/** stringify แบบเรียง key คงที่ — ให้ fingerprint ไม่เปลี่ยนตามลำดับการกรอก */
const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/** เนื้อหาที่ผู้ขอคุ้มครองยินยอม: ทุกช่องของ คบ.1 + บุคคลที่เกี่ยวข้อง (ไม่รวมช่องว่างและข้อมูลช่องลงนามเจ้าพนักงาน) */
export const consentContent = (draft: Record<string, any>, relatedPersons: RelatedPerson[]) => {
  const fields = Object.fromEntries(
    Object.entries(draft || {}).filter(
      ([k, v]) => !NON_CONTENT_FIELDS.has(k) && v !== undefined && v !== null && String(v).trim() !== '' && !(Array.isArray(v) && v.length === 0)
    )
  )
  const persons = (relatedPersons || []).map((p) => ({
    title: p.title,
    firstName: p.firstName,
    lastName: p.lastName,
    citizenId: p.citizenId,
    relation: p.relation,
    risk: p.risk,
  }))
  return { fields, persons }
}

/** รหัสตรวจเนื้อหาแบบสั้น (FNV-1a 32 บิต) — พอสำหรับเทียบความเปลี่ยนแปลงใน Prototype ไม่ใช่หลักฐานทางเทคนิค */
export const consentFingerprint = (draft: Record<string, any>, relatedPersons: RelatedPerson[]): string => {
  const text = stableStringify(consentContent(draft, relatedPersons))
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase()
}

/** สถานะจริง ณ เวลานี้ — ลิงก์ที่รอลงชื่อแต่เลยกำหนดถือว่าหมดอายุ แม้ยังไม่ถูกบันทึกเหตุการณ์ */
export const effectiveStatus = (req: ConsentRequest, now: number = Date.now()): ConsentRequestStatus =>
  req.status === 'pending' && Date.parse(req.expiresAt) <= now ? 'expired' : req.status

/** คำขอล่าสุดของแฟ้ม (ตามเวลาที่ส่ง) */
export const latestRequestFor = (requests: Record<string, ConsentRequest>, caseNo: string): ConsentRequest | undefined =>
  Object.values(requests)
    .filter((r) => r.caseNo === caseNo)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]

/** คำขอที่ลงชื่อแล้วล่าสุดของแฟ้ม — ใช้ตรวจว่าเอกสารปัจจุบันยังเป็นฉบับที่ลงชื่อหรือไม่ */
export const latestSignedFor = (requests: Record<string, ConsentRequest>, caseNo: string): ConsentRequest | undefined =>
  Object.values(requests)
    .filter((r) => r.caseNo === caseNo && r.status === 'signed')
    .sort((a, b) => Date.parse(b.signedAt || b.createdAt) - Date.parse(a.signedAt || a.createdAt))[0]

/**
 * ลายมือชื่อผู้ขอคุ้มครองที่ใช้ได้กับเอกสารฉบับปัจจุบัน
 * — ใช้ได้เฉพาะเมื่อฉบับที่ลงชื่อมี fingerprint ตรงกับเนื้อหาปัจจุบัน
 */
export const applicantSignatureFor = (
  requests: Record<string, ConsentRequest>,
  caseNo: string,
  currentFingerprint: string
): SignatureRecord | undefined => {
  const signed = latestSignedFor(requests, caseNo)
  if (!signed || signed.fingerprint !== currentFingerprint) return undefined
  return toSignatureRecord(signed)
}

export const toSignatureRecord = (req: ConsentRequest): SignatureRecord | undefined =>
  req.status === 'signed' && req.signedAt
    ? {
        signed: true,
        signerName: req.signerName || req.recipient.name,
        signedAt: formatConsentDateTime(req.signedAt),
        signatureImage: req.signatureImage,
        note: `ลงชื่ออิเล็กทรอนิกส์ผ่านลิงก์ ${formatConsentDateTime(req.signedAt)} · คบ.1 ฉบับที่ ${req.version} (สาธิต)`,
      }
    : undefined

/** วันเวลาแบบไทย พ.ศ. เช่น 07/10/2569 18:30 น. */
export const formatConsentDateTime = (iso?: string): string => {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())} น.`
}

/** ปกปิดช่องทางติดต่อบางส่วน เช่น 081-xxx-5678 / so***@mail.com */
export const maskPhone = (phone?: string): string => {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length < 4) return phone || '-'
  return `${digits.slice(0, 3)}-xxx-${digits.slice(-4)}`
}

export const maskEmail = (email?: string): string => {
  if (!email || !email.includes('@')) return email || '-'
  const [user, domain] = email.split('@')
  return `${user.slice(0, 2)}***@${domain}`
}

export const recipientAddress = (req: Pick<ConsentRequest, 'channel'>): string =>
  req.channel === 'qr' ? 'ผู้ขอคุ้มครองสแกน QR Code จากหน้าจอเจ้าหน้าที่' : 'เจ้าหน้าที่คัดลอกลิงก์ไปส่งเอง'

export const consentLinkUrl = (token: string, origin: string = typeof window !== 'undefined' ? window.location.origin : '') =>
  `${origin}/sign/consent/${token}`

/** ชื่อผู้ยื่นคำร้องจากร่าง คบ.1 (ข้อ 1) */
export const applicantNameFromDraft = (draft: Record<string, any>, fallback = ''): string => {
  const name = `${draft?.['คำนำหน้า'] || ''}${draft?.['ชื่อ'] || ''} ${draft?.['นามสกุล'] || ''}`.trim()
  return name || fallback
}
