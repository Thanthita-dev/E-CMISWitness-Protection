import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { RelatedPerson, AttachmentSet, AttachmentFile } from '../types/case'
import { KB6_LEGAL_REFS_FIELD, KB6_DEFAULT_LEGAL_REFS } from '../lib/constants'
import { KB6_SIGNERS, canEditKb6Opinion } from '../lib/formSignature'
import { useAuthStore } from './useAuthStore'
import { isCaseClosed } from '../lib/permissions'
// eslint-disable-next-line import/no-cycle -- useCaseStore เก็บแฟ้มที่ draft ของ คบ.6 ผูกอยู่ (draftCaseNo)
// ใช้เฉพาะผ่าน .getState() ภายในฟังก์ชัน ไม่ได้อ่านตอนโหลดโมดูล จึงปลอดภัยจาก circular import
import { useCaseStore } from './useCaseStore'

/** ช่องความเห็นของข้อ 10–13 ใน คบ.6 — ใช้กันสิทธิ์แก้ไขข้ามลำดับชั้นที่ระดับ store (WIT0513) */
const KB6_OPINION_FIELDS = new Set(KB6_SIGNERS.map((s) => s.opinionField))

/**
 * เวอร์ชันของแบบ คบ. หนึ่งฉบับ — เก็บสำเนา draft ณ เวลาที่ปิดเวอร์ชัน
 * flow WIT0506 / WIT0511 / WIT0708 / WIT1119: แก้ไขหลังถูกตีกลับต้องสร้าง Version ใหม่
 * และเก็บฉบับเดิมไว้ ห้ามแก้ทับ
 */
export interface FormRevision {
  version: number
  at: string
  by: string
  reason: string
  snapshot: Record<string, any>
  signatures?: CaseFormBundle['signatures']
}

export interface FormLock {
  lockedAt: string
  lockedBy: string
  reason: string
}

/**
 * GAP-010 — แบบที่ร่างและลายมือชื่อต้อง "แยกตามแฟ้ม" (คบ.3 / คบ.4 / คบ.5 / คบ.6)
 * ร่างที่ใช้งานอยู่ (drafts / signatures / locks / revisions) คือของแฟ้มที่ draftCaseNo ระบุเสมอ
 * เมื่อเปิดแบบเดียวกันจากอีกแฟ้ม ระบบเก็บของแฟ้มเดิมไว้ใน caseDrafts แล้วสลับของแฟ้มใหม่เข้ามาแทน
 * — ข้อมูลพยานและความเห็นของแฟ้มหนึ่งจึงไม่รั่วไปโผล่ในอีกแฟ้ม และด่านตรวจอ่านจากร่างของแฟ้มที่เปิดอยู่จริง
 */
export const PER_CASE_FORMS = [3, 4, 5, 6, 7, 9, 10, 11, 14, 16]

/** ข้อมูลของแบบ คบ. ที่แฟ้มหนึ่งเก็บไว้ขณะที่ไม่ได้เป็นแฟ้มที่เปิดอยู่ */
export interface CaseFormBundle {
  drafts: Record<number, Record<string, any>>
  touched: Record<number, boolean>
  locks: Record<number, FormLock>
  revisions: Record<number, FormRevision[]>
  signatures: Record<string, { signed: boolean; signerName: string; signedAt: string; signatureImage?: string }>
}

const EMPTY_BUNDLE: CaseFormBundle = { drafts: {}, touched: {}, locks: {}, revisions: {}, signatures: {} }
const EMPTY_FORM_DRAFT: Record<string, any> = {}

interface FormDraftState {
  currentFormId: number
  section: number
  manualPage: number | null
  drafts: Record<number, Record<string, any>>
  /**
   * แฟ้มคำร้องที่ร่างของแต่ละแบบ คบ. เป็นของ — กันข้อมูลของคำขอหนึ่งรั่วไปแสดงเป็นค่าตั้งต้นของอีกคำขอหนึ่ง
   * เปิดแบบเดียวกันจากคนละแฟ้มเมื่อใด ร่างเดิมจะถูกแทนที่ด้วยค่าตั้งต้นของแฟ้มใหม่
   */
  draftCaseNo: Record<number, string | undefined>
  /** แบบที่ถูกแก้ไขด้วยมือแล้ว — ใช้แยก "ข้อมูลจริงของแฟ้ม" ออกจากค่าตัวอย่างที่ระบบตั้งไว้ */
  draftTouched: Record<number, boolean>
  /** ข้อมูลของแบบ PER_CASE_FORMS ที่แฟ้มอื่น (ไม่ใช่แฟ้มที่เปิดอยู่) เก็บไว้ — key คือเลขคำร้อง */
  caseDrafts: Record<string, CaseFormBundle>
  /** ร่างหนังสือเดิมที่ไม่ระบุแฟ้ม: เก็บอ้างอิงโดยไม่ถือว่าเป็นของแฟ้มแรกที่เปิด */
  legacyNoticeDrafts?: Partial<Record<9 | 10, CaseFormBundle>>
  /** Unowned legacy agreement content/signatures must never be assigned to a new case. */
  legacyKb11Draft?: CaseFormBundle
  /** ประวัติเวอร์ชันของแต่ละแบบ คบ. — index 0 คือฉบับแรกสุด */
  revisions: Record<number, FormRevision[]>
  /** แบบที่ถูกล็อกหลังลงนาม — แก้ไขไม่ได้จนกว่าจะสร้างเวอร์ชันใหม่ */
  locks: Record<number, FormLock>
  relatedPersons: RelatedPerson[]
  attachmentSets: AttachmentSet[]
  signatures: Record<string, { signed: boolean; signerName: string; signedAt: string; signatureImage?: string }>

