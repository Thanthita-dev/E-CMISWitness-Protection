import { AppealFolderStage, CaseItem, ExtensionRequest, Kb6SignerRole, MonthlyReport, OutgoingNoticeFormNo } from '../types/case'
import { isKb14StageReviewer, isGotIntakeCase } from './protectionHandoff'
import { UserRole } from '../types/user'
import { sarabanInTransit } from './saraban'

/**
 * แหล่งความจริงเดียวของ "แบบ คบ. ฉบับใดลงนามอย่างไร"
 * ใช้ร่วมกันระหว่างรายการแบบฟอร์มในแฟ้ม (ปุ่มลงนาม) และแผงลงนามในโมดัล
 */

export type FormSignatureKind = 'kb6' | 'outgoing' | 'kb11' | 'kb13'

export interface Kb6Signer {
  role: Kb6SignerRole
  no: string
  label: string
  /** บทบาทผู้ใช้ที่มีสิทธิ์ลงนามในข้อนี้ */
  userRole: UserRole
  signerRole: string
  /** ช่องชื่อผู้ลงนามในแบบ คบ.6 ที่จะถูกเติมให้ตรงกับผู้ลงนามจริง */
  nameField: string
  /**
   * ช่องความเห็นของข้อนี้ในแบบ คบ.6 — WIT0507 กำหนดให้ "บันทึกความเห็น" มาก่อน "ลงนามรับรอง"
   * จอลงนามจึงเปิดช่องนี้ให้กรอก และบังคับว่าต้องมีความเห็นก่อนจึงลงนามรับรองได้
   */
  opinionField: string
  /** ขั้นตอนของแฟ้มที่เปิดให้ลงนามข้อนี้ */
  stage: string
  signedAt: (c: CaseItem) => string | undefined
  signedBy: (c: CaseItem) => string | undefined
}

/** ข้อ 10–13 ของ คบ.6 — ความเห็นตามลำดับชั้น */
/**
 * ความเห็นตั้งต้นของข้อ 10–13 ใน คบ.6 (โหมดสาธิต) — ผู้ลงนามกด "ลงนาม" ได้ทันทีโดยไม่ต้องกรอกความเห็นเอง
 * ถ้าช่องความเห็นของข้อนั้นว่าง ระบบเติมข้อความนี้ให้ตอนลงนาม (กรอก/แก้ความเห็นเองในแบบฟอร์มก่อนลงนามได้ตามเดิม)
 */
export const KB6_DEFAULT_OPINION = 'เห็นควรดำเนินการตามที่เสนอ'

export const KB6_SIGNERS: Kb6Signer[] = [
  {
    role: 'supervisor',
    no: '10',
    label: 'ความเห็นผู้บังคับบัญชาชั้นต้น',
    userRole: 'supervisor',
    signerRole: 'ผู้บังคับบัญชาชั้นต้น',
    nameField: 'ผู้บังคับบัญชา',
    opinionField: 'ความเห็นผู้บังคับบัญชาชั้นต้น',
    stage: 'supervisor_review',
    signedAt: (c) => c.kb6SupervisorSignedAt,
    signedBy: (c) => c.kb6SupervisorSignedBy,
  },
  {
    role: 'director',
    no: '11',
    label: 'ความเห็นผู้อำนวยการสำนัก',
    userRole: 'director',
    signerRole: 'ผู้อำนวยการสำนัก/กอง',
    nameField: 'ผู้อำนวยการ',
    opinionField: 'ความเห็นผู้อำนวยการ',
    stage: 'director_review',
    signedAt: (c) => c.kb6DirectorSignedAt,
    signedBy: (c) => c.kb6DirectorSignedBy,
  },
  {
    role: 'deputy',
    no: '12',
    label: 'ความเห็นรองเลขาธิการฯ',
    userRole: 'deputy_secretary',
    signerRole: 'รองเลขาธิการ ป.ป.ท.',
    nameField: 'รองเลขาธิการ',
    opinionField: 'ความเห็นรองเลขาธิการ',
    stage: 'deputy_review',
    signedAt: (c) => c.kb6DeputySignedAt,
    signedBy: (c) => c.kb6DeputySignedBy,
  },
  {
    role: 'secretary',
    no: '13',
    label: 'ความเห็นเลขาธิการฯ',
    userRole: 'secretary',
    signerRole: 'เลขาธิการ ป.ป.ท.',
    nameField: 'เลขาธิการ',
    opinionField: 'ความเห็นเลขาธิการ',
    stage: 'external_pending',
    signedAt: (c) => c.kb6SecretarySignedAt,
    signedBy: (c) => c.kb6SecretarySignedBy,
  },
]

