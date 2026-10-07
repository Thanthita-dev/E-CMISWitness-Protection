import {
  CaseItem,
  ProtectionEpisode,
  MethodPrivacy,
  MethodSite,
  ProtectionMethodNo,
  ProtectionMethodTrack,
  ProtectionPhase,
  ProtectionPhaseKind,
} from '../types/case'
import { PROTECTION_TOTAL_CAP_DAYS } from './constants'
import { addProtectionMonths, calendarDays } from './protectionMonths'
import { daysElapsed, parseAnyDate } from './utils'

/**
 * Episode / Phase — flow หน้า 08A-1 (notea1), 10 (WIT1001-1003), 11A (WIT1103), 11B (WIT1116)
 *
 * กฎหลักสามข้อที่โมดูลนี้บังคับใช้:
 *  1) TEMPORARY (คบ.5) และ MAIN (ผลอนุมัติคำร้องหลัก) อยู่ใน Episode เดียวกัน
 *  2) วันสะสมนับต่อเนื่องข้าม Phase — การเปลี่ยน Phase ไม่รีเซ็ตยอด
 *  3) ยอดสะสมรวมต้องไม่เกิน PROTECTION_TOTAL_CAP_DAYS (180 วัน / 6 เดือน)
 *
 * ทุกฟังก์ชันคิดจาก "วันเริ่มจริง" ของแต่ละ Phase เท่านั้น ไม่ใช้วันอัปโหลดเอกสาร
 */

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

export const newEpisodeId = () => `EP-${Date.now()}`

/** สร้าง Episode ใหม่พร้อม Phase แรก */
export function openEpisode(
  kind: ProtectionPhaseKind,
  startedAt: string,
  orderRef?: string,
  note?: string
): ProtectionEpisode {
  return {
    id: newEpisodeId(),
    openedAt: startedAt,
    phases: [{ id: `PH-${Date.now()}`, kind, startedAt, orderRef, note }],
  }
}

/**
 * เปลี่ยน Phase ต่อเนื่องใน Episode เดิม (WIT0821 / a1status_main)
 * ปิด Phase ปัจจุบันด้วยวันเริ่มของ Phase ใหม่ เพื่อไม่ให้ช่วงเวลาซ้อนกันและไม่เกิดช่องว่าง
 */
export function switchPhase(
  episode: ProtectionEpisode,
  kind: ProtectionPhaseKind,
  startedAt: string,
  orderRef?: string
): ProtectionEpisode {
  const phases = episode.phases.map((p, i) =>
    i === episode.phases.length - 1 && !p.endedAt ? { ...p, endedAt: startedAt } : p
  )
  return {
    ...episode,
    phases: [...phases, { id: `PH-${Date.now()}`, kind, startedAt, orderRef }],
  }
}

/** ปิด Episode ทั้งก้อน ณ วันที่มีผล (คบ.16 effectiveAt หรือวันส่งมอบตามข้อ 14) */
export function closeEpisode(episode: ProtectionEpisode, closedAt: string, closeReason: string): ProtectionEpisode {
  return {
    ...episode,
    closedAt,
    closeReason,
    phases: episode.phases.map((p) => (p.endedAt ? p : { ...p, endedAt: closedAt })),
  }
}

/**
 * จำนวนวันของ Phase หนึ่ง
 *
 * Phase ที่ยังเปิดอยู่นับถึงวันนี้แบบรวมวันเริ่ม (เริ่มและจบวันเดียวกัน = 1 วัน)
 * Phase ที่ปิดแล้วนับแบบ [วันเริ่ม, วันสิ้นสุด) คือไม่รวมวันสิ้นสุด เพราะวันนั้น
 * เป็นวันเริ่มของ Phase ถัดไป — ถ้านับรวมทั้งสองฝั่ง วันคาบเกี่ยวจะถูกนับซ้ำ
 * และยอดสะสมจะเกินความจริงหนึ่งวันต่อการเปลี่ยน Phase หนึ่งครั้ง
 */
export function phaseDays(phase: ProtectionPhase, asOf?: string | Date): number {
  const start = parseAnyDate(phase.startedAt)
  if (!start) return 0
  const closed = Boolean(phase.endedAt)
  const end = parseAnyDate(phase.endedAt) || parseAnyDate(asOf) || new Date()
  const diff = Math.round((startOfDay(end) - startOfDay(start)) / 86400000)
  if (diff < 0) return 0
  return closed ? diff : diff + 1
}

