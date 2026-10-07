import { CaseItem, ProtectionMethodNo, ProtectionMethodTrack } from '../types/case'
import { isFormFullySigned, kb11Gate } from './formSignature'
import { deriveEpisode, summarizeEpisode, currentPhaseKind } from './episode'

/**
 * ความคืบหน้ารายขั้นของวิธีคุ้มครองตามข้อ 15 — ขั้นตอนอ้างตาม User_Flow v5 แท็บ 02
 * (08A-1 = WIT0815-0821, 08A-2 = WIT0823-0829, 08A-3 = WIT0831-0837, 08B = WIT0842-0851)
 *
 * ขั้นที่อยู่ใน wizard ของ MethodPanels.tsx ถือว่าเสร็จเมื่อกดถัดไปผ่านไปแล้วเท่านั้น (ดู wizardUnlockedCount)
 * ไม่ใช่จากการอนุมานว่ากรอกข้อมูลครบหรือยัง — ส่วนขั้นนอก wizard (เช่น ลงนาม คบ.8 หรือกดเริ่มปฏิบัติจริง)
 * ยังคงอนุมานจากข้อมูล/สถานะจริงในแฟ้มเหมือนเดิม เพราะไม่มีปุ่มกดยืนยันแยกของตัวเอง
 */
export interface MethodStep {
  /** รหัสกิจกรรมใน flow — ใช้อ้างกลับไปที่ผังเมื่อมีคำถามว่าขั้นนี้มาจากไหน */
  code: string
  label: string
  done: boolean
}

export interface MethodProgress {
  steps: MethodStep[]
  /** จำนวนขั้นที่ทำแล้ว — นับแบบสะสมจากต้น หยุดที่ขั้นแรกที่ยังไม่เสร็จ */
  doneCount: number
  total: number
  /** ขั้นที่วิธีนี้ค้างอยู่เมื่อสถานะเป็น blocked (index ใน steps) — ไม่ blocked จะเป็น undefined */
  blockedIndex?: number
}

/** ข้อมูลนอก track ที่ขั้นตอนบางขั้นต้องใช้ตัดสิน (เช่น ร่าง คบ.8 อยู่ใน useFormDraftStore) */
export interface MethodProgressContext {
  /** มีร่าง คบ.8 ในระบบแล้วหรือยัง — วิธีที่ 1 ขั้น WIT0817 */
  kb8Drafted?: boolean
}

const method1Steps = (caseItem: CaseItem, track: ProtectionMethodTrack, ctx: MethodProgressContext): MethodStep[] => {
  return [
    /**
     * ร่างมีอยู่จริงแล้วหรือยัง — ctx.kb8Drafted อ่านจากคลังร่างแบบฟอร์ม (useFormDraftStore) ซึ่งว่างได้
     * ทั้งที่เดินหน้าไปไกลแล้ว เพราะ คบ.8 ถูกแนบเข้าแฟ้มอัตโนมัติตอนแยกแนวทาง (setApprovedMethods)
     * ไม่ได้ผ่านคลังร่าง จึงยอมรับหลักฐานที่หนักกว่าด้วย — เสนอเข้ารอบลงนามแล้ว หรือลงนามแล้ว
     * ย่อมแปลว่าร่างเสร็จไปก่อนหน้านั้น ไม่งั้นแถบที่นับสะสมจะค้างที่ 0 ทั้งที่เลขาธิการฯ ลงนามไปแล้ว
     */
    {
      code: 'WIT0817',
      label: 'จัดทำร่าง คบ.8',
      done: Boolean(ctx.kb8Drafted || caseItem.kb8SubmittedAt) || isFormFullySigned(8, caseItem),
    },
    /** อ้างสถานะลงนามจาก formSignature.ts แหล่งเดียวกับรายการแบบฟอร์มในแฟ้ม (dossier/$caseNo.tsx) — ไม่ให้ค้างคนละสถานะ */
    { code: 'WIT0818', label: 'ลงนาม คบ.8', done: isFormFullySigned(8, caseItem) },
    /** WIT0819-0820 อยู่ใน wizard ของ MethodPanels.tsx — เสร็จเมื่อกดถัดไปผ่านเท่านั้น (ดู wizardUnlockedCount) */
    { code: 'WIT0819', label: 'จัดแผนปฏิบัติของชุดคุ้มครอง', done: false },
    { code: 'WIT0820', label: 'ชี้แจงภารกิจแบบ Need-to-Know', done: false },
    { code: 'WIT0821', label: 'เริ่มปฏิบัติจริง (ACTIVE)', done: track.status === 'active' || Boolean(track.startedAt) },
  ]
}

