import { addProtectionMonths, calendarDays, monthLabel, legacyMonthLabel } from '../lib/protectionMonths'
import { NOTICE_FIELD_POLICY, NOTICE_DETAIL_FIELDS, noticeWorkerAllowed, hasSignedResultNotice, cloneNotice, createNoticeDraft, missingNoticeFields, noticeCanSign, noticeForCase, signNoticeSnapshot, ResultNoticeFormNo, NoticeDecisionDraft, NoticeDecisionDraftInput } from '../lib/noticeDocuments'
import { selectCaseDraft } from './useFormDraftStore'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isCaseClosed } from '../lib/permissions'
import { getDefaultCaseState } from '../lib/defaultCases'
import {
  Article14Case,
  AppealIntake,
  CaseItem,
  ConsentDeclineAction,
  ConsentDeclineProposal,
  ConsentRecord,
  CoordinationDeclineProposal,
  Article14EscalationProposal,
  DispatchAttempt,
  DeliveryReceipt,
  ExtensionRequest,
  IntakeDocument,
  Kb6SignerRole,
  Kb13StatusInput,
  Kb15Report,
  Kb16Order,
  Kb17DeliveryAttempt,
  MonthlyReport,
  OpenKb13RoundInput,
  OfficialLetter,
  ProtectionMethodNo,
  ProtectionMethodStatus,
  ProtectionMethodTrack,
  ProtectionPhaseKind,
  FastTrackState,
  MethodChangeProposal,
  ReviewOutcome,
  ReviewProposal,
  TerminationTrigger,
  TerminationAdditionalReason,
  OutgoingNoticeFormNo,
  ProtectionHandoffDestination,
  ProtectionHandoffEvent,
} from '../types/case'
import {
  MAIN_CASE_OPTIONS,
  ECMIS_USER_DIRECTORY,
  APPEAL_WINDOW_DAYS,
  ARTICLE14_TARGET_AGENCY,
  PROTECTION_DEFAULT_DAYS,
  PROTECTION_MAX_DAYS,
  PROTECTION_TOTAL_CAP_DAYS,
  readRoutableProtectionMethods,
  resolveMainCaseLeadOfficer,
} from '../lib/constants'
import {
  checkExtension,
  checkTemporaryDuration,
  closeEpisode,
  cumulativeDays,
  deriveEpisode,
  earliestMethodStart,
  currentPhaseKind,
  hasConsent,
  openEpisode,
  remainingDays,
  switchPhase,
} from '../lib/episode'
import { temporaryDecisionPending } from '../lib/fastTrack'
import { nowDisplay, addDays, currentReportPeriod, daysUntil, formatThaiDate, parseAnyDate } from '../lib/utils'
import { Kb13SignSlot, KB11_SIGN_SLOTS, KB6_SIGNERS, kb11Gate } from '../lib/formSignature'
import { methodStartBlocker, method4ReplyRecorded } from '../lib/methodProgress'
import { evaluateCloseGuard } from '../lib/terminationProgress'
import { showToast } from '../lib/swal'
import { useNotificationStore } from './useNotificationStore'
import { useFormDraftStore } from './useFormDraftStore'
import { useAuthStore } from './useAuthStore'
import { GOT_UNIT_NAME, HANDOFF_STATUS, canOperateHandoff, gotAssignableOfficers, protectionResponsibleName } from '../lib/protectionHandoff'

/**
 * WIT0506 / WIT0511 / WIT0708 — ถูกตีกลับเมื่อใด แบบในชุดเสนอต้องขึ้นเวอร์ชันใหม่
 * โดยเก็บฉบับเดิมไว้ครบ ห้ามแก้ทับฉบับที่ผ่านการตรวจมาแล้ว
 * ชุดเสนอเส้นทางปกติคือ คบ.3 (บันทึกถ้อยคำ) และ คบ.6 (บันทึกข้อความเสนอความเห็น)
 */
const PROPOSAL_SET_FORMS = [3, 6]

const reviseProposalSet = (by: string, reason: string) => {
  const { reviseForm } = useFormDraftStore.getState()
  PROPOSAL_SET_FORMS.forEach((formId) => reviseForm(formId, by, reason))
}

/**
 * TC-161 — เมื่อชุดเสนอ คบ.3/คบ.6 ถูกส่งกลับแก้ไข (WIT0505/WIT0510/WIT0708) เก็บฉบับปัจจุบันไว้เป็นประวัติ
 * ก่อนขึ้นเวอร์ชันใหม่ ไม่แก้ทับฉบับที่ผ่านการตรวจ/ลงนามมาแล้ว — รูปแบบเดียวกับ kb8PreviousVersions (WIT0818)
 */
const proposalSetRevisionPatch = (
  current: CaseItem,
  by: string,
  reason: string
): Pick<CaseItem, 'kb3Version' | 'kb3PreviousVersions' | 'kb6Version' | 'kb6PreviousVersions'> => {
  const at = nowDisplay()
  const kb3Version = current.kb3Version || 1
  const kb6Version = current.kb6Version || 1
  return {
    kb3Version: kb3Version + 1,
    kb3PreviousVersions: [
      ...(current.kb3PreviousVersions || []),
      { version: kb3Version, returnedAt: at, returnedBy: by, returnReason: reason },
    ],
    kb6Version: kb6Version + 1,
    kb6PreviousVersions: [
      ...(current.kb6PreviousVersions || []),
      {
        version: kb6Version,
        signedAt: current.kb6SupervisorSignedAt,
        signedBy: current.kb6SupervisorSignedBy,
        returnedAt: at,
        returnedBy: by,
        returnReason: reason,
      },
    ],
  }
}

/** Omit ที่กระจายทั่วยูเนียนก่อนตัดคีย์ — Omit ปกติจะยุบ AppealIntake ทั้งสองแบบเป็นชนิดเดียวกัน */
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never
/** อินพุตของ fileAppeal/openKb17Appeal — recordedAt/recordedBy เติมให้จากเวลาบันทึกจริง ไม่รับจากผู้เรียก */
export type AppealIntakeInput = DistributiveOmit<AppealIntake, 'recordedAt' | 'recordedBy'>

const routedWorkerAllowed = (c: CaseItem): boolean => {
  if (!c.protectionHandoff) return true
  const auth = useAuthStore.getState()
  return canOperateHandoff(auth.currentRole, c, auth.currentOfficerUserId)
}

const ACTOR = {
  officer: 'นางสาวอรุณี ใจมั่น',
  supervisor: 'นายกิตติศักดิ์ ธรรมรักษ์',
  director: 'นายวีระยุทธ พิทักษ์ธรรม',
  secretary: 'นายสุรศักดิ์ ธรรมพิทักษ์',
  protection: 'ร.ต.อ. อนุชา กล้าหาญ',
  receiver: 'นายสมบัติ รับสารบรรณ',
  appeal: 'นางสาววราภรณ์ นิติธรรม',
  deputySecretary: 'นายพิพัฒน์ ศรีสุวรรณ',
  committee: 'นางสาวปิยะนุช เลขะกุล',
}

/** WIT0812 — ชื่อแนวทางที่เสนอได้เมื่อพยานไม่ยินยอม */
const CONSENT_DECLINE_LABEL: Record<ConsentDeclineAction, string> = {
  review: 'ทบทวนแนวทางคุ้มครอง',
  change_method: 'เปลี่ยนวิธีคุ้มครอง',
  terminate: 'ยุติการคุ้มครอง',
}

/**
 * ผู้ลงนามความเห็นตามลำดับชั้นในแบบ คบ.6 (ข้อ 10-13) — ปุ่มลงนามอยู่ในหน้าแบบ คบ.6 ทั้งสี่ระดับ
 * ผอ.สำนัก/กอง ลงนามแล้วถือว่าชุดเสนอ คบ.6 พร้อมเดินต่อในลำดับชั้นบน (kb6Forwarded)
 */
const KB6_SIGNER_DEFAULTS: Record<
  Kb6SignerRole,
  { actor: string; historyAction: string; patch: (at: string, name: string) => Partial<CaseItem> }
> = {
  supervisor: {
    actor: ACTOR.supervisor,
    historyAction: 'ผู้บังคับบัญชาชั้นต้นลงนามความเห็นใน คบ.6',
    patch: (at, name) => ({ kb6SupervisorSignedAt: at, kb6SupervisorSignedBy: name }),
  },
  director: {
    actor: ACTOR.director,
    historyAction: 'ผอ.สำนัก/กอง ลงนามความเห็นใน คบ.6',
    patch: (at, name) => ({ kb6DirectorSignedAt: at, kb6DirectorSignedBy: name, kb6Forwarded: true }),
  },
  deputy: {
    actor: ACTOR.deputySecretary,
    historyAction: 'รองเลขาธิการ ป.ป.ท. ลงนามความเห็นใน คบ.6',
    patch: (at, name) => ({ kb6DeputySignedAt: at, kb6DeputySignedBy: name, kb6Forwarded: true }),
  },
  secretary: {
    actor: ACTOR.secretary,
    historyAction: 'เลขาธิการ ป.ป.ท. ลงนามความเห็นใน คบ.6',
    patch: (at, name) => ({ kb6SecretarySignedAt: at, kb6SecretarySignedBy: name, kb6Forwarded: true }),
  },
}

const secretaryAccount = () => ECMIS_USER_DIRECTORY.find((u) => u.roles.includes('secretary'))!

interface CaseState {
  cases: CaseItem[]
  activeCaseNo: string | null
  /** 08B — หน่วยงานวิธีที่ 4 ที่เจ้าหน้าที่เพิ่มเอง (นอกเหนือ EXTERNAL_TRANSFER_AGENCIES) ใช้ซ้ำได้ทุกแฟ้ม */
  customTransferAgencies: string[]
  addCustomTransferAgency: (name: string) => void

  setActiveCaseNo: (no: string | null) => void
  getCase: (no?: string) => CaseItem | undefined
  addCase: (item: CaseItem) => void
  beginPreliminaryDecision: (caseNo: string, outcome: 'approved' | 'rejected') => boolean
  savePreliminaryDecision: (caseNo: string, formNo: ResultNoticeFormNo, input: NoticeDecisionDraftInput) => boolean
  confirmPreliminaryDecision: (caseNo: string, formNo: ResultNoticeFormNo) => boolean
  prepareResultNotices: (caseNo: string) => boolean
  completeResultNotice: (caseNo: string, formNo: ResultNoticeFormNo, patch: Record<string, string>) => boolean
  checkResultNoticeReady: (caseNo: string) => boolean
  updateCase: (no: string, updates: Partial<CaseItem>) => void
  deleteCase: (no: string) => void
  logHistory: (caseNo: string, action: string, actor: string, detail: string) => void
  /**
   * WIT0611 — บันทึกความพยายามแก้ไขเอกสารฉบับที่ลงนามและถูกล็อกแล้ว ลง Audit Log ของแฟ้ม
   * ห้ามแก้ทับอย่างเดียวไม่พอ ต้องเห็นได้ว่าใครพยายามแก้ช่องไหนเมื่อไร
   */
  recordLockedEditAttempt: (caseNo: string, formCode: string, fieldLabel: string, actor: string) => void

  linkMainCase: (caseNo: string, mainCaseId: string, relation: string, actor?: string) => void
  unlinkMainCase: (caseNo: string) => void
  // ขั้นที่ 1 — ค้นไม่พบเลขคดีหลักจากกิจกรรม 4/5
  markMainCaseNotFound: (caseNo: string, reason: string, actor?: string) => void
  // ขั้นที่ 1 — พยานเข้ามาลงนาม คบ.1 ภายหลังกรณีรับแจ้งทางโทรศัพท์ (คบ.2)
  confirmKb1Signature: (caseNo: string, signerName: string) => void

  // ขั้นที่ 2 — ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน
  assignOfficer: (caseNo: string, officerUserId: string, note?: string) => void
  /**
   * เชื่อมโยงเลขสำนวนหลักไม่ได้ — บันทึกเหตุผลแล้ว "รับเรื่องต่อ" (WIT0215 / NOTE03_CASE)
   * flow ห้ามปัดตกด้วยเหตุนี้ จึงไม่มี action ปัดตกอีกต่อไป
   */
  proceedWithoutMainCase: (caseNo: string, reason: string) => void

  // ขั้นที่ 3 — ผู้ที่ได้รับมอบหมายประเมินความเร่งด่วน (ตัวกำหนดเส้นทาง คบ.6 หรือ คบ.4/คบ.5)
  assessUrgency: (
    caseNo: string,
    urgency: 'normal' | 'urgent',
    note?: string,
    actor?: string,
    /**
     * TC-008 — เมื่อเปลี่ยนจากเร่งด่วนกลับเป็นปกติแล้วซ่อน คบ.4 ออกจากรายการ ต้องเก็บสำเนาข้อมูลร่าง
     * คบ.4 ที่กรอกไว้ไปไว้ใน Audit Log ด้วย (ต่อท้าย detail) เพราะข้อมูลจะไม่ปรากฏในรายการแบบฟอร์มอีก
     */
    extraDetail?: string
  ) => void
  /**
   * ขั้นรับเรื่อง (WIT0207-0208) — เจ้าหน้าที่ ป.ป.ท. กลั่นกรองความเร่งด่วนก่อนจัดทำแบบ คบ.
   * ธุรการไม่ต้องกลั่นกรอง (E09) ผลที่ได้จะถูกส่งต่อให้ ผอ. เห็นก่อนมอบหมาย
   */
  screenUrgencyAtIntake: (caseNo: string, urgency: 'normal' | 'urgent', note: string, actor: string) => void

  // ขั้นที่ 3 — ข้าม คบ.3 พร้อมเหตุผล
  skipKb3: (caseNo: string, reason: string, actor?: string) => void
  undoSkipKb3: (caseNo: string) => void

  // ขั้นที่ 3-4 — ส่งต่อตามลำดับชั้น (รองรับ Fast Track) และส่งกลับแก้ไข
  forwardCase: (caseNo: string, targetStage: string, note?: string) => void
  getNextStage: (caseItem: CaseItem) => string
  returnCase: (
    caseNo: string,
    returnedBy: string,
    issueLabel: string,
    returnNote: string,
    targetRole: string,
    returnedByRole?: 'supervisor' | 'director' | 'deputy_secretary'
  ) => void
  // ขั้นที่ 4 — ลงนามอิเล็กทรอนิกส์ใน คบ.6
  /** WIT0501 — เจ้าหน้าที่บันทึกแบบ คบ.6 ของแฟ้มนี้แล้ว ชุดเสนอจึงมี คบ.6 ครบพอจะส่งกลั่นกรองได้ */
  markKb6Prepared: (caseNo: string, by?: string) => void
  signKb6: (caseNo: string, role: Kb6SignerRole, signerName?: string) => void

  // ขั้นที่ 5
  secretaryApprove: (caseNo: string, decisionNo: string, reason: string, destination: ProtectionHandoffDestination, instruction: string, durationDays?: number) => boolean
  advanceProtectionHandoff: (caseNo: string, action: 'receive' | 'submit' | 'assign' | 'accept', note?: string, assigneeUserId?: string) => boolean
  secretaryReject: (caseNo: string, decisionNo: string, reason: string) => void
  secretaryReturn: (caseNo: string, issue: string, reason: string) => void
  /** WIT0708 — ผอ.สำนัก/กอง มอบหมายให้เจ้าหน้าที่ผู้รับผิดชอบแก้ คบ.3 / คบ.6 เป็น Revision ใหม่ */
  assignReturnRevision: (caseNo: string, instruction: string) => void
  /** WIT0713 — ผลพิจารณาแขนงที่ 4: เห็นควรดำเนินการตามข้อ 14 (ไปแท็บ 08C) */
  secretaryReferArticle14: (caseNo: string, decisionNo: string, reason: string) => void
  submitOutgoingForSignature: (caseNo: string) => void
  submitKb8ForSignature: (caseNo: string) => void
  signOutgoingNotice: (caseNo: string, formNo: OutgoingNoticeFormNo, signerName?: string) => void
  recordDispatch: (
    caseNo: string,
    channel: string,
    tracking: string,
    outcome?: DispatchAttempt['outcome'],
    failureReason?: string
  ) => void
  /** WIT0806 — บันทึกว่าการนำส่งครั้งล่าสุดตีกลับ/ส่งไม่สำเร็จ แล้วเปิดให้เลือกช่องทางใหม่ */
  reportDispatchFailure: (caseNo: string, reason: string, actor?: string) => void
  /** WIT0818 — เลขาธิการฯ ส่งกลับแก้ไข คบ.8 เก็บฉบับเดิมไว้และเปิดรอบ Revision ใหม่ */
  returnKb8ForRevision: (caseNo: string, reason: string, actor?: string) => void
  /** TC-070 — ผลคำร้องหลักไม่อนุมัติระหว่างคุ้มครองชั่วคราว: ยุติวิธีที่ทำงานอยู่และส่งเรื่องไปแท็บ 09A */
  endProtectionForNonApproval: (caseNo: string, actor?: string) => void
  recordDelivery: (caseNo: string, deliveredAt?: string, receipt?: DeliveryReceipt) => void
  /**
   * WIT0911-WIT0913 — พยานยื่นอุทธรณ์ผ่านช่องทางหนังสือหรือวาจา ผูกกับแฟ้มเดิม ไม่สร้าง คบ.1 ใหม่
   * ไม่เปลี่ยน owner อัตโนมัติ — เปลี่ยนได้เฉพาะทาง assignAppealOfficer เท่านั้น
   */
  fileAppeal: (
    caseNo: string,
    reason: string,
    intake: AppealIntakeInput,
    opts?: { against?: 'kb10' | 'kb17'; recordedBy?: string }
  ) => boolean
  /** มอบหมายเจ้าหน้าที่อุทธรณ์อย่างชัดเจน — จุดเดียวที่เปลี่ยน owner ของแฟ้มอุทธรณ์ได้ */
  assignAppealOfficer: (caseNo: string, officerUserId: string, note?: string, actor?: string) => void

  // 09A — ด่านก่อนลงนาม คบ.10 และการปิดเรื่องเมื่อไม่อุทธรณ์
  /** WIT0904 — เจ้าหน้าที่ตรวจความครบถ้วนของร่าง คบ.10 แล้วเสนอรองเลขาธิการฯ กลั่นกรอง */
  submitKb10ForScreening: (caseNo: string, note: string) => void
  /** WIT0905 — รองเลขาธิการฯ กลั่นกรอง คบ.10 ผ่าน (เข้ารอบลงนาม) หรือส่งกลับให้แก้ */
  screenKb10ByDeputy: (caseNo: string, pass: boolean, note: string) => void
  /** WIT0909 — ไม่อุทธรณ์ภายในกำหนด: ปิดกระบวนการไม่อนุมัติอย่างเป็นทางการ */
  closeNonApprovalCase: (
    caseNo: string,
    note: string,
    /** WIT0908→WIT0909 — พยานแจ้งไม่ประสงค์อุทธรณ์ก่อนครบ 30 วัน: ต้องมีหลักฐานคำแจ้งของพยานประกอบ */
    waiver?: { evidence: string }
  ) => void

  // ขั้นที่ 6
  recordPoliceAck: (caseNo: string, documentName: string, durationDays?: number) => void
  addImportantEvent: (caseNo: string, title: string, detail: string, reporter: string) => void
  addMonthlyReport: (caseNo: string, period: string, summary: string, incidentCount: number, submittedBy: string) => void
  /** WIT1006 / WIT1007 — ลงนาม คบ.13 รายรอบรายงาน (เจ้าหน้าที่ผู้ปฏิบัติ แล้วพยานรับรอง) */
  signMonthlyReport: (caseNo: string, reportId: string, slot: Kb13SignSlot, signerName?: string) => void

  // แท็บ 10 — ติดตามและรายงานผลการคุ้มครอง (คบ.13)
  /** WIT1004 — เปิดรอบรายงานใหม่พร้อมหลักฐานที่รวบรวมได้จากทุกวิธี */
  openKb13Round: (caseNo: string, input: OpenKb13RoundInput) => void
  /** WIT1005 — จัดทำ คบ.13 ของรอบที่เปิดอยู่ แล้วแนบแบบเข้าแฟ้มเพื่อลงนาม */
  submitKb13Round: (caseNo: string, reportId: string, patch: Partial<MonthlyReport>) => void
  /**
   * WIT1008 — รับ คบ.13 ที่ลงนามครบแล้วและตรวจผลปฏิบัติเทียบวิธีที่ได้รับอนุมัติ
   * `mismatchIssue` ใช้บันทึกประเด็นความไม่สอดคล้องเป็นปัญหา/เหตุสำคัญของรอบทันทีที่ตรวจรับ
   * เมื่อวิธีที่รายงานว่าปฏิบัติจริงไม่ตรงกับวิธีที่ได้รับอนุมัติ (บังคับกรอกจากหน้า UI ก่อนเรียก)
   */
  receiveKb13Round: (caseNo: string, reportId: string, receivedBy?: string, mismatchIssue?: string) => void
  /** WIT1009 — บันทึกสถานะล่าสุด ระดับความเสี่ยง ปัญหา และข้อเสนอสำหรับรอบถัดไป */
  recordKb13Status: (caseNo: string, reportId: string, status: Kb13StatusInput) => void
  /** WIT1010 — ล็อกฉบับลงนามเป็นรอบรายงานใหม่ (แก้ไขไม่ได้อีก) */
  lockKb13Round: (caseNo: string, reportId: string) => void
  /** WIT1012 — กำหนดรอบ คบ.13 ถัดไป */
  setNextReportDue: (caseNo: string, dueAt: string, by?: string) => void
  /** WIT1013 — ส่ง คบ.13 ล่าสุดพร้อมผลประเมินและยอดวันสะสมไปแท็บ 11A */
  sendToProtectionReview: (caseNo: string, reason: string, by?: string) => void

  // ขั้นที่ 7
  requestExtension: (caseNo: string, durationDays: number, reason: string, requestedBy?: string) => void
  decideExtension: (caseNo: string, requestId: string, approve: boolean, note: string) => void
  requestTermination: (caseNo: string, reason: string, requestedBy?: string) => void
  decideTermination: (caseNo: string, approve: boolean, note: string) => void
  requestTransfer: (caseNo: string, agency: string, reason: string, requestedBy?: string) => void
  completeTransfer: (caseNo: string, note: string) => void
  requestWithdrawal: (caseNo: string, reason: string, requestedBy?: string) => void
  decideWithdrawal: (caseNo: string, role: 'supervisor' | 'director', approve: boolean, note: string) => void

  // Sheet 06 — เส้นทางเร่งด่วน คบ.4 / คบ.5 และการคุ้มครองชั่วคราว
  /** WIT0603 → WIT0604 · ใช้ซ้ำเป็น WIT0608 ตอนส่งฉบับแก้ไขกลับขึ้น ผอ. ตรวจใหม่ */
  submitFastTrackForDecision: (
    caseNo: string,
    methods: ProtectionMethodNo[],
    note?: string,
    duration?: { days: number; startDate?: string }
  ) => void
  /** WIT0606 แขนง "ครบ" — ผอ. ยืนยันว่าเอกสารพร้อมพิจารณา เปิดประตูไป WIT0609 */
  confirmFastTrackReadiness: (caseNo: string, note?: string) => void
  /** WIT0606 แขนง "ไม่ครบ" → WIT0607 ส่งกลับตรงเจ้าหน้าที่ผู้รับผิดชอบ ไม่ผ่าน ผบช.ชั้นต้น */
  returnFastTrackForRework: (caseNo: string, issueLabel: string, note: string) => void
  /** WIT0609 แขนง "อนุมัติ" → WIT0611 ผอ. บันทึกความเห็นใน คบ.4 และลงนาม คบ.5 */
  approveTemporaryProtection: (
    caseNo: string,
    input: { opinion: string; orderNo: string; signerName?: string }
  ) => void
  /** WIT0609 แขนง "ไม่อนุมัติ" → WIT0610 · ไม่ปิดคำร้องหลักและไม่ออก คบ.10 */
  denyTemporaryProtection: (caseNo: string, reason: string) => void
  /** WIT0612 → WIT0613 พยานรับทราบ คบ.5 และลงนามยินยอม แล้วส่งวิธีที่อนุมัติไปแท็บ 08 */
  acknowledgeKb5Order: (caseNo: string, witnessName: string) => void

  // ขั้นที่ 6 (08A) — ความยินยอมและการแยกวิธีที่อนุมัติ
  recordConsent: (caseNo: string, record: Omit<ConsentRecord, 'at'>) => void
  /**
   * WIT0812 — พยานไม่ยินยอม: บันทึกเหตุ ระงับวิธีที่ยังไม่เริ่ม แล้วเสนอหนึ่งในสามแนวทาง
   * (ทบทวน / เปลี่ยนวิธี / ยุติ) เข้าสู่ลำดับผู้บังคับบัญชา — ผบช.ชั้นต้น → ผอ.สำนัก/กอง
   */
  declineConsent: (
    caseNo: string,
    input: {
      ref: 'kb11' | 'kb5'
      by: string
      reason: string
      evidence?: string
      proposedAction: ConsentDeclineAction
      proposedMethods?: ProtectionMethodNo[]
    },
    actor?: string
  ) => void
  /** WIT0812 — ผบช.ชั้นต้น / ผอ. พิจารณาข้อเสนอแนวทางหลังไม่ยินยอม (เห็นชอบ-อนุมัติ หรือส่งคืนแก้ไข) */
  reviewConsentDecline: (
    caseNo: string,
    proposalId: string,
    level: 'supervisor' | 'director',
    endorse: boolean,
    note: string
  ) => void
  /**
   * WIT0845 — หน่วยงานปลายทางปฏิเสธ: เสนอหน่วยงานใหม่ขึ้น ผบช.ชั้นต้น → ผอ.สำนัก/กอง
   * ครึ่งหลังของ node ต้องเป็นงานจริงในคิว ไม่ใช่ข้อความแจ้งเตือนที่หายไป
   */
  proposeCoordinationAgency: (
    caseNo: string,
    input: { declinedAgency: string; declinedReason: string; proposedAgency: string; note?: string },
    actor?: string
  ) => void
  /** WIT0845 — ผบช.ชั้นต้น / ผอ. พิจารณาข้อเสนอหน่วยงานใหม่ (เห็นชอบ-อนุมัติ หรือส่งคืนแก้ไข) */
  reviewCoordinationProposal: (
    caseNo: string,
    proposalId: string,
    level: 'supervisor' | 'director',
    endorse: boolean,
    note: string
  ) => void
  /** WIT0848 — ส่งมอบจริงและลงนาม คบ.12 ภายใต้วิธีที่ 4 ของคำสั่งเดิม (ไม่ใช่เส้นทางครบเพดาน 6 เดือน) */
  completeMethod4Handover: (caseNo: string, input?: { handoverCompletedAt?: string; actor?: string }) => void
  /** WIT0860 แขนง — กรมคุ้มครองสิทธิฯ แจ้งว่าดำเนินการตามข้อ 14 ไม่ได้ */
  recordArticle14DeliveryFailure: (
    caseNo: string,
    input: { failedReason: string; proposedApproach: string; note?: string },
    actor?: string
  ) => void
  /** WIT0860 แขนง — ผบช.ชั้นต้น / ผอ. พิจารณาข้อเสนอหลังกรมดำเนินการไม่ได้ */
  reviewArticle14Escalation: (
    caseNo: string,
    proposalId: string,
    level: 'supervisor' | 'director',
    endorse: boolean,
    note: string
  ) => void
  setApprovedMethods: (caseNo: string, methods: ProtectionMethodNo[], actor?: string) => void
  updateMethodTrack: (caseNo: string, method: ProtectionMethodNo, patch: Partial<ProtectionMethodTrack>) => void
  setMethodStatus: (
    caseNo: string,
    method: ProtectionMethodNo,
    status: ProtectionMethodStatus,
    detail?: { at?: string; reason?: string; orderRef?: string }
  ) => void

  // Episode / Phase (08A-1, 10, 11A, 11B)
  startPhase: (caseNo: string, kind: ProtectionPhaseKind, startedAt: string, orderRef?: string) => void
  endEpisode: (caseNo: string, endedAt: string, reason: string) => void

  // หนังสือราชการผ่านสารบรรณเดิม (08B, 08C, 11D)
  addOfficialLetter: (caseNo: string, letter: Omit<OfficialLetter, 'id'>) => void
  updateOfficialLetter: (caseNo: string, letterId: string, patch: Partial<OfficialLetter>) => void

  // 08C — ข้อ 14
  openArticle14: (caseNo: string, input: Pick<Article14Case, 'threatSummary' | 'riskAssessment' | 'recommendedMeasure'>, actor?: string) => void
  reviewArticle14: (caseNo: string, role: 'supervisor' | 'secretary', endorse: boolean, note: string) => void
  recordArticle14Resolution: (caseNo: string, resolutionNo: string, approved: boolean, note: string) => void
  /** WIT0860 — บันทึกหนังสือตอบรับขาเข้าจากกรม ต้องมีหนังสือขาออกก่อน จึงเปิดขั้นเตรียมส่งมอบ (WIT0861) */
  recordArticle14Reply: (
    caseNo: string,
    input: {
      registryNo: string
      registryDate: string
      contactPerson: string
      channel: 'direct' | 'post' | 'official_other'
      appointmentAt: string
      conditions: string
      documentName: string
    }
  ) => void
  completeArticle14Handover: (caseNo: string, input: { handoverCompletedAt: string; successorStartedAt: string; successorLegalBasis: string }) => void

  // 11A — ทบทวนผล
  submitReviewProposal: (
    caseNo: string,
    input: Pick<ReviewProposal, 'riskSummary' | 'performanceSummary' | 'issues' | 'proposedOutcome' | 'reason'>,
    actor?: string
  ) => void
  decideReviewProposal: (caseNo: string, proposalId: string, endorse: boolean, note: string) => void
  applyReviewOutcome: (caseNo: string, outcome: ReviewOutcome) => void
  /**
   * WIT1110 — เสนอเปลี่ยนวิธี/เงื่อนไขต่อผู้มีอำนาจ (เจ้าหน้าที่ผู้รับผิดชอบ → ผบช.ชั้นต้น → ผอ.สำนัก/กอง)
   * ยังไม่เปลี่ยนชุดวิธีในแฟ้ม ณ จุดนี้ — เปลี่ยนต่อเมื่อ ผอ. อนุมัติแล้วเท่านั้น
   */
  proposeMethodChange: (
    caseNo: string,
    input: { proposedMethods: ProtectionMethodNo[]; conditions?: string; reason: string },
    actor?: string
  ) => void
  /** WIT1110 — ด่านพิจารณาตามลำดับชั้น · ผอ. อนุมัติแล้วจึงปรับ คบ.11 เป็นชุดวิธีใหม่จริง */
  reviewMethodChange: (
    caseNo: string,
    proposalId: string,
    level: 'supervisor' | 'director',
    endorse: boolean,
    note: string
  ) => void

  // 11B — คบ.14 (จัดทำ → ผู้ตรวจ → เสนอตามลำดับชั้น)
  /** WIT1114-WIT1116 — จัดทำ/แก้ไข คบ.14 เป็นเวอร์ชันใหม่ เก็บฉบับเดิมไว้เสมอ */
  draftKb14: (
    caseNo: string,
    input: {
      reason: string
      durationDays: number
      durationMonths?: number
      periodFrom?: string
      periodTo?: string
      attachments?: string[]
      gapDays?: number
      gapReason?: string
      formSnapshot?: Record<string, any>
    },
    actor?: string
  ) => void
  /** WIT1117-WIT1120 — ผู้ตรวจตรวจเอกสาร: ครบถ้วนแล้วเสนอตามลำดับชั้น ไม่ครบส่งกลับแก้ */
  reviewKb14: (caseNo: string, requestId: string, endorse: boolean, note: string) => void

  // 11C — เหตุเริ่มยุติ + คบ.15
  /** WIT1125-WIT1128 — บันทึกเหตุเริ่มยุติและเอกสารต้นเรื่องเข้ากับแฟ้มเดิม */
  recordTerminationTrigger: (
    caseNo: string,
    input: Omit<TerminationTrigger, 'recordedAt' | 'recordedBy'>,
    actor?: string,
    /** WIT1127 — ไฟล์จริงที่อัปโหลดไว้ล่วงหน้า (blob URL) แนบเข้ากับรายการเอกสารของแฟ้มเดิมให้พรีวิว/ดาวน์โหลดได้ */
    documentPreviewUrl?: string
  ) => void
  /**
   * TC-144 — เพิ่มเหตุยุติเสริมที่เกิดพร้อมกับเหตุหลัก (เช่น คบ.7 + ครบกำหนด)
   * ไม่เปลี่ยนแนวทาง/ไม่สร้างเรื่องยุติใหม่ — กันซ้ำ: แขนงเดียวกับเหตุหลักหรือที่มีอยู่แล้วจะไม่ถูกเพิ่มซ้ำ
   */
  addTerminationAdditionalReason: (
    caseNo: string,
    input: Omit<TerminationAdditionalReason, 'recordedAt' | 'recordedBy'>,
    actor?: string
  ) => void
  draftKb15: (
    caseNo: string,
    input: Pick<Kb15Report, 'trigger' | 'triggerRef' | 'summary' | 'evidenceNote'> &
      Partial<Pick<Kb15Report, 'triggerDocumentName' | 'triggerReceivedAt'>>,
    actor?: string
  ) => void
  reviewKb15: (caseNo: string, endorse: boolean, note: string) => void

  // 11D — คบ.16 / คบ.17
  /** WIT1136-WIT1137 — ผู้มีอำนาจพิจารณาว่าจะยุติหรือไม่ ก่อนร่าง คบ.16 */
  decideTerminationApproval: (caseNo: string, approve: boolean, note: string, actor?: string) => void
  issueKb16: (
    caseNo: string,
    input: { orderNo: string; reason: string; issuedAt: string; effectiveAt: string; backdatedReason?: string }
  ) => void
  submitKb16ForSignature: (caseNo: string, patch?: Partial<Kb16Order>) => void
  signKb16: (caseNo: string, signerName?: string) => void
  recordOperationStopped: (caseNo: string, stoppedAt: string) => void
  draftKb17: (caseNo: string, input: { documentName: string }) => void
  submitKb17ForSignature: (caseNo: string) => void
  signKb17: (caseNo: string, signerName?: string) => void
  dispatchKb17: (caseNo: string, input: { documentName: string; registryNo: string; registryDate: string }) => void
  recordKb17Delivery: (caseNo: string, deliveredAt: string, receiptEvidence?: string) => void
  /** TC-153 — บันทึกผลความพยายามนำส่ง คบ.17 แต่ละครั้ง (append-only) */
  recordKb17DeliveryAttempt: (
    caseNo: string,
    attempt: { channel: string; attemptedAt: string; result: 'success' | 'failed'; note?: string; evidence?: string },
    actor?: string
  ) => void
  /** TC-153 — บันทึกวันที่ถือว่าพยานได้รับ คบ.17 ตามระเบียบ หลังนำส่งไม่สำเร็จอย่างน้อย 1 ครั้ง */
  recordKb17DeemedReceipt: (caseNo: string, deemedAt: string, method: string, actor?: string) => void
  /** WIT1143 — อัปโหลด คบ.17 ฉบับที่ส่งจริงเข้ากับแฟ้ม */
  attachKb17Sent: (caseNo: string, documentName: string, actor?: string) => void
  /**
   * WIT1147 — รับอุทธรณ์คำสั่งยุติ ผูกกับ คบ.17 เดิม ไม่สร้าง คบ.1 ใหม่
   * เป็น wrapper บาง ๆ ที่เดินผ่านฟอร์มรับอุทธรณ์เดียวกับ 09B (fileAppeal) โดยระบุ against เป็น 'kb17'
   */
  openKb17Appeal: (caseNo: string, reason: string, intake: AppealIntakeInput, actor?: string) => void
  closeProtectionCase: (caseNo: string, note?: string) => void