/** ยอดวันสะสมต่อเนื่องของทั้ง Episode (ไม่รีเซ็ตเมื่อเปลี่ยน Phase) */
export function cumulativeDays(episode?: ProtectionEpisode, asOf?: string | Date): number {
  if (!episode) return 0
  return episode.phases.reduce((sum, p) => sum + phaseDays(p, asOf), 0)
}

/** Six calendar months from the original start, never a fixed 180-day threshold. */
export function episodeCapDays(episode?: ProtectionEpisode): number {
  const start = episode?.phases[0]?.startedAt
  return start ? calendarDays(start, addProtectionMonths(start, 6)) : PROTECTION_TOTAL_CAP_DAYS
}

const quotaDays = (episode?: ProtectionEpisode, asOf?: string | Date) => Math.max(0, cumulativeDays(episode, asOf) - (episode?.phases.at(-1)?.endedAt ? 0 : 1))

/** วันคงเหลือก่อนชนเพดานรวม */
export function remainingDays(episode?: ProtectionEpisode, asOf?: string | Date): number {
  return Math.max(0, episodeCapDays(episode) - quotaDays(episode, asOf))
}

/** ถึงหรือเกินเพดานแล้วหรือยัง — ใช้กัน คบ.14 (WIT1150) และเปิดเส้นทางข้อ 14 (WIT1149) */
export function isAtCap(episode?: ProtectionEpisode, asOf?: string | Date): boolean {
  return quotaDays(episode, asOf) >= episodeCapDays(episode)
}

export function currentPhase(episode?: ProtectionEpisode): ProtectionPhase | undefined {
  if (!episode || episode.phases.length === 0) return undefined
  return episode.phases[episode.phases.length - 1]
}

export function currentPhaseKind(episode?: ProtectionEpisode): ProtectionPhaseKind | undefined {
  return currentPhase(episode)?.kind
}

export interface ExtensionCheck {
  allowed: boolean
  /** จำนวนวันสูงสุดที่ขยายได้โดยไม่ชนเพดาน */
  maxDays: number
  cumulative: number
  remaining: number
  reason?: string
}

/**
 * ตรวจคำขอขยายเวลาเทียบเพดานรวม (WIT1116 / WIT1150)
 * ขยายได้เท่าที่เหลือเท่านั้น — ถึงเพดานแล้วห้ามจัดทำ คบ.14 เพิ่ม ให้ไปเส้นทางข้อ 14 แทน
 */
/**
 * แกนกลางของการตรวจเพดานรวม — ใช้ร่วมกันทุกเส้นทางที่กินโควตาวันคุ้มครองเดียวกัน
 * คณิตศาสตร์ของเพดานมีที่เดียว ต่างกันแค่ถ้อยคำที่สื่อกับผู้ใช้ในแต่ละบริบท
 */
function checkAgainstCap(
  episode: ProtectionEpisode | undefined,
  requestedDays: number,
  asOf: string | Date | undefined,
  messages: { atCap: (cumulative: number) => string; tooLong: (remaining: number, cumulative: number) => string }
): ExtensionCheck {
  const cumulative = cumulativeDays(episode, asOf)
  const remaining = Math.max(0, episodeCapDays(episode) - quotaDays(episode, asOf))

  if (remaining <= 0) {
    return { allowed: false, maxDays: 0, cumulative, remaining, reason: messages.atCap(cumulative) }
  }
  if (requestedDays > remaining) {
    return { allowed: false, maxDays: remaining, cumulative, remaining, reason: messages.tooLong(remaining, cumulative) }
  }
  return { allowed: true, maxDays: remaining, cumulative, remaining }
}

export function checkExtension(episode?: ProtectionEpisode, requestedDays = 0, asOf?: string | Date): ExtensionCheck {
  return checkAgainstCap(episode, requestedDays, asOf, {
    atCap: () =>
      `คุ้มครองสะสมครบเพดาน 6 เดือนแล้ว — ห้ามจัดทำ คบ.14 เพิ่ม หากยังมีภัยให้ส่งต่อกรมคุ้มครองสิทธิฯ`,
    tooLong: (remaining, cumulative) =>
      `ขยายได้ไม่เกิน ${remaining} วัน (สะสมแล้ว ${cumulative} วันจากเพดาน 6 เดือน)`,
  })
}

