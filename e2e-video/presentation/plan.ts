import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FlowGuideData } from '../../src/lib/flowGuide'
import type { UserRole } from '../../src/types/user'
import { mockStateRole } from '../director'
import { narrationFor } from './brief'

/**
 * ลำดับฉากของวิดีโอนำเสนอ และการแบ่งเป็นส่วนเพื่อถ่ายพร้อมกันหลายเบราว์เซอร์
 * แต่ละส่วนเริ่มจากจุดพักของตัวเองได้ (โหลด mock state ใหม่ทุกขั้นอยู่แล้ว) แล้ว build-presentation.mjs ต่อเป็นคลิปเดียว
 *
 *   PRESENT_WORKERS=4   จำนวนส่วนที่ถ่ายพร้อมกัน (ค่าเริ่มต้น ครึ่งหนึ่งของจำนวนแกน ไม่เกิน 4) — 1 = ถ่ายต่อเนื่องคลิปเดียวแบบเดิม
 *   PRESENT_FROM=14 PRESENT_TO=17   ทำเฉพาะช่วงของรายการ (นับจาก 1) ตอนแก้สคริปต์
 */

const here = dirname(fileURLToPath(import.meta.url))
export const RAW_DIR = resolve(here, '../output-presentation/raw')
const flowMap = JSON.parse(readFileSync(resolve(here, '../../src/flow-guide/flow-map.json'), 'utf-8')) as FlowGuideData

export const ROUTE = ['02', '03', '04', '05', '07', '08A', '08A-1', '10', '11A', '11C', '11D']
export const TAB_TITLES: Record<string, string> = {
  '02': 'รับคำขอและตรวจแฟ้มก่อนส่ง ผอ.',
  '03': 'มอบหมาย ประเมินความเร่งด่วน และกำหนดเอกสารตั้งต้น',
  '04': 'จัดทำ คบ.1 / คบ.3 และแยกเอกสารกรณีปกติ-เร่งด่วน',
  '05': 'กลั่นกรอง คบ.6 โดยผู้บังคับบัญชาและ ผอ.',
  '06': 'เส้นทางเร่งด่วน: คบ.4 / คบ.5 และคุ้มครองชั่วคราว',
  '07': 'รับและบันทึกผลการพิจารณา',
  '08A': 'รับคำสั่งและแยกแนวทางคุ้มครอง',
  '08A-1': 'วิธีที่ 1 จัดชุดคุ้มครองและเริ่มปฏิบัติ',
  '08A-2 · 08A-3': 'วิธีที่ 2 จัดสถานที่ปลอดภัย · วิธีที่ 3 ปกปิดข้อมูลและจำกัดสิทธิ',
  '08B': 'ประสานหน่วยงานอื่นตามข้อ 15(4)',
  '08C': 'ส่งกรมคุ้มครองสิทธิและเสรีภาพตามข้อ 14',
  '09A': 'ไม่อนุมัติและแจ้งสิทธิอุทธรณ์',
  '09B': 'รับอุทธรณ์ กลั่นกรอง และเสนอคณะกรรมการ',
  '10': 'ติดตามและรายงานผลการคุ้มครอง (คบ.13)',
  '11A': 'ทบทวนผลการคุ้มครองและจำแนกแนวทาง',
  '11B': 'ขยายระยะเวลาการคุ้มครอง (คบ.14)',
  '11C': 'จัดทำเรื่องยุติการคุ้มครอง (คบ.7 / คบ.15)',
  '11D': 'คำสั่งยุติ แจ้งผล อุทธรณ์ และปิดงาน (คบ.16 / คบ.17)',
}

export type Segment =
  | { kind: 'intro' | 'outro'; key: string }
  | { kind: 'intake'; key: string }
  | { kind: 'branch' | 'return'; key: string; branch: string; tabs: string[] }
  | { kind: 'step'; key: string; scenario: string; tab: string; branch?: string }

