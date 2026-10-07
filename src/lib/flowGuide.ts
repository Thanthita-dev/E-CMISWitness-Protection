import flowMap from '../flow-guide/flow-map.json'
import { ECMIS_USER_DIRECTORY, ROLE_ORG_ASSIGNMENTS } from './constants'
import { MOCK_STATES, applyMockState } from './mockState'
import type { UserRole } from '../types/user'

/**
 * คู่มือเดิน flow — จับคู่ขั้น WIT ในผัง drawio (context/user-flow) กับหน้าจอใน prototype
 * ข้อมูลอยู่ที่ src/flow-guide/flow-map.json (แหล่งเดียวกับ docs/flow-guide.md)
 */

/** yes = ทำได้ใน UI · partial = ทำได้บางส่วน · no = ยังไม่มี · system = ระบบทำเอง/เกิดนอกระบบ */
export type StepStatus = 'yes' | 'partial' | 'no' | 'system'

export interface FlowGuideStep {
    code: string
    /** ข้อความในกล่องของผัง drawio */
    text: string
    /** swimlane ในผัง = ผู้รับผิดชอบขั้นนี้ */
    lane: string
    decision: boolean
    implemented: StepStatus
    role: UserRole | null
    /** คำอธิบายบทบาทเพิ่มเติม เมื่อขั้นนี้ต้องสลับหลายบทบาทหรือมีทางเลือก */
    role_note: string | null
    route: string | null
    ui: string | null
    code_ref: string | null
    how_to: string | null
    mock_state: string | null
    specs: string[]
    note: string | null
}

export interface FlowGuideTab {
    tab: string
    title: string
    /** กลุ่มของแท็บในหน้าคู่มือ */
    phase: string
    entry: string
    path_summary: string
    /** mock state ที่ใช้เริ่มแท็บนี้ (ถ้ามี) */
    entry_mock_state: string | null
    entry_role: UserRole | null
    /** swimlane ในผัง เรียงจากบนลงล่าง */
    lanes: string[]
    gaps: string[]
    steps: FlowGuideStep[]
}

export interface FlowGuideScenario {
    id: string
    title: string
    summary: string
    tabs: string[]
    /** ลำดับ mock state ที่ใช้เดินเส้นทางนี้ */
    checkpoints: Array<{ mock_state: string; role: UserRole | null; label: string }>
}

export interface FlowGuideData {
    source: string
    generatedAt: string
    tabs: FlowGuideTab[]
    scenarios: FlowGuideScenario[]
}

export const FLOW_GUIDE = flowMap as FlowGuideData

/** ชื่อแท็บโดยตัดเลขแท็บและ " — กิจกรรมที่ 6" ออก */
export const tabShortTitle = (t: FlowGuideTab) => t.title.replace(/^\S+\s+/, '').replace(/\s*—\s*กิจกรรมที่ 6.*$/, '')

const KB_REF = /คบ\.?\s*(\d+)(?:\s*[-–]\s*(\d+))?/g

/** เลขแบบ คบ. ที่ข้อความอ้างถึง เช่น "คบ.1/คบ.3" → [1, 3], "คบ.15-17" → [15, 16, 17] (เรียงน้อยไปมาก ไม่ซ้ำ) */
export function formsInText(...texts: Array<string | null | undefined>): number[] {
    const found = new Set<number>()
    texts.forEach((text) => {
        for (const m of (text ?? '').matchAll(KB_REF)) {
            const from = Number(m[1])
            const to = m[2] ? Number(m[2]) : from
            for (let n = from; n <= to; n++) if (n >= 1 && n <= 17) found.add(n)
        }
    })
    return [...found].sort((a, b) => a - b)
}

/** แบบ คบ. ที่เกี่ยวข้องกับขั้น — นับทุกที่ที่อ้างถึง ทั้งข้อความในผัง หน้าจอ วิธีกด และหมายเหตุ */
export const stepForms = (s: FlowGuideStep) => formsInText(s.text, s.ui, s.how_to, s.note, s.role_note)

/** แบบ คบ. ทั้งหมดที่ใช้ในแท็บ */
export const tabForms = (t: FlowGuideTab) => formsInText(...t.steps.flatMap((s) => [s.text, s.ui, s.how_to, s.note, s.role_note]))

export const hasMockState =(name: string | null): name is string =>
    !!name && MOCK_STATES.some((s) => s.name === name)

/** บทบาทที่ล็อกอินอยู่ตอนบันทึก mock state นั้น */
export function mockStateRole(name: string): UserRole | null {
    const raw = MOCK_STATES.find((s) => s.name === name)?.localStorageData['ecmis-auth-storage']
    if (!raw) return null
    try {
        return JSON.parse(raw).state?.currentRole ?? null
    } catch {
        return null
    }
}

/** แทนที่บทบาทใน ecmis-auth-storage ตามตรรกะเดียวกับ useAuthStore.setRole (หน่วยงานเปลี่ยนตามบทบาท) */
function overrideRole(role: UserRole) {
    const raw = localStorage.getItem('ecmis-auth-storage')
    if (!raw) return
    const auth = JSON.parse(raw)
    const assignment = ROLE_ORG_ASSIGNMENTS[role] || ROLE_ORG_ASSIGNMENTS.receiver
    auth.state.currentRole = role
    if (role.startsWith('got_')) {
        const account = ECMIS_USER_DIRECTORY.find((u) => u.active && u.roles.includes(role))
        if (account) auth.state.currentOfficerUserId = account.id
    } else if ((role === 'officer' || role === 'case_owner') && auth.state.currentOfficerUserId?.startsWith('GOT-')) {
        auth.state.currentOfficerUserId = 'OFF-001'
    }
    auth.state.currentOrgUnitId = assignment.central ? 'central-wp' : assignment.units[0] || 'central-wp'
    localStorage.setItem('ecmis-auth-storage', JSON.stringify(auth))
}

/**
 * โหลด mock state + สลับบทบาท แล้วเปิดหน้าเป้าหมายในแท็บใหม่ (หน้าคู่มือยังเปิดค้างไว้ดูประกอบ)
 * ข้อมูล ecmis-* เดิมใน localStorage จะถูกแทนที่ทั้งหมด — เหมือนปุ่มในหน้า /mock-state
 */
export function playFromCheckpoint(mockStateName: string, role: UserRole | null, route: string | null) {
    const state = MOCK_STATES.find((s) => s.name === mockStateName)
    if (!state) throw new Error(`ไม่พบ mock state "${mockStateName}"`)
    applyMockState(state)
    if (role) overrideRole(role)
    window.open(route || state.to || '/', '_blank')
}
