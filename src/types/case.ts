import type { ResultNoticeDocument, NoticeDecisionDraft, NoticeDecisionSelectionEvent } from '../lib/noticeDocuments'
/** ผู้ลงนามความเห็นตามลำดับชั้นในแบบ คบ.6 ข้อ 10–13 */
export type Kb6SignerRole = 'supervisor' | 'director' | 'deputy' | 'secretary'

/** หนังสือส่งออกที่เลขาธิการ ป.ป.ท. ลงนามรายฉบับจากหน้าแบบฟอร์มของฉบับนั้น */
export type OutgoingNoticeFormNo = 8 | 9 | 10

export interface RelatedPerson {
  id: number
  title: string
  firstName: string
  lastName: string
  citizenId: string
  relation: string
  risk: string
}

export interface AttachmentFile {
  name: string
  size: number
  type: string
  lastModified?: number
  previewUrl?: string | null
  uploadedAt: string
  uploadedBy: string
}

export interface AttachmentSet {
  id: number
  category: string
  description: string
  /** แบบฟอร์ม คบ. ที่ชุดเอกสารนี้สังกัด — ไม่ระบุ = ของ คบ.1 (ข้อมูลเดิมก่อนแยกกลุ่ม) */
  formId?: number
  files: AttachmentFile[]
}

export interface IntakeDocument {
  id: string
  category: 'source' | 'official' | 'evidence' | 'id_card' | 'case_doc' | 'other'
  name: string
  reference?: string
  signed?: boolean
  signers?: string[]
  confidentiality?: string
  accessKey?: string
  uploadedBy?: string
  uploadedAt?: string
  unit?: string
  note?: string
  previewUrl?: string
  deleted?: boolean
  audit?: Array<{ at: string; action: string; actor: string }>
}


/**
 * คบ.14 — คำขอขยายระยะเวลาคุ้มครอง (หน้า 11B, WIT1112-WIT1123)
 *
 * สถานะเดินตามผัง: submitted (จัดทำแล้วรอผู้ตรวจ WIT1117) → returned (ส่งกลับแก้ WIT1119)
 * → pending (เสนอตามลำดับชั้นถึงผู้มีอำนาจ WIT1120) → approved/rejected (WIT1121)
 * ฉบับหนังสือและความเห็นเดินผ่านผู้บังคับบัญชาชั้นต้น ผอ. รองเลขาธิการ และเลขาธิการ
 */
export interface ExtensionRequest {
  formSnapshot?: Record<string, any>
  approvalStage?: 'supervisor' | 'director' | 'deputy_secretary' | 'secretary'
  approvalHistory?: Array<{ role: string; by: string; at: string; note: string; endorsed: boolean }>
  id: string
  requestedAt: string
  requestedBy: string
  reason: string
  durationMonths?: number
  durationDays: number
  status: 'submitted' | 'returned' | 'pending' | 'approved' | 'rejected'
  /** WIT1114 — ช่วงวันที่ขอขยาย (แยกจาก durationDays ที่เป็นยอดรวมวัน) */
  periodFrom?: string
  periodTo?: string
  /** TC-138 — เมื่อวันเริ่มขยายไม่ต่อเนื่องกับวันสิ้นสุดคำสั่งเดิม: จำนวนวันที่ขาดช่วง และเหตุผลที่เจ้าหน้าที่ยืนยันให้ดำเนินการต่อ */
  gapDays?: number
  gapReason?: string
  /** WIT1115 — คบ.13 ล่าสุด ผลประเมิน คำสั่งเดิม และหลักฐานประกอบที่แนบไปกับคำขอ */
  attachments?: string[]
  /** WIT1119 — ฉบับที่เท่าไร (นับจาก 1) เก็บฉบับเดิมไว้ ห้ามแก้ทับ */
  version?: number
  previousVersions?: Array<{
    version: number
    createdAt: string
    reason: string
    durationDays: number
    periodFrom?: string
    periodTo?: string
    returnNote?: string
    formSnapshot?: Record<string, any>
    approvalHistory?: ExtensionRequest['approvalHistory']
  }>
  /** WIT1117-WIT1118 — ผลตรวจเอกสารของผู้ตรวจก่อนเสนอตามลำดับชั้น */
  reviewedAt?: string
  reviewedBy?: string
  reviewNote?: string
  /** WIT1120 — เสนอตามลำดับชั้นพร้อม คบ.14 และเอกสารประกอบ */
  submittedAt?: string
  submittedBy?: string
  /** WIT1122 — ล็อกฉบับลงนามหลังอนุมัติ แก้ไม่ได้อีก */
  locked?: boolean
  decidedAt?: string
  decidedBy?: string
  decisionNote?: string
}

export interface MonthlyReport {
  id: string
  period: string
  submittedAt: string
  submittedBy: string
  summary: string
  incidentCount: number
  /** WIT1004 — หลักฐาน/บันทึกปฏิบัติ/รายงานภายนอกที่รวบรวมไว้ในรอบนี้ */
  evidenceRefs?: string[]
  /** WIT1005 — ช่วงรายงานของรอบนี้ (แยกจาก period ซึ่งเป็นคีย์งวดเดือน) */
  periodFrom?: string
  periodTo?: string
  /** WIT1005 — คำสั่งที่ใช้อ้างในรอบนี้และจำนวนวันตามคำสั่งนั้น */
  orderRef?: string
  orderDays?: number
  /** WIT1005 — ผู้ปฏิบัติในรอบรายงานนี้ */
  operators?: string
  /** WIT1005 — วิธีคุ้มครองที่ปฏิบัติจริงในรอบนี้ */
  methods?: ProtectionMethodNo[]
  /** WIT1006 — เจ้าหน้าที่ผู้ปฏิบัติตรวจและลงนาม คบ.13 ของรอบนี้ */
  officerSignedAt?: string
  officerSignedBy?: string
  /** WIT1007 — พยานตรวจข้อมูลผลการคุ้มครองและลงนามรับรอง คบ.13 ของรอบนี้ */
  witnessSignedAt?: string
  witnessSignedBy?: string
  /** WIT1009 — สถานะล่าสุดที่บันทึกหลังตรวจรับรายงาน */
  riskLevel?: CaseItem['risk']
  issues?: string
  nextProposal?: string
  reviewedAt?: string
  reviewedBy?: string
  /** WIT1010 — ล็อกฉบับลงนามเป็นรอบรายงานใหม่ แก้ไม่ได้อีก */
  lockedAt?: string
  /** WIT1012 — กำหนดรอบรายงานถัดไปที่ตั้งไว้ตอนปิดรอบนี้ */
  nextDueAt?: string
}

/** WIT1004 — ข้อมูลที่ใช้เปิดรอบรายงานใหม่ */
export interface OpenKb13RoundInput {
  period: string
  periodFrom?: string
  periodTo?: string
  evidenceRefs?: string[]
  openedBy?: string
}

/** WIT1009 — สถานะล่าสุดที่บันทึกหลังตรวจรับ คบ.13 ของรอบนั้น */
export interface Kb13StatusInput {
  riskLevel: CaseItem['risk']
  issues: string
  nextProposal: string
  incidentCount?: number
  recordedBy?: string
}

/**
 * WIT1013 — จุดส่งต่อจากแท็บ 10 ไปแท็บ 11A (ทบทวนผลการคุ้มครองและจำแนกแนวทาง)
 * เก็บ payload ที่ผังกำหนดให้ส่งไปด้วย — คบ.13 ล่าสุด ผลประเมินความเสี่ยง คำสั่งปัจจุบัน และยอดวันสะสม
 */
export interface ReviewHandoff {
  at: string
  by: string
  reason: string
  /** รอบรายงานที่ใช้เป็นฐานของการทบทวน */
  reportId?: string
  period?: string
  riskLevel?: CaseItem['risk']
  orderRef?: string
  cumulativeDays: number
  remainingDays: number
}

export interface DecisionRequest {
  requestedAt: string
  requestedBy: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  decidedAt?: string
  decidedBy?: string
  decisionNote?: string
}

export interface TransferRequest extends DecisionRequest {
  agency: string
  handoverAt?: string
}

export interface WithdrawalRequest extends DecisionRequest {
  /** สายอนุมัติการถอนตัว: ผบช.ชั้นต้น -> ผอ.สำนัก/กอง */
  approvalStage: 'supervisor' | 'director' | 'done'
}

/** WIT0806 — การนำส่งหนังสือหนึ่งครั้งพร้อมผลลัพธ์ */
export interface DispatchAttempt {
  id: string
  channel: string
  tracking?: string
  dispatchedAt: string
  /** ผลของการนำส่งครั้งนี้ — failed คือตีกลับ/ส่งไม่สำเร็จ ต้องเปลี่ยนช่องทางแล้วส่งใหม่ */
  outcome: 'in_transit' | 'delivered' | 'failed'
  failureReason?: string
  recordedBy?: string
}

