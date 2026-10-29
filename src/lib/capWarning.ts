import type { CaseItem } from '../types/case'
import { useNotificationStore } from '../store/useNotificationStore'
import { canProposeArticle14, deriveEpisode, summarizeEpisode } from './episode'
import { protectionResponsibleName } from './protectionHandoff'
import { addDays, formatThaiDate } from './utils'

/** ประเภทการแจ้งเตือนในกระดิ่ง — ใช้กันแจ้งซ้ำต่อแฟ้ม */
export const CAP_WARNING_TYPE = 'ใกล้ครบระยะเวลาคุ้มครอง 6 เดือน'

export interface CapWarning {
  remaining: number
  /** วันที่คาดว่าจะครบเพดาน 6 เดือน (ISO) */
  capDate: string
}

/**
 * แจ้งเตือนล่วงหน้า 1 เดือน (NEAR_CAP_WINDOW_DAYS) ก่อนครบเพดาน 6 เดือน
 * ใช้ร่วมกันทั้งกระดิ่ง หน้าภาพรวมการคุ้มครอง และหน้าแฟ้ม — ครบเพดานแล้วไม่ถือเป็น "ใกล้ครบ"
 */
export function capWarning(caseItem: CaseItem, asOf: Date = new Date()): CapWarning | undefined {
  if (!canProposeArticle14(caseItem)) return undefined
  const summary = summarizeEpisode(caseItem.episode || deriveEpisode(caseItem), asOf)
  if (!summary.nearCap) return undefined
  return { remaining: summary.remaining, capDate: addDays(asOf, summary.remaining) }
}

export const capWarningMessage = (caseItem: CaseItem, warning: CapWarning) =>
  `แฟ้ม ${caseItem.no} (${caseItem.person || 'ยังไม่ระบุชื่อพยาน'}) คุ้มครองสะสมอีก ${warning.remaining} วันจะครบ 6 เดือน (ประมาณ ${formatThaiDate(warning.capDate)}) — หากยังมีภัยให้เริ่มเรื่องส่งต่อกรมคุ้มครองสิทธิฯ ก่อนครบกำหนด`

/** ส่งการแจ้งเตือนใกล้ครบ 6 เดือนเข้ากระดิ่งของผู้รับผิดชอบ ครั้งเดียวต่อแฟ้ม */
export function notifyCapWarnings(cases: CaseItem[], asOf: Date = new Date()): void {
  const store = useNotificationStore.getState()
  for (const c of cases) {
    const warning = capWarning(c, asOf)
    if (!warning) continue
    if (store.notifications.some((n) => n.type === CAP_WARNING_TYPE && n.caseNo === c.no)) continue
    store.addNotification({
      caseNo: c.no,
      type: CAP_WARNING_TYPE,
      toName: protectionResponsibleName(c),
      toUserId: c.protectionHandoff?.assigneeUserId || c.assignedOfficerUserId,
      channel: 'ระบบ E-CMIS',
      message: capWarningMessage(c, warning),
      urgency: 'ด่วน',
    })
  }
}
