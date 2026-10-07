import { CaseItem } from '../types/case'
import { UserRole } from '../types/user'

/**
 * จำลอง endpoint ฝั่งเซิร์ฟเวอร์ — ระบบนี้ยังไม่มี backend จริง (localStorage ล้วน)
 * แต่การตรวจสิทธิ์ที่สำคัญ (เช่น ห้ามแก้ความเห็นข้ามลำดับชั้นใน คบ.6) ควรจำลองพฤติกรรมของ
 * เซิร์ฟเวอร์ที่ตรวจสิทธิ์ซ้ำเสมอ แม้ฝั่ง client จะปิดกั้นไว้แล้วก็ตาม (defense-in-depth, TC-012)
 */

export interface MockApiResult {
  ok: boolean
  status?: number
  message?: string
}

export interface SaveKb6OpinionsParams {
  caseItem: CaseItem
  currentRole: UserRole
  /** ค่าปัจจุบันของช่องความเห็นข้อ 10-13 ณ เวลาที่กด "บันทึกแบบ คบ.6" */
  values: Record<string, string>
  /**
   * ช่องความเห็นที่ตรวจพบความพยายามแก้ไขข้ามลำดับชั้นระหว่างกรอก (ปิดกั้นไว้แล้วที่ฝั่งช่องกรอก
   * ไม่ให้ค่าไหลเข้า store แต่ระบบยังต้องรายงาน 403 กลับมาเสมือนเซิร์ฟเวอร์ปฏิเสธการแก้ไขนั้นจริง)
   */
  attemptedUnauthorizedFields?: string[]
}

/** บันทึกความเห็นตามลำดับชั้นของแบบ คบ.6 (ข้อ 10-13) — คืน 403 เมื่อพบการแก้ไขข้ามลำดับชั้น */
export const saveKb6Opinions = async (params: SaveKb6OpinionsParams): Promise<MockApiResult> => {
  const { attemptedUnauthorizedFields } = params
  if (attemptedUnauthorizedFields && attemptedUnauthorizedFields.length > 0) {
    return { ok: false, status: 403, message: 'ไม่มีสิทธิบันทึกความเห็นชั้นดังกล่าว' }
  }
  return { ok: true }
}