/**
 * TC-161 — ฉบับแบบ คบ. ที่ถูกส่งกลับแก้ไข เก็บไว้เป็นประวัติ ไม่แก้ทับ (ใช้ร่วมกันได้ทุกแบบ)
 * เดิมประกาศเฉพาะ คบ.8 (Kb8Revision) — คงชื่อเดิมไว้เป็น alias เพื่อความเข้ากันได้ย้อนหลัง
 */
export interface FormRevisionEntry {
  version: number
  submittedAt?: string
  submittedBy?: string
  signedAt?: string
  signedBy?: string
  returnedAt: string
  returnedBy: string
  returnReason: string
}

/** WIT0818 — ชื่อเดิมของ FormRevisionEntry สำหรับ คบ.8 */
export type Kb8Revision = FormRevisionEntry

/** ขอบเขตสถานที่ที่คำสั่งอนุมัติ — ใช้ตรวจว่าสถานที่ที่เสนออยู่ในขอบเขตหรือไม่ (WIT0824) */
export interface SiteScope {
  /** ประเภทสถานที่ที่อนุมัติให้ใช้ได้ */
  allowedSiteTypes: MethodSite['siteType'][]
  /** ข้อความขอบเขต/เงื่อนไขตามคำสั่ง แสดงให้เจ้าหน้าที่เห็นในหน้า 08A-2 */
  note?: string
  approvedAt?: string
  approvedBy?: string
}

/**
 * WIT0860 แขนง — กรมคุ้มครองสิทธิฯ แจ้งว่าดำเนินการตามข้อ 14 ไม่ได้
 *
 * ต้องเกิดเป็นงานจริงในคิวของ ผบช.ชั้นต้น → ผอ.สำนัก/กอง (ลำดับเดียวกับ WIT0812 / WIT0845)
 * ระหว่างรอพิจารณา มาตรการคุ้มครองเดิมยังคงอยู่ ไม่ปล่อยให้ขาดช่วงโดยไม่มีผู้รับผิดชอบ
 */
export interface Article14EscalationProposal {
  id: string
  failedAgency: string
  failedReason: string
  /** แนวทางที่เสนอแทน เช่น คงมาตรการเดิม/ประสานหน่วยงานอื่น/เสนอคณะกรรมการใหม่ */
  proposedApproach: string
  note?: string
  createdAt: string
  createdBy: string
  stage: 'supervisor' | 'director' | 'approved' | 'returned'
  supervisorAt?: string
  supervisorBy?: string
  supervisorNote?: string
  directorAt?: string
  directorBy?: string
  directorNote?: string
  returnedAt?: string
  returnedBy?: string
  returnNote?: string
  appliedAt?: string
}

export type ProtectionHandoffDestination = 'original_owner' | 'got'
export type ProtectionHandoffStep = 'pending_receipt' | 'received' | 'pending_assignment' | 'assigned' | 'accepted' | 'active'

export interface ProtectionHandoffEvent {
  id: string
  action: string
  at: string
  actorUserId: string
  actorName: string
  actorRole: string
  fromUserId: string
  fromName: string
  toUserId: string
  toName: string
  note: string
}

/** การส่งงานหลังอนุมัติ ใช้แฟ้มเดิมและแยกจากผลพิจารณาคำร้องหลัก */
export interface ProtectionHandoff {
  destination: ProtectionHandoffDestination
  step: ProtectionHandoffStep
  originalOwnerUserId: string
  originalOwnerName: string
  secretaryInstruction: string
  assigneeUserId?: string
  assigneeName?: string
  assignmentInstruction?: string
  acceptedAt?: string
  events: ProtectionHandoffEvent[]
}