const step = (key: string, tab: string, scenario = 'normal-approve', branch?: string): Segment => ({ kind: 'step', key, scenario, tab, branch })
const FAST = 'เส้นทางเร่งด่วน (คุ้มครองชั่วคราว)'
const APPEAL = 'ไม่อนุมัติและอุทธรณ์'
const EXTEND = 'ขยายระยะเวลาการคุ้มครอง'
const METHODS = 'วิธีคุ้มครองที่ 2 / 3 / 4'
const ART14 = 'ส่งกรมคุ้มครองสิทธิและเสรีภาพ (ข้อ 14)'

/** ทุกฉากของคลิปรวม (เส้นหลัก + ทางแยก) — ฉบับแยก case เลือกฉากจากรายการนี้ */
const ALL_SEGMENTS: Segment[] = [
  { kind: 'intro', key: 'intro' },
  { kind: 'intake', key: 'intake' },
  step('Case 1', '02'), step('Case 1.1', '02'), step('Case 1.2', '03'), step('Case 1.3', '04'),
  { kind: 'branch', key: 'branch:fast-track', branch: FAST, tabs: ['06'] },
  step('Case 3', '06', 'fast-track', FAST), step('Case 3.1', '06', 'fast-track', FAST),
  { kind: 'return', key: 'return:fast-track', branch: FAST, tabs: ['05'] },
  step('Case 1.4', '05'), step('Case 1.5', '05'), step('Case 1.6', '05'), step('Case 1.7', '07'),
  { kind: 'branch', key: 'branch:appeal', branch: APPEAL, tabs: ['09A', '09B'] },
  step('Case 4', '09A', 'appeal', APPEAL), step('Case 4.3', '09B', 'appeal', APPEAL),
  { kind: 'return', key: 'return:appeal', branch: APPEAL, tabs: ['08A'] },
  step('Case 1.8', '08A'), step('Case 1.9', '08A'), step('Case 1.10', '08A'), step('Case 1.11', '08A'),
  step('Case 1.12', '08A-1'),
  { kind: 'branch', key: 'branch:methods', branch: METHODS, tabs: ['08A-2', '08A-3', '08B'] },
  step('Case 8', '08A-2 · 08A-3', 'methods-2-3-4', METHODS), step('Case 8.1', '08B', 'methods-2-3-4', METHODS),
  { kind: 'return', key: 'return:methods', branch: METHODS, tabs: ['10'] },
  step('Case 1.13', '10'), step('Case 1.14', '11A'),
  { kind: 'branch', key: 'branch:extension', branch: EXTEND, tabs: ['11B'] },
  step('Case 9', '11B', 'extension', EXTEND), step('Case 9.2', '11B', 'extension', EXTEND),
  { kind: 'branch', key: 'branch:article14', branch: ART14, tabs: ['11A', '08C'] },
  step('Case 10', '11A', 'article14', ART14), step('Case 10.1', '11A', 'article14', ART14), step('Case 10.2', '11A', 'article14', ART14),
  step('Case 5', '08C', 'article14', ART14), step('Case 5.1', '08C', 'article14', ART14),
  { kind: 'return', key: 'return:extension', branch: EXTEND, tabs: ['11C'] },
  step('Case 1.15', '11C'), step('Case 1.16', '11D'), step('Case 1.17', '11D'), step('Case 1.18', '11D'), step('Case 1.19', '11D'),
  { kind: 'outro', key: 'outro' },
]

/**
 * ฉบับที่ถ่ายได้ — PRESENT_CUT=full (ค่าเริ่มต้น คลิปรวม) · main (เส้นทางหลัก) · หรือทางแยกแต่ละเส้น (คลิปเดี่ยว)
 * ฉบับแยกเปิดด้วยการ์ดของตัวเอง ไม่มีการ์ด "กลับสู่เส้นทางหลัก"
 */