export interface OutgoingNoticeMeta {
  code: string
  label: string
  /** เส้นทางผลพิจารณาที่หนังสือฉบับนี้ใช้ */
  track: 'approved' | 'rejected'
  /** ช่องชื่อผู้ลงนามในแบบฟอร์ม ที่จะถูกเติมให้ตรงกับผู้ลงนามจริง */
  nameField?: string
  signedAt: (c: CaseItem) => string | undefined
  signedBy: (c: CaseItem) => string | undefined
}

/** หนังสือส่งออกที่เลขาธิการ ป.ป.ท. ลงนามรายฉบับ */
export const OUTGOING_NOTICES: Record<OutgoingNoticeFormNo, OutgoingNoticeMeta> = {
  8: {
    code: 'คบ.8',
    label: 'คำสั่งมอบหมายเจ้าพนักงานดำเนินการคุ้มครองพยาน',
    track: 'approved',
    signedAt: (c) => c.kb8SignedAt,
    signedBy: (c) => c.kb8SignedBy,
  },
  9: {
    code: 'คบ.9',
    label: 'หนังสือแจ้งตอบรับการให้ความคุ้มครอง',
    track: 'approved',
    nameField: 'เลขาธิการ',
    signedAt: (c) => c.kb9SignedAt,
    signedBy: (c) => c.kb9SignedBy,
  },
  10: {
    code: 'คบ.10',
    label: 'หนังสือแจ้งไม่ให้การคุ้มครองพยาน',
    track: 'rejected',
    nameField: 'เลขาธิการ',
    signedAt: (c) => c.kb10SignedAt,
    signedBy: (c) => c.kb10SignedBy,
  },
}

/** ช่องลายมือชื่อท้ายบันทึกข้อตกลง คบ.11 — ไม่ลงนามพยานในการทำข้อตกลงในระบบ (ช่องบนแบบพิมพ์คงไว้ให้ลงมือ) */
export const KB11_SIGN_SLOTS = [
  { key: 'kb11-witness', label: 'พยานผู้รับการคุ้มครอง', role: 'พยาน' },
  { key: 'kb11-officer', label: 'ผู้ให้การคุ้มครอง (เจ้าพนักงาน ป.ป.ท.)', role: 'เจ้าพนักงาน ป.ป.ท.' },
] as const

/** ช่องลายมือชื่อท้ายบันทึกข้อเท็จจริง คบ.3 — ผู้ให้ถ้อยคำลงนามต่อหน้าเจ้าพนักงาน (ไม่บังคับก่อนบันทึก) */
export const KB3_SIGN_SLOTS = [
  { key: 'kb3-witness', label: 'ผู้ให้ถ้อยคำ', role: 'ผู้ให้ถ้อยคำ' },
  { key: 'kb3-officer', label: 'เจ้าพนักงาน ป.ป.ท.', role: 'เจ้าพนักงาน' },
] as const

/**
 * ช่องลายมือชื่อท้ายรายงานผลประจำงวด คบ.13 — WIT1006 เจ้าหน้าที่ผู้ปฏิบัติ แล้ว WIT1007 พยานรับรอง
 * ลงนามรายรอบรายงาน ไม่ใช่รายแฟ้ม จึงเก็บลายมือชื่อไว้ที่ MonthlyReport ของงวดนั้น
 */
export const KB13_SIGN_SLOTS = [
  {
    key: 'officer' as const,
    code: 'WIT1006',
    label: 'เจ้าหน้าที่ผู้ปฏิบัติ',
    role: 'เจ้าพนักงาน ป.ป.ท. ผู้ปฏิบัติ',
    signedAt: (r: MonthlyReport) => r.officerSignedAt,
    signedBy: (r: MonthlyReport) => r.officerSignedBy,
  },
  {
    key: 'witness' as const,
    code: 'WIT1007',
    label: 'พยานผู้รับการคุ้มครอง (ลงนามรับรอง)',
    role: 'พยาน',
    signedAt: (r: MonthlyReport) => r.witnessSignedAt,
    signedBy: (r: MonthlyReport) => r.witnessSignedBy,
  },
]