/**
 * ตรวจช่วงเวลาคุ้มครองชั่วคราวที่เสนอใน คบ.4 / ร่าง คบ.5 เทียบเพดานรวม (WIT0603 → WIT0609)
 *
 * ผังกำหนดว่า TEMPORARY (คบ.5) และ MAIN อยู่ Episode เดียวกันและนับวันสะสมต่อเนื่อง
 * ช่วงชั่วคราวจึงกินโควตาเดียวกับคำร้องหลัก — ระบุเกินเพดานตั้งแต่ขั้นร่างไม่ได้
 * ตรวจตั้งแต่ขั้นเจ้าหน้าที่จัดทำ เพื่อไม่ให้ ผอ. ลงนามคำสั่งที่บังคับตามไม่ได้
 */
export function checkTemporaryDuration(
  episode?: ProtectionEpisode,
  requestedDays = 0,
  asOf?: string | Date
): ExtensionCheck {
  if (requestedDays <= 0) {
    const cumulative = cumulativeDays(episode, asOf)
    const remaining = Math.max(0, episodeCapDays(episode) - quotaDays(episode, asOf))
    return {
      allowed: false,
      maxDays: remaining,
      cumulative,
      remaining,
      reason: 'ยังไม่ได้ระบุระยะเวลาคุ้มครองชั่วคราวในร่าง คบ.5 — ต้องระบุเพื่อให้ระบบนับรวมกับเพดาน 6 เดือนได้',
    }
  }
  return checkAgainstCap(episode, requestedDays, asOf, {
    atCap: () =>
      `คุ้มครองสะสมครบเพดาน 6 เดือนแล้ว — ออกคำสั่งคุ้มครองชั่วคราวเพิ่มไม่ได้ หากยังมีภัยให้ส่งต่อกรมคุ้มครองสิทธิฯ`,
    tooLong: (remaining, cumulative) =>
      `ระยะเวลาคุ้มครองชั่วคราวต้องไม่เกิน ${remaining} วัน (สะสมแล้ว ${cumulative} วันจากเพดานรวม 6 เดือน / 6 เดือน)`,
  })
}

/** สรุปสถานะ Episode สำหรับแสดงผลในหน้า 10 / 11A */
export interface EpisodeSummary {
  phaseKind?: ProtectionPhaseKind
  startedAt?: string
  cumulative: number
  remaining: number
  atCap: boolean
  cap: number
  /** ใกล้ครบเพดานภายใน 30 วัน — ควรเริ่มทบทวนหรือเปิดข้อ 14 ก่อนการคุ้มครองขาดช่วง (WIT0858 / TC-100) */
  nearCap: boolean
  /** เหลือ ≤ PROTECTION_REVIEW_BLOCK_DAYS วันก่อนครบเพดาน (รวมครบเพดานแล้ว) — บังคับเข้าทบทวนที่ 11A
   * ก่อนเดินแขนง "ยังคุ้มครองต่อ" ต่อได้ ต่างจาก nearCap ที่เป็นแค่คำเตือน (TC-122 / WIT1011-1012) */
  blockContinue: boolean
}

/**
 * ช่วง "ใกล้ครบเพดาน" ที่เปิดให้เริ่มเรื่องตามข้อ 14 ได้ล่วงหน้า
 * ตั้งไว้ 30 วันเพื่อให้เจ้าหน้าที่เริ่มเรื่องก่อนครบเพดานได้จริง ไม่ให้การคุ้มครองขาดช่วง
 */
export const NEAR_CAP_WINDOW_DAYS = 30

/**
 * ช่วงบังคับทบทวนก่อนครบเพดาน — แคบกว่า NEAR_CAP_WINDOW_DAYS (แค่เตือน)
 * เหลือ ≤ 7 วันถือว่าใกล้ครบเพดานมากจนต้องบังคับให้เข้าทบทวนที่ 11A ก่อน จะเลือก "ยังคุ้มครองต่อ" ต่อไม่ได้อีก
 */
export const PROTECTION_REVIEW_BLOCK_DAYS = 7

export function summarizeEpisode(episode?: ProtectionEpisode, asOf?: string | Date): EpisodeSummary {
  const cumulative = cumulativeDays(episode, asOf)
  const remaining = Math.max(0, episodeCapDays(episode) - quotaDays(episode, asOf))
  return {
    phaseKind: currentPhaseKind(episode),
    startedAt: episode?.phases[0]?.startedAt,
    cumulative,
    remaining,
    atCap: remaining <= 0,
    cap: episodeCapDays(episode),
    nearCap: remaining > 0 && remaining <= NEAR_CAP_WINDOW_DAYS,
    blockContinue: remaining <= PROTECTION_REVIEW_BLOCK_DAYS,
  }
}