export interface CaseItem {
  protectionHandoff?: ProtectionHandoff
  demoData?: boolean
  no: string
  form: string
  person: string
  status: string
  stage: string
  owner: string
  next: string
  risk: 'ต่ำ' | 'ปานกลาง' | 'สูง' | 'วิกฤต' | 'ยังไม่ประเมิน'
  source?: string
  sla?: boolean
  urgency?: 'normal' | 'urgent'
  urgent?: boolean
  returned?: boolean
  returnedBy?: string
  returnIssueLabel?: string
  returnNote?: string
  /** ระดับชั้นของผู้สั่งตีกลับรอบล่าสุด — ใช้แยกวงตีกลับของ ผบช.ชั้นต้น (WIT0505) ออกจากของ ผอ. (WIT0510) */
  returnedByRole?: 'supervisor' | 'director' | 'deputy_secretary'
  /**
   * WIT0510 — ผอ. ไม่เห็นชอบ บันทึกเหตุผลและส่งกลับ "ตรง" เจ้าหน้าที่ผู้รับผิดชอบ ข้าม ผบช.ชั้นต้น
   * ธงนี้ทำให้รอบแก้ไข (WIT0511) ส่งกลับขึ้น ผอ. โดยตรงตามผัง แทนที่จะวนผ่าน ผบช. อีกรอบ
   */
  directorReturn?: boolean
  returnDue?: string
  /**
   * WIT0707 → WIT0708 — เลขาธิการฯ ส่งกลับ/ขอข้อมูลเพิ่ม แล้ว ผอ.สำนัก/กอง มอบหมายให้เจ้าหน้าที่
   * ผู้รับผิดชอบแก้ คบ.3 / คบ.6 เป็น Revision ใหม่ · ธงนี้ตั้งตอน ผอ. กดมอบหมาย และเคลียร์เมื่อ
   * Revision เดินครบลำดับชั้นกลับถึงเลขาธิการฯ อีกครั้ง (WIT0709 → WIT0712)
   */
  secretaryReturnRework?: boolean
  /** WIT0708 — ผอ. มอบหมายแก้ไขเมื่อใด โดยใคร (ก่อนหน้านี้งานค้างอยู่ที่ ผอ. ไม่ลงถึงคนแก้) */
  revisionAssignedAt?: string
  revisionAssignedBy?: string
  revisionInstruction?: string
  /** รอบ Revision ของชุด คบ.3 / คบ.6 — ฉบับที่ลงนามแล้วถูกเก็บไว้ ไม่แก้ทับ */
  revisionRound?: number
  /** WIT0713 — เลขาธิการฯ เห็นควรดำเนินการตามข้อ 14 ตั้งแต่ชั้นรับผลพิจารณา (ทางเข้า 08C ทางที่สอง) */
  article14Referral?: Article14Referral
  activity7State?: 'pending' | 'approved' | 'rejected' | 'returned' | 'committee' | 'article14'
  activity7Label?: string
  externalReference?: string
  decisionNumber?: string
  resultAt?: string
  sentAt?: string
  resultNote?: string
  resultReason?: string
  resultSigner?: string
  approvalStep?: number
  nonApprovalStep?: number
  scanStatus?: 'pending' | 'overdue' | 'complete'
  scanDaysPending?: number
  resultPendingAck?: boolean
  postAckOwner?: string
  postAckStatus?: string
  postAckNext?: string
  caseRoute?: string
  kb5Step?: number
  kb1Retro?: boolean
  kb5Approved?: boolean
  /** KB6 revision opened after successful appeal of KB10; previous notice remains immutable. */
  appealKb6Version?: number
  appealKb6PreviousResult?: Pick<CaseItem, 'dispatchedAt' | 'deliveredAt' | 'deliveryRecipient' | 'deliveryAckType' | 'deliveryAckDocument' | 'decisionNumber' | 'resultReason' | 'resultAt' | 'resultSigner'>
  kb6Signed?: boolean
  kb6Forwarded?: boolean
  kb6Handoff?: boolean
  kb8Signed?: boolean
  /** WIT0818 — รอบ Revision ของ คบ.8 (ฉบับที่ 1 = ฉบับแรก) ฉบับเดิมถูกเก็บไว้ ไม่แก้ทับ */
  kb8Version?: number
  kb8PreviousVersions?: Kb8Revision[]
  extraForms?: number[]
  linkedMainCaseId?: string
  mainCaseNo?: string
  mainCaseTitle?: string
  mainCaseScore?: string
  mainCaseRelation?: string
  mainCaseStatus?: string
  /**
   * เจ้าของสำนวนคดีหลัก ณ วันที่เชื่อมโยง (snapshot) — บันทึกไว้เพื่อความต่อเนื่องของคดี
   * ค่านี้ไม่เปลี่ยนตามการมอบหมายของ ผอ.สำนัก/กอง และไม่เปลี่ยนตามข้อมูล master ที่อาจแก้ไขภายหลัง
   */
  mainCaseLeadOfficer?: string
  /** user id ใน ECMIS ของเจ้าของสำนวนคดีหลัก — ไม่มีค่าเมื่อเจ้าของสำนวนเดิมอยู่นอกทะเบียนผู้ใช้งานคุ้มครองพยาน */
  mainCaseLeadOfficerUserId?: string
  fyiSupervisor?: boolean
  protectionOwner?: string
  protectionOwnerUserId?: string
  assignedOfficer?: string
  receivedBy?: string
  /** ผู้ใช้ที่รับเรื่องเข้าระบบ — ถ้าเป็นเจ้าหน้าที่ ป.ป.ท./เจ้าของสำนวนที่รับเองจาก คบ.1/คบ.2 ให้สิทธิ์เห็น/แก้ไขแบบฟอร์มได้ทันทีแม้ยังไม่ได้รับมอบหมายจาก ผอ. */
  receivedByUserId?: string
  intakeUnit?: string
  orgUnitId?: string
  createdAt?: string
  updatedAt?: string
  actualStartedAt?: string
  importantEvents?: Array<{ id: string; date: string; title: string; detail: string; reporter: string }>
  extensionRequests?: ExtensionRequest[]
  assignmentHistory?: Array<{ at: string; action: string; actor: string; detail: string }>
  documentAuditTrail?: Array<{ at: string; action: string; actor: string; documentId?: string; documentName?: string }>
  /** WIT0512-0513 — รองเลขาธิการฯ กลั่นกรองชุดเสนอหลัง ผอ. ลงนาม คบ.6 ก่อนถึงเลขาธิการฯ */
  deputyReviewState?: 'pending' | 'screened'
  deputyScreenedBy?: string
  deputyScreenedAt?: string
  deputyScreenNote?: string
  secretaryReviewState?: 'pending' | 'signed' | 'returned'
  secretarySignedAt?: string
  secretarySignedBy?: string
  secretarySubmittedBy?: string
  secretarySubmittedByPosition?: string
  secretarySubmittedAt?: string
  withdrawal?: boolean
  hasKb5?: boolean
  documents?: IntakeDocument[]
  relatedPersons?: RelatedPerson[]
  attachmentSets?: AttachmentSet[]
  /** ขั้นที่ 1 — ช่องทางการยื่นคำร้อง กำหนดเส้นทางเข้าระบบ */
  intakeChannel?: 'walkin' | 'document' | 'phone'
  /** ประเภทเอกสารตั้งต้นที่รับเข้าระบบ (คำร้อง / คบ.1 / คบ.2) */
  intakeDocType?: 'petition' | 'kb1' | 'kb2'
  /** บทบาทของผู้รับเรื่องเข้าระบบ */
  intakeByRole?: string
  /** แบบฟอร์มที่ยังต้องจัดทำหลัง ผอ.สำนัก/กอง มอบหมาย เช่น ['คบ.1','คบ.3'] */
  pendingIntakeForms?: string[]
  /** ผู้ที่ได้รับมอบหมายประเมินความเร่งด่วนแล้วหรือยัง (ขั้นที่ 3) */
  urgencyAssessedAt?: string
  urgencyAssessedBy?: string
  urgencyAssessmentNote?: string
  /** ขั้นที่ 1 — คบ.2 บันทึกไว้ก่อน ยังรอพยานเข้ามาลงนาม คบ.1 */
  kb1SignaturePending?: boolean
  kb1SignedAt?: string
  /** ขั้นที่ 1 — ค้นหาแล้วไม่พบเลขคดีหลักจากกิจกรรม 4/5 */
  mainCaseNotFound?: boolean
  /** ขั้นที่ 1 — เหตุผลที่เชื่อมโยงเลขสำนวนหลักไม่ได้ บังคับบันทึกก่อนตั้งสถานะ "ไม่พบคดี" (WIT0215) */
  mainCaseNotFoundReason?: string
  rejectedReason?: string
  rejectedAt?: string
  /** ขั้นที่ 2 */
  assignedOfficerUserId?: string
  assignedAt?: string
  assignedBy?: string
  /** ขั้นที่ 3 — กดข้าม คบ.3 พร้อมเหตุผล */
  kb3Skipped?: boolean
  kb3SkipReason?: string
  kb3SkippedAt?: string
  kb3SkippedBy?: string
  /** TC-161 — รอบ Revision ของ คบ.3 (ฉบับที่ 1 = ฉบับแรก) ฉบับเดิมถูกเก็บไว้ใน kb3PreviousVersions ไม่แก้ทับ */
  kb3Version?: number
  kb3PreviousVersions?: FormRevisionEntry[]
  /** ขั้นที่ 3 — Fast Track: ส่งตรง ผอ.สำนัก/กอง โดยไม่ผ่าน ผบช.ชั้นต้น */
  fastTracked?: boolean
  /** WIT0501 — เจ้าหน้าที่เจ้าของสำนวนกดบันทึกแบบ คบ.6 ของแฟ้มนี้แล้ว (ชุดเสนอมี คบ.6 จริง) */
  kb6PreparedAt?: string
  kb6PreparedBy?: string
  /** ขั้นที่ 4-5 — ลายมือชื่อความเห็นตามลำดับชั้นใน คบ.6 (ข้อ 10–13) ลงนามในหน้าแบบ คบ.6 */
  kb6SupervisorSignedAt?: string
  kb6SupervisorSignedBy?: string
  kb6DirectorSignedAt?: string
  kb6DirectorSignedBy?: string
  kb6DeputySignedAt?: string
  kb6DeputySignedBy?: string
  kb6SecretarySignedAt?: string
  kb6SecretarySignedBy?: string
  /** TC-161 — รอบ Revision ของ คบ.6 (ฉบับที่ 1 = ฉบับแรก) ฉบับเดิมถูกเก็บไว้ใน kb6PreviousVersions ไม่แก้ทับ */
  kb6Version?: number
  kb6PreviousVersions?: FormRevisionEntry[]
  /** ขั้นที่ 5 — รอบลงนามหนังสือส่งออก ลงนามแยกทีละฉบับจากหน้าแบบฟอร์มของฉบับนั้น */
  preliminaryDecision?: NoticeDecisionDraft
  noticeDecisionDrafts?: Partial<Record<9 | 10, NoticeDecisionDraft>>
  preliminaryDecisionHistory?: NoticeDecisionSelectionEvent[]
  resultNotices?: Partial<Record<9 | 10, ResultNoticeDocument>>
  kb9Signed?: boolean
  kb10Signed?: boolean
  kb11Signed?: boolean
  kb8SignedAt?: string
  kb8SignedBy?: string
  /** เจ้าหน้าที่เสนอ คบ.8 เข้ารอบลงนามหลังจัดทำร่างเสร็จ (WIT0817 → WIT0818 ของวิธีที่ 1) */
  kb8SubmittedAt?: string
  kb8SubmittedBy?: string
  kb9SignedAt?: string
  kb9SignedBy?: string
  kb10SignedAt?: string
  kb10SignedBy?: string
  /**
   * Sheet 09A — ด่านก่อนรอบลงนาม คบ.10 ที่ผังแยกเป็น node ต่างหาก
   * WIT0904 เจ้าหน้าที่ตรวจความครบถ้วนของร่างเอง แล้วเสนอรองเลขาธิการฯ กลั่นกรอง
   * WIT0905 รองเลขาธิการฯ ตรวจว่าข้อความตรงผลพิจารณาและแจ้งสิทธิอุทธรณ์ครบ ก่อนถึงผู้ลงนาม
   * `nonApprovalStep` เดินเป็น 0 ร่าง → 1 เจ้าหน้าที่ตรวจครบ → 2 รองเลขาฯ ผ่าน → 3 ลงนาม → 4 ส่งออก
   */
  kb10ReadinessCheckedAt?: string
  kb10ReadinessCheckedBy?: string
  kb10ReadinessNote?: string
  kb10DeputyScreenedAt?: string
  kb10DeputyScreenedBy?: string
  kb10DeputyScreenNote?: string
  /** รองเลขาธิการฯ ส่งร่างกลับให้เจ้าหน้าที่แก้ — เหตุผลของรอบล่าสุด (nonApprovalStep กลับเป็น 0) */
  kb10DeputyReturnNote?: string
  /** WIT0909 — ปิดกระบวนการไม่อนุมัติเมื่อพ้นกรอบ 30 วันโดยไม่มีการยื่นอุทธรณ์ */
  nonApprovalClosedAt?: string
  nonApprovalClosedBy?: string
  nonApprovalCloseNote?: string
  /** เวลาที่รอบลงนามหนังสือส่งออกครบทุกฉบับ (คบ.8+คบ.9 หรือ คบ.10) */
  outgoingSignedAt?: string
  outgoingSignedBy?: string
  /** ขั้นที่ 5 — การนำส่งหนังสือและวันที่พยานได้รับ (จุดตั้งต้นนับอุทธรณ์ 30 วัน) */
  dispatchChannel?: string
  dispatchTracking?: string
  dispatchedAt?: string
  /** WIT0806 — ประวัติการนำส่งทุกครั้งพร้อมผลลัพธ์ (รวมครั้งที่ตีกลับ/ส่งไม่สำเร็จ) */
  dispatchHistory?: DispatchAttempt[]
  deliveredAt?: string
  /** WIT0806 — ผู้รับหนังสือ (พยาน/ผู้แทนโดยชอบ) และหลักฐานการรับทราบ */
  deliveryRecipient?: string
  deliveryRecipientRelation?: string
  deliveryAckType?: string
  deliveryAckDocument?: string
  appealDueAt?: string
  appealFiledAt?: string
  appealReason?: string
  appealDocumentName?: string
  sourceCaseNo?: string
  /** ขั้นที่ 6 — SLA เริ่มนับเมื่ออัปโหลดใบตอบรับจากตำรวจ */
  policeAckAt?: string
  policeAckDocument?: string
  protectionMonths?: number
  protectionDays?: number
  protectionEndAt?: string
  monthlyReports?: MonthlyReport[]
  protectionReportUploads?: { id: string; period: string; documentName: string; documentUrl: string; uploadedAt: string; uploadedBy: string }[]
  /** ขั้นที่ 7 */
  terminationRequest?: DecisionRequest
  transferRequest?: TransferRequest
  withdrawalRequest?: WithdrawalRequest
  closedAt?: string
  formData?: Record<string, any>

