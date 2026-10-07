import { canOperateHandoff } from './protectionHandoff'
import type { UserRole } from '../types/user'
import type { CaseItem, ProtectionHandoffDestination } from '../types/case'

export type ResultNoticeFormNo = 9 | 10
export type NoticeDocumentStatus = 'draft' | 'awaiting_signature' | 'signed_incomplete' | 'completed' | 'ready' | 'sent'
export const NOTICE_STATUS_LABELS: Record<NoticeDocumentStatus, string> = {
  draft: 'ร่างในชุดเสนอ', awaiting_signature: 'รอลงนามตามผลพิจารณา',
  signed_incomplete: 'ลงนามแล้ว — รอเติมรายละเอียด', completed: 'เติมรายละเอียดครบ — รอตรวจพร้อมส่ง',
  ready: 'พร้อมส่งแจ้งผล', sent: 'ส่งแจ้งผลแล้ว',
}
/** รายการที่เสนอเจ้าของงานยืนยัน ไม่ใช่การอนุญาตแก้ไขหลังลงนาม */
export const NOTICE_DETAIL_FIELDS = ['เลขที่หนังสือ', 'ปีหนังสือ', 'วันที่', 'เดือน', 'พ.ศ.', 'คำร้องลงวันที่'] as const
export const NOTICE_FIELD_LABELS: Record<string, string> = {
  เลขที่หนังสือ: 'เลขที่หนังสือ (ส่วนหน่วยงาน)', ปีหนังสือ: 'เลขหนังสือหลัง / (ชื่อช่องเดิม: ปีหนังสือ)',
  วันที่: 'วันที่หนังสือ — วัน', เดือน: 'วันที่หนังสือ — เดือน', 'พ.ศ.': 'วันที่หนังสือ — พ.ศ.',
  คำร้องลงวันที่: 'วันที่คำร้องที่อ้างถึง', วันที่อนุมัติ: 'วันที่อนุมัติ', สาระสำคัญ: 'เหตุผลไม่อนุมัติ', เลขาธิการ: 'ผู้ลงนาม',
}
export interface NoticeFieldPolicy {
  confirmed: boolean
  allowedAfterSigning: string[]
  requiredForSend: string[]
  confirmedBy?: string
  confirmedAt?: string
}
export const NOTICE_FIELD_POLICY: NoticeFieldPolicy = {
  confirmed: true, allowedAfterSigning: [...NOTICE_DETAIL_FIELDS], requiredForSend: [...NOTICE_DETAIL_FIELDS],
  confirmedBy: 'เจ้าของงานยืนยันในคำสั่งงาน', confirmedAt: '2026-10-07',
}
export interface NoticeSnapshot {
  version: number
  caseContext: Omit<CaseItem, 'resultNotices'>
  fields: Record<string, string>
  caseNo: string
  formNo: ResultNoticeFormNo
  outcome: 'approved' | 'rejected'
  decisionNo: string
  reason: string
  signedAt: string
  signedBy: string
  signatureMode: 'simulated'
  signatureVerification: 'simulated_original' | 'not_covered_by_original_signature'
}
export interface NoticeChange {
  id: string
  at: string
  by: string
  userId: string
  version: number
  changes: { field: string; before: string; after: string }[]
}
export interface NoticeDispatchArchive {
  id: string
  at: string
  by: string
  channel: string
  tracking?: string
  snapshot: NoticeSnapshot
  evidence: { kind: 'dispatch_record'; description: string }
  receipt?: { receivedAt: string; recipient: string; evidenceType: string; documentName: string }
}
export interface ResultNoticeDocument {
  formNo: ResultNoticeFormNo
  status: NoticeDocumentStatus
  preparedAt: string
  preparedBy: string
  fields: Record<string, string>
  policy: NoticeFieldPolicy
  original?: NoticeSnapshot
  versions: NoticeSnapshot[]
  audit: NoticeChange[]
  checkedAt?: string
  checkedBy?: string
  dispatches: NoticeDispatchArchive[]
}
export const cloneNotice = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
// Signed KB10 remains in the file; an appeal-authorized KB6 round has its own new KB9 decision.
export const hasSignedResultNotice = (item?: CaseItem): boolean =>
  Boolean(item?.resultNotices?.[9]?.original || (item?.resultNotices?.[10]?.original && !item.appealKb6Version))
