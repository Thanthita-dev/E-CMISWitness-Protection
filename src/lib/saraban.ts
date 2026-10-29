import { kb10ClerkAllowed } from './noticeDocuments'
import type { CaseItem, SarabanCheckpoint, SarabanDispatch, SarabanDispatchFlow, SarabanRecord } from '../types/case'
import type { EcmisUser, UserRole } from '../types/user'
import { ECMIS_USER_DIRECTORY, ORG_UNITS } from './constants'
import { GOT_UNIT_NAME } from './protectionHandoff'

/**
 * ทะเบียนหนังสือรับ-ส่ง (สารบรรณ) ระหว่างหน่วยงาน
 * ผอ.สำนัก/กอง → [ธุรการสำนัก/กอง ออกเลขส่ง] → [ธุรการ สลธ. ลงเลขรับ] → รองเลขาธิการ ป.ป.ท.
 * เลขาธิการอนุมัติ → [ธุรการ สลธ. ออกเลขส่ง] → [ธุรการปลายทาง ลงเลขรับ] → ผู้รับผิดชอบ
 * ช่วงรองเลขาธิการ → เลขาธิการ ส่งตรง (สำนักงานเดียวกัน)
 *
 * เรื่องอื่นที่ข้ามระหว่างหน่วยกับสำนักงานเลขาธิการ (คบ.14 ข้อ 14 ยุติ อุทธรณ์ คบ.8 คบ.10 ผลพิจารณา/ส่งคืน)
 * ใช้ "ชุดนำส่ง" (CaseItem.sarabanDispatch) ผ่านจุดลงทะเบียนชุดเดียวกัน ทั้งขาไป ขากลับ และส่งคืนแก้ไข
 */

export const SECRETARY_OFFICE_NAME = 'สำนักงานเลขาธิการ'

/** ขั้น (stage) ใหม่ของ state machine ช่วงก่อนถึงรองเลขาธิการ ป.ป.ท. */
export const SARABAN_STAGES = {
  director_outgoing: 'director_outgoing_registry',
  secretary_incoming: 'secretary_incoming_registry',
} as const

export const SARABAN_STAGE_LABELS: Record<string, string> = {
  director_outgoing_registry: 'ธุรการสำนัก/กอง ออกเลขทะเบียนส่ง',
  secretary_incoming_registry: 'ธุรการสำนักงานเลขาธิการ ลงเลขทะเบียนรับ',
}

export const SARABAN_CHECKPOINT_META: Record<SarabanCheckpoint, { label: string; short: string; direction: 'outgoing' | 'incoming'; numberLabel: string }> = {
  director_outgoing: { label: 'ธุรการสำนัก/กอง ออกเลขทะเบียนส่ง (ขาออก)', short: 'ขาออก · สำนัก/กอง', direction: 'outgoing', numberLabel: 'เลขทะเบียนส่ง' },
  secretary_incoming: { label: 'ธุรการสำนักงานเลขาธิการ ลงเลขทะเบียนรับ (ขาเข้า)', short: 'ขาเข้า · สำนักงานเลขาธิการ', direction: 'incoming', numberLabel: 'เลขรับ' },
  secretary_outgoing: { label: 'ธุรการสำนักงานเลขาธิการ ออกเลขทะเบียนส่ง (ขาออก)', short: 'ขาออก · สำนักงานเลขาธิการ', direction: 'outgoing', numberLabel: 'เลขทะเบียนส่ง' },
  destination_incoming: { label: 'ธุรการหน่วยปลายทาง ลงเลขทะเบียนรับ (ขาเข้า)', short: 'ขาเข้า · หน่วยปลายทาง', direction: 'incoming', numberLabel: 'เลขรับ' },
}

export const SARABAN_CHECKPOINT_ORDER: SarabanCheckpoint[] = ['director_outgoing', 'secretary_incoming', 'secretary_outgoing', 'destination_incoming']