  // --- flow v5 : Episode / วิธีคุ้มครอง / ข้อ 14 / ยุติ ---
  /** Episode เดียวต่อสำนวน — Phase TEMPORARY/MAIN อยู่ภายใน ไม่รีเซ็ตวันสะสม */
  episode?: ProtectionEpisode
  /**
   * WIT0801 — วิธีตามข้อ 15 ที่ "คำสั่ง/ผลอนุมัติ" ระบุไว้ สืบทอดมาจากขั้นตอนก่อนหน้า (คบ.6 → ผลพิจารณา)
   * ต่างจาก approvedMethods ที่เป็นชุดวิธีที่เจ้าหน้าที่เปิดเส้นทางปฏิบัติจริงในหน้า 08A
   * เมื่อมีค่า ห้ามเปิดเส้นทางวิธีที่อยู่นอกชุดนี้ ต้องเสนอขออนุมัติเปลี่ยนวิธีก่อน (WIT1110)
   */
  orderedMethods?: ProtectionMethodNo[]
  /** วิธีตามข้อ 15 ที่ได้รับอนุมัติ — เลือกได้อิสระมากกว่า 1 วิธี (WIT0603 / WIT0813) */
  approvedMethods?: ProtectionMethodNo[]
  /** เส้นทางปฏิบัติแยกรายวิธี — เปิดพร้อมกันได้ */
  methodTracks?: ProtectionMethodTrack[]
  /** ความยินยอมของพยานตาม คบ.11 / คบ.5 */
  consents?: ConsentRecord[]
  /** WIT0812 — ข้อเสนอแนวทางหลังพยานไม่ยินยอม ที่เสนอผ่านลำดับผู้บังคับบัญชา */
  consentDeclineProposals?: ConsentDeclineProposal[]
  /** WIT0845 — ข้อเสนอหน่วยงานใหม่หลังหน่วยงานปลายทางปฏิเสธตามข้อ 15(4) */
  coordinationProposals?: CoordinationDeclineProposal[]
  /** WIT0860 แขนง — ข้อเสนอผู้มีอำนาจหลังกรมคุ้มครองสิทธิฯ แจ้งว่าดำเนินการตามข้อ 14 ไม่ได้ */
  article14EscalationProposals?: Article14EscalationProposal[]
  /** ขอบเขตสถานที่ที่คำสั่งอนุมัติให้จัดเป็นสถานที่ปลอดภัย — สืบทอดมาจากชั้นอนุมัติ (คบ.11 / คบ.5) */
  approvedSiteScope?: SiteScope
  /** หนังสือราชการที่รับ-ส่งผ่านระบบสารบรรณเดิม */
  officialLetters?: OfficialLetter[]
  /** เส้นทางข้อ 14 (หน้า 08C) */
  article14?: Article14Case
  /** WIT1003 / WIT1012 — กำหนดรอบรายงาน คบ.13 ถัดไป (แจ้งเตือนก่อนครบกำหนด) */
  nextReportDueAt?: string
  /** WIT1013 — ส่ง คบ.13 ล่าสุดและผลประเมินไปแท็บ 11A แล้ว */
  reviewHandoff?: ReviewHandoff
  /** ข้อเสนอผลทบทวน (หน้า 11A) */
  reviewProposals?: ReviewProposal[]
  /** WIT1110 — ข้อเสนอเปลี่ยนวิธี/เงื่อนไข ที่ต้องอนุมัติก่อนปรับ คบ.11 (หน้า 11A) */
  methodChangeProposals?: MethodChangeProposal[]
  /** คบ.15 / คบ.16 / คบ.17 (หน้า 11C-11D) */
  /** WIT1125-WIT1128 — เหตุเริ่มยุติที่บันทึกไว้ก่อนจัดทำ คบ.15 */
  terminationTrigger?: TerminationTrigger
  kb15?: Kb15Report
  /** WIT1136-WIT1137 — ผลพิจารณาของผู้มีอำนาจก่อนออก คบ.16 */
  terminationApproval?: TerminationApproval
  kb16?: Kb16Order
  kb17?: Kb17Notice
  /** อุทธรณ์คำสั่งยุติ (คบ.17) แยกจากอุทธรณ์คำสั่งไม่อนุมัติ (คบ.10) */
  appealAgainst?: 'kb10' | 'kb17'
  appealResolution?: AppealResolution
  /** Sheet 09B — ลำดับชั้นของแฟ้มอุทธรณ์ (WIT0914-WIT0919) เดินทีละขั้น ข้ามไม่ได้ */
  appealFolder?: AppealFolder
  /** ไม่อนุมัติคุ้มครองชั่วคราว (WIT0610) — ไม่ปิดคำร้องหลักและไม่ออก คบ.10 */
  temporaryDeniedAt?: string
  temporaryDeniedReason?: string
  /** เส้นทางเร่งด่วน คบ.4 / คบ.5 (sheet 06) — แยกจากเส้นทางคำร้องหลักที่เดินคู่ขนานกันไป */
  fastTrack?: FastTrackState
}

// ---------------------------------------------------------------------------
// Sheet 06 — เส้นทางเร่งด่วน: คบ.4 / คบ.5 และการคุ้มครองชั่วคราว
// ---------------------------------------------------------------------------

/**
 * ขั้นของเรื่องคุ้มครองชั่วคราว — เดินแยกจาก `stage` ของคำร้องหลักโดยเจตนา
 * เพราะผัง sheet 06 กำหนดว่าคำร้องหลักต้องเดินต่อควบคู่กันเสมอ (WIT0614)
 *  drafting        WIT0603 เจ้าหน้าที่จัดทำ คบ.4 และร่าง คบ.5
 *  director_review WIT0605 ผอ. ตรวจ รอผ่านประตู WIT0606
 *  returned        WIT0607 → WIT0608 ผอ. ตีกลับให้แก้ แล้ววนกลับ WIT0605
 *  denied          WIT0610 ไม่อนุมัติชั่วคราว (คำร้องหลักยังเดินต่อ ไม่ออก คบ.10)
 *  approved        WIT0611 ผอ. ลงนาม คบ.5 แล้ว รอพยานรับทราบ
 *  active          WIT0612 → WIT0613 พยานยินยอม ส่งวิธีที่อนุมัติไปแท็บ 08
 */
export type FastTrackStep = 'drafting' | 'director_review' | 'returned' | 'denied' | 'approved' | 'active'

export interface FastTrackState {
  step: FastTrackStep
  /** WIT0603 — วิธีตามข้อ 15 (1)–(4) ที่เลือกไว้ใน คบ.4 เลือกได้มากกว่าหนึ่งวิธี */
  proposedMethods?: ProtectionMethodNo[]
  /**
   * WIT0603 — ช่วงเวลาคุ้มครองชั่วคราวที่เสนอในแบบ คบ.4 / ร่าง คบ.5
   * ต้องระบุตั้งแต่ขั้นร่าง เพราะ TEMPORARY กับ MAIN อยู่ Episode เดียวกัน
   * และยอดสะสมรวมต้องไม่เกินเพดาน 180 วัน (ดู checkTemporaryDuration)
   */
  temporaryDurationDays?: number
  temporaryStartDate?: string
  /** WIT0604 — ส่งตรงถึง ผอ. โดยไม่ผ่าน ผบช.ชั้นต้น */
  submittedAt?: string
  submittedBy?: string
  submitNote?: string
  /** จำนวนรอบที่ถูกตีกลับตาม WIT0607 — รอบแรกคือ 0 */
  returnRound?: number
  /** WIT0606 — ผอ. ตัดสินว่าเอกสารครบและพร้อมพิจารณาแล้ว จึงเปิดประตู WIT0609 */
  readinessCheckedAt?: string
  readinessCheckedBy?: string
  /** WIT0607 — ประเด็นและเหตุผลที่ตีกลับรอบล่าสุด */
  returnIssueLabel?: string
  returnNote?: string
  returnedAt?: string
  /** WIT0609 — ผลการพิจารณาคุ้มครองชั่วคราว */
  decidedAt?: string
  decidedBy?: string
  /** WIT0611 — ความเห็นข้อ 13 ของ คบ.4 และคำสั่ง คบ.5 ที่ลงนามแล้ว */
  directorOpinion?: string
  kb5OrderNo?: string
  kb5SignedAt?: string
  kb5SignedBy?: string
  /** WIT0612 — พยานรับทราบคำสั่ง คบ.5 และลงนามยินยอม */
  witnessAckAt?: string
  witnessAckBy?: string
}

