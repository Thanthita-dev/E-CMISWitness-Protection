import { describe, expect, it } from 'vitest'
import { FLOW_GUIDE, formsInText, hasMockState, stepForms, tabForms } from './flowGuide'
import { ROLE_NAMES } from './constants'

describe('คู่มือเดิน flow — flow-map.json ต้องชี้ไปยังของที่มีอยู่จริง', () => {
    const steps = FLOW_GUIDE.tabs.flatMap((t) => t.steps)

    it('เลข WIT ไม่ซ้ำกันทั้งผัง', () => {
        const codes = steps.map((s) => s.code)
        expect(new Set(codes).size).toBe(codes.length)
    })

    it('mock state ทุกตัวที่อ้างถึงมีไฟล์ใน src/mock-states', () => {
        const refs = [
            ...steps.map((s) => s.mock_state),
            ...FLOW_GUIDE.tabs.map((t) => t.entry_mock_state),
            ...FLOW_GUIDE.scenarios.flatMap((sc) => sc.checkpoints.map((cp) => cp.mock_state)),
        ].filter((name): name is string => !!name)
        expect(refs.filter((name) => !hasMockState(name))).toEqual([])
    })

    it('บทบาททุกตัวเป็น UserRole ที่มีอยู่', () => {
        const roles = [
            ...steps.map((s) => s.role),
            ...FLOW_GUIDE.scenarios.flatMap((sc) => sc.checkpoints.map((cp) => cp.role)),
        ].filter(Boolean)
        expect(roles.filter((r) => !(r! in ROLE_NAMES))).toEqual([])
    })

    it('เส้นทางแนะนำอ้างถึงแท็บที่มีในผัง', () => {
        const tabs = new Set(FLOW_GUIDE.tabs.map((t) => t.tab))
        expect(FLOW_GUIDE.scenarios.flatMap((sc) => sc.tabs).filter((t) => !tabs.has(t))).toEqual([])
    })
})

describe('ผังภาพรวมข้ามแท็บ', async () => {
    const { OVERVIEW_LAYOUT, OVERVIEW_EDGES } = await import('../components/flow-guide/FlowOverviewChart')
    const tabs = FLOW_GUIDE.tabs.map((t) => t.tab)

    it('วางกล่องครบทุกแท็บและไม่ทับตำแหน่งกัน', () => {
        expect(Object.keys(OVERVIEW_LAYOUT).sort()).toEqual([...tabs].sort())
        const cells = Object.values(OVERVIEW_LAYOUT).map((p) => `${p.col}:${p.row}`)
        expect(new Set(cells).size).toBe(cells.length)
    })

    it('เส้นเชื่อมอ้างถึงแท็บที่มีจริง และทุกแท็บมีเส้นเข้าหรือออก', () => {
        expect(OVERVIEW_EDGES.flatMap((e) => [e.from, e.to]).filter((t) => !tabs.includes(t))).toEqual([])
        expect(tabs.filter((t) => !OVERVIEW_EDGES.some((e) => e.from === t || e.to === t))).toEqual([])
    })

    it('WIT ที่อ้างเป็นต้นทางของเส้นอยู่ในแท็บต้นทางจริง', () => {
        const stepTab = new Map(FLOW_GUIDE.tabs.flatMap((t) => t.steps.map((s) => [s.code, t.tab] as const)))
        expect(OVERVIEW_EDGES.filter((e) => e.wit && stepTab.get(e.wit) !== e.from)).toEqual([])
    })

    it('ทุกเส้นมีคำอธิบาย ผู้ทำ และแบบ คบ. ที่มีอยู่จริง โดยไม่มีเส้นซ้ำ', () => {
        expect(OVERVIEW_EDGES.filter((e) => !e.desc.trim() || !e.actor.trim())).toEqual([])
        expect(OVERVIEW_EDGES.flatMap((e) => e.forms ?? []).filter((n) => n < 1 || n > 17)).toEqual([])
        const keys = OVERVIEW_EDGES.map((e) => `${e.from}>${e.to}`)
        expect(new Set(keys).size).toBe(keys.length)
    })

    it('ทุกแท็บในผังภาพรวมมีคำอธิบายภาษาง่าย', async () => {
        const { TAB_SUMMARY } = await import('../components/flow-guide/FlowOverviewChart')
        expect(Object.keys(TAB_SUMMARY).sort()).toEqual([...tabs].sort())
        expect(Object.values(TAB_SUMMARY).filter((d) => !d.trim())).toEqual([])
    })

    it('แบบ คบ. ที่คำอธิบายเส้นเอ่ยถึงอยู่ในรายการแบบของเส้นนั้น', () => {
        expect(OVERVIEW_EDGES.filter((e) => formsInText(e.desc).some((n) => !(e.forms ?? []).includes(n)))).toEqual([])
    })

    it('ทุกเส้นมี mock state ที่มีไฟล์จริง พร้อมบทบาทและหน้าที่เปิด', () => {
        expect(OVERVIEW_EDGES.filter((e) => !hasMockState(e.mockState ?? null)).map((e) => `${e.from}>${e.to}`)).toEqual([])
        expect(OVERVIEW_EDGES.filter((e) => !e.mockRole || !(e.mockRole in ROLE_NAMES) || !e.mockRoute?.startsWith('/'))).toEqual([])
    })
})

