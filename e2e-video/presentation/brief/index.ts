import { NARRATION } from '../narration'
import branches from './branches'
import intake from './intake'
import main from './main'
import type { BriefPack } from './types'

/** ฉบับกระชับเป็นค่าเริ่มต้น — PRESENT_FULL=1 กลับไปพากย์ทุกป้ายแบบเดิม */
export const BRIEF = process.env.PRESENT_FULL !== '1'

const packs: BriefPack[] = [main, branches, intake]
const narration: Record<string, string> = Object.assign({}, ...packs.map((p) => p.narration))
const keep = new Map<string, Set<string>>()
for (const p of packs) for (const [seg, labels] of Object.entries(p.keep)) keep.set(seg, new Set([...(keep.get(seg) ?? []), ...labels]))
const speech: Record<string, string> = Object.assign({}, ...packs.map((p) => p.speech))

/** บทเปิดฉาก — ฉบับกระชับใช้บทสั้นก่อน */
export function narrationFor(key: string): string | undefined {
  return (BRIEF && narration[key]) || NARRATION[key]
}

/** ป้ายนี้ขึ้นจอและพากย์ในฉากนี้ไหม (ฉบับเต็มแสดงทุกป้าย) */
export function keepNote(segment: string, shown: string) {
  return !BRIEF || !!keep.get(segment)?.has(shown)
}

/** คำพากย์สั้นของป้ายในฉบับกระชับ */
export function briefSpeech(shown: string): string | undefined {
  return BRIEF ? speech[shown] : undefined
}

/** ป้ายที่ฉบับกระชับพากย์ในฉากเหล่านี้ — ใช้สร้างเสียงล่วงหน้า */
export function keptNotes(segments: Iterable<string>): string[] {
  return [...segments].flatMap((s) => [...(keep.get(s) ?? [])])
}
