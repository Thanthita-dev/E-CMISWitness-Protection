import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** dd/mm/yyyy (อาจมีเวลา) — ปีอาจเป็น พ.ศ. (> 2400) หรือ ค.ศ. */
const SLASH_DATE = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?\s*$/

export const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/**
 * วัน / เดือน / ปี พ.ศ. ที่กรอกแยกช่องตามแบบราชการ → yyyy-mm-dd (ค.ศ.)
 * เดือนรับได้ทั้งชื่อเต็ม ตัวย่อ หรือตัวเลข · อ่านไม่ออกหรือไม่ใช่วันที่จริงคืนสตริงว่าง
 */
export function isoFromThaiParts(day?: unknown, month?: unknown, beYear?: unknown): string {
  const d = Number(String(day ?? '').trim())
  const y = Number(String(beYear ?? '').trim()) - 543
  const m = String(month ?? '').trim().replace(/\s+/g, '')
  const monthNo = /^\d{1,2}$/.test(m)
    ? Number(m)
    : THAI_MONTHS.indexOf(m) + 1 || THAI_MONTHS_SHORT.indexOf(m.endsWith('.') ? m : `${m}.`) + 1
  if (!Number.isInteger(d) || !Number.isInteger(y) || y < 1900 || monthNo < 1 || monthNo > 12) return ''
  const date = new Date(y, monthNo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== monthNo - 1 || date.getDate() !== d) return ''
  return toIsoDate(date)
}

/** yyyy-mm-dd (ค.ศ.) → วัน / ชื่อเดือนเต็ม / ปี พ.ศ. สำหรับเขียนกลับลงช่องแบบราชการ */
export function thaiPartsFromIso(iso: string): { day: string; month: string; year: string } | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return { day: String(Number(m[3])), month: THAI_MONTHS[Number(m[2]) - 1], year: String(Number(m[1]) + 543) }
}

/** "4 สิงหาคม 2569" (อาจมีเวลา "09:15" หรือ "09.15 น.") — ข้อความวันที่แบบราชการในข้อมูลตั้งต้นเดิม */
const THAI_LONG_DATE = new RegExp(
  `^\\s*(\\d{1,2})\\s+(${THAI_MONTHS.join('|')})\\s+(\\d{4})(?:\\s+(\\d{1,2})[:.](\\d{2})(?:\\s*น\\.?)?)?\\s*$`,
)

/**
 * แปลงสตริงวันที่เป็น Date — รองรับ ISO, dd/mm/yyyy พ.ศ. (ปี > 2400), dd/mm/yyyy ค.ศ.
 * และ "วัน ชื่อเดือนเต็ม ปี" แบบราชการ (dd/mm/yyyy ตีความเป็น วัน/เดือน เสมอ ไม่ใช่ เดือน/วัน แบบ US)
 */
function parseDateString(value: string): Date | null {
  const thai = value.match(THAI_LONG_DATE)
  const m = value.match(SLASH_DATE) ||
    (thai && [thai[0], thai[1], String(THAI_MONTHS.indexOf(thai[2]) + 1), thai[3], thai[4], thai[5]])
  if (m) {
    const [, d, mo, y, hh, mm] = m
    const ce = Number(y) > 2400 ? Number(y) - 543 : Number(y)
    const date = new Date(ce, Number(mo) - 1, Number(d), Number(hh || 0), Number(mm || 0))
    if (isNaN(date.getTime()) || date.getDate() !== Number(d)) return null
    return date
  }
  const parsed = new Date(value)
  return isNaN(parsed.getTime()) ? null : parsed
}