/** ชุดเสนอก่อนอนุมัติ (คบ.1 / คบ.3 / คบ.6) และชุดหลังอนุมัติที่เพิ่ม คบ.9 ที่เลขาธิการลงนามแล้ว */
export const SARABAN_SUBMISSION_FORMS = [1, 3, 6]
export const SARABAN_RESULT_FORMS = [1, 3, 6, 9]

export const sarabanFormsFor = (c: Pick<CaseItem, 'no'> & Partial<Pick<CaseItem, 'sarabanDispatch' | 'activity7State'>>, checkpoint: SarabanCheckpoint): number[] =>
  c.sarabanDispatch ? c.sarabanDispatch.flow === 'appeal' && c.sarabanDispatch.direction === 'up' ? [...new Set([3, 6, ...c.sarabanDispatch.forms])] : c.sarabanDispatch.forms
    : checkpoint === 'director_outgoing' || checkpoint === 'secretary_incoming' ? SARABAN_SUBMISSION_FORMS : c.activity7State === 'rejected' ? [1, 3, 6, 10] : SARABAN_RESULT_FORMS

/** จุดลงทะเบียนที่แฟ้มกำลังรออยู่ — null = ไม่มีงานธุรการค้าง */
export const activeSarabanCheckpoint = (c: Pick<CaseItem, 'stage' | 'protectionHandoff'> & Partial<Pick<CaseItem, 'sarabanDispatch'>>): SarabanCheckpoint | null => {
  if (c.sarabanDispatch) return c.sarabanDispatch.checkpoint
  if (c.stage === SARABAN_STAGES.director_outgoing) return 'director_outgoing'
  if (c.stage === SARABAN_STAGES.secretary_incoming) return 'secretary_incoming'
  if (c.protectionHandoff?.step === 'pending_outgoing') return 'secretary_outgoing'
  if (c.protectionHandoff?.step === 'pending_receipt' || (c.protectionHandoff?.destination === 'got' && c.protectionHandoff.step === 'received')) return 'destination_incoming'
  return null
}

/** บทบาทธุรการที่ลงทะเบียนได้ ณ จุดนั้น */
export const sarabanClerkRole = (c: Pick<CaseItem, 'protectionHandoff'> & Partial<Pick<CaseItem, 'sarabanDispatch' | 'orgUnitId' | 'sarabanOriginUnitId'>>, checkpoint: SarabanCheckpoint): UserRole => {
  if (c.sarabanDispatch) return isUnitCheckpoint(checkpoint) ? (c.sarabanDispatch.unitId === 'central-gmc' ? 'got_receiver' : c.sarabanDispatch.unitClerkRole) : 'secretary_receiver'
  if (checkpoint === 'director_outgoing') return (c.sarabanOriginUnitId || c.orgUnitId) === 'central-gmc' ? 'got_receiver' : 'receiver'
  if (checkpoint === 'destination_incoming') return c.protectionHandoff?.destination === 'got' ? 'got_receiver' : 'receiver'
  return 'secretary_receiver'
}

/** จุดลงทะเบียนฝั่งหน่วย (ไม่ใช่สำนักงานเลขาธิการ) */
export const isUnitCheckpoint = (checkpoint: SarabanCheckpoint) => checkpoint === 'director_outgoing' || checkpoint === 'destination_incoming'

type SarabanClerkScope = Pick<CaseItem, 'protectionHandoff' | 'orgUnitId'> & Partial<Pick<CaseItem, 'sarabanOriginUnitId' | 'sarabanDispatch'>>

/**
 * หน่วยงานของธุรการสำนัก/กอง ณ จุดนั้น — ออกเลขส่ง = หน่วยของ ผอ. ที่ส่งชุดเสนอ,
 * ลงเลขรับปลายทาง (เจ้าของสำนวนเดิม) = หน่วยของเจ้าของสำนวนเดิม
 */