export type Kb13SignSlot = (typeof KB13_SIGN_SLOTS)[number]['key']

/** แบบ คบ. ที่มีขั้นตอนลงนามของตัวเอง — ลงนามได้จากรายการแบบฟอร์มในแฟ้มเท่านั้น */
export const SIGNABLE_FORMS: number[] = [6, 8, 9, 10, 11, 13]

export const getFormSignatureKind = (formNo: number): FormSignatureKind | null => {
  if (formNo === 6) return 'kb6'
  if (formNo === 8 || formNo === 9 || formNo === 10) return 'outgoing'
  if (formNo === 11) return 'kb11'
  if (formNo === 13) return 'kb13'
  return null
}

/**
 * รอบรายงาน คบ.13 ที่รอลงนามอยู่ — WIT1005 จัดทำแล้วแต่ยังลงนามไม่ครบสองช่อง
 * เรียงตามลำดับที่บันทึกไว้ จึงหยิบรอบเก่าสุดที่ยังค้างก่อน ไม่ข้ามรอบที่ยังไม่รับรอง
 * รอบหนังสือภายนอก (source = external) ไม่มีการลงนามในระบบ จึงไม่นับเป็นรอบค้าง
 */
export const pendingKb13Report = (caseItem: CaseItem): MonthlyReport | undefined =>
  (caseItem.monthlyReports || []).find((r) => r.source !== 'external' && (!r.officerSignedAt || !r.witnessSignedAt))

/** รอบล่าสุดที่ลงนามครบทั้งสองช่องแล้ว — ใช้แสดงสถานะเมื่อไม่มีรอบค้าง */
export const latestSignedKb13Report = (caseItem: CaseItem): MonthlyReport | undefined =>
  [...(caseItem.monthlyReports || [])].reverse().find((r) => r.officerSignedAt && r.witnessSignedAt)

/** หนังสือส่งออกฉบับนี้ตรงกับผลพิจารณาของแฟ้มหรือไม่ */
export const outgoingTrackMatches = (meta: OutgoingNoticeMeta, caseItem: CaseItem): boolean =>
  meta.track === 'approved' ? caseItem.activity7State === 'approved' : caseItem.activity7State === 'rejected'

/**
 * หนังสือส่งออกฉบับนี้ผ่านด่านก่อนรอบลงนามมาแล้วหรือยัง
 * · เส้นทางอนุมัติ — เจ้าหน้าที่เสนอ คบ.9 เข้ารอบลงนาม (approvalStep >= 2)
 * · เส้นทางไม่อนุมัติ — WIT0904 เจ้าหน้าที่ตรวจครบ แล้ว WIT0905 รองเลขาธิการฯ กลั่นกรองผ่าน
 *   (nonApprovalStep >= 2) ผังไม่ให้ร่าง คบ.10 ข้ามด่านแจ้งสิทธิอุทธรณ์ไปถึงผู้ลงนามโดยตรง
 */
export const outgoingSubmitted = (meta: OutgoingNoticeMeta, caseItem: CaseItem): boolean =>
  meta.track === 'rejected' ? (caseItem.nonApprovalStep || 0) >= 2 : (caseItem.approvalStep || 0) >= 2

export interface ActiveExtensionDocs {
  round: number
  kb3Version: number
  kb6Version: number
  request?: ExtensionRequest
  editable: boolean
}

/** คบ.3/คบ.6 ฉบับขยายเวลาที่ยังอยู่ในรอบพิจารณา (ยังไม่มีคำขอ หรือคำขอยังเป็น submitted/pending/returned) */
export function getActiveExtensionDocs(c: CaseItem): ActiveExtensionDocs | null {
  const docs = c.extensionDocs
  if (!docs) return null
  const request = c.extensionRequests?.[docs.round - 1]
  if (request && !['submitted', 'pending', 'returned'].includes(request.status)) return null
  return {
    round: docs.round,
    kb3Version: docs.kb3Version,
    kb6Version: docs.kb6Version,
    request,
    editable: !request || request.status === 'returned' || !request.kb6Snapshot,
  }
}

