import { CaseItem, FastTrackStep, ProtectionMethodNo } from '../types/case'
import { checkTemporaryDuration, deriveEpisode } from './episode'

/**
 * Sheet 06 — เส้นทางเร่งด่วน คบ.4 / คบ.5 และการคุ้มครองชั่วคราว
 *
 * แหล่งความจริงเดียวว่า "เคสนี้อยู่ขั้นไหนของเส้นทางเร่งด่วน และกดอะไรได้บ้าง"
 * ใช้ร่วมกันระหว่างการ์ดในแฟ้ม (FastTrackCard) และเงื่อนไขห้ามลัดขั้นตอนของ ForwardWorkflowCard
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

/** ผ่านประตู WIT0606 แล้วหรือยัง — เป็นเงื่อนไขเปิดปุ่มอนุมัติ/ไม่อนุมัติที่ WIT0609 */
export const readinessConfirmed = (caseItem: CaseItem): boolean =>
  Boolean(caseItem.fastTrack?.readinessCheckedAt) && caseItem.fastTrack?.step === 'director_review'

export interface FastTrackGateResult {
  unlocked: boolean
  /** เหตุผลข้อแรกที่ยังกดไม่ได้ — แสดงใต้ปุ่มให้ตรงจุดว่าต้องไปทำอะไรก่อน */
  reason?: string
}

/**
 * WIT0603 → WIT0604 — เจ้าหน้าที่ส่ง คบ.4 และร่าง คบ.5 ตรงถึง ผอ. ได้หรือยัง
 * ต้องเลือกวิธีตามข้อ 15 อย่างน้อยหนึ่งวิธีก่อน เพราะชุดวิธีนี้คือสิ่งที่จะถูกอนุมัติ
 * แล้วส่งไปเปิดเส้นทางปฏิบัติที่แท็บ 08 (WIT0613) — ถ้าว่างไว้ระบบจะไม่รู้ว่าอนุมัติวิธีใด
 */
export const submitFastTrackGate = (
  caseItem: CaseItem,
  selectedMethods: number[],
  durationDays?: number
): FastTrackGateResult => {
  if (!isFastTrackCase(caseItem))
    return { unlocked: false, reason: 'เคสนี้ไม่ได้ประเมินเป็นกรณีจำเป็นเร่งด่วน — เดินเส้นทางปกติที่ คบ.6' }
  const step = fastTrackStep(caseItem)
  if (step !== 'drafting' && step !== 'returned')
    return { unlocked: false, reason: 'เสนอ ผอ. พิจารณาไปแล้ว — รอผลการพิจารณาคุ้มครองชั่วคราว' }
  if (selectedMethods.length === 0)
    return {
      unlocked: false,
      reason: 'ยังไม่ได้เลือกวิธีคุ้มครอง (วิธีที่ 1–4) ในแบบ คบ.4 — เลือกได้มากกว่าหนึ่งวิธี',
    }
  const duration = temporaryDurationCheck(caseItem, durationDays)
  if (!duration.allowed) return { unlocked: false, reason: duration.reason }
  return { unlocked: true }
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