export const sarabanClerkUnitId = (c: SarabanClerkScope, checkpoint: SarabanCheckpoint): string => {
  if (c.sarabanDispatch) return c.sarabanDispatch.unitId
  if (checkpoint === 'destination_incoming') {
    const owner = ECMIS_USER_DIRECTORY.find((u) => u.id === c.protectionHandoff?.originalOwnerUserId)
    return owner?.orgUnitId || c.orgUnitId || 'central-gmc'
  }
  return c.sarabanOriginUnitId || c.orgUnitId || 'central-gmc'
}

const isCentralUnit = (id?: string | null) => Boolean(ORG_UNITS.find((u) => u.id === id)?.isCentral)

/** ธุรการผู้รับผิดชอบจุดนั้น — ธุรการสำนัก/กอง เลือกตามหน่วยงาน (หน่วยส่วนกลางใช้ธุรการส่วนกลาง) */
export const sarabanClerkAccount = (c: SarabanClerkScope, checkpoint: SarabanCheckpoint): EcmisUser => {
  const role = sarabanClerkRole(c, checkpoint)
  const active = ECMIS_USER_DIRECTORY.filter((u) => u.active && u.roles.includes(role))
  if (role !== 'receiver') return active[0]
  const unitId = sarabanClerkUnitId(c, checkpoint)
  return active.find((u) => u.orgUnitId === unitId)
    || (isCentralUnit(unitId) ? active.find((u) => isCentralUnit(u.orgUnitId)) : undefined)
    || active[0]
}

/** ธุรการสำนัก/กอง ต้องอยู่หน่วยเดียวกับจุดลงทะเบียน (ธุรการ เขต 1 ไม่เห็นงานของส่วนกลาง) — ไม่ระบุหน่วย = ไม่ตรวจ */
const sameClerkUnit = (role: UserRole, c: SarabanClerkScope, checkpoint: SarabanCheckpoint, orgUnitId?: string | null): boolean => {
  if (role !== 'receiver' || !orgUnitId) return true
  const clerkUnit = sarabanClerkAccount(c, checkpoint)?.orgUnitId
  return clerkUnit === orgUnitId || (isCentralUnit(clerkUnit) && isCentralUnit(orgUnitId))
}

export const sarabanUnitName = (c: Pick<CaseItem, 'protectionHandoff' | 'orgUnitId'> & Partial<Pick<CaseItem, 'sarabanDispatch'>>, checkpoint: SarabanCheckpoint): string => {
  if (checkpoint === 'secretary_incoming' || checkpoint === 'secretary_outgoing') return SECRETARY_OFFICE_NAME
  if (c.sarabanDispatch?.unitClerkRole === 'got_receiver') return GOT_UNIT_NAME
  if (checkpoint === 'destination_incoming' && c.protectionHandoff?.destination === 'got') return GOT_UNIT_NAME
  return sarabanClerkAccount(c, checkpoint)?.unit || 'สำนัก/กอง'
}

export const canRecordSaraban = (
  role: UserRole,
  c: Pick<CaseItem, 'stage' | 'protectionHandoff'> & Partial<Pick<CaseItem, 'orgUnitId' | 'sarabanOriginUnitId' | 'sarabanDispatch'>>,
  checkpoint: SarabanCheckpoint,
  orgUnitId?: string | null
): boolean =>
  activeSarabanCheckpoint(c) === checkpoint &&
  (role === 'admin' || (role === sarabanClerkRole(c, checkpoint) && sameClerkUnit(role, c, checkpoint, orgUnitId)))

export const currentSarabanRound = (c: Pick<CaseItem, 'sarabanRound'>) => c.sarabanRound || 1

/**
 * ผู้รับของจุดนั้น — เลขสารบรรณออกต่อผู้รับหนึ่งราย (ไม่ใช่ต่อ คบ.) ผู้รับตั้งต้นคือปลายทางถัดไปของจุดนั้น
 * ธุรการเพิ่มผู้รับอื่นได้ (sarabanRecipients) เมื่อชุดเดียวกันต้องส่งหลายแห่ง แต่ละรายได้เลขของตนเอง
 */
