import snapshotIndex from '../flow-snapshots/index.json'
import { overrideRole } from './flowGuide'
import { MockState, applyMockState, captureCurrentLocalStorageData, getEcmisLocalStorageKeys } from './mockState'
import type { UserRole } from '../types/user'

/**
 * snapshot รายกล่อง/รายเส้นของผัง /flow-chart — สร้างด้วย scripts/build-flow-snapshots.mjs (อย่าแก้ไฟล์ใน src/flow-snapshots ด้วยมือ)
 * key: node:<tab>:<nodeId> · edge:<tab>:<edgeId> · overview:<from>><to> · tab:<tab>
 * index.json โหลดทันที ส่วนไฟล์ state (ขนาดใหญ่ มีหลายร้อยไฟล์) โหลดเมื่อกดเล่นเท่านั้น
 */

export interface FlowSnapshot {
    /** hash ของไฟล์ใน states/ */
    state: string
    label: string
    role: UserRole | null
    route: string
}

const ENTRIES = (snapshotIndex as unknown as { entries: Record<string, FlowSnapshot> }).entries

const stateLoaders = import.meta.glob<{ default: MockState }>('/src/flow-snapshots/states/*.json')

export const snapshotKey = {
    node: (tab: string, nodeId: string) => `node:${tab}:${nodeId}`,
    edge: (tab: string, edgeId: string) => `edge:${tab}:${edgeId}`,
    overview: (edgeKey: string) => `overview:${edgeKey}`,
    tab: (tab: string) => `tab:${tab}`,
}

export const snapshotFor = (key: string | null | undefined): FlowSnapshot | null =>
    key && Object.prototype.hasOwnProperty.call(ENTRIES, key) ? ENTRIES[key] : null

export const hasSnapshot = (key: string | null | undefined): boolean => !!snapshotFor(key)

/** จำนวนจุดที่มี snapshot จากรายการ key ทั้งหมดที่ผังมี */
export function snapshotCoverage(allKeys: string[]): { done: number; total: number } {
    return { done: allKeys.filter(hasSnapshot).length, total: allKeys.length }
}

async function loadState(hash: string): Promise<MockState> {
    const loader = stateLoaders[`/src/flow-snapshots/states/${hash}.json`]
    if (!loader) throw new Error(`ไม่พบไฟล์ snapshot ${hash}`)
    return (await loader()).default
}

/** route ต้องเป็น path ภายในแอป (ขึ้นต้นด้วย / ตัวเดียว) — กัน "//host" หรือ URL เต็มจาก snapshot ที่ผิดรูปแบบ */
const safeRoute = (route: string): string => (/^\/(?!\/)/.test(route) ? route : '/')

/** คืน ecmis-* เดิมกลับเมื่อนำ snapshot เข้าไม่สำเร็จกลางทาง */
function restoreLocalStorage(data: Record<string, string>) {
    getEcmisLocalStorageKeys().forEach((k) => localStorage.removeItem(k))
    Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v))
}

/**
 * โหลด snapshot ของ key แล้วเปิดหน้าเป้าหมายในแท็บใหม่ — ต้องเรียกจาก click handler โดยตรง
 * แท็บใหม่ถูกเปิดทันที (ก่อน await) เพื่อไม่ให้เบราว์เซอร์บล็อกป๊อปอัป แล้วค่อยเปลี่ยนเป็นหน้าเป้าหมายหลังนำ state เข้า localStorage
 * ถ้าเปิดแท็บไม่ได้จะหยุดก่อนแตะ localStorage และถ้านำ state เข้าไม่สำเร็จจะคืนข้อมูลเดิม
 */
export async function playSnapshot(key: string): Promise<void> {
    const snap = snapshotFor(key)
    if (!snap) throw new Error(`ไม่มี snapshot สำหรับ "${key}"`)
    const win = window.open('about:blank', '_blank')
    if (!win) throw new Error('เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต pop-up แล้วลองอีกครั้ง')
    const backup = captureCurrentLocalStorageData()
    try {
        const state = await loadState(snap.state)
        applyMockState(state)
        if (snap.role) overrideRole(snap.role)
        // แท็บใหม่ไม่ต้องอ้างกลับมาที่หน้าคู่มือนี้ได้
        win.opener = null
        win.location.href = safeRoute(snap.route || state.to || '/')
    } catch (error) {
        restoreLocalStorage(backup)
        win.close()
        throw error
    }
}
