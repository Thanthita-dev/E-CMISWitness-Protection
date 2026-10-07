/** วันเวลาแบบ ISO เต็มรูปแบบ (เช่น 2026-09-23T05:00:00.000Z) — รูปแบบที่ระบบใช้คำนวณกรอบเวลา/วันสะสม */
const ISO_DATETIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g

/**
 * เลื่อนวันเวลา ISO ทุกค่าใน localStorage ของ mock state ไปข้างหน้าเท่ากับเวลาที่ผ่านไปนับจากวันที่บันทึก state
 * เพื่อให้เงื่อนไขที่ผูกกับ "วันนี้" (เหลือกี่วันก่อนครบกรอบอุทธรณ์, สะสมกี่วันจากเพดาน 180 วัน) คงเดิมทุกครั้งที่โหลด
 * ค่าวันที่แบบไทย (dd/mm/25xx) ใช้แสดงผลเท่านั้น จึงไม่ถูกเลื่อน
 */
export function shiftMockDates(
  data: Record<string, string>,
  capturedAt: string | undefined,
  now: number = Date.now()
): Record<string, string> {
  const captured = capturedAt ? Date.parse(capturedAt) : NaN
  if (Number.isNaN(captured)) return data
  const delta = now - captured
  if (delta <= 0) return data
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      value.replace(ISO_DATETIME, (d) => new Date(Date.parse(d) + delta).toISOString()),
    ])
  )
}