  setCurrentFormId: (id: number) => void
  setSection: (section: number) => void
  setManualPage: (page: number | null) => void
  updateField: (formId: number, field: string, value: any) => void
  /**
   * เขียนช่องที่เป็นส่วนของการลงนามความเห็นตามลำดับชั้น (ชื่อผู้ลงนาม / ความเห็นของข้อนั้น)
   * ข้ามการล็อกได้ เพราะการล็อกมีไว้กันเนื้อหาของเจ้าหน้าที่ถูกแก้ทับหลังมีลายมือชื่อ
   * ไม่ได้มีไว้กันผู้บังคับบัญชาชั้นสูงกว่าบันทึกความเห็นข้อของตนเองต่อจากชั้นก่อนหน้า
   */
  updateSignedField: (formId: number, field: string, value: any) => void
  getDraft: (formId: number) => Record<string, any>
  /**
   * เตรียมร่างของแบบ คบ. ให้ตรงกับแฟ้มที่กำลังเปิด
   * แฟ้มเดิม = ไม่แตะร่างที่กรอกค้างไว้ · แฟ้มใหม่ = ล้างแล้วเริ่มจากค่าตั้งต้นที่ส่งมา
   */
  ensureDraftForCase: (formId: number, caseNo: string, seed: Record<string, any>) => void

  /** ล็อกฉบับลงนาม — ห้ามแก้ทับ (WIT0513 / WIT0611 / WIT1140) */
  lockForm: (formId: number, lockedBy: string, reason: string) => void
  isFormLocked: (formId: number) => boolean
  getFormLock: (formId: number) => FormLock | undefined
  /**
   * สร้างเวอร์ชันใหม่จากฉบับปัจจุบัน: เก็บ snapshot ฉบับเดิมไว้ แล้วปลดล็อกให้แก้ไขต่อได้
   * คืนหมายเลขเวอร์ชันใหม่
   */
  reviseForm: (formId: number, by: string, reason: string) => number
  getRevisions: (formId: number) => FormRevision[]
  getFormVersion: (formId: number) => number

  addRelatedPerson: (person: Omit<RelatedPerson, 'id'>) => void
  updateRelatedPerson: (id: number, updates: Partial<RelatedPerson>) => void
  removeRelatedPerson: (id: number) => void

  addAttachmentSet: (category: string, description: string, formId?: number) => number
  addFileToSet: (setId: number, file: any) => void
  removeFileFromSet: (setId: number, fileIndex: number) => void
  removeAttachmentSet: (setId: number) => void
  /** คืน id ชุดเอกสารเริ่มต้นของแบบ คบ. นั้น สร้างให้ถ้ายังไม่มี — ใช้ตอนอัปโหลดที่ระดับโฟลเดอร์ คบ. */
  ensureSetForForm: (formId: number) => number
  /** เพิ่มไฟล์ที่มี metadata อยู่แล้วเข้าชุดเอกสาร (ใช้ตอนย้ายไฟล์ ไม่ประทับเวลาใหม่) */
  attachFilesToSet: (setId: number, files: AttachmentFile[]) => void
  /** ลบหลายไฟล์พร้อมกันด้วย index (ปลอดภัยกว่าเรียก removeFileFromSet ทีละครั้ง) */
  removeFilesFromSet: (setId: number, fileIndexes: number[]) => void

  signDocument: (key: string, signerName: string, signatureImage?: string) => void
  resetDrafts: () => void
}

/**
 * WIT1148 — แบบ คบ. ฉบับนี้เป็นของแฟ้มที่ปิดงานคุ้มครองแล้วหรือไม่ (อ่านจากแฟ้มที่ร่างผูกอยู่)
 * ใช้ปิดทางแก้ไข/สร้างเวอร์ชันใหม่/แนบ-ลบไฟล์ที่ระดับ store ซ้ำกับการซ่อนปุ่มใน UI
 */
const formBelongsToClosedCase = (draftCaseNo: Record<number, string | undefined>, formId: number): boolean => {
  const owner = draftCaseNo[formId]
  if (!owner) return false
  return isCaseClosed(useCaseStore.getState().cases.find((c) => c.no === owner))
}

