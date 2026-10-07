import { shiftMockDates } from './mockDateShift'

export interface MockState {
    name: string
    description: string
    to: string | null
    /** หัวข้อกลุ่มในหน้า Mock State — ไม่ระบุ = จัดกลุ่มตามเลขชุดของชื่อ (Case 1.x → "ชุด Case 1") */
    group?: string
    /** วันที่บันทึก state — ถ้ามี จะเลื่อนวันเวลา ISO ทั้งหมดให้สัมพันธ์กับวันที่โหลด (ดู shiftMockDates) */
    capturedAt?: string
    localStorageData: Record<string, string>
}

/** เฉพาะ key ที่ระบบ ECMIS persist ลง localStorage (zustand persist) เท่านั้นที่ถูกจัดการโดยหน้านี้ */
const ECMIS_KEY_PREFIX = 'ecmis-'

const mockStateModules = import.meta.glob<{ default: MockState }>('/src/mock-states/*.json', { eager: true })

const byName = (a: MockState, b: MockState) => a.name.localeCompare(b.name, undefined, { numeric: true })

export const MOCK_STATES: MockState[] = Object.values(mockStateModules)
    .map((mod) => mod.default)
    .sort(byName)

export function mockStateGroup(state: MockState): string {
    if (state.group) return state.group
    const series = state.name.match(/^(.*?\d+)(?:\.\d+)?$/)
    return series ? `ชุด ${series[1]}` : 'อื่น ๆ'
}

/** จัดกลุ่มตามลำดับที่กลุ่มปรากฏครั้งแรก (เรียงตามชื่อแบบตัวเลข: Case 1 → Case 1.2 → Case 1.10 → Case 2) */
export function groupMockStates(states: MockState[]): Array<{ group: string; states: MockState[] }> {
    const groups = new Map<string, MockState[]>()
    ;[...states].sort(byName).forEach((state) => {
        const key = mockStateGroup(state)
        groups.set(key, [...(groups.get(key) ?? []), state])
    })
    return [...groups].map(([group, list]) => ({ group, states: list }))
}

export function getEcmisLocalStorageKeys(): string[] {
    return Object.keys(localStorage).filter((k) => k.startsWith(ECMIS_KEY_PREFIX))
}

/** ล้าง ecmis-* key เดิมทั้งหมด แล้วเซ็ตค่าใหม่ตาม state (overwrite ทั้งหมด) */
export function applyMockState(state: MockState) {
    getEcmisLocalStorageKeys().forEach((key) => localStorage.removeItem(key))
    Object.entries(shiftMockDates(state.localStorageData, state.capturedAt)).forEach(([key, value]) => {
        localStorage.setItem(key, value)
    })
}

export function captureCurrentLocalStorageData(): Record<string, string> {
    const data: Record<string, string> = {}
    getEcmisLocalStorageKeys().forEach((key) => {
        const value = localStorage.getItem(key)
        if (value !== null) data[key] = value
    })
    return data
}

export function downloadMockState(state: MockState) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const safeName = state.name.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'mock-state'
    a.href = url
    a.download = `${safeName}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}