/**
 * วิธีที่ 1 — ขั้นหลัง WIT0818 (WIT0819 แผนชุดคุ้มครอง / WIT0820 ชี้แจง Need-to-Know / WIT0821 เริ่มปฏิบัติจริง)
 * เปิดให้เดินต่อได้หรือยัง เปิดได้สองทางตามผัง 08A-1
 *  - เลขาธิการฯ ลงนาม คบ.8 ครบแล้ว (เส้นทางหลัก MAIN)
 *  - หรือมีคำสั่งชั่วคราว คบ.5 อนุมัติแล้ว (เส้นทาง TEMPORARY_ACTIVE — ดู Wit0821Branch ใน MethodPanels.tsx)
 *
 * ใช้ทั้งกับปุ่มถัดไป/เริ่มปฏิบัติจริงใน wizard และกับการนับความคืบหน้า เพื่อไม่ให้ wizardStep
 * ที่กดค้างไว้ก่อนหน้าดันแถบข้ามขั้นลงนามที่ยังไม่เสร็จ
 */
export interface Method1GateResult {
  unlocked: boolean
  /** เหตุผลที่ยังเดินต่อไม่ได้ — ใช้แสดงใต้ปุ่มใน wizard */
  reason?: string
}

export const method1Gate = (caseItem: CaseItem): Method1GateResult => {
  if (isFormFullySigned(8, caseItem)) return { unlocked: true }
  /**
   * WIT1110 — เปลี่ยนวิธีมาเป็นวิธีที่ 1 หลังทบทวนผลที่ 11A แล้ว คบ.8 ต้องจัดทำ/แก้เป็นฉบับใหม่เสมอ
   * คำสั่งชั่วคราว คบ.5 ของรอบก่อนใช้ข้ามขั้นนี้ไม่ได้ เพราะชุดวิธีที่อนุมัติเปลี่ยนไปจากตอนออก คบ.5
   */
  const pendingKb8FromMethodChange = (caseItem.methodChangeProposals || []).some(
    (r) => r.appliedAt && r.requiresKb8
  )
  if (pendingKb8FromMethodChange) {
    return {
      unlocked: false,
      reason:
        'เปลี่ยนมาเป็นวิธีที่ 1 ตามข้อเสนอที่อนุมัติ — ต้องจัดทำ/แก้ คบ.8 เป็นฉบับใหม่และให้เลขาธิการ ป.ป.ท. ลงนามก่อน จึงเริ่มปฏิบัติได้',
    }
  }
  if (caseItem.kb5Approved) return { unlocked: true }
  return {
    unlocked: false,
    reason: 'คบ.8 ยังไม่ผ่านการลงนามของเลขาธิการ ป.ป.ท. — เสนอและลงนาม คบ.8 ที่รายการแบบฟอร์มในแฟ้มก่อน (หรือมีคำสั่งชั่วคราว คบ.5 อนุมัติ)',
  }
}

const method2Steps = (_caseItem: CaseItem, track: ProtectionMethodTrack): MethodStep[] => {
  return [
    { code: 'WIT0823', label: 'ตรวจขอบเขตที่อนุมัติและความจำเป็น', done: false },
    { code: 'WIT0824', label: 'เสนอสถานที่ปลอดภัย', done: false },
    { code: 'WIT0825', label: 'ประเมินความปลอดภัย — เหมาะสม', done: false },
    { code: 'WIT0827', label: 'จัดแผนย้าย / รับ–ส่ง', done: false },
    { code: 'WIT0828', label: 'พาพยานย้าย / เข้าพัก', done: false },
    { code: 'WIT0829', label: 'เริ่มปฏิบัติจริง (ACTIVE)', done: track.status === 'active' || Boolean(track.startedAt) },
  ]
}

const method3Steps = (_caseItem: CaseItem, track: ProtectionMethodTrack): MethodStep[] => {
  return [
    { code: 'WIT0831', label: 'ระบุข้อมูล/ตัวระบุที่ต้องปกปิด', done: false },
    { code: 'WIT0832', label: 'กำหนด Role และ Need-to-Know', done: false },
    { code: 'WIT0833', label: 'ตั้งมาตรการจำกัดการใช้ข้อมูล', done: false },
    { code: 'WIT0834', label: 'ทดสอบสิทธิ์และการรั่วไหล — ผ่าน', done: false },
    { code: 'WIT0836', label: 'บันทึก Policy Version และ Audit Baseline', done: false },
    { code: 'WIT0837', label: 'เปิดใช้มาตรการ (ACTIVE)', done: track.status === 'active' || Boolean(track.startedAt) },
  ]
}

