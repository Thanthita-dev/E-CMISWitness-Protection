import { CaseItem, Kb6SignerRole, MonthlyReport, OutgoingNoticeFormNo } from '../types/case'
import { UserRole } from '../types/user'

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

/** ช่องลายมือชื่อท้ายบันทึกข้อตกลง คบ.11 */
export const KB11_SIGN_SLOTS = [
  { key: 'kb11-witness', label: 'พยานผู้รับการคุ้มครอง', role: 'พยาน' },
  { key: 'kb11-officer', label: 'ผู้ให้การคุ้มครอง (เจ้าพนักงาน ป.ป.ท.)', role: 'เจ้าพนักงาน ป.ป.ท.' },
  { key: 'kb11-attest1', label: 'พยานในการทำข้อตกลง คนที่ 1', role: 'พยานในการทำข้อตกลง' },
  { key: 'kb11-attest2', label: 'พยานในการทำข้อตกลง คนที่ 2', role: 'พยานในการทำข้อตกลง' },
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
 */
export const pendingKb13Report = (caseItem: CaseItem): MonthlyReport | undefined =>
  (caseItem.monthlyReports || []).find((r) => !r.officerSignedAt || !r.witnessSignedAt)

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
  if (signer.signedAt(caseItem)) return false
  if (caseItem.stage !== signer.stage) return false
  return currentRole === 'admin' || currentRole === signer.userRole
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
    return KB6_SIGNERS.some((s) => canEditKb6Opinion(s, currentRole, caseItem))
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
 * เจ้าหน้าที่เสนอ คบ.8 เข้ารอบลงนามได้หรือยัง — WIT0817 (จัดทำร่าง) เสร็จแล้ว
 * และยังไม่เคยเสนอ/ยังไม่ได้ลงนาม ใช้ตัดสินปุ่ม "ส่งเสนอเลขาธิการฯ ลงนาม" ในรายการแบบฟอร์มของแฟ้ม
 */
export const canSubmitKb8Now = (caseItem: CaseItem, canEditDossier: boolean): boolean => {
  if (caseItem.kb8SignedAt || caseItem.kb8SubmittedAt) return false
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