/**
 * บันทึกเพิ่มเติม (ขอขยายระยะเวลา) ของ คบ.3/คบ.6/คบ.14 — หนึ่งรายการต่อการขอขยายหนึ่งครั้ง แนบต่อท้ายแบบฉบับเดิม
 * ฉบับเดิมของ คบ.3/คบ.6 ไม่ถูกนับเป็นฉบับใหม่ ครั้งที่ของบันทึก = ครั้งที่ขอขยาย (round)
 */
export const addendumLabel = (round: number) => `บันทึกเพิ่มเติม ครั้งที่ ${round}`

export interface ExtensionAddendum {
  round: number
  /** เลขรุ่นภายในของร่าง คบ.3/คบ.6 ที่ใช้เป็นบันทึกนี้ (ไม่แสดงต่อผู้ใช้) — คบ.14 ไม่มี */
  version?: number
  request?: ExtensionRequest
  /** บันทึกล่าสุด — คบ.3/คบ.6 คือร่างที่เปิดในแบบฟอร์ม, คบ.14 คือคำขอล่าสุด */
  current: boolean
}

/** เลขรุ่นภายในของ คบ.3/คบ.6 ที่เป็นบันทึกเพิ่มเติมครั้งที่ round */
export function extensionAddendumVersion(c: CaseItem, formNo: 3 | 6, round: number): number | undefined {
  const docs = c.extensionDocs
  if (docs?.round === round) return formNo === 3 ? docs.kb3Version : docs.kb6Version
  const req = c.extensionRequests?.[round - 1]
  return formNo === 3 ? req?.kb3DocVersion ?? req?.docVersion : req?.docVersion
}

/** ครั้งที่ของบันทึกเพิ่มเติมที่ใช้รุ่นภายใน version (undefined = เป็นฉบับเดิม/ฉบับแก้ไขของฉบับเดิม) */
export function addendumRoundForVersion(c: CaseItem, formNo: 3 | 6, version: number): number | undefined {
  const rounds = Math.max(c.extensionDocs?.round || 0, c.extensionRequests?.length || 0)
  for (let round = 1; round <= rounds; round++) if (extensionAddendumVersion(c, formNo, round) === version) return round
  return undefined
}

/** บันทึกเพิ่มเติมของ คบ.3/คบ.6 ที่จัดทำประกอบแฟ้มอุทธรณ์ — แยกจากครั้งที่ของการขอขยายเวลา */
export const APPEAL_ADDENDUM_LABEL = 'ฉบับใหม่สำหรับอุทธรณ์'

/** รุ่นภายในของ คบ.3/คบ.6 ที่เป็นบันทึกเพิ่มเติม (อุทธรณ์) */
export function appealAddendumVersion(c: CaseItem, formNo: 3 | 6): number | undefined {
  const addendum = c.appealFolder?.addendum
  return addendum ? (formNo === 3 ? addendum.kb3Version : addendum.kb6Version) : undefined
}

/** รุ่นนี้เป็นบันทึกเพิ่มเติม (ขยายเวลาหรืออุทธรณ์) ไม่ใช่ฉบับเดิม/ฉบับแก้ไขของฉบับเดิม */
export const isAddendumVersion = (c: CaseItem, formNo: 3 | 6, version: number): boolean =>
  addendumRoundForVersion(c, formNo, version) !== undefined || appealAddendumVersion(c, formNo) === version

/** ป้ายของรุ่นภายใน — บันทึกเพิ่มเติมครั้งที่ N / บันทึกเพิ่มเติม (อุทธรณ์) / ฉบับเดิม */
export function versionLabelFor(c: CaseItem, formNo: 3 | 6, version: number): string {
  if (appealAddendumVersion(c, formNo) === version) return APPEAL_ADDENDUM_LABEL
  const round = addendumRoundForVersion(c, formNo, version)
  return round ? addendumLabel(round) : `ฉบับเดิม (ฉบับที่ ${version})`
}