describe('ผังรายขั้น WIT (flow-diagram.json) ตรงกับ flow-map.json', async () => {
    const { TAB_DIAGRAMS } = await import('../components/flow-guide/TabStepDiagram')

    it('มีผังครบทุกแท็บ และทุกขั้น WIT อยู่ในผังของแท็บตัวเอง', () => {
        const missing = FLOW_GUIDE.tabs.flatMap((t) => {
            const codes = new Set((TAB_DIAGRAMS[t.tab]?.nodes ?? []).map((n) => n.code))
            return t.steps.filter((s) => !codes.has(s.code)).map((s) => `${t.tab}:${s.code}`)
        })
        expect(missing).toEqual([])
    })

    it('เส้นทุกเส้นต่อกับกล่องที่มีอยู่ในผังเดียวกัน', () => {
        const dangling = Object.entries(TAB_DIAGRAMS).flatMap(([tab, d]) => {
            const ids = new Set(d.nodes.map((n) => n.id))
            return d.edges
                .filter((e) => (e.source && !ids.has(e.source)) || (e.target && !ids.has(e.target)))
                .map((e) => `${tab}:${e.id}`)
        })
        expect(dangling).toEqual([])
    })
})

describe('แบบ คบ. ที่เกี่ยวข้องกับกล่องในผัง', () => {
    it('อ่านเลขแบบจากข้อความได้ทั้งแบบเดี่ยว รายการ และช่วง', () => {
        expect(formsInText('บันทึก คบ.3/คบ.1 และร่าง คบ.5')).toEqual([1, 3, 5])
        expect(formsInText('ยุติการคุ้มครอง (คบ.15-17)')).toEqual([15, 16, 17])
        expect(formsInText(null, 'ไม่มีแบบ', undefined)).toEqual([])
    })

    it('นับจากทุกช่องของขั้น ไม่ใช่แค่ข้อความในผัง', () => {
        const step = FLOW_GUIDE.tabs.flatMap((t) => t.steps).find((s) => s.code === 'WIT1111')!
        expect(stepForms(step)).toEqual(expect.arrayContaining([15, 16, 17]))
    })

    it('เลขแบบทุกตัวอยู่ในช่วง คบ.1–คบ.17 และแท็บรวมแบบของทุกขั้น', () => {
        FLOW_GUIDE.tabs.forEach((t) => {
            const all = tabForms(t)
            all.forEach((n) => expect(n).toBeGreaterThanOrEqual(1))
            all.forEach((n) => expect(n).toBeLessThanOrEqual(17))
            t.steps.forEach((s) => expect(all).toEqual(expect.arrayContaining(stepForms(s))))
        })
    })
})