export const sarabanDefaultRecipient = (c: Pick<CaseItem, 'protectionHandoff' | 'orgUnitId'> & Partial<Pick<CaseItem, 'sarabanDispatch'>>, checkpoint: SarabanCheckpoint): string => {
  const d = c.sarabanDispatch
  const got = (d ? d.unitClerkRole === 'got_receiver' : c.protectionHandoff?.destination === 'got')
  switch (checkpoint) {
    case 'director_outgoing': return SECRETARY_OFFICE_NAME
    case 'secretary_incoming': return d ? d.recipientName : 'รองเลขาธิการ ป.ป.ท.'
    case 'secretary_outgoing': return d ? sarabanUnitName(c, 'director_outgoing') : got ? GOT_UNIT_NAME : 'สำนัก/กอง เจ้าของสำนวนเดิม'
    default: return d ? d.recipientName : got ? GOT_UNIT_NAME : 'เจ้าของสำนวนเดิม'
  }
}

export const sarabanRecipientsFor = (c: Pick<CaseItem, 'protectionHandoff' | 'orgUnitId' | 'sarabanRound'> & Partial<Pick<CaseItem, 'sarabanDispatch' | 'sarabanRecipients'>>, checkpoint: SarabanCheckpoint): string[] => {
  const round = currentSarabanRound(c)
  const extras = (c.sarabanRecipients || []).filter((r) => r.checkpoint === checkpoint && r.round === round).map((r) => r.name)
  return [sarabanDefaultRecipient(c, checkpoint), ...extras]
}

/** ทะเบียนของ "ผู้รับ" ณ จุดนั้นในรอบปัจจุบัน — ฉบับล่าสุด (ข้อมูลเดิมที่ไม่ระบุผู้รับ นับเป็นของผู้รับตั้งต้น) */
export const sarabanRecordFor = (
  c: Pick<CaseItem, 'sarabanRecords' | 'sarabanRound' | 'protectionHandoff' | 'orgUnitId'> & Partial<Pick<CaseItem, 'sarabanDispatch' | 'activity7State'>>,
  checkpoint: SarabanCheckpoint,
  recipient: string
): SarabanRecord | undefined => {
  const round = currentSarabanRound(c)
  const isDefault = recipient === sarabanDefaultRecipient(c, checkpoint)
  const inRound = [...(c.sarabanRecords || [])].reverse().filter((r) => r.checkpoint === checkpoint && r.round === round)
  const own = inRound.find((r) => r.recipient === recipient)
  if (own || !isDefault) return own
  /** ข้อมูลเดิมลงรายฉบับ — นับเป็นของผู้รับตั้งต้นเมื่อเลขเดิมรวมกันครอบคลุม คบ. ทุกฉบับของจุดนั้นเท่านั้น */
  const legacy = inRound.filter((r) => !r.recipient)
  const covered = new Set(legacy.flatMap(sarabanRecordForms))
  return sarabanFormsFor({ no: '', sarabanDispatch: c.sarabanDispatch, activity7State: c.activity7State }, checkpoint).every((no) => covered.has(no)) ? legacy[0] : undefined
}

/** แบบ คบ. ที่เลขนี้ครอบคลุม (ข้อมูลเดิมลงรายฉบับ = formNo เดียว) */
export const sarabanRecordForms = (r: Pick<SarabanRecord, 'formNo' | 'forms'>): number[] => r.forms?.length ? r.forms : [r.formNo]

export const sarabanRecordsCovering = (c: Pick<CaseItem, 'sarabanRecords' | 'sarabanRound' | 'protectionHandoff' | 'orgUnitId'> & Partial<Pick<CaseItem, 'sarabanDispatch' | 'sarabanRecipients'>>, checkpoint: SarabanCheckpoint, formNo: number): SarabanRecord[] =>
  sarabanRecipientsFor(c, checkpoint)
    .map((name) => sarabanRecordFor(c, checkpoint, name))
    .filter((r): r is SarabanRecord => Boolean(r) && sarabanRecordForms(r!).includes(formNo))