/** ขั้นแฟ้มอุทธรณ์ที่บันทึกเพิ่มเติม (อุทธรณ์) ยังเป็นร่าง — ตั้งแต่รับเรื่องจนถึงก่อนเสนอ ผบช.ชั้นต้น */
export const APPEAL_ADDENDUM_DRAFT_STAGES: AppealFolderStage[] = ['received', 'late_pending', 'officer_opinion']

/** บันทึกเพิ่มเติม (อุทธรณ์) ยังแก้ไขได้ — ตั้งแต่รับคำอุทธรณ์จนกว่าเจ้าหน้าที่จะเสนอ ผบช.ชั้นต้น */
export const appealAddendumEditable = (c: CaseItem): boolean =>
  Boolean(c.appealFolder?.addendum) && APPEAL_ADDENDUM_DRAFT_STAGES.includes(c.appealFolder!.stage)

/** รายการบันทึกเพิ่มเติมของแบบ เรียงตามครั้งที่ขอขยาย */
export function extensionAddenda(c: CaseItem, formNo: 3 | 6 | 14): ExtensionAddendum[] {
  const requests = c.extensionRequests || []
  if (formNo === 14) return requests.map((request, i) => ({ round: i + 1, request, current: i === requests.length - 1 }))
  const rounds = Math.max(c.extensionDocs?.round || 0, requests.length)
  const lastRound = c.extensionDocs?.round
  const list: ExtensionAddendum[] = []
  for (let round = 1; round <= rounds; round++) {
    const version = extensionAddendumVersion(c, formNo, round)
    if (!version) continue
    list.push({ round, version, request: requests[round - 1], current: round === lastRound })
  }
  return list
}

/** ขั้นอนุมัติ คบ.14 ↔ ผู้ลงนามข้อ 10–13 ใน คบ.6 */
export function extensionKb6SignerFor(stage: ExtensionRequest['approvalStage']): Kb6Signer | undefined {
  const role: Kb6SignerRole | undefined =
    stage === 'supervisor' ? 'supervisor' : stage === 'director' ? 'director' : stage === 'deputy_secretary' ? 'deputy' : stage === 'secretary' ? 'secretary' : undefined
  return role ? KB6_SIGNERS.find((s) => s.role === role) : undefined
}

/** ผู้ลงนาม คบ.6 ฉบับขยายเวลาที่ถึงคิวของบทบาทนี้ (null = ไม่มี) */
export function extensionKb6PendingSigner(c: CaseItem, role: string): Kb6Signer | null {
  const active = getActiveExtensionDocs(c)
  const request = active?.request
  if (!request?.kb6Snapshot || !['submitted', 'pending'].includes(request.status)) return null
  /** อยู่ระหว่างธุรการลงทะเบียนนำส่ง — ยังไม่ถึงคิวผู้ลงนาม */
  if (c.sarabanDispatch?.flow === 'kb14') return null
  const signer = extensionKb6SignerFor(request.approvalStage || 'supervisor')
  if (!signer || request.kb6Signatures?.[signer.role]) return null
  if (isKb14StageReviewer(role, request.approvalStage || 'supervisor', c)) return signer
  return null
}

export interface SignEligibilityInput {
  formNo: number
  caseItem: CaseItem
  currentRole: UserRole
  /** สิทธิ์แก้ไขแฟ้ม — ใช้ตัดสินการลงนามในบันทึกข้อตกลง คบ.11 */
  canEditDossier: boolean
}

/**
 * WIT0806 → WIT0807 — คบ.11 เปิดได้ต่อเมื่อ คบ.9 ถึงมือพยานและบันทึกร่องรอยการรับครบแล้ว
 * (ลงนาม → นำส่ง → วันที่รับ → ผู้รับ → หลักฐานการรับทราบ)
 */
export interface Kb11GateResult {
  unlocked: boolean
  /** เหตุผลข้อแรกที่ยังปลดล็อกไม่ได้ — ใช้แสดงใต้รายการแบบฟอร์ม */
  reason?: string
}