const setBelongsToClosedCase = (
  state: Pick<FormDraftState, 'attachmentSets' | 'draftCaseNo'>,
  setId: number
): boolean => {
  const set = state.attachmentSets.find((s) => s.id === setId)
  return set ? formBelongsToClosedCase(state.draftCaseNo, set.formId ?? 1) : false
}

const withoutKey = <T,>(rec: Record<number, T>, key: number): Record<number, T> => {
  const next = { ...rec }
  delete next[key]
  return next
}

const withoutPrefix = <T,>(rec: Record<string, T>, prefix: string): Record<string, T> =>
  Object.fromEntries(Object.entries(rec).filter(([k]) => !k.startsWith(prefix)))

/**
 * ร่างแบบ คบ. ของ "แฟ้มที่ระบุ" — ใช้เป็น selector ของด่านตรวจ/การ์ดในหน้าแฟ้ม
 * แฟ้มที่ร่างที่ใช้งานอยู่เป็นของ (หรือยังไม่มีเจ้าของ) อ่านร่างที่ใช้งานอยู่ · แฟ้มอื่นอ่านจากที่เก็บไว้ ไม่เคยเปิดแบบ = ว่าง
 */
export const selectCaseDraft = (
  s: Pick<FormDraftState, 'drafts' | 'draftCaseNo' | 'caseDrafts'>,
  formId: number,
  caseNo?: string
): Record<string, any> => {
  if (!caseNo || !PER_CASE_FORMS.includes(formId)) return s.drafts[formId] || EMPTY_FORM_DRAFT
  const owner = s.draftCaseNo[formId]
  if ((formId === 9 || formId === 10 || formId === 11) && owner === undefined) return s.caseDrafts?.[caseNo]?.drafts[formId] || EMPTY_FORM_DRAFT
  if (owner === undefined || owner === caseNo) return s.drafts[formId] || EMPTY_FORM_DRAFT
  return s.caseDrafts?.[caseNo]?.drafts[formId] || EMPTY_FORM_DRAFT
}

export const DEFAULT_KB1_DRAFT: Record<string, any> = {
  // หัวเอกสาร
  'เลขที่แบบ': '012',
  'ปีที่ยื่น': '69',
  'วันเดือนปี': '4 สิงหาคม 2569',
  // 1. ผู้ยื่นคำร้อง
  'คำนำหน้า': 'นางสาว',
  'ชื่อ': 'กมลชนก',
  'นามสกุล': 'บุญรักษา',
  'ฐานะผู้ยื่น': 'พยาน',
  'บ้านเลขที่': '99/12',
  'หมู่ที่': '3',
  'ตำบล': 'คลองหนึ่ง',
  'อำเภอ': 'คลองหลวง',
  'จังหวัด': 'ปทุมธานี',
  'รหัสไปรษณีย์': '12120',
  'เบอร์โทรศัพท์': '081-234-5678',
  'เลขบัตรประชาชน': '1100400123456',
  // 2. ข้อมูลพยาน
  'พยานชื่อ': 'นางสาวกมลชนก',
  'พยานนามสกุล': 'บุญรักษา',
  'อาชีพ': 'รับราชการ',
  'สถานภาพ': 'โสด',
  'ชื่อบิดา': 'นายสมชาย บุญรักษา',
  'ชื่อมารดา': 'นางสมศรี บุญรักษา',
  'พยานที่อยู่': '99/12 หมู่ที่ 3 ตำบลคลองหนึ่ง อำเภอคลองหลวง',
  'พยานที่อยู่ต่อ': 'จังหวัดปทุมธานี 12120',
  'พยานโทรศัพท์': '081-234-5678',
  'สถานที่ทำงาน': 'เทศบาลตำบลโคกสะอาด',
  'พยานเลขบัตรประชาชน': '1100400123456',
  'อีเมล': 'kamonchanok.b@gmail.com',
  // 3. ผู้ติดต่อได้
  'ผู้ติดต่อได้': 'นายสมชาย บุญรักษา',
  'ผู้ติดต่อที่อยู่': '99/12 หมู่ที่ 3 ตำบลคลองหนึ่ง อำเภอคลองหลวง จังหวัดปทุมธานี',
  'ผู้ติดต่อโทรศัพท์': '089-111-2233',
  // 4. ความประสงค์
  'ช่วงเวลาคุ้มครอง': 'ได้มาเป็นพยาน',
  'เกี่ยวข้องกับคดี': 'กบค. 001/2569 (ทุจริตจัดซื้ออุปกรณ์)',
  // 5. พฤติการณ์
  'ภัยคุกคามที่เลือก': ['โทรศัพท์ข่มขู่', 'ยานพาหนะติดตาม'],
  'พฤติการณ์ภัยคุกคาม':
    'ถูกบุคคลโทรศัพท์ข่มขู่ให้กลับคำให้การในการตรวจรับพัสดุ และมีรถยนต์ต้องสงสัยมาจอดเฝ้าหน้าบ้าน',
  // 7. เอกสารประกอบ
  'เอกสารประกอบ': ['หลักฐานแสดงการเป็นพยาน', 'หลักฐานแสดงความเสียหาย'],
  'ตำแหน่งเจ้าพนักงาน': 'นักสืบสวนสอบสวนชำนาญการ',
}