export interface MainCaseOption {
  id: string
  no: string
  title: string
  accused: string
  agency: string
  leadOfficer: string
  risk: string
  matchScore: number
}

export interface ReturnIssue {
  value: string
  label: string
  target?: 'officer' | 'witness' | 'protection' | 'supervisor' | 'director' | string
  targetRole?: 'officer' | 'supervisor' | 'director' | 'protection' | 'witness' | string
}

// ---------------------------------------------------------------------------
// Episode / Phase — โมเดลช่วงการคุ้มครองตาม flow หน้า 08A-1, 10, 11A, 11B
// ---------------------------------------------------------------------------

/**
 * ช่วงการคุ้มครองหนึ่งช่วงภายใน Episode เดียวกัน
 *  - TEMPORARY = คุ้มครองชั่วคราวตามคำสั่ง คบ.5 (เส้นทางเร่งด่วน)
 *  - MAIN      = คุ้มครองตามผลอนุมัติคำร้องหลัก (คบ.8/คบ.11)
 * การเปลี่ยนจาก TEMPORARY เป็น MAIN คือการเปลี่ยน Phase ใน Episode เดิม
 * ไม่ใช่การเริ่ม Episode ใหม่ จึงห้ามรีเซ็ตวันสะสม
 */
export type ProtectionPhaseKind = 'TEMPORARY' | 'MAIN'

export interface ProtectionPhase {
  id: string
  kind: ProtectionPhaseKind
  /** วันเริ่มจริง (ISO) — มาจากคำสั่ง/แผนปฏิบัติ ไม่ใช่วันอัปโหลดเอกสาร */
  startedAt: string
  /** วันสิ้นสุดจริง (ISO) — ว่าง = ยังเป็น Phase ที่ทำงานอยู่ */
  endedAt?: string
  /** เอกสารต้นทางของช่วงนี้ เช่น 'คบ.5', 'คบ.8', 'คบ.14 ครั้งที่ 1' */
  orderRef?: string
  note?: string
}

/**
 * Episode = การคุ้มครองหนึ่งเรื่องตั้งแต่ต้นจนปิด
 * วันสะสมนับรวมทุก Phase ต่อเนื่องกัน และต้องไม่เกิน PROTECTION_TOTAL_CAP_DAYS
 */
export interface ProtectionEpisode {
  id: string
  openedAt: string
  closedAt?: string
  closeReason?: string
  phases: ProtectionPhase[]
  /** Episode ของหน่วยงานผู้รับตามข้อ 14 ที่เชื่อมต่อจาก Episode นี้ (WIT0863) */
  successorAgency?: string
  successorStartedAt?: string
}

// ---------------------------------------------------------------------------
// วิธีคุ้มครองรายวิธีตามข้อ 15 (1)-(4) — flow หน้า 08A / 08A-1 / 08A-2 / 08A-3 / 08B
// ---------------------------------------------------------------------------

export type ProtectionMethodNo = 1 | 2 | 3 | 4

/**
 * สถานะของ "วิธี" หนึ่งวิธี — แต่ละวิธีเดินเป็นเส้นทางของตัวเอง และเปิดพร้อมกันได้หลายวิธี
 *  pending   = อนุมัติแล้วแต่ยังไม่เริ่มเตรียมการ
 *  preparing = อยู่ระหว่างจัดแผน/ประสานงาน
 *  active    = เริ่มปฏิบัติจริงแล้ว
 *  blocked   = เริ่มไม่ได้ (เช่น พยานไม่ยินยอมตาม คบ.11 หรือหน่วยงานปฏิเสธ)
 *  ended     = สิ้นสุดวิธีนี้แล้ว
 */
export type ProtectionMethodStatus = 'pending' | 'preparing' | 'active' | 'blocked' | 'ended'

/** 08A-1 — แผนปฏิบัติของชุดคุ้มครอง (WIT0819-0820) */
export interface MethodPlan {
  teamMembers: string
  shiftPlan: string
  vehicles: string
  equipment: string
  area: string
  pickupPoints: string
  emergencyChannel: string
  approvedContacts: string
  briefedAt?: string
  briefedBy?: string
}

/** 08A-2 — สถานที่ปลอดภัย (WIT0824-0829) */
export interface MethodSite {
  proposedSite: string
  siteType: 'witness_home' | 'trusted_person' | 'pacc_designated'
  custodian: string
  safetyScore: string
  accessRoutes: string
  travelPlan: string
  budgetNote: string
  assessedAt?: string
  assessedBy?: string
  suitable?: boolean
  unsuitableReason?: string
  movePlan?: string
  backupRoute?: string
  handoverBy?: string
  handoverTo?: string
  /** WIT0827 — หลักฐานการส่งมอบ-รับมอบตัวพยาน (ชื่อไฟล์ที่แนบ) บังคับก่อนบันทึกเข้าพัก */
  handoverEvidenceDocument?: string
  movedAt?: string
  deviationNote?: string
  /** รอบการเสนอสถานที่ปัจจุบัน (1-indexed) — เพิ่มขึ้นทุกครั้งที่ประเมินแล้วไม่เหมาะสมและวนกลับไปเสนอใหม่ */
  round?: number
  /** WIT0825-0826 — ประวัติผลประเมินทุกรอบ เก็บครบไม่เขียนทับ */
  evaluations?: MethodSiteEvaluation[]
}

/** ผลประเมินสถานที่หนึ่งรอบ (WIT0826) — เก็บไว้ครบทุกรอบเพื่อไม่ให้รอบใหม่เขียนทับรอบเดิม */
export interface MethodSiteEvaluation {
  id: string
  round: number
  proposedSite: string
  siteType: MethodSite['siteType']
  custodian: string
  safetyScore: string
  accessRoutes: string
  suitable: boolean
  unsuitableReason?: string
  assessedAt: string
  assessedBy: string
}

/** 08A-3 — ปกปิดข้อมูลและจำกัดสิทธิ (WIT0831-0837) */
export interface MethodPrivacy {
  /** ตัวระบุที่ต้องปกปิด เช่น ['ชื่อ-สกุล','ที่อยู่','ภาพถ่าย'] */
  maskedIdentifiers: string[]
  channels: string
  allowedRoles: string[]
  needToKnowReason: string
  approver: string
  restrictSearch: boolean
  restrictDownload: boolean
  restrictPrint: boolean
  restrictForward: boolean
  policyVersion: number
  effectiveAt?: string
  /** ช่วงเวลาที่ได้รับอนุมัติให้ใช้มาตรการ/ให้สิทธิ์เข้าถึง — พ้นวันสิ้นสุดแล้วสิทธิ์สิ้นผลเอง (WIT0836) */
  approvedFrom?: string
  approvedTo?: string
  /** เวลาที่ระบบบันทึกว่าสิทธิ์สิ้นผล — ไม่ลบประวัติการให้สิทธิ์เดิม */
  expiredAt?: string
  tests: Array<{ id: string; at: string; by: string; passed: boolean; note: string }>
  auditBaseline?: number
}

/** 08B — ประสานหน่วยงานอื่นตามข้อ 15(4) (WIT0842-0851) */
export interface CoordinationLetterDraft {
  registryNo: string
  registryDate: string
  subject: string
  body: string
  signerName: string
  signerPosition: string
}

export interface MethodCoordination {
  agency: string
  province?: string
  stationId?: string
  letterDraft?: CoordinationLetterDraft
  replyEvidenceName?: string
  contactPosition?: string
  contactPhone?: string
  contactPerson?: string
  /** หนังสือประสานขาออก/ขาเข้าอยู่ใน CaseItem.officialLetters โดยอ้าง methodNo = 4 */
  responseStatus: 'awaiting' | 'accepted' | 'declined'
  declinedReason?: string
  acceptedAt?: string
  /** เตรียมการส่งมอบ (ยังไม่ลงนาม คบ.12) */
  handoverAppointmentAt?: string
  handoverPlace?: string
  handoverBy?: string
  handoverTo?: string
  disclosureScope?: string
  /** ส่งมอบจริงและลงนาม คบ.12 — แยกจากวันอัปโหลดเอกสาร */
  handoverCompletedAt?: string
  /** วันที่มาบันทึก/อัปโหลดเอกสารเข้าระบบ — ต่างจากวันส่งมอบจริงได้ ไม่ใช้นับระยะคุ้มครอง */
  handoverRecordedAt?: string
  operationStartedAt?: string
}