export const CUTS: Record<string, { title: string; branch?: string }> = {
  full: { title: 'เส้นทางคำร้องขอคุ้มครองพยาน ตั้งแต่รับเรื่องจนปิดงาน' },
  main: { title: 'เส้นทางหลัก: คำร้องขอคุ้มครองพยาน ตั้งแต่รับเรื่องจนปิดงาน' },
  'fast-track': { title: `ทางแยก: ${FAST}`, branch: FAST },
  appeal: { title: `ทางแยก: ${APPEAL}`, branch: APPEAL },
  methods: { title: `ทางแยก: ${METHODS}`, branch: METHODS },
  extension: { title: `ทางแยก: ${EXTEND}`, branch: EXTEND },
  article14: { title: `ทางแยก: ${ART14}`, branch: ART14 },
}
export const CUT = process.env.PRESENT_CUT || 'full'
if (!CUTS[CUT]) throw new Error(`ไม่รู้จัก PRESENT_CUT=${CUT} — ใช้ได้: ${Object.keys(CUTS).join(', ')}`)
export const CUT_TITLE = CUTS[CUT].title

function segmentsOf(cut: string): Segment[] {
  if (cut === 'full') return ALL_SEGMENTS
  if (cut === 'main') {
    return ALL_SEGMENTS.flatMap((seg): Segment[] => {
      if (seg.kind === 'intro' || seg.kind === 'outro') return [{ ...seg, key: `${seg.key}:main` }]
      if (seg.kind === 'branch' || seg.kind === 'return' || (seg.kind === 'step' && seg.branch)) return []
      return [seg]
    })
  }
  const branch = CUTS[cut].branch
  return ALL_SEGMENTS.filter((seg) => (seg.kind === 'branch' || seg.kind === 'step') && seg.branch === branch)
}

export const SEGMENTS: Segment[] = segmentsOf(CUT)

/** จุดพักที่จงใจไม่อยู่ใน flow-map.json (ทบทวนผลที่ 180 วันก่อนเข้าข้อ 14) — บทบาทอ่านจาก mock state ส่วนป้ายขั้นตอนกำหนดที่นี่ */
const EXTRA_LABELS: Record<string, string> = {
  'Case 10': 'ทบทวนผลที่ 180/180 วัน ยังมีภัย',
  'Case 10.1': 'ผบช.ชั้นต้นตรวจผลทบทวน',
  'Case 10.2': 'เห็นชอบแล้ว ไปส่งต่อกรม (ข้อ 14)',
}

function checkpointOf(scenarioId: string, mockState: string) {
  return flowMap.scenarios.find((s) => s.id === scenarioId)?.checkpoints.find((c) => c.mock_state === mockState)
}

export function checkpointRole(scenarioId: string, mockState: string): UserRole {
  const cp = checkpointOf(scenarioId, mockState)
  if (!cp && !EXTRA_LABELS[mockState]) throw new Error(`ไม่พบจุดพัก ${mockState} ใน ${scenarioId}`)
  return (cp?.role as UserRole | null | undefined) ?? mockStateRole(mockState)
}

export function checkpointLabel(scenarioId: string, mockState: string) {
  return checkpointOf(scenarioId, mockState)?.label ?? EXTRA_LABELS[mockState]
}

/** แท็บเส้นหลักล่าสุดก่อนแต่ละฉาก ตามลำดับคลิปรวม — ฉบับแยกจึงแสดงแถบความคืบหน้าตรงกับตำแหน่งในเรื่อง */
const MAIN_TAB_BEFORE = (() => {
  let lastMainTab = ROUTE[0]
  const out = new Map<string, string>()
  for (const seg of ALL_SEGMENTS) {
    out.set(seg.key.replace(/:main$/, ''), lastMainTab)
    if (seg.kind === 'step' && !seg.branch) lastMainTab = seg.tab
  }
  return out
})()

/** สถานะก่อนเริ่มแต่ละฉาก ถ้าถ่ายต่อเนื่องตั้งแต่ต้น — ส่วนที่เริ่มกลางเรื่องจึงสลับบทบาท/แถบความคืบหน้าได้เหมือนคลิปเดียว */
export const BEFORE: Array<{ role: UserRole | null; lastMainTab: string }> = (() => {
  let role: UserRole | null = null
  return SEGMENTS.map((seg) => {
    const before = { role, lastMainTab: MAIN_TAB_BEFORE.get(seg.key.replace(/:main$/, '')) ?? ROUTE[0] }
    if (seg.kind === 'step') role = checkpointRole(seg.scenario, seg.key)
    else if (seg.kind === 'intake') role = 'receiver'
    // ฉบับทางแยกเริ่มด้วยการ์ด — ยังไม่มีบทบาท ขั้นแรกจึงเปิดด้วยบทบาทของตัวเองโดยไม่สลับ
    else if (seg.kind === 'intro' || seg.kind === 'outro' || seg.kind === 'return' || CUT === 'full') role ??= 'receiver'
    return before
  })
})()