export const DEFAULT_KB2_DRAFT: Record<string, any> = {
  'เลขที่แบบ': '013',
  'ปีที่ยื่น': '69',
  'วันเดือนปี': '5 สิงหาคม 2569',
  'คำนำหน้า': 'นาย',
  'ชื่อผู้แจ้ง': 'ศักดา',
  'นามสกุลผู้แจ้ง': 'มั่นคง',
  'อายุ': '46',
  'เบอร์โทรศัพท์': '089-987-6543',
  'ฐานะที่เป็น': 'ผู้แจ้งเบาะแส',
  'ช่วงเวลาคุ้มครอง': 'ขณะเป็นพยาน',
  'อ้างอิงคดี': 'กบค. 001/2569',
  'รายละเอียดข้อเท็จจริง':
    'ผู้แจ้งระบุว่าถูกใช้อาวุธปืนยิงข่มขู่บริเวณหน้าบ้านพักเมื่อกลางดึกที่ผ่านมา เนื่องจากเป็นพยานในคดีเรียกรับผลประโยชน์การก่อสร้างเขื่อนกั้นดิน',
  'ช่องทางการสื่อสาร': 'โทรศัพท์สายด่วน 1206',
  'วันเวลารับแจ้ง': '2026-08-05T08:25',
  'เจ้าหน้าที่ผู้รับแจ้ง': 'นายธนาธิป สุวรรณเวช',
  'ตำแหน่งผู้รับแจ้ง': 'นักสืบสวนสอบสวนชำนาญการ',
}

export const DEFAULT_KB3_DRAFT: Record<string, any> = {
  'เลขที่แบบ': '012',
  'ปีที่ยื่น': '69',
  'สถานที่บันทึก': 'สำนักงาน ป.ป.ท. (ส่วนกลาง)',
  'วันที่': '4',
  'เดือน': 'สิงหาคม',
  'พ.ศ.': '2569',
  'ผู้ให้ถ้อยคำ': 'นางสาวกมลชนก บุญรักษา',
  'สัญชาติ': 'ไทย',
  'เชื้อชาติ': 'ไทย',
  'อาชีพ': 'เจ้าพนักงานพัสดุชำนาญงาน',
  'บ้านเลขที่': '99/12',
  'หมู่ที่': '3',
  'ตำบล': 'คลองหนึ่ง',
  'อำเภอ': 'คลองหลวง',
  'จังหวัด': 'ปทุมธานี',
  'รหัสไปรษณีย์': '12120',
  'เบอร์โทรศัพท์': '081-234-5678',
  'ชนิดหนังสือสำคัญ': 'บัตรประจำตัวประชาชน',
  'เลขบัตรประชาชน': '1100400123456',
  'ชื่อพยาน': 'นางสาวกมลชนก บุญรักษา',
  'บันทึกถ้อยคำ':
    'ข้าพเจ้าได้ให้ถ้อยคำต่อเจ้าพนักงาน ป.ป.ท. ว่าได้รับแจ้งคำสั่งให้ตรวจรับงานอันเป็นเท็จ เมื่อปฏิเสธจึงถูกข่มขู่ทางวาจาและติดตามดูพฤติกรรม',
  'ความเห็นเจ้าหน้าที่':
    'จากการตรวจสอบเบื้องต้น ผู้ร้องมีมูลเหตุถูกคุกคามจริงอันเนื่องมาจากการเป็นพยานในสำนวน กบค. 001/2569 เห็นควรพิจารณามาตรการคุ้มครองเบื้องต้น',
  'ตำแหน่งเจ้าพนักงาน': 'นักสืบสวนสอบสวนชำนาญการ',
}