export interface ProtectionMethodTrack {
  method: ProtectionMethodNo
  status: ProtectionMethodStatus
  /** วันเริ่มจริงของวิธีนี้ (ISO) */
  startedAt?: string
  endedAt?: string
  blockedReason?: string
  plan?: Partial<MethodPlan>
  site?: Partial<MethodSite>
  privacy?: Partial<MethodPrivacy>
  coordination?: Partial<MethodCoordination>
  /** section ปัจจุบันของ wizard ใน MethodPanels.tsx (0-indexed) — ใช้ขยับแถบความคืบหน้าตามการกดถัดไป ไม่ใช่แค่ตามข้อมูลที่กรอก */
  wizardStep?: number
}

// ---------------------------------------------------------------------------
// หนังสือราชการผ่านระบบสารบรรณเดิม — flow 08B, 08C, 09B, 11D
// ---------------------------------------------------------------------------

export interface OfficialLetter {
  draftSnapshot?: CoordinationLetterDraft
  id: string
  direction: 'outgoing' | 'incoming'
  /** บริบทที่หนังสือฉบับนี้สังกัด */
  context: 'method4' | 'article14' | 'appeal' | 'termination'
  subject: string
  /** เลขหนังสือที่ออก/รับจากระบบสารบรรณเดิม (ภายนอก E-CMIS) */
  registryNo?: string
  registryDate?: string
  agency: string
  contactPerson?: string
  channel?: 'direct' | 'post' | 'official_other'
  trackingNo?: string
  sentAt?: string
  receivedAt?: string
  documentName?: string
  /** blob URL ของไฟล์ที่แนบ ใช้เปิดดูได้ภายในรอบการใช้งานเดียวกัน (mock ไม่มี backend เก็บไฟล์) */
  documentPreviewUrl?: string
  note?: string
  methodNo?: ProtectionMethodNo
}

// ---------------------------------------------------------------------------
// ข้อ 14 — ส่งกรมคุ้มครองสิทธิและเสรีภาพ (flow หน้า 08C)
// ---------------------------------------------------------------------------

export type Article14Step =
  | 'proposal_draft'
  | 'supervisor_review'
  | 'secretary_review'
  | 'committee_pending'
  | 'committee_rejected'
  | 'letter_sent'
  /** WIT0860 แขนง — กรมแจ้งว่าดำเนินการไม่ได้ ต้องเสนอผู้มีอำนาจทันทีไม่ให้คุ้มครองขาดช่วง */
  | 'delivery_failed'
  | 'response_received'
  | 'handover_ready'
  | 'handover_done'

/**
 * WIT0713 — ผลพิจารณาแขนงที่ 4 "เห็นควรตามข้อ 14"
 * เป็นทางเข้าแท็บ 08C ตั้งแต่ชั้นรับผลพิจารณา โดยไม่ต้องรอให้คุ้มครองใกล้ครบเพดาน
 */
export interface Article14Referral {
  at: string
  by: string
  decisionNo: string
  reason: string
}

export interface Article14Case {
  step: Article14Step
  openedAt: string
  openedBy: string
  /** เหตุความไม่ปลอดภัยที่ยังคงอยู่แม้ครบเพดาน */
  threatSummary: string
  riskAssessment: string
  /** ความเห็นว่าควรใช้มาตรการทั่วไปหรือมาตรการพิเศษ */
  recommendedMeasure: 'general' | 'special' | ''
  supervisorNote?: string
  supervisorAt?: string
  secretaryNote?: string
  secretaryAt?: string
  committeeResolutionNo?: string
  committeeResolvedAt?: string
  committeeApproved?: boolean
  committeeNote?: string
  /** WIT0860 — หนังสือตอบรับขาเข้าจากกรม (บันทึกก่อนเตรียมส่งมอบ WIT0861) */
  replyRegistryNo?: string
  replyRegistryDate?: string
  replyContactPerson?: string
  replyChannel?: 'direct' | 'post' | 'official_other'
  replyAppointmentAt?: string
  replyConditions?: string
  replyDocumentName?: string
  replyRecordedAt?: string
  /** การส่งมอบไปยังหน่วยงานผู้รับ */
  handoverAppointmentAt?: string
  handoverPlace?: string
  handoverBy?: string
  handoverTo?: string
  handoverCompletedAt?: string
  /** วันเริ่มมาตรการภายใต้หน่วยงานใหม่ + ฐานกฎหมายที่ใช้ (แยกจากมาตรการเบื้องต้นของ ป.ป.ท.) */
  successorStartedAt?: string
  successorLegalBasis?: string
  revisions: Array<{ at: string; by: string; reason: string }>
}

// ---------------------------------------------------------------------------
// ทบทวนผล (11A) / ยุติ (11C) / คำสั่งยุติและแจ้งผล (11D)
// ---------------------------------------------------------------------------

export type ReviewOutcome = 'continue' | 'extend' | 'change_method' | 'terminate' | 'article14'

/** ข้อเสนอผลทบทวน (WIT1105) — ต้องผ่าน ผบช. ก่อนจึงจะเลือกแนวทางได้ (WIT1106) */
export interface ReviewProposal {
  id: string
  createdAt: string
  createdBy: string
  /** ยอดวันสะสม ณ วันจัดทำข้อเสนอ */
  cumulativeDays: number
  remainingDays: number
  riskSummary: string
  performanceSummary: string
  issues: string
  proposedOutcome: ReviewOutcome
  reason: string
  status: 'pending' | 'endorsed' | 'returned'
  reviewedAt?: string
  reviewedBy?: string
  reviewNote?: string
  /** WIT1107 — แนวทางที่เลือกจริงหลังเห็นชอบ ใช้แยก "รอเลือกแนวทาง" ออกจาก "เลือกแล้ว" ในรายการทบทวน */
  appliedOutcome?: ReviewOutcome
  appliedAt?: string
}

/**
 * WIT1125-WIT1128 — เหตุเริ่มยุติที่บันทึกไว้ก่อนจัดทำ คบ.15
 * แยกจาก Kb15Report เพราะเหตุเกิดขึ้นก่อน และเกิดได้แม้ยังไม่มีการทบทวนที่ 11A
 */
export interface TerminationTrigger {
  source: 'witness_kb7' | 'external_letter' | 'due_or_officer'
  /** อ้างอิง คบ.7 / เลขหนังสือภายนอก / เลขคำสั่งที่ครบกำหนด */
  ref?: string
  /** WIT1127 — ไฟล์หนังสือขอยุติจากภายนอกที่อัปโหลดเข้ากับแฟ้มเดิม */
  documentName?: string
  /** วันที่รับเรื่อง/วันที่ครบกำหนด แล้วแต่แขนง */
  receivedAt?: string
  detail?: string
  recordedAt: string
  recordedBy: string
  /**
   * TC-144 — เหตุยุติเสริมที่เกิดพร้อมกัน (เช่น คบ.7 + ครบกำหนดในวันเดียวกัน)
   * ยังคงเป็น "เรื่องยุติเดียว" ในแฟ้ม (ไม่สร้างแมทเทอร์ใหม่) — เก็บไว้เพื่อแสดงครบถ้วนใน คบ.15 / คบ.16
   * เป็น optional array เพื่อคง backward compatibility กับ mock-state เดิมที่ไม่มีฟิลด์นี้
   */
  additionalReasons?: TerminationAdditionalReason[]
}

/** TC-144 — เหตุยุติเสริมของ TerminationTrigger (ไม่ใช่เหตุหลักที่กำหนดแนวทาง) */
export interface TerminationAdditionalReason {
  source: 'witness_kb7' | 'external_letter' | 'due_or_officer'
  ref?: string
  documentName?: string
  detail?: string
  recordedAt: string
  recordedBy: string
}

/** คบ.15 — รายงานการให้ความคุ้มครองสิ้นสุด (WIT1129) */
export interface Kb15Report {
  version: number
  createdAt: string
  createdBy: string
  /** ที่มาของเหตุยุติ */
  trigger: 'witness_kb7' | 'external_letter' | 'due_or_officer'
  triggerRef?: string
  /** WIT1126 / WIT1127 — เอกสารต้นเรื่อง (คบ.7 ที่พยานยื่น หรือหนังสือภายนอก) ที่อัปโหลดเข้ากับแฟ้มเดิม */
  triggerDocumentName?: string
  triggerReceivedAt?: string
  summary: string
  evidenceNote?: string
  status: 'draft' | 'submitted' | 'returned' | 'endorsed'
  reviewedAt?: string
  reviewedBy?: string
  reviewNote?: string
  /** ฉบับก่อนหน้าที่ถูกแทนที่ — เก็บไว้ ห้ามแก้ทับ */
  previousVersions?: Array<{ version: number; createdAt: string; summary: string }>
}

