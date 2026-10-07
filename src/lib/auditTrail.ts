import { AuditEntry } from '../types/workflow'
import { parseAnyDate } from './utils'

/**
 * TC-159 — จัดหมวดเหตุการณ์ของ Timeline & Audit Trail แฟ้มคำร้อง
 * แยกจากประเภทข้อมูลเดิม (assignmentHistory ไม่มีฟิลด์หมวดหมู่) โดยตีความจากข้อความ action
 * เพื่อไม่ต้องแก้โครงสร้างข้อมูลเดิมทุกจุดที่เรียก logHistory ทั่วระบบ
 */
export type AuditCategory =
  | 'intake'
  | 'assignment'
  | 'document'
  | 'signing'
  | 'access'
  | 'export'
  | 'closing'
  | 'other'

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  intake: 'รับเรื่อง',
  assignment: 'มอบหมาย',
  document: 'จัดทำ/แก้ไขเอกสาร',
  signing: 'ลงนาม',
  access: 'เข้าถึงข้อมูลพยาน',
  export: 'ส่งออกข้อมูล',
  closing: 'ปิดงาน/ยุติ',
  other: 'อื่นๆ',
}

/** ลำดับการตรวจต้องเจาะจงก่อนกว้าง — เช่น "ส่งออก" ต้องมาก่อน "ส่ง" ทั่วไป */
export function classifyAuditAction(action: string): AuditCategory {
  const a = action || ''
  if (/ส่งออก|export|ดาวน์โหลด/i.test(a)) return 'export'
  if (/เข้าถึง|เปิดดู|access|need-to-know/i.test(a)) return 'access'
  if (/ลงนาม|signature|signed/i.test(a)) return 'signing'
  if (/ปิดงาน|ยุติ|termina/i.test(a)) return 'closing'
  if (/รับเรื่อง|รับคำร้อง|เข้าทะเบียน|intake/i.test(a)) return 'intake'
  if (/มอบหมาย|assign/i.test(a)) return 'assignment'
  if (/เอกสาร|จัดทำ|แก้ไข|อัปโหลด|แนบ|document/i.test(a)) return 'document'
  return 'other'
}

/** รูปแบบเหตุการณ์รวมหนึ่งเดียว — ผสาน assignmentHistory (การดำเนินการ) กับ access log (การเข้าถึงข้อมูลพยาน) ให้เรียงเวลาเดียวกัน */
export interface UnifiedAuditEvent {
  key: string
  /** history = การดำเนินการในแฟ้ม (assignmentHistory) · access = บันทึกการเข้าถึงข้อมูลพยาน (useAuditStore) */
  source: 'history' | 'access'
  timestamp: string
  sortValue: number
  actor: string
  role?: string
  category: AuditCategory
  action: string
  detail: string
  docRef?: string
  device?: string
  ipAddress?: string
}

export function buildUnifiedAuditTimeline(
  history: Array<{ at: string; action: string; actor: string; detail: string }>,
  accessLogs: AuditEntry[]
): UnifiedAuditEvent[] {
  const fromHistory: UnifiedAuditEvent[] = history.map((h, i) => ({
    key: `hist-${i}-${h.at}`,
    source: 'history',
    timestamp: h.at,
    sortValue: parseAnyDate(h.at)?.getTime() ?? 0,
    actor: h.actor,
    category: classifyAuditAction(h.action),
    action: h.action,
    detail: h.detail,
  }))

  const fromAccess: UnifiedAuditEvent[] = accessLogs.map((l) => ({
    key: `acc-${l.id}`,
    source: 'access',
    timestamp: l.timestamp,
    sortValue: parseAnyDate(l.timestamp)?.getTime() ?? 0,
    actor: l.actorName,
    role: l.actorRole,
    category: classifyAuditAction(l.action),
    action: l.action,
    detail: l.docRef ? `เอกสารอ้างอิง: ${l.docRef}` : '-',
    docRef: l.docRef,
    device: l.device,
    ipAddress: l.ipAddress,
  }))

  return [...fromHistory, ...fromAccess].sort((a, b) => b.sortValue - a.sortValue)
}

/** ส่งออก CSV แบบมี UTF-8 BOM กันปัญหาภาษาไทยเพี้ยนเมื่อเปิดด้วย Excel */
export function buildAuditCsv(caseNo: string, events: UnifiedAuditEvent[]): string {
  const header = ['เวลา', 'ผู้กระทำ', 'บทบาท', 'หมวดหมู่', 'เหตุการณ์', 'รายละเอียด', 'เอกสารอ้างอิง', 'อุปกรณ์', 'ที่อยู่เครือข่าย']
  const escapeCsv = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const rows = events.map((e) =>
    [
      e.timestamp,
      e.actor,
      e.role || '-',
      AUDIT_CATEGORY_LABELS[e.category],
      e.action,
      e.detail,
      e.docRef || '-',
      e.device || '-',
      e.ipAddress || '-',
    ]
      .map(escapeCsv)
      .join(',')
  )
  const BOM = '﻿'
  return BOM + [`Audit Log — แฟ้ม ${caseNo}`, header.map(escapeCsv).join(','), ...rows].join('\r\n')
}