export const DEFAULT_KB6_DRAFT: Record<string, any> = {
  'ส่วนราชการ': 'กลุ่มงานคุ้มครองพยาน กองบริหารคดี สำนักงาน ป.ป.ท.',
  'โทร': '0 2502 6670',
  'เลขที่เอกสาร': '05/423',
  'วันที่': '2026-08-31',
  'ผลประเมินภัย':
    'มีความเสี่ยงระดับสูง มีแนวโน้มถูกคุกคามรุนแรงขึ้นหากสำนวนคดีเข้าสู่กระบวนการไต่สวนข้อเท็จจริงเต็มรูปแบบ',
  'รูปแบบการคุ้มครอง': 'จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัย',
  'มาตรการทั่วไป':
    '1. จัดเจ้าหน้าที่ร่วมสังเกตการณ์บริเวณที่พักอาศัย\n2. กำหนดสายด่วนประสานงานฉุกเฉินตลอด 24 ชั่วโมง\n3. จัดระบบเดินทางไป-กลับที่ทำงาน',
  // ข้อ 10 ไม่ตั้งค่าเริ่มต้น — ผู้บังคับบัญชาชั้นต้นเป็นผู้เขียนความเห็นของตนเองในขั้นตอนของตน
  'ความเห็นผู้อำนวยการ': 'เห็นชอบ เสนอรองเลขาธิการ ป.ป.ท. กลั่นกรองก่อนเสนอเลขาธิการ ป.ป.ท. เพื่อโปรดพิจารณาอนุมัติต่อไป',
  'ชุดชื่อ1': 'ร.ต.อ. อนุชา กล้าหาญ',
  'ชุดตำแหน่ง1': 'หัวหน้าชุดปฏิบัติการ',
  'ชุดชื่อ2': 'ส.ต.อ. ธนกฤต มั่นใจ',
  'ชุดตำแหน่ง2': 'เจ้าหน้าที่คุ้มครอง',
  // 7. กฎหมาย กฎ ระเบียบที่เกี่ยวข้อง — แก้ไข/เพิ่ม/ลบได้เมื่อกฎหมายเปลี่ยน
  [KB6_LEGAL_REFS_FIELD]: [...KB6_DEFAULT_LEGAL_REFS],
}

export const DEFAULT_KB11_DRAFT: Record<string, any> = {
  'รูปแบบที่เลือก': ['3.1', '3.3'],
}