export const kb11Gate = (caseItem: CaseItem): Kb11GateResult => {
  if (caseItem.appealResolution?.outcome === 'overturn') return sarabanInTransit(caseItem, 'appeal') ? { unlocked: false, reason: 'รอธุรการลงรับผลอุทธรณ์และส่งต่อ' } : { unlocked: true }
  if (caseItem.activity7State === 'rejected') return { unlocked: false, reason: 'ผลไม่อนุมัติใช้ คบ.10 ไม่เข้าสู่ข้อตกลง คบ.11' }
  if (!caseItem.kb9Signed) return { unlocked: false, reason: 'คบ.9 ยังไม่ผ่านการลงนามของเลขาธิการ ป.ป.ท.' }
  if (!caseItem.dispatchedAt) return { unlocked: false, reason: 'ยังไม่ได้บันทึกการส่ง/มอบ คบ.9 (ช่องทางและวันที่ส่ง)' }
  if (!caseItem.deliveredAt) return { unlocked: false, reason: 'ยังไม่ได้บันทึกวันที่พยานได้รับ คบ.9' }
  if (!caseItem.deliveryRecipient) return { unlocked: false, reason: 'ยังไม่ได้บันทึกชื่อผู้รับหนังสือ คบ.9' }
  if (!caseItem.deliveryAckType) return { unlocked: false, reason: 'ยังไม่ได้บันทึกหลักฐานการรับทราบ คบ.9' }
  return { unlocked: true }
}

/**
 * ผู้ใช้คนนี้แก้ไข/ลงนามข้อความเห็นข้อนี้ของ คบ.6 ได้หรือไม่ — WIT0513
 * แหล่งความจริงเดียวที่ผูก "สิทธิ์แก้ไขช่องความเห็น" เข้ากับ "สิทธิ์ลงนามข้อนั้น" ไว้ด้วยกัน
 * ใช้ร่วมกันทั้งช่องกรอกความเห็นในหน้าฟอร์ม (Kb6FormEditor) ปุ่มลงนาม (Kb6SignatureActions)
 * และ canSignFormNow ด้านล่าง — ต้อง (1) ยังไม่ลงนาม (2) แฟ้มอยู่ในขั้นของข้อนี้พอดี
 * (3) ผู้ใช้เป็นบทบาทของข้อนี้ หรือเป็น admin
 */
export const canEditKb6Opinion = (
  signer: Kb6Signer,
  currentRole: UserRole,
  caseItem: CaseItem
): boolean => {
  if (caseItem.appealFolder?.addendum) {
    return caseItem.appealFolder.stage === signer.role && !sarabanInTransit(caseItem, 'appeal') &&
      (currentRole === 'admin' || currentRole === signer.userRole || (signer.role === 'supervisor' && isKb14StageReviewer(currentRole, 'supervisor', caseItem)) || (signer.role === 'director' && isKb14StageReviewer(currentRole, 'director', caseItem)))
  }
  if (signer.signedAt(caseItem)) return false
  if (caseItem.stage !== signer.stage) return false
  /** FB-018 — รอบแก้ไขที่ กอท. รับไปทำ: ผบช.ต้น กอท. / ผอ. กอท. ลงนามข้อ 10 / 11 แทนสายของสำนัก/กอง */
  const gotStandIn =
    (Boolean(caseItem.gotRevision) || isGotIntakeCase(caseItem)) &&
    ((signer.userRole === 'supervisor' && currentRole === 'got_supervisor') ||
      (signer.userRole === 'director' && currentRole === 'got_director'))
  return currentRole === 'admin' || currentRole === signer.userRole || gotStandIn
}

/**
 * ถึงคิวลงนามของผู้ใช้คนนี้ในแบบ คบ. ฉบับนี้หรือยัง
 * ใช้ตัดสินว่ารายการแบบฟอร์มในแฟ้มจะแสดงปุ่ม "ลงนาม" หรือซ่อนไว้
 */
