import { CaseItem } from '../types/case'
import { buildKb11Seed } from './kb11Prefill'
import {
  PER_CASE_FORMS,
  useFormDraftStore,
  DEFAULT_KB2_DRAFT,
  DEFAULT_KB3_DRAFT,
  DEFAULT_KB6_DRAFT,
  DEFAULT_KB11_DRAFT,
} from '../store/useFormDraftStore'

/**
 * ค่าตั้งต้นของแบบ คบ. ที่ไม่ผูกกับข้อมูลของแฟ้มใดโดยเฉพาะ
 * คบ.1 ไม่อยู่ในรายการนี้โดยตั้งใจ — ต้องตั้งต้นจากข้อมูลของแฟ้มนั้นเท่านั้น (ดู buildKb1Seed)
 */
const CASE_NEUTRAL_DEFAULTS: Record<number, Record<string, any>> = {
  2: DEFAULT_KB2_DRAFT,
  3: DEFAULT_KB3_DRAFT,
  6: DEFAULT_KB6_DRAFT,
  11: DEFAULT_KB11_DRAFT,
}

/** แยกชื่อเต็มเป็นชื่อกับนามสกุล — ข้อมูลรับแจ้งเก็บเป็นชื่อเต็มสายเดียว */
const splitName = (fullName?: string): { first: string; last: string } => {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

/**
 * WIT0311-0312 — แฟ้มที่รับเรื่องด้วย คบ.2 ต้องจัดทำ คบ.1 ต่อ โดยนำข้อมูลที่รับแจ้งไว้แล้วมาเป็นค่าตั้งต้น
 * ไม่ให้เจ้าหน้าที่ต้องถามพยานซ้ำ
 *
 * แหล่งข้อมูลมีสองชั้นและต้องใช้ตามลำดับนี้:
 *  1. ข้อมูลที่บันทึกไว้กับตัวแฟ้มตอนรับเรื่อง (ผู้แจ้ง ช่องทาง เลขคดีหลัก) — เป็นของแฟ้มนี้แน่นอน
 *  2. ร่างแบบ คบ.2 ที่เจ้าหน้าที่กรอกไว้ "ของแฟ้มนี้" และถูกแก้ไขจริงแล้วเท่านั้น
 *     ร่างที่ยังเป็นค่าตัวอย่างของระบบต้องไม่ถูกคัดลอกข้ามมา มิฉะนั้นข้อมูลของคำขออื่นจะปนเข้ามา
 *
 * ช่องที่ไม่มีข้อมูลตั้งต้นต้องเว้นว่าง ห้ามเติมค่าตัวอย่างแทน
 */
export const buildKb1Seed = (
  caseItem: Pick<
    CaseItem,
    'no' | 'person' | 'mainCaseNo' | 'intakeChannel' | 'intakeDocType' | 'source' | 'createdAt' | 'resultNotices'
  >,
  kb2Draft?: Record<string, any>
): Record<string, any> => {
  const fromCase = splitName(caseItem.person)
  const kb2 = kb2Draft || {}

  const first = kb2['ชื่อผู้แจ้ง'] || fromCase.first
  const last = kb2['นามสกุลผู้แจ้ง'] || fromCase.last
  const phone = kb2['เบอร์โทรศัพท์'] || ''
  const address = [kb2['บ้านเลขที่'], kb2['หมู่ที่'] && `หมู่ที่ ${kb2['หมู่ที่']}`, kb2['ตำบล'] && `ตำบล${kb2['ตำบล']}`, kb2['อำเภอ'] && `อำเภอ${kb2['อำเภอ']}`]
    .filter(Boolean)
    .join(' ')

  const seed: Record<string, any> = {
    // 1. ผู้ยื่นคำร้อง
    'คำนำหน้า': kb2['คำนำหน้า'] || '',
    'ชื่อ': first,
    'นามสกุล': last,
    'ฐานะผู้ยื่น': kb2['ฐานะที่เป็น'] || '',
    'บ้านเลขที่': kb2['บ้านเลขที่'] || '',
    'หมู่ที่': kb2['หมู่ที่'] || '',
    'ตำบล': kb2['ตำบล'] || '',
    'อำเภอ': kb2['อำเภอ'] || '',
    'จังหวัด': kb2['จังหวัด'] || '',
    'รหัสไปรษณีย์': kb2['รหัสไปรษณีย์'] || '',
    'เบอร์โทรศัพท์': phone,
    'อีเมล': kb2['อีเมล'] || '',
    // 2. ข้อมูลพยาน — ผู้แจ้งใน คบ.2 คือพยานรายเดียวกัน
    'พยานชื่อ': first,
    'พยานนามสกุล': last,
    'พยานที่อยู่': address,
    'พยานโทรศัพท์': phone,
    // 4. ความประสงค์
    'ช่วงเวลาคุ้มครอง': kb2['ช่วงเวลาคุ้มครอง'] || '',
    'เกี่ยวข้องกับคดี': kb2['อ้างอิงคดี'] || caseItem.mainCaseNo || '',
    // 5. พฤติการณ์ภัยคุกคาม
    'พฤติการณ์ภัยคุกคาม': kb2['รายละเอียดข้อเท็จจริง'] || '',
    // 7. เจ้าพนักงานผู้จัดทำ
    'ตำแหน่งเจ้าพนักงาน': kb2['ตำแหน่งผู้รับแจ้ง'] || '',
  }

  return seed
}

/**
 * ค่าตั้งต้นของแบบ คบ. ใด ๆ เมื่อเปิดจากแฟ้มคำร้องหนึ่ง
 * คบ.1 ตั้งต้นจากข้อมูลของแฟ้ม แบบอื่นใช้ค่าตั้งต้นเดิมของระบบตามที่เคยเป็น
 */
export const buildSeedForCase = (
  formId: number,
  caseItem: Pick<
    CaseItem,
    'no' | 'person' | 'mainCaseNo' | 'intakeChannel' | 'intakeDocType' | 'source' | 'createdAt' | 'resultNotices' | 'orderedMethods' | 'approvedMethods' | 'kb16' | 'kb15'
  >,
  kb2Draft?: Record<string, any>
): Record<string, any> => {
  if (formId === 9 || formId === 10) return { 'คำร้องลงวันที่': caseItem.createdAt?.slice(0, 10) || '', ...caseItem.resultNotices?.[formId]?.fields }
  if (formId === 16) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    return { 'ชื่อพยาน': caseItem.person, 'เลขที่คำสั่ง': caseItem.kb16?.orderNo || '', 'ปีคำสั่ง': String(Number(today.slice(0, 4)) + 543), 'เหตุยุติ': caseItem.kb16?.reason || caseItem.kb15?.summary || '', 'วันที่ออกคำสั่ง': caseItem.kb16?.issuedAt || today, 'วันที่มีผล': caseItem.kb16?.effectiveAt || today, 'เหตุผลวันที่มีผลย้อนหลัง': caseItem.kb16?.backdatedReason || '' }
  }
  if (formId === 7) {
    const name = splitName(caseItem.person)
    return { 'ชื่อผู้ยื่น': name.first, 'นามสกุลผู้ยื่น': name.last, 'ชื่อพยาน': name.first, 'นามสกุลพยาน': name.last, 'ฐานะผู้ยื่น': 'พยาน', 'ยุติให้ใคร': 'พยาน' }
  }
  if (formId === 11) return buildKb11Seed(caseItem)
  if (formId === 1) return buildKb1Seed(caseItem, kb2Draft)
  return { ...(CASE_NEUTRAL_DEFAULTS[formId] || {}) }
}

/**
 * GAP-010 — สลับร่างและลายมือชื่อของ คบ.3 / คบ.4 / คบ.5 / คบ.6 ให้เป็นของแฟ้มที่กำลังเปิด
 * เรียกตอนเปิดหน้าแฟ้มและหน้าแบบฟอร์ม เพื่อให้ทุกด่านตรวจและช่องกรอกอ่าน/เขียนข้อมูลของแฟ้มนั้นจริง
 * ไม่ใช่ร่างที่ค้างมาจากแฟ้มก่อนหน้า
 */
export const activateCaseForms = (
  caseItem: Pick<CaseItem, 'no' | 'person' | 'mainCaseNo' | 'intakeChannel' | 'intakeDocType' | 'source' | 'createdAt' | 'resultNotices' | 'orderedMethods' | 'approvedMethods' | 'kb16' | 'kb15'>,
  formIds: number[] = PER_CASE_FORMS
): void => {
  const { ensureDraftForCase } = useFormDraftStore.getState()
  formIds
    .filter((id) => PER_CASE_FORMS.includes(id))
    .forEach((id) => ensureDraftForCase(id, caseItem.no, buildSeedForCase(id, caseItem)))
}