  // 09B — ลำดับชั้นแฟ้มอุทธรณ์และมติคณะกรรมการ
  /** WIT0914 — ตรวจความครบถ้วนและกรอบ 30 วัน · ยื่นช้าให้บันทึกเหตุผล ห้ามปัดตกอัตโนมัติ */
  checkAppealFolder: (caseNo: string, input: { lateReason?: string }) => void
  /** WIT0914 แขนงล่าช้า — ผบช.ชั้นต้นรับเรื่องที่ยื่นเกินกำหนดไว้ ให้คณะกรรมการเป็นผู้ตัดสิน */
  acceptLateAppeal: (caseNo: string, note: string) => void
  /** WIT0915-WIT0918 — บันทึกความเห็นทีละชั้นแล้วส่งต่อขั้นถัดไปตามลำดับ */
  recordAppealOpinion: (caseNo: string, level: 'officer' | 'supervisor' | 'director' | 'deputy' | 'secretary', note: string) => void
  /** WIT0919 — ฝ่ายเลขานุการบรรจุระเบียบวาระเสนอคณะกรรมการวินิจฉัย */
  scheduleAppealAgenda: (caseNo: string, agendaNo: string) => void
  prepareAppealKb6Revision: (caseNo: string) => void
  recordAppealResolution: (caseNo: string, input: { resolutionNo: string; outcome: 'uphold' | 'overturn'; note: string }) => void
  /** WIT0921/WIT0922 — บันทึกหนังสือแจ้งผลอุทธรณ์และหลักฐานการรับของพยาน */
  recordAppealNotice: (
    caseNo: string,
    input: {
      documentName: string
      registryNo: string
      sentAt: string
      deliveredAt: string
      recipient: string
      ackDocument?: string
    }
  ) => void

  addCaseDocument: (caseNo: string, document: IntakeDocument) => void
  removeCaseDocument: (caseNo: string, documentId: string) => void

  addExtraForm: (caseNo: string, formNo: number) => void
  removeExtraForm: (caseNo: string, formNo: number) => void

  resetToDefault: () => void
}