/**
 * WIT1136-WIT1137 — ผู้มีอำนาจพิจารณาเรื่องยุติที่รับมาจาก 11C ก่อนจะร่าง คบ.16
 * ไม่อนุมัติ = บันทึกผล คุ้มครองต่อภายใต้คำสั่งเดิม และกลับแท็บ 10
 */
export interface TerminationApproval {
  decidedAt: string
  decidedBy: string
  approved: boolean
  note: string
}

/** คบ.16 — คำสั่งยุติการคุ้มครอง (WIT1138-1140) */
export interface Kb16Order {
  orderNo: string
  reason: string
  /** draft = เจ้าหน้าที่กำลังกรอกในแฟ้ม · submitted = เสนอผู้มีอำนาจลงนามแล้ว (WIT1138 → WIT1139) */
  status?: 'draft' | 'submitted'
  /** วันเวลาที่เจ้าหน้าที่กดส่งให้อนุมัติ */
  submittedAt?: string
  submittedBy?: string
  /** วันที่ออกคำสั่ง */
  issuedAt?: string
  /** วันที่คำสั่งมีผล — สถานะยุติเกิดขึ้นเมื่อถึงวันนี้เท่านั้น */
  effectiveAt?: string
  /** วันที่หยุดปฏิบัติจริงในพื้นที่ */
  operationStoppedAt?: string
  signedAt?: string
  signedBy?: string
  locked?: boolean
  /** TC-149 — เหตุผลบังคับตามระเบียบ เมื่อวันที่มีผลย้อนหลังก่อนวันออกคำสั่ง */
  backdatedReason?: string
}

/** WIT0806 — หลักฐานการรับหนังสือแจ้งผล (คบ.9/คบ.10) ที่ต้องบันทึกคู่กับวันที่รับ */
export interface DeliveryReceipt {
  recipient: string
  recipientRelation?: string
  ackType: string
  ackDocument?: string
}

/** TC-153 — หลักฐานความพยายามนำส่ง คบ.17 แต่ละครั้ง (append-only) */
export interface Kb17DeliveryAttempt {
  attemptNo: number
  channel: string
  attemptedAt: string
  result: 'success' | 'failed'
  note?: string
  evidence?: string
}

/** คบ.17 — หนังสือแจ้งคำสั่งยุติและสิทธิอุทธรณ์ (WIT1141-1146) */
export interface Kb17Notice {
  documentName?: string
  /** draft = เจ้าหน้าที่กรอกในแฟ้ม · submitted = เสนอเลขาธิการ ป.ป.ท. ลงนามแล้ว (WIT1141 → ลงนาม → WIT1142) */
  status?: 'draft' | 'submitted'
  submittedAt?: string
  submittedBy?: string
  /** เลขาธิการ ป.ป.ท. ลงนามแล้ว จึงจะออกเลขและนำส่งผ่านสารบรรณเดิมได้ (WIT1142) */
  signedAt?: string
  signedBy?: string
  locked?: boolean
  /** เลขที่/วันที่ที่ออกจากระบบสารบรรณเดิม */
  registryNo?: string
  registryDate?: string
  dispatchedAt?: string
  /** WIT1143 — ไฟล์ คบ.17 ฉบับที่ส่งจริง อัปโหลดเข้ากับแฟ้มคู่กับเลขสารบรรณ */
  sentDocumentName?: string
  /** วันที่พยานได้รับจริง = จุดตั้งต้นนับอุทธรณ์ 30 วันของคำสั่งยุติ */
  deliveredAt?: string
  appealDueAt?: string
  receiptEvidence?: string
  /** TC-153 — ประวัติความพยายามนำส่งทุกครั้ง (สำเร็จ/ไม่สำเร็จ) เก็บต่อเนื่อง ห้ามลบ/แก้ทับ */
  deliveryAttempts?: Kb17DeliveryAttempt[]
  /** TC-153 — ระบุว่า deliveredAt มาจากการรับจริง หรือถือว่าได้รับตามระเบียบหลังส่งไม่สำเร็จ */
  deliveryMethod?: 'actual' | 'deemed'
}

/** ความยินยอมของพยานตาม คบ.11 (WIT0809-0812) และตาม คบ.5 (WIT0612) */
export interface ConsentRecord {
  ref: 'kb11' | 'kb5'
  consented: boolean
  at: string
  by: string
  /** เมื่อไม่ยินยอม: เหตุผลและแนวทางที่เสนอ */
  reason?: string
  proposedAction?: 'review' | 'change_method' | 'terminate'
  evidence?: string
}

/** WIT0812 — แนวทางที่เสนอเมื่อพยานไม่ยินยอมตาม คบ.11 / คบ.5 */
export type ConsentDeclineAction = 'review' | 'change_method' | 'terminate'

/**
 * WIT0812 — ข้อเสนอแนวทางหลังพยานไม่ยินยอม ที่ต้องเดินผ่านลำดับผู้บังคับบัญชา
 * เจ้าหน้าที่ผู้รับผิดชอบเสนอ → ผบช.ชั้นต้นเห็นชอบ → ผอ.สำนัก/กอง อนุมัติ
 * แล้วจึงพาแฟ้มไปต่อตามแนวทางที่อนุมัติ (ทบทวน 11A · เปลี่ยนวิธี 08A · ยุติ 11C)
 */
export interface ConsentDeclineProposal {
  id: string
  /** ไม่ยินยอมตามเอกสารฉบับใด */
  ref: 'kb11' | 'kb5'
  reason: string
  evidence?: string
  proposedAction: ConsentDeclineAction
  /** วิธีตามข้อ 15 ที่เสนอใช้แทน — เฉพาะแนวทาง change_method */
  proposedMethods?: ProtectionMethodNo[]
  createdAt: string
  createdBy: string
  /** ขั้นที่ข้อเสนออยู่ ณ ปัจจุบัน — supervisor/director คือรอผู้นั้นพิจารณา */
  stage: 'supervisor' | 'director' | 'approved' | 'returned'
  supervisorAt?: string
  supervisorBy?: string
  supervisorNote?: string
  directorAt?: string
  directorBy?: string
  directorNote?: string
  /** ผู้ส่งคืนแก้ไขและเหตุผล (ส่งคืนได้ทั้งชั้น ผบช. และ ผอ.) */
  returnedAt?: string
  returnedBy?: string
  returnNote?: string
  /** เวลาที่แนวทางถูกนำไปใช้จริงหลัง ผอ. อนุมัติ */
  appliedAt?: string
}

/**
 * WIT0845 — หน่วยงานปลายทางปฏิเสธการรับดำเนินการตามข้อ 15(4)
 *
 * ครึ่งหลังของ node คือ "เสนอผู้มีอำนาจพิจารณาหน่วยงานหรือแนวทางใหม่" จึงต้องเกิดเป็นงานจริง
 * ในคิวของ ผบช.ชั้นต้น → ผอ.สำนัก/กอง ไม่ใช่ข้อความแจ้งเตือนที่เด้งขึ้นมาแล้วหายไป
 * อนุมัติแล้ววิธีที่ 4 กลับมาเดินต่อกับหน่วยงานใหม่ภายใต้คำสั่งเดิม
 */
export interface CoordinationDeclineProposal {
  id: string
  /** หน่วยงานที่ปฏิเสธ พร้อมเหตุผลตามหนังสือปฏิเสธขาเข้า */
  declinedAgency: string
  declinedReason: string
  /** หน่วยงานที่เสนอให้ประสานแทน */
  proposedAgency: string
  /** เหตุผลประกอบที่เลือกหน่วยงานนี้ */
  note?: string
  createdAt: string
  createdBy: string
  /** ขั้นที่ข้อเสนออยู่ ณ ปัจจุบัน — supervisor/director คือรอผู้นั้นพิจารณา */
  stage: 'supervisor' | 'director' | 'approved' | 'returned'
  supervisorAt?: string
  supervisorBy?: string
  supervisorNote?: string
  directorAt?: string
  directorBy?: string
  directorNote?: string
  /** ผู้ส่งคืนแก้ไขและเหตุผล (ส่งคืนได้ทั้งชั้น ผบช. และ ผอ.) */
  returnedAt?: string
  returnedBy?: string
  returnNote?: string
  /** เวลาที่หน่วยงานใหม่ถูกนำไปใช้จริงหลัง ผอ. อนุมัติ */
  appliedAt?: string
}