const method4Steps = (_caseItem: CaseItem, track: ProtectionMethodTrack): MethodStep[] => {
  return [
    { code: 'WIT0842', label: 'ตรวจ คบ.11 / คบ.5 ลงนามก่อนประสาน', done: false },
    { code: 'WIT0843', label: 'ส่งหนังสือประสานขาออก', done: false },
    { code: 'WIT0846', label: 'รับหนังสือตอบกลับ', done: false },
    { code: 'WIT0847', label: 'เตรียมการส่งมอบและร่าง คบ.12', done: false },
    { code: 'WIT0848', label: 'ส่งมอบจริงและลงนาม คบ.12', done: false },
    {
      code: 'WIT0851',
      label: 'หน่วยงานผู้รับเริ่มปฏิบัติ (ACTIVE)',
      done: track.status === 'active' || Boolean(track.startedAt),
    },
  ]
}

const BUILDERS: Record<
  ProtectionMethodNo,
  (caseItem: CaseItem, track: ProtectionMethodTrack, ctx: MethodProgressContext) => MethodStep[]
> = {
  1: method1Steps,
  2: (c, t) => method2Steps(c, t),
  3: (c, t) => method3Steps(c, t),
  4: (c, t) => method4Steps(c, t),
}

/**
 * จำนวนขั้นความคืบหน้าที่ section ของ wizard (MethodPanels.tsx) แต่ละอันครอบคลุม — เรียงตามลำดับ section
 * ส่วนใหญ่ 1 section ต่อ 1 ขั้น ยกเว้น section สุดท้ายที่รวมสองขั้น (เช่น แผนย้าย+พาย้าย ของวิธีที่ 2)
 */
const WIZARD_SPANS: Record<ProtectionMethodNo, number[]> = {
  1: [1, 1], // WIT0819, WIT0820
  2: [1, 1, 1, 2], // WIT0823, WIT0824, WIT0825, WIT0827+0828
  3: [1, 1, 1, 2], // WIT0831, WIT0832, WIT0833, WIT0834+0836
  4: [1, 1, 1, 2], // WIT0842, WIT0843, WIT0846, WIT0847+0848
}

/**
 * จำนวน section ของ wizard รายวิธี — ใช้เป็นค่า wizardStep ที่ถือว่า "เดินจบทุกขั้นแล้ว"
 * ปุ่มเริ่มปฏิบัติจริง (StartButton) ตั้งค่านี้ให้ เพราะการกดเริ่มคือหลักฐานว่าผ่านทุก section มาแล้ว
 * ไม่งั้น section สุดท้ายจะกดถัดไปต่อไม่ได้ (ปุ่มถูก disable) และขั้นนั้นจะไม่มีวันนับว่าเสร็จ
 */
export const wizardSectionCount = (method: ProtectionMethodNo): number => WIZARD_SPANS[method].length

/** จำนวนขั้นความคืบหน้าก่อนที่ wizard section แรกจะเริ่ม — WIT0817/0818 ของวิธีที่ 1 อยู่นอก wizard (มาจากลงนาม คบ.8) */
const WIZARD_OFFSET: Record<ProtectionMethodNo, number> = { 1: 2, 2: 0, 3: 0, 4: 0 }

/**
 * จำนวนขั้นที่ถือว่า "ผ่านแล้ว" จากการกดถัดไปใน wizard เพียงอย่างเดียว — ไม่สนว่าฟิลด์ในขั้นนั้นครบหรือไม่
 * เพื่อให้แถบความคืบหน้าขยับตามการกดถัดไปจริง ไม่ใช่รอให้ข้อมูลครบเท่านั้น (section ปัจจุบันที่ผู้ใช้ค้างอยู่ยังไม่นับว่าผ่าน)
 */
const wizardUnlockedCount = (method: ProtectionMethodNo, wizardStep: number): number => {
  const spans = WIZARD_SPANS[method]
  const passedSections = Math.max(0, Math.min(wizardStep, spans.length))
  const covered = spans.slice(0, passedSections).reduce((a, b) => a + b, 0)
  return WIZARD_OFFSET[method] + covered
}