export const useCaseStore = create<CaseState>()(
  persist(
    (set, get) => ({
      ...getDefaultCaseState(),
      customTransferAgencies: [],

      addCustomTransferAgency: (name) => {
        const trimmed = name.trim()
        if (!trimmed || get().customTransferAgencies.includes(trimmed)) return
        set((state) => ({ customTransferAgencies: [...state.customTransferAgencies, trimmed] }))
      },

      setActiveCaseNo: (no) => set({ activeCaseNo: no }),

      getCase: (no) => {
        const targetNo = no || get().activeCaseNo
        if (!targetNo) return get().cases[0]
        return get().cases.find((c) => c.no === targetNo) || get().cases[0]
      },

      addCase: (item) => {
        set((state) => ({
          cases: [item, ...state.cases],
          activeCaseNo: item.no,
        }))
      },

      beginPreliminaryDecision: (caseNo, outcome) => {
        const current = get().getCase(caseNo)
        const auth = useAuthStore.getState()
        const actor = auth.getCurrentUserAccount()
        if (!current || isCaseClosed(current) || hasSignedResultNotice(current) || current.stage !== 'external_pending' || !actor || !['secretary', 'admin'].includes(auth.currentRole) || !['approved', 'rejected'].includes(outcome)) return false
        const formNo: ResultNoticeFormNo = outcome === 'approved' ? 9 : 10
        get().prepareResultNotices(caseNo)
        const refreshed = get().getCase(caseNo)!
        if (refreshed.preliminaryDecision?.formNo === formNo) return true
        const at = nowDisplay()
        const previous = refreshed.preliminaryDecision
        const existing = refreshed.noticeDecisionDrafts?.[formNo]
        const selected: NoticeDecisionDraft = existing ? { ...existing, selectedAt: at, selectedBy: actor.name } : {
          formNo, outcome, decisionNo: `ลธ.ปปท./${current.no.slice(-6)}/${new Date().getFullYear() + 543}`,
          reason: '', instruction: '', durationDays: current.protectionDays || PROTECTION_DEFAULT_DAYS,
          selectedAt: at, selectedBy: actor.name,
        }
        get().updateCase(caseNo, {
          preliminaryDecision: selected,
          noticeDecisionDrafts: { ...refreshed.noticeDecisionDrafts, ...(previous ? { [previous.formNo]: previous } : {}), [formNo]: selected },
          preliminaryDecisionHistory: [...(refreshed.preliminaryDecisionHistory || []), { id: crypto.randomUUID(), at, by: actor.name, userId: actor.id, formNo, previousFormNo: previous?.formNo }],
          extraForms: Array.from(new Set([...(current.extraForms || []).filter((no) => no !== 9 && no !== 10), formNo])),
        })
        return true
      },

      savePreliminaryDecision: (caseNo, formNo, input) => {
        const current = get().getCase(caseNo)
        const auth = useAuthStore.getState()
        const actor = auth.getCurrentUserAccount()
        const draft = current?.preliminaryDecision
        const notice = current?.resultNotices?.[formNo]
        if (!current || isCaseClosed(current) || hasSignedResultNotice(current) || current.stage !== 'external_pending' || !actor || !['secretary', 'admin'].includes(auth.currentRole) || draft?.formNo !== formNo || !notice) return false
        if (typeof input.decisionNo !== 'string' || typeof input.reason !== 'string' || typeof input.instruction !== 'string' || !Number.isFinite(input.durationDays) || input.durationDays <= 0 || input.durationDays > PROTECTION_MAX_DAYS || (input.destination && !['original_owner', 'got'].includes(input.destination))) return false
        if (!input.fields || Object.keys(input.fields).some((key) => !NOTICE_DETAIL_FIELDS.includes(key as typeof NOTICE_DETAIL_FIELDS[number]) || typeof input.fields[key] !== 'string')) return false
        const fields = { ...notice.fields, ...Object.fromEntries(Object.entries(input.fields).map(([key, value]) => [key, value.trim()])) }
        const forms = useFormDraftStore.getState()
        forms.ensureDraftForCase(formNo, caseNo, notice.fields)
        for (const key of NOTICE_DETAIL_FIELDS) if (Object.prototype.hasOwnProperty.call(fields, key)) forms.updateField(formNo, key, fields[key])
        const at = nowDisplay()
        const next: NoticeDecisionDraft = { ...draft, decisionNo: input.decisionNo.trim(), reason: input.reason.trim(), instruction: input.instruction.trim(), durationDays: input.durationDays,
          ...(formNo === 9 && input.destination ? { destination: input.destination } : { destination: undefined }), savedAt: at, savedBy: actor.name }
        get().updateCase(caseNo, {
          preliminaryDecision: next, noticeDecisionDrafts: { ...current.noticeDecisionDrafts, [formNo]: next },
          resultNotices: { ...current.resultNotices, [formNo]: { ...notice, fields, status: 'awaiting_signature' } },
        })
        return true
      },

      confirmPreliminaryDecision: (caseNo, formNo) => {
        const current = get().getCase(caseNo)
        const draft = current?.preliminaryDecision
        const auth = useAuthStore.getState()
        if (!current || isCaseClosed(current) || hasSignedResultNotice(current) || current.stage !== 'external_pending' || !['secretary', 'admin'].includes(auth.currentRole) || draft?.formNo !== formNo || !draft.savedAt || !current.kb6SecretarySignedAt || !draft.decisionNo.trim() || !draft.reason.trim()) return false
        if (formNo === 9) return draft.outcome === 'approved' && Boolean(draft.destination) && get().secretaryApprove(caseNo, draft.decisionNo, draft.reason, draft.destination!, draft.instruction, draft.durationDays)
        if (draft.outcome !== 'rejected') return false
        get().secretaryReject(caseNo, draft.decisionNo, draft.reason)
        return Boolean(get().getCase(caseNo)?.resultNotices?.[10]?.original)
      },

      prepareResultNotices: (caseNo) => {
        const current = get().getCase(caseNo)
        if (!current || isCaseClosed(current)) return false
        const auth = useAuthStore.getState()
        if (!['officer', 'case_owner', 'admin', 'supervisor', 'director', 'deputy', 'deputy_secretary', 'secretary'].includes(auth.currentRole)) return false
        const notices = { ...(current.resultNotices || {}) }
        let changed = false
        for (const formNo of [9, 10] as const) {
          const fields = selectCaseDraft(useFormDraftStore.getState(), formNo, caseNo)
          if (!notices[formNo]) {
            notices[formNo] = createNoticeDraft(formNo, current, nowDisplay(), auth.getCurrentUserAccount()?.name || current.owner, fields)
            changed = true
          } else if (!notices[formNo]!.original) {
            const old = notices[formNo]!
            const next = { ...old, fields: { ...old.fields, ...fields }, policy: cloneNotice(NOTICE_FIELD_POLICY),
              status: (current.stage === 'external_pending' ? 'awaiting_signature' : 'draft') as typeof old.status }
            if (JSON.stringify(next) !== JSON.stringify(old)) { notices[formNo] = next; changed = true }
          }
        }
        if (changed) get().updateCase(caseNo, { resultNotices: notices })
        return true
      },

      completeResultNotice: (caseNo, formNo, patch) => {
        const current = get().getCase(caseNo)
        const document = current?.resultNotices?.[formNo]
        const auth = useAuthStore.getState()
        const actor = auth.getCurrentUserAccount()
        if (!current || isCaseClosed(current) || !document?.original || !actor || noticeForCase(current)?.formNo !== formNo) return false
        if (!noticeWorkerAllowed(auth.currentRole, current, auth.currentOfficerUserId) || !document.policy.confirmed || ['ready', 'sent'].includes(document.status)) return false
        const keys = Object.keys(patch)
        if (!keys.length || keys.some((key) => !NOTICE_DETAIL_FIELDS.includes(key as typeof NOTICE_DETAIL_FIELDS[number]) || !document.policy.allowedAfterSigning.includes(key) || typeof patch[key] !== 'string')) return false
        const changes = keys.filter((key) => (document.fields[key] || '') !== patch[key].trim()).map((field) => ({ field, before: document.fields[field] || '', after: patch[field].trim() }))
        if (!changes.length) return false
        const fields = { ...document.fields }
        changes.forEach(({ field, after }) => { fields[field] = after })
        const version = document.versions.length + 1
        const at = nowDisplay()
        const snapshot = { ...cloneNotice(document.original), version, fields: cloneNotice(fields), signatureVerification: 'not_covered_by_original_signature' as const }
        const next = { ...document, fields, versions: [...document.versions, snapshot],
          audit: [...document.audit, { id: crypto.randomUUID(), at, by: actor.name, userId: actor.id, version, changes }], checkedAt: undefined, checkedBy: undefined }
        next.status = missingNoticeFields(next).length ? 'signed_incomplete' : 'completed'
        set((state) => ({ cases: state.cases.map((item) => item.no === caseNo ? { ...item, resultNotices: { ...item.resultNotices, [formNo]: next }, updatedAt: new Date().toISOString() } : item) }))
        get().logHistory(caseNo, `มีการเติมรายละเอียดหลังลงนาม คบ.${formNo} รุ่น ${version}`, actor.name, changes.map((c) => `${c.field}: ${c.before || '(ว่าง)'} → ${c.after || '(ว่าง)'}`).join(' · '))
        return true
      },

      checkResultNoticeReady: (caseNo) => {
        const current = get().getCase(caseNo)
        const document = noticeForCase(current)
        const actor = useAuthStore.getState().getCurrentUserAccount()
        if (!current || isCaseClosed(current) || !actor || !noticeWorkerAllowed(useAuthStore.getState().currentRole, current, useAuthStore.getState().currentOfficerUserId) || !document?.original || document.status !== 'completed' || missingNoticeFields(document).length) return false
        const next = { ...document, status: 'ready' as const, checkedAt: nowDisplay(), checkedBy: actor.name }
        set((state) => ({ cases: state.cases.map((item) => item.no === caseNo ? { ...item, resultNotices: { ...item.resultNotices, [document.formNo]: next } } : item) }))
        get().logHistory(caseNo, `ตรวจ คบ.${document.formNo} พร้อมส่ง`, actor.name, `รุ่น ${document.versions.length} ข้อมูลครบ — ลายมือชื่อจำลองเดิมอ้างถึงรุ่น 1 เท่านั้น`)
        return true
      },

      updateCase: (no, updates) => {
        /** WIT1148 — แฟ้มปิดงานคุ้มครองแล้วถูกล็อกทั้งแฟ้ม: รับเฉพาะการบันทึกประวัติ/Audit Log เท่านั้น */
        const target = get().cases.find((c) => c.no === no)
        if ('appealKb6Version' in updates || 'appealKb6PreviousResult' in updates) return
        if (target && updates.kb11Signed === true && target.activity7State === 'approved') {
          const forms = useFormDraftStore.getState()
          const signatures = forms.draftCaseNo[11] === no ? forms.signatures : forms.caseDrafts[no]?.signatures || {}
          if (!kb11Gate(target).unlocked || !KB11_SIGN_SLOTS.every((slot) => signatures[slot.key]?.signed)) return
        }
        // An appeal starts a new approval round, but cannot replace the old signed KB10.
        if (target?.appealKb6Version && target.resultNotices?.[10]?.original && 'resultNotices' in updates &&
          JSON.stringify(updates.resultNotices?.[10]) !== JSON.stringify(target.resultNotices[10])) return
        if (hasSignedResultNotice(target) && Object.keys(updates).some((key) => ['resultNotices', 'preliminaryDecision', 'noticeDecisionDrafts', 'preliminaryDecisionHistory', 'activity7State', 'resultAt', 'resultReason', 'resultSigner', 'secretarySignedAt', 'secretarySignedBy', 'kb9Signed', 'kb9SignedAt', 'kb9SignedBy', 'kb10Signed', 'kb10SignedAt', 'kb10SignedBy', 'outgoingSignedAt', 'outgoingSignedBy', 'decisionNumber'].includes(key))) return
        if (isCaseClosed(target) && Object.keys(updates).some((k) => k !== 'assignmentHistory')) return
        set((state) => ({
          cases: state.cases.map((c) => (c.no === no ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c)),
        }))
      },

      deleteCase: (no) => {
        set((state) => ({
          cases: state.cases.filter((c) => c.no !== no),
        }))
      },

      recordLockedEditAttempt: (caseNo, formCode, fieldLabel, actor) => {
        get().logHistory(
          caseNo,
          `พยายามแก้ไขเอกสารฉบับลงนาม ${formCode}`,
          actor,
          `ช่อง "${fieldLabel}" — ระบบปฏิเสธการแก้ไข ฉบับลงนามถูกล็อกไว้ ห้ามแก้ทับ`
        )
      },

      logHistory: (caseNo, action, actor, detail) => {
        const current = get().cases.find((c) => c.no === caseNo)
        if (!current) return
        get().updateCase(caseNo, {
          assignmentHistory: [...(current.assignmentHistory || []), { at: nowDisplay(), action, actor, detail }],
        })
      },

      linkMainCase: (caseNo, mainCaseId, relation, actor) => {
        const option = MAIN_CASE_OPTIONS.find((opt) => opt.id === mainCaseId)
        if (!option) return

        get().updateCase(caseNo, {
          linkedMainCaseId: option.id,
          mainCaseNo: option.no,
          mainCaseTitle: option.title,
          mainCaseScore: `${option.matchScore}%`,
          mainCaseRelation: relation,
          mainCaseStatus: 'linked',
          mainCaseNotFound: false,
          // เก็บเจ้าของสำนวนคดีหลักไว้ตั้งแต่ตอนเชื่อมโยง แม้ ผอ.สำนัก/กอง จะมอบหมายให้ผู้อื่นในภายหลัง
          ...resolveMainCaseLeadOfficer(option.id),
        })
        get().logHistory(
          caseNo,
          'เชื่อมโยงเลขคดีหลัก',
          actor || ACTOR.officer,
          `${option.no} — ${option.title} · เจ้าของสำนวนคดีหลัก: ${option.leadOfficer}`
        )
      },

      unlinkMainCase: (caseNo) => {
        get().updateCase(caseNo, {
          linkedMainCaseId: undefined,
          mainCaseNo: undefined,
          mainCaseTitle: undefined,
          mainCaseScore: undefined,
          mainCaseRelation: undefined,
          mainCaseStatus: undefined,
          mainCaseLeadOfficer: undefined,
          mainCaseLeadOfficerUserId: undefined,
        })
      },

      /**
       * WIT0213 → WIT0215 — ค้นเลขสำนวนหลักไม่พบ ต้อง "บันทึกเหตุผล" ก่อนเสมอ
       * แล้วรับเรื่องต่อเพื่อเสนอ ผอ. มอบหมายตามปกติ · ระเบียบห้ามปัดตกด้วยเหตุนี้
       */
      markMainCaseNotFound: (caseNo, reason, actor) => {
        const detail = (reason || '').trim()
        if (!detail) return
        /** เจ้าของสำนวนระบุ "ไม่พบคดี" หลังได้รับมอบหมายแล้ว — ไม่ย้อนสถานะแฟ้มกลับไปรอ ผอ. มอบหมาย */
        const current = get().getCase(caseNo)
        const atIntake = !current || ['receiver_intake', 'officer_intake', 'director_assign'].includes(current.stage)
        get().updateCase(caseNo, {
          mainCaseNotFound: true,
          mainCaseNotFoundReason: detail,
          mainCaseStatus: 'not_found',
          linkedMainCaseId: undefined,
          mainCaseNo: undefined,
          mainCaseTitle: undefined,
          mainCaseLeadOfficer: undefined,
          mainCaseLeadOfficerUserId: undefined,
          ...(atIntake && {
            status: 'รับเรื่องต่อโดยยังไม่มีเลขสำนวนหลัก',
            next: 'ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวนตามปกติ แล้วติดตามเชื่อมโยงเลขสำนวนภายหลัง',
          }),
        })
        get().logHistory(
          caseNo,
          'ระบุสถานะ "ไม่พบคดี" · บันทึกเหตุผลและรับเรื่องต่อ',
          actor || ACTOR.officer,
          `${detail} — รับเรื่องต่อตามระเบียบ ห้ามปัดตกด้วยเหตุนี้`
        )
      },

      confirmKb1Signature: (caseNo, signerName) => {
        get().updateCase(caseNo, {
          kb1SignaturePending: false,
          kb1SignedAt: nowDisplay(),
          form: 'คบ.1',
        })
        get().logHistory(caseNo, 'พยานเข้ามาลงนามยินยอมใน คบ.1', signerName, 'เดิมรับแจ้งทางโทรศัพท์และบันทึกไว้ในแบบ คบ.2')
      },

      // ---------- ขั้นที่ 2 : การมอบหมายและจัดสรรผู้รับผิดชอบ ----------
      assignOfficer: (caseNo, officerUserId, note) => {
        const current = get().getCase(caseNo)
        if (current?.protectionHandoff) return
        if (!current) return
        const officer = ECMIS_USER_DIRECTORY.find((u) => u.id === officerUserId)
        if (!officer) return

        /** เปลี่ยนตัวผู้รับผิดชอบ ไม่ใช่การมอบหมายครั้งแรก — ใช้แยกข้อความแจ้งเตือนและบันทึกประวัติ */
        const previousOfficer = current.assignedOfficerUserId
        const isReassign = Boolean(previousOfficer) && previousOfficer !== officer.id

        get().updateCase(caseNo, {
          assignedOfficer: officer.name,
          assignedOfficerUserId: officer.id,
          assignedAt: nowDisplay(),
          assignedBy: ACTOR.director,
          status: 'มอบหมายเจ้าของสำนวนแล้ว — รอส่งต่อ',
          next: 'ยืนยันส่งต่อเพื่อเริ่มขั้นตอนถัดไป (สามารถเปลี่ยนเจ้าของสำนวนได้ก่อนส่งต่อ)',
        })
        get().logHistory(
          caseNo,
          isReassign ? 'ผอ.สำนัก/กอง เปลี่ยนเจ้าของสำนวน' : 'ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน',
          ACTOR.director,
          note || `มอบหมายให้ ${officer.name} (${officer.unit}) รับผิดชอบสำนวนเพื่อความต่อเนื่องของคดี`
        )

        /**
         * WIT0306 — แจ้งเตือนงานไปยังเจ้าหน้าที่ที่ถูกมอบหมาย ระบุตัวผู้รับด้วย toUserId
         * เพื่อให้ขึ้นเฉพาะในกล่องแจ้งเตือนของเจ้าตัว ไม่ใช่ประกาศให้ทุกคนเห็น
         */
        useNotificationStore.getState().addNotification({
          caseNo,
          type: isReassign ? 'เปลี่ยนตัวผู้รับผิดชอบงานคุ้มครองพยาน' : 'มอบหมายงานคุ้มครองพยาน',
          toName: officer.name,
          toUserId: officer.id,
          channel: 'ระบบ E-CMIS',
          message: `${ACTOR.director} มอบหมายให้ท่านรับผิดชอบงานคุ้มครองพยานของแฟ้ม ${caseNo} (${current.person || 'ยังไม่ระบุชื่อผู้ขอรับการคุ้มครอง'})`,
          urgency: current.urgent ? 'ด่วนที่สุด' : 'ปกติ',
        })

        /** เจ้าหน้าที่คนเดิมต้องรู้ว่างานถูกย้ายออกจากคิวของตนแล้ว */
        if (isReassign && previousOfficer) {
          const former = ECMIS_USER_DIRECTORY.find((u) => u.id === previousOfficer)
          useNotificationStore.getState().addNotification({
            caseNo,
            type: 'ยกเลิกการมอบหมายงานคุ้มครองพยาน',
            toName: former?.name || previousOfficer,
            toUserId: previousOfficer,
            channel: 'ระบบ E-CMIS',
            message: `แฟ้ม ${caseNo} ถูกเปลี่ยนผู้รับผิดชอบไปยัง ${officer.name} — งานนี้ออกจากคิวงานของท่านแล้ว`,
            urgency: 'ปกติ',
          })
        }
      },

      /**
       * ไม่พบ/ยังเชื่อมโยงเลขสำนวนหลักไม่ได้ — บันทึกเหตุผลแล้วเดินเรื่องต่อ
       * flow WIT0215 และ NOTE03_CASE ห้ามปัดตกด้วยเหตุนี้: ยังต้องเสนอ ผอ. มอบหมายตามปกติ
       */
      proceedWithoutMainCase: (caseNo, reason) => {
        const current = get().getCase(caseNo)
        if (!current) return
        get().updateCase(caseNo, {
          mainCaseNotFound: true,
          mainCaseNotFoundReason: reason,
          rejectedReason: undefined,
          rejectedAt: undefined,
          closedAt: undefined,
          status: 'รับเรื่องต่อโดยยังไม่มีเลขสำนวนหลัก',
          next: 'ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวนตามปกติ แล้วติดตามเชื่อมโยงเลขสำนวนภายหลัง',
        })
        /** การกระทำเดียวต้องได้ประวัติหนึ่งรายการ — เดิมเขียนทั้งใน updateCase และ logHistory จึงซ้ำกันสองบรรทัด */
        get().logHistory(
          caseNo,
          'เชื่อมโยงเลขสำนวนหลักไม่ได้ · บันทึกเหตุผลและรับเรื่องต่อ',
          current.receivedBy || ACTOR.receiver,
          `${reason} — รับเรื่องต่อตามระเบียบ ห้ามปัดตกด้วยเหตุนี้`
        )
      },

      // ---------- ขั้นที่ 3 : ประเมินความเร่งด่วนและจัดทำเอกสาร ----------
      assessUrgency: (caseNo, urgency, note, actor, extraDetail) => {
        const current = get().getCase(caseNo)
        if (!current) return

        const isUrgent = urgency === 'urgent'
        /** WIT0410 — แก้ผลประเมินทับของเดิม ต้องแยกข้อความในประวัติ ไม่ให้ปนกับการประเมินครั้งแรก */
        const isRevision = Boolean(current.urgencyAssessedAt) && current.urgency !== urgency
        const remaining = current.pendingIntakeForms || ['คบ.3']
        const tail = isUrgent ? 'คบ.4 → คบ.5' : 'คบ.6'
        const assessor = actor || protectionResponsibleName(current)

        get().updateCase(caseNo, {
          urgency,
          urgent: isUrgent,
          urgencyAssessedAt: nowDisplay(),
          urgencyAssessedBy: assessor,
          urgencyAssessmentNote: note,
          risk: isUrgent && current.risk === 'ยังไม่ประเมิน' ? 'วิกฤต' : current.risk,
          status: isUrgent ? 'ประเมินเป็นกรณีจำเป็นเร่งด่วน' : 'ประเมินเป็นกรณีปกติ',
          next: `จัดทำ ${remaining.join(' / ')} แล้วดำเนินการตามเส้นทาง ${tail}`,
        })
        const baseDetail =
          note ||
          (isUrgent
            ? 'มีภัยคุกคามต่อชีวิตโดยทันที เข้าเส้นทาง คบ.4 → คบ.5 โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น'
            : 'ไม่เข้าเงื่อนไขจำเป็นเร่งด่วน ดำเนินการตามเส้นทางปกติจนถึง คบ.6')
        get().logHistory(
          caseNo,
          isRevision
            ? `แก้ผลการประเมินความเร่งด่วน · ${isUrgent ? 'กรณีจำเป็นเร่งด่วน' : 'กรณีปกติ'}`
            : isUrgent
            ? 'ประเมินเป็นกรณีจำเป็นเร่งด่วน'
            : 'ประเมินเป็นกรณีปกติ',
          assessor,
          extraDetail ? `${baseDetail}\n\n${extraDetail}` : baseDetail
        )
      },

      skipKb3: (caseNo, reason, actor) => {
        get().updateCase(caseNo, {
          kb3Skipped: true,
          kb3SkipReason: reason,
          kb3SkippedAt: nowDisplay(),
          kb3SkippedBy: actor || ACTOR.officer,
        })
        get().logHistory(caseNo, 'กดข้ามการจัดทำ คบ.3', actor || ACTOR.officer, `เหตุผล: ${reason}`)
      },

      undoSkipKb3: (caseNo) => {
        get().updateCase(caseNo, { kb3Skipped: false, kb3SkipReason: undefined, kb3SkippedAt: undefined })
        get().logHistory(caseNo, 'ยกเลิกการข้าม คบ.3', ACTOR.officer, 'กลับมาจัดทำบันทึกข้อเท็จจริงตามปกติ')
      },

      /** ลำดับขั้นถัดไป — กรณีเร่งด่วนส่งตรงถึง ผอ.สำนัก/กอง โดยไม่ผ่าน ผบช.ชั้นต้น */
      getNextStage: (caseItem) => {
        if (caseItem.stage === 'receiver_intake' || caseItem.stage === 'officer_intake') return 'director_assign'
        /** รอ ผอ. มอบหมาย — ปลายทางถัดไปคือเจ้าของสำนวนที่ถูกมอบหมาย (ปกติทำผ่านการ์ดมอบหมาย) */
        if (caseItem.stage === 'director_assign') return 'staff_review'
        if (caseItem.stage === 'staff_review') {
          /**
           * WIT0709 — Revision ที่แก้ตามข้อสั่งการเลขาธิการฯ ต้องเดินตามลำดับเดิมทุกขั้น
           * ผังกำกับตัวหนาว่า "ห้ามส่งข้ามลำดับชั้น" จึงชนะทั้งธงตีกลับของ ผอ. และเส้นทางเร่งด่วน
           */
          if (caseItem.secretaryReturnRework) return 'supervisor_review'
          /** WIT0511 — รอบแก้ไขตามข้อสั่งการ ผอ. ส่งกลับขึ้น ผอ. โดยตรง ไม่วนผ่าน ผบช.ชั้นต้น ซ้ำ */
          if (caseItem.directorReturn) return 'director_review'
          /**
           * WIT0614 (TC-019) — ทางลัดส่งตรง ผอ. ใช้ได้เฉพาะช่วง "ก่อนมีข้อยุติคุ้มครองชั่วคราว" (ร่าง คบ.4 → คบ.5)
           * เมื่อ ผอ. อนุมัติ/ไม่อนุมัติแล้ว คำร้องหลักต้องเดินแท็บ 05 ตามปกติ: คบ.6 → ผบช.ชั้นต้น → ผอ. ห้ามข้ามขั้น
           */
          const fastTrackDirect = (caseItem.urgent || caseItem.urgency === 'urgent') && temporaryDecisionPending(caseItem)
          return fastTrackDirect ? 'director_review' : 'supervisor_review'
        }
        if (caseItem.stage === 'supervisor_review') return 'director_review'
        /** WIT0512 — ผอ. ลงนาม คบ.6 แล้วส่งรองเลขาธิการฯ กลั่นกรองก่อนถึงเลขาธิการฯ */
        if (caseItem.stage === 'director_review') return 'deputy_review'
        if (caseItem.stage === 'deputy_review') return 'external_pending'
        return 'external_pending'
      },

      forwardCase: (caseNo, targetStage, note) => {
        const current = get().getCase(caseNo)
        if (current?.protectionHandoff) return
        if (!current) return

        get().prepareResultNotices(caseNo)
        const timestamp = nowDisplay()
        const history = current.assignmentHistory || []

        /** WIT0511 — เจ้าหน้าที่แก้ตามข้อสั่งการ ผอ. เสร็จแล้วส่งกลับ ผอ. โดยตรง (ไม่ใช่ Fast Track) */
        const directorRework = current.stage === 'staff_review' && targetStage === 'director_review' && Boolean(current.directorReturn)
        const skippedSupervisor = current.stage === 'staff_review' && targetStage === 'director_review' && !directorRework
        /**
         * WIT0410 — ผลประเมินถูกแก้เป็น "เร่งด่วน" หลังแฟ้มเข้าชั้นกลั่นกรองแล้ว
         * จึงตัดเข้าเส้นทางเร่งด่วน (คบ.4 → คบ.5) ทันที โดยเอกสารที่ทำไว้แล้วยังอยู่ครบในแฟ้มเดิม
         */
        const urgencyReroute =
          current.stage === 'supervisor_review' && targetStage === 'director_review' && Boolean(current.urgent)

        let nextStatus = current.status
        let nextActor = current.owner
        let nextWork = current.next

        if (targetStage === 'director_assign') {
          nextStatus = 'รอ ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน'
          nextActor = ACTOR.director
          nextWork = current.mainCaseNotFound
            ? 'ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวนตามปกติ แล้วติดตามเชื่อมโยงเลขสำนวนภายหลัง (ห้ามปัดตกด้วยเหตุนี้)'
            : current.linkedMainCaseId
              ? 'ผอ.สำนัก/กอง จัดสรรเจ้าของสำนวน (มักมอบให้เจ้าของสำนวนคดีเดิมที่เชื่อมโยงไว้)'
              : 'ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน แล้วให้เจ้าของสำนวนเชื่อมโยงคดีหลักจากกิจกรรมที่ 4/5'
        } else if (targetStage === 'staff_review') {
          nextStatus = 'มอบหมายเจ้าของสำนวนแล้ว'
          nextActor = protectionResponsibleName(current)
          nextWork = `ประเมินความเร่งด่วน (ปกติ / เร่งด่วน) แล้วจัดทำ ${(current.pendingIntakeForms || ['คบ.1', 'คบ.3']).join(' / ')} ตามเส้นทางที่ประเมินได้`
        } else if (targetStage === 'supervisor_review') {
          nextStatus = 'รอกลั่นกรอง'
          nextActor = ACTOR.supervisor
          nextWork = 'ผู้บังคับบัญชาชั้นต้นตรวจ คบ.1 / คบ.3 / คบ.6 และลงนามอิเล็กทรอนิกส์'
        } else if (targetStage === 'director_review') {
          nextStatus = directorRework
            ? 'รอ ผอ.สำนัก/กอง ตรวจฉบับแก้ไข'
            : current.urgent
            ? 'รอ ผอ.สำนัก/กองพิจารณา (เร่งด่วน)'
            : 'รอ ผอ.สำนัก/กองพิจารณา'
          nextActor = ACTOR.director
          nextWork = directorRework
            ? 'ผอ.สำนัก/กอง ตรวจ คบ.1 / คบ.3 / คบ.6 ฉบับแก้ไขตามข้อสั่งการเดิมอีกครั้ง'
            : current.urgent
            ? 'ผอ.สำนัก/กอง พิจารณาออกคำสั่งคุ้มครองชั่วคราว คบ.5'
            : 'ผอ.สำนัก/กอง ลงนามใน คบ.6 และส่งรองเลขาธิการ ป.ป.ท. กลั่นกรอง'
        } else if (targetStage === 'deputy_review') {
          nextStatus = 'รอรองเลขาธิการ ป.ป.ท. กลั่นกรอง'
          nextActor = ACTOR.deputySecretary
          nextWork = 'รองเลขาธิการ ป.ป.ท. กลั่นกรองชุดเสนอ คบ.1 / คบ.3 / คบ.6 และให้ความเห็นก่อนเสนอเลขาธิการ ป.ป.ท.'
        } else if (targetStage === 'external_pending') {
          nextStatus = 'รอเสนอเลขาธิการ ป.ป.ท. พิจารณา'
          nextActor = ACTOR.secretary
          nextWork = 'เลขาธิการ ป.ป.ท. ตรวจทานแฟ้ม ลงนามอนุมัติหรือไม่อนุมัติ'
        }

        /** รองเลขาธิการฯ กลั่นกรองเสร็จแล้วจึงเสนอเลขาธิการฯ — บันทึกผู้กลั่นกรองไว้ในแฟ้ม */
        const deputyScreened = current.stage === 'deputy_review' && targetStage === 'external_pending'

        /**
         * WIT0709 → WIT0712 — Revision ที่แก้ตามข้อสั่งการเลขาธิการฯ กำลังเดินตามลำดับเดิม
         * ธงจะถูกเคลียร์เมื่อกลับถึงชั้นเลขาธิการฯ อีกครั้ง และแฟ้มกลับเป็น "รอผลพิจารณา"
         */
        const inRevisionRound = Boolean(current.secretaryReturnRework)
        const revisionReachedSecretary = inRevisionRound && targetStage === 'external_pending'

        get().updateCase(caseNo, {
          stage: targetStage,
          status: nextStatus,
          owner: nextActor,
          next: nextWork,
          returned: false,
          returnedBy: undefined,
          returnIssueLabel: undefined,
          returnNote: undefined,
          returnedByRole: undefined,
          directorReturn: false,
          secretaryReturnRework: revisionReachedSecretary ? false : current.secretaryReturnRework,
          activity7State: revisionReachedSecretary ? 'pending' : current.activity7State,
          activity7Label: revisionReachedSecretary ? 'รอผลพิจารณา (Revision)' : current.activity7Label,
          fastTracked: current.fastTracked || skippedSupervisor || urgencyReroute,
          deputyReviewState: targetStage === 'deputy_review' ? 'pending' : deputyScreened ? 'screened' : current.deputyReviewState,
          deputyScreenedBy: deputyScreened ? ACTOR.deputySecretary : current.deputyScreenedBy,
          deputyScreenedAt: deputyScreened ? timestamp : current.deputyScreenedAt,
          deputyScreenNote: deputyScreened ? note || current.deputyScreenNote : current.deputyScreenNote,
          secretarySubmittedBy: targetStage === 'external_pending' ? ACTOR.deputySecretary : current.secretarySubmittedBy,
          secretarySubmittedAt: targetStage === 'external_pending' ? timestamp : current.secretarySubmittedAt,
          secretaryReviewState: targetStage === 'external_pending' ? 'pending' : current.secretaryReviewState,
          assignmentHistory: [
            ...history,
            {
              at: timestamp,
              action: `ส่งต่อ · ${nextStatus}`,
              actor: current.owner,
              detail: inRevisionRound
                ? `${note || `เสนอ Revision ครั้งที่ ${current.revisionRound || 1} ตามข้อสั่งการเลขาธิการ ป.ป.ท.`} (ส่ง Revision ตามลำดับเดิม ห้ามส่งข้ามลำดับชั้น)`
                : directorRework
                ? `${note || 'แก้ไขตามข้อสั่งการ ผอ.สำนัก/กอง ครบถ้วนแล้ว'} (ส่งกลับ ผอ.สำนัก/กอง โดยตรง ไม่ผ่านผู้บังคับบัญชาชั้นต้น · แจ้งผู้บังคับบัญชาชั้นต้นทราบ)`
                : skippedSupervisor
                ? `${note || 'กรณีจำเป็นเร่งด่วน'} (Fast Track — ส่งตรง ผอ.สำนัก/กอง โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น)`
                : urgencyReroute
                ? `${note || 'แก้ผลประเมินเป็นกรณีจำเป็นเร่งด่วน'} (เปลี่ยนเส้นทางจากปกติเป็นเร่งด่วนระหว่างชั้นกลั่นกรอง · เอกสารเดิมในแฟ้มยังอยู่ครบ)`
                : note || 'ข้อมูลและเอกสารถูกส่งต่อตามลำดับชั้น',
            },
          ],
        })
        get().prepareResultNotices(caseNo)
      },

      returnCase: (caseNo, returnedBy, issueLabel, returnNote, targetRole, returnedByRole) => {
        const current = get().getCase(caseNo)
        if (!current) return

        /**
         * WIT0505 (TC-014) — ส่งกลับได้เฉพาะผู้ที่ "ถือแฟ้มอยู่ในขั้นของตน" เท่านั้น
         * ส่งต่อขั้นถัดไปแล้ว (เช่น ผบช. เสนอ ผอ. แล้ว) ห้ามดึงเรื่องกลับจากมือผู้อื่น
         */
        const HOLDER_STAGE: Record<string, string> = {
          supervisor: 'supervisor_review',
          director: 'director_review',
          deputy_secretary: 'deputy_review',
        }
        if (returnedByRole && HOLDER_STAGE[returnedByRole] && HOLDER_STAGE[returnedByRole] !== current.stage) {
          get().logHistory(
            caseNo,
            'ปฏิเสธคำสั่งส่งกลับ — แฟ้มไม่ได้อยู่ในขั้นของผู้สั่ง',
            returnedBy,
            `แฟ้มอยู่ขั้น ${current.stage} ไม่ใช่ขั้นของผู้ส่งกลับ (${returnedByRole}) — ส่งต่อแล้วดึงกลับไม่ได้`
          )
          return
        }

        const timestamp = nowDisplay()
        const history = current.assignmentHistory || []

        let returnTargetOwner = protectionResponsibleName(current)
        if (targetRole === 'supervisor') {
          returnTargetOwner = ACTOR.supervisor
        } else if (targetRole === 'director') {
          returnTargetOwner = ACTOR.director
        }

        const targetStage =
          targetRole === 'supervisor' ? 'supervisor_review' : targetRole === 'director' ? 'director_review' : 'staff_review'

        /**
         * WIT0510 — ผอ. ไม่เห็นชอบ ให้ส่งกลับ "ตรง" ถึงเจ้าหน้าที่ผู้รับผิดชอบ ข้าม ผบช.ชั้นต้น
         * เพราะเป็นข้อสั่งการของ ผอ. เอง · ธงนี้พารอบแก้ไขกลับขึ้น ผอ. โดยตรงตาม WIT0511
         */
        const isDirectorDirectReturn = returnedByRole === 'director' && targetStage === 'staff_review'

        const returnHistory = [
          ...history,
          {
            at: timestamp,
            action: `ส่งกลับแก้ไขโดย ${returnedBy}`,
            actor: returnedBy,
            detail: isDirectorDirectReturn
              ? `${issueLabel}: ${returnNote} (ส่งกลับตรงเจ้าหน้าที่ผู้รับผิดชอบ ไม่ผ่านผู้บังคับบัญชาชั้นต้น)`
              : `${issueLabel}: ${returnNote}`,
          },
        ]

        /** ผบช.ชั้นต้น เคยลงนามรับรองไปแล้วรอบหนึ่ง จึงได้รับแจ้งให้ทราบ แต่ไม่มีงานเข้าคิว */
        if (isDirectorDirectReturn) {
          returnHistory.push({
            at: timestamp,
            action: 'แจ้งผู้บังคับบัญชาชั้นต้นทราบ',
            actor: ACTOR.director,
            detail: 'รับทราบข้อสั่งการแก้ไขของ ผอ.สำนัก/กอง — ไม่ต้องกลั่นกรองซ้ำในรอบแก้ไขนี้',
          })
        }

        get().updateCase(caseNo, {
          stage: targetStage,
          status: 'ส่งกลับแก้ไข',
          owner: returnTargetOwner,
          next: `แก้ไขตามข้อสั่งการ: ${issueLabel}`,
          returned: true,
          returnedBy,
          returnIssueLabel: issueLabel,
          returnNote,
          returnedByRole,
          directorReturn: isDirectorDirectReturn,
          /**
           * WIT0505 — ชุดเสนอที่ถูกตีกลับถือว่าความเห็นรับรองตามลำดับชั้นตกไปทั้งชุด
           * ฉบับแก้ไขต้องเสนอให้ลงนามใหม่ตั้งแต่ข้อ 10 จะอ้างลายมือชื่อรอบก่อนไม่ได้
           */
          kb6Signed: false,
          kb6SupervisorSignedAt: undefined,
          kb6SupervisorSignedBy: undefined,
          kb6DirectorSignedAt: undefined,
          kb6DirectorSignedBy: undefined,
          kb6DeputySignedAt: undefined,
          kb6DeputySignedBy: undefined,
          assignmentHistory: returnHistory,
          /** TC-161 — เก็บฉบับ คบ.3/คบ.6 ปัจจุบันไว้เป็นประวัติก่อนขึ้นเวอร์ชันใหม่ */
          ...proposalSetRevisionPatch(current, returnedBy, `${issueLabel}: ${returnNote}`),
        })

        /** WIT0506 — เปิดฉบับใหม่ของ คบ.3 / คบ.6 ให้แก้ โดยเก็บฉบับที่ถูกตีกลับไว้เป็นประวัติ */
        reviseProposalSet(returnedBy, `${issueLabel}: ${returnNote}`)
      },

      // ---------- ขั้นที่ 4-5 : ลงนามความเห็นตามลำดับชั้นใน คบ.6 (ข้อ 10-13) ----------
      markKb6Prepared: (caseNo, by) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const actor = by || protectionResponsibleName(current)
        if (current.kb6PreparedAt) return
        get().updateCase(caseNo, { kb6PreparedAt: nowDisplay(), kb6PreparedBy: actor })
        get().logHistory(caseNo, 'จัดทำแบบ คบ.6', actor, 'บันทึกแบบ คบ.6 เข้าชุดเสนอของแฟ้มคำร้อง')
      },

      signKb6: (caseNo, role, signerName) => {
        const at = nowDisplay()
        const name = signerName || KB6_SIGNER_DEFAULTS[role].actor
        const meta = KB6_SIGNER_DEFAULTS[role]

        get().updateCase(caseNo, { kb6Signed: true, ...meta.patch(at, name) })
        get().logHistory(caseNo, meta.historyAction, name, 'ลงลายมือชื่ออิเล็กทรอนิกส์รับรองความเห็นตามลำดับชั้นในแบบ คบ.6')
      },

      // ---------- ขั้นที่ 5 : การพิจารณาสั่งการขั้นสุดท้าย ----------
      secretaryApprove: (caseNo, decisionNo, reason, destination, instruction, durationDays) => {
        const current = get().cases.find((c) => c.no === caseNo)
        const auth = useAuthStore.getState()
        if (!current || isCaseClosed(current) || hasSignedResultNotice(current) || current.stage !== 'external_pending' || current.secretaryReviewState === 'signed' || current.activity7State === 'approved') return false
        if (auth.currentRole !== 'secretary' && auth.currentRole !== 'admin') return false
        if (!decisionNo.trim() || !reason.trim()) return false
        const preliminary = current.preliminaryDecision
        if (preliminary && (!preliminary.savedAt || preliminary.formNo !== 9 || preliminary.outcome !== 'approved' || preliminary.decisionNo !== decisionNo.trim() || preliminary.reason !== reason.trim() || preliminary.destination !== destination || preliminary.instruction !== instruction.trim() || preliminary.durationDays !== (durationDays || PROTECTION_DEFAULT_DAYS))) return false
        if (!current.kb6SecretarySignedAt || !['original_owner', 'got'].includes(destination)) return false
        const originalOwner = ECMIS_USER_DIRECTORY.find((u) => u.id === current.assignedOfficerUserId)
        if (destination === 'original_owner' && (!originalOwner?.active || !originalOwner.roles.some((r) => r === 'officer' || r === 'case_owner'))) return false

        get().prepareResultNotices(caseNo)
        const notice = get().getCase(caseNo)?.resultNotices?.[9]
        if (!notice || !noticeCanSign(notice)) return false
        const at = nowDisplay()
        const sec = secretaryAccount()
        const signedNotice = signNoticeSnapshot(notice, current, at, sec.name, decisionNo, reason)
        const recipient = destination === 'got'
          ? ECMIS_USER_DIRECTORY.find((u) => u.active && u.roles.includes('got_receiver'))!
          : originalOwner!
        const documents = current.documents || []
        const days = Math.min(durationDays || PROTECTION_DEFAULT_DAYS, PROTECTION_MAX_DAYS)
        const event: ProtectionHandoffEvent = {
          id: `HANDOFF-${crypto.randomUUID()}`, at,
          action: destination === 'got' ? 'เลขาธิการอนุมัติและมอบหมาย กอท.' : 'เลขาธิการอนุมัติและส่งงานให้เจ้าของสำนวนเดิม',
          actorUserId: sec.id, actorName: sec.name, actorRole: 'secretary',
          fromUserId: sec.id, fromName: sec.name, toUserId: recipient.id, toName: recipient.name,
          note: instruction.trim(),
        }

        const newDoc: IntakeDocument = {
          id: `DOC-FINAL-${Date.now()}`,
          category: 'official',
          name: `คำสั่งอนุมัติคุ้มครองพยาน_${caseNo}.pdf`,
          reference: decisionNo,
          signed: true,
          signers: [`${sec.name} (${sec.position})`],
          confidentiality: 'ลับมาก',
          uploadedBy: sec.name,
          uploadedAt: at,
          note: reason,
        }

        /**
         * WIT0801 — ชุดวิธีตามข้อ 15 ที่ "คำสั่งอนุมัติ" ระบุไว้ สืบทอดมาจาก คบ.6 ที่เสนอไว้
         * เก็บแยกจาก approvedMethods (ชุดที่เจ้าหน้าที่เปิดเส้นทางปฏิบัติจริงที่หน้า 08A)
         * เพื่อให้หน้า 08A จำกัดตัวเลือกให้ตรงคำสั่งได้ และเพิ่มวิธีใหม่เกินคำสั่งไม่ได้
         */
        const orderedFromKb6 = readRoutableProtectionMethods(
          useFormDraftStore.getState().getDraft(6)
        ) as ProtectionMethodNo[]

        get().updateCase(caseNo, {
          resultNotices: { ...get().getCase(caseNo)?.resultNotices, 9: signedNotice },
          kb9Signed: true, kb9SignedAt: at, kb9SignedBy: sec.name, outgoingSignedAt: at, outgoingSignedBy: sec.name,
          activity7State: 'approved',
          activity7Label: 'อนุมัติให้ความคุ้มครอง',
          orderedMethods: orderedFromKb6.length > 0 ? orderedFromKb6 : current.orderedMethods,
          externalReference: decisionNo,
          decisionNumber: decisionNo,
          resultAt: at,
          resultReason: reason,
          resultSigner: `${sec.name} (${sec.position})`,
          secretaryReviewState: 'signed',
          secretarySignedAt: at,
          secretarySignedBy: sec.name,
          stage: 'notice',
          status: destination === 'got' ? HANDOFF_STATUS.pending_receipt : 'อนุมัติและลงนาม คบ.9 แล้ว · ส่งเจ้าของสำนวนเดิมดำเนินการต่อ',
          owner: recipient.name,
          protectionHandoff: {
            destination, step: destination === 'got' ? 'pending_receipt' : 'accepted',
            originalOwnerUserId: current.assignedOfficerUserId || '',
            originalOwnerName: originalOwner?.name || current.assignedOfficer || current.owner,
            secretaryInstruction: instruction.trim(),
            ...(destination === 'original_owner' ? { assigneeUserId: recipient.id, assigneeName: recipient.name, acceptedAt: at } : {}),
            events: [event],
          },
          /**
           * คบ.8 ไม่อยู่ในชุดนี้ — ตาม WIT0817/WIT0818 คำสั่งมอบหมายชุดคุ้มครองจัดทำในหน้า 08A-1
           * จึงเพิ่มเข้าแฟ้มก็ต่อเมื่อพยานลงนาม คบ.11 แล้ว และ คบ.6 เสนอวิธีที่ 1 ไว้ (ดู setApprovedMethods)
           */
          next: destination === 'got' ? 'ธุรการคดี กอท. รับเรื่องและส่งเสนอ ผอ. กอท. เพื่อมอบหมายผู้รับผิดชอบ' : 'เติมรายละเอียด คบ.9 หลังลงนาม ตรวจพร้อมส่ง และดำเนินการ คบ.11 ตามลำดับเดิม',
          approvalStep: 3,
          protectionDays: days,
          extraForms: Array.from(new Set([...(current.extraForms || []), 9, 11])),
          documents: [...documents, newDoc],
          assignmentHistory: [
            ...(current.assignmentHistory || []),
            {
              at,
              action: 'เลขาธิการ ป.ป.ท. อนุมัติและลงนามคำสั่ง',
              actor: sec.name,
              detail: `${decisionNo} — อนุมัติคุ้มครอง ${legacyMonthLabel(days)} · ${reason}`,
            },
            { at, action: event.action, actor: event.actorName, detail: `ผู้ส่ง: ${event.fromName} → ผู้รับ: ${event.toName}${destination === 'got' ? ` (${GOT_UNIT_NAME})` : ''} · คำสั่ง/หมายเหตุ: ${event.note || 'ไม่ระบุ'}` },
          ],
        })
        useNotificationStore.getState().addNotification({
          caseNo, type: 'protection_handoff', toName: recipient.name, toUserId: recipient.id,
          channel: 'ระบบ', message: `${caseNo} อนุมัติคุ้มครอง ${legacyMonthLabel(days)} · ${destination === 'got' ? 'รอธุรการคดี กอท. รับเรื่อง' : 'ส่งให้เจ้าของสำนวนเดิมดำเนินการต่อ'} · ${instruction.trim() || reason}`,
          urgency: current.urgent ? 'ด่วนที่สุด' : 'ปกติ',
        })
        return true
      },

      /** ทุกคำสั่งตรวจบทบาท ขั้นปัจจุบัน และตัวผู้รับก่อนเขียนข้อมูล กันส่งซ้ำและข้ามขั้น */
      advanceProtectionHandoff: (caseNo, action, note = '', assigneeUserId) => {
        const current = get().cases.find((c) => c.no === caseNo)
        const h = current?.protectionHandoff
        const auth = useAuthStore.getState()
        const actor = auth.getCurrentUserAccount()
        if (!current || isCaseClosed(current) || current.activity7State !== 'approved' || h?.destination !== 'got' || !actor) return false
        const receiver = ECMIS_USER_DIRECTORY.find((u) => u.active && u.roles.includes('got_receiver'))!
        const director = ECMIS_USER_DIRECTORY.find((u) => u.active && u.roles.includes('got_director'))!
        const at = nowDisplay()
        let nextStep = h.step
        let from = actor
        let to = actor
        let label = ''
        let instruction = h.assignmentInstruction
        let assigneeId = h.assigneeUserId
        let assigneeName = h.assigneeName
        if (action === 'receive') {
          if (h.step !== 'pending_receipt' || auth.currentRole !== 'got_receiver' || actor.id !== receiver.id) return false
          nextStep = 'received'; from = secretaryAccount(); to = receiver
          label = 'ธุรการคดี กอท. รับเรื่องจากเลขาธิการ'
        } else if (action === 'submit') {
          if (h.step !== 'received' || auth.currentRole !== 'got_receiver' || actor.id !== receiver.id) return false
          nextStep = 'pending_assignment'; to = director
          label = 'ธุรการคดี กอท. ส่งเสนอ ผอ. กอท.'
        } else if (action === 'assign') {
          if (h.step !== 'pending_assignment' || auth.currentRole !== 'got_director' || actor.id !== director.id || !note.trim()) return false
          const selected = gotAssignableOfficers().find((u) => u.id === assigneeUserId)
          if (!selected) return false
          nextStep = 'assigned'; to = selected; assigneeId = selected.id; assigneeName = selected.name
          instruction = note.trim()
          label = 'ผอ. กอท. มอบหมายผู้รับผิดชอบดำเนินการคุ้มครอง'
        } else if (action === 'accept') {
          if (h.step !== 'assigned' || auth.currentRole !== 'got_officer' || actor.id !== h.assigneeUserId) return false
          nextStep = 'accepted'; from = director
          label = 'ผู้ได้รับมอบหมาย กอท. รับงานดำเนินการคุ้มครอง'
        } else return false
        const event: ProtectionHandoffEvent = {
          id: `HANDOFF-${crypto.randomUUID()}`, action: label, at,
          actorUserId: actor.id, actorName: actor.name, actorRole: auth.currentRole,
          fromUserId: from.id, fromName: from.name, toUserId: to.id, toName: to.name, note: note.trim(),
        }
        get().updateCase(caseNo, {
          protectionHandoff: { ...h, step: nextStep, assigneeUserId: assigneeId, assigneeName, assignmentInstruction: instruction,
            ...(action === 'accept' ? { acceptedAt: at } : {}), events: [...h.events, event] },
          status: HANDOFF_STATUS[nextStep], owner: to.name,
          next: nextStep === 'received' ? 'ธุรการคดีส่งเสนอ ผอ. กอท.'
            : nextStep === 'pending_assignment' ? 'ผอ. กอท. เลือกผู้รับผิดชอบและบันทึกคำสั่งมอบหมาย'
            : nextStep === 'assigned' ? 'ผู้ได้รับมอบหมาย กอท. รับงาน'
            : 'เติมรายละเอียด คบ.9 หลังลงนาม ตรวจพร้อมส่ง และดำเนินการ คบ.11 ตามวิธีที่อนุมัติ',
          assignmentHistory: [...(current.assignmentHistory || []), {
            at, action: label, actor: actor.name,
            detail: `ผู้ส่ง: ${from.name} → ผู้รับ: ${to.name} · คำสั่ง/หมายเหตุ: ${note.trim() || 'ไม่ระบุ'} · ผลอนุมัติเดิม ${current.decisionNumber || ''}`,
          }],
        })
        if (action === 'submit' || action === 'assign') {
          useNotificationStore.getState().addNotification({
            caseNo, type: 'protection_handoff', toName: to.name, toUserId: to.id,
            channel: 'ระบบ', message: `${caseNo} · ${label} · ${note.trim() || HANDOFF_STATUS[nextStep]}`,
            urgency: current.urgent ? 'ด่วนที่สุด' : 'ปกติ',
          })
        }
        return true
      },

      secretaryReject: (caseNo, decisionNo, reason) => {
        const current = get().getCase(caseNo)
        const auth = useAuthStore.getState()
        if (!current || isCaseClosed(current) || hasSignedResultNotice(current) || current.stage !== 'external_pending' || current.secretaryReviewState === 'signed' || !['secretary', 'admin'].includes(auth.currentRole) || !current.kb6SecretarySignedAt) return
        const preliminary = current.preliminaryDecision
        if (preliminary && (!preliminary.savedAt || preliminary.formNo !== 10 || preliminary.outcome !== 'rejected' || preliminary.decisionNo !== decisionNo.trim() || preliminary.reason !== reason.trim())) return
        get().prepareResultNotices(caseNo)
        const notice = get().getCase(caseNo)?.resultNotices?.[10]
        if (!notice || !noticeCanSign(notice)) return
        if (current?.protectionHandoff) return
        if (!current || !decisionNo.trim() || !reason.trim()) return

        const at = nowDisplay()
        const sec = secretaryAccount()
        const documents = current.documents || []

        const newDoc: IntakeDocument = {
          id: `DOC-REJECT-${Date.now()}`,
          category: 'official',
          name: `คำสั่งไม่อนุมัติคุ้มครองพยาน_${caseNo}.pdf`,
          reference: decisionNo,
          signed: true,
          signers: [`${sec.name} (${sec.position})`],
          confidentiality: 'ลับมาก',
          uploadedBy: sec.name,
          uploadedAt: at,
          note: reason,
        }

        get().updateCase(caseNo, {
          resultNotices: { ...get().getCase(caseNo)?.resultNotices, 10: signNoticeSnapshot(notice, current, at, sec.name, decisionNo, reason) },
          kb10Signed: true, kb10SignedAt: at, kb10SignedBy: sec.name, outgoingSignedAt: at, outgoingSignedBy: sec.name,
          activity7State: 'rejected',
          activity7Label: 'ไม่อนุมัติให้ความคุ้มครอง',
          externalReference: decisionNo,
          decisionNumber: decisionNo,
          resultAt: at,
          resultReason: reason,
          resultSigner: `${sec.name} (${sec.position})`,
          secretaryReviewState: 'signed',
          secretarySignedAt: at,
          secretarySignedBy: sec.name,
          stage: 'notice',
          status: 'เลขาธิการ ป.ป.ท. ไม่อนุมัติ',
          owner: protectionResponsibleName(current),
          next: 'เติมรายละเอียด คบ.10 หลังลงนาม ตรวจพร้อมส่ง และแจ้งพยานตามเส้นทางเดิม',
          nonApprovalStep: 3,
          extraForms: Array.from(new Set([...(current.extraForms || []), 10])),
          documents: [...documents, newDoc],
          assignmentHistory: [
            ...(current.assignmentHistory || []),
            {
              at,
              action: 'เลขาธิการ ป.ป.ท. มีคำสั่งไม่อนุมัติ',
              actor: sec.name,
              detail: `${decisionNo} - ${reason}`,
            },
          ],
        })
      },

      secretaryReturn: (caseNo, issue, reason) => {
        const current = get().getCase(caseNo)
        if (current?.protectionHandoff) return
        if (!current || isCaseClosed(current) || current.stage !== 'external_pending' || hasSignedResultNotice(current) || !['secretary', 'admin'].includes(useAuthStore.getState().currentRole)) return

        const at = nowDisplay()
        const sec = secretaryAccount()

        get().updateCase(caseNo, {
          activity7State: 'returned',
          activity7Label: 'ส่งกลับแก้ไข',
          returned: true,
          returnedBy: sec.position,
          returnIssueLabel: issue,
          returnNote: reason,
          secretaryReviewState: 'returned',
          stage: 'director_review',
          status: 'เลขาธิการ ป.ป.ท. ส่งกลับแก้ไข',
          /** WIT0707 — ข้อสั่งการลงที่ ผอ.สำนัก/กอง ผู้เป็นเจ้าของขั้น director_review ไม่ใช่ผู้เสนอแฟ้ม */
          owner: ACTOR.director,
          next: 'ผอ.สำนัก/กอง รับทราบข้อสั่งการและมอบหมายเจ้าหน้าที่ผู้รับผิดชอบแก้ไขเป็น Revision ใหม่',
          /** งานยังไม่ลงถึงคนแก้จนกว่า ผอ. จะกดมอบหมาย — ธงสองตัวนี้คุมการ์ด WIT0708 ในแฟ้ม */
          secretaryReturnRework: false,
          revisionAssignedAt: undefined,
          revisionAssignedBy: undefined,
          revisionInstruction: undefined,
          assignmentHistory: [
            ...(current.assignmentHistory || []),
            {
              at,
              action: 'เลขาธิการ ป.ป.ท. ส่งกลับแก้ไข',
              actor: sec.name,
              detail: `${issue} - ${reason}`,
            },
          ],
        })
      },

      /**
       * WIT0708 — ผอ.สำนัก/กอง รับข้อสั่งการของเลขาธิการฯ แล้วมอบหมายเจ้าหน้าที่ผู้รับผิดชอบ
       * ให้แก้ คบ.3 และ/หรือ คบ.6 เป็น Revision ใหม่ โดยไม่แก้ทับฉบับที่ลงนามแล้ว
       * ก่อนมีขั้นนี้ เคสที่ถูกส่งกลับจะค้างอยู่ในคิวของ ผอ. และเดินต่อไม่ได้เลย
       */
      assignReturnRevision: (caseNo, instruction) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (current.activity7State !== 'returned') return

        const at = nowDisplay()
        const officer = protectionResponsibleName(current)
        const round = (current.revisionRound || 0) + 1
        const issue = current.returnIssueLabel || 'ข้อสั่งการของเลขาธิการ ป.ป.ท.'

        get().updateCase(caseNo, {
          stage: 'staff_review',
          status: `ส่งกลับแก้ไข · Revision ครั้งที่ ${round}`,
          owner: officer,
          next: `แก้ คบ.3 และ/หรือ คบ.6 เป็น Revision ครั้งที่ ${round} แนบเอกสารเพิ่มเติม โดยไม่แก้ทับฉบับที่ลงนามแล้ว`,
          secretaryReturnRework: true,
          revisionRound: round,
          revisionAssignedAt: at,
          revisionAssignedBy: ACTOR.director,
          revisionInstruction: instruction,
          /**
           * WIT0709 — รอบนี้ต้องเดินตามลำดับเดิมทุกขั้น จึงห้ามใช้ทางลัดของ WIT0510/WIT0511
           * (ธงตีกลับของ ผอ. ที่พารอบแก้ไขกลับขึ้น ผอ. โดยตรง)
           */
          directorReturn: false,
          returned: true,
          assignmentHistory: [
            ...(current.assignmentHistory || []),
            {
              at,
              action: 'ผอ.สำนัก/กอง มอบหมายแก้ไขตามข้อสั่งการเลขาธิการฯ',
              actor: ACTOR.director,
              detail: `${issue}: ${instruction} (แก้เป็น Revision ครั้งที่ ${round} ไม่แก้ทับฉบับที่ลงนามแล้ว)`,
            },
          ],
          /** TC-161 — เก็บฉบับ คบ.3/คบ.6 ปัจจุบันไว้เป็นประวัติก่อนขึ้นเวอร์ชันใหม่ */
          ...proposalSetRevisionPatch(current, ACTOR.director, `${issue}: ${instruction}`),
        })

        /** WIT0708 — รอบแก้ไขตามข้อสั่งการเลขาธิการฯ ใช้กลไกเวอร์ชันเดียวกับการตีกลับชั้นกลั่นกรอง */
        reviseProposalSet(ACTOR.director, `${issue}: ${instruction}`)
      },

      /**
       * WIT0713 — ผลพิจารณาแขนงที่ 4 "เห็นควรตามข้อ 14"
       * ทางเข้าแท็บ 08C ตั้งแต่ชั้นรับผลพิจารณา สำหรับกรณีที่เกินขอบเขตมาตรการเบื้องต้นของ ป.ป.ท.
       * ตั้งแต่แรก โดยไม่ต้องเดินเส้นคุ้มครองจนใกล้ครบเพดาน 6 เดือนก่อน
       */
      secretaryReferArticle14: (caseNo, decisionNo, reason) => {
        const current = get().getCase(caseNo)
        if (current?.protectionHandoff) return
        if (!current || isCaseClosed(current) || current.stage !== 'external_pending' || hasSignedResultNotice(current) || !['secretary', 'admin'].includes(useAuthStore.getState().currentRole)) return

        const at = nowDisplay()
        const sec = secretaryAccount()
        const officer = protectionResponsibleName(current)

        get().updateCase(caseNo, {
          activity7State: 'article14',
          activity7Label: 'เห็นควรส่งต่อกรมคุ้มครองสิทธิฯ',
          externalReference: decisionNo,
          decisionNumber: decisionNo,
          resultAt: at,
          resultReason: reason,
          resultSigner: `${sec.name} (${sec.position})`,
          secretaryReviewState: 'signed',
          secretarySignedAt: at,
          secretarySignedBy: sec.name,
          article14Referral: { at, by: sec.name, decisionNo, reason },
          stage: 'article14',
          status: 'เห็นควรส่งต่อกรมคุ้มครองสิทธิฯ · จัดทำเรื่องเสนอ',
          owner: officer,
          next: 'จัดทำเรื่องเสนอส่งต่อกรมคุ้มครองสิทธิฯ (เหตุภัย ผลประเมิน และมาตรการที่เสนอ) แล้วเสนอตามลำดับชั้น',
          assignmentHistory: [
            ...(current.assignmentHistory || []),
            {
              at,
              action: 'เลขาธิการ ป.ป.ท. เห็นควรส่งต่อกรมคุ้มครองสิทธิฯ',
              actor: sec.name,
              detail: `${decisionNo} — ${reason} (ส่งเรื่องไปหน้าส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ)`,
            },
          ],
        })
      },

      /** เจ้าหน้าที่เสนอ คบ.9 ให้เลขาธิการฯ ลงนามก่อนส่งออกภายนอก (คบ.8 เป็นคำสั่งของขั้น 08A-1) */
      submitOutgoingForSignature: (caseNo) => {
        if (get().getCase(caseNo)?.resultNotices) return // ไม่มีรอบลงนาม คบ.9 ซ้ำ
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        get().updateCase(caseNo, {
          approvalStep: 2,
          status: 'รอเลขาธิการ ป.ป.ท. ลงนาม คบ.9',
          owner: ACTOR.secretary,
          next: 'เลขาธิการ ป.ป.ท. ลงนามหนังสือ คบ.9 เพื่อจัดส่งอย่างเป็นทางการ',
        })
        get().logHistory(
          caseNo,
          'เสนอ คบ.9 ให้เลขาธิการฯ ลงนาม',
          protectionResponsibleName(current),
          'ก่อนส่งเอกสารออกภายนอกต้องผ่านการลงนามของเลขาธิการ ป.ป.ท.'
        )
      },

      /**
       * เจ้าหน้าที่เสนอ คบ.8 ให้เลขาธิการฯ ลงนาม หลังจัดทำร่างคำสั่งมอบหมายชุดคุ้มครองเสร็จ
       * (WIT0817 → WIT0818 ของวิธีที่ 1) — แยกจาก submitOutgoingForSignature เพราะ คบ.8
       * ไม่อยู่ในรอบลงนามของขั้นแจ้งผลและไม่แตะ approvalStep
       */
      submitKb8ForSignature: (caseNo) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        const officer = protectionResponsibleName(current)
        get().updateCase(caseNo, {
          kb8SubmittedAt: nowDisplay(),
          kb8SubmittedBy: officer,
          status: 'รอเลขาธิการ ป.ป.ท. ลงนาม คบ.8',
          owner: ACTOR.secretary,
          next: 'เลขาธิการ ป.ป.ท. ลงนามคำสั่งมอบหมายชุดคุ้มครอง คบ.8',
        })
        get().logHistory(
          caseNo,
          'เสนอ คบ.8 ให้เลขาธิการฯ ลงนาม',
          officer,
          'จัดทำร่างคำสั่งมอบหมายชุดคุ้มครองตามวิธีที่ 1 เสร็จแล้ว เสนอเข้ารอบลงนาม'
        )
      },

      /**
       * WIT0818 แขนง — เลขาธิการฯ ไม่ลงนาม คบ.8 แต่ส่งกลับให้แก้ไข
       *
       * รูปแบบเดียวกับ คบ.15 (draftKb15/reviewKb15): ฉบับเดิมถูกเก็บไว้ใน kb8PreviousVersions
       * ไม่แก้ทับ แล้วเปิดรอบ Revision ใหม่ให้เจ้าหน้าที่จัดทำและเสนอใหม่ (WIT0817 → WIT0818)
       */
      returnKb8ForRevision: (caseNo, reason, actor) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const at = nowDisplay()
        const by = actor || ACTOR.secretary
        const officer = protectionResponsibleName(current)
        const version = current.kb8Version || 1

        get().updateCase(caseNo, {
          kb8Version: version + 1,
          kb8PreviousVersions: [
            ...(current.kb8PreviousVersions || []),
            {
              version,
              submittedAt: current.kb8SubmittedAt,
              submittedBy: current.kb8SubmittedBy,
              signedAt: current.kb8SignedAt,
              signedBy: current.kb8SignedBy,
              returnedAt: at,
              returnedBy: by,
              returnReason: reason,
            },
          ],
          kb8Signed: false,
          kb8SignedAt: undefined,
          kb8SignedBy: undefined,
          kb8SubmittedAt: undefined,
          kb8SubmittedBy: undefined,
          owner: officer,
          status: `ส่งกลับแก้ไข คบ.8 (ฉบับที่ ${version}) · จัดทำฉบับที่ ${version + 1}`,
          next: `แก้ไข คบ.8 ตามข้อสั่งการแล้วเสนอลงนามใหม่ (ฉบับที่ ${version + 1})`,
        })
        get().logHistory(caseNo, `ส่งกลับแก้ไข คบ.8 (ฉบับที่ ${version})`, by, reason)
      },

      /**
       * TC-070 — ผลคำร้องหลัก "ไม่อนุมัติ" ระหว่างที่ยังคุ้มครองชั่วคราวตาม คบ.5 อยู่
       *
       * ต้องยุติช่วงคุ้มครองชั่วคราวตามคำสั่ง และส่งเรื่องไปเส้นทางแจ้งผลไม่อนุมัติ (แท็บ 09A)
       * โดยคงประวัติวันสะสมและเอกสารไว้ครบ — ปิด Episode ไม่ใช่ลบทิ้ง
       */
      endProtectionForNonApproval: (caseNo, actor) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (current.activity7State !== 'rejected') return
        const tracks = current.methodTracks || []
        if (!tracks.some((t) => t.status === 'active' || t.status === 'preparing')) return

        const at = new Date().toISOString()
        const by = actor || protectionResponsibleName(current)
        const reason = 'คำร้องหลักไม่อนุมัติระหว่างคุ้มครองชั่วคราว — ยุติช่วงชั่วคราวตามคำสั่ง'

        get().updateCase(caseNo, {
          methodTracks: tracks.map((t) =>
            t.status === 'active' || t.status === 'preparing'
              ? { ...t, status: 'ended' as ProtectionMethodStatus, endedAt: t.endedAt || at }
              : t
          ),
          stage: 'notice',
          owner: by,
          status: 'คำร้องหลักไม่อนุมัติ · ยุติช่วงคุ้มครองชั่วคราวแล้ว',
          next: 'จัดทำ คบ.10 แจ้งผลไม่อนุมัติ (วันสะสมและเอกสารเดิมยังอยู่ครบ)',
          extraForms: Array.from(new Set([...(current.extraForms || []), 10])),
        })
        const episode = current.episode || deriveEpisode(current)
        if (episode && !episode.closedAt) {
          get().updateCase(caseNo, { episode: closeEpisode(episode, at, reason) })
        }
        get().logHistory(caseNo, 'ยุติช่วงคุ้มครองชั่วคราวหลังคำร้องหลักไม่อนุมัติ', by, reason)
      },

      /**
       * เลขาธิการ ป.ป.ท. ลงนามหนังสือส่งออก "ทีละฉบับ" จากหน้าแบบฟอร์มของฉบับนั้น
       * (รูปแบบเดียวกับความเห็นตามลำดับชั้นใน คบ.6) — รอบลงนามของขั้นแจ้งผลใช้ คบ.9 ฉบับเดียว
       * ในเส้นทางอนุมัติ และ คบ.10 ฉบับเดียวในเส้นทางไม่อนุมัติ
       *
       * คบ.8 ไม่อยู่ในรอบนี้ — เป็นคำสั่งมอบหมายชุดคุ้มครองของขั้น 08A-1 (WIT0817/WIT0818)
       * ที่ลงนามหลังพยานลงนาม คบ.11 แล้ว จึงไม่ปิดรอบลงนามและไม่ขยับ approvalStep
       */
      signOutgoingNotice: (caseNo, formNo, signerName) => {
        if ([9, 10].includes(formNo)) return // ลงนามครั้งเดียวพร้อมผลพิจารณาเท่านั้น
        const current = get().getCase(caseNo)
        if (!current) return
        if (current.protectionHandoff && (!['accepted', 'active'].includes(current.protectionHandoff.step) || !['secretary', 'admin'].includes(useAuthStore.getState().currentRole))) return
        const at = nowDisplay()
        const name = signerName || ACTOR.secretary
        const officer = protectionResponsibleName(current)

        const patch: Partial<CaseItem> = {
          [`kb${formNo}Signed`]: true,
          [`kb${formNo}SignedAt`]: at,
          [`kb${formNo}SignedBy`]: name,
        }
        /** เปลี่ยน Phase TEMPORARY → MAIN ไปพร้อมกับการลงนาม คบ.8 หรือไม่ (ใช้บันทึกประวัติหลังอัปเดต) */
        let phaseSwitched = false

        if (formNo === 10) {
          patch.outgoingSignedAt = at
          patch.outgoingSignedBy = name
          patch.status = 'ลงนาม คบ.10 แล้ว · พร้อมนำส่ง'
          patch.owner = officer
          patch.next = 'นำส่ง คบ.10 ถึงพยาน และเริ่มนับสิทธิอุทธรณ์จากวันที่ได้รับหนังสือ'
        } else if (formNo === 9) {
          patch.outgoingSignedAt = at
          patch.outgoingSignedBy = name
          patch.approvalStep = 3
          patch.status = 'ลงนาม คบ.9 แล้ว · พร้อมนำส่ง'
          patch.owner = officer
          patch.next = 'นำส่งหนังสือแจ้งตอบรับถึงพยาน แล้วลงนามข้อตกลง คบ.11'
        } else {
          /** คบ.8 — คำสั่งชุดคุ้มครองตามวิธีที่ 1 ลงนามหลัง คบ.11 จึงไม่แตะรอบลงนามของขั้นแจ้งผล */
          patch.status = 'ลงนามคำสั่ง คบ.8 แล้ว · ชุดคุ้มครองเริ่มปฏิบัติได้'
          patch.owner = officer
          patch.next = 'แจ้งชุดคุ้มครองเข้าปฏิบัติหน้าที่ตามคำสั่ง คบ.8 และเริ่มนับระยะเวลาคุ้มครอง'

          /**
           * WIT0821 แขนง MAIN_ACTIVE — คำร้องหลักมีผลอนุมัติแล้ว (คบ.8 ลงนาม)
           * ถ้ากำลังคุ้มครองชั่วคราวอยู่ ให้เปลี่ยน Phase ต่อเนื่องใน Episode เดิม ไม่เปิด Episode ใหม่
           * และไม่รีเซ็ตวันสะสม — ผังกำหนดให้ยอดวันเดินต่อข้าม Phase
           */
          const episode = current.episode || deriveEpisode(current)
          if (episode && !episode.closedAt && currentPhaseKind(episode) === 'TEMPORARY') {
            const switchedAt = new Date().toISOString()
            patch.episode = switchPhase(episode, 'MAIN', switchedAt, 'คบ.8')
            phaseSwitched = true
          }
        }

        get().updateCase(caseNo, patch)
        get().logHistory(
          caseNo,
          `เลขาธิการ ป.ป.ท. ลงนาม คบ.${formNo}`,
          name,
          formNo === 10
            ? 'ลงนามหนังสือแจ้งไม่ให้การคุ้มครองเพื่อจัดส่งอย่างเป็นทางการ'
            : formNo === 8
            ? 'ลงนามคำสั่งมอบหมายชุดคุ้มครองตามวิธีที่ 1 — ล็อกเอกสารและเริ่มปฏิบัติได้'
            : 'ลงนามหนังสือส่งออกภายนอกจากหน้าแบบฟอร์มของฉบับนั้น'
        )

        if (phaseSwitched) {
          const after = get().getCase(caseNo)
          get().logHistory(
            caseNo,
            'เปลี่ยน Phase การคุ้มครองเป็น MAIN ตามผลอนุมัติคำร้องหลัก',
            name,
            `คบ.8 ลงนามแล้ว จึงเดินต่อใน Episode เดิม วันสะสมต่อเนื่อง ${cumulativeDays(
              after?.episode
            )} วัน (เพดาน 6 เดือน)`
          )
        }
      },

      /**
       * WIT0806 — บันทึกการนำส่งหนึ่งครั้ง
       *
       * เก็บเป็นประวัติสะสม (dispatchHistory) ทุกครั้งพร้อมผลลัพธ์ ไม่เขียนทับครั้งก่อน
       * เพราะหนังสือตีกลับแล้วเปลี่ยนช่องทางส่งใหม่ได้หลายรอบ ส่วนฟิลด์เดี่ยวคงไว้เป็น "ครั้งล่าสุด"
       * วันอ้างอิงของสิทธิอุทธรณ์ยังเป็น deliveredAt (วันที่ผู้รับได้รับจริง) ไม่ใช่วันที่ส่ง
       */
      recordDispatch: (caseNo, channel, tracking, outcome, failureReason) => {
        const current = get().getCase(caseNo)
        if (!current || isCaseClosed(current)) return
        if (!routedWorkerAllowed(current)) return
        const notice = noticeForCase(current)
        const auth = useAuthStore.getState()
        if (notice && (!noticeWorkerAllowed(auth.currentRole, current, auth.currentOfficerUserId) || !notice.original || !['ready', 'sent'].includes(notice.status) || missingNoticeFields(notice).length)) return
        if (!notice && !current.outgoingSignedAt) return
        if (!channel.trim()) return
        const last = current.dispatchHistory?.at(-1)
        if (last && last.outcome !== 'failed') return
        const at = nowDisplay()
        if (notice) {
        const archive = { id: crypto.randomUUID(), at, by: useAuthStore.getState().getCurrentUserAccount()?.name || protectionResponsibleName(current), channel, tracking, snapshot: cloneNotice(notice.versions.at(-1)!), evidence: { kind: 'dispatch_record' as const, description: `บันทึกนำส่งผ่าน ${channel}${tracking ? ` เลขติดตาม ${tracking}` : ''} (จำลอง)` } }
        set((state) => ({ cases: state.cases.map((item) => item.no === caseNo ? { ...item, resultNotices: { ...item.resultNotices, [notice.formNo]: { ...notice, status: 'sent' as const, dispatches: [...notice.dispatches, archive] } } } : item) }))
        }
        const attempt: DispatchAttempt = {
          id: `DSP-${Date.now()}`,
          channel,
          tracking: tracking || undefined,
          dispatchedAt: at,
          outcome: outcome || 'in_transit',
          failureReason,
          recordedBy: protectionResponsibleName(current),
        }
        get().updateCase(caseNo, {
          dispatchChannel: channel,
          dispatchTracking: tracking,
          dispatchedAt: at,
          dispatchHistory: [...(current.dispatchHistory || []), attempt],
          sentAt: at,
          resultPendingAck: true,
          next: 'ติดตามผลการนำส่งและบันทึกวันที่พยานได้รับหนังสือ',
        })
        get().logHistory(
          caseNo,
          `บันทึกการนำส่งหนังสือแจ้งผล (ครั้งที่ ${(current.dispatchHistory || []).length + 1})`,
          protectionResponsibleName(current),
          `ช่องทาง: ${channel}${tracking ? ` · เลขติดตาม ${tracking}` : ''}`
        )
      },

      reportDispatchFailure: (caseNo, reason, actor) => {
        const current = get().getCase(caseNo)
        if (!current || isCaseClosed(current)) return
        if (!routedWorkerAllowed(current)) return
        if (noticeForCase(current) && !noticeWorkerAllowed(useAuthStore.getState().currentRole, current, useAuthStore.getState().currentOfficerUserId)) return
        const history = current.dispatchHistory || []
        if (history.length === 0) return
        const next = history.map((h, idx) =>
          idx === history.length - 1 ? { ...h, outcome: 'failed' as const, failureReason: reason } : h
        )
        get().updateCase(caseNo, {
          dispatchHistory: next,
          next: 'เปลี่ยนช่องทางนำส่งและบันทึกการนำส่งใหม่ให้ถึงมือผู้รับ',
        })
        get().logHistory(
          caseNo,
          'การนำส่งหนังสือไม่สำเร็จ/ตีกลับ',
          actor || protectionResponsibleName(current),
          `${next[next.length - 1].channel} — ${reason}`
        )
      },

      /** วันที่พยานได้รับหนังสือ = จุดตั้งต้นนับสิทธิอุทธรณ์ 30 วัน */
      recordDelivery: (caseNo, deliveredAt, receipt) => {
        const current = get().getCase(caseNo)
        if (!current || isCaseClosed(current)) return
        if (!routedWorkerAllowed(current)) return
        const notice = noticeForCase(current)
        if (current.deliveredAt) return
        if (notice && (!noticeWorkerAllowed(useAuthStore.getState().currentRole, current, useAuthStore.getState().currentOfficerUserId) || !notice.dispatches.length || !receipt?.recipient?.trim() || !receipt.ackType || !receipt.ackDocument)) return
        if (!notice && !current.dispatchedAt) return
        const delivered = deliveredAt || new Date().toISOString()
        if (notice && receipt) {
        const archives = notice.dispatches.map((dispatch, index) => index === notice.dispatches.length - 1 ? { ...dispatch, receipt: { receivedAt: delivered, recipient: receipt.recipient, evidenceType: receipt.ackType!, documentName: receipt.ackDocument! } } : dispatch)
        set((state) => ({ cases: state.cases.map((item) => item.no === caseNo ? { ...item, resultNotices: { ...item.resultNotices, [notice.formNo]: { ...notice, dispatches: archives } } } : item) }))
        }
        const dueAt = addDays(delivered, APPEAL_WINDOW_DAYS)
        /** TC-107 — ปิดครั้งล่าสุดในประวัติการนำส่งเป็น "ถึงมือผู้รับแล้ว" โดยไม่แตะครั้งที่ตีกลับก่อนหน้า */
        const history = current.dispatchHistory || []
        const historyWithDelivery =
          history.length > 0
            ? history.map((h, idx) => (idx === history.length - 1 ? { ...h, outcome: 'delivered' as const } : h))
            : history

        get().updateCase(caseNo, {
          dispatchHistory: historyWithDelivery,
          deliveredAt: delivered,
          deliveryRecipient: receipt?.recipient || current.deliveryRecipient,
          deliveryRecipientRelation: receipt?.recipientRelation || current.deliveryRecipientRelation,
          deliveryAckType: receipt?.ackType || current.deliveryAckType,
          deliveryAckDocument: receipt?.ackDocument || current.deliveryAckDocument,
          resultPendingAck: false,
          appealDueAt: current.activity7State === 'rejected' ? dueAt : undefined,
          postAckStatus: 'พยานได้รับหนังสือแล้ว',
          postAckOwner: protectionResponsibleName(current),
          postAckNext:
            current.activity7State === 'rejected'
              ? `นับสิทธิอุทธรณ์ ${APPEAL_WINDOW_DAYS} วันจากวันที่ได้รับหนังสือ`
              : 'ลงนามข้อตกลง คบ.11 และประสานตำรวจในพื้นที่',
        })
        get().logHistory(
          caseNo,
          'บันทึกวันที่พยานได้รับหนังสือ',
          protectionResponsibleName(current),
          [
            current.activity7State === 'rejected'
              ? `เริ่มนับสิทธิอุทธรณ์ ${APPEAL_WINDOW_DAYS} วันจากวันที่ไปรษณีย์ส่งถึงบ้านพยาน`
              : 'ยืนยันการรับหนังสือแจ้งผลการพิจารณา',
            receipt?.recipient ? `ผู้รับ: ${receipt.recipient}${receipt.recipientRelation ? ` (${receipt.recipientRelation})` : ''}` : '',
            receipt?.ackType ? `หลักฐานการรับทราบ: ${receipt.ackType}${receipt.ackDocument ? ` · ${receipt.ackDocument}` : ''}` : '',
          ]
            .filter(Boolean)
            .join(' · ')
        )
      },

      /**
       * WIT0911-WIT0913 — พยานยื่นอุทธรณ์ (หนังสือ/วาจา) ผูกกับแฟ้มเดิมและวนกลับเข้าโฟลว์พิจารณาปกติ
       * ผังห้ามเปลี่ยนเจ้าของเรื่องอัตโนมัติ — owner คงเดิมจนกว่าจะมี assignAppealOfficer อย่างชัดเจน
       */
      fileAppeal: (caseNo, reason, intake, opts) => {
        const current = get().getCase(caseNo)
        if (!current || isCaseClosed(current)) return false
        const against = opts?.against ?? 'kb10'
        if ((current.appealFolder || current.appealFiledAt) && ((current.appealAgainst || 'kb10') === against || current.appealFolder?.stage !== 'resolved')) return false
        const auth = useAuthStore.getState()
        if (hasSignedResultNotice(current) && against === 'kb10' && (current.activity7State !== 'rejected' || !current.deliveredAt || current.appealFiledAt || !['receiver', 'officer', 'case_owner', 'admin'].includes(auth.currentRole) || (['officer', 'case_owner'].includes(auth.currentRole) && !noticeWorkerAllowed(auth.currentRole, current, auth.currentOfficerUserId)))) return false
        /** WIT0909 — ปิดเรื่องไม่อนุมัติแล้ว (พยานไม่ประสงค์อุทธรณ์/ครบ 30 วัน) ห้ามรับคำอุทธรณ์ คบ.10 อีก */
        if (against === 'kb10' && current.nonApprovalClosedAt) return false
        const at = nowDisplay()
        /** WIT0912 — ผู้รับจริงอาจเป็นธุรการสำนัก/กอง (ช่องทางหนังสือ) ไม่ใช่เจ้าหน้าที่เสมอไป */
        const recordedBy = opts?.recordedBy || protectionResponsibleName(current)
        const fullIntake: AppealIntake = { ...intake, recordedAt: at, recordedBy } as AppealIntake
        const documentName = intake.channel === 'letter' ? intake.evidenceDocumentName : intake.signedRecordDocumentName
        const channelNote =
          intake.channel === 'letter'
            ? `หนังสือ · เลขรับสารบรรณกลาง ${intake.registryNo} · รับครั้งแรก ${intake.firstReceivedAt}`
            : 'ด้วยวาจา · บันทึกถ้อยคำและให้ผู้ยื่นลงลายมือชื่อรับรองแล้ว'

        const workflowPatch: Partial<CaseItem> = {
          stage: 'appeal',
          status: against === 'kb17' ? 'รับคำอุทธรณ์คำสั่งยุติ (คบ.17)' : 'รับคำร้องอุทธรณ์แล้ว',
          next:
            against === 'kb17'
              ? 'เสนอคณะกรรมการ ป.ป.ท. วินิจฉัยอุทธรณ์คำสั่งยุติ'
              : `ตรวจสอบคุณสมบัติและระยะเวลาอุทธรณ์ (ภายใน ${APPEAL_WINDOW_DAYS} วัน) แล้วนำเรื่องกลับเข้าสายพิจารณา`,
          appealFiledAt: at,
          appealReason: reason,
          appealDocumentName: documentName,
          appealAgainst: against,
          ...(against === 'kb17' ? { appealDueAt: current.kb17?.appealDueAt } : {}),
          /** WIT0913 — คำอุทธรณ์ผูกกับแฟ้มเดิมแล้ว รอตรวจครบถ้วนและกรอบ 30 วันที่ WIT0914 — คำอุทธรณ์ไม่มีเลข คบ. ทุกช่องทาง */
          appealFolder: { stage: 'received', intake: fullIntake },
          /** คำอุทธรณ์ใหม่เริ่มแฟ้มลำดับชั้นใหม่ — ไม่พาความเห็น/มติของอุทธรณ์ครั้งก่อน (เช่น อุทธรณ์ คบ.10 ที่จบไปแล้ว) ติดมาด้วย */
          appealResolution: undefined,
          ...(against === 'kb10' ? { activity7State: 'committee' as const, activity7Label: 'อยู่ระหว่างพิจารณาอุทธรณ์' } : {}),
          documents: [
            ...(current.documents || []),
            {
              id: `DOC-APPEAL-${Date.now()}`,
              category: 'official',
              name: documentName,
              reference: 'คำร้องอุทธรณ์',
              uploadedBy: recordedBy,
              uploadedAt: at,
              note: reason,
            },
          ],
        }
        set((state) => ({ cases: state.cases.map((item) => item.no === caseNo ? { ...item, ...workflowPatch, updatedAt: new Date().toISOString() } : item) }))
        get().logHistory(
          caseNo,
          against === 'kb17' ? 'รับคำอุทธรณ์คำสั่งยุติ — ผูกกับ คบ.17 เดิม' : 'พยานยื่นอุทธรณ์คำสั่งไม่อนุมัติ',
          against === 'kb17' ? recordedBy : current.person,
          `${channelNote} — ${reason}`
        )
        return true
      },

      /**
       * มอบหมายเจ้าหน้าที่อุทธรณ์อย่างชัดเจน (ผบช.ชั้นต้น/ผอ.สำนัก/กอง) — จุดเดียวที่เปลี่ยน owner
       * ของแฟ้มอุทธรณ์ได้จริง ต่างจาก fileAppeal ที่ต้องไม่แตะ owner โดยอัตโนมัติ
       */
      assignAppealOfficer: (caseNo, officerUserId, note, actor) => {
        const current = get().getCase(caseNo)
        if (!current?.appealFolder || current.appealFolder.stage === 'resolved') return
        const officer = ECMIS_USER_DIRECTORY.find((u) => u.id === officerUserId)
        if (!officer) return
        const at = nowDisplay()
        const by = actor || ACTOR.supervisor
        const previousOwner = current.owner

        get().updateCase(caseNo, {
          appealFolder: {
            ...current.appealFolder,
            appealOfficer: { name: officer.name, userId: officer.id, at, by, note },
          },
          owner: officer.name,
        })
        get().logHistory(
          caseNo,
          'มอบหมายเจ้าหน้าที่อุทธรณ์',
          by,
          `${previousOwner || '-'} → ${officer.name}${note ? ` · ${note}` : ''}`
        )
        useNotificationStore.getState().addNotification({
          caseNo,
          type: 'มอบหมายงานอุทธรณ์',
          toName: officer.name,
          toUserId: officer.id,
          channel: 'ระบบ E-CMIS',
          message: `${by} มอบหมายให้ท่านเป็นเจ้าหน้าที่อุทธรณ์ของแฟ้ม ${caseNo} (${current.person || 'ยังไม่ระบุชื่อผู้ขอรับการคุ้มครอง'})`,
          urgency: current.urgent ? 'ด่วนที่สุด' : 'ปกติ',
        })
      },

      // ---------- 09A : ด่านก่อนลงนาม คบ.10 และการปิดเรื่องเมื่อไม่อุทธรณ์ ----------
      /**
       * WIT0904 — เจ้าหน้าที่ตรวจความครบถ้วนของร่าง คบ.10 ด้วยตนเอง แล้วเสนอรองเลขาธิการฯ กลั่นกรอง
       * เป็นขั้นคั่นกลางที่ผังแยกเป็น node ต่างหาก ร่างจึงเข้ารอบลงนามตรง ๆ ไม่ได้
       */
      submitKb10ForScreening: (caseNo, note) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const officer = protectionResponsibleName(current)
        get().updateCase(caseNo, {
          nonApprovalStep: 1,
          kb10ReadinessCheckedAt: nowDisplay(),
          kb10ReadinessCheckedBy: officer,
          kb10ReadinessNote: note,
          kb10DeputyReturnNote: undefined,
          status: 'รอรองเลขาธิการฯ กลั่นกรอง คบ.10',
          owner: ACTOR.deputySecretary,
          next: 'รองเลขาธิการฯ ตรวจว่าข้อความ คบ.10 ตรงผลพิจารณาและแจ้งสิทธิอุทธรณ์ครบ',
        })
        get().logHistory(
          caseNo,
          'ตรวจความครบถ้วนของร่าง คบ.10 และเสนอรองเลขาธิการฯ กลั่นกรอง',
          officer,
          note
        )
      },

      /**
       * WIT0905 — รองเลขาธิการฯ กลั่นกรอง คบ.10 เป็นด่านคุณภาพสุดท้ายก่อนถึงผู้ลงนาม
       * ไม่ผ่าน = ส่งร่างกลับเจ้าหน้าที่ผู้รับผิดชอบ (nonApprovalStep กลับเป็น 0) ไม่ข้ามไปรอบลงนาม
       */
      screenKb10ByDeputy: (caseNo, pass, note) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const officer = protectionResponsibleName(current)
        const at = nowDisplay()

        if (!pass) {
          get().updateCase(caseNo, {
            nonApprovalStep: 0,
            kb10ReadinessCheckedAt: undefined,
            kb10ReadinessCheckedBy: undefined,
            kb10DeputyScreenedAt: undefined,
            kb10DeputyScreenedBy: undefined,
            kb10DeputyScreenNote: undefined,
            kb10DeputyReturnNote: note,
            status: 'รองเลขาธิการฯ ส่งร่าง คบ.10 กลับแก้ไข',
            owner: officer,
            next: 'แก้ไขร่าง คบ.10 ตามข้อสังเกต แล้วเสนอรองเลขาธิการฯ กลั่นกรองใหม่',
          })
          get().logHistory(caseNo, 'รองเลขาธิการฯ ส่งร่าง คบ.10 กลับแก้ไข', ACTOR.deputySecretary, note)
          return
        }

        get().updateCase(caseNo, {
          nonApprovalStep: 2,
          kb10DeputyScreenedAt: at,
          kb10DeputyScreenedBy: ACTOR.deputySecretary,
          kb10DeputyScreenNote: note,
          kb10DeputyReturnNote: undefined,
          status: 'ผ่านการกลั่นกรอง · รอเลขาธิการฯ ลงนาม คบ.10',
          owner: ACTOR.secretary,
          next: 'เลขาธิการ ป.ป.ท. ลงนาม คบ.10 แล้วส่งออกผ่านสารบรรณเดิม',
        })
        get().logHistory(
          caseNo,
          'รองเลขาธิการฯ กลั่นกรอง คบ.10 ผ่าน',
          ACTOR.deputySecretary,
          `ข้อความตรงกับผลพิจารณาและแจ้งสิทธิอุทธรณ์ครบถ้วน — ${note}`
        )
      },

      /**
       * WIT0909 — พ้นกรอบ 30 วันโดยไม่มีการยื่นอุทธรณ์: ปิดกระบวนการไม่อนุมัติอย่างเป็นทางการ
       * คนละเส้นทางกับ closeProtectionCase (คบ.17 / sheet 11D) ซึ่งปิดเรื่องฝั่งยุติการคุ้มครอง
       */
      closeNonApprovalCase: (caseNo, note, waiver) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (hasSignedResultNotice(current) && !noticeWorkerAllowed(useAuthStore.getState().currentRole, current, useAuthStore.getState().currentOfficerUserId)) return
        /** ปิดเรื่องไม่ได้ถ้าพยานยื่นอุทธรณ์แล้ว หรือปิดไปแล้ว */
        if (current.appealFiledAt || current.nonApprovalClosedAt) return
        if (waiver && !waiver.evidence.trim()) return
        const officer = protectionResponsibleName(current)
        const at = nowDisplay()
        get().updateCase(caseNo, {
          nonApprovalStep: 4,
          nonApprovalClosedAt: at,
          nonApprovalClosedBy: officer,
          nonApprovalCloseNote: note,
          closedAt: at,
          status: waiver ? 'ปิดเรื่อง · ไม่อนุมัติ พยานแจ้งไม่ประสงค์อุทธรณ์' : 'ปิดเรื่อง · ไม่อนุมัติและไม่มีการอุทธรณ์',
          owner: officer,
          next: 'สิ้นสุดกระบวนการไม่อนุมัติ — จัดเก็บแฟ้มตามระเบียบ',
          activity7Label: 'สิ้นสุดกระบวนการไม่อนุมัติ',
        })
        get().logHistory(
          caseNo,
          waiver ? 'ปิดกระบวนการไม่อนุมัติ (พยานแจ้งไม่ประสงค์อุทธรณ์ก่อนครบกำหนด)' : 'ปิดกระบวนการไม่อนุมัติ (ไม่อุทธรณ์ภายในกำหนด)',
          officer,
          waiver ? `${note} · หลักฐานคำแจ้งของพยาน: ${waiver.evidence.trim()}` : note
        )
      },

      // ---------- ขั้นที่ 6 : การคุ้มครองพยานและการรายงานผล ----------
      /**
       * ใบตอบรับ/ใบปะหน้าประจำวันจากตำรวจ — เก็บเป็นหลักฐานการประสานงานเท่านั้น
       *
       * ระยะเวลาคุ้มครองไม่ได้เริ่มนับที่เอกสารฉบับนี้: ระเบียบให้เริ่มนับจาก "วันเริ่มจริง"
       * ตามคำสั่ง/แผนปฏิบัติ ซึ่งบันทึกผ่าน setMethodStatus(..., 'active') และ startPhase
       * (flow WIT0816 / WIT0819 / WIT0829 ไม่มีขั้นตอนใบตอบรับตำรวจเป็นจุดตั้งต้น)
       */
      recordPoliceAck: (caseNo, documentName, durationDays) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        const at = new Date().toISOString()
        const days = Math.min(durationDays || current.protectionDays || PROTECTION_DEFAULT_DAYS, PROTECTION_MAX_DAYS)
        /** ถ้ายังไม่เคยมีวันเริ่มจริง ให้ถือคำสั่งที่ลงนามเป็นจุดตั้งต้น ไม่ใช่วันอัปโหลดเอกสารนี้ */
        const startedAt = current.actualStartedAt || earliestMethodStart(current) || at
        const episode = current.episode || deriveEpisode({ ...current, actualStartedAt: startedAt })

        get().updateCase(caseNo, {
          policeAckAt: at,
          policeAckDocument: documentName,
          actualStartedAt: startedAt,
          episode,
          protectionDays: days,
          protectionEndAt: addProtectionMonths(startedAt, current.protectionMonths ?? days / 30),
          protectionMonths: current.protectionMonths ?? days / 30,
          stage: 'protection',
          status: 'กำลังคุ้มครอง',
          owner: ACTOR.protection,
          next: `ปฏิบัติการคุ้มครองและจัดทำรายงานผลประจำเดือน (คบ.13) · ครบกำหนดใน ${legacyMonthLabel(days)}`,
          approvalStep: 4,
          documents: [
            ...(current.documents || []),
            {
              id: `DOC-POLICE-${Date.now()}`,
              category: 'official',
              name: documentName,
              reference: 'ใบตอบรับส่งมอบพยาน / ใบปะหน้าประจำวัน',
              uploadedBy: protectionResponsibleName(current),
              uploadedAt: nowDisplay(),
            },
          ],
        })
        get().logHistory(
          caseNo,
          'อัปโหลดใบตอบรับจากตำรวจ (หลักฐานการประสานงาน)',
          protectionResponsibleName(current),
          `${documentName} — ระยะเวลาตามคำสั่ง ${legacyMonthLabel(days)} นับจากวันเริ่มจริง ไม่ใช่วันอัปโหลด`
        )
      },

      addImportantEvent: (caseNo, title, detail, reporter) => {
        const current = get().getCase(caseNo)
        if (!current) return
        get().updateCase(caseNo, {
          importantEvents: [
            ...(current.importantEvents || []),
            { id: `EV-${Date.now()}`, date: nowDisplay(), title, detail, reporter },
          ],
        })
        get().logHistory(caseNo, `รายงานเหตุสำคัญ: ${title}`, reporter, detail)
        /**
         * WIT1011 — เหตุสำคัญต้องถึงตัวผู้รับผิดชอบทันที แยกจากรอบรายงานประจำเดือน (คบ.13)
         * บันทึกลงแฟ้มอย่างเดียวไม่พอ ต้องเกิดเป็นรายการแจ้งเตือนจริงในคิวของผู้รับผิดชอบ
         */
        useNotificationStore.getState().addNotification({
          caseNo,
          type: 'เหตุสำคัญระหว่างการคุ้มครอง',
          toName: protectionResponsibleName(current),
          toUserId: current.protectionHandoff?.assigneeUserId || current.assignedOfficerUserId,
          channel: 'ระบบ E-CMIS',
          message: `${title} — ${detail}`,
          urgency: 'ด่วนที่สุด',
        })
      },

      addMonthlyReport: (caseNo, period, summary, incidentCount, submittedBy) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const report: MonthlyReport = {
          id: `RPT-${Date.now()}`,
          period,
          submittedAt: nowDisplay(),
          submittedBy,
          summary,
          incidentCount,
        }
        get().updateCase(caseNo, {
          monthlyReports: [...(current.monthlyReports || []), report],
          /** WIT1005 — จัดทำ คบ.13 แล้ว จึงแนบแบบเข้าแฟ้มเพื่อให้ลงนาม WIT1006/WIT1007 ที่รายการแบบฟอร์ม */
          extraForms: Array.from(new Set([...(current.extraForms || []), 13])),
        })
        get().logHistory(caseNo, `ส่งรายงานผลประจำเดือน คบ.13 งวด ${period}`, submittedBy, summary)
      },

      /**
       * WIT1006 → WIT1007 — เจ้าหน้าที่ผู้ปฏิบัติลงนาม แล้วพยานตรวจข้อมูลและลงนามรับรอง คบ.13 ของรอบนั้น
       * ลงนามครบทั้งสองช่องจึงถือว่ารอบรายงานนั้นสมบูรณ์ (WIT1010 เก็บเป็นรอบรายงานใหม่)
       */
      signMonthlyReport: (caseNo, reportId, slot, signerName) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const target = (current.monthlyReports || []).find((r) => r.id === reportId)
        if (!target) return
        const at = nowDisplay()
        const name =
          signerName || (slot === 'witness' ? current.person : protectionResponsibleName(current))

        const reports = (current.monthlyReports || []).map((r) =>
          r.id === reportId
            ? slot === 'officer'
              ? { ...r, officerSignedAt: r.officerSignedAt || at, officerSignedBy: r.officerSignedBy || name }
              : { ...r, witnessSignedAt: r.witnessSignedAt || at, witnessSignedBy: r.witnessSignedBy || name }
            : r
        )
        const signed = reports.find((r) => r.id === reportId)!
        const complete = Boolean(signed.officerSignedAt && signed.witnessSignedAt)

        get().updateCase(caseNo, {
          monthlyReports: reports,
          ...(complete
            ? { next: `รายงานผล คบ.13 งวด ${signed.period} ลงนามครบแล้ว — กำหนดรอบรายงานถัดไป` }
            : {}),
        })
        get().logHistory(
          caseNo,
          slot === 'officer'
            ? `เจ้าหน้าที่ผู้ปฏิบัติลงนาม คบ.13 งวด ${signed.period}`
            : `พยานลงนามรับรอง คบ.13 งวด ${signed.period}`,
          name,
          slot === 'officer'
            ? 'ตรวจผลการปฏิบัติเทียบวิธีที่ได้รับอนุมัติแล้วลงนาม'
            : 'พยานตรวจข้อมูลผลการคุ้มครองและลงลายมือชื่อรับรอง'
        )
      },

      // ---------- แท็บ 10 : ติดตามและรายงานผลการคุ้มครอง (คบ.13) ----------
      /**
       * WIT1004 — รวบรวมผลทุกวิธีเมื่อถึงรอบหรือมีเหตุสำคัญ แล้วเปิดเป็นรอบรายงานใหม่
       * ยังไม่แนบแบบ คบ.13 เข้าแฟ้มตรงนี้ เพราะยังไม่ได้จัดทำเนื้อรายงาน (WIT1005)
       * เปิดซ้ำไม่ได้ถ้ารอบก่อนหน้ายังไม่ถูกล็อก — หนึ่งสำนวนมีรอบที่เปิดอยู่ได้ครั้งละรอบเดียว
       */
      openKb13Round: (caseNo, input) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const rounds = current.monthlyReports || []
        const last = rounds[rounds.length - 1]
        if (last && !last.lockedAt) return
        const by = input.openedBy || protectionResponsibleName(current)
        const round: MonthlyReport = {
          id: `RPT-${Date.now()}`,
          period: input.period,
          periodFrom: input.periodFrom,
          periodTo: input.periodTo,
          submittedAt: nowDisplay(),
          submittedBy: by,
          summary: '',
          incidentCount: (current.importantEvents || []).length,
          evidenceRefs: input.evidenceRefs?.filter(Boolean),
        }
        get().updateCase(caseNo, { monthlyReports: [...rounds, round] })
        get().logHistory(
          caseNo,
          `เปิดรอบรายงานผล คบ.13 งวด ${input.period}`,
          by,
          `รวบรวมบันทึกปฏิบัติ หลักฐาน และรายงานภายนอกของทุกวิธี (${
            round.evidenceRefs?.length || 0
          } รายการ)`
        )
      },

      /**
       * WIT1005 — จัดทำ คบ.13: ช่วงรายงาน คำสั่ง/จำนวนวัน ผู้ปฏิบัติ และสรุปผลการดำเนินการ
       * จัดทำแล้วจึงแนบแบบเข้าแฟ้มเพื่อให้ลงนาม WIT1006/WIT1007 ที่รายการแบบฟอร์มที่เดียวตามกติกาเดิม
       */
      submitKb13Round: (caseNo, reportId, patch) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const target = (current.monthlyReports || []).find((r) => r.id === reportId)
        /** ล็อกแล้วคือฉบับลงนามที่ปิดรอบไปแล้ว — ห้ามแก้ย้อนหลัง (WIT1010) */
        if (!target || target.lockedAt) return
        get().updateCase(caseNo, {
          monthlyReports: (current.monthlyReports || []).map((r) =>
            r.id === reportId ? { ...r, ...patch, submittedAt: nowDisplay() } : r
          ),
          extraForms: Array.from(new Set([...(current.extraForms || []), 13])),
          next: `รอลงนาม คบ.13 งวด ${target.period}`,
        })
        get().logHistory(
          caseNo,
          `จัดทำรายงานผล คบ.13 งวด ${target.period}`,
          target.submittedBy,
          patch.summary || target.summary
        )
      },

      /** WIT1008 — รับ คบ.13 ที่ลงนามครบแล้ว และตรวจผลปฏิบัติเทียบวิธีที่ได้รับอนุมัติ */
      receiveKb13Round: (caseNo, reportId, receivedBy, mismatchIssue) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const target = (current.monthlyReports || []).find((r) => r.id === reportId)
        /** ตรวจรับได้เมื่อครบทั้งสองลายมือชื่อเท่านั้น ตามลำดับในผัง */
        if (!target || target.lockedAt || !target.officerSignedAt || !target.witnessSignedAt) return
        const by = receivedBy || current.protectionOwner || protectionResponsibleName(current)
        get().updateCase(caseNo, {
          monthlyReports: (current.monthlyReports || []).map((r) =>
            r.id === reportId
              ? { ...r, reviewedAt: nowDisplay(), reviewedBy: by, ...(mismatchIssue ? { issues: mismatchIssue } : {}) }
              : r
          ),
          next: `บันทึกสถานะล่าสุดของงวด ${target.period}`,
        })
        get().logHistory(
          caseNo,
          `รับ คบ.13 งวด ${target.period} ที่ลงนามแล้ว`,
          by,
          mismatchIssue
            ? `พบผลปฏิบัติไม่ตรงกับวิธีที่ได้รับอนุมัติ บันทึกเป็นประเด็น: ${mismatchIssue}`
            : 'ตรวจผลการปฏิบัติเทียบวิธีที่ได้รับอนุมัติและหลักฐานประกอบ'
        )
      },

      /**
       * WIT1009 — บันทึกสถานะล่าสุด ระดับความเสี่ยง ปัญหา เหตุสำคัญ และข้อเสนอสำหรับรอบถัดไป
       * ระดับความเสี่ยงที่บันทึกถือเป็นค่าล่าสุดของสำนวน เพราะเป็นผลประเมินจากรอบรายงานที่ตรวจรับแล้ว
       */
      recordKb13Status: (caseNo, reportId, status) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const target = (current.monthlyReports || []).find((r) => r.id === reportId)
        if (!target || target.lockedAt) return
        const by = status.recordedBy || target.reviewedBy || protectionResponsibleName(current)
        get().updateCase(caseNo, {
          monthlyReports: (current.monthlyReports || []).map((r) =>
            r.id === reportId
              ? {
                  ...r,
                  riskLevel: status.riskLevel,
                  issues: status.issues,
                  nextProposal: status.nextProposal,
                  incidentCount: status.incidentCount ?? r.incidentCount,
                }
              : r
          ),
          risk: status.riskLevel,
          next: `ล็อกรอบรายงานงวด ${target.period}`,
        })
        get().logHistory(
          caseNo,
          `บันทึกสถานะล่าสุดของงวด ${target.period} — ความเสี่ยง${status.riskLevel}`,
          by,
          `ปัญหา: ${status.issues || '-'} · ข้อเสนอรอบถัดไป: ${status.nextProposal || '-'}`
        )
      },

      /**
       * WIT1010 — เก็บ คบ.13 เป็นรอบรายงานใหม่และล็อกฉบับลงนาม
       * ล็อกได้เมื่อลงนามครบและตรวจรับแล้วเท่านั้น เพื่อไม่ให้ปิดรอบข้ามขั้น
       */
      lockKb13Round: (caseNo, reportId) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const target = (current.monthlyReports || []).find((r) => r.id === reportId)
        if (!target || target.lockedAt) return
        /** ต้องผ่าน WIT1006/1007 (ลงนาม), WIT1008 (ตรวจรับ) และ WIT1009 (บันทึกสถานะ) มาก่อน */
        if (!target.officerSignedAt || !target.witnessSignedAt || !target.reviewedAt || !target.riskLevel) return
        get().updateCase(caseNo, {
          monthlyReports: (current.monthlyReports || []).map((r) =>
            r.id === reportId ? { ...r, lockedAt: nowDisplay() } : r
          ),
          status: `คุ้มครองต่อเนื่อง · รายงานผลงวด ${target.period} ครบถ้วน`,
          next: 'กำหนดรอบ คบ.13 ถัดไป หรือส่งทบทวนผลการคุ้มครอง',
        })
        get().logHistory(
          caseNo,
          `ล็อก คบ.13 งวด ${target.period} เป็นรอบรายงานใหม่`,
          target.reviewedBy || target.submittedBy,
          'ฉบับลงนามถูกล็อก แก้ไขไม่ได้อีก และปรับข้อมูลคุ้มครองล่าสุดของแฟ้ม'
        )
      },

      /** WIT1012 — ยังคุ้มครองต่อ จึงกำหนดรอบ คบ.13 ถัดไป */
      setNextReportDue: (caseNo, dueAt, by) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const actor = by || protectionResponsibleName(current)
        const last = [...(current.monthlyReports || [])].reverse().find((r) => Boolean(r.lockedAt))
        get().updateCase(caseNo, {
          nextReportDueAt: dueAt,
          monthlyReports: (current.monthlyReports || []).map((r) =>
            last && r.id === last.id ? { ...r, nextDueAt: dueAt } : r
          ),
          next: `รายงานผล คบ.13 รอบถัดไป ภายใน ${formatThaiDate(dueAt)}`,
        })
        get().logHistory(
          caseNo,
          `กำหนดรอบรายงาน คบ.13 ถัดไป ${formatThaiDate(dueAt)}`,
          actor,
          'ยังคุ้มครองต่อภายใต้คำสั่งเดิม'
        )
      },

      /**
       * WIT1013 — ส่ง คบ.13 ล่าสุด ผลประเมินความเสี่ยง คำสั่งปัจจุบัน และยอดวันสะสมไปแท็บ 11A
       * เก็บ payload ไว้ในแฟ้มเพื่อให้หน้า 11A หยิบไปใช้ได้โดยไม่ต้องคำนวณซ้ำจากคนละฐาน
       */
      sendToProtectionReview: (caseNo, reason, by) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const actor = by || protectionResponsibleName(current)
        const episode = current.episode || deriveEpisode(current)
        const last = [...(current.monthlyReports || [])].reverse().find((r) => Boolean(r.lockedAt))
        get().updateCase(caseNo, {
          reviewHandoff: {
            at: nowDisplay(),
            by: actor,
            reason,
            reportId: last?.id,
            period: last?.period,
            riskLevel: last?.riskLevel || current.risk,
            orderRef: currentPhaseKind(episode) === 'TEMPORARY' ? 'คบ.5' : 'คบ.8/คบ.11',
            cumulativeDays: cumulativeDays(episode),
            remainingDays: remainingDays(episode),
          },
          next: 'ทบทวนผลการคุ้มครองและจำแนกแนวทาง',
        })
        get().logHistory(
          caseNo,
          'ส่งเรื่องทบทวนผลการคุ้มครอง',
          actor,
          `${reason} · สะสม ${cumulativeDays(episode)} วัน คงเหลือ ${remainingDays(episode)} วัน`
        )
      },

      // ---------- ขั้นที่ 7 : ทบทวน ขยายเวลา ยุติ หรือส่งต่อ ----------
      /** คบ.14 — ยื่นตรงถึงเลขาธิการฯ โดยไม่ผ่าน ผอ.สำนัก/กอง */
      requestExtension: (caseNo, durationDays, reason, requestedBy) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const by = requestedBy || protectionResponsibleName(current)
        const episode = current.episode || deriveEpisode(current)

        /**
         * WIT1116 / WIT1150 — ตรวจเทียบเพดานรวมก่อนเสมอ
         * ถึงเพดานแล้วห้ามจัดทำ คบ.14 เพิ่ม ให้เปลี่ยนไปเส้นทางข้อ 14 แทน (WIT1149)
         */
        const check = checkExtension(episode, durationDays)
        if (check.maxDays <= 0) {
          get().updateCase(caseNo, {
            stage: 'article14',
            status: `คุ้มครองสะสมครบเพดาน 6 เดือน · ห้ามขยายเวลา`,
            owner: by,
            next: `จัดทำเรื่องเสนอเพื่อส่ง ${ARTICLE14_TARGET_AGENCY}`,
          })
          get().logHistory(caseNo, 'ปฏิเสธคำขอขยายเวลา — ครบเพดานรวม', by, check.reason || '')
          return
        }

        /** ขยายได้เท่าที่เหลือเท่านั้น และไม่เกินกรอบครั้งละ PROTECTION_MAX_DAYS */
        const grantedDays = Math.min(durationDays, PROTECTION_MAX_DAYS, check.maxDays)
        const request: ExtensionRequest = {
          id: `EXT-${Date.now()}`,
          requestedAt: nowDisplay(),
          requestedBy: by,
          reason,
          durationDays: grantedDays,
          status: 'pending',
        }
        get().updateCase(caseNo, {
          extensionRequests: [...(current.extensionRequests || []), request],
          status: 'รอเลขาธิการ ป.ป.ท. อนุมัติขยายระยะเวลา (คบ.14)',
          next: 'เลขาธิการ ป.ป.ท. พิจารณาลงนามอนุมัติขยายระยะเวลาคุ้มครองโดยตรง',
          extraForms: Array.from(new Set([...(current.extraForms || []), 14])),
        })
        get().logHistory(
          caseNo,
          'ยื่นขอขยายระยะเวลาคุ้มครอง (คบ.14)',
          by,
          `ขอขยาย ${request.durationDays} วัน (สะสมแล้ว ${check.cumulative} วัน · เหลือ ${check.remaining} วันจากเพดาน 6 เดือน) — ยื่นตรงถึงเลขาธิการ ป.ป.ท. · ${reason}`
        )
      },

      decideExtension: (caseNo, requestId, approve, note) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const request = current.extensionRequests?.find((r) => r.id === requestId)
        const role = useAuthStore.getState().currentRole
        if (!request?.formSnapshot || request.status !== 'pending' || request.approvalStage !== 'secretary' || !['secretary', 'admin'].includes(role)) return
        const at = nowDisplay()
        const requests = (current.extensionRequests || []).map((r) =>
          r.id === requestId
            ? {
                ...r,
                status: (approve ? 'approved' : 'rejected') as ExtensionRequest['status'],
                decidedAt: at,
                decidedBy: ACTOR.secretary,
                decisionNote: note,
                formSnapshot: { ...r.formSnapshot, 'ความเห็นเลขาธิการ': note },
                approvalHistory: [...(r.approvalHistory || []), { role: 'secretary', by: ACTOR.secretary, at, note, endorsed: approve }],
                /** WIT1122 — ล็อกฉบับลงนามหลังอนุมัติ แก้ไม่ได้อีก */
                locked: approve || r.locked,
              }
            : r
        )
        const decided = requests.find((r) => r.id === requestId)

        if (approve && decided) {
          const base = current.protectionEndAt || new Date().toISOString()
          const episode = current.episode || deriveEpisode(current)
          /**
           * WIT1122 — เพิ่มช่วงคุ้มครองใหม่โดยไม่แก้ทับช่วงเดิม:
           * ปิด Phase ปัจจุบันที่วันสิ้นสุดเดิม แล้วต่อ Phase ใหม่ในชนิดเดียวกัน วันสะสมจึงเดินต่อไม่รีเซ็ต
           */
          const extended = episode ? switchPhase(episode, currentPhaseKind(episode) || 'MAIN', base, `คบ.14 ครั้งที่ ${requests.filter((r) => r.status === 'approved').length}`) : episode
          get().updateCase(caseNo, {
            extensionRequests: requests,
            episode: extended,
            protectionEndAt: decided.durationMonths ? addProtectionMonths(base, decided.durationMonths) : addDays(base, decided.durationDays),
            protectionMonths: (current.protectionMonths ?? (current.protectionDays || PROTECTION_DEFAULT_DAYS) / 30) + (decided.durationMonths ?? decided.durationDays / 30),
            protectionDays: (current.protectionDays || PROTECTION_DEFAULT_DAYS) + decided.durationDays,
            status: 'กำลังคุ้มครอง (ขยายระยะเวลาแล้ว)',
            owner: protectionResponsibleName(current),
            next: `คุ้มครองต่ออีก ${decided.durationMonths ? monthLabel(decided.durationMonths) : legacyMonthLabel(decided.durationDays)} · รายงานผลประจำเดือนตามรอบ (คบ.13)`,
          })
        } else {
          get().updateCase(caseNo, {
            extensionRequests: requests,
            status: 'ไม่อนุมัติขยายระยะเวลาคุ้มครอง · คงคำสั่งเดิมถึงวันสิ้นสุด',
            owner: protectionResponsibleName(current),
            /** WIT1123 — คงคำสั่งเดิมไว้จนถึงวันสิ้นสุด แล้วจึงเข้าแท็บ 11C */
            next: 'คงคำสั่งเดิมถึงวันสิ้นสุด เมื่อถึงกำหนดให้จัดทำเรื่องยุติ (คบ.15)',
            extraForms: Array.from(new Set([...(current.extraForms || []), 7])),
          })
        }

        get().logHistory(
          caseNo,
          approve ? 'เลขาธิการ ป.ป.ท. อนุมัติขยายระยะเวลาคุ้มครอง' : 'เลขาธิการ ป.ป.ท. ไม่อนุมัติขยายระยะเวลา',
          ACTOR.secretary,
          note
        )
      },

      /**
       * WIT1114-WIT1116 — จัดทำ คบ.14 ที่หน้า 11B
       * ต่างจาก requestExtension (ทางลัดจากแฟ้ม) ตรงที่ฉบับนี้ยังไม่ถึงผู้มีอำนาจ
       * ต้องผ่านผู้ตรวจที่ WIT1117 ก่อน และแก้ไขได้เป็นเวอร์ชันใหม่โดยไม่ทับฉบับเดิม
       */
      draftKb14: (caseNo, input, actor) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        const existing = current.extensionRequests?.at(-1)
        if (existing && (existing.status === 'pending' || existing.status === 'approved' || existing.status === 'submitted' && existing.formSnapshot)) return
        const by = actor || protectionResponsibleName(current)
        const episode = current.episode || deriveEpisode(current)

        /** WIT1116 / WIT1150 — ถึงเพดานแล้วห้ามจัดทำ คบ.14 เพิ่ม ให้กลับไปแขนงข้อ 14 ที่ 11A */
        const check = checkExtension(episode, input.durationDays)
        if (check.maxDays <= 0) {
          get().logHistory(caseNo, 'ปฏิเสธการจัดทำ คบ.14 — ครบเพดานรวม', by, check.reason || '')
          return
        }

        const requests = current.extensionRequests || []
        /** ฉบับที่ยังแก้ได้คือฉบับล่าสุดที่ถูกส่งกลับ หรือฉบับที่ยังไม่ผ่านผู้ตรวจ */
        const editable = [...requests].reverse().find((r) => r.status === 'returned' || r.status === 'submitted')
        const capEnd = episode?.phases[0]?.startedAt ? addProtectionMonths(episode.phases[0].startedAt, 6) : undefined
        if (input.durationMonths && (input.durationMonths < 1 || input.durationMonths > 2 || capEnd && input.periodTo && input.periodTo > capEnd)) return
        const grantedDays = input.durationMonths ? input.durationDays : Math.min(input.durationDays, PROTECTION_MAX_DAYS, check.maxDays)
        const version = (editable?.version || 0) + 1

        const request: ExtensionRequest = {
          id: editable?.id || `EXT-${Date.now()}`,
          requestedAt: nowDisplay(),
          requestedBy: by,
          reason: input.reason,
          durationDays: grantedDays,
          durationMonths: input.durationMonths,
          periodFrom: input.periodFrom,
          periodTo: input.periodTo,
          gapDays: input.gapDays,
          gapReason: input.gapReason,
          attachments: input.attachments || [],
          version,
          status: 'submitted',
          formSnapshot: input.formSnapshot,
          approvalStage: 'supervisor',
          approvalHistory: [],
          previousVersions: editable
            ? [
                ...(editable.previousVersions || []),
                {
                  version: editable.version || 1,
                  createdAt: editable.requestedAt,
                  reason: editable.reason,
                  durationDays: editable.durationDays,
                  periodFrom: editable.periodFrom,
                  periodTo: editable.periodTo,
                  returnNote: editable.reviewNote,
                  formSnapshot: editable.formSnapshot,
                  approvalHistory: editable.approvalHistory,
                },
              ]
            : [],
        }

        get().updateCase(caseNo, {
          extensionRequests: editable ? requests.map((r) => (r.id === editable.id ? request : r)) : [...requests, request],
          status: `จัดทำ คบ.14 ฉบับที่ ${version} · รอผู้ตรวจตรวจเอกสาร`,
          owner: ACTOR.supervisor,
          next: 'ตรวจ คบ.14 เหตุผล หลักฐาน ช่วงวันที่ และเพดานวันสะสม',
          extraForms: Array.from(new Set([...(current.extraForms || []), 14])),
        })
        get().logHistory(
          caseNo,
          `จัดทำ คบ.14 ฉบับที่ ${version}`,
          by,
          `ขอขยาย ${grantedDays} วัน${input.periodFrom ? ` (${input.periodFrom} ถึง ${input.periodTo || '-'})` : ''} · สะสมแล้ว ${check.cumulative} วัน คงเหลือ ${check.remaining} วันจากเพดาน 6 เดือน · ${input.reason}`
        )
      },

      /** WIT1117-WIT1120 — ครบถ้วนแล้วเสนอตามลำดับชั้น ไม่ครบส่งกลับแก้พร้อมเหตุผล */
      reviewKb14: (caseNo, requestId, endorse, note) => {
        const current = get().getCase(caseNo)
        const request = current?.extensionRequests?.find((r) => r.id === requestId)
        if (!current || !request || !request.formSnapshot || !['submitted', 'pending'].includes(request.status)) return
        const role = useAuthStore.getState().currentRole
        const step = request.approvalStage || 'supervisor'
        if ((step === 'secretary' && endorse) || (role !== step && role !== 'admin' && !(step === 'director' && role === 'got_director'))) return
        if (!endorse && !note.trim()) return
        const nextStep = step === 'supervisor' ? 'director' : step === 'director' ? 'deputy_secretary' : 'secretary'
        const actors = { supervisor: ACTOR.supervisor, director: ACTOR.director, deputy_secretary: ACTOR.deputySecretary, secretary: ACTOR.secretary }
        const labels = { supervisor: 'ผู้บังคับบัญชาชั้นต้น', director: 'ผอ.กอง', deputy_secretary: 'รองเลขาธิการ', secretary: 'เลขาธิการ' }
        const at = nowDisplay()
        get().updateCase(caseNo, {
          extensionRequests: current.extensionRequests!.map((r) => r.id === requestId ? {
            ...r, status: endorse ? 'pending' : 'returned', approvalStage: endorse ? nextStep : 'supervisor',
            reviewedAt: at, reviewedBy: actors[step], reviewNote: note,
            approvalHistory: [...(r.approvalHistory || []), { role: step, by: actors[step], at, note, endorsed: endorse }],
          } : r),
          status: endorse ? `คบ.14 · รอ${labels[nextStep]}พิจารณา` : 'ส่งคืนแก้ไข คบ.14',
          owner: endorse ? actors[nextStep] : protectionResponsibleName(current),
          next: endorse ? `${labels[nextStep]}พิจารณา คบ.14` : 'แก้ไขแบบ คบ.14 แล้วเสนอใหม่',
        })
        get().logHistory(caseNo, endorse ? `${labels[step]}เห็นชอบ คบ.14` : `${labels[step]}ส่งคืน คบ.14`, actors[step], note)
      },

      /** คบ.7 — คำร้องขอยุติการคุ้มครองพยาน */
      requestTermination: (caseNo, reason, requestedBy) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const by = requestedBy || protectionResponsibleName(current)
        get().updateCase(caseNo, {
          terminationRequest: { requestedAt: nowDisplay(), requestedBy: by, reason, status: 'pending' },
          status: 'รอเลขาธิการ ป.ป.ท. ลงนามสั่งยุติการคุ้มครอง (คบ.7)',
          owner: ACTOR.secretary,
          next: 'เลขาธิการ ป.ป.ท. ลงนามรับรองเพื่อสั่งยุติการปฏิบัติงานคุ้มครองพยาน',
          extraForms: Array.from(new Set([...(current.extraForms || []), 7])),
        })
        get().logHistory(caseNo, 'จัดทำ คบ.7 คำร้องขอยุติการคุ้มครองพยาน', by, reason)
      },

      /**
       * WIT1136-1137 — ผู้มีอำนาจพิจารณาคำขอยุติ
       *
       * เห็นชอบให้ยุติ = เข้าสู่ขั้นออกคำสั่ง คบ.16 เท่านั้น ยังไม่ใช่การยุติ
       * (WIT1130: การยุติยังไม่เกิดขึ้นเพียงเพราะรับ คบ.7 หรือจัดทำ คบ.15
       *  ต้องรอคำสั่ง คบ.16 ที่ลงนามและถึงวันที่มีผล — ดู issueKb16 / signKb16)
       */
      decideTermination: (caseNo, approve, note) => {
        const current = get().getCase(caseNo)
        if (!current || !current.terminationRequest) return
        const at = nowDisplay()

        get().updateCase(caseNo, {
          terminationRequest: {
            ...current.terminationRequest,
            status: approve ? 'pending' : 'rejected',
            decidedAt: at,
            decidedBy: ACTOR.secretary,
            decisionNote: note,
          },
          stage: approve ? 'termination_order' : 'protection',
          status: approve ? 'เห็นชอบให้ยุติ · รอออกคำสั่ง คบ.16' : 'กำลังคุ้มครอง (ไม่อนุมัติยุติ)',
          owner: approve ? protectionResponsibleName(current) : ACTOR.protection,
          next: approve
            ? 'จัดทำร่างคำสั่งยุติ (คบ.16) ระบุวันที่ออกคำสั่งและวันที่มีผล แล้วเสนอลงนาม'
            : 'ปฏิบัติการคุ้มครองต่อเนื่องตามคำสั่งเดิม',
          activity7Label: approve ? 'เห็นชอบให้ยุติ — รอคำสั่ง คบ.16' : current.activity7Label,
        })
        get().logHistory(
          caseNo,
          approve ? 'ผู้มีอำนาจเห็นชอบให้ยุติ · เข้าสู่ขั้นออกคำสั่ง คบ.16' : 'ผู้มีอำนาจไม่อนุมัติการยุติ',
          ACTOR.secretary,
          approve ? `${note} — การคุ้มครองยังไม่สิ้นสุดจนกว่าคำสั่ง คบ.16 จะลงนามและถึงวันที่มีผล` : note
        )
      },

      /** คบ.12 — ส่งต่อหน่วยงานภายนอกเมื่อเกินขอบเขตอำนาจ ป.ป.ท. */
      requestTransfer: (caseNo, agency, reason, requestedBy) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const by = requestedBy || protectionResponsibleName(current)
        get().updateCase(caseNo, {
          transferRequest: { requestedAt: nowDisplay(), requestedBy: by, agency, reason, status: 'pending' },
          status: `รอส่งมอบพยานให้ ${agency} (คบ.12)`,
          owner: by,
          next: `จัดทำ คบ.12 บันทึกส่งมอบพยานให้ ${agency} รับหน้าที่ดูแลความปลอดภัยต่อ`,
          extraForms: Array.from(new Set([...(current.extraForms || []), 12])),
        })
        get().logHistory(caseNo, 'จัดทำ คบ.12 ส่งต่อหน่วยงานภายนอก', by, `${agency} — ${reason}`)
      },

      completeTransfer: (caseNo, note) => {
        const current = get().getCase(caseNo)
        if (!current || !current.transferRequest) return
        const at = nowDisplay()
        get().updateCase(caseNo, {
          transferRequest: { ...current.transferRequest, status: 'approved', handoverAt: at, decidedAt: at, decisionNote: note },
          stage: 'transferred',
          status: `ส่งต่อ ${current.transferRequest.agency} แล้ว`,
          next: 'ปิดแฟ้มการคุ้มครองของ ป.ป.ท. และติดตามผลจากหน่วยงานผู้รับมอบ',
          closedAt: at,
          activity7Label: `ส่งต่อ ${current.transferRequest.agency}`,
        })
        get().logHistory(caseNo, 'บันทึกส่งมอบพยานให้หน่วยงานภายนอก', protectionResponsibleName(current), note)
      },

      /** พยานขอถอนตัวกะทันหัน — บันทึกเป็น คบ.3 แล้วเสนอ ผบช.ชั้นต้น → ผอ.สำนัก/กอง อนุมัติ */
      requestWithdrawal: (caseNo, reason, requestedBy) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const by = requestedBy || protectionResponsibleName(current)
        get().updateCase(caseNo, {
          withdrawal: true,
          withdrawalRequest: {
            requestedAt: nowDisplay(),
            requestedBy: by,
            reason,
            status: 'pending',
            approvalStage: 'supervisor',
          },
          status: 'พยานขอถอนตัว · รอผู้บังคับบัญชาชั้นต้นพิจารณา',
          owner: ACTOR.supervisor,
          next: 'ผู้บังคับบัญชาชั้นต้นพิจารณาคำขอถอนตัว แล้วเสนอ ผอ.สำนัก/กอง อนุมัติ',
          extraForms: Array.from(new Set([...(current.extraForms || []), 3])),
        })
        get().logHistory(caseNo, 'บันทึกคำร้องขอถอนตัวของพยาน (คบ.3)', by, reason)
      },

      decideWithdrawal: (caseNo, role, approve, note) => {
        const current = get().getCase(caseNo)
        if (!current || !current.withdrawalRequest) return
        const at = nowDisplay()
        const actor = role === 'supervisor' ? ACTOR.supervisor : ACTOR.director

        if (!approve) {
          get().updateCase(caseNo, {
            withdrawal: false,
            withdrawalRequest: { ...current.withdrawalRequest, status: 'rejected', decidedAt: at, decidedBy: actor, decisionNote: note },
            status: 'กำลังคุ้มครอง (ไม่อนุมัติการถอนตัว)',
            owner: ACTOR.protection,
            next: 'ชี้แจงพยานและปฏิบัติการคุ้มครองต่อเนื่อง',
          })
          get().logHistory(caseNo, `ไม่อนุมัติการถอนตัวโดย ${actor}`, actor, note)
          return
        }

        if (role === 'supervisor') {
          get().updateCase(caseNo, {
            withdrawalRequest: { ...current.withdrawalRequest, approvalStage: 'director' },
            status: 'พยานขอถอนตัว · รอ ผอ.สำนัก/กอง อนุมัติ',
            owner: ACTOR.director,
            next: 'ผอ.สำนัก/กอง พิจารณาอนุมัติการถอนตัวของพยาน',
          })
          get().logHistory(caseNo, 'ผู้บังคับบัญชาชั้นต้นเห็นชอบการถอนตัว', actor, note)
          return
        }

        get().updateCase(caseNo, {
          withdrawalRequest: {
            ...current.withdrawalRequest,
            status: 'approved',
            approvalStage: 'done',
            decidedAt: at,
            decidedBy: actor,
            decisionNote: note,
          },
          stage: 'withdrawn',
          status: 'พยานถอนตัวจากการคุ้มครองแล้ว',
          owner: protectionResponsibleName(current),
          next: 'แจ้งยกเลิกมาตรการต่อหน่วยงานที่เกี่ยวข้อง และปิดแฟ้ม',
          closedAt: at,
          activity7Label: 'พยานถอนตัวจากการคุ้มครอง',
        })
        get().logHistory(caseNo, 'ผอ.สำนัก/กอง อนุมัติการถอนตัวของพยาน', actor, note)
      },

      // ---------- ขั้นรับเรื่อง (02) : กลั่นกรองความเร่งด่วนก่อนจัดทำแบบ คบ. ----------
      /**
       * WIT0207-0208 — เจ้าหน้าที่ ป.ป.ท. ที่รับเรื่องเป็นผู้กลั่นกรอง (ธุรการไม่ต้องทำ ตาม E09)
       * ผลที่บันทึกไว้จะทำให้ขั้นที่ 3 ข้ามการประเมินซ้ำได้ (WIT0309 "มีผลแล้ว")
       */
      screenUrgencyAtIntake: (caseNo, urgency, note, actor) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const isUrgent = urgency === 'urgent'
        get().updateCase(caseNo, {
          urgency,
          urgent: isUrgent,
          urgencyAssessedAt: nowDisplay(),
          urgencyAssessedBy: actor,
          urgencyAssessmentNote: note,
          risk: isUrgent && current.risk === 'ยังไม่ประเมิน' ? 'วิกฤต' : current.risk,
        })
        get().logHistory(
          caseNo,
          isUrgent ? 'กลั่นกรองขั้นรับเรื่อง: เร่งด่วน' : 'กลั่นกรองขั้นรับเรื่อง: ไม่เร่งด่วน',
          actor,
          note || 'บันทึกผลกลั่นกรองความเร่งด่วนก่อนจัดทำแบบ คบ.'
        )
      },

      // ---------- Sheet 06 : เส้นทางเร่งด่วน คบ.4 / คบ.5 ----------
      /**
       * WIT0603 → WIT0604 — เจ้าหน้าที่ส่ง คบ.4 พร้อมร่าง คบ.5 ตรงถึง ผอ. โดยไม่ผ่าน ผบช.ชั้นต้น
       * ชุดวิธีตามข้อ 15 ที่เลือกไว้ถูกเก็บลงแฟ้มตรงนี้ จึงเป็นข้อมูลที่ระบบใช้ต่อได้จริง
       * ไม่ใช่แค่ตัวหนังสือบนเอกสาร · ใช้ซ้ำเป็น WIT0608 เมื่อส่งฉบับแก้ไขกลับขึ้นตรวจใหม่
       */
      submitFastTrackForDecision: (caseNo, methods, note, duration) => {
        const current = get().getCase(caseNo)
        if (!current) return

        /**
         * WIT0603 — ช่วงเวลาคุ้มครองชั่วคราวกินโควตาเดียวกับคำร้องหลัก
         * เกินเพดานรวม 6 เดือนตั้งแต่ขั้นร่างแล้วส่งขึ้น ผอ. ไม่ได้
         */
        const durationCheck = checkTemporaryDuration(
          current.episode || deriveEpisode(current),
          duration?.days ?? current.fastTrack?.temporaryDurationDays ?? 0
        )
        if (!durationCheck.allowed) return

        const at = nowDisplay()
        const unique = Array.from(new Set(methods)).sort() as ProtectionMethodNo[]
        const previous = current.fastTrack
        const isRework = previous?.step === 'returned'
        const actor = protectionResponsibleName(current)

        const fastTrack: FastTrackState = {
          ...previous,
          step: 'director_review',
          proposedMethods: unique,
          temporaryDurationDays: duration?.days ?? previous?.temporaryDurationDays,
          temporaryStartDate: duration?.startDate ?? previous?.temporaryStartDate,
          submittedAt: at,
          submittedBy: actor,
          submitNote: note,
          returnRound: previous?.returnRound || 0,
          /** ประตู WIT0606 ต้องถูกตัดสินใหม่ทุกรอบที่เอกสารเปลี่ยน */
          readinessCheckedAt: undefined,
          readinessCheckedBy: undefined,
        }

        get().updateCase(caseNo, {
          fastTrack,
          stage: 'director_review',
          status: isRework ? 'รอ ผอ.สำนัก/กอง ตรวจ คบ.4 / ร่าง คบ.5 ฉบับแก้ไข' : 'รอ ผอ.สำนัก/กองพิจารณา (เร่งด่วน)',
          owner: ACTOR.director,
          next: 'ผอ.สำนัก/กอง ตรวจ คบ.4 ร่าง คบ.5 หลักฐาน ระดับภัย และพิจารณาออกคำสั่งคุ้มครองชั่วคราว คบ.5',
          fastTracked: true,
          /** ธงตีกลับของรอบก่อนถูกเคลียร์เมื่อส่งฉบับแก้ไขขึ้นไปแล้ว */
          returned: false,
          returnedBy: undefined,
          returnIssueLabel: undefined,
          returnNote: undefined,
          returnedByRole: undefined,
          directorReturn: false,
        })
        get().logHistory(
          caseNo,
          isRework
            ? 'ส่ง คบ.4 / ร่าง คบ.5 ฉบับแก้ไขให้ ผอ. ตรวจใหม่'
            : 'เสนอ คบ.4 และร่าง คบ.5 ตรงถึง ผอ.สำนัก/กอง',
          actor,
          `${note || 'จัดทำ คบ.4 และร่างคำสั่ง คบ.5 ครบถ้วนแล้ว'} · วิธีคุ้มครองที่เสนอ: วิธีที่ ${unique.join(
            ', '
          )} · ระยะเวลาคุ้มครองชั่วคราวที่เสนอ ${fastTrack.temporaryDurationDays} วัน (คงเหลือจากเพดานรวม ${
            durationCheck.remaining
          } วัน) (ส่งตรง ผอ. โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น)`
        )
      },

      /**
       * WIT0606 แขนง "ครบ" — ประตูด่านแรกของ sheet 06
       * แยกออกจากการอนุมัติที่ WIT0609 โดยเจตนา: ตรวจความพร้อมของเอกสารก่อน แล้วจึงตัดสินเนื้อเรื่อง
       */
      confirmFastTrackReadiness: (caseNo, note) => {
        const current = get().getCase(caseNo)
        if (!current?.fastTrack || current.fastTrack.step !== 'director_review') return

        const at = nowDisplay()
        get().updateCase(caseNo, {
          fastTrack: { ...current.fastTrack, readinessCheckedAt: at, readinessCheckedBy: ACTOR.director },
          status: 'ข้อมูลครบ · รอ ผอ. ตัดสินอนุมัติคุ้มครองชั่วคราว',
          next: 'ผอ.สำนัก/กอง พิจารณาอนุมัติหรือไม่อนุมัติการคุ้มครองชั่วคราวตามคำสั่ง คบ.5',
        })
        get().logHistory(
          caseNo,
          'ตรวจ คบ.4 / ร่าง คบ.5 แล้ว — ข้อมูลครบและพร้อมพิจารณา',
          ACTOR.director,
          `${note || 'เอกสาร หลักฐาน ระดับภัย และมาตรการคุ้มครองชั่วคราวครบถ้วน'}`
        )
      },

      /**
       * WIT0606 แขนง "ไม่ครบ" → WIT0607 — ตีกลับของเส้นทางเร่งด่วน
       * ใช้กลไกเดียวกับ WIT0510 (ส่งกลับตรงเจ้าหน้าที่ ไม่ผ่าน ผบช.ชั้นต้น) แต่คนละชุดเอกสาร
       * งานกลับไปอยู่ที่ WIT0608 และวนกลับเข้า WIT0605 เมื่อแก้เสร็จ
       */
      returnFastTrackForRework: (caseNo, issueLabel, note) => {
        const current = get().getCase(caseNo)
        if (!current?.fastTrack) return

        const at = nowDisplay()
        const officer = protectionResponsibleName(current)
        const history = current.assignmentHistory || []

        get().updateCase(caseNo, {
          fastTrack: {
            ...current.fastTrack,
            step: 'returned',
            returnIssueLabel: issueLabel,
            returnNote: note,
            returnedAt: at,
            returnRound: (current.fastTrack.returnRound || 0) + 1,
            readinessCheckedAt: undefined,
            readinessCheckedBy: undefined,
          },
          stage: 'staff_review',
          status: 'ส่งกลับแก้ไข คบ.4 / ร่าง คบ.5 (เร่งด่วน)',
          owner: officer,
          next: `แก้ไข คบ.4 / ร่าง คบ.5 ตามข้อสั่งการ: ${issueLabel} แล้วส่ง ผอ. ตรวจใหม่`,
          returned: true,
          returnedBy: 'ผู้อำนวยการสำนัก/กอง',
          returnIssueLabel: issueLabel,
          returnNote: note,
          returnedByRole: 'director',
          directorReturn: true,
          assignmentHistory: [
            ...history,
            {
              at,
              action: 'ส่งกลับแก้ไข คบ.4 / ร่าง คบ.5 โดย ผอ.สำนัก/กอง',
              actor: ACTOR.director,
              detail: `${issueLabel}: ${note} (ส่งกลับตรงเจ้าหน้าที่ผู้รับผิดชอบ ไม่ผ่านผู้บังคับบัญชาชั้นต้น)`,
            },
          ],
        })
      },

      /**
       * WIT0609 แขนง "อนุมัติ" → WIT0611 — จุดชี้ขาดของเส้นทางเร่งด่วนทั้งเส้น
       * ตรงนี้คือจุดเดียวในระบบที่เขียนค่า kb5Approved ซึ่งหน้าอื่น (08A ฝั่งเร่งด่วน, การนับวัน
       * ช่วง TEMPORARY) รออ่านอยู่ · ยังไม่เปิดเส้นทางปฏิบัติ เพราะผังให้พยานรับทราบก่อนที่ WIT0612
       */
      approveTemporaryProtection: (caseNo, input) => {
        const current = get().getCase(caseNo)
        if (!current?.fastTrack) return

        const at = nowDisplay()
        const signer = input.signerName || ACTOR.director
        const methods = current.fastTrack.proposedMethods || []

        get().updateCase(caseNo, {
          fastTrack: {
            ...current.fastTrack,
            step: 'approved',
            decidedAt: at,
            decidedBy: signer,
            directorOpinion: input.opinion,
            kb5OrderNo: input.orderNo,
            kb5SignedAt: at,
            kb5SignedBy: signer,
          },
          kb5Approved: true,
          hasKb5: true,
          /**
           * TC-019 (BUG-004) — ผอ. ตัดสินแล้ว แฟ้มกลับเจ้าหน้าที่ทันที (เหมือนกรณีไม่อนุมัติ) เพื่อแจ้งพยาน
           * แล้วคำร้องหลักเดินแท็บ 05 ตามลำดับ ห้ามค้างที่ขั้น ผอ. แล้วลงนาม คบ.6 ข้าม ผบช.ชั้นต้น
           */
          stage: 'staff_review',
          status: 'อนุมัติคุ้มครองชั่วคราว · ลงนามคำสั่ง คบ.5 แล้ว',
          owner: protectionResponsibleName(current),
          next: 'แจ้งคำสั่ง คบ.5 ให้พยานรับทราบและลงนามยินยอมรับการคุ้มครองชั่วคราว',
        })
        get().logHistory(
          caseNo,
          'อนุมัติคุ้มครองชั่วคราวและลงนามคำสั่ง คบ.5',
          signer,
          `คำสั่งที่ ${input.orderNo} · วิธีที่อนุมัติ: วิธีที่ ${methods.join(', ')} · ความเห็นข้อ 13 ของ คบ.4: ${input.opinion} (ระบบล็อกฉบับลงนาม ห้ามแก้ทับ)`
        )
        get().logHistory(
          caseNo,
          'คำร้องหลักยังเดินต่อควบคู่กับคำสั่งชั่วคราว',
          signer,
          'จัดทำ/เสนอ คบ.6 ในขั้นกลั่นกรอง แล้วรอผลพิจารณาและคำสั่งตามปกติ'
        )
      },

      /**
       * WIT0609 แขนง "ไม่อนุมัติ" → WIT0610 — กรณีที่เข้าใจผิดง่ายที่สุดในผังทั้งหมด
       * "ไม่อนุมัติ" ตรงนี้คือไม่อนุมัติ *เฉพาะการคุ้มครองชั่วคราว* ไม่ใช่การไม่อนุมัติคำร้องหลัก
       * จึงห้ามแตะ activity7State และห้ามออก คบ.10 — ยังไม่เกิดสิทธิอุทธรณ์ในขั้นนี้
       */
      denyTemporaryProtection: (caseNo, reason) => {
        const current = get().getCase(caseNo)
        if (!current?.fastTrack) return

        const at = nowDisplay()
        const officer = protectionResponsibleName(current)

        get().updateCase(caseNo, {
          fastTrack: { ...current.fastTrack, step: 'denied', decidedAt: at, decidedBy: ACTOR.director },
          temporaryDeniedAt: at,
          temporaryDeniedReason: reason,
          kb5Approved: false,
          stage: 'staff_review',
          status: 'ไม่อนุมัติคุ้มครองชั่วคราว · คำร้องหลักยังเดินต่อ',
          owner: officer,
          next: 'จัดทำ/เสนอ คบ.6 ตามเส้นทางคำร้องหลักในขั้นกลั่นกรอง แล้วรอผลพิจารณาและคำสั่งตามปกติ',
        })
        get().logHistory(
          caseNo,
          'ไม่อนุมัติการคุ้มครองชั่วคราว (เฉพาะ คบ.5)',
          ACTOR.director,
          `${reason} (ไม่ปิดคำร้องหลัก และไม่ออก คบ.10 ในขั้นนี้ จึงยังไม่เกิดสิทธิอุทธรณ์)`
        )
        get().logHistory(
          caseNo,
          'คำร้องหลักยังเดินต่อ',
          ACTOR.director,
          'จัดทำ/เสนอ คบ.6 ในขั้นกลั่นกรอง แล้วรอผลพิจารณาและคำสั่งตามปกติ'
        )
      },

      /**
       * WIT0612 → WIT0613 — พยานรับทราบคำสั่ง คบ.5 และลงนามยินยอม
       * ความยินยอมอ้างอิง คบ.5 ใช้แทน คบ.11 ของเส้นทางปกติ แล้วจึงส่งวิธีที่อนุมัติไปเปิด
       * เส้นทางปฏิบัติที่แท็บ 08 · ช่วง TEMPORARY เริ่มนับเมื่อวิธีแรกเริ่มปฏิบัติจริง (setMethodStatus)
       */
      acknowledgeKb5Order: (caseNo, witnessName) => {
        const current = get().getCase(caseNo)
        if (!current?.fastTrack || current.fastTrack.step !== 'approved') return

        const at = nowDisplay()
        const methods = (current.fastTrack.proposedMethods || []) as ProtectionMethodNo[]

        get().recordConsent(caseNo, { ref: 'kb5', consented: true, by: witnessName })
        get().updateCase(caseNo, {
          fastTrack: { ...current.fastTrack, step: 'active', witnessAckAt: at, witnessAckBy: witnessName },
        })
        get().logHistory(
          caseNo,
          'พยานรับทราบคำสั่ง คบ.5 และลงนามยินยอมรับการคุ้มครองชั่วคราว',
          witnessName,
          `คำสั่งที่ ${current.fastTrack.kb5OrderNo || '-'}`
        )

        if (methods.length > 0) {
          get().setApprovedMethods(caseNo, methods, protectionResponsibleName(current))
          get().logHistory(
            caseNo,
            'ส่งวิธีที่อนุมัติตามคำสั่ง คบ.5 ไปดำเนินการตามวิธีคุ้มครอง',
            protectionResponsibleName(current),
            `วิธีที่ ${methods.join(', ')} · เริ่มนับระยะเวลาคุ้มครองช่วงชั่วคราวเมื่อวิธีแรกเริ่มปฏิบัติจริง`
          )
        }

        /**
         * WIT0614 — เรื่องชั่วคราวเดินไปแท็บ 08 แล้ว แต่คำร้องหลักต้องเดินคู่ขนานต่อเสมอ
         * `setApprovedMethods` ดัน stage ไป 'method_operation' ตามเส้นทางคำร้องหลักที่อนุมัติแล้ว
         * ซึ่งใช้กับเคสเร่งด่วนไม่ได้ เพราะ คบ.6 ยังไม่เคยถูกจัดทำ/เสนอเลย
         * จึงคืนคำร้องหลักกลับมาที่เจ้าหน้าที่ผู้รับผิดชอบเพื่อทำ คบ.6 ต่อที่แท็บ 05
         */
        const afterMethods = get().getCase(caseNo)
        if (afterMethods && !afterMethods.kb11Signed && afterMethods.activity7State !== 'approved') {
          const officer = protectionResponsibleName(afterMethods)
          get().updateCase(caseNo, {
            stage: 'staff_review',
            owner: officer,
            status: 'คุ้มครองชั่วคราวตาม คบ.5 มีผลแล้ว · คำร้องหลักรอจัดทำ/เสนอ คบ.6',
            next: 'จัดทำ/เสนอ คบ.6 ในขั้นกลั่นกรอง แล้วรอผลพิจารณาและคำสั่งตามปกติ ควบคู่กับการคุ้มครองชั่วคราวที่เดินอยู่',
          })
          get().logHistory(
            caseNo,
            'คืนคำร้องหลักให้เจ้าหน้าที่จัดทำ คบ.6 ต่อ',
            officer,
            'คุ้มครองชั่วคราว (TEMPORARY) ดำเนินการตามวิธีคุ้มครองควบคู่กัน — คำร้องหลักไม่ถูกข้ามไปขั้นปฏิบัติการ'
          )
        }
      },

      // ---------- 08A : ความยินยอมและการแยกวิธีที่อนุมัติ ----------
      /** WIT0612 / WIT0809-0812 — ไม่ยินยอมแล้วห้ามเริ่มวิธีนั้น ต้องเสนอทบทวน เปลี่ยนวิธี หรือยุติ */
      recordConsent: (caseNo, record) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        const entry: ConsentRecord = { ...record, at: nowDisplay() }
        const patch: Partial<CaseItem> = { consents: [...(current.consents || []), entry] }

        if (entry.ref === 'kb11' && entry.consented) {
          const forms = useFormDraftStore.getState()
          const signatures = forms.draftCaseNo[11] === caseNo ? forms.signatures : forms.caseDrafts[caseNo]?.signatures || {}
          if (!kb11Gate(current).unlocked || !KB11_SIGN_SLOTS.every((slot) => signatures[slot.key]?.signed)) return
        }
        if (entry.ref === 'kb11') patch.kb11Signed = entry.consented

        if (!entry.consented) {
          /** ล็อกทุกวิธีที่ยังไม่เริ่ม ไม่ให้เดินต่อจนกว่าจะมีการทบทวน */
          patch.methodTracks = (current.methodTracks || []).map((t) =>
            t.status === 'active' || t.status === 'ended'
              ? t
              : { ...t, status: 'blocked' as ProtectionMethodStatus, blockedReason: entry.reason || 'พยานไม่ยินยอม' }
          )
          patch.status = 'พยานไม่ยินยอมตามข้อตกลง · รอทบทวนแนวทาง'
          patch.owner = protectionResponsibleName(current)
          patch.next =
            entry.proposedAction === 'terminate'
              ? 'เสนอยุติการคุ้มครองตามลำดับชั้น (คบ.15)'
              : entry.proposedAction === 'change_method'
                ? 'เสนอเปลี่ยนวิธีคุ้มครองและปรับ คบ.11 ตามลำดับชั้น'
                : 'เสนอทบทวนแนวทางคุ้มครองผ่านลำดับผู้บังคับบัญชา'
        }

        get().updateCase(caseNo, patch)
        get().logHistory(
          caseNo,
          entry.consented
            ? `พยานลงนามยินยอมตาม ${entry.ref === 'kb11' ? 'คบ.11' : 'คบ.5'}`
            : `พยานไม่ยินยอมตาม ${entry.ref === 'kb11' ? 'คบ.11' : 'คบ.5'} · ห้ามเริ่มวิธีที่ยังไม่ปฏิบัติ`,
          entry.by,
          entry.reason || entry.evidence || '-'
        )
      },

      /**
       * WIT0812 — ไม่ยินยอม: บันทึกเหตุและหลักฐาน ห้ามเริ่มวิธีนั้น
       * แล้ว "เสนอทบทวน เปลี่ยนวิธี หรือยุติ ผ่านลำดับผู้บังคับบัญชา"
       *
       * ผังให้เลือกได้สามแนวทาง จึงไม่ล็อกเป็น "ทบทวน" ตายตัว และการเสนอต้องเกิดเป็น
       * งานจริงในคิวของ ผบช.ชั้นต้น → ผอ.สำนัก/กอง ไม่ใช่จบที่การบันทึกในแฟ้ม
       */
      declineConsent: (caseNo, input, actor) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        const by = actor || protectionResponsibleName(current)

        /** ครึ่งแรกของ node — บันทึกการไม่ยินยอมและระงับวิธีที่ยังไม่เริ่ม */
        get().recordConsent(caseNo, {
          ref: input.ref,
          consented: false,
          by: input.by,
          reason: input.reason,
          evidence: input.evidence,
          proposedAction: input.proposedAction,
        })

        const proposal: ConsentDeclineProposal = {
          id: `CD-${Date.now()}`,
          ref: input.ref,
          reason: input.reason,
          evidence: input.evidence,
          proposedAction: input.proposedAction,
          proposedMethods:
            input.proposedAction === 'change_method' ? input.proposedMethods || [] : undefined,
          createdAt: nowDisplay(),
          createdBy: by,
          stage: 'supervisor',
        }

        const after = get().getCase(caseNo)
        get().updateCase(caseNo, {
          consentDeclineProposals: [...(after?.consentDeclineProposals || []), proposal],
          status: `พยานไม่ยินยอม · เสนอ${CONSENT_DECLINE_LABEL[input.proposedAction]}ตามลำดับชั้น`,
          owner: ACTOR.supervisor,
          next: `ผบช.ชั้นต้นพิจารณาข้อเสนอ: ${CONSENT_DECLINE_LABEL[input.proposedAction]}`,
        })
        get().logHistory(
          caseNo,
          `เสนอแนวทางหลังพยานไม่ยินยอม: ${CONSENT_DECLINE_LABEL[input.proposedAction]}`,
          by,
          `${input.reason}${
            proposal.proposedMethods?.length
              ? ` · วิธีที่เสนอใหม่: ${proposal.proposedMethods.map((m) => `วิธีที่ ${m}`).join(' ')}`
              : ''
          } · เสนอผ่าน ผบช.ชั้นต้น → ผอ.สำนัก/กอง`
        )
      },

      /** WIT0812 — ด่านพิจารณาตามลำดับชั้น · อนุมัติครบชั้นแล้วจึงพาแฟ้มไปตามแนวทางที่เลือก */
      reviewConsentDecline: (caseNo, proposalId, level, endorse, note) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const target = (current.consentDeclineProposals || []).find((r) => r.id === proposalId)
        if (!target || target.stage !== level) return
        const at = nowDisplay()
        const by = level === 'supervisor' ? ACTOR.supervisor : ACTOR.director
        const roleLabel = level === 'supervisor' ? 'ผบช.ชั้นต้น' : 'ผอ.สำนัก/กอง'

        const nextStage: ConsentDeclineProposal['stage'] = !endorse
          ? 'returned'
          : level === 'supervisor'
            ? 'director'
            : 'approved'

        const updated: ConsentDeclineProposal = {
          ...target,
          stage: nextStage,
          ...(level === 'supervisor'
            ? { supervisorAt: at, supervisorBy: by, supervisorNote: note }
            : { directorAt: at, directorBy: by, directorNote: note }),
          ...(endorse ? {} : { returnedAt: at, returnedBy: by, returnNote: note }),
        }
        const proposals = (current.consentDeclineProposals || []).map((r) => (r.id === proposalId ? updated : r))

        if (!endorse) {
          get().updateCase(caseNo, {
            consentDeclineProposals: proposals,
            owner: protectionResponsibleName(current),
            status: `ส่งคืนแก้ไขข้อเสนอแนวทางหลังพยานไม่ยินยอม (${roleLabel})`,
            next: 'ทบทวนเหตุผลตามข้อสั่งการ แล้วเสนอแนวทางใหม่ตามลำดับชั้น',
          })
          get().logHistory(caseNo, `${roleLabel}ส่งคืนแก้ไขข้อเสนอแนวทางหลังพยานไม่ยินยอม`, by, note || '-')
          return
        }

        if (nextStage === 'director') {
          get().updateCase(caseNo, {
            consentDeclineProposals: proposals,
            owner: ACTOR.director,
            status: `ผบช.ชั้นต้นเห็นชอบ · รอ ผอ. อนุมัติแนวทาง${CONSENT_DECLINE_LABEL[target.proposedAction]}`,
            next: `ผอ.สำนัก/กอง พิจารณาอนุมัติแนวทาง: ${CONSENT_DECLINE_LABEL[target.proposedAction]}`,
          })
          get().logHistory(caseNo, 'ผบช.ชั้นต้นเห็นชอบข้อเสนอแนวทางหลังพยานไม่ยินยอม', by, note || '-')
          return
        }

        /** ผอ. อนุมัติแล้ว — แนวทางที่เลือกต้องพาแฟ้มไปต่อจริง ไม่ใช่จบที่ป้ายสถานะ */
        const applied = proposals.map((r) => (r.id === proposalId ? { ...r, appliedAt: at } : r))
        get().updateCase(caseNo, { consentDeclineProposals: applied })
        get().logHistory(
          caseNo,
          `ผอ.สำนัก/กอง อนุมัติแนวทางหลังพยานไม่ยินยอม: ${CONSENT_DECLINE_LABEL[target.proposedAction]}`,
          by,
          note || '-'
        )

        const officer = protectionResponsibleName(current)
        if (target.proposedAction === 'review') {
          /** ทบทวน — เข้าแท็บ 11A ผ่านทางเข้าเดียวกับ WIT1013 */
          get().sendToProtectionReview(
            caseNo,
            `พยานไม่ยินยอมตาม ${target.ref === 'kb11' ? 'คบ.11' : 'คบ.5'} · ${target.reason}`,
            officer
          )
          get().updateCase(caseNo, {
            owner: officer,
            status: 'อนุมัติให้ทบทวนแนวทางคุ้มครอง (หลังพยานไม่ยินยอม)',
          })
          return
        }

        if (target.proposedAction === 'change_method') {
          /**
           * เปลี่ยนวิธี — เปิดชุดวิธีใหม่ตามที่อนุมัติ แล้วย้อนกลับไปขอความยินยอมตาม คบ.11 ที่ปรับแล้ว
           * ความยินยอมเดิมใช้ต่อไม่ได้ เพราะ คบ.11 เปลี่ยนวิธีไปจากฉบับที่พยานปฏิเสธ
           */
          const methods = target.proposedMethods?.length ? target.proposedMethods : current.approvedMethods || []
          get().updateCase(caseNo, { approvedMethods: [], methodTracks: [], kb11Signed: false })
          if (methods.length > 0) get().setApprovedMethods(caseNo, methods, officer)
          get().updateCase(caseNo, {
            owner: officer,
            status: 'อนุมัติให้เปลี่ยนวิธีคุ้มครอง · รอปรับ คบ.11 และขอความยินยอมใหม่',
            next: `ปรับ คบ.11 เป็นวิธีที่ ${methods.join(', ') || '-'} แล้วชี้แจงและขอความยินยอมจากพยานอีกครั้ง`,
          })
          get().logHistory(
            caseNo,
            'เปิดชุดวิธีคุ้มครองใหม่ตามแนวทางที่อนุมัติ',
            officer,
            `วิธีที่ ${methods.join(', ') || '-'} · ความยินยอมตาม คบ.11 ถูกล้าง ต้องชี้แจงและลงนามใหม่`
          )
          return
        }

        /** ยุติ — เข้าเส้นทาง 11C ด้วยเหตุยุติที่บันทึกไว้ ไม่ใช่แค่เปลี่ยนป้ายสถานะ */
        get().recordTerminationTrigger(
          caseNo,
          {
            source: 'due_or_officer',
            detail: `พยานไม่ยินยอมตาม ${target.ref === 'kb11' ? 'คบ.11' : 'คบ.5'} · ${target.reason}`,
            ref: target.id,
          },
          officer
        )
        get().updateCase(caseNo, {
          stage: 'termination_review',
          owner: officer,
          status: 'อนุมัติให้ยุติการคุ้มครอง (หลังพยานไม่ยินยอม)',
          next: 'จัดทำ คบ.15 รายงานการให้ความคุ้มครองสิ้นสุด แล้วเสนอตามลำดับชั้น',
        })
      },

      /**
       * WIT0860 แขนง — กรมคุ้มครองสิทธิและเสรีภาพแจ้งว่าดำเนินการตามข้อ 14 ไม่ได้
       *
       * ครึ่งหลังของ node คือ "เสนอผู้มีอำนาจทันที ไม่ปล่อยให้คุ้มครองขาดช่วง" จึงต้องเกิดเป็นงานจริง
       * ในคิวของ ผบช.ชั้นต้น → ผอ.สำนัก/กอง (ลำดับเดียวกับ WIT0812 / WIT0845)
       * ระหว่างรอพิจารณา วิธีคุ้มครองเดิมของ ป.ป.ท. ยังคงเดินต่อ ไม่ถูกยุติ
       */
      recordArticle14DeliveryFailure: (caseNo, input, actor) => {
        const current = get().getCase(caseNo)
        if (!current || !current.article14) return
        const by = actor || protectionResponsibleName(current)
        const at = nowDisplay()

        const proposal: Article14EscalationProposal = {
          id: `A14E-${Date.now()}`,
          failedAgency: ARTICLE14_TARGET_AGENCY,
          failedReason: input.failedReason,
          proposedApproach: input.proposedApproach,
          note: input.note,
          createdAt: at,
          createdBy: by,
          stage: 'supervisor',
        }

        get().updateCase(caseNo, {
          article14: { ...current.article14, step: 'delivery_failed' },
          article14EscalationProposals: [...(current.article14EscalationProposals || []), proposal],
          owner: ACTOR.supervisor,
          status: `${ARTICLE14_TARGET_AGENCY} แจ้งว่าดำเนินการไม่ได้ · เสนอผู้มีอำนาจพิจารณาแนวทางใหม่`,
          next: `ผบช.ชั้นต้นพิจารณาแนวทางใหม่: ${input.proposedApproach} — มาตรการคุ้มครองเดิมยังคงอยู่ระหว่างพิจารณา`,
        })
        get().logHistory(
          caseNo,
          `${ARTICLE14_TARGET_AGENCY} แจ้งว่าดำเนินการคุ้มครองไม่ได้`,
          by,
          `${input.failedReason} · เสนอแนวทาง: ${input.proposedApproach}${input.note ? ` · ${input.note}` : ''}`
        )
      },

      /** WIT0860 แขนง — ด่านพิจารณาตามลำดับชั้นของแนวทางใหม่หลังกรมดำเนินการไม่ได้ */
      reviewArticle14Escalation: (caseNo, proposalId, level, endorse, note) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const target = (current.article14EscalationProposals || []).find((r) => r.id === proposalId)
        if (!target || target.stage !== level) return
        const at = nowDisplay()
        const by = level === 'supervisor' ? ACTOR.supervisor : ACTOR.director
        const roleLabel = level === 'supervisor' ? 'ผบช.ชั้นต้น' : 'ผอ.สำนัก/กอง'
        const officer = protectionResponsibleName(current)

        const nextStage: Article14EscalationProposal['stage'] = !endorse
          ? 'returned'
          : level === 'supervisor'
            ? 'director'
            : 'approved'

        const updated: Article14EscalationProposal = {
          ...target,
          stage: nextStage,
          ...(level === 'supervisor'
            ? { supervisorAt: at, supervisorBy: by, supervisorNote: note }
            : { directorAt: at, directorBy: by, directorNote: note }),
          ...(endorse ? {} : { returnedAt: at, returnedBy: by, returnNote: note }),
          ...(nextStage === 'approved' ? { appliedAt: at } : {}),
        }
        const proposals = (current.article14EscalationProposals || []).map((r) =>
          r.id === proposalId ? updated : r
        )

        if (!endorse) {
          get().updateCase(caseNo, {
            article14EscalationProposals: proposals,
            owner: officer,
            status: `ส่งคืนแก้ไขแนวทางหลังกรมดำเนินการไม่ได้ (${roleLabel})`,
            next: 'ทบทวนแนวทางตามข้อสั่งการ แล้วเสนอใหม่ตามลำดับชั้น',
          })
          get().logHistory(caseNo, `${roleLabel}ส่งคืนแก้ไขแนวทางหลังกรมคุ้มครองสิทธิฯ ดำเนินการไม่ได้`, by, note || '-')
          return
        }

        if (nextStage === 'director') {
          get().updateCase(caseNo, {
            article14EscalationProposals: proposals,
            owner: ACTOR.director,
            status: `ผบช.ชั้นต้นเห็นชอบ · รอ ผอ. อนุมัติแนวทาง: ${target.proposedApproach}`,
            next: `ผอ.สำนัก/กอง พิจารณาอนุมัติแนวทางใหม่: ${target.proposedApproach}`,
          })
          get().logHistory(caseNo, 'ผบช.ชั้นต้นเห็นชอบแนวทางหลังกรมดำเนินการไม่ได้', by, note || '-')
          return
        }

        get().updateCase(caseNo, {
          article14EscalationProposals: proposals,
          owner: officer,
          status: `อนุมัติแนวทางใหม่หลังกรมดำเนินการไม่ได้: ${target.proposedApproach}`,
          next: `ดำเนินการตามแนวทางที่อนุมัติ: ${target.proposedApproach} — การคุ้มครองเดิมยังไม่ขาดช่วง`,
        })
        get().logHistory(caseNo, 'ผอ.สำนัก/กอง อนุมัติแนวทางหลังกรมดำเนินการไม่ได้', by, note || '-')
      },

      /**
       * WIT0845 — ปฏิเสธ: "บันทึกหนังสือและเหตุผล" + "เสนอผู้มีอำนาจพิจารณาหน่วยงานหรือแนวทางใหม่"
       *
       * ครึ่งหลังของ node เดิมเป็นเพียง toast ที่เด้งแล้วหายไป จึงไม่มีใครถูกมอบหมายให้หาหน่วยงานใหม่
       * ที่นี่จึงสร้างงานจริงในคิวของ ผบช.ชั้นต้น แล้วเดินต่อถึง ผอ.สำนัก/กอง ตามลำดับชั้นเดียวกับ WIT0812
       */
      proposeCoordinationAgency: (caseNo, input, actor) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        const by = actor || protectionResponsibleName(current)

        const proposal: CoordinationDeclineProposal = {
          id: `CO-${Date.now()}`,
          declinedAgency: input.declinedAgency,
          declinedReason: input.declinedReason,
          proposedAgency: input.proposedAgency,
          note: input.note,
          createdAt: nowDisplay(),
          createdBy: by,
          stage: 'supervisor',
        }

        get().updateCase(caseNo, {
          coordinationProposals: [...(current.coordinationProposals || []), proposal],
          status: `หน่วยงานปฏิเสธ · เสนอประสาน ${input.proposedAgency} แทน`,
          owner: ACTOR.supervisor,
          next: `ผบช.ชั้นต้นพิจารณาข้อเสนอหน่วยงานใหม่: ${input.proposedAgency}`,
        })
        get().logHistory(
          caseNo,
          `เสนอหน่วยงานใหม่หลัง ${input.declinedAgency} ปฏิเสธ`,
          by,
          `${input.proposedAgency}${input.note ? ` · ${input.note}` : ''} · เสนอผ่าน ผบช.ชั้นต้น → ผอ.สำนัก/กอง`
        )
      },

      /** WIT0845 — ด่านพิจารณาตามลำดับชั้น · ผอ. อนุมัติแล้ววิธีที่ 4 กลับมาเดินต่อกับหน่วยงานใหม่ */
      reviewCoordinationProposal: (caseNo, proposalId, level, endorse, note) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const target = (current.coordinationProposals || []).find((r) => r.id === proposalId)
        if (!target || target.stage !== level) return
        const at = nowDisplay()
        const by = level === 'supervisor' ? ACTOR.supervisor : ACTOR.director
        const roleLabel = level === 'supervisor' ? 'ผบช.ชั้นต้น' : 'ผอ.สำนัก/กอง'

        const nextStage: CoordinationDeclineProposal['stage'] = !endorse
          ? 'returned'
          : level === 'supervisor'
            ? 'director'
            : 'approved'

        const updated: CoordinationDeclineProposal = {
          ...target,
          stage: nextStage,
          ...(level === 'supervisor'
            ? { supervisorAt: at, supervisorBy: by, supervisorNote: note }
            : { directorAt: at, directorBy: by, directorNote: note }),
          ...(endorse ? {} : { returnedAt: at, returnedBy: by, returnNote: note }),
        }
        const proposals = (current.coordinationProposals || []).map((r) => (r.id === proposalId ? updated : r))
        const officer = protectionResponsibleName(current)

        if (!endorse) {
          get().updateCase(caseNo, {
            coordinationProposals: proposals,
            owner: officer,
            status: `ส่งคืนแก้ไขข้อเสนอหน่วยงานใหม่ (${roleLabel})`,
            next: 'ทบทวนหน่วยงานที่จะประสานตามข้อสั่งการ แล้วเสนอใหม่ตามลำดับชั้น',
          })
          get().logHistory(caseNo, `${roleLabel}ส่งคืนแก้ไขข้อเสนอหน่วยงานใหม่`, by, note || '-')
          return
        }

        if (nextStage === 'director') {
          get().updateCase(caseNo, {
            coordinationProposals: proposals,
            owner: ACTOR.director,
            status: `ผบช.ชั้นต้นเห็นชอบ · รอ ผอ. อนุมัติประสาน ${target.proposedAgency}`,
            next: `ผอ.สำนัก/กอง พิจารณาอนุมัติหน่วยงานใหม่: ${target.proposedAgency}`,
          })
          get().logHistory(caseNo, 'ผบช.ชั้นต้นเห็นชอบข้อเสนอหน่วยงานใหม่', by, note || '-')
          return
        }

        /**
         * ผอ. อนุมัติแล้ว — วิธีที่ 4 ต้องกลับมาเดินได้จริงกับหน่วยงานใหม่ภายใต้คำสั่งเดิม
         * ล้างผลตอบกลับเดิมเพื่อให้เจ้าหน้าที่ทำหนังสือประสานขาออกฉบับใหม่ได้ (กลับ WIT0843)
         */
        const applied = proposals.map((r) => (r.id === proposalId ? { ...r, appliedAt: at } : r))
        const track = (current.methodTracks || []).find((t) => t.method === 4)
        get().updateCase(caseNo, { coordinationProposals: applied })
        if (track) {
          get().updateMethodTrack(caseNo, 4, {
            coordination: {
              ...(track.coordination || {}),
              agency: target.proposedAgency,
              responseStatus: 'awaiting',
              declinedReason: undefined,
              contactPerson: undefined,
              acceptedAt: undefined,
            },
          })
          get().setMethodStatus(caseNo, 4, 'preparing')
        }
        get().updateCase(caseNo, {
          owner: officer,
          status: `อนุมัติให้ประสาน ${target.proposedAgency} แทน`,
          next: `จัดทำหนังสือประสานขาออกถึง ${target.proposedAgency} แล้วรอหนังสือตอบกลับ`,
        })
        get().logHistory(
          caseNo,
          `ผอ.สำนัก/กอง อนุมัติหน่วยงานใหม่: ${target.proposedAgency}`,
          by,
          `${note || '-'} · วิธีที่ 4 กลับมาเดินต่อภายใต้คำสั่งเดิม`
        )
      },

      /**
       * WIT0848 — ส่งมอบจริงและลงนาม คบ.12 ของวิธีที่ 4
       *
       * แยกจาก requestTransfer/completeTransfer ของเส้นทางครบเพดาน 6 เดือน (แท็บ 11C) โดยตั้งใจ:
       * ที่นี่คำสั่งยังอยู่กับ ป.ป.ท. แฟ้มจึงต้องไม่เปลี่ยนเป็น "รอส่งมอบพยานให้ … (คบ.12)"
       */
      completeMethod4Handover: (caseNo, input) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        const track = (current.methodTracks || []).find((t) => t.method === 4)
        if (!track) return
        const by = input?.actor || protectionResponsibleName(current)
        const co = track.coordination || {}
        if (!method4ReplyRecorded(current)) return
        /**
         * WIT0847 — ส่งมอบจริงต้องมีฐานความยินยอมครบก่อนเสมอ
         * คบ.11 ลงนาม หรือความยินยอมใน คบ.5 กรณีเร่งด่วน — ขาดทั้งคู่ห้ามส่งมอบ
         */
        if (!current.kb11Signed && !hasConsent(current, 'kb5')) return
        /**
         * วันส่งมอบจริงแยกจากวันที่มาบันทึก/อัปโหลดเอกสาร — ระยะคุ้มครองนับจากวันส่งมอบจริง
         * (ส่งมอบ 5 ก.ย. แต่มาอัปโหลด คบ.12 วันที่ 9 ก.ย. ต้องนับจาก 5 ก.ย.)
         */
        const recordedAt = new Date().toISOString()
        const at = input?.handoverCompletedAt ? new Date(input.handoverCompletedAt).toISOString() : recordedAt
        get().updateMethodTrack(caseNo, 4, {
          coordination: {
            ...co,
            handoverCompletedAt: at,
            handoverRecordedAt: recordedAt,
            operationStartedAt: at,
          },
        })
        get().updateCase(caseNo, {
          status: `ส่งมอบพยานตามวิธีที่ 4 ให้ ${co.agency || '-'} แล้ว (คบ.12)`,
          next: `${co.agency || 'หน่วยงานผู้รับ'} ดำเนินการคุ้มครองตามวิธีและช่วงเวลาที่รับดำเนินการ — บันทึกวันเริ่มปฏิบัติจริง`,
        })
        get().logHistory(
          caseNo,
          'ส่งมอบจริงและลงนาม คบ.12 ตามวิธีที่ 4',
          by,
          `${co.agency || '-'} · คำสั่งเดิมยังอยู่กับ ป.ป.ท. ไม่ใช่การส่งมอบเมื่อครบเพดาน 6 เดือน`
        )
      },

      /** WIT0603 / WIT0813 — เลือกได้อิสระมากกว่า 1 วิธี และเปิดเส้นทางปฏิบัติพร้อมกันทุกวิธี */
      setApprovedMethods: (caseNo, methods, actor) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        if (current.appealKb6Version && current.activity7State !== 'approved') return
        if (current.activity7State === 'approved' && currentPhaseKind(current.episode || deriveEpisode(current)) !== 'TEMPORARY' && !current.kb5Approved && (!current.kb11Signed || !kb11Gate(current).unlocked)) return
        /**
         * WIT0813 — เปิดได้เฉพาะวิธีที่คำสั่ง/ผลอนุมัติระบุไว้ (orderedMethods)
         * เพิ่มวิธีใหม่เกินคำสั่งต้องผ่านข้อเสนอเปลี่ยนวิธี (WIT1110) ก่อนเท่านั้น
         * ไม่มี orderedMethods (สำนวนเก่า/คำสั่งไม่ได้ระบุ) ถือว่าไม่จำกัด
         */
        const ordered = current.orderedMethods
        const requested = Array.from(new Set(methods)).sort() as ProtectionMethodNo[]
        const unique =
          ordered && ordered.length > 0 ? requested.filter((m) => ordered.includes(m)) : requested
        if (unique.length === 0) return
        const existing = current.methodTracks || []
        const tracks: ProtectionMethodTrack[] = unique.map(
          (m) => existing.find((t) => t.method === m) || { method: m, status: 'pending' }
        )
        /**
         * WIT0817 — คบ.8 (คำสั่งมอบหมายชุดคุ้มครอง) เป็นเอกสารของวิธีที่ 1 เท่านั้น
         * จึงเพิ่มเข้าแฟ้ม ณ จุดนี้ ซึ่งเกิดหลังพยานลงนาม คบ.11 แล้ว (ดู Kb11SignatureActions)
         * วิธีที่ 2–4 ไม่มี คบ.8 ในแฟ้ม
         */
        const withKb8 = unique.includes(1)
        get().updateCase(caseNo, {
          approvedMethods: unique,
          methodTracks: tracks,
          stage: current.stage === 'protection' ? current.stage : 'method_operation',
          status: `เปิดเส้นทางปฏิบัติ ${unique.length} วิธีตามคำสั่ง`,
          owner: protectionResponsibleName(current),
          next: withKb8
            ? `ดำเนินการตามวิธีที่ ${unique.join(', ')} — วิธีที่ 1 จัดทำ คบ.8 เสนอเลขาธิการฯ ลงนามก่อนเริ่มปฏิบัติ`
            : `ดำเนินการตามวิธีที่ ${unique.join(', ')} — แต่ละวิธีเดินคู่ขนานได้`,
          ...(withKb8 ? { extraForms: Array.from(new Set([...(current.extraForms || []), 8])) } : {}),
        })
        get().logHistory(
          caseNo,
          'แยกแนวทางคุ้มครองตามวิธีที่อนุมัติ',
          actor || protectionResponsibleName(current),
          `วิธีที่ ${unique.join(', ')}`
        )
        if (withKb8) {
          get().logHistory(
            caseNo,
            'เปิดจัดทำ คบ.8 คำสั่งมอบหมายเจ้าพนักงานชุดคุ้มครอง',
            actor || protectionResponsibleName(current),
            'พยานลงนามยินยอมใน คบ.11 แล้ว และ คบ.6 เสนอวิธีที่ 1 — จัดทำร่าง คบ.8 เสนอเลขาธิการฯ ลงนาม'
          )
        }
      },

      updateMethodTrack: (caseNo, method, patch) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        const tracks = current.methodTracks || []
        const exists = tracks.some((t) => t.method === method)
        const next = exists
          ? tracks.map((t) => (t.method === method ? { ...t, ...patch, method } : t))
          : [...tracks, { method, status: 'pending' as ProtectionMethodStatus, ...patch }]
        get().updateCase(caseNo, { methodTracks: next })
      },

      /**
       * เปลี่ยนสถานะวิธี — เมื่อวิธีแรกกลายเป็น active ให้เปิด/ต่อ Episode ด้วยวันเริ่มจริงของวิธีนั้น
       * (แทนที่การเริ่มนับจากใบตอบรับตำรวจ ซึ่งไม่มีในระเบียบ)
       */
      setMethodStatus: (caseNo, method, status, detail) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        if (current.protectionHandoff && current.methodTracks?.find((t) => t.method === method)?.status === status) return
        /**
         * ด่านสุดท้ายของเงื่อนไขก่อนเริ่มปฏิบัติจริง — กติกาเดียวกับที่ UI แสดงไว้ (methodStartBlocker)
         * บังคับซ้ำที่ store เพื่อไม่ให้ทางเข้าอื่นข้ามเงื่อนไขไปได้
         */
        if (status === 'active') {
          const blocked = methodStartBlocker(current, method)
          if (blocked) {
            get().logHistory(
              caseNo,
              `วิธีที่ ${method} · เริ่มปฏิบัติไม่ได้`,
              protectionResponsibleName(current),
              blocked
            )
            return
          }
        }
        const at = detail?.at || new Date().toISOString()
        const tracks = (current.methodTracks || []).map((t) =>
          t.method === method
            ? {
                ...t,
                status,
                startedAt: status === 'active' ? t.startedAt || at : t.startedAt,
                endedAt: status === 'ended' ? at : t.endedAt,
                blockedReason: status === 'blocked' ? detail?.reason : undefined,
              }
            : t
        )
        const patch: Partial<CaseItem> = { methodTracks: tracks }

        if (status === 'active') {
          const kind: ProtectionPhaseKind = current.kb8Signed || current.kb11Signed ? 'MAIN' : 'TEMPORARY'
          const episode = current.episode || deriveEpisode(current)
          if (!episode) {
            patch.episode = openEpisode(kind, at, detail?.orderRef || (kind === 'TEMPORARY' ? 'คบ.5' : 'คบ.8'))
          } else {
            patch.episode = episode
          }
          patch.actualStartedAt = current.actualStartedAt || earliestMethodStart({ methodTracks: tracks }) || at
          patch.stage = 'protection'
          patch.status = 'กำลังคุ้มครอง'
          patch.owner = ACTOR.protection
          patch.next = 'ปฏิบัติการคุ้มครองและจัดทำรายงานผลประจำงวด (คบ.13)'
          if (current.protectionHandoff) {
            patch.owner = protectionResponsibleName(current)
            patch.status = HANDOFF_STATUS.active
            if (current.protectionHandoff.step !== 'active') {
              const actor = useAuthStore.getState().getCurrentUserAccount()
              if (!actor) return
              const event: ProtectionHandoffEvent = {
                id: `HANDOFF-${crypto.randomUUID()}`, action: 'เริ่มดำเนินการคุ้มครองตามผลอนุมัติ', at: nowDisplay(),
                actorUserId: actor.id, actorName: actor.name, actorRole: useAuthStore.getState().currentRole,
                fromUserId: actor.id, fromName: actor.name, toUserId: actor.id, toName: actor.name,
                note: detail?.reason || `วิธีที่ ${method} · ${current.decisionNumber}`,
              }
              patch.protectionHandoff = { ...current.protectionHandoff, step: 'active', events: [...current.protectionHandoff.events, event] }
            }
          }
        }

        get().updateCase(caseNo, patch)
        get().logHistory(
          caseNo,
          `วิธีที่ ${method} · ${status === 'active' ? 'เริ่มปฏิบัติจริง' : status === 'blocked' ? 'เริ่มไม่ได้' : status === 'ended' ? 'สิ้นสุด' : 'อัปเดตสถานะ'}`,
          protectionResponsibleName(current),
          detail?.reason || `สถานะใหม่: ${status}`
        )
      },

      // ---------- Episode / Phase ----------
      /**
       * เริ่มหรือเปลี่ยน Phase — TEMPORARY → MAIN ต่อเนื่องใน Episode เดิม (WIT0821)
       * ห้ามรีเซ็ตวันสะสม จึงไม่สร้าง Episode ใหม่เมื่อมี Episode เปิดอยู่แล้ว
       */
      startPhase: (caseNo, kind, startedAt, orderRef) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        const existing = current.episode || deriveEpisode(current)
        const episode = existing && !existing.closedAt ? switchPhase(existing, kind, startedAt, orderRef) : openEpisode(kind, startedAt, orderRef)
        get().updateCase(caseNo, {
          episode,
          actualStartedAt: current.actualStartedAt || episode.phases[0].startedAt,
        })
        get().logHistory(
          caseNo,
          `เปลี่ยน Phase การคุ้มครองเป็น ${kind}`,
          protectionResponsibleName(current),
          `${orderRef ? `ตาม ${orderRef} · ` : ''}วันสะสมต่อเนื่อง ${cumulativeDays(episode)} วัน (เพดาน 6 เดือน)`
        )
      },

      endEpisode: (caseNo, endedAt, reason) => {
        const current = get().getCase(caseNo)
        const episode = current?.episode || (current ? deriveEpisode(current) : undefined)
        if (!current || !episode) return
        get().updateCase(caseNo, { episode: closeEpisode(episode, endedAt, reason) })
        get().logHistory(caseNo, 'ปิด Episode การคุ้มครอง', protectionResponsibleName(current), reason)
      },

      // ---------- หนังสือราชการผ่านสารบรรณเดิม ----------
      addOfficialLetter: (caseNo, letter) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        const entry: OfficialLetter = { ...letter, id: `LT-${Date.now()}` }
        get().updateCase(caseNo, { officialLetters: [...(current.officialLetters || []), entry] })
        get().logHistory(
          caseNo,
          entry.direction === 'outgoing' ? 'ออกหนังสือผ่านสารบรรณเดิม' : 'รับหนังสือผ่านสารบรรณเดิม',
          protectionResponsibleName(current),
          `${entry.subject} · ${entry.agency}${entry.registryNo ? ` · เลขที่ ${entry.registryNo}` : ''}`
        )
      },

      updateOfficialLetter: (caseNo, letterId, patch) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        get().updateCase(caseNo, {
          officialLetters: (current.officialLetters || []).map((l) => (l.id === letterId ? { ...l, ...patch } : l)),
        })
      },

      // ---------- 08C : ข้อ 14 ----------
      openArticle14: (caseNo, input, actor) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const by = actor || protectionResponsibleName(current)
        const article14: Article14Case = {
          ...input,
          step: 'supervisor_review',
          openedAt: nowDisplay(),
          openedBy: by,
          revisions: [],
        }
        get().updateCase(caseNo, {
          article14,
          stage: 'article14',
          status: 'จัดทำเรื่องเสนอส่งต่อกรมคุ้มครองสิทธิฯ',
          owner: ACTOR.supervisor,
          next: 'ผู้บังคับบัญชาตรวจเอกสาร เหตุภัย ระยะสะสม และข้อเสนอ ก่อนเสนอเลขาธิการฯ',
          extraForms: Array.from(new Set([...(current.extraForms || []), 13])),
        })
        get().logHistory(
          caseNo,
          'เปิดเรื่องส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ',
          by,
          `${input.threatSummary} — เสนอใช้มาตรการ${input.recommendedMeasure === 'special' ? 'พิเศษ' : 'ทั่วไป'}`
        )
      },

      reviewArticle14: (caseNo, role, endorse, note) => {
        const current = get().getCase(caseNo)
        if (!current?.article14) return
        const actor = role === 'supervisor' ? ACTOR.supervisor : ACTOR.secretary
        const at = nowDisplay()

        if (!endorse) {
          get().updateCase(caseNo, {
            article14: {
              ...current.article14,
              step: 'proposal_draft',
              revisions: [...current.article14.revisions, { at, by: actor, reason: note }],
            },
            owner: protectionResponsibleName(current),
            status: 'ส่งคืนแก้ไขเรื่องเสนอส่งต่อกรมคุ้มครองสิทธิฯ',
            next: 'แก้ไขข้อเสนอเป็น Revision ใหม่ แล้วเสนอตามลำดับชั้นอีกครั้ง',
          })
          get().logHistory(caseNo, `ส่งคืนแก้ไขเรื่องส่งต่อกรมคุ้มครองสิทธิฯ โดย ${actor}`, actor, note)
          return
        }

        const isSupervisor = role === 'supervisor'
        get().updateCase(caseNo, {
          article14: {
            ...current.article14,
            step: isSupervisor ? 'secretary_review' : 'committee_pending',
            supervisorNote: isSupervisor ? note : current.article14.supervisorNote,
            supervisorAt: isSupervisor ? at : current.article14.supervisorAt,
            secretaryNote: isSupervisor ? current.article14.secretaryNote : note,
            secretaryAt: isSupervisor ? current.article14.secretaryAt : at,
          },
          owner: isSupervisor ? ACTOR.secretary : ACTOR.committee,
          status: isSupervisor ? 'รอเลขาธิการฯ เสนอคณะกรรมการ ป.ป.ท.' : 'รอมติคณะกรรมการ ป.ป.ท. เรื่องส่งต่อกรมคุ้มครองสิทธิฯ',
          next: isSupervisor
            ? 'เลขาธิการฯ เสนอเรื่องพร้อมความเห็นต่อคณะกรรมการ ป.ป.ท.'
            : 'ฝ่ายเลขานุการบรรจุวาระและบันทึกมติคณะกรรมการ',
        })
        get().logHistory(caseNo, `เห็นชอบเรื่องส่งต่อกรมคุ้มครองสิทธิฯ โดย ${actor}`, actor, note)
      },

      recordArticle14Resolution: (caseNo, resolutionNo, approved, note) => {
        const current = get().getCase(caseNo)
        if (!current?.article14) return
        const at = nowDisplay()
        get().updateCase(caseNo, {
          article14: {
            ...current.article14,
            step: approved ? 'letter_sent' : 'committee_rejected',
            committeeResolutionNo: resolutionNo,
            committeeResolvedAt: at,
            committeeApproved: approved,
            committeeNote: note,
          },
          owner: protectionResponsibleName(current),
          status: approved ? 'คณะกรรมการเห็นชอบส่งกรมคุ้มครองสิทธิและเสรีภาพ' : 'คณะกรรมการไม่เห็นชอบให้ส่งต่อกรมคุ้มครองสิทธิฯ',
          next: approved
            ? `จัดทำหนังสือแจ้ง/ประสาน ${ARTICLE14_TARGET_AGENCY} ผ่านสารบรรณเดิม`
            : 'ดำเนินการตามคำสั่งเดิม เมื่อมาตรการสิ้นสุดให้เข้าสู่กระบวนการยุติ',
        })
        get().logHistory(
          caseNo,
          approved ? 'มติคณะกรรมการ: เห็นชอบส่งกรมคุ้มครองสิทธิฯ' : 'มติคณะกรรมการ: ไม่เห็นชอบ',
          ACTOR.committee,
          `มติที่ ${resolutionNo} — ${note}`
        )
      },

      /**
       * WIT0862-0863 — เริ่มมาตรการภายใต้หน่วยงานใหม่ แล้วปิด Episode มาตรการเบื้องต้นของ ป.ป.ท.
       * ตามวันที่มีผล พร้อมเชื่อม Episode ของกรมไว้เพื่อคงประวัติการส่งมอบ
       */
      recordArticle14Reply: (caseNo, input) => {
        const current = get().getCase(caseNo)
        if (!current?.article14 || current.article14.step !== 'letter_sent') return
        const hasOutgoing = (current.officialLetters || []).some((l) => l.context === 'article14' && l.direction === 'outgoing')
        if (!hasOutgoing) return
        if (!input.registryNo.trim() || !input.registryDate || !input.contactPerson.trim() || !input.appointmentAt || !input.documentName) return
        const at = nowDisplay()
        get().addOfficialLetter(caseNo, {
          direction: 'incoming',
          context: 'article14',
          subject: `หนังสือตอบรับจาก ${ARTICLE14_TARGET_AGENCY} (มติที่ ${current.article14.committeeResolutionNo || '-'})`,
          registryNo: input.registryNo.trim(),
          registryDate: input.registryDate,
          agency: ARTICLE14_TARGET_AGENCY,
          contactPerson: input.contactPerson.trim(),
          channel: input.channel,
          receivedAt: new Date().toISOString(),
          documentName: input.documentName,
          note: input.conditions.trim() || undefined,
        })
        const latest = get().getCase(caseNo)
        if (!latest?.article14) return
        get().updateCase(caseNo, {
          article14: {
            ...latest.article14,
            step: 'response_received',
            replyRegistryNo: input.registryNo.trim(),
            replyRegistryDate: input.registryDate,
            replyContactPerson: input.contactPerson.trim(),
            replyChannel: input.channel,
            replyAppointmentAt: input.appointmentAt,
            replyConditions: input.conditions.trim(),
            replyDocumentName: input.documentName,
            replyRecordedAt: at,
          },
          next: 'เตรียมส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่ตามวันนัด',
        })
        get().logHistory(
          caseNo,
          `บันทึกหนังสือตอบรับจาก ${ARTICLE14_TARGET_AGENCY}`,
          protectionResponsibleName(current),
          `เลขที่ ${input.registryNo.trim()} · วันนัด ${input.appointmentAt}`
        )
      },

      completeArticle14Handover: (caseNo, input) => {
        const current = get().getCase(caseNo)
        if (!current?.article14) return
        /** WIT0860 → WIT0861 — ส่งมอบได้เมื่อบันทึกหนังสือตอบรับจากกรมแล้วเท่านั้น */
        if (!['response_received', 'handover_ready'].includes(current.article14.step)) return
        const episode = current.episode || deriveEpisode(current)
        const closed = episode
          ? {
              ...closeEpisode(episode, input.successorStartedAt, `ส่งมอบให้ ${ARTICLE14_TARGET_AGENCY}`),
              successorAgency: ARTICLE14_TARGET_AGENCY,
              successorStartedAt: input.successorStartedAt,
            }
          : undefined

        get().updateCase(caseNo, {
          article14: { ...current.article14, step: 'handover_done', ...input },
          episode: closed,
          stage: 'transferred',
          status: `ส่งมอบให้ ${ARTICLE14_TARGET_AGENCY} แล้ว`,
          owner: protectionResponsibleName(current),
          next: 'ติดตามสถานะการคุ้มครองภายใต้หน่วยงานผู้รับ และคงประวัติการส่งมอบไว้ในแฟ้ม',
          activity7Label: 'ส่งต่อกรมคุ้มครองสิทธิฯ',
        })
        get().logHistory(
          caseNo,
          'ส่งมอบพยานให้กรมคุ้มครองสิทธิฯ และเริ่มมาตรการภายใต้หน่วยงานใหม่',
          protectionResponsibleName(current),
          `เริ่ม ${input.successorStartedAt} · ฐานกฎหมาย: ${input.successorLegalBasis}`
        )
      },

      // ---------- 11A : ทบทวนผลและจำแนกแนวทาง ----------
      submitReviewProposal: (caseNo, input, actor) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const episode = current.episode || deriveEpisode(current)
        const proposal: ReviewProposal = {
          ...input,
          id: `RV-${Date.now()}`,
          createdAt: nowDisplay(),
          createdBy: actor || protectionResponsibleName(current),
          cumulativeDays: cumulativeDays(episode),
          remainingDays: remainingDays(episode),
          status: 'pending',
        }
        get().updateCase(caseNo, {
          reviewProposals: [...(current.reviewProposals || []), proposal],
          status: 'เสนอผลทบทวนการคุ้มครอง · รอผู้บังคับบัญชาตรวจ',
          owner: ACTOR.supervisor,
          next: 'ผู้บังคับบัญชาตรวจข้อเสนอ เอกสารประกอบ และระยะเวลาคงเหลือ',
        })
        get().logHistory(
          caseNo,
          'จัดทำข้อเสนอผลทบทวนการคุ้มครอง',
          proposal.createdBy,
          `สะสม ${proposal.cumulativeDays} วัน · คงเหลือ ${proposal.remainingDays} วัน · เสนอ: ${input.proposedOutcome}`
        )
      },

      decideReviewProposal: (caseNo, proposalId, endorse, note) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const at = nowDisplay()
        const proposals = (current.reviewProposals || []).map((r) =>
          r.id === proposalId
            ? { ...r, status: (endorse ? 'endorsed' : 'returned') as ReviewProposal['status'], reviewedAt: at, reviewedBy: ACTOR.supervisor, reviewNote: note }
            : r
        )
        const decided = proposals.find((r) => r.id === proposalId)
        get().updateCase(caseNo, {
          reviewProposals: proposals,
          owner: protectionResponsibleName(current),
          status: endorse ? 'ผลทบทวนผ่านการตรวจแล้ว' : 'ส่งคืนแก้ไขข้อเสนอผลทบทวน',
          next: endorse
            ? `ดำเนินการตามแนวทางที่เสนอ: ${decided?.proposedOutcome}`
            : 'แก้ไขข้อเสนอตามเหตุผลที่ส่งคืน แล้วเสนอใหม่',
        })
        get().logHistory(
          caseNo,
          endorse ? 'ผู้บังคับบัญชาเห็นชอบข้อเสนอผลทบทวน' : 'ผู้บังคับบัญชาส่งคืนแก้ไขข้อเสนอผลทบทวน',
          ACTOR.supervisor,
          note
        )
      },

      /** WIT1107-1111 / WIT1149 — ครบเพดานแล้วบังคับให้ไปข้อ 14 ไม่ให้ขยาย */
      applyReviewOutcome: (caseNo, outcome) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const episode = current.episode || deriveEpisode(current)
        const capped = remainingDays(episode) <= 0
        const effective: ReviewOutcome = outcome === 'extend' && capped ? 'article14' : outcome

        const routes: Record<ReviewOutcome, { status: string; next: string; owner: string; stage?: string }> = {
          continue: {
            status: 'คุ้มครองต่อภายใต้คำสั่งเดิม',
            next: 'กำหนดรอบรายงาน คบ.13 ถัดไปและติดตามผลต่อเนื่อง',
            owner: ACTOR.protection,
            stage: 'protection',
          },
          extend: {
            status: 'ดำเนินการขอขยายระยะเวลา (คบ.14)',
            next: `จัดทำ คบ.14 ได้ไม่เกิน ${remainingDays(episode)} วันตามเพดานรวม 6 เดือน`,
            owner: protectionResponsibleName(current),
          },
          change_method: {
            status: 'เสนอเปลี่ยนวิธี/เงื่อนไขการคุ้มครอง',
            next: 'เสนออนุมัติและปรับ คบ.11 — หากเปลี่ยนเป็นวิธีที่ 1 ให้จัดทำ/แก้ คบ.8 ก่อน',
            owner: protectionResponsibleName(current),
          },
          terminate: {
            status: 'เข้าสู่กระบวนการยุติการคุ้มครอง',
            next: 'จัดทำ คบ.15 รายงานการให้ความคุ้มครองสิ้นสุด แล้วเสนอตามลำดับชั้น',
            owner: protectionResponsibleName(current),
            stage: 'termination_review',
          },
          article14: {
            status: 'ครบเพดานแต่ยังมีภัย · ส่งต่อกรมคุ้มครองสิทธิฯ',
            next: `ห้ามขยาย คบ.14 — จัดทำเรื่องเสนอส่ง ${ARTICLE14_TARGET_AGENCY}`,
            owner: protectionResponsibleName(current),
            stage: 'article14',
          },
        }

        const route = routes[effective]
        const proposals = current.reviewProposals || []
        const latest = proposals[proposals.length - 1]
        const at = nowDisplay()
        const stampedProposals =
          latest && latest.status === 'endorsed'
            ? proposals.map((r) => (r.id === latest.id ? { ...r, appliedOutcome: effective, appliedAt: at } : r))
            : proposals
        get().updateCase(caseNo, {
          status: route.status,
          next: route.next,
          owner: route.owner,
          stage: route.stage || current.stage,
          reviewProposals: stampedProposals,
        })
        get().logHistory(
          caseNo,
          `เลือกแนวทางหลังทบทวน: ${effective}`,
          protectionResponsibleName(current),
          effective === 'article14' && outcome === 'extend'
            ? `ขอขยายไม่ได้ — สะสมครบ 6 เดือนแล้ว จึงเปลี่ยนเป็นเส้นทางส่งต่อกรมคุ้มครองสิทธิฯ`
            : route.next
        )
      },

      /**
       * WIT1110 — "เปลี่ยนวิธี/เงื่อนไข: เสนออนุมัติและปรับ คบ.11"
       *
       * เดิมแขนงนี้จบที่ป้ายสถานะ ไม่มีขั้นเสนออนุมัติและไม่มีการปรับชุดวิธีจริง
       * ที่นี่จึงสร้างงานจริงในคิว ผบช.ชั้นต้น แล้วเดินต่อถึง ผอ.สำนัก/กอง ตามลำดับชั้นเดียวกับ WIT0812 / WIT0845
       */
      proposeMethodChange: (caseNo, input, actor) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        const by = actor || protectionResponsibleName(current)
        const proposedMethods = Array.from(new Set(input.proposedMethods)).sort() as ProtectionMethodNo[]
        if (proposedMethods.length === 0) return

        const proposal: MethodChangeProposal = {
          id: `MC-${Date.now()}`,
          currentMethods: current.approvedMethods || [],
          proposedMethods,
          conditions: input.conditions,
          reason: input.reason,
          createdAt: nowDisplay(),
          createdBy: by,
          stage: 'supervisor',
          requiresKb8: proposedMethods.includes(1),
        }

        get().updateCase(caseNo, {
          methodChangeProposals: [...(current.methodChangeProposals || []), proposal],
          status: `เสนอเปลี่ยนวิธีคุ้มครองเป็นวิธีที่ ${proposedMethods.join(', ')} · รอ ผบช.ชั้นต้นพิจารณา`,
          owner: ACTOR.supervisor,
          next: `ผบช.ชั้นต้นพิจารณาข้อเสนอเปลี่ยนวิธี/เงื่อนไข ก่อนเสนอ ผอ.สำนัก/กอง อนุมัติปรับ คบ.11`,
        })
        get().logHistory(
          caseNo,
          'เสนอเปลี่ยนวิธี/เงื่อนไขการคุ้มครอง',
          by,
          `จากวิธีที่ ${(current.approvedMethods || []).join(', ') || '-'} เป็นวิธีที่ ${proposedMethods.join(', ')} · ${input.reason}${
            input.conditions ? ` · เงื่อนไข: ${input.conditions}` : ''
          }`
        )
      },

      reviewMethodChange: (caseNo, proposalId, level, endorse, note) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const target = (current.methodChangeProposals || []).find((r) => r.id === proposalId)
        if (!target || target.stage !== level) return
        const at = nowDisplay()
        const by = level === 'supervisor' ? ACTOR.supervisor : ACTOR.director
        const roleLabel = level === 'supervisor' ? 'ผบช.ชั้นต้น' : 'ผอ.สำนัก/กอง'
        const officer = protectionResponsibleName(current)

        const nextStage: MethodChangeProposal['stage'] = !endorse
          ? 'returned'
          : level === 'supervisor'
            ? 'director'
            : 'approved'

        const updated: MethodChangeProposal = {
          ...target,
          stage: nextStage,
          ...(level === 'supervisor'
            ? { supervisorAt: at, supervisorBy: by, supervisorNote: note }
            : { directorAt: at, directorBy: by, directorNote: note }),
          ...(endorse ? {} : { returnedAt: at, returnedBy: by, returnNote: note }),
        }
        const proposals = (current.methodChangeProposals || []).map((r) => (r.id === proposalId ? updated : r))
        const methodText = `วิธีที่ ${target.proposedMethods.join(', ')}`

        if (!endorse) {
          get().updateCase(caseNo, {
            methodChangeProposals: proposals,
            owner: officer,
            status: `ส่งคืนแก้ไขข้อเสนอเปลี่ยนวิธี/เงื่อนไข (${roleLabel})`,
            next: 'ทบทวนวิธีและเงื่อนไขที่เสนอตามข้อสั่งการ แล้วเสนอใหม่ตามลำดับชั้น',
          })
          get().logHistory(caseNo, `${roleLabel}ส่งคืนแก้ไขข้อเสนอเปลี่ยนวิธี/เงื่อนไข`, by, note || '-')
          return
        }

        if (nextStage === 'director') {
          get().updateCase(caseNo, {
            methodChangeProposals: proposals,
            owner: ACTOR.director,
            status: `ผบช.ชั้นต้นเห็นชอบ · รอ ผอ. อนุมัติเปลี่ยนเป็น${methodText}`,
            next: `ผอ.สำนัก/กอง พิจารณาอนุมัติเปลี่ยนวิธี/เงื่อนไข แล้วปรับ คบ.11`,
          })
          get().logHistory(caseNo, 'ผบช.ชั้นต้นเห็นชอบข้อเสนอเปลี่ยนวิธี/เงื่อนไข', by, note || '-')
          return
        }

        /**
         * ผอ. อนุมัติแล้ว — ต้องเกิดผลจริงกับแฟ้ม ไม่ใช่แค่เปลี่ยนป้ายสถานะ
         *  1. เปิดชุดวิธีใหม่แทนชุดเดิมทั้งหมด (เส้นทางรายวิธีเดิมถูกล้าง)
         *  2. ความยินยอมตาม คบ.11 เดิมใช้ต่อไม่ได้ เพราะ คบ.11 เปลี่ยนวิธีไปจากฉบับที่พยานลงนาม
         *     ต้องชี้แจงและให้พยานลงนามยินยอมใหม่ทุกวิธี (กลับ WIT0809-WIT0811)
         *  3. วิธีใหม่รวมวิธีที่ 1 — คบ.8 ฉบับเดิมผูกกับชุดวิธีเดิม จึงล้างลายมือชื่อให้จัดทำ/แก้เป็นฉบับใหม่
         *     แล้วเสนอเลขาธิการฯ ลงนามก่อน จึงเริ่มปฏิบัติวิธีที่ 1 ได้ (WIT0817-WIT0818)
         */
        const applied = proposals.map((r) => (r.id === proposalId ? { ...r, appliedAt: at } : r))
        const requiresKb8 = Boolean(target.requiresKb8)
        get().updateCase(caseNo, {
          methodChangeProposals: applied,
          /**
           * ข้อเสนอที่ ผอ. อนุมัติแล้วคือ "คำสั่งฉบับใหม่" ของสำนวนนี้ — ชุดวิธีตามคำสั่งต้องเปลี่ยนตามด้วย
           * ไม่งั้นด่านจำกัดวิธีตามคำสั่ง (WIT0813 / setApprovedMethods) จะกรองวิธีที่เพิ่งอนุมัติทิ้ง
           * แล้วแฟ้มจะไม่มีเส้นทางปฏิบัติเหลือเลยทั้งที่มีคำสั่งอนุมัติและบันทึกประวัติไว้แล้ว
           */
          orderedMethods: target.proposedMethods,
          approvedMethods: [],
          methodTracks: [],
          kb11Signed: false,
          consents: (current.consents || []).filter((c) => c.ref !== 'kb11'),
          ...(requiresKb8
            ? {
                kb8Signed: false,
                kb8SignedAt: undefined,
                kb8SignedBy: undefined,
                kb8SubmittedAt: undefined,
                kb8SubmittedBy: undefined,
              }
            : {}),
        })
        get().setApprovedMethods(caseNo, target.proposedMethods, officer)
        get().updateCase(caseNo, {
          owner: officer,
          status: `อนุมัติเปลี่ยนเป็น${methodText} · รอปรับ คบ.11 และขอความยินยอมใหม่`,
          next: requiresKb8
            ? `ปรับ คบ.11 เป็น${methodText} ขอความยินยอมจากพยานใหม่ แล้วจัดทำ/แก้ คบ.8 เสนอเลขาธิการฯ ลงนามก่อนเริ่มวิธีที่ 1`
            : `ปรับ คบ.11 เป็น${methodText} แล้วชี้แจงและขอความยินยอมจากพยานอีกครั้ง ก่อนเริ่มปฏิบัติตามวิธีคุ้มครอง`,
        })
        get().logHistory(
          caseNo,
          `ผอ.สำนัก/กอง อนุมัติเปลี่ยนวิธี/เงื่อนไข: ${methodText}`,
          by,
          `${note || '-'}${target.conditions ? ` · เงื่อนไขที่ปรับใน คบ.11: ${target.conditions}` : ''}`
        )
        get().logHistory(
          caseNo,
          'ปรับ คบ.11 ตามวิธีที่อนุมัติใหม่',
          officer,
          `ความยินยอมตาม คบ.11 เดิมถูกล้าง ต้องชี้แจงและลงนามใหม่${
            requiresKb8 ? ' · คบ.8 ต้องจัดทำ/แก้เป็นฉบับใหม่และลงนามก่อนเริ่มวิธีที่ 1' : ''
          }`
        )
      },

      // ---------- 11C : เหตุเริ่มยุติ + คบ.15 ----------
      /**
       * WIT1125-WIT1128 — บันทึกว่าเหตุยุติมาจากทางใด ก่อนจะจัดทำ คบ.15
       * แขนงหนังสือภายนอกต้องอัปโหลดเข้ากับ "แฟ้มเดิม" ไม่เปิดแฟ้มใหม่ (WIT1127)
       */
      recordTerminationTrigger: (caseNo, input, actor, documentPreviewUrl) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        const by = actor || protectionResponsibleName(current)
        const at = nowDisplay()
        const LABEL: Record<TerminationTrigger['source'], string> = {
          witness_kb7: 'พยานยื่น คบ.7 / กรอกคำขอยุติในระบบ',
          external_letter: 'หนังสือขอยุติจากภายนอก',
          due_or_officer: 'ครบกำหนด หรือเจ้าหน้าที่เห็นควรยุติ',
        }

        get().updateCase(caseNo, {
          terminationTrigger: { ...input, recordedAt: at, recordedBy: by },
          /** WIT1127 — เอกสารต้นเรื่องเข้าแฟ้มเดิมเสมอ */
          documents: input.documentName
            ? [
                ...(current.documents || []),
                {
                  id: `DOC-TERM-${Date.now()}`,
                  category: input.source === 'witness_kb7' ? ('case_doc' as const) : ('official' as const),
                  name: input.documentName,
                  reference: input.ref,
                  uploadedBy: by,
                  uploadedAt: at,
                  note: LABEL[input.source],
                  previewUrl: documentPreviewUrl,
                },
              ]
            : current.documents,
          officialLetters:
            input.source === 'external_letter'
              ? [
                  ...(current.officialLetters || []),
                  {
                    id: `LT-${Date.now()}`,
                    direction: 'incoming' as const,
                    context: 'termination' as const,
                    subject: 'หนังสือขอยุติการคุ้มครองพยานจากภายนอก',
                    registryNo: input.ref,
                    registryDate: input.receivedAt,
                    agency: input.detail || 'หน่วยงานภายนอก',
                    documentName: input.documentName,
                    receivedAt: input.receivedAt,
                  },
                ]
              : current.officialLetters,
          stage: 'termination_review',
          status: `รับเหตุยุติ: ${LABEL[input.source]}`,
          owner: by,
          next: 'จัดทำ คบ.15 รายงานการให้ความคุ้มครองสิ้นสุด พร้อมหลักฐานอ้างอิง',
          extraForms:
            input.source === 'witness_kb7'
              ? Array.from(new Set([...(current.extraForms || []), 7]))
              : current.extraForms,
        })
        get().logHistory(
          caseNo,
          'บันทึกเหตุเริ่มยุติการคุ้มครอง',
          by,
          `${LABEL[input.source]}${input.ref ? ` · อ้างอิง ${input.ref}` : ''}${input.detail ? ` · ${input.detail}` : ''}`
        )
      },

      /**
       * TC-144 — เพิ่มเหตุยุติเสริม (ไม่ใช่เหตุหลัก) เข้ากับ terminationTrigger เดียวกันของแฟ้ม
       * ยังคง "เรื่องยุติเดียว" ต่อแฟ้ม — ไม่สร้าง matter ใหม่ และไม่เปลี่ยนแนวทางที่กำหนดโดยเหตุหลัก
       */
      addTerminationAdditionalReason: (caseNo, input, actor) => {
        const current = get().getCase(caseNo)
        const trigger = current?.terminationTrigger
        if (!current || !trigger) return
        const by = actor || protectionResponsibleName(current)
        const at = nowDisplay()

        // กันซ้ำ: แขนงเดียวกับเหตุหลัก หรือแขนงที่ถูกเพิ่มเป็นเหตุเสริมไว้แล้ว จะไม่ถูกเพิ่มซ้ำ
        if (trigger.source === input.source) return
        const existing = trigger.additionalReasons || []
        if (existing.some((r) => r.source === input.source)) return

        get().updateCase(caseNo, {
          terminationTrigger: {
            ...trigger,
            additionalReasons: [...existing, { ...input, recordedAt: at, recordedBy: by }],
          },
        })
        get().logHistory(
          caseNo,
          'เพิ่มเหตุยุติเสริม',
          by,
          `${input.source}${input.ref ? ` · อ้างอิง ${input.ref}` : ''}${input.detail ? ` · ${input.detail}` : ''}`
        )
      },

      draftKb15: (caseNo, input, actor) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        const by = actor || protectionResponsibleName(current)
        const previous = current.kb15
        const kb15: Kb15Report = {
          ...input,
          version: (previous?.version || 0) + 1,
          createdAt: nowDisplay(),
          createdBy: by,
          status: 'submitted',
          previousVersions: previous
            ? [...(previous.previousVersions || []), { version: previous.version, createdAt: previous.createdAt, summary: previous.summary }]
            : [],
        }
        get().updateCase(caseNo, {
          kb15,
          stage: 'termination_review',
          status: `จัดทำ คบ.15 ฉบับที่ ${kb15.version} · รอผู้บังคับบัญชาตรวจ`,
          owner: ACTOR.supervisor,
          next: 'ตรวจ คบ.15 เหตุผลและเอกสารประกอบ แล้วบันทึกความเห็นตามลำดับชั้น',
          extraForms: Array.from(new Set([...(current.extraForms || []), 15])),
        })
        get().logHistory(caseNo, `จัดทำ คบ.15 ฉบับที่ ${kb15.version}`, by, input.summary)
      },

      reviewKb15: (caseNo, endorse, note) => {
        const current = get().getCase(caseNo)
        if (!current?.kb15) return
        const at = nowDisplay()
        get().updateCase(caseNo, {
          kb15: { ...current.kb15, status: endorse ? 'endorsed' : 'returned', reviewedAt: at, reviewedBy: ACTOR.supervisor, reviewNote: note },
          owner: endorse ? ACTOR.secretary : protectionResponsibleName(current),
          status: endorse ? 'เสนอผู้มีอำนาจพิจารณายุติ' : 'ส่งคืนแก้ไข คบ.15',
          next: endorse
            ? 'ผู้มีอำนาจพิจารณาและออกคำสั่งยุติ (คบ.16)'
            : 'แก้ไข คบ.15 เป็นเวอร์ชันใหม่ (เก็บฉบับเดิมไว้) แล้วเสนอใหม่',
        })
        get().logHistory(caseNo, endorse ? 'เห็นชอบ คบ.15 เสนอผู้มีอำนาจ' : 'ส่งคืนแก้ไข คบ.15', ACTOR.supervisor, note)
      },

      // ---------- 11D : คบ.16 / คบ.17 ----------
      /**
       * WIT1136-WIT1137 — ด่านตัดสินก่อนร่าง คบ.16
       * ไม่อนุมัติ = ไม่มีคำสั่งยุติ คุ้มครองต่อภายใต้คำสั่งเดิมและกลับแท็บ 10
       */
      decideTerminationApproval: (caseNo, approve, note, actor) => {
        const current = get().getCase(caseNo)
        if (!current?.kb15) return
        const by = actor || ACTOR.secretary
        const at = nowDisplay()

        get().updateCase(caseNo, {
          terminationApproval: { decidedAt: at, decidedBy: by, approved: approve, note },
          stage: approve ? 'termination_order' : 'protection',
          status: approve ? 'อนุมัติให้ยุติ · จัดทำร่างคำสั่ง คบ.16' : 'ไม่อนุมัติให้ยุติ · คุ้มครองต่อภายใต้คำสั่งเดิม',
          owner: protectionResponsibleName(current),
          next: approve
            ? 'จัดทำร่าง คบ.16 ระบุเหตุยุติ วันที่ออกคำสั่ง และวันที่มีผล'
            : 'กลับไปรายงานผลการคุ้มครอง · ติดตามผลและกำหนดรอบรายงาน คบ.13 ถัดไป',
        })
        get().logHistory(
          caseNo,
          approve ? 'ผู้มีอำนาจอนุมัติให้ยุติการคุ้มครอง' : 'ผู้มีอำนาจไม่อนุมัติให้ยุติ — คุ้มครองต่อ',
          by,
          note
        )
      },

      /** ร่างคำสั่งยุติ — ยังไม่เปลี่ยนสถานะเป็น "ยุติ" จนกว่าจะลงนามและถึงวันที่มีผล (WIT1130 / WIT1139) */
      issueKb16: (caseNo, input) => {
        const current = get().getCase(caseNo)
        if (!current) return
        get().updateCase(caseNo, {
          kb16: { ...input, status: 'draft' },
          stage: 'termination_order',
          status: 'ร่างคำสั่งยุติ (คบ.16) · เจ้าหน้าที่กรอกแบบในแฟ้ม',
          owner: protectionResponsibleName(current),
          next: 'กรอกแบบ คบ.16 ในแฟ้มให้ครบ แล้วกด "ส่งให้อนุมัติ" เพื่อเสนอผู้มีอำนาจลงนาม',
          extraForms: Array.from(new Set([...(current.extraForms || []), 16])),
        })
        get().logHistory(
          caseNo,
          'เปิดร่างคำสั่งยุติการคุ้มครอง (คบ.16) เข้าแฟ้ม',
          protectionResponsibleName(current),
          `คำสั่งที่ ${input.orderNo} · ออกคำสั่ง ${formatThaiDate(input.issuedAt)} · มีผล ${formatThaiDate(input.effectiveAt)}`
        )
      },

      /**
       * WIT1138 → WIT1139 — เจ้าหน้าที่กรอกแบบ คบ.16 ในแฟ้มเสร็จแล้ว กดส่งให้ผู้มีอำนาจอนุมัติ/ลงนาม
       * ค่าที่กรอกในแบบฟอร์มจะทับค่าร่างเดิมจากแท็บ 11D ตอนกดส่งเท่านั้น
       */
      submitKb16ForSignature: (caseNo, patch) => {
        const current = get().getCase(caseNo)
        if (current && !routedWorkerAllowed(current)) return
        if (!current?.kb16 || current.kb16.signedAt) return
        const at = nowDisplay()
        const by = protectionResponsibleName(current)
        const merged: Kb16Order = {
          ...current.kb16,
          /** ช่องที่ไม่ได้กรอก (undefined) ต้องไม่ทับค่าร่างจาก 11D — ไม่งั้นเลขคำสั่ง/วันที่มีผลหาย */
          ...Object.fromEntries(Object.entries(patch || {}).filter(([, v]) => v !== undefined)),
          status: 'submitted',
          submittedAt: at,
          submittedBy: by,
        }
        get().updateCase(caseNo, {
          kb16: merged,
          stage: 'termination_order',
          status: 'เสนอผู้มีอำนาจลงนามคำสั่งยุติ (คบ.16)',
          owner: ACTOR.secretary,
          next: 'ผู้มีอำนาจลงนาม คบ.16 — ห้ามเริ่มสถานะยุติก่อนมีคำสั่งที่ลงนาม',
        })
        get().logHistory(
          caseNo,
          'ส่งคำสั่งยุติ (คบ.16) ให้ผู้มีอำนาจอนุมัติและลงนาม',
          by,
          `คำสั่งที่ ${merged.orderNo} · ออกคำสั่ง ${formatThaiDate(merged.issuedAt)} · มีผล ${formatThaiDate(merged.effectiveAt)}`
        )
      },

      /**
       * ลงนาม คบ.16 แล้วล็อกฉบับลงนาม — Episode ปิดที่ "วันที่มีผล" ไม่ใช่วันลงนาม
       * สถานะสำนวนเปลี่ยนเป็น terminated เฉพาะเมื่อถึงวันที่มีผลแล้วเท่านั้น
       */
      signKb16: (caseNo, signerName) => {
        const current = get().getCase(caseNo)
        if (!current?.kb16) return
        const at = nowDisplay()
        const signer = signerName || ACTOR.secretary
        const effective = parseAnyDate(/^\d{4}-\d{2}-\d{2}$/.test(current.kb16.effectiveAt || '') ? `${current.kb16.effectiveAt}T00:00:00+07:00` : current.kb16.effectiveAt)
        const inForce = Boolean(effective && effective.getTime() <= Date.now())
        const episode = current.episode || deriveEpisode(current)

        get().updateCase(caseNo, {
          kb16: { ...current.kb16, signedAt: at, signedBy: signer, locked: true },
          episode: inForce && episode ? closeEpisode(episode, current.kb16.effectiveAt || at, current.kb16.reason) : episode,
          stage: inForce ? 'terminated' : 'termination_order',
          status: inForce ? 'ยุติการคุ้มครองแล้วตามคำสั่ง คบ.16' : `ลงนาม คบ.16 แล้ว · มีผลวันที่ ${formatThaiDate(current.kb16.effectiveAt)}`,
          owner: protectionResponsibleName(current),
          next: 'จัดทำ คบ.17 แจ้งคำสั่งยุติและสิทธิอุทธรณ์ แล้วออกเลขผ่านสารบรรณเดิม',
          // ปิดมาตรการตามวันที่มีผล แต่แฟ้มยังต้องทำ คบ.17 และรอพ้นสิทธิอุทธรณ์
          closedAt: undefined,
          terminationRequest: current.terminationRequest
            ? { ...current.terminationRequest, status: 'approved', decidedAt: at, decidedBy: signer, decisionNote: current.kb16.reason }
            : current.terminationRequest,
          extraForms: Array.from(new Set([...(current.extraForms || []), 17])),
        })
        get().logHistory(
          caseNo,
          'ผู้มีอำนาจลงนามคำสั่งยุติ (คบ.16)',
          signer,
          inForce
            ? `คำสั่งมีผลแล้วตั้งแต่ ${formatThaiDate(current.kb16.effectiveAt)} — ปิด Episode ณ วันที่มีผล`
            : `คำสั่งจะมีผลวันที่ ${formatThaiDate(current.kb16.effectiveAt)} — ยังคุ้มครองต่อจนถึงวันดังกล่าว`
        )
      },

      recordOperationStopped: (caseNo, stoppedAt) => {
        const current = get().getCase(caseNo)
        if (!current?.kb16) return
        get().updateCase(caseNo, {
          kb16: { ...current.kb16, operationStoppedAt: stoppedAt },
          methodTracks: (current.methodTracks || []).map((t) =>
            t.status === 'ended' ? t : { ...t, status: 'ended' as ProtectionMethodStatus, endedAt: stoppedAt }
          ),
        })
        get().logHistory(caseNo, 'บันทึกวันหยุดปฏิบัติจริงในพื้นที่', ACTOR.protection, `หยุดปฏิบัติ ${stoppedAt}`)
      },

      /** WIT1141 — เปิดร่าง คบ.17 เข้าแฟ้มให้เจ้าหน้าที่กรอก ยังไม่ออกเลขสารบรรณ */
      draftKb17: (caseNo, input) => {
        const current = get().getCase(caseNo)
        if (!current) return
        if (!routedWorkerAllowed(current)) return
        get().updateCase(caseNo, {
          kb17: { ...(current.kb17 || {}), ...input, status: 'draft' },
          status: 'ร่างหนังสือแจ้งคำสั่งยุติ (คบ.17) · เจ้าหน้าที่กรอกแบบในแฟ้ม',
          owner: protectionResponsibleName(current),
          next: 'กรอกแบบ คบ.17 ในแฟ้มให้ครบ แล้วกด "ส่งให้ลงนาม" เพื่อเสนอเลขาธิการ ป.ป.ท.',
          extraForms: Array.from(new Set([...(current.extraForms || []), 17])),
        })
        get().logHistory(
          caseNo,
          'เปิดร่างหนังสือแจ้งคำสั่งยุติ (คบ.17) เข้าแฟ้ม',
          protectionResponsibleName(current),
          input.documentName
        )
      },

      /** เจ้าหน้าที่กรอกแบบ คบ.17 เสร็จแล้ว เสนอเลขาธิการ ป.ป.ท. ลงนาม */
      submitKb17ForSignature: (caseNo) => {
        const current = get().getCase(caseNo)
        if (current && !routedWorkerAllowed(current)) return
        if (!current?.kb17 || current.kb17.signedAt) return
        const at = nowDisplay()
        const by = protectionResponsibleName(current)
        get().updateCase(caseNo, {
          kb17: { ...current.kb17, status: 'submitted', submittedAt: at, submittedBy: by },
          status: 'เสนอเลขาธิการ ป.ป.ท. ลงนาม คบ.17',
          owner: ACTOR.secretary,
          next: 'เลขาธิการ ป.ป.ท. ลงนาม คบ.17 ก่อนออกเลขและนำส่งผ่านสารบรรณเดิม',
        })
        get().logHistory(caseNo, 'ส่งหนังสือแจ้งคำสั่งยุติ (คบ.17) ให้เลขาธิการ ป.ป.ท. ลงนาม', by, current.kb17.documentName || '')
      },

      /** เลขาธิการ ป.ป.ท. ลงนาม คบ.17 แล้วล็อกฉบับลงนาม — จากนั้นจึงออกเลขและนำส่ง (WIT1142) */
      signKb17: (caseNo, signerName) => {
        const current = get().getCase(caseNo)
        if (!current?.kb17 || current.kb17.signedAt) return
        const at = nowDisplay()
        const signer = signerName || ACTOR.secretary
        get().updateCase(caseNo, {
          kb17: { ...current.kb17, signedAt: at, signedBy: signer, locked: true },
          status: 'ลงนาม คบ.17 แล้ว · รอออกเลขและนำส่งผ่านสารบรรณเดิม',
          owner: protectionResponsibleName(current),
          next: 'ออกเลขและนำส่ง คบ.17 ผ่านระบบสารบรรณเดิม',
        })
        get().logHistory(caseNo, 'เลขาธิการ ป.ป.ท. ลงนามหนังสือแจ้งคำสั่งยุติ (คบ.17)', signer, `ลงนามเมื่อ ${at} — ออกเลขและนำส่งผ่านสารบรรณเดิมได้`)
      },

      dispatchKb17: (caseNo, input) => {
        const current = get().getCase(caseNo)
        /** WIT1142 — ออกเลขได้ต่อเมื่อฉบับนี้ลงนามแล้วเท่านั้น */
        if (!current?.kb17?.signedAt) return
        const at = nowDisplay()
        get().updateCase(caseNo, {
          kb17: { ...(current.kb17 || {}), ...input, dispatchedAt: at },
          officialLetters: [
            ...(current.officialLetters || []),
            {
              id: `LT-${Date.now()}`,
              direction: 'outgoing',
              context: 'termination',
              subject: 'หนังสือแจ้งคำสั่งยุติการคุ้มครองพยาน (คบ.17)',
              registryNo: input.registryNo,
              registryDate: input.registryDate,
              agency: 'ผู้ได้รับความคุ้มครอง',
              documentName: input.documentName,
              sentAt: at,
            },
          ],
          status: 'นำส่ง คบ.17 แล้ว · รอบันทึกวันที่พยานได้รับ',
          next: 'บันทึกวันที่พยานได้รับ คบ.17 เพื่อเริ่มนับสิทธิอุทธรณ์ 30 วัน',
        })
        get().logHistory(caseNo, 'ออกเลขและนำส่ง คบ.17 ผ่านสารบรรณเดิม', protectionResponsibleName(current), `เลขที่ ${input.registryNo} ลงวันที่ ${input.registryDate}`)
      },

      /** WIT1145 — เริ่มนับอุทธรณ์ 30 วันจากวันที่พยานได้รับจริง (คนละรอบกับ คบ.10) */
      recordKb17Delivery: (caseNo, deliveredAt, receiptEvidence) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const dueAt = addDays(deliveredAt, APPEAL_WINDOW_DAYS)
        /** TC-153 — การรับจริงก็นับเป็นความพยายามนำส่งที่สำเร็จ เพื่อให้ประวัติการนำส่งครบทุกทางที่บันทึก */
        const priorAttempts = current.kb17?.deliveryAttempts || []
        const receiptAttempt: Kb17DeliveryAttempt = {
          attemptNo: priorAttempts.length + 1,
          channel: 'พยานได้รับจริง (ใบตอบรับ)',
          attemptedAt: deliveredAt,
          result: 'success',
          evidence: receiptEvidence,
        }
        get().updateCase(caseNo, {
          kb17: {
            ...(current.kb17 || {}),
            deliveryAttempts: [...priorAttempts, receiptAttempt],
            deliveredAt,
            appealDueAt: dueAt,
            receiptEvidence,
            deliveryMethod: 'actual',
          },
          appealDueAt: dueAt,
          appealAgainst: 'kb17',
          status: 'พยานได้รับ คบ.17 แล้ว · อยู่ในกรอบอุทธรณ์',
          next: `รอครบกำหนดอุทธรณ์ ${APPEAL_WINDOW_DAYS} วัน หรือรับคำอุทธรณ์คำสั่งยุติ`,
        })
        get().logHistory(
          caseNo,
          'บันทึกวันที่พยานได้รับ คบ.17',
          protectionResponsibleName(current),
          `เริ่มนับสิทธิอุทธรณ์ ${APPEAL_WINDOW_DAYS} วันจากวันที่รับจริง`
        )
      },

      /**
       * TC-153 — บันทึกผลความพยายามนำส่ง คบ.17 แต่ละครั้ง (append-only, เก็บทุกครั้งไม่ว่าสำเร็จ/ไม่สำเร็จ)
       * ความพยายามที่ "success" ถือเป็นวันรับจริง จึงเริ่มนับกรอบอุทธรณ์ทันที เช่นเดียวกับ recordKb17Delivery
       */
      recordKb17DeliveryAttempt: (caseNo, attempt, actor) => {
        const current = get().getCase(caseNo)
        if (!current?.kb17) return
        const by = actor || protectionResponsibleName(current)
        const attemptNo = (current.kb17.deliveryAttempts?.length || 0) + 1
        const entry: Kb17DeliveryAttempt = { ...attempt, attemptNo }
        const attempts = [...(current.kb17.deliveryAttempts || []), entry]

        if (attempt.result === 'success' && !current.kb17.deliveredAt) {
          const dueAt = addDays(attempt.attemptedAt, APPEAL_WINDOW_DAYS)
          get().updateCase(caseNo, {
            kb17: {
              ...current.kb17,
              deliveryAttempts: attempts,
              deliveredAt: attempt.attemptedAt,
              appealDueAt: dueAt,
              receiptEvidence: attempt.evidence,
              deliveryMethod: 'actual',
            },
            appealDueAt: dueAt,
            appealAgainst: 'kb17',
            status: 'พยานได้รับ คบ.17 แล้ว · อยู่ในกรอบอุทธรณ์',
            next: `รอครบกำหนดอุทธรณ์ ${APPEAL_WINDOW_DAYS} วัน หรือรับคำอุทธรณ์คำสั่งยุติ`,
          })
        } else {
          get().updateCase(caseNo, { kb17: { ...current.kb17, deliveryAttempts: attempts } })
        }

        get().logHistory(
          caseNo,
          `บันทึกผลการนำส่ง คบ.17 ครั้งที่ ${attemptNo}`,
          by,
          `${attempt.channel} · ${attempt.result === 'success' ? 'สำเร็จ' : 'ไม่สำเร็จ'}${attempt.note ? ` — ${attempt.note}` : ''}`
        )
      },

      /**
       * TC-153 — เมื่อนำส่งไม่สำเร็จอย่างน้อย 1 ครั้ง เจ้าหน้าที่บันทึกว่าถือว่าได้รับตามระเบียบ
       * (ปิดประกาศ/ไปรษณีย์ลงทะเบียนตอบรับ) — วันที่นี้จึงเริ่มนับกรอบอุทธรณ์ 30 วันแทนวันรับจริง
       */
      recordKb17DeemedReceipt: (caseNo, deemedAt, method, actor) => {
        const current = get().getCase(caseNo)
        if (!current?.kb17) return
        const hasFailedAttempt = (current.kb17.deliveryAttempts || []).some((a) => a.result === 'failed')
        if (!hasFailedAttempt || current.kb17.deliveredAt) return
        const by = actor || protectionResponsibleName(current)
        const dueAt = addDays(deemedAt, APPEAL_WINDOW_DAYS)
        get().updateCase(caseNo, {
          kb17: {
            ...current.kb17,
            deliveredAt: deemedAt,
            appealDueAt: dueAt,
            receiptEvidence: method,
            deliveryMethod: 'deemed',
          },
          appealDueAt: dueAt,
          appealAgainst: 'kb17',
          status: 'ถือว่าพยานได้รับ คบ.17 ตามระเบียบแล้ว · อยู่ในกรอบอุทธรณ์',
          next: `รอครบกำหนดอุทธรณ์ ${APPEAL_WINDOW_DAYS} วัน หรือรับคำอุทธรณ์คำสั่งยุติ`,
        })
        get().logHistory(
          caseNo,
          'บันทึกวันที่ถือว่าพยานได้รับ คบ.17 ตามระเบียบ',
          by,
          `${method} — เริ่มนับสิทธิอุทธรณ์ ${APPEAL_WINDOW_DAYS} วันจากวันนี้`
        )
      },

      /** WIT1143 — อัปโหลด คบ.17 ฉบับที่ส่งจริงเข้ากับแฟ้ม คู่กับเลขที่/วันที่จากสารบรรณเดิม */
      attachKb17Sent: (caseNo, documentName, actor) => {
        const current = get().getCase(caseNo)
        if (!current?.kb17) return
        const by = actor || protectionResponsibleName(current)
        const at = nowDisplay()
        get().updateCase(caseNo, {
          kb17: { ...current.kb17, sentDocumentName: documentName },
          documents: [
            ...(current.documents || []),
            {
              id: `DOC-KB17-${Date.now()}`,
              category: 'official' as const,
              name: documentName,
              reference: current.kb17.registryNo,
              uploadedBy: by,
              uploadedAt: at,
              note: 'คบ.17 ฉบับที่ส่งผ่านระบบสารบรรณเดิม',
            },
          ],
        })
        get().logHistory(caseNo, 'อัปโหลด คบ.17 ฉบับส่งเข้ากับแฟ้ม', by, `เลขที่ ${current.kb17.registryNo || '-'}`)
      },

      /**
       * WIT1147 — มีอุทธรณ์ภายในกำหนด: ผูกคำอุทธรณ์กับ คบ.17 และหลักฐานการรับที่มีอยู่
       * ไม่สร้าง คบ.1 ใหม่ และไม่ปิดงาน
       */
      openKb17Appeal: (caseNo, reason, intake, actor) => {
        const current = get().getCase(caseNo)
        if (!current?.kb17?.deliveredAt) return
        get().fileAppeal(caseNo, reason, intake, { against: 'kb17' })
      },

      /**
       * WIT1148 — ปิดงานเมื่อไม่มีอุทธรณ์หรือพ้นกำหนด: ล็อกเอกสารลงนามและคง Audit Trail
       * TC-151/TC-153 — ห้ามปิดงานถ้ายังไม่พ้นกรอบอุทธรณ์ (และไม่มีผลอุทธรณ์) หรือมีงานค้าง (คบ.13/คำขอขยายเวลา)
       * หรือยังไม่เริ่มนับกรอบอุทธรณ์เลย (ยังไม่มีวันรับจริง/วันที่ถือว่าได้รับตามระเบียบ)
       */
      closeProtectionCase: (caseNo, note) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const guard = evaluateCloseGuard(current)
        if (!guard.allowed) {
          /** เรียกจากเทสต์/สคริปต์ (นอกเบราว์เซอร์จริง) อาจไม่มี matchMedia ให้ Swal ใช้ — กันพังแล้วปล่อยผ่านแบบ no-op */
          try {
            showToast(guard.reasons[0] || 'ยังปิดงานไม่ได้ตามเงื่อนไข', 'warning')
          } catch {
            /* no-op: การ์ดยังทำงานตามปกติ เพียงข้ามการแจ้งเตือนเมื่อ Swal ใช้งานไม่ได้ในสภาพแวดล้อมนี้ */
          }
          return
        }
        get().updateCase(caseNo, {
          stage: 'terminated',
          status: 'ปิดงานคุ้มครองแล้ว',
          owner: protectionResponsibleName(current),
          next: 'เอกสารฉบับลงนามถูกล็อก คงประวัติการดำเนินการไว้ในแฟ้ม',
          closedAt: current.kb16?.effectiveAt || nowDisplay(),
          kb16: current.kb16 ? { ...current.kb16, locked: true } : current.kb16,
          methodTracks: (current.methodTracks || []).map((t) => (t.status === 'ended' ? t : { ...t, status: 'ended' as ProtectionMethodStatus })),
        })
        get().logHistory(caseNo, 'ปิดงานคุ้มครองพยาน', protectionResponsibleName(current), note || 'ไม่มีอุทธรณ์ภายในกำหนด')
      },

      // ---------- 09B : ลำดับชั้นแฟ้มอุทธรณ์ ----------
      /**
       * WIT0914 — ตรวจความครบถ้วนและคำนวณกรอบ 30 วันจากวันที่รับแจ้งผลจริง
       *
       * ผังกำกับตัวหนาว่า "หากล่าช้าให้บันทึกเหตุผลและจัดทำแฟ้มเสนอ ไม่ปัดตกอัตโนมัติ" —
       * เคสที่ยื่นเกินกำหนดจึงต้องเดินต่อได้เสมอ เพียงแต่ต้องมีเหตุผลความล่าช้าและให้
       * ผบช.ชั้นต้นรับเรื่องไว้ก่อน อำนาจตัดสินว่าจะรับพิจารณาหรือไม่อยู่ที่คณะกรรมการ
       */
      checkAppealFolder: (caseNo, input) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const officer = current.appealFolder?.appealOfficer?.name || current.assignedOfficer || ACTOR.appeal
        const at = nowDisplay()
        /** ค่าบวก = ยื่นช้ากว่ากำหนดกี่วัน (daysUntil คืนค่าติดลบเมื่อครบกำหนดไปแล้ว) */
        const left = daysUntil(current.appealDueAt, current.appealFiledAt)
        const lateDays = left !== null && left < 0 ? Math.abs(left) : 0
        const late = lateDays > 0

        get().updateCase(caseNo, {
          appealFolder: {
            ...(current.appealFolder || {}),
            stage: late ? 'late_pending' : 'officer_opinion',
            checkedAt: at,
            checkedBy: officer,
            lateDays,
            lateReason: late ? input.lateReason : undefined,
          },
          status: late ? 'อุทธรณ์เกินกรอบ 30 วัน · รอ ผบช.ชั้นต้นรับเรื่อง' : 'แฟ้มอุทธรณ์ครบถ้วน · รอบันทึกความเห็นเจ้าหน้าที่',
          owner: late ? ACTOR.supervisor : officer,
          next: late
            ? 'ผบช.ชั้นต้นรับเรื่องที่ยื่นเกินกำหนดไว้พิจารณา — ห้ามปัดตกอัตโนมัติ ให้คณะกรรมการเป็นผู้ตัดสิน'
            : 'ตรวจข้อเท็จจริงและเอกสาร แล้วบันทึกความเห็นของเจ้าหน้าที่ผู้รับผิดชอบ',
        })
        get().logHistory(
          caseNo,
          late ? `ตรวจแฟ้มอุทธรณ์ — ยื่นเกินกำหนด ${lateDays} วัน` : 'ตรวจแฟ้มอุทธรณ์ — ยื่นภายในกรอบ 30 วัน',
          officer,
          late ? `เหตุผลความล่าช้า: ${input.lateReason || '-'}` : 'เอกสารครบถ้วนและยื่นภายในกรอบ 30 วัน'
        )
      },

      /** WIT0914 แขนงล่าช้า — ผบช.ชั้นต้นรับเรื่องไว้ แฟ้มเดินต่อเข้าชั้นความเห็นเจ้าหน้าที่ */
      acceptLateAppeal: (caseNo, note) => {
        const current = get().getCase(caseNo)
        if (!current?.appealFolder) return
        get().updateCase(caseNo, {
          appealFolder: {
            ...current.appealFolder,
            stage: 'officer_opinion',
            lateAcceptedAt: nowDisplay(),
            lateAcceptedBy: ACTOR.supervisor,
            lateAcceptNote: note,
          },
          status: 'รับแฟ้มอุทธรณ์ที่ยื่นเกินกำหนดไว้พิจารณา',
          owner: current.appealFolder?.appealOfficer?.name || current.assignedOfficer || ACTOR.appeal,
          next: 'ตรวจข้อเท็จจริงและเอกสาร แล้วบันทึกความเห็นของเจ้าหน้าที่ผู้รับผิดชอบ',
        })
        get().logHistory(
          caseNo,
          'ผบช.ชั้นต้นรับแฟ้มอุทธรณ์ที่ยื่นเกินกำหนดไว้พิจารณา',
          ACTOR.supervisor,
          `${note} (ไม่ปัดตกอัตโนมัติ — ให้คณะกรรมการเป็นผู้ตัดสิน)`
        )
      },

      /**
       * WIT0915-WIT0918 — บันทึกความเห็นทีละชั้นแล้วส่งต่อขั้นถัดไป
       *
       * ความเห็นเก็บแยกจากข้อความคำอุทธรณ์ของผู้ยื่นตามที่ผังกำกับไว้ (ห้ามแก้ไขคำอุทธรณ์)
       * และเรียกได้เฉพาะเมื่อ `stage` ตรงกับชั้นของผู้กด ลำดับจึงข้ามไม่ได้
       */
      recordAppealOpinion: (caseNo, level, note) => {
        const current = get().getCase(caseNo)
        const folder = current?.appealFolder
        /** ชั้นเจ้าหน้าที่ใช้ชื่อ stage ว่า 'officer_opinion' ส่วนชั้นอื่นชื่อตรงกับ level */
        const expectedStage = level === 'officer' ? 'officer_opinion' : level
        if (!current || !folder || folder.stage !== expectedStage) return

        const opinion = { at: nowDisplay(), note, by: '' }
        const steps = {
          officer: {
            key: 'officerOpinion' as const,
            by: folder.appealOfficer?.name || current.assignedOfficer || ACTOR.appeal,
            nextStage: 'supervisor' as const,
            owner: ACTOR.supervisor,
            action: 'เจ้าหน้าที่ผู้รับผิดชอบบันทึกความเห็นในแฟ้มอุทธรณ์',
            status: 'แฟ้มอุทธรณ์ · รอ ผบช.ชั้นต้นให้ความเห็น',
            next: 'ผบช.ชั้นต้น ตรวจความครบถ้วนและให้ความเห็น แล้วเสนอ ผอ.สำนัก/กอง ตามลำดับชั้น',
          },
          supervisor: {
            key: 'supervisorOpinion' as const,
            by: ACTOR.supervisor,
            nextStage: 'director' as const,
            owner: ACTOR.director,
            action: 'ผบช.ชั้นต้นให้ความเห็นแฟ้มอุทธรณ์และเสนอ ผอ.สำนัก/กอง',
            status: 'แฟ้มอุทธรณ์ · รอ ผอ.สำนัก/กอง ตรวจและลงนามเสนอ',
            next: 'ผอ.สำนัก/กอง ตรวจ ให้ความเห็น และลงนามเสนอรองเลขาธิการฯ',
          },
          director: {
            key: 'directorOpinion' as const,
            by: ACTOR.director,
            nextStage: 'deputy' as const,
            owner: ACTOR.deputySecretary,
            action: 'ผอ.สำนัก/กองตรวจ ให้ความเห็น และลงนามเสนอแฟ้มอุทธรณ์',
            status: 'แฟ้มอุทธรณ์ · รอรองเลขาธิการฯ กลั่นกรอง',
            next: 'รองเลขาธิการฯ กลั่นกรองแฟ้มอุทธรณ์และให้ความเห็นประกอบ',
          },
          deputy: {
            key: 'deputyOpinion' as const,
            by: ACTOR.deputySecretary,
            nextStage: 'secretary' as const,
            owner: ACTOR.secretary,
            action: 'รองเลขาธิการฯ กลั่นกรองแฟ้มอุทธรณ์',
            status: 'แฟ้มอุทธรณ์ · ผ่านการกลั่นกรอง รอเลขาธิการฯ',
            next: 'เลขาธิการฯ ให้ความเห็นประกอบและส่งเสนอคณะกรรมการ (ไม่ใช่ผู้วินิจฉัย)',
          },
          secretary: {
            key: 'secretaryOpinion' as const,
            by: ACTOR.secretary,
            nextStage: 'agenda' as const,
            owner: ACTOR.committee,
            action: 'เลขาธิการฯ ให้ความเห็นประกอบและส่งเสนอคณะกรรมการ',
            status: 'แฟ้มอุทธรณ์ · รอบรรจุระเบียบวาระคณะกรรมการ',
            next: 'ฝ่ายเลขานุการเสนอประธานเพื่อบรรจุวาระ แล้วคณะกรรมการวินิจฉัย',
          },
        }[level]

        get().updateCase(caseNo, {
          appealFolder: { ...folder, stage: steps.nextStage, [steps.key]: { ...opinion, by: steps.by } },
          status: steps.status,
          owner: steps.owner,
          next: steps.next,
        })
        get().logHistory(caseNo, steps.action, steps.by, note)
      },

      /** WIT0919 — ฝ่ายเลขานุการบรรจุระเบียบวาระ แฟ้มพร้อมให้คณะกรรมการวินิจฉัย (WIT0920) */
      scheduleAppealAgenda: (caseNo, agendaNo) => {
        const current = get().getCase(caseNo)
        const folder = current?.appealFolder
        if (!current || !folder || folder.stage !== 'agenda') return
        get().updateCase(caseNo, {
          appealFolder: { ...folder, agendaNo, agendaAt: nowDisplay(), agendaBy: ACTOR.committee },
          status: 'บรรจุระเบียบวาระแล้ว · รอคณะกรรมการวินิจฉัย',
          owner: ACTOR.committee,
          next: 'คณะกรรมการ ป.ป.ท. วินิจฉัยอุทธรณ์ — คำวินิจฉัยเป็นที่สุด',
        })
        get().logHistory(caseNo, 'บรรจุแฟ้มอุทธรณ์เข้าระเบียบวาระคณะกรรมการ', ACTOR.committee, `ระเบียบวาระที่ ${agendaNo}`)
      },

      // ---------- 09B : มติคณะกรรมการเรื่องอุทธรณ์ ----------
      /** WIT0920-0922 — ยืนคำสั่งเดิมแล้วปิดขั้นอุทธรณ์ / เปลี่ยนคำสั่งแล้วกลับ 08A */
      prepareAppealKb6Revision: (caseNo) => {
        const current = get().getCase(caseNo)
        const auth = useAuthStore.getState()
        if (!current || current.appealResolution?.outcome !== 'overturn' || current.appealAgainst === 'kb17' || current.appealKb6Version) return
        if (!['committee', 'admin'].includes(auth.currentRole) && !noticeWorkerAllowed(auth.currentRole, current, auth.currentOfficerUserId)) return
        const actor = auth.getCurrentUserAccount()?.name || current.owner
        const reason = `จัดทำ คบ.6 ใหม่ตามมติอุทธรณ์ที่ ${current.appealResolution.resolutionNo}`
        const forms = useFormDraftStore.getState()
        forms.ensureDraftForCase(6, caseNo, {})
        const oldDraft = { ...useFormDraftStore.getState().getDraft(6) }
        const revision = proposalSetRevisionPatch(current, actor, reason)
        const version = revision.kb6Version!
        forms.reviseForm(6, actor, reason)
        useFormDraftStore.setState((state) => ({
          drafts: { ...state.drafts, 6: Object.fromEntries(Object.entries(oldDraft).map(([key, value]) => [key, KB6_SIGNERS.some((signer) => signer.opinionField === key) ? '' : value])) },
          signatures: Object.fromEntries(Object.entries(state.signatures).filter(([key]) => !key.startsWith('kb6-'))),
          draftTouched: { ...state.draftTouched, 6: false },
        }))
        const at = nowDisplay()
        const patch: Partial<CaseItem> = {
          appealKb6PreviousResult: { dispatchedAt: current.dispatchedAt, deliveredAt: current.deliveredAt, deliveryRecipient: current.deliveryRecipient, deliveryAckType: current.deliveryAckType, deliveryAckDocument: current.deliveryAckDocument, decisionNumber: current.decisionNumber, resultReason: current.resultReason, resultAt: current.resultAt, resultSigner: current.resultSigner },
          appealKb6Version: version, kb6Version: version, kb6PreviousVersions: revision.kb6PreviousVersions,
          stage: 'staff_review', status: `จัดทำ คบ.6 v${version} ตามมติอุทธรณ์`,
          owner: protectionResponsibleName(current), next: `จัดทำ คบ.6 v${version} และเสนอผู้บังคับบัญชาชั้นต้น`,
          activity7State: 'pending', activity7Label: 'จัดทำชุดเสนอใหม่ตามมติอุทธรณ์',
          kb6PreparedAt: undefined, kb6PreparedBy: undefined, kb6Signed: false, kb6Forwarded: false,
          kb6SupervisorSignedAt: undefined, kb6SupervisorSignedBy: undefined,
          kb6DirectorSignedAt: undefined, kb6DirectorSignedBy: undefined,
          kb6DeputySignedAt: undefined, kb6DeputySignedBy: undefined,
          kb6SecretarySignedAt: undefined, kb6SecretarySignedBy: undefined,
          secretaryReviewState: 'pending', deputyReviewState: 'pending',
          secretarySignedAt: undefined, secretarySignedBy: undefined, resultAt: undefined, resultReason: undefined, resultSigner: undefined, decisionNumber: undefined, outgoingSignedAt: undefined, outgoingSignedBy: undefined,
          preliminaryDecision: undefined, noticeDecisionDrafts: undefined,
          directorReturn: false, secretaryReturnRework: true,
          dispatchedAt: undefined, deliveredAt: undefined, deliveryRecipient: undefined, deliveryAckType: undefined, deliveryAckDocument: undefined,
          assignmentHistory: [...(current.assignmentHistory || []), { at, actor, action: reason, detail: `เก็บ คบ.6 v${version - 1} และ คบ.10 เดิมไว้ ไม่สร้าง คบ.1 ใหม่` }],
        }
        set((state) => ({ cases: state.cases.map((item) => item.no === caseNo ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item) }))
      },

      recordAppealResolution: (caseNo, input) => {
        const current = get().getCase(caseNo)
        if (!current || isCaseClosed(current)) return
        if (hasSignedResultNotice(current) && (!['committee', 'admin'].includes(useAuthStore.getState().currentRole) || current.appealFolder?.stage !== 'agenda')) return
        /** WIT0920 รับมาจาก WIT0919 เท่านั้น — แฟ้มที่ยังไม่บรรจุวาระจะข้ามมาบันทึกมติไม่ได้ */
        if (current.appealResolution || (current.appealFolder && current.appealFolder.stage !== 'agenda')) return
        const overturn = input.outcome === 'overturn'
        const workflowPatch: Partial<CaseItem> = {
          appealResolution: {
            ...input,
            resolvedAt: nowDisplay(),
            against: current.appealAgainst || 'kb10',
          },
          appealFolder: current.appealFolder ? { ...current.appealFolder, stage: 'resolved' } : undefined,
          stage: overturn ? 'method_operation' : current.appealAgainst === 'kb17' ? 'terminated' : 'notice',
          status: overturn ? 'คณะกรรมการเปลี่ยนแปลงคำสั่ง' : 'คณะกรรมการยืนคำสั่งเดิม · ปิดขั้นอุทธรณ์',
          owner: protectionResponsibleName(current),
          next: overturn
            ? 'ตรวจฐานคำสั่งใหม่และแยกแนวทางคุ้มครอง — ไม่สร้าง คบ.1 ใหม่'
            : 'ทำหนังสือแจ้งผลอุทธรณ์ผ่านสารบรรณ เก็บหลักฐานการรับ และปิดขั้นอุทธรณ์',
          activity7State: overturn ? 'approved' : 'rejected',
          activity7Label: overturn ? 'อุทธรณ์สำเร็จ — เปลี่ยนแปลงคำสั่ง' : 'คณะกรรมการยืนคำสั่งเดิม',
        }
        set((state) => ({ cases: state.cases.map((item) => item.no === caseNo ? { ...item, ...workflowPatch, updatedAt: new Date().toISOString() } : item) }))
        get().logHistory(
          caseNo,
          overturn ? 'มติคณะกรรมการ: เปลี่ยนแปลงคำสั่ง' : 'มติคณะกรรมการ: ยืนคำสั่งเดิม',
          ACTOR.committee,
          `มติที่ ${input.resolutionNo} — ${input.note}`
        )
        if (overturn && current.appealAgainst !== 'kb17') get().prepareAppealKb6Revision(caseNo)
      },

      /**
       * WIT0921 / WIT0922 — หนังสือแจ้งผลอุทธรณ์ (ไม่มีเลข คบ.)
       *
       * ผังกำหนดสามอย่างที่ต้องเกิดจริง: จัดทำหนังสือ · ส่งผ่านระบบสารบรรณเดิม ·
       * เก็บหลักฐานการรับ แล้วจึงถือว่าขั้นอุทธรณ์ปิดสมบูรณ์ — มติอย่างเดียวไม่พอ
       * ใช้ได้ทั้งแขนงยืนคำสั่งเดิมและแขนงเปลี่ยนคำสั่ง เพราะผังให้แจ้งผลทั้งสองทาง
       */
      recordAppealNotice: (caseNo, input) => {
        const current = get().getCase(caseNo)
        if (!current?.appealResolution) return
        const officer = current.assignedOfficer || ACTOR.appeal
        const uphold = current.appealResolution.outcome === 'uphold'
        get().updateCase(caseNo, {
          appealResolution: {
            ...current.appealResolution,
            noticeDocumentName: input.documentName,
            noticeRegistryNo: input.registryNo,
            noticeSentAt: input.sentAt,
            noticeDeliveredAt: input.deliveredAt,
            noticeRecipient: input.recipient,
            noticeAckDocument: input.ackDocument,
            noticeRecordedAt: nowDisplay(),
            noticeRecordedBy: officer,
          },
          status: uphold ? 'แจ้งผลอุทธรณ์แล้ว · ปิดขั้นอุทธรณ์' : current.appealKb6Version ? current.status : 'แจ้งผลอุทธรณ์แล้ว · ดำเนินการตามคำสั่งใหม่',
          owner: officer,
          next: uphold
            ? 'สิ้นสุดขั้นอุทธรณ์ — คำวินิจฉัยของคณะกรรมการ ป.ป.ท. เป็นที่สุด'
            : current.appealKb6Version ? current.next : 'จัดทำ คบ.6 รุ่นใหม่ตามมติอุทธรณ์ — ไม่สร้าง คบ.1 ใหม่',
        })
        get().logHistory(
          caseNo,
          'บันทึกหนังสือแจ้งผลอุทธรณ์และหลักฐานการรับ',
          officer,
          `${input.documentName} · ทะเบียนส่งที่ ${input.registryNo} · ผู้รับ ${input.recipient}`
        )
      },

      addCaseDocument: (caseNo, document) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const docs = current.documents || []
        /** เอกสารชื่อซ้ำเดิมในแฟ้ม = แก้ไข/อัปโหลดฉบับใหม่ทับ (revise) ไม่ซ้ำชื่อ = สร้างใหม่ (create) — ใช้แยกข้อความ Audit Log เท่านั้น ไม่กระทบเอกสารเดิม */
        const isRevision = docs.some((d) => d.name === document.name)
        get().updateCase(caseNo, {
          documents: [...docs, document],
        })
        get().logHistory(
          caseNo,
          isRevision ? `แก้ไข/อัปโหลดเอกสารฉบับใหม่: ${document.name}` : `จัดทำเอกสารใหม่เข้าแฟ้ม: ${document.name}`,
          document.uploadedBy || ACTOR.officer,
          document.note || `หมวด: ${document.category}`
        )
      },

      removeCaseDocument: (caseNo, documentId) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const docs = current.documents || []
        get().updateCase(caseNo, {
          documents: docs.filter((d) => d.id !== documentId),
        })
      },

      addExtraForm: (caseNo, formNo) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const extras = current.extraForms || []
        if (extras.includes(formNo)) return
        get().updateCase(caseNo, {
          extraForms: [...extras, formNo],
        })
      },

      removeExtraForm: (caseNo, formNo) => {
        const current = get().getCase(caseNo)
        if (!current) return
        const extras = current.extraForms || []
        get().updateCase(caseNo, {
          extraForms: extras.filter((n) => n !== formNo),
        })
      },

      resetToDefault: () => {
        set({ ...getDefaultCaseState(), customTransferAgencies: [] })
      },
    }),
    {
      name: 'ecmis-case-storage-v2',
    }
  )
)

export { ACTOR as CASE_ACTORS, currentReportPeriod }
