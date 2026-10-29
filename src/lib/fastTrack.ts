import { CaseItem, FastTrackStep, ProtectionMethodNo } from '../types/case'
import { checkTemporaryDuration, deriveEpisode } from './episode'
import { isoFromThaiParts } from './utils'
import { isCaseWorkerRole, protectionMethodSelectionIssue } from './constants'
import { UserRole } from '../types/user'

/**
 * Sheet 06 — เส้นทางเร่งด่วน คบ.4 / คบ.5 และการคุ้มครองชั่วคราว
 *
 * แหล่งความจริงเดียวว่า "เคสนี้อยู่ขั้นไหนของเส้นทางเร่งด่วน และกดอะไรได้บ้าง"
 * ใช้ร่วมกันระหว่างส่วนเส้นทางเร่งด่วน (FastTrackSubmitPanel · FastTrackPanel) และเงื่อนไขห้ามลัดขั้นตอนของ ForwardWorkflowCard
 *
 * หลักที่ผังเน้นและโค้ดนี้ยึดไว้
 *  - เรื่องคุ้มครองชั่วคราวเดินแยกจากคำร้องหลัก · คำร้องหลักต้องเดินต่อเสมอ (WIT0614)
 *  - ไม่ว่าอนุมัติหรือไม่อนุมัติชั่วคราว ก็ไม่ปิดคำร้องหลักและไม่ออก คบ.10 (WIT0610)
 */

/** เคสนี้เดินเส้นทางเร่งด่วนหรือไม่ — ผลประเมินความเร่งด่วนที่ WIT0409/WIT0410 เป็นตัวกำหนด */
export const isFastTrackCase = (caseItem: Pick<CaseItem, 'urgent' | 'urgency'>): boolean =>
  Boolean(caseItem.urgent || caseItem.urgency === 'urgent')

/** ขั้นปัจจุบันของเส้นทางเร่งด่วน — เคสเร่งด่วนที่ยังไม่เคยเสนอถือว่าอยู่ขั้นจัดทำ คบ.4 */
export const fastTrackStep = (caseItem: CaseItem): FastTrackStep | null => {
  if (!isFastTrackCase(caseItem)) return null
  return caseItem.fastTrack?.step ?? 'drafting'
}

/** เรื่องคุ้มครองชั่วคราวยังค้างการตัดสินของ ผอ. อยู่หรือไม่ (WIT0605–WIT0609) */
export const temporaryDecisionPending = (caseItem: CaseItem): boolean => {
  const step = fastTrackStep(caseItem)
  return step === 'drafting' || step === 'director_review' || step === 'returned'
}

/**
 * ผู้ลงนามใน คบ.4 / คบ.5 ของเส้นทางเร่งด่วน — ลงนามที่หน้ากรอกแบบ (ปุ่ม "ลงนาม" ข้าง "บันทึกแบบ") แบบเดียวกับ คบ.6
 *  - ผู้เสนอท้าย คบ.4 ลงนามอย่างเดียว ตอนจัดทำ/แก้ไขก่อนส่ง ผอ. (WIT0603 · WIT0608)
 *  - ผอ. ลงความเห็นข้อ 13 ใน คบ.4 แล้วลงนาม และลงนามคำสั่ง คบ.5 ตามลำดับ (คบ.4 ก่อน คบ.5) ตอน ผอ. พิจารณา (WIT0605 → WIT0611)
 */
export interface FastTrackSigner {
  /** คีย์ลายมือชื่อใน useFormDraftStore */
  key: 'kb4-officer' | 'kb4-director' | 'kb5-director'
  formId: 4 | 5
  label: string
  signerRole: string
  /** ช่องชื่อผู้ลงนามในแบบ ที่จะถูกเติมให้ตรงกับผู้ลงนามจริง */
  nameField: string
  /** ช่องความเห็นที่ต้องมีก่อนลงนาม — ว่างตอนกดลงนามระบบเติม FAST_TRACK_DEFAULT_OPINION */
  opinionField?: string
  byDirector: boolean
}

export const FAST_TRACK_DEFAULT_OPINION = 'เห็นชอบให้คุ้มครองชั่วคราวตามที่เสนอ'

export const FAST_TRACK_SIGNERS: FastTrackSigner[] = [
  {
    key: 'kb4-officer',
    formId: 4,
    label: 'ผู้เสนอ',
    signerRole: 'นักสืบสวนสอบสวนชำนาญการ (ผู้เสนอ)',
    nameField: 'ผู้เสนอ',
    byDirector: false,
  },
  {
    key: 'kb4-director',
    formId: 4,
    label: 'ความเห็นผู้อำนวยการสำนัก (ข้อ 13)',
    signerRole: 'ผู้อำนวยการสำนัก/กอง/ศูนย์',
    nameField: 'ผู้อำนวยการ',
    opinionField: 'ความเห็นผู้อำนวยการ',
    byDirector: true,
  },
  {
    key: 'kb5-director',
    formId: 5,
    label: 'ผู้อำนวยการสำนัก/กอง/ศูนย์ ผู้ออกคำสั่ง',
    signerRole: 'ผู้อำนวยการสำนัก/กอง/ศูนย์',
    nameField: 'ผู้อำนวยการ',
    byDirector: true,
  },
]