export const FROM = Number(process.env.PRESENT_FROM || 1)
export const TO = Number(process.env.PRESENT_TO || SEGMENTS.length)
/** ชื่อไฟล์ผลลัพธ์: presentation (คลิปรวม) · presentation-<cut> (ฉบับแยก) — ถ่ายบางช่วงต่อท้าย .part-<จาก>-<ถึง> */
const CUT_BASE = CUT === 'full' ? 'presentation' : `presentation-${CUT}`
export const BASE = FROM > 1 || TO < SEGMENTS.length ? `${CUT_BASE}.part-${FROM}-${TO}` : CUT_BASE
/** วิดีโอดิบและ cue ของแต่ละส่วน: <BASE>.parts/01.webm + 01.json ... */
export const PARTS_DIR = resolve(RAW_DIR, `${BASE}.parts`)

/** playwright.presentation.config.ts ตั้งค่าเริ่มต้นให้ก่อนแยก worker — ทุก worker จึงแบ่งส่วนตรงกัน */
export const WORKERS = Number(process.env.PRESENT_WORKERS || 1)

/** ข้อมูลรอบก่อน (raw/presentation.json ที่ build-presentation.mjs รวมไว้) — ใช้ประมาณความยาวแต่ละฉากและรายการป้ายที่ต้องพากย์ */
export function previousRun(): { wall: number; cues: Array<{ key: string; at: number }>; notes: Array<{ segment: string; note: string }> } | null {
  const file = resolve(RAW_DIR, 'presentation.json')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

/** ความยาวโดยประมาณของแต่ละฉาก (วินาที) — จากเวลาเริ่มพากย์ของฉากถัดไปในรอบก่อน ไม่มีข้อมูลก็ประมาณจากบทพากย์ */
function estimates(): number[] {
  const prev = previousRun()
  const startOf = new Map(prev?.cues.map((c) => [c.key, c.at]) ?? [])
  return SEGMENTS.map((seg, i) => {
    const at = startOf.get(seg.key)
    const nextAt = i + 1 < SEGMENTS.length ? startOf.get(SEGMENTS[i + 1].key) : prev?.wall
    // รอบก่อนเป็นฉบับเต็ม (ไม่กระชับ) ยาวกว่าจริงราว 3 เท่า — ใช้เป็นสัดส่วนแบ่งส่วนเท่านั้น จึงไม่ต้องปรับ
    if (at != null && nextAt != null && nextAt > at) return nextAt - at
    return (narrationFor(seg.key)?.length ?? 0) / 13 + (seg.kind === 'step' ? 40 : seg.kind === 'intake' ? 30 : 2)
  })
}

/**
 * แบ่งฉากช่วง FROM–TO เป็น WORKERS ส่วนติดกัน ให้แต่ละส่วนยาวใกล้กัน
 * ตัดได้เฉพาะก่อนฉาก step (ฉากคั่นทางแยก/กลับเส้นหลักอยู่ติดกับขั้นก่อนหน้าเสมอ ไม่ต้องหาฉากหลังใหม่)
 */
export const PARTS: number[][] = (() => {
  const weight = estimates()
  const indices = SEGMENTS.map((_, i) => i).filter((i) => i + 1 >= FROM && i + 1 <= TO)
  let left = indices.reduce((a, i) => a + weight[i], 0)
  const parts: number[][] = []
  let cur: number[] = []
  let acc = 0
  for (const i of indices) {
    const remaining = WORKERS - parts.length
    if (cur.length && SEGMENTS[i].kind === 'step' && remaining > 1 && acc + weight[i] / 2 >= left / remaining) {
      parts.push(cur)
      left -= acc
      cur = []
      acc = 0
    }
    cur.push(i)
    acc += weight[i]
  }
  if (cur.length) parts.push(cur)
  return parts
})()