export const useFormDraftStore = create<FormDraftState>()(
  persist(
    (set, get) => ({
      currentFormId: 1,
      section: 0,
      manualPage: null,
      drafts: {
        1: DEFAULT_KB1_DRAFT,
        2: DEFAULT_KB2_DRAFT,
        3: DEFAULT_KB3_DRAFT,
        6: DEFAULT_KB6_DRAFT,
        11: DEFAULT_KB11_DRAFT,
      },
      draftCaseNo: {},
      draftTouched: {},
      caseDrafts: {},
      legacyNoticeDrafts: {},
      revisions: {},
      locks: {},
      relatedPersons: [
        { id: 1, title: 'นาย', firstName: 'สมชาย', lastName: 'บุญรักษา', citizenId: '3100500987654', relation: 'บิดา', risk: 'สูง' },
        { id: 2, title: 'นาง', firstName: 'สมศรี', lastName: 'บุญรักษา', citizenId: '3100500987655', relation: 'มารดา', risk: 'ปานกลาง' },
      ],
      attachmentSets: [
        {
          id: 1,
          formId: 1,
          category: 'หลักฐานยืนยันตัวตน',
          description: 'สำเนาบัตรประชาชนและสำเนาทะเบียนบ้าน',
          files: [
            { name: 'บัตรประชาชน_กมลชนก.pdf', size: 1048576, type: 'application/pdf', uploadedAt: '04/08/2569 09:20', uploadedBy: 'เจ้าหน้าที่' },
          ],
        },
        {
          id: 2,
          formId: 1,
          category: 'หลักฐานการถูกข่มขู่คุกคาม',
          description: 'ภาพถ่ายข้อความแชทและคลิปเสียงบันทึกการโทร',
          files: [
            { name: 'ภาพแชทข่มขู่.jpg', size: 524288, type: 'image/jpeg', uploadedAt: '04/08/2569 09:22', uploadedBy: 'เจ้าหน้าที่' },
          ],
        },
      ],
      signatures: {
        'kb1-applicant': { signed: true, signerName: 'นางสาวกมลชนก บุญรักษา', signedAt: '04/08/2569 09:30' },
        'kb1-officer': { signed: true, signerName: 'นางสาวอรุณี ใจมั่น', signedAt: '04/08/2569 09:35' },
        'kb3-witness': { signed: true, signerName: 'นางสาวกมลชนก บุญรักษา', signedAt: '04/08/2569 10:15' },
        'kb3-officer': { signed: true, signerName: 'นางสาวอรุณี ใจมั่น', signedAt: '04/08/2569 10:20' },
        'kb6-officer': { signed: true, signerName: 'นางสาวอรุณี ใจมั่น', signedAt: '04/08/2569 11:00' },
        'kb6-supervisor': { signed: false, signerName: 'นายกิตติศักดิ์ ธรรมรักษ์', signedAt: '' },
        'kb6-director': { signed: false, signerName: 'นายวีระยุทธ พิทักษ์ธรรม', signedAt: '' },
      },

      setCurrentFormId: (id) => set({ currentFormId: id, section: 0, manualPage: null }),
      setSection: (section) => set({ section, manualPage: null }),
      setManualPage: (page) => set({ manualPage: page }),

      /**
       * ถูกล็อกแล้วแก้ไม่ได้ — ต้อง reviseForm ก่อนจึงจะแก้ต่อได้
       * ช่องความเห็นข้อ 10-13 ของ คบ.6 มีการ์ดตรวจสิทธิ์เพิ่ม (WIT0513 / TC-012) — กันไว้ที่ระดับ store ด้วย
       * เผื่อมีช่องกรอกอื่นเรียก updateField ตรงมาที่ฟิลด์เหล่านี้ (ช่องความเห็นในหน้าฟอร์มใช้ updateSignedField
       * เป็นหลักเพื่อข้ามล็อกทั้งฉบับได้เป็นรายข้อ แต่ยังต้องมีการ์ดชั้นนี้ไว้เป็น defense-in-depth)
       */
      updateField: (formId, field, value) => {
        const caseNo = get().draftCaseNo[formId]
        if ((formId === 9 || formId === 10) && caseNo && useCaseStore.getState().getCase(caseNo)?.resultNotices?.[formId]?.original) return
        if (get().locks[formId]) return
        if (formBelongsToClosedCase(get().draftCaseNo, formId)) return
        if (formId === 6 && KB6_OPINION_FIELDS.has(field)) {
          const caseNo = get().draftCaseNo[6]
          const caseItem = caseNo ? useCaseStore.getState().getCase(caseNo) : undefined
          if (caseItem) {
            const signer = KB6_SIGNERS.find((s) => s.opinionField === field)
            const currentRole = useAuthStore.getState().currentRole
            if (signer && !canEditKb6Opinion(signer, currentRole, caseItem)) return
          }
        }
        set((state) => ({
          drafts: {
            ...state.drafts,
            [formId]: {
              ...(state.drafts[formId] || {}),
              [field]: value,
            },
          },
          draftTouched: { ...state.draftTouched, [formId]: true },
        }))
      },

      updateSignedField: (formId, field, value) => {
        if (formId === 9 || formId === 10) return
        if (formBelongsToClosedCase(get().draftCaseNo, formId)) return
        set((state) => ({
          drafts: {
            ...state.drafts,
            [formId]: {
              ...(state.drafts[formId] || {}),
              [field]: value,
            },
          },
          draftTouched: { ...state.draftTouched, [formId]: true },
        }))
      },

      ensureDraftForCase: (formId, caseNo, seed) => {
        if (get().draftCaseNo[formId] === caseNo) return

        if (PER_CASE_FORMS.includes(formId)) {
          const state = get()
          const owner = state.draftCaseNo[formId]
          /** ร่างเดิมยังไม่เคยผูกกับแฟ้มใด (ข้อมูลตั้งต้น/mock state) — แฟ้มแรกที่เปิดรับไปเป็นของตน */
          if (owner === undefined && (formId === 9 || formId === 10 || formId === 11)) {
            const prefix = `kb${formId}-`
            const incoming = state.caseDrafts?.[caseNo] || EMPTY_BUNDLE
            const rawSignatures = Object.fromEntries(Object.entries(state.signatures).filter(([key]) => key.startsWith(prefix)))
            const raw = state.drafts[formId] || {}
            const hasLegacy = Object.keys(raw).length > 0 || Object.keys(rawSignatures).length > 0 || Boolean(state.locks[formId]) || Boolean(state.revisions[formId]?.length)
            const rawBundle: CaseFormBundle = {
              drafts: { [formId]: raw }, touched: { [formId]: Boolean(state.draftTouched[formId]) },
              locks: state.locks[formId] ? { [formId]: state.locks[formId] } : {},
              revisions: state.revisions[formId] ? { [formId]: state.revisions[formId] } : {}, signatures: rawSignatures,
            }
            set({
              ...(formId === 11
                ? hasLegacy && !state.legacyKb11Draft ? { legacyKb11Draft: JSON.parse(JSON.stringify(rawBundle)) } : {}
                : hasLegacy && !state.legacyNoticeDrafts?.[formId] ? { legacyNoticeDrafts: { ...state.legacyNoticeDrafts, [formId]: JSON.parse(JSON.stringify(rawBundle)) } } : {}),
              drafts: { ...state.drafts, [formId]: incoming.drafts[formId] ? { ...incoming.drafts[formId] } : { ...seed } },
              draftCaseNo: { ...state.draftCaseNo, [formId]: caseNo },
              draftTouched: { ...state.draftTouched, [formId]: Boolean(incoming.touched[formId]) },
              locks: incoming.locks[formId] ? { ...state.locks, [formId]: incoming.locks[formId] } : withoutKey(state.locks, formId),
              revisions: incoming.revisions[formId] ? { ...state.revisions, [formId]: incoming.revisions[formId] } : withoutKey(state.revisions, formId),
              signatures: { ...withoutPrefix(state.signatures, prefix), ...Object.fromEntries(Object.entries(incoming.signatures).filter(([key]) => key.startsWith(prefix))) },
            })
            return
          }
          if (owner === undefined && (formId === 7 || formId === 16)) {
            set({ drafts: { ...state.drafts, [formId]: { ...seed } }, draftCaseNo: { ...state.draftCaseNo, [formId]: caseNo }, draftTouched: { ...state.draftTouched, [formId]: false } })
            return
          }
          if (owner === undefined) {
            set({ draftCaseNo: { ...state.draftCaseNo, [formId]: caseNo } })
            return
          }
          const prefix = `kb${formId}-`
          const caseDrafts = state.caseDrafts || {}

          /** เก็บของแฟ้มที่กำลังเปิดอยู่ (owner) ไว้ก่อนสลับ */
          const outgoing = caseDrafts[owner] || EMPTY_BUNDLE
          const outSigs = Object.fromEntries(Object.entries(state.signatures).filter(([k]) => k.startsWith(prefix)))
          const nextOutgoing: CaseFormBundle = {
            drafts: { ...outgoing.drafts, [formId]: state.drafts[formId] || {} },
            touched: { ...outgoing.touched, [formId]: Boolean(state.draftTouched[formId]) },
            locks: state.locks[formId] ? { ...outgoing.locks, [formId]: state.locks[formId] } : withoutKey(outgoing.locks, formId),
            revisions: state.revisions[formId]
              ? { ...outgoing.revisions, [formId]: state.revisions[formId] }
              : withoutKey(outgoing.revisions, formId),
            signatures: { ...withoutPrefix(outgoing.signatures, prefix), ...outSigs },
          }

          /** สลับของแฟ้มใหม่เข้ามา — ไม่เคยมีให้เริ่มจากค่าตั้งต้น (ไม่มีลายมือชื่อ ไม่มีล็อก ไม่มีประวัติเวอร์ชัน) */
          const incoming = caseDrafts[caseNo] || EMPTY_BUNDLE
          const inLock = incoming.locks[formId]
          const inRevisions = incoming.revisions[formId]
          set({
            caseDrafts: { ...caseDrafts, [owner]: nextOutgoing },
            drafts: { ...state.drafts, [formId]: incoming.drafts[formId] ? { ...incoming.drafts[formId] } : { ...seed } },
            draftCaseNo: { ...state.draftCaseNo, [formId]: caseNo },
            draftTouched: { ...state.draftTouched, [formId]: Boolean(incoming.touched[formId]) },
            locks: inLock ? { ...state.locks, [formId]: inLock } : withoutKey(state.locks, formId),
            revisions: inRevisions ? { ...state.revisions, [formId]: inRevisions } : withoutKey(state.revisions, formId),
            signatures: {
              ...withoutPrefix(state.signatures, prefix),
              ...Object.fromEntries(Object.entries(incoming.signatures).filter(([k]) => k.startsWith(prefix))),
            },
          })
          return
        }

        set((state) => ({
          drafts: { ...state.drafts, [formId]: { ...seed } },
          draftCaseNo: { ...state.draftCaseNo, [formId]: caseNo },
          draftTouched: { ...state.draftTouched, [formId]: false },
        }))
      },

      getDraft: (formId) => {
        return get().drafts[formId] || {}
      },

      lockForm: (formId, lockedBy, reason) => {
        set((state) => ({
          locks: { ...state.locks, [formId]: { lockedAt: new Date().toISOString(), lockedBy, reason } },
        }))
      },

      isFormLocked: (formId) => Boolean(get().locks[formId]),

      getFormLock: (formId) => get().locks[formId],

      reviseForm: (formId, by, reason) => {
        const caseNo = get().draftCaseNo[formId]
        if ((formId === 9 || formId === 10) && caseNo && useCaseStore.getState().getCase(caseNo)?.resultNotices?.[formId]?.original) return 1
        const state = get()
        /** แฟ้มปิดงานคุ้มครองแล้วสร้างเวอร์ชันใหม่ไม่ได้ — คืนเลขเวอร์ชันปัจจุบันโดยไม่เปลี่ยนอะไร */
        if (formBelongsToClosedCase(state.draftCaseNo, formId)) return (state.revisions[formId]?.length || 0) + 1
        const history = state.revisions[formId] || []
        const nextVersion = history.length + 2
        set({
          revisions: {
            ...state.revisions,
            [formId]: [
              ...history,
              {
                version: history.length + 1,
                at: new Date().toISOString(),
                by,
                reason,
                snapshot: { ...(state.drafts[formId] || {}) },
                signatures: structuredClone(Object.fromEntries(Object.entries(state.signatures).filter(([key]) => key.startsWith(`kb${formId}-`)))),
              },
            ],
          },
          /** ปลดล็อกเพื่อให้แก้ไขเป็นเวอร์ชันใหม่ ฉบับเดิมยังอยู่ใน revisions */
          locks: Object.fromEntries(Object.entries(state.locks).filter(([k]) => Number(k) !== formId)),
        })
        return nextVersion
      },

      getRevisions: (formId) => get().revisions[formId] || [],

      getFormVersion: (formId) => (get().revisions[formId]?.length || 0) + 1,

      addRelatedPerson: (person) => {
        const nextId = Date.now()
        set((state) => ({
          relatedPersons: [...state.relatedPersons, { ...person, id: nextId }],
        }))
      },

      updateRelatedPerson: (id, updates) => {
        set((state) => ({
          relatedPersons: state.relatedPersons.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        }))
      },

      removeRelatedPerson: (id) => {
        set((state) => ({
          relatedPersons: state.relatedPersons.filter((p) => p.id !== id),
        }))
      },

      addAttachmentSet: (category, description, formId = 1) => {
        if (formBelongsToClosedCase(get().draftCaseNo, formId)) return 0
        const nextId = Date.now()
        set((state) => ({
          attachmentSets: [...state.attachmentSets, { id: nextId, formId, category, description, files: [] }],
        }))
        return nextId
      },

      addFileToSet: (setId, file) => {
        if (setBelongsToClosedCase(get(), setId)) return
        set((state) => ({
          attachmentSets: state.attachmentSets.map((s) =>
            s.id === setId
              ? {
                  ...s,
                  files: [
                    ...s.files,
                    {
                      name: file.name || 'document.pdf',
                      size: file.size || 102400,
                      type: file.type || 'application/pdf',
                      previewUrl: file.previewUrl || null,
                      lastModified: file.lastModified,
                      uploadedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
                      uploadedBy: 'เจ้าหน้าที่ ป.ป.ท.',
                    },
                  ],
                }
              : s
          ),
        }))
      },

      removeFileFromSet: (setId, fileIndex) => {
        if (setBelongsToClosedCase(get(), setId)) return
        set((state) => ({
          attachmentSets: state.attachmentSets.map((s) =>
            s.id === setId ? { ...s, files: s.files.filter((_, idx) => idx !== fileIndex) } : s
          ),
        }))
      },

      removeAttachmentSet: (setId) => {
        if (setBelongsToClosedCase(get(), setId)) return
        set((state) => ({
          attachmentSets: state.attachmentSets.filter((s) => s.id !== setId),
        }))
      },

      ensureSetForForm: (formId) => {
        const existing = get().attachmentSets.find((s) => (s.formId ?? 1) === formId)
        if (existing) return existing.id
        const nextId = Date.now()
        set((state) => ({
          attachmentSets: [
            ...state.attachmentSets,
            { id: nextId, formId, category: 'เอกสารประกอบ', description: 'ไฟล์แนบทั่วไปของแบบฟอร์มนี้', files: [] },
          ],
        }))
        return nextId
      },

      attachFilesToSet: (setId, files) => {
        if (files.length === 0 || setBelongsToClosedCase(get(), setId)) return
        set((state) => ({
          attachmentSets: state.attachmentSets.map((s) =>
            s.id === setId ? { ...s, files: [...s.files, ...files] } : s
          ),
        }))
      },

      removeFilesFromSet: (setId, fileIndexes) => {
        if (setBelongsToClosedCase(get(), setId)) return
        const drop = new Set(fileIndexes)
        set((state) => ({
          attachmentSets: state.attachmentSets.map((s) =>
            s.id === setId ? { ...s, files: s.files.filter((_, idx) => !drop.has(idx)) } : s
          ),
        }))
      },

      /**
       * ลงนามอิเล็กทรอนิกส์ — คีย์รูปแบบ `kb<N>-<role>` จะล็อกแบบ คบ.<N> ไปด้วย
       * เพื่อกันการแก้ทับฉบับลงนาม (WIT0513 / WIT0611 / WIT0811 / WIT1140)
       */
      signDocument: (key, signerName, signatureImage) => {
        const formMatch = key.match(/^kb(\d+)-/)
        if (formMatch && formBelongsToClosedCase(get().draftCaseNo, Number(formMatch[1]))) return
        set((state) => {
          const formId = formMatch ? Number(formMatch[1]) : null
          return {
            signatures: {
              ...state.signatures,
              [key]: {
                signed: true,
                signerName,
                signedAt: new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }),
                signatureImage,
              },
            },
            locks:
              formId && !state.locks[formId]
                ? {
                    ...state.locks,
                    [formId]: {
                      lockedAt: new Date().toISOString(),
                      lockedBy: signerName,
                      reason: 'ล็อกอัตโนมัติเมื่อมีลายมือชื่อในเอกสาร',
                    },
                  }
                : state.locks,
          }
        })
      },

      resetDrafts: () => {
        set({
          revisions: {},
          locks: {},
          draftCaseNo: {},
          draftTouched: {},
          caseDrafts: {},
          drafts: {
            1: DEFAULT_KB1_DRAFT,
            2: DEFAULT_KB2_DRAFT,
            3: DEFAULT_KB3_DRAFT,
            6: DEFAULT_KB6_DRAFT,
            11: DEFAULT_KB11_DRAFT,
          },
        })
      },
    }),
    {
      name: 'ecmis-form-draft-storage-v2',
    }
  )
)