/**
 * WIT1110 — ข้อเสนอเปลี่ยนวิธี/เงื่อนไขหลังทบทวนผลที่ 11A
 *
 * ผังเขียนว่า "เสนออนุมัติและปรับ คบ.11" — ครึ่งแรกคือด่านอนุมัติจริงตามลำดับชั้น
 * เจ้าหน้าที่ผู้รับผิดชอบเสนอ → ผบช.ชั้นต้นเห็นชอบ → ผอ.สำนัก/กอง อนุมัติ (ลำดับเดียวกับ WIT0812 / WIT0845)
 * ครึ่งหลังคือผลจริงหลังอนุมัติ — เปลี่ยนชุดวิธีที่อนุมัติ ล้างความยินยอมตาม คบ.11 เดิม
 * และถ้าวิธีใหม่รวมวิธีที่ 1 ต้องจัดทำ/แก้ คบ.8 ให้ลงนามก่อน จึงเริ่มปฏิบัติวิธีที่ 1 ได้
 */
export interface MethodChangeProposal {
  id: string
  /** วิธีที่ใช้อยู่ ณ วันเสนอ — เก็บไว้เทียบว่าเปลี่ยนจากอะไรเป็นอะไร */
  currentMethods: ProtectionMethodNo[]
  /** ชุดวิธีตามข้อ 15 (1)-(4) ที่เสนอใช้แทน */
  proposedMethods: ProtectionMethodNo[]
  /** เงื่อนไข/ข้อกำหนดเพิ่มเติมที่จะปรับลงใน คบ.11 (ระยะเวลา สถานที่ ข้อจำกัด ฯลฯ) */
  conditions?: string
  reason: string
  createdAt: string
  createdBy: string
  /** ขั้นที่ข้อเสนออยู่ ณ ปัจจุบัน — supervisor/director คือรอผู้นั้นพิจารณา */
  stage: 'supervisor' | 'director' | 'approved' | 'returned'
  supervisorAt?: string
  supervisorBy?: string
  supervisorNote?: string
  directorAt?: string
  directorBy?: string
  directorNote?: string
  /** ผู้ส่งคืนแก้ไขและเหตุผล (ส่งคืนได้ทั้งชั้น ผบช. และ ผอ.) */
  returnedAt?: string
  returnedBy?: string
  returnNote?: string
  /** เวลาที่ชุดวิธีใหม่ถูกเปิดใช้จริงหลัง ผอ. อนุมัติ */
  appliedAt?: string
  /** วิธีใหม่รวมวิธีที่ 1 — ล็อกไม่ให้เริ่มวิธีที่ 1 จนกว่า คบ.8 ฉบับใหม่จะลงนามครบ */
  requiresKb8?: boolean
}

/**
 * Sheet 09B — แฟ้มอุทธรณ์เดินตามลำดับชั้น เจ้าหน้าที่ → ผบช.ชั้นต้น → รองเลขาธิการฯ → เลขาธิการฯ → คณะกรรมการ
 *
 * `stage` คือขั้นที่ "รอการกระทำ" ของผู้มีอำนาจระดับนั้น ไม่ใช่ขั้นที่ผ่านไปแล้ว
 * ลำดับบังคับตามผัง ข้ามขั้นไม่ได้ — WIT0918 กำกับว่าเลขาธิการฯ เป็นผู้ส่งเรื่อง ไม่ใช่ผู้วินิจฉัย
 */
export type AppealFolderStage =
  /** WIT0913/WIT0914 — รับคำอุทธรณ์เข้าแฟ้มแล้ว รอตรวจความครบถ้วนและกรอบ 30 วัน */
  | 'received'
  /** WIT0914 แขนงล่าช้า — บันทึกเหตุผลแล้ว รอ ผบช.ชั้นต้นรับเรื่องไว้ (ห้ามปัดตกอัตโนมัติ) */
  | 'late_pending'
  /** WIT0915 — รอเจ้าหน้าที่ผู้รับผิดชอบบันทึกความเห็นของตน */
  | 'officer_opinion'
  /** WIT0916 — รอ ผบช.ชั้นต้น ให้ความเห็นและลงนามเสนอตามลำดับชั้น */
  | 'supervisor'
  /** WIT0916 — รอ ผอ.สำนัก/กอง ตรวจ ให้ความเห็น และลงนามเสนอรองเลขาธิการฯ (ต่อจาก ผบช.ชั้นต้น WIT0915) */
  | 'director'
  /** WIT0917 — รองเลขาธิการฯ กลั่นกรองและให้ความเห็นประกอบ */
  | 'deputy'
  /** WIT0918 — เลขาธิการฯ ให้ความเห็นประกอบและส่งเสนอคณะกรรมการ */
  | 'secretary'
  /** WIT0919 — ฝ่ายเลขานุการบรรจุวาระ รอคณะกรรมการวินิจฉัย (WIT0920) */
  | 'agenda'
  /** WIT0921/WIT0922 — คณะกรรมการวินิจฉัยแล้ว */
  | 'resolved'

/** ความเห็นหนึ่งชั้นในแฟ้มอุทธรณ์ — เก็บแยกจากข้อความคำอุทธรณ์ของผู้ยื่นตาม WIT0915 */
export interface AppealOpinion {
  at: string
  by: string
  note: string
}

/**
 * WIT0911/WIT0912 — ช่องทางที่ผู้ยื่นใช้ยื่นคำอุทธรณ์ — ไม่มีเลข คบ. ไม่ว่าช่องทางใด
 * หนังสือ: ต้องมีเลขรับสารบรรณกลางและวันที่รับครั้งแรกจากระบบสารบรรณเดิม
 * วาจา: เจ้าหน้าที่บันทึกถ้อยคำและให้ผู้ยื่นลงลายมือชื่อรับรองไว้เป็นหลักฐาน
 */
export type AppealIntake =
  | {
      channel: 'letter'
      registryNo: string
      firstReceivedAt: string
      evidenceDocumentName: string
      evidenceDataUrl?: string
      documentSource?: 'appellant_document' | 'agency_form'
      recordedAt: string
      recordedBy: string
    }
  | {
      channel: 'oral'
      statement: string
      appellantSigned: true
      signedRecordDocumentName: string
      signedRecordDataUrl?: string
      recordedAt: string
      recordedBy: string
    }

export interface AppealFolder {
  stage: AppealFolderStage
  /** WIT0911/WIT0912 — ช่องทางและหลักฐานการรับคำอุทธรณ์เข้าระบบครั้งแรก */
  intake?: AppealIntake
  /** ผบช.ชั้นต้น/ผอ.สำนัก/กอง มอบหมายเจ้าหน้าที่อุทธรณ์ให้ชัดเจน — เปลี่ยนเจ้าของเรื่องได้เฉพาะทางนี้ ไม่ใช่อัตโนมัติ */
  appealOfficer?: { name: string; userId?: string; at: string; by: string; note?: string }
  /** WIT0914 — วันที่รับแจ้งผลจริงที่ใช้คำนวณกรอบ 30 วัน และจำนวนวันที่ล่าช้า (ถ้ามี) */
  checkedAt?: string
  checkedBy?: string
  lateDays?: number
  /** เหตุผลความล่าช้าที่เจ้าหน้าที่บันทึก — ผังห้ามปัดตกอัตโนมัติ ให้คณะกรรมการเป็นผู้ตัดสิน */
  lateReason?: string
  /** ผบช.ชั้นต้นรับเรื่องที่ยื่นเกินกำหนดไว้พิจารณา */
  lateAcceptedAt?: string
  lateAcceptedBy?: string
  lateAcceptNote?: string
  officerOpinion?: AppealOpinion
  supervisorOpinion?: AppealOpinion
  directorOpinion?: AppealOpinion
  deputyOpinion?: AppealOpinion
  secretaryOpinion?: AppealOpinion
  /** WIT0919 — ใบนำ/ระเบียบวาระที่ฝ่ายเลขานุการเสนอประธานเพื่อบรรจุวาระ */
  agendaNo?: string
  agendaAt?: string
  agendaBy?: string
}

/** ผลวินิจฉัยอุทธรณ์ของคณะกรรมการ ป.ป.ท. (WIT0920-0922) */
export interface AppealResolution {
  resolutionNo: string
  resolvedAt: string
  outcome: 'uphold' | 'overturn'
  note: string
  /** WIT0921/WIT0922 — หนังสือแจ้งผลอุทธรณ์ (ไม่มีเลข คบ.) ส่งผ่านสารบรรณเดิมและเก็บหลักฐานการรับ */
  noticeDocumentName?: string
  noticeRegistryNo?: string
  noticeSentAt?: string
  noticeDeliveredAt?: string
  /** ผู้รับหนังสือและหลักฐานการรับ — ร่องรอยว่าแจ้งผลถึงพยานแล้วจริง */
  noticeRecipient?: string
  noticeAckDocument?: string
  noticeRecordedAt?: string
  noticeRecordedBy?: string
  /** แฟ้มอุทธรณ์นี้อุทธรณ์คำสั่งฉบับใด */
  against: 'kb10' | 'kb17'
}
