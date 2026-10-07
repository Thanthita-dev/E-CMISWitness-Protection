/**
 * รายงานความคืบหน้าตอนถ่าย — worker เขียนบรรทัด "@@progress {json}" ออก stdout
 * แล้ว progress-reporter.ts (ฝั่ง runner) แปลงเป็นข้อความอ่านง่ายพร้อมเปอร์เซ็นต์และเวลาที่เหลือ
 */
export const PROGRESS_TAG = '@@progress '

export type ProgressEvent =
  | { type: 'part-start'; part: number; of: number; first: number; last: number; scenes: number }
  | { type: 'scene-start'; part: number; index: number; total: number; key: string; kind: string; title: string; role?: string }
  | { type: 'action'; part: number; key: string; note: string; voiced: boolean }
  | { type: 'scene-end'; part: number; index: number; key: string; seconds: number }
  | { type: 'part-end'; part: number; seconds: number; video: string }

export function emit(e: ProgressEvent) {
  process.stdout.write(`${PROGRESS_TAG}${JSON.stringify(e)}\n`)
}
