import type { CaseItem } from '../types/case'

/**
 * เรื่องตั้งต้นของระบบ (เปิดครั้งแรก / resetToDefault) — เริ่มว่างเปล่า
 * เรื่องเข้ามาจากการส่งต่อของ ก4/5 หรือโหลดชุดสาธิตจากหน้า Mock State (/mock-state)
 */
export function getDefaultCaseState(): { cases: CaseItem[]; activeCaseNo: string | null } {
    return { cases: [], activeCaseNo: null }
}
