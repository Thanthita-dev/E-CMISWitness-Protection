import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** dd/mm/yyyy (อาจมีเวลา) — ปีอาจเป็น พ.ศ. (> 2400) หรือ ค.ศ. */
const SLASH_DATE = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?\s*$/

const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

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
  const seq = String(currentCount + 1).padStart(6, '0')
  return `WP-${year}-${seq}`
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

export function getCaseFormNumbers(caseItem: {
  form: string
  urgent?: boolean
  urgency?: string
  urgencyAssessedAt?: string
  extraForms?: number[]
  preliminaryDecision?: { formNo: 9 | 10 }
  resultNotices?: Partial<Record<9 | 10, { original?: unknown }>>
  fastTrack?: { step?: string }
}): number[] {
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
  const extraForms = (caseItem.extraForms || []).filter(
    (n) => !(assessedNormal && FAST_TRACK_FORM_NUMBERS.includes(n))
  )
  const attachedForms = [
    caseItem.form === 'คบ.2' ? 2 : 1,
    ...(caseItem.form === 'คบ.2' ? [1] : []),
    3,
    ...(urgencyAssessed ? (caseItem.urgent ? FAST_TRACK_FORM_NUMBERS : [6]) : []),
    /** WIT0614 (TC-019) — ผอ. ตัดสินคุ้มครองชั่วคราวแล้ว คำร้องหลักเดินแท็บ 05 ต่อ จึงต้องมี คบ.6 ในแฟ้ม */
    ...(caseItem.urgent && ['approved', 'active', 'denied'].includes(caseItem.fastTrack?.step ?? '') ? [6] : []),
    ...extraForms,
  ]
  const selected = caseItem.preliminaryDecision?.formNo
  const finalized = Boolean(caseItem.resultNotices?.[9]?.original || caseItem.resultNotices?.[10]?.original)
  const visible = selected && !finalized ? [...attachedForms.filter((no) => no !== 9 && no !== 10), selected] : attachedForms
  return Array.from(new Set(visible)).sort((a, b) => a - b)
}

export function thaiMonthName(period: string): string {
  const [m, y] = period.split('/')
  const idx = Number(m) - 1
  return THAI_MONTHS[idx] ? `${THAI_MONTHS[idx]} ${y}` : period
}