export function formatThaiDate(dateString?: string | Date): string {
  if (!dateString) return '-'
  if (typeof dateString === 'string') {
    // dd/mm/yyyy พ.ศ. อยู่ในรูปแบบแสดงผลอยู่แล้ว — ไม่ parse ซ้ำ (กันปีเพี้ยนเป็น 3112)
    const m = dateString.match(SLASH_DATE)
    if (m && Number(m[3]) > 2400) return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`
  }
  const date = typeof dateString === 'string' ? parseDateString(dateString) : dateString
  if (!date || isNaN(date.getTime())) return String(dateString)

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear() + 543

  return `${day}/${month}/${year}`
}

/** แปลงค่าวันที่ (ISO หรือ dd/mm/yyyy พ.ศ./ค.ศ.) เป็น yyyy-mm-dd (ค.ศ.) สำหรับ <input type="date"> — ไม่ใช่วันที่ให้คืนสตริงว่าง */
export function toIsoDate(value?: string | Date): string {
  if (!value) return ''
  const date = typeof value === 'string' ? parseDateString(value) : value
  if (!date || isNaN(date.getTime())) return ''
  const y = String(date.getFullYear()).padStart(4, '0')
  return `${y}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** แปลงค่าวันเวลาเป็น yyyy-mm-ddThh:mm (เวลาท้องถิ่น) สำหรับ <input type="datetime-local"> — ไม่ใช่วันที่ให้คืนสตริงว่าง */
export function toIsoDateTimeLocal(value?: string | Date): string {
  const date = parseAnyDate(value)
  if (!date) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${toIsoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatThaiDateTime(dateString?: string | Date): string {
  if (!dateString) return '-'
  const date = typeof dateString === 'string' ? parseDateString(dateString) : dateString
  if (!date || isNaN(date.getTime())) return String(dateString)

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear() + 543
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${day}/${month}/${year} ${hours}:${minutes}`
}

export function nowDisplay(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function generateNextCaseNo(currentCount: number): string {
  const year = new Date().getFullYear() + 543
  const seq = String(currentCount + 1).padStart(4, '0')
  return `${seq}/${year}`
}

/** Sequence part of a case number `NNNN/YYYY` (e.g. `0501/2569` -> `0501`). */
export function caseNoSeq(no: string): string {
  return no.split('/')[0] || ''
}

/** Case number made safe for file names (`/` is illegal). */
export function caseNoFileSafe(no: string): string {
  return no.replace(/[\\/]/g, '-')
}

/** Parse an ISO date/datetime or a Thai display string (dd/mm/พ.ศ. [hh:mm]) into a Date. */
export function parseAnyDate(value?: string | Date): Date | null {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  return parseDateString(value)
}

export function addDays(value: string | Date, days: number): string {
  const base = parseAnyDate(value) || new Date()
  const next = new Date(base.getTime())
  next.setDate(next.getDate() + days)
  return next.toISOString()
}

/** Whole days from `from` until `to` (negative when `to` is in the past). */
export function daysUntil(to?: string | Date, from?: string | Date): number | null {
  const target = parseAnyDate(to)
  if (!target) return null
  const base = parseAnyDate(from) || new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((startOfDay(target) - startOfDay(base)) / 86400000)
}

export function daysElapsed(since?: string | Date, until?: string | Date): number | null {
  const start = parseAnyDate(since)
  if (!start) return null
  const end = parseAnyDate(until) || new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((startOfDay(end) - startOfDay(start)) / 86400000)
}

/** Current Buddhist-era month period key used by the คบ.13 monthly report cycle. */
export function currentReportPeriod(base?: string | Date): string {
  const d = parseAnyDate(base) || new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`
}

/** Short random token for prototype signing links (no backend, so no real security guarantee). */
export function generateToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '')
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/**
 * แบบ คบ. ทั้งหมดของสำนวนนี้ — ที่มาเดียวกับส่วน "แบบฟอร์ม คบ. ในแฟ้มนี้" ในหน้าแฟ้ม
 * ใช้ร่วมกันเพื่อให้ FileManager สร้างโฟลเดอร์ครบทุกแบบของสำนวน ไม่ใช่แค่แบบที่มีไฟล์แนบแล้ว
 */
/** แบบฟอร์มเฉพาะเส้นทางเร่งด่วน (Fast Track) — คบ.4 บันทึกขอคุ้มครองชั่วคราว / คบ.5 คำสั่งคุ้มครองชั่วคราว */
export const FAST_TRACK_FORM_NUMBERS = [4, 5]

/** เลขแบบ คบ. จากรหัสหมวดเอกสารของระบบเดิม เช่น 'KB01' → 1 (ไม่ตรงรูปแบบ → undefined) */
export function legacyFormNo(docCategory?: string): number | undefined {
  const m = docCategory?.match(/^KB0*(\d+)$/i)
  return m ? Number(m[1]) : undefined
}

/**
 * รับเป็นคำร้องดิบ (ยังไม่เป็นแบบ คบ.) และ ผอ. ยังไม่มอบหมายเจ้าของสำนวน — แฟ้มยังไม่มีแบบ คบ. ให้ทำ
 * จึงซ่อนส่วนแบบฟอร์ม คบ. และโฟลเดอร์ คบ. ในเอกสารแฟ้มทุกบทบาท · เรื่องที่รับเป็น คบ.1/คบ.2 มาแต่แรกแสดงตามปกติ
 */
export function isPetitionAwaitingAssignment(caseItem: { form: string; stage?: string; legacySource?: unknown }): boolean {
  return (
    !caseItem.legacySource &&
    caseItem.form === 'คำร้อง' &&
    ['receiver_intake', 'officer_intake', 'director_assign'].includes(caseItem.stage ?? '')
  )
}

export function getCaseFormNumbers(caseItem: {
  form: string
  terminationRequest?: unknown
  legacySource?: { migratedFiles?: Array<{ docCategory?: string }> } | null
  stage?: string
  kb3Skipped?: boolean
  urgent?: boolean
  urgency?: string
  urgencyAssessedAt?: string
  extraForms?: number[]
  kb6SecretarySignedAt?: string
  kb6SecretaryOpinionChoice?: string
  preliminaryDecision?: { formNo: 9 | 10 }
  resultNotices?: Partial<Record<9 | 10, { original?: unknown }>>
  fastTrack?: { step?: string }
}): number[] {
  /**
   * เรื่องที่ย้ายมาจากระบบเดิม — มีเฉพาะแบบที่ถ่ายโอนมาจริง (จากหมวดเอกสารของไฟล์) ไม่เติม คบ.3/คบ.6 ตามขั้นตอน
   * ถ้าไม่มีไฟล์ที่ระบุหมวดได้ ใช้แบบที่ใช้รับเรื่องอย่างเดียว
   */
  if (caseItem.legacySource) {
    const fromFiles = (caseItem.legacySource.migratedFiles || [])
      .map((f) => legacyFormNo(f.docCategory))
      .filter((n): n is number => typeof n === 'number')
    return Array.from(new Set(fromFiles.length ? fromFiles : [caseItem.form === 'คบ.2' ? 2 : 1])).sort((a, b) => a - b)
  }
  /**
   * TC-005 — ก่อนประเมินความเร่งด่วน ยังตัดสินเส้นทางไม่ได้ จึงห้ามเติม คบ.4/คบ.5/คบ.6 เข้ารายการ
   * ล่วงหน้า (เดิมสันนิษฐานว่า "กรณีปกติ" ไปก่อนแล้วเปิด คบ.6 ให้กดได้ ทั้งที่ยังไม่มีผลประเมิน)
   */
  const urgencyAssessed = Boolean(caseItem.urgencyAssessedAt) || Boolean(caseItem.urgency)
  /**
   * WIT0410-0411 — ผลประเมิน "กรณีปกติ" ไปเส้นทาง คบ.6 เท่านั้น จึงซ่อน คบ.4/คบ.5 ที่เคยแนบเพิ่มไว้ในแฟ้ม
   * (ข้อมูลที่กรอกไว้ยังเก็บในระบบ ไม่ถูกลบ — เหมือนกรณีแก้ผลจากเร่งด่วนเป็นปกติ)
   */
  const assessedNormal = urgencyAssessed && !caseItem.urgent
  /**
   * ลำดับงาน คบ.1 → เชื่อมโยงคดีหลัก → กลั่นกรอง → คบ.3 — แถว คบ.3 เข้าแฟ้มหลังกลั่นกรองแล้วเท่านั้น
   * ก่อนหน้านั้นทุกบทบาท (รวม ผอ. ก่อนมอบหมาย) เห็นเฉพาะแบบที่ใช้รับเรื่อง · แฟ้มที่พ้นขั้นเจ้าของสำนวนแล้วมี คบ.3 เสมอ
   */
  const beforeScreening = ['receiver_intake', 'officer_intake', 'director_assign', 'staff_review'].includes(caseItem.stage ?? '')
  const showKb3 = urgencyAssessed || Boolean(caseItem.kb3Skipped) || !beforeScreening
  /** รับเรื่องเป็น คบ.2 — คบ.1 เป็นงานของเจ้าของสำนวน จึงเข้ารายการหลัง ผอ. มอบหมายแล้ว (ก่อนนั้นมีเพียง คบ.2) */
  const beforeAssignment = ['receiver_intake', 'officer_intake', 'director_assign'].includes(caseItem.stage ?? '')
  const extraForms = (caseItem.extraForms || []).filter(
    (n) => !(assessedNormal && FAST_TRACK_FORM_NUMBERS.includes(n))
  )
  const attachedForms = [
    caseItem.form === 'คบ.2' ? 2 : 1,
    ...(caseItem.form === 'คบ.2' && !beforeAssignment ? [1] : []),
    ...(showKb3 ? [3] : []),
    ...(urgencyAssessed ? (caseItem.urgent ? FAST_TRACK_FORM_NUMBERS : [6]) : []),
    /** WIT0614 (TC-019) — ผอ. ตัดสินคุ้มครองชั่วคราวแล้ว คำร้องหลักเดินแท็บ 05 ต่อ จึงต้องมี คบ.6 ในแฟ้ม */
    ...(caseItem.urgent && ['approved', 'active', 'denied'].includes(caseItem.fastTrack?.step ?? '') ? [6] : []),
    ...extraForms,
    ...(caseItem.terminationRequest ? [7, 15, 16, 17] : []),
  ]
  const selected = caseItem.preliminaryDecision?.formNo || (caseItem.kb6SecretarySignedAt && caseItem.kb6SecretaryOpinionChoice ? caseItem.kb6SecretaryOpinionChoice === 'agree' ? 9 : 10 : undefined)
  const finalized = Boolean(caseItem.resultNotices?.[9]?.original || caseItem.resultNotices?.[10]?.original)
  const finalForm = caseItem.resultNotices?.[9]?.original ? 9 : caseItem.resultNotices?.[10]?.original ? 10 : undefined
  const activeNotice = finalForm || selected
  const preparedForms = !activeNotice && !finalized && attachedForms.includes(6) ? [...attachedForms, 9, 10] : attachedForms
  const visible = activeNotice ? [...preparedForms.filter((no) => no !== 9 && no !== 10), activeNotice] : preparedForms
  return Array.from(new Set(visible)).sort((a, b) => a - b)
}

export function thaiMonthName(period: string): string {
  const [m, y] = period.split('/')
  const idx = Number(m) - 1
  return THAI_MONTHS[idx] ? `${THAI_MONTHS[idx]} ${y}` : period
}