/**
 * ความคืบหน้าของวิธีหนึ่งวิธี
 *
 * นับแบบสะสม — หยุดที่ขั้นแรกที่ยังไม่เสร็จ เพราะ flow ของทุกวิธีเดินเป็นลำดับ
 * ขั้นถัดไปที่บังเอิญมีข้อมูลอยู่ก่อนจึงไม่ทำให้ตัวเลขกระโดดข้ามขั้นที่ยังค้าง
 * ขั้นที่ผ่านมาแล้วจากการกดถัดไปใน wizard (track.wizardStep) ก็ถือว่าเสร็จเช่นกัน แม้ข้อมูลจะยังไม่ครบ
 */
export const getMethodProgress = (
  caseItem: CaseItem,
  track: ProtectionMethodTrack,
  ctx: MethodProgressContext = {}
): MethodProgress => {
  const built = BUILDERS[track.method](caseItem, track, ctx)
  /**
   * วิธีที่ 1 ที่ยังไม่ผ่าน gate ลงนาม คบ.8 ถูกตรึงไว้ที่ขั้นก่อน wizard เสมอ — wizardStep ที่ค้างไว้
   * จากการกดถัดไปก่อนหน้า (หรือจากข้อมูลเก่าในแฟ้ม) จะดันแถบข้าม WIT0818 ไม่ได้
   */
  const gateBlocked = track.method === 1 && !method1Gate(caseItem).unlocked
  const unlocked = gateBlocked
    ? Math.min(wizardUnlockedCount(track.method, track.wizardStep || 0), WIZARD_OFFSET[1])
    : wizardUnlockedCount(track.method, track.wizardStep || 0)
  /**
   * ปลดล็อกจากการกดถัดไปมีผลเฉพาะขั้นที่อยู่ใน wizard จริง (ตั้งแต่ WIZARD_OFFSET ขึ้นไป)
   * ขั้นก่อนหน้านั้น (WIT0817/0818 ของวิธีที่ 1) ยังอ่านสถานะจริงจากแฟ้มเสมอ ไม่งั้น offset
   * จะติ๊กขั้นลงนาม คบ.8 ให้เองตั้งแต่ยังไม่ได้เสนอเลย
   */
  const offset = WIZARD_OFFSET[track.method]
  const steps = built.map((s, idx) => (idx >= offset && idx < unlocked ? { ...s, done: true } : s))
  const firstPending = steps.findIndex((s) => !s.done)
  const doneCount = firstPending === -1 ? steps.length : firstPending
  return {
    steps,
    doneCount,
    total: steps.length,
    /** ค้างหมุดไว้ที่ขั้นแรกที่ยังไม่เสร็จ — วิธีที่เดินครบแล้วแต่ถูกสั่งระงับให้ค้างที่ขั้นสุดท้าย */
    blockedIndex: track.status === 'blocked' ? Math.min(doneCount, steps.length - 1) : undefined,
  }
}

// ---------------------------------------------------------------------------
// เงื่อนไขบังคับก่อน "เริ่มปฏิบัติจริง" ของแต่ละวิธี
// ---------------------------------------------------------------------------

/**
 * เหตุที่ยังเริ่มปฏิบัติวิธีนี้ไม่ได้ — คืนข้อความภาษาไทย หรือ undefined ถ้าเริ่มได้
 *
 * รวมศูนย์ไว้ที่เดียวเพื่อไม่ให้แต่ละแผง (Method1-4 ใน MethodPanels.tsx) คิดเงื่อนไขของตัวเองซ้ำกัน
 * และเพื่อให้ store (setMethodStatus) บังคับซ้ำชั้นสุดท้ายด้วยกติกาเดียวกับที่ UI แสดง
 */
export const method4ReplyRecorded = (caseItem: CaseItem): boolean => {
  const co = caseItem.methodTracks?.find((track) => track.method === 4)?.coordination
  const letters = caseItem.officialLetters || []
  return co?.responseStatus === 'accepted' && letters.some((letter) => letter.context === 'method4' && letter.direction === 'outgoing' && Boolean(letter.sentAt)) &&
    letters.some((letter) => letter.context === 'method4' && letter.direction === 'incoming' && Boolean(letter.receivedAt && letter.documentName) && letter.subject === 'หนังสือตอบรับดำเนินการคุ้มครองพยาน')
}