/** ถึงคิวของผู้ลงนามข้อนี้ตามขั้นของแฟ้มหรือยัง (ไม่รวมว่าลงนามไปแล้วหรือยัง — ผู้เรียกตรวจจากลายมือชื่อเอง) */
export const fastTrackSignerTurn = (signer: FastTrackSigner, caseItem: CaseItem, role: UserRole): boolean => {
  const step = fastTrackStep(caseItem)
  if (!signer.byDirector) return (step === 'drafting' || step === 'returned') && isCaseWorkerRole(role)
  return step === 'director_review' && (role === 'director' || role === 'admin')
}

export interface FastTrackGateResult {
  unlocked: boolean
  /** เหตุผลข้อแรกที่ยังกดไม่ได้ — แสดงใต้ปุ่มให้ตรงจุดว่าต้องไปทำอะไรก่อน */
  reason?: string
}

/**
 * WIT0603 → WIT0604 — เจ้าหน้าที่ส่ง คบ.4 และร่าง คบ.5 ตรงถึง ผอ. ได้หรือยัง
 * ส่งเอกสารให้ ผอ. ตรวจได้แม้ยังไม่ระบุวิธีคุ้มครอง โดยตรวจความครบถ้วนของมาตรการในขั้นพิจารณา
 */
export const submitFastTrackGate = (
  caseItem: CaseItem,
  selectedMethods: number[],
  durationDays?: number,
  /** ช่วงวันที่ในร่าง คบ.5 ยังไม่ครบหรือไม่ถูกต้อง — มาจาก kb5TemporaryPeriod */
  periodError?: string,
  /** ตัวเลือกย่อยที่เลือกไว้ใน คบ.4 (readMethodSubitems) — ข้อ 4 ต้องเลือก 4.1–4.4 ก่อนส่ง */
  subitemSelected?: Record<number, string>
): FastTrackGateResult => {
  if (!isFastTrackCase(caseItem))
    return { unlocked: false, reason: 'เคสนี้ไม่ได้ประเมินเป็นกรณีจำเป็นเร่งด่วน — เดินเส้นทางปกติที่ คบ.6' }
  const step = fastTrackStep(caseItem)
  if (step !== 'drafting' && step !== 'returned')
    return { unlocked: false, reason: 'เสนอ ผอ. พิจารณาไปแล้ว — รอผลการพิจารณาคุ้มครองชั่วคราว' }
  const methodIssue = subitemSelected && protectionMethodSelectionIssue(selectedMethods, subitemSelected)
  if (methodIssue) return { unlocked: false, reason: `${methodIssue} ในแบบ คบ.4` }
  if (periodError) return { unlocked: false, reason: periodError }
  const duration = temporaryDurationCheck(caseItem, durationDays)
  if (!duration.allowed) return { unlocked: false, reason: duration.reason }
  return { unlocked: true }
}

export interface Kb5TemporaryPeriod {
  /** yyyy-mm-dd (ค.ศ.) — ว่างเมื่อยังไม่กรอกหรืออ่านไม่ออก */
  startIso: string
  endIso: string
  /** นับรวมวันแรกและวันสุดท้าย (1–30 ม.ค. = 30 วัน) · 0 เมื่อช่วงวันที่ยังใช้ไม่ได้ */
  days: number
  error?: string
}

/**
 * WIT0603 — ช่วงเวลาคุ้มครองชั่วคราวอ่านจาก "ตั้งแต่วันที่ … ถึงวันที่ …" ในร่าง คบ.5
 * จำนวนวันที่ใช้ตรวจเพดานรวม 180 วันจึงตรงกับคำสั่งที่ ผอ. ลงนามเสมอ ไม่ต้องกรอกซ้ำในแฟ้ม
 */
export const kb5TemporaryPeriod = (draft: Record<string, unknown>): Kb5TemporaryPeriod => {
  const startIso = isoFromThaiParts(draft['เริ่มวันที่'], draft['เริ่มเดือน'], draft['เริ่มพ.ศ.'])
  const endIso = isoFromThaiParts(draft['ถึงวันที่'], draft['ถึงเดือน'], draft['ถึงพ.ศ.'])
  if (!startIso || !endIso)
    return {
      startIso,
      endIso,
      days: 0,
      error: 'ยังไม่ได้ระบุช่วงวันที่คุ้มครอง (ตั้งแต่วันที่ – ถึงวันที่) ในแบบ คบ.5',
    }
  const days = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 86_400_000) + 1
  if (days < 1)
    return { startIso, endIso, days: 0, error: 'วันที่สิ้นสุดในแบบ คบ.5 อยู่ก่อนวันที่เริ่ม — แก้ช่วงวันที่ให้ถูกต้อง' }
  return { startIso, endIso, days }
}