export const sarabanCheckpointProgress = (c: CaseItem, checkpoint: SarabanCheckpoint) => {
  const forms = sarabanFormsFor(c, checkpoint)
  const recipients = sarabanRecipientsFor(c, checkpoint)
  const done = recipients.filter((name) => sarabanRecordFor(c, checkpoint, name))
  return { forms, recipients, done, complete: done.length === recipients.length }
}

export const sarabanCheckpointComplete = (c: CaseItem, checkpoint: SarabanCheckpoint) => sarabanCheckpointProgress(c, checkpoint).complete

/** ทะเบียนทุกจุดของ คบ. ฉบับนั้น (ล่าสุดต่อผู้รับในรอบปัจจุบัน) เรียงตามลำดับเดินหนังสือ — ใช้แสดงตราประทับบนกระดาษ */
export const sarabanStampsFor = (c: Pick<CaseItem, 'sarabanRecords' | 'sarabanRound'> & Partial<Pick<CaseItem, 'protectionHandoff' | 'orgUnitId' | 'sarabanDispatch' | 'sarabanRecipients'>> | undefined, formNo: number): SarabanRecord[] => {
  if (!c) return []
  /** รอบล่าสุดที่ คบ. ฉบับนี้ถูกลงทะเบียน — ชุดนำส่งเรื่องอื่นได้รอบใหม่ ตราของฉบับเดิมจึงไม่หาย */
  const round = Math.max(0, ...(c.sarabanRecords || []).filter((r) => sarabanRecordForms(r).includes(formNo)).map((r) => r.round))
  if (!round) return []
  /** ตราประทับดูจากทะเบียนที่บันทึกไว้จริง: ฉบับล่าสุดต่อ (จุด, ผู้รับ) ในรอบนั้น */
  const latest = new Map<string, SarabanRecord>()
  for (const r of c.sarabanRecords || []) {
    if (r.round !== round || !sarabanRecordForms(r).includes(formNo)) continue
    latest.set(`${r.checkpoint}|${r.recipient ?? ''}`, r)
  }
  return SARABAN_CHECKPOINT_ORDER.flatMap((cp) => [...latest.values()].filter((r) => r.checkpoint === cp))
}

export interface SarabanInput { number: string; date: string; time: string; documentNumber?: string }

/** ข้อความแจ้งเตือนรายช่อง — ว่าง = ผ่าน */
export const validateSarabanInput = (input: SarabanInput): Partial<Record<keyof SarabanInput, string>> => {
  const errors: Partial<Record<keyof SarabanInput, string>> = {}
  if (input.documentNumber !== undefined && !input.documentNumber.trim()) errors.documentNumber = 'กรุณาระบุเลขที่หนังสือ'
  if (!input.number.trim()) errors.number = 'กรุณาระบุเลขทะเบียน'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.date = 'กรุณาระบุวันที่'
  if (!/^\d{2}:\d{2}$/.test(input.time)) errors.time = 'กรุณาระบุเวลา'
  return errors
}

/** เลขทะเบียนส่งถัดไปของหน่วยงานในปีนั้น รวมทุกแฟ้ม */
export const nextOutgoingSarabanNumber = (cases: (Pick<CaseItem, 'sarabanRecords'> & Partial<Pick<CaseItem, 'kb10DispatchNumbering'>>)[], unitName: string, date: string): string => {
  const year = Number(date.slice(0, 4)) + 543
  const used = cases.flatMap((c) => c.sarabanRecords || [])
    .filter((r) => r.direction === 'outgoing' && r.unitName === unitName && r.date.slice(0, 4) === date.slice(0, 4))
    .map((r) => Number(/^(\d+)(?:\/\d{4})?$/.exec(r.number)?.[1] || 0))
  const notices = cases.map((c) => c.kb10DispatchNumbering).filter((n) => n?.unitName === unitName && n.date.slice(0, 4) === date.slice(0, 4)).map((n) => Number(n?.registryNumber?.split('/')[0] || 0))
  return `${String(Math.max(0, ...used, ...notices) + 1).padStart(4, '0')}/${year}`
}