export function methodStartBlocker(
  caseItem: CaseItem,
  method: ProtectionMethodNo,
  track?: ProtectionMethodTrack
): string | undefined {
  const t = track || (caseItem.methodTracks || []).find((x) => x.method === method)
  if (caseItem.activity7State === 'approved' && currentPhaseKind(caseItem.episode || deriveEpisode(caseItem)) !== 'TEMPORARY' && !caseItem.kb5Approved && (!caseItem.kb11Signed || !kb11Gate(caseItem).unlocked)) return 'ต้องแจ้งผล คบ.9 บันทึกการรับแจ้ง และลงนามข้อตกลง คบ.11 ให้ครบก่อนเริ่มคุ้มครอง'

  if (method === 4 && !method4ReplyRecorded(caseItem)) return 'ต้องนำส่งหนังสือประสานและแนบหนังสือตอบรับจากสถานีตำรวจก่อนเริ่มคุ้มครอง'

  /**
   * เพดาน 180 วันของ Episode — ใช้กับทุกวิธี ไม่ใช่เฉพาะวิธีที่ 1
   * ใกล้ครบเพดานแล้วห้ามเปิดวิธีใหม่เพิ่ม เพราะวิธีที่เปิดไม่มีวันสิ้นสุดของตัวเอง
   * ต้องไปขยายเวลาที่แท็บ 11A หรือเปิดเส้นทางข้อ 14 ที่แท็บ 08C แทน
   */
  const episode = caseItem.episode || deriveEpisode(caseItem)
  if (episode) {
    const summary = summarizeEpisode(episode)
    if (summary.atCap || summary.nearCap) {
      return `วันสะสมของ Episode นี้อยู่ที่ ${summary.cumulative} วัน เหลืออีก ${summary.remaining} วันจะครบเพดาน ${summary.cap} วัน — เปิดวิธีเพิ่มไม่ได้ ให้เสนอขยายเวลาที่หน้าทบทวนผลการคุ้มครอง หรือเริ่มเรื่องส่งต่อกรมคุ้มครองสิทธิฯ แทน`
    }
  }

  /**
   * ประตู คบ.8 ของวิธีที่ 1 (method1Gate) ไม่รวมไว้ที่นี่โดยตั้งใจ — เป็นเงื่อนไขของ wizard หน้า 08A-1
   * ที่ปิดปุ่ม "ถัดไป" ตั้งแต่ต้นทางอยู่แล้ว (TC-071) การย้ายมาบังคับที่ store จะทำให้ทางเข้าอื่น
   * ที่ตั้งสถานะวิธีโดยตรง (เช่น การกู้สถานะ/เส้นทางทดสอบ) ถูกปฏิเสธเงียบ ๆ โดยไม่มีใครแจ้ง
   */

  /** WIT0827 — บันทึกเข้าพักต้องมีหลักฐานผู้ส่งมอบ-ผู้รับมอบครบก่อนเสมอ */
  if (method === 2) {
    const site = t?.site || {}
    /** WIT0826 → WIT0824 (TC-028) — ผลประเมินรอบล่าสุดต้อง "เหมาะสม" ก่อนเริ่มปฏิบัติ ไม่เหมาะสมต้องกลับไปเสนอสถานที่ใหม่ */
    if (site.suitable !== true) {
      return site.suitable === false
        ? 'ผลประเมินรอบล่าสุดคือ "ไม่เหมาะสม" — ต้องกลับไปเสนอสถานที่ใหม่ และประเมินให้ผ่านก่อนจึงเริ่มปฏิบัติได้'
        : 'ยังไม่ได้บันทึกผลประเมินว่าสถานที่เหมาะสม — เริ่มปฏิบัติไม่ได้จนกว่าจะประเมินสถานที่ให้ผ่าน'
    }
    if (!site.handoverBy?.trim() || !site.handoverTo?.trim()) {
      return 'ยังไม่ได้ระบุผู้ส่งมอบและผู้รับมอบตัวพยาน — บันทึกเข้าพักไม่ได้จนกว่าจะระบุครบพร้อมแนบหลักฐาน'
    }
    if (!site.handoverEvidenceDocument) {
      return 'ยังไม่ได้แนบหลักฐานการส่งมอบ-รับมอบตัวพยาน — บันทึกเข้าพักไม่ได้จนกว่าจะแนบหลักฐาน'
    }
  }

  return undefined
}