export const noticeForCase = (item?: CaseItem): ResultNoticeDocument | undefined =>
  item?.activity7State === 'approved' ? item.resultNotices?.[9] : item?.activity7State === 'rejected' ? item.resultNotices?.[10] : undefined
export const missingNoticeFields = (document: ResultNoticeDocument): string[] =>
  document.policy.requiredForSend.filter((key) => !document.fields[key]?.trim())
export const noticeCanSign = (document: ResultNoticeDocument): boolean =>
  !document.original && document.policy.requiredForSend.every((key) =>
    Boolean(document.fields[key]?.trim()) || (document.policy.confirmed && document.policy.allowedAfterSigning.includes(key)))
export const createNoticeDraft = (formNo: ResultNoticeFormNo, item: CaseItem, at: string, by: string, fields: Record<string, string> = {}): ResultNoticeDocument => ({
  formNo, status: item.stage === 'external_pending' ? 'awaiting_signature' : 'draft', preparedAt: at, preparedBy: by,
  fields: { 'คำร้องลงวันที่': item.createdAt?.slice(0, 10) || '', ...fields },
  policy: cloneNotice(NOTICE_FIELD_POLICY), versions: [], audit: [], dispatches: [],
})
export const signNoticeSnapshot = (document: ResultNoticeDocument, item: CaseItem, at: string, by: string, decisionNo: string, reason: string): ResultNoticeDocument => {
  const fields = { ...document.fields, เลขาธิการ: by,
    ...(document.formNo === 9 ? { วันที่อนุมัติ: at } : { สาระสำคัญ: reason }) }
  const snapshot: NoticeSnapshot = {
    version: 1, caseContext: cloneNotice({ ...Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'resultNotices')), activity7State: document.formNo === 9 ? 'approved' : 'rejected', resultAt: at, resultReason: reason, decisionNumber: decisionNo, secretarySignedAt: at, secretarySignedBy: by, [`kb${document.formNo}SignedAt`]: at, [`kb${document.formNo}SignedBy`]: by } as Omit<CaseItem, 'resultNotices'>), fields, caseNo: item.no, formNo: document.formNo,
    outcome: document.formNo === 9 ? 'approved' : 'rejected', decisionNo, reason, signedAt: at, signedBy: by,
    signatureMode: 'simulated', signatureVerification: 'simulated_original',
  }
  const signed = { ...document, fields, original: cloneNotice(snapshot), versions: [cloneNotice(snapshot)] }
  return { ...signed, status: missingNoticeFields(signed).length ? 'signed_incomplete' : 'completed' }
}

export const noticeWorkerAllowed = (role: UserRole, item: CaseItem, userId: string): boolean => {
  if (item.protectionHandoff) return canOperateHandoff(role, item, userId)
  if (role === 'admin') return true
  if (role !== 'officer' && role !== 'case_owner') return false
  return Boolean(item.assignedOfficerUserId && item.assignedOfficerUserId === userId)
}

/** เลือกผลเบื้องต้นเท่านั้น ไม่ใช่ผลพิจารณาหรือสถานะส่งงาน */
export interface NoticeDecisionDraft {
  formNo: ResultNoticeFormNo
  outcome: 'approved' | 'rejected'
  decisionNo: string
  reason: string
  destination?: ProtectionHandoffDestination
  instruction: string
  durationDays: number
  selectedAt: string
  selectedBy: string
  savedAt?: string
  savedBy?: string
}
export interface NoticeDecisionDraftInput {
  decisionNo: string
  reason: string
  destination?: ProtectionHandoffDestination
  instruction: string
  durationDays: number
  fields: Record<string, string>
}
export interface NoticeDecisionSelectionEvent {
  id: string
  at: string
  by: string
  userId: string
  formNo: ResultNoticeFormNo
  previousFormNo?: ResultNoticeFormNo
}