export const canSignFormNow = ({
  formNo,
  caseItem,
  currentRole,
  canEditDossier,
}: SignEligibilityInput): boolean => {
  const isAdmin = currentRole === 'admin'
  const kind = getFormSignatureKind(formNo)
  if (!kind) return false

  if (kind === 'kb6') {
    return KB6_SIGNERS.some((s) => canEditKb6Opinion(s, currentRole, caseItem)) || extensionKb6PendingSigner(caseItem, currentRole) !== null
  }

  if (kind === 'outgoing') {
    const meta = OUTGOING_NOTICES[formNo as OutgoingNoticeFormNo]
    if (meta.signedAt(caseItem)) return false
    if (!outgoingTrackMatches(meta, caseItem)) return false
    /**
     * คบ.8 เป็นคำสั่งของขั้น 08A-1 (WIT0817/WIT0818) — ลงนามได้ต่อเมื่อพยานลงนามข้อตกลง คบ.11
     * วิธีที่อนุมัติมีวิธีที่ 1 อยู่ด้วย และเจ้าหน้าที่เสนอร่างเข้ารอบลงนามแล้ว (kb8SubmittedAt)
     * ไม่ใช่ส่วนหนึ่งของรอบลงนามหนังสือแจ้งผล
     */
    if (formNo === 8) {
      if (!caseItem.kb11Signed) return false
      if (!(caseItem.approvedMethods || []).includes(1)) return false
      if (!caseItem.kb8SubmittedAt) return false
      if (sarabanInTransit(caseItem, 'kb8')) return false // ขาไป/ขากลับยังอยู่ระหว่างธุรการ
      return isAdmin || currentRole === 'secretary'
    }
    if (formNo === 9 || formNo === 10) return false // หนังสือแจ้งผลลงนามพร้อมการพิจารณาที่หน้าเลขาธิการ
    if (!outgoingSubmitted(meta, caseItem)) return false
    return isAdmin || currentRole === 'secretary'
  }

  /**
   * คบ.13 — WIT1006/WIT1007 ลงนามรายรอบรายงาน เปิดได้เมื่อมีรอบที่จัดทำแล้วและยังลงนามไม่ครบ
   * เจ้าของสำนวนเป็นผู้เปิดให้ลงนามทั้งช่องเจ้าหน้าที่และช่องพยาน เช่นเดียวกับ คบ.11
   */
  if (kind === 'kb13') {
    if (!pendingKb13Report(caseItem)) return false
    return canEditDossier || isAdmin
  }

  /** คบ.11 — เจ้าของสำนวนเปิดให้พยานและเจ้าพนักงานลงลายมือชื่อในข้อตกลง */
  if (caseItem.kb11Signed) return false
  if (!kb11Gate(caseItem).unlocked) return false
  return canEditDossier || isAdmin
}

/**
 * ตำแหน่งผู้ลงนามที่ถึงคิวของผู้ใช้คนนี้ในแบบ คบ. ฉบับนี้ (null = ยังไม่ถึงคิว)
 * ใช้แสดงกรอบแดงและป้าย "รอลงนาม: ..." ในรายการแบบฟอร์มของแฟ้ม — เงื่อนไขเดียวกับ canSignFormNow
 */
export const pendingSignerLabel = (input: SignEligibilityInput): string | null => {
  if (!canSignFormNow(input)) return null
  const { formNo, caseItem, currentRole } = input
  const kind = getFormSignatureKind(formNo)
  if (kind === 'kb6') {
    const signer =
      KB6_SIGNERS.find((s) => canEditKb6Opinion(s, currentRole, caseItem)) ||
      extensionKb6PendingSigner(caseItem, currentRole)
    return signer ? signer.signerRole : null
  }
  if (kind === 'outgoing') return 'เลขาธิการ ป.ป.ท.'
  if (kind === 'kb13') {
    const report = pendingKb13Report(caseItem)
    const slot = KB13_SIGN_SLOTS.find((s) => report && !s.signedAt(report))
    return slot ? slot.label : null
  }
  return KB11_SIGN_SLOTS[1].label
}

/**
 * เจ้าหน้าที่เสนอ คบ.8 เข้ารอบลงนามได้หรือยัง — WIT0817 (จัดทำร่าง) เสร็จแล้ว
 * และยังไม่เคยเสนอ/ยังไม่ได้ลงนาม ใช้ตัดสินปุ่ม "ส่งเสนอเลขาธิการฯ ลงนาม" ในรายการแบบฟอร์มของแฟ้ม
 */
export const canSubmitKb8Now = (caseItem: CaseItem, canEditDossier: boolean): boolean => {
  if (caseItem.kb8SignedAt || caseItem.kb8SubmittedAt) return false
  if (sarabanInTransit(caseItem, 'kb8')) return false
  if (!caseItem.kb11Signed) return false
  if (!(caseItem.approvedMethods || []).includes(1)) return false
  return canEditDossier
}