/**
 * ระยะเวลาคุ้มครองชั่วคราวที่เสนอ เทียบเพดานรวม 180 วันของ Episode เดียวกัน (WIT0603)
 * แยกออกมาเพื่อให้การ์ดแสดงคำเตือนได้ทันทีที่พิมพ์ ไม่ต้องรอกดส่ง
 */
export const temporaryDurationCheck = (caseItem: CaseItem, durationDays?: number) =>
  checkTemporaryDuration(caseItem.episode || deriveEpisode(caseItem), durationDays ?? caseItem.fastTrack?.temporaryDurationDays ?? 0)

/**
 * รายการตรวจของ ผอ. ที่ WIT0605 ก่อนตัดสินประตู WIT0606
 * เป็นข้อมูลที่ผังระบุให้ตรวจ: คบ.4 · ร่าง คบ.5 · หลักฐาน · ระดับภัย · มาตรการคุ้มครองชั่วคราว
 */
export interface FastTrackReviewItem {
  key: string
  label: string
  ok: boolean
}

export const fastTrackReviewItems = (caseItem: CaseItem): FastTrackReviewItem[] => {
  const methods = caseItem.fastTrack?.proposedMethods || []
  const documents = caseItem.documents || []
  return [
    {
      key: 'kb4',
      label: 'แบบ คบ.4 บันทึกข้อความขอคุ้มครองพยานชั่วคราว',
      ok: Boolean(caseItem.fastTrack?.submittedAt),
    },
    {
      key: 'methods',
      label: `มาตรการคุ้มครองชั่วคราวที่เสนอ${methods.length ? ` (วิธีที่ ${methods.join(', ')})` : ''}`,
      ok: methods.length > 0,
    },
    {
      key: 'duration',
      label: (() => {
        const days = caseItem.fastTrack?.temporaryDurationDays
        const check = temporaryDurationCheck(caseItem, days)
        return days
          ? `ระยะเวลาคุ้มครองชั่วคราวตามร่าง คบ.5 (${days} วัน · คงเหลือจากเพดานรวม ${check.remaining} วัน)`
          : 'ระยะเวลาคุ้มครองชั่วคราวตามร่าง คบ.5 (ยังไม่ระบุ)'
      })(),
      ok: temporaryDurationCheck(caseItem, caseItem.fastTrack?.temporaryDurationDays).allowed,
    },
    {
      key: 'evidence',
      label: 'หลักฐานภัยคุกคามประกอบเรื่อง',
      ok: documents.length > 0,
    },
    {
      key: 'risk',
      label: `ระดับภัยที่ประเมินไว้ (${caseItem.risk})`,
      ok: caseItem.risk !== 'ยังไม่ประเมิน',
    },
  ]
}

/** วิธีที่ผ่านการอนุมัติชั่วคราว — ใช้เปิดเส้นทางปฏิบัติที่แท็บ 08 ตาม WIT0613 */
export const approvedTemporaryMethods = (caseItem: CaseItem): ProtectionMethodNo[] =>
  (caseItem.fastTrack?.proposedMethods || []) as ProtectionMethodNo[]

/**
 * WIT0614 — ข้อความกำกับว่าคำร้องหลักยังเดินต่อ ไม่ว่าชั่วคราวจะอนุมัติหรือไม่
 * คืนค่าเมื่อเรื่องชั่วคราวได้ข้อยุติแล้วเท่านั้น จึงไม่ไปรบกวนขั้นที่ยังพิจารณาอยู่
 */
export const mainPetitionNotice = (caseItem: CaseItem): string | null => {
  const step = fastTrackStep(caseItem)
  if (step === 'denied')
    return 'ไม่อนุมัติเฉพาะการคุ้มครองชั่วคราว — คำร้องหลักไม่ปิด และไม่ออก คบ.10 ในขั้นนี้ ให้จัดทำ/เสนอ คบ.6 ในขั้นกลั่นกรอง แล้วรอผลพิจารณาและคำสั่งตามปกติ'
  if (step === 'approved' || step === 'active')
    return 'คำสั่งคุ้มครองชั่วคราว คบ.5 มีผลแล้ว — คำร้องหลักยังเดินต่อควบคู่กัน ให้จัดทำ/เสนอ คบ.6 ในขั้นกลั่นกรอง แล้วรอผลพิจารณาและคำสั่งตามปกติ'
  return null
}