/** ค่าตั้งต้นให้กดผ่านได้ลื่น: เลขถัดไปของจุดนั้น วันที่และเวลาปัจจุบัน */
export const suggestSarabanInput = (
  c: Pick<CaseItem, 'sarabanRecords'> & Partial<Pick<CaseItem, 'sarabanRound' | 'no' | 'sarabanDispatch' | 'sarabanRecipients' | 'protectionHandoff' | 'orgUnitId'>>,
  checkpoint: SarabanCheckpoint,
  now = new Date(),
  recipient?: string
): SarabanInput => {
  const records = c.sarabanRecords || []
  /** เลขต่อกันทีละผู้รับ — ผู้รับก่อนหน้าที่ยังไม่ลงเลขจองเลขไว้ก่อน จึงไม่ได้เลขซ้ำกันทุกราย */
  const scoped = { sarabanRecords: records, sarabanRound: c.sarabanRound, protectionHandoff: c.protectionHandoff, orgUnitId: c.orgUnitId || '', sarabanDispatch: c.sarabanDispatch, sarabanRecipients: c.sarabanRecipients }
  const names = sarabanRecipientsFor(scoped, checkpoint)
  const index = recipient ? names.indexOf(recipient) : -1
  const ahead = index > 0 ? names.slice(0, index).filter((n) => !sarabanRecordFor(scoped, checkpoint, n)).length : 0
  const used = records.filter((r) => r.checkpoint === checkpoint).length + ahead
  const base = { director_outgoing: 540, secretary_incoming: 550, secretary_outgoing: 610, destination_incoming: 720 }[checkpoint]
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    number: String(base + used + 1),
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  }
}