/** ลงนามครบแล้วหรือยัง — ใช้แสดงป้ายสถานะข้างปุ่ม */
export const isFormFullySigned = (
  formNo: number,
  caseItem: CaseItem
): boolean => {
  const kind = getFormSignatureKind(formNo)
  if (kind === 'kb6') return KB6_SIGNERS.every((s) => Boolean(s.signedAt(caseItem)))
  if (kind === 'outgoing') return Boolean(OUTGOING_NOTICES[formNo as OutgoingNoticeFormNo].signedAt(caseItem))
  if (kind === 'kb11') return Boolean(caseItem.kb11Signed)
  /** คบ.13 ถือว่าครบเมื่อทุกรอบที่จัดทำไว้ผ่านทั้ง WIT1006 และ WIT1007 แล้ว (ต้องมีอย่างน้อยหนึ่งรอบ) */
  if (kind === 'kb13')
    return (caseItem.monthlyReports || []).length > 0 && !pendingKb13Report(caseItem)
  return false
}

/** ช่องลายมือชื่อบนกระดาษของแต่ละแบบ (signKey ใน paper/formPages) — ใช้ตัดสินว่าแบบลงนามครบแล้วหรือยัง */
export const FORM_SIGN_KEYS: Record<number, string[]> = {
  1: ['kb1-applicant', 'kb1-officer'],
  3: ['kb3-witness', 'kb3-officer'],
  4: ['kb4-officer', 'kb4-director'],
  5: ['kb5-director', 'kb5-witness'],
  7: ['kb7-applicant'],
  11: KB11_SIGN_SLOTS.map((slot) => slot.key),
  12: ['kb12-attest-sender', 'kb12-attest-receiver'],
  14: ['kb14-witness'],
  15: ['kb15-officer'],
  16: ['kb16-authority'],
  17: ['kb17-signer'],
}

/**
 * แถวแบบฟอร์มในแฟ้ม: เหลือง = ยังลงนามไม่ครบ · เขียว = ลงนามครบแล้ว
 * แบบที่มีลำดับลงนามของตัวเอง (คบ.6 / หนังสือส่งออก / คบ.11 / คบ.13) ใช้เกณฑ์ isFormFullySigned
 * แบบอื่นดูช่องลายมือชื่อบนกระดาษของแฟ้มนี้ครบทุกช่อง — signatures ต้องเป็นของแฟ้มนี้แล้ว
 */
export const isFormSignedForCase = (
  formNo: number,
  caseItem: CaseItem,
  signatures: Record<string, { signed?: boolean } | undefined>,
): boolean => {
  // คบ.1 ใช้ลายมือชื่อผู้ยื่น/พยานจากขั้นรับเรื่อง ไม่รอลายมือชื่อเจ้าหน้าที่ซ้ำ
  if (formNo === 1) return Boolean(caseItem.kb1SignedAt || signatures['kb1-applicant']?.signed)
  if (getFormSignatureKind(formNo) && isFormFullySigned(formNo, caseItem)) return true
  if (formNo === 16 && caseItem.kb16?.signedAt) return true
  if (formNo === 17 && caseItem.kb17?.signedAt) return true
  const keys = FORM_SIGN_KEYS[formNo]
  return Boolean(keys?.length) && keys.every((key) => Boolean(signatures[key]?.signed))
}

/**
 * WIT0501 — ชุดเสนอเส้นทางปกติต้องมีแบบ คบ.6 ที่ "จัดทำแล้ว" จริง ไม่ใช่ร่างตั้งต้นที่ระบบเตรียมไว้ให้
 * นับว่าจัดทำแล้วเมื่อเจ้าหน้าที่กดบันทึกแบบ คบ.6 ของแฟ้มนี้ (kb6PreparedAt)
 * หรือเมื่อแฟ้มเคยผ่านชั้นกลั่นกรองมาแล้ว (ลงนามข้อ 10 แล้ว / ถูกตีกลับมาให้แก้ / อยู่ในรอบ Revision)
 */
export const isKb6Prepared = (c: CaseItem): boolean =>
  Boolean(
    c.kb6PreparedAt ||
      c.kb6Signed ||
      c.kb6SupervisorSignedAt ||
      c.returned ||
      c.secretaryReturnRework ||
      c.directorReturn
  )
