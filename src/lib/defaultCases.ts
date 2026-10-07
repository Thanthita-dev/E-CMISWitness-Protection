import type { CaseItem } from '../types/case'
import demo from '../mock-states/Demo.json'
import { shiftMockDates } from './mockDateShift'

/**
 * เรื่องตั้งต้นของระบบ (เปิดครั้งแรก / resetToDefault) — ใช้ชุดเดียวกับ mock state "Demo"
 * ที่มาจากข้อมูล ก4/5 context/scenario/data-A4-5/file6-10.json (ตรงกับ shared-assets/demo-scenarios.json)
 * วันเวลา ISO ถูกเลื่อนให้สัมพันธ์กับวันนี้เหมือน applyMockState
 */
export function getDefaultCaseState(): { cases: CaseItem[]; activeCaseNo: string | null } {
    const data = shiftMockDates(demo.localStorageData as Record<string, string>, demo.capturedAt)
    const persisted = JSON.parse(data['ecmis-case-storage-v2'] ?? '{}')
    const state = persisted?.state ?? {}
    return { cases: state.cases ?? [], activeCaseNo: state.activeCaseNo ?? null }
}