const THAI_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** 2026-03-09 → 9 มี.ค. 2569 */
export const formatSarabanDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} ${THAI_MONTH_SHORT[Number(m[2]) - 1]} ${Number(m[1]) + 543}`
}

/** บทบาทธุรการที่มีคิวลงทะเบียนของแฟ้มนี้ */
export const isSarabanQueueCase = (
  role: UserRole,
  c: Pick<CaseItem, 'stage' | 'protectionHandoff'> & Partial<Pick<CaseItem, 'orgUnitId' | 'sarabanOriginUnitId' | 'sarabanDispatch' | 'assignedOfficerUserId' | 'activity7State' | 'resultNotices' | 'kb10DispatchRequestedAt' | 'kb10DispatchNumbering' | 'nonApprovalClosedAt' | 'nonApprovalDestination'>>,
  orgUnitId?: string | null
): boolean => {
  if (!c.sarabanDispatch && c.activity7State === 'rejected' && (c.kb10DispatchRequestedAt || c.kb10DispatchNumbering) && c.resultNotices?.[10]?.original && c.resultNotices[10].status !== 'sent' && !c.nonApprovalClosedAt && kb10ClerkAllowed(role, c, orgUnitId)) return true
  const cp = activeSarabanCheckpoint(c)
  return Boolean(cp) && sarabanClerkRole(c, cp!) === role && sameClerkUnit(role, c, cp!, orgUnitId)
}

/** มีชุดนำส่งค้างอยู่ที่ธุรการ (ระบุ flow = เฉพาะเรื่องนั้น) — ผู้รับยังดำเนินการต่อไม่ได้จนกว่าจะลงเลขรับครบ */
export const sarabanInTransit = (c: Partial<Pick<CaseItem, 'sarabanDispatch'>> | null | undefined, flow?: SarabanDispatchFlow): boolean =>
  Boolean(c?.sarabanDispatch && !c.sarabanDispatch.postal?.deliveredAt && (!flow || c.sarabanDispatch.flow === flow))

/**
 * ธุรการฝั่งหน่วยของแฟ้มนี้ — กอท. เป็นหน่วยหนึ่งเหมือนเขต: แฟ้มที่ส่งต่อ กอท. ใช้ธุรการคดี กอท.
 * แฟ้มที่ส่งคืนเจ้าของสำนวนเดิมใช้ธุรการของหน่วยเจ้าของสำนวน ที่เหลือใช้หน่วยของแฟ้ม
 */
export const dispatchUnitFor = (c: Pick<CaseItem, 'protectionHandoff' | 'orgUnitId'> & Partial<Pick<CaseItem, 'sarabanOriginUnitId' | 'assignedOfficerUserId' | 'gotRevision' | 'nonApprovalDestination'>>): { role: 'receiver' | 'got_receiver'; unitId: string } => {
  /** FB-018 — รองเลขาธิการฯ ส่งกลับให้ กอท. แก้ไขก่อนอนุมัติ ใช้ธุรการคดี กอท. เช่นเดียวกับงานส่งต่อ กอท. */
  if (c.nonApprovalDestination === 'got' || c.protectionHandoff?.destination === 'got' || c.gotRevision) return { role: 'got_receiver', unitId: 'central-gmc' }
  const ownerId = c.protectionHandoff?.originalOwnerUserId || c.assignedOfficerUserId
  const owner = ECMIS_USER_DIRECTORY.find((u) => u.id === ownerId)
  const unitId = c.sarabanOriginUnitId || owner?.orgUnitId || c.orgUnitId || 'central-gmc'
  return { role: unitId === 'central-gmc' ? 'got_receiver' : 'receiver', unitId }
}

export type SarabanDispatchInput = Pick<SarabanDispatch, 'flow' | 'direction' | 'forms' | 'subject'>

/** ข้อความสถานะระหว่างรอธุรการ ณ จุดนั้น */
export const dispatchWaitingText = (c: Pick<CaseItem, 'protectionHandoff' | 'orgUnitId'> & { sarabanDispatch: SarabanDispatch }, checkpoint: SarabanCheckpoint) => {
  const d = c.sarabanDispatch
  const forms = d.forms.map((n) => `คบ.${n}`).join(' / ')
  const unitClerk = `ธุรการ${sarabanUnitName(c, 'director_outgoing')}`
  const secClerk = `ธุรการ${SECRETARY_OFFICE_NAME}`
  switch (checkpoint) {
    case 'director_outgoing': return { status: `${d.subject} · รอ${unitClerk} ออกเลขทะเบียนส่ง`, next: `${unitClerk} ออกเลขทะเบียนส่ง ${forms} แล้วส่ง${secClerk}` }
    case 'secretary_incoming': return { status: `${d.subject} · รอ${secClerk} ลงเลขทะเบียนรับ`, next: `${secClerk} ลงเลขทะเบียนรับ ${forms} แล้วส่ง${d.recipientName}` }
    case 'secretary_outgoing': return { status: `${d.subject} · รอ${secClerk} ออกเลขทะเบียนส่ง`, next: `${secClerk} ออกเลขทะเบียนส่ง ${forms} แล้วส่ง${unitClerk}` }
    default: return { status: `${d.subject} · รอ${unitClerk} ลงเลขทะเบียนรับ`, next: `${unitClerk} ลงเลขทะเบียนรับ ${forms} แล้วส่ง${d.recipientName}` }
  }
}

/** ชื่อจุดลงทะเบียนที่แสดงบนจอ — ชุดนำส่งระบุชื่อหน่วยจริง (เขต / กอท.) และเรื่องที่นำส่ง */
export const sarabanCheckpointLabel = (c: Pick<CaseItem, 'protectionHandoff' | 'orgUnitId'> & Partial<Pick<CaseItem, 'sarabanDispatch'>>, checkpoint: SarabanCheckpoint): string => {
  const d = c.sarabanDispatch
  if (!d) return SARABAN_CHECKPOINT_META[checkpoint].label
  const outgoing = SARABAN_CHECKPOINT_META[checkpoint].direction === 'outgoing'
  return `ธุรการ${sarabanUnitName(c, checkpoint)} ${outgoing ? 'ออกเลขทะเบียนส่ง (ขาออก)' : 'ลงเลขทะเบียนรับ (ขาเข้า)'} · ${d.subject}`
}