/**
 * ย้อนสร้าง Episode จากสำนวนเดิมที่บันทึกไว้ก่อนมีโมเดลนี้
 * ใช้ actualStartedAt เป็นวันเริ่มจริง และเดา Phase จากคำสั่งที่มี
 */
export function deriveEpisode(caseItem: CaseItem): ProtectionEpisode | undefined {
  if (caseItem.episode) return caseItem.episode
  const started = caseItem.actualStartedAt
  if (!started) return undefined
  /** คำร้องหลักเริ่มนับจาก คบ.11 ที่พยานลงนาม — คบ.8 อาจยังไม่ลงนาม (มีเฉพาะวิธีที่ 1) */
  const kind: ProtectionPhaseKind =
    caseItem.kb5Approved && !caseItem.kb8Signed && !caseItem.kb11Signed ? 'TEMPORARY' : 'MAIN'
  return {
    id: `EP-LEGACY-${caseItem.no}`,
    openedAt: started,
    closedAt: caseItem.closedAt,
    phases: [
      {
        id: `PH-LEGACY-${caseItem.no}`,
        kind,
        startedAt: started,
        endedAt: caseItem.closedAt,
        orderRef: kind === 'TEMPORARY' ? 'คบ.5' : 'คบ.8',
        note: 'สร้างย้อนหลังจากข้อมูลเดิมก่อนมีโมเดล Episode',
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// วิธีคุ้มครองรายวิธี
// ---------------------------------------------------------------------------

export const METHOD_LABELS: Record<ProtectionMethodNo, string> = {
  1: 'วิธีที่ 1 — จัดชุดคุ้มครองและเริ่มปฏิบัติ',
  2: 'วิธีที่ 2 — จัดสถานที่ปลอดภัย',
  3: 'วิธีที่ 3 — ปกปิดข้อมูลและจำกัดสิทธิ',
  4: 'วิธีที่ 4 — ประสานหน่วยงานอื่นให้คุ้มครอง',
}

export const METHOD_STATUS_LABELS: Record<ProtectionMethodTrack['status'], string> = {
  pending: 'รอเริ่มดำเนินการ',
  preparing: 'อยู่ระหว่างจัดเตรียม',
  active: 'กำลังปฏิบัติ (ACTIVE)',
  blocked: 'เริ่มไม่ได้',
  ended: 'สิ้นสุดวิธีนี้แล้ว',
}

export const getMethodTrack = (
  caseItem: Pick<CaseItem, 'methodTracks'>,
  method: ProtectionMethodNo
): ProtectionMethodTrack | undefined => (caseItem.methodTracks || []).find((t) => t.method === method)

/** วิธีที่มีอย่างน้อยหนึ่ง track อยู่ในสถานะ active */
export const hasActiveMethod = (caseItem: Pick<CaseItem, 'methodTracks'>): boolean =>
  (caseItem.methodTracks || []).some((t) => t.status === 'active')

/** วันเริ่มจริงของการคุ้มครอง = วันเริ่มของวิธีแรกที่ active */
export function earliestMethodStart(caseItem: Pick<CaseItem, 'methodTracks'>): string | undefined {
  const starts = (caseItem.methodTracks || [])
    .map((t) => t.startedAt)
    .filter((v): v is string => Boolean(v))
    .sort()
  return starts[0]
}

/** ความยินยอมตาม คบ.11 (หรือ คบ.5 กรณีเร่งด่วน) — ต้องผ่านก่อนจึงเริ่มวิธีได้ (note0801) */
export function hasConsent(caseItem: Pick<CaseItem, 'consents'>, ref: 'kb11' | 'kb5'): boolean {
  const records = (caseItem.consents || []).filter((c) => c.ref === ref)
  const latest = records[records.length - 1]
  return Boolean(latest?.consented)
}

export const daysSince = (value?: string) => (value ? daysElapsed(value) : null)

// ---------------------------------------------------------------------------
// 08A-3 — ช่วงเวลาที่อนุมัติของมาตรการปกปิดข้อมูล (WIT0836)
// ---------------------------------------------------------------------------

/** ช่วงอนุมัติมาตรฐานของมาตรการปกปิด เมื่อคำสั่งไม่ได้ระบุวันสิ้นสุดไว้ */
export const PRIVACY_DEFAULT_APPROVAL_DAYS = 30

export interface PrivacyWindow {
  from?: string
  /** วันสิ้นสุดที่ใช้จริง — จาก approvedTo หรือคำนวณจากวันเริ่มมีผล + ช่วงอนุมัติมาตรฐาน */
  to?: string
  expired: boolean
  /** จำนวนวันที่พ้นกำหนดมาแล้ว (0 ถ้ายังไม่สิ้นผล) */
  overdueDays: number
}

/**
 * สิทธิ์ตามมาตรการปกปิดสิ้นผลหรือยัง — สิ้นผลตามวันที่กำหนด ไม่ลบประวัติการให้สิทธิ์เดิม
 * ไม่มี approvedTo ให้ถือว่าคำสั่งอนุมัติไว้ PRIVACY_DEFAULT_APPROVAL_DAYS วันนับจากวันเริ่มมีผล
 */
export function privacyWindow(
  privacy?: Partial<MethodPrivacy>,
  asOf?: string | Date
): PrivacyWindow {
  const from = privacy?.approvedFrom || privacy?.effectiveAt
  let to = privacy?.approvedTo
  if (!to && from) {
    const start = parseAnyDate(from)
    if (start) to = new Date(start.getTime() + PRIVACY_DEFAULT_APPROVAL_DAYS * 86400000).toISOString()
  }
  if (!to) return { from, to, expired: false, overdueDays: 0 }
  const end = parseAnyDate(to)
  if (!end) return { from, to, expired: false, overdueDays: 0 }
  const now = asOf ? parseAnyDate(asOf as string) || new Date() : new Date()
  const diff = now.getTime() - end.getTime()
  return { from, to, expired: diff > 0, overdueDays: diff > 0 ? Math.floor(diff / 86400000) : 0 }
}

// ---------------------------------------------------------------------------
// 08A-2 — ขอบเขตสถานที่ที่คำสั่งอนุมัติ (WIT0823-0824)
// ---------------------------------------------------------------------------

const SITE_TYPE_KEYWORDS: Array<{ type: MethodSite['siteType']; words: string[] }> = [
  { type: 'witness_home', words: ['ที่อยู่พยาน', 'บ้านพยาน', 'ที่พักพยาน'] },
  { type: 'trusted_person', words: ['บุคคลที่ไว้วางใจ', 'ญาติ', 'ผู้ไว้วางใจ'] },
  { type: 'pacc_designated', words: ['ป.ป.ท. กำหนด', 'ปปท. กำหนด', 'ที่ราชการกำหนด'] },
]

export const SITE_TYPE_LABELS: Record<MethodSite['siteType'], string> = {
  witness_home: 'ที่อยู่ของพยานเอง',
  trusted_person: 'ที่อยู่ของบุคคลที่พยานไว้วางใจ',
  pacc_designated: 'สถานที่ที่ ป.ป.ท. กำหนด',
}

/**
 * แปลข้อความขอบเขตตามคำสั่งเป็นชุดประเภทสถานที่ที่อนุมัติให้ใช้ได้
 *
 * ใช้เมื่อคำสั่งไม่ได้มาเป็นโครงสร้าง (CaseItem.approvedSiteScope) — ข้อความที่ขึ้นต้นว่า "เฉพาะ"
 * ถือเป็นการจำกัดขอบเขต ถ้าไม่พบคำที่จำกัดเลยให้ถือว่าไม่จำกัด (คืน undefined)
 */
export function parseSiteScope(note?: string): MethodSite['siteType'][] | undefined {
  if (!note) return undefined
  if (!/เฉพาะ|จำกัด|เท่านั้น/.test(note)) return undefined
  const matched = SITE_TYPE_KEYWORDS.filter((k) => k.words.some((w) => note.includes(w))).map((k) => k.type)
  return matched.length > 0 ? matched : undefined
}

/** ประเภทสถานที่ที่อนุมัติให้ใช้ได้ของสำนวนนี้ — โครงสร้างจากคำสั่งมาก่อน แล้วค่อยตีความจากข้อความขอบเขต */
export function allowedSiteTypes(
  caseItem: Pick<CaseItem, 'approvedSiteScope'>,
  scopeNote?: string
): MethodSite['siteType'][] | undefined {
  const structured = caseItem.approvedSiteScope?.allowedSiteTypes
  if (structured && structured.length > 0) return structured
  return parseSiteScope(caseItem.approvedSiteScope?.note || scopeNote)
}
