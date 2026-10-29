import { describe, expect, it } from 'vitest'
import diagramData from '../../flow-guide/flow-diagram.json'
import snapshotIndex from '../../flow-snapshots/index.json'
import { OVERVIEW_DETAIL, overviewGeometry, overviewRoutes } from './overviewLayout'
import { OVERVIEW_EDGES, edgeKey } from './FlowOverviewChart'

type Diagram = { nodes: { id: string }[]; edges: { id: string; source: string | null; target: string | null }[] }
const DIAGRAMS = (diagramData as unknown as { tabs: Record<string, Diagram> }).tabs
const SNAPSHOTS = (snapshotIndex as unknown as { entries: Record<string, unknown> }).entries

describe('ผังภาพรวม — ข้อมูล milestone', () => {
    it('ทุก milestone ตรงกับกล่อง WIT ของแท็บนั้นในผังรายขั้น (ยกเว้นที่ระบุว่ารอแก้ผังแท็บ)', () => {
        Object.entries(OVERVIEW_DETAIL.tabs).forEach(([tab, d]) => {
            d.steps.forEach((s) => {
                const ok = DIAGRAMS[tab].nodes.some((n) => n.id === s.code) || d.pending?.includes(s.code)
                expect(ok, `${tab} ${s.code}`).toBe(true)
                expect(s.snapshot).toBe(`node:${tab}:${s.code}`)
            })
        })
    })

    it('เส้นในกรอบใช้ snapshot ของเส้นตรงในผังรายขั้น ถ้าไม่มีเส้นตรงใช้ snapshot ของกล่องปลายทาง', () => {
        Object.entries(OVERVIEW_DETAIL.tabs).forEach(([tab, d]) => {
            const codes = d.steps.map((s) => s.code)
            d.edges.forEach((e) => {
                expect(codes, `${tab} ${e.from}`).toContain(e.from)
                expect(codes, `${tab} ${e.to}`).toContain(e.to)
                const direct = DIAGRAMS[tab].edges.find((x) => x.source === e.from && x.target === e.to)
                expect(e.snapshot).toBe(direct ? `edge:${tab}:${direct.id}` : `node:${tab}:${e.to}`)
            })
        })
    })

    it('เส้นข้ามแท็บทุกเส้นมีต้นทาง/ปลายทางเป็น milestone ของแท็บที่ถูกต้อง และใช้ key overview เดิม', () => {
        OVERVIEW_EDGES.forEach((e) => {
            const c = OVERVIEW_DETAIL.cross[edgeKey(e)]
            expect(c, edgeKey(e)).toBeTruthy()
            expect(OVERVIEW_DETAIL.tabs[e.from].steps.some((s) => s.code === c.from)).toBe(true)
            expect(OVERVIEW_DETAIL.tabs[e.to].steps.some((s) => s.code === c.to)).toBe(true)
            expect(c.snapshot).toBe(`overview:${edgeKey(e)}`)
        })
        expect(Object.keys(OVERVIEW_DETAIL.cross)).toHaveLength(OVERVIEW_EDGES.length)
    })

    it('snapshot ที่อ้างถึงมีอยู่ใน index ทุก key', () => {
        const missing: string[] = []
        Object.values(OVERVIEW_DETAIL.tabs).forEach((d) => {
            ;[...d.steps, ...d.edges].forEach((x) => {
                if (!(x.snapshot in SNAPSHOTS)) missing.push(x.snapshot)
            })
        })
        expect(missing).toEqual([])
    })
})

describe('ผังภาพรวม — การวางตำแหน่งและเส้นทาง', () => {
    const geo = overviewGeometry()
    const intersects = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
        a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

    it('กรอบแท็บไม่ทับกัน และกล่อง milestone อยู่ในกรอบของตัวเอง ไม่ทับกัน', () => {
        const frames = Object.entries(geo.frames)
        for (let i = 0; i < frames.length; i++)
            for (let j = i + 1; j < frames.length; j++) expect(intersects(frames[i][1], frames[j][1]), `${frames[i][0]} ${frames[j][0]}`).toBe(false)
        const steps = Object.values(geo.steps)
        steps.forEach((s) => {
            const f = geo.frames[s.tab]
            expect(s.x >= f.x && s.y >= f.y && s.x + s.w <= f.x + f.w && s.y + s.h <= f.y + f.h, s.key).toBe(true)
        })
        for (let i = 0; i < steps.length; i++) for (let j = i + 1; j < steps.length; j++) expect(intersects(steps[i], steps[j]), `${steps[i].key} ${steps[j].key}`).toBe(false)
    })

    it('ทุกเส้นหาเส้นทางแบบฉากได้ และไม่พาดผ่านกล่อง milestone', () => {
        const routes = overviewRoutes()
        const steps = Object.values(geo.steps)
        const bad: string[] = []
        routes.forEach((r, id) => {
            const orth = r.points.every((p, i) => i === 0 || p[0] === r.points[i - 1][0] || p[1] === r.points[i - 1][1])
            if (!orth) bad.push(`${id} ไม่ใช่เส้นฉาก`)
            r.points.forEach((p, i) => {
                if (i === 0) return
                const q = r.points[i - 1]
                const lo = [Math.min(p[0], q[0]), Math.min(p[1], q[1])]
                const hi = [Math.max(p[0], q[0]), Math.max(p[1], q[1])]
                steps.forEach((s) => {
                    // ปลายเส้นแตะขอบกล่องได้ แต่ห้ามเข้าไปในตัวกล่อง
                    const inside = hi[0] > s.x + 1 && lo[0] < s.x + s.w - 1 && hi[1] > s.y + 1 && lo[1] < s.y + s.h - 1
                    if (inside) bad.push(`${id} ทับ ${s.key}`)
                })
            })
        })
        expect(bad).toEqual([])
        expect(routes.size).toBe(Object.values(OVERVIEW_DETAIL.tabs).reduce((n, d) => n + d.edges.length, 0) + OVERVIEW_EDGES.length)
    })
})
