import { CaseItem } from '../types/case'
import { useCaseStore } from '../store/useCaseStore'
import { selectCaseDraft, useFormDraftStore } from '../store/useFormDraftStore'
import { deriveEpisode, summarizeEpisode } from './episode'
import { addProtectionMonths, calendarDays } from './protectionMonths'
import { addDays } from './utils'

const KB14_DRAFTERS = ['officer', 'case_owner', 'got_officer', 'admin']

/** เจ้าหน้าที่ส่ง คบ.14 ให้ผู้บังคับบัญชาชั้นต้นได้ไหม — ยังไม่ครบเพดาน และไม่มีฉบับที่ค้างอยู่ในขั้นพิจารณา */
export function canSubmitKb14(caseItem: CaseItem, role: string): boolean {
  if (!KB14_DRAFTERS.includes(role)) return false
  if (caseItem.sarabanDispatch?.flow === 'kb14') return false
  if (summarizeEpisode(caseItem.episode || deriveEpisode(caseItem)).atCap) return false
  const latest = caseItem.extensionRequests?.at(-1)
  return !latest || ['returned', 'rejected', 'approved'].includes(latest.status) || (latest.status === 'submitted' && !latest.formSnapshot)
}

/** ร่าง คบ.14 ของแฟ้มนี้ (ค่าที่บันทึกไว้ในหน้าแบบฟอร์ม) */
export const kb14DraftOf = (caseNo: string): Record<string, any> => selectCaseDraft(useFormDraftStore.getState(), 14, caseNo)

/**
 * WIT1112-1116 — ส่ง คบ.14 ที่บันทึกไว้ให้ผู้บังคับบัญชาชั้นต้น
 * ใช้ค่าจากร่างแบบฟอร์ม (เหตุผล ช่วงขยาย จำนวนเดือน) — คืนข้อความเตือนเมื่อยังส่งไม่ได้ หรือ null เมื่อส่งแล้ว
 */
export function submitKb14Draft(caseItem: CaseItem): string | null {
  const draft = kb14DraftOf(caseItem.no)
  const reason = draft['เหตุผลขยายเวลา']
  if (!reason || !String(reason).trim()) return 'กรุณาระบุข้อพิจารณาและเหตุผลในการขยายระยะเวลาในแบบ คบ.14 ก่อน'
  const latest = caseItem.extensionRequests?.at(-1)
  const months = Number(draft['ขยายเดือน']) || latest?.durationMonths || 1
  const fieldsDate = (prefix: string) => {
    const y = Number(draft[`${prefix}พ.ศ.`]); const m = Number(draft[`${prefix}เดือน`]); const d = Number(draft[`${prefix}วันที่`])
    return y && m && d ? `${y > 2400 ? y - 543 : y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : undefined
  }
  const periodFrom = fieldsDate('ขยายเริ่ม') || draft.periodFrom || (caseItem.protectionEndAt ? addDays(caseItem.protectionEndAt, 1).slice(0, 10) : '')
  if (!periodFrom) return 'กรุณาระบุวันเริ่มขยายเวลา'
  const periodTo = addProtectionMonths(periodFrom, months)
  const days = calendarDays(periodFrom, periodTo)
  const summary = summarizeEpisode(caseItem.episode || deriveEpisode(caseItem))
  const capEnd = summary.startedAt ? addProtectionMonths(summary.startedAt, 6) : undefined
  if (months < 1 || months > 2 || (capEnd && periodTo > capEnd)) return 'ขยายได้ครั้งละไม่เกิน 2 เดือน และรวมไม่เกิน 6 เดือน'
  if (draft['ขยายวัน'] !== String(days)) {
    activateDraftOwner(caseItem.no)
    useFormDraftStore.getState().updateField(14, 'ขยายวัน', String(days))
  }
  useCaseStore.getState().draftKb14(caseItem.no, {
    reason: String(reason), durationDays: days, durationMonths: months, periodFrom, periodTo,
    attachments: draft.attachments || latest?.attachments || [], gapDays: draft.gapDays, gapReason: draft.gapReason,
    formSnapshot: { ...draft, 'ขยายวัน': String(days), 'ขยายเดือน': String(months), periodFrom, periodTo, 'ขยายถึงวันที่': periodTo.slice(8), 'ขยายถึงเดือน': String(Number(periodTo.slice(5, 7))), 'ขยายถึงพ.ศ.': String(Number(periodTo.slice(0, 4)) + 543) },
  })
  return null
}

/** เขียน draft คบ.14 ได้เฉพาะเมื่อร่างปัจจุบันเป็นของแฟ้มนี้ — ไม่ทับร่างของแฟ้มอื่น */
const activateDraftOwner = (caseNo: string) => {
  const s = useFormDraftStore.getState()
  if (s.draftCaseNo[14] !== undefined && s.draftCaseNo[14] !== caseNo) s.ensureDraftForCase(14, caseNo, kb14DraftOf(caseNo))
}
