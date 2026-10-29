import detail from '../../flow-guide/overview-detail.json'

/**
 * โครงและการวางเส้นของผังภาพรวม — ข้อมูลขั้นสำคัญ (milestone) ของแต่ละแท็บอยู่ใน src/flow-guide/overview-detail.json
 * แต่ละ milestone ต้องตรงกับกล่อง WIT หนึ่งกล่องในผังรายขั้นของแท็บนั้น (code = id ใน flow-diagram.json)
 * ไฟล์นี้คำนวณตำแหน่งกรอบแท็บ/กล่อง และหาเส้นทางเส้นแบบฉาก (A*) ให้เส้นอ้อมกล่องโดยไม่ทับกัน
 */

export interface OverviewStep {
    displayCode?: string
    /** เลข WIT (= id กล่องในผังรายขั้น) */
    code: string
    /** ข้อความสั้นในกล่อง */
    label: string
    /** ตำแหน่งในกรอบแท็บ (col อาจเป็นครึ่งช่อง) */
    col: number
    row: number
    /** key ของ snapshot ที่เล่นได้จากกล่องนี้ */
    snapshot: string
}

export interface OverviewStepEdge {
    from: string
    to: string
    label?: string
    /** snapshot ของเส้น: edge:<tab>:<id> เมื่อมีเส้นตรงในผังรายขั้น ไม่เช่นนั้น node:<tab>:<ปลายทาง> */
    snapshot: string
}

export interface OverviewTabDetail {
    cols?: number
    steps: OverviewStep[]
    edges: OverviewStepEdge[]
    /** milestone ที่ผังรายขั้นของแท็บนี้ยังไม่มีกล่องรองรับ (รอแก้ผังแท็บ) */
    pending?: string[]
}

export interface OverviewCrossStep {
    from: string
    to: string
    snapshot: string
}

export const OVERVIEW_DETAIL = detail as unknown as {
    tabs: Record<string, OverviewTabDetail>
    cross: Record<string, OverviewCrossStep>
}

/** ตำแหน่งกรอบแท็บบนตาราง 5 คอลัมน์ (col อาจเป็นครึ่งช่องเพื่อจัดกึ่งกลาง) × แถวบนลงล่าง */
export const OVERVIEW_LAYOUT: Record<string, { col: number; row: number }> = {
    '02': { col: 2, row: 0 },
    '03': { col: 2, row: 1 },
    '04': { col: 2, row: 2 },
    '05': { col: 1, row: 3 },
    '06': { col: 3, row: 3 },
    '07': { col: 1, row: 4 },
    '07G': { col: 2, row: 4 },
    '08C': { col: 0, row: 5 },
    '08A': { col: 2, row: 5 },
    '09A': { col: 4, row: 5 },
    '08A-1': { col: 0, row: 6 },
    '08A-2': { col: 1, row: 6 },
    '08A-3': { col: 2, row: 6 },
    '08B': { col: 3, row: 6 },
    '09B': { col: 4, row: 6 },
    '10': { col: 1.5, row: 7 },
    '11A': { col: 1.5, row: 8 },
    '11B': { col: 0.5, row: 9 },
    '11C': { col: 2.5, row: 9 },
    '11D': { col: 2.5, row: 10 },
}

export const STEP_W = 180
export const STEP_H = 58
const GAP_X = 48
const GAP_Y = 30
const FRAME_PAD = 12
/** ส่วนหัวกรอบแท็บ: เลขแท็บ ชื่อ ป้ายบทบาท แบบ คบ. และแถบสถานะ */
export const HEAD_H = 80
const PAD = 48
const COL_GAP = 96
const ROW_GAP = 96
const SLOT_W = FRAME_PAD * 2 + STEP_W * 2 + GAP_X
const COL_PITCH = SLOT_W + COL_GAP

export interface Rect {
    x: number
    y: number
    w: number
    h: number
}

export interface StepBox extends Rect {
    tab: string
    code: string
    key: string
}

export const stepKey = (tab: string, code: string) => `${tab}:${code}`

export interface OverviewGeometry {
    width: number
    height: number
    frames: Record<string, Rect>
    steps: Record<string, StepBox>
}

function frameSize(tab: string) {
    const d = OVERVIEW_DETAIL.tabs[tab]
    const maxCol = Math.max(...d.steps.map((s) => s.col))
    const maxRow = Math.max(...d.steps.map((s) => s.row))
    const cols = d.cols ?? Math.floor(maxCol) + 1
    const rows = Math.floor(maxRow) + 1
    return {
        w: FRAME_PAD * 2 + cols * STEP_W + (cols - 1) * GAP_X,
        h: HEAD_H + FRAME_PAD * 2 + rows * STEP_H + (rows - 1) * GAP_Y,
    }
}

export function buildGeometry(): OverviewGeometry {
    const tabs = Object.keys(OVERVIEW_LAYOUT).filter((t) => OVERVIEW_DETAIL.tabs[t])
    const rowH: number[] = []
    tabs.forEach((t) => {
        const { row } = OVERVIEW_LAYOUT[t]
        rowH[row] = Math.max(rowH[row] ?? 0, frameSize(t).h)
    })
    const rowTop: number[] = []
    let y = PAD
    rowH.forEach((h, r) => {
        rowTop[r] = y
        y += (h ?? 0) + ROW_GAP
    })
    const frames: Record<string, Rect> = {}
    const steps: Record<string, StepBox> = {}
    tabs.forEach((t) => {
        const { col, row } = OVERVIEW_LAYOUT[t]
        const { w, h } = frameSize(t)
        const centerX = PAD + col * COL_PITCH + SLOT_W / 2
        const frame = { x: Math.round(centerX - w / 2), y: rowTop[row], w, h }
        frames[t] = frame
        OVERVIEW_DETAIL.tabs[t].steps.forEach((s) => {
            const key = stepKey(t, s.code)
            steps[key] = {
                tab: t,
                code: s.code,
                key,
                x: Math.round(frame.x + FRAME_PAD + s.col * (STEP_W + GAP_X)),
                y: frame.y + HEAD_H + FRAME_PAD + s.row * (STEP_H + GAP_Y),
                w: STEP_W,
                h: STEP_H,
            }
        })
    })
    return { width: PAD * 2 + 4 * COL_PITCH + SLOT_W, height: y - ROW_GAP + PAD, frames, steps }
}

/* ───────────── เส้นทางเส้นแบบฉาก (A*) ───────────── */

const G = 10
/** ระยะเว้นรอบกล่อง (px) ที่เส้นอื่นห้ามผ่าน */
const MARGIN = 5
const BEND_COST = 5
const SHARED_COST = 8
const FOREIGN_FRAME_COST = 3
const DX = [0, 1, 0, -1]
const DY = [-1, 0, 1, 0]

export interface RouteRequest {
    id: string
    from: string
    to: string
    /** เส้นในกรอบแท็บเดียวกัน — จัดเส้นทางก่อนเส้นข้ามแท็บ */
    intra: boolean
}

export interface RoutedEdge {
    d: string
    mid: { x: number; y: number }
    /** เส้นย้อนขึ้นด้านบน (วาดเป็นเส้นประ) */
    back: boolean
    points: [number, number][]
}

class MinHeap {
    private keys: number[] = []
    private vals: number[] = []
    get size() {
        return this.keys.length
    }
    push(key: number, val: number) {
        const k = this.keys
        const v = this.vals
        let i = k.length
        k.push(key)
        v.push(val)
        while (i > 0) {
            const p = (i - 1) >> 1
            if (k[p] <= key) break
            k[i] = k[p]
            v[i] = v[p]
            i = p
        }
        k[i] = key
        v[i] = val
    }
    pop(): [number, number] {
        const k = this.keys
        const v = this.vals
        const topK = k[0]
        const topV = v[0]
        const lastK = k.pop() as number
        const lastV = v.pop() as number
        const n = k.length
        if (n > 0) {
            let i = 0
            for (;;) {
                let c = 2 * i + 1
                if (c >= n) break
                if (c + 1 < n && k[c + 1] < k[c]) c++
                if (k[c] >= lastK) break
                k[i] = k[c]
                v[i] = v[c]
                i = c
            }
            k[i] = lastK
            v[i] = lastV
        }
        return [topK, topV]
    }
}

interface Port {
    cell: number
    /** ทิศที่ออกจากกล่อง (0 บน 1 ขวา 2 ล่าง 3 ซ้าย) */
    out: number
    pt: [number, number]
}

function polylineLength(pts: [number, number][]) {
    let len = 0
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    return len
}

function pointAt(pts: [number, number][], at: number) {
    let acc = 0
    for (let i = 1; i < pts.length; i++) {
        const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
        if (acc + seg >= at && seg > 0) {
            const t = (at - acc) / seg
            return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t }
        }
        acc += seg
    }
    const last = pts[pts.length - 1]
    return { x: last[0], y: last[1] }
}

/** เส้นหักมุมโค้งมนเล็กน้อย */
function roundedPath(pts: [number, number][]) {
    let d = `M${pts[0][0]},${pts[0][1]}`
    for (let i = 1; i < pts.length - 1; i++) {
        const [px, py] = pts[i - 1]
        const [x, y] = pts[i]
        const [nx, ny] = pts[i + 1]
        const l1 = Math.hypot(x - px, y - py)
        const l2 = Math.hypot(nx - x, ny - y)
        const r = Math.min(6, l1 / 2, l2 / 2)
        d += ` L${x - ((x - px) / l1) * r},${y - ((y - py) / l1) * r} Q${x},${y} ${x + ((nx - x) / l2) * r},${y + ((ny - y) / l2) * r}`
    }
    const last = pts[pts.length - 1]
    return `${d} L${last[0]},${last[1]}`
}

/**
 * หาเส้นทางของทุกเส้น: กล่อง milestone และหัวกรอบแท็บเป็นสิ่งกีดขวาง, ในกรอบแท็บอื่นเสียต้นทุนสูงกว่า (ให้วิ่งตามช่องว่างระหว่างกรอบ),
 * เส้นที่หาไว้แล้วเสียต้นทุนเมื่อวิ่งซ้อนกัน และทุกเส้นออก/เข้ากล่องในแนวตั้งฉากกับขอบ
 */
export function routeEdges(geo: OverviewGeometry, requests: RouteRequest[]): Map<string, RoutedEdge> {
    const gw = Math.ceil(geo.width / G)
    const gh = Math.ceil(geo.height / G)
    const blocked = new Uint8Array(gw * gh)
    const frameAt = new Int16Array(gw * gh)
    const frameNames = Object.keys(geo.frames)

    const cellRange = (r: Rect, grow: number) => ({
        // เผื่อ 0.01px ให้เซลล์ที่กึ่งกลางอยู่บนขอบพอดีไม่ถูกนับว่าชน (เซลล์ช่องออก/เข้ากล่องอยู่ที่ระยะ MARGIN พอดี)
        x0: Math.max(0, Math.ceil((r.x - grow + 0.01) / G - 0.5)),
        x1: Math.min(gw - 1, Math.floor((r.x + r.w + grow - 0.01) / G - 0.5)),
        y0: Math.max(0, Math.ceil((r.y - grow + 0.01) / G - 0.5)),
        y1: Math.min(gh - 1, Math.floor((r.y + r.h + grow - 0.01) / G - 0.5)),
    })
    frameNames.forEach((name, idx) => {
        const f = geo.frames[name]
        const body = cellRange({ x: f.x, y: f.y + HEAD_H, w: f.w, h: f.h - HEAD_H }, 0)
        for (let y = body.y0; y <= body.y1; y++) for (let x = body.x0; x <= body.x1; x++) frameAt[y * gw + x] = idx + 1
        const head = cellRange({ x: f.x, y: f.y, w: f.w, h: HEAD_H }, 3)
        for (let y = head.y0; y <= head.y1; y++) for (let x = head.x0; x <= head.x1; x++) blocked[y * gw + x] = 1
    })
    Object.values(geo.steps).forEach((s) => {
        const r = cellRange(s, MARGIN)
        for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) blocked[y * gw + x] = 1
    })

    const usedH = new Uint8Array(gw * gh)
    const usedV = new Uint8Array(gw * gh)
    const gScore = new Float32Array(gw * gh * 4)
    const prev = new Int32Array(gw * gh * 4)
    const seen = new Int32Array(gw * gh * 4)
    let search = 0

    const portsOf = (b: Rect): Port[] => {
        const ports: Port[] = []
        const cxLo = Math.ceil((b.x + 8) / G - 0.5)
        const cxHi = Math.floor((b.x + b.w - 8) / G - 0.5)
        const cyLo = Math.ceil((b.y + 8) / G - 0.5)
        const cyHi = Math.floor((b.y + b.h - 8) / G - 0.5)
        const topCy = Math.floor((b.y - MARGIN) / G - 0.5)
        const botCy = Math.ceil((b.y + b.h + MARGIN) / G - 0.5)
        const leftCx = Math.floor((b.x - MARGIN) / G - 0.5)
        const rightCx = Math.ceil((b.x + b.w + MARGIN) / G - 0.5)
        const add = (cx: number, cy: number, out: number, pt: [number, number]) => {
            if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) return
            const cell = cy * gw + cx
            if (!blocked[cell]) ports.push({ cell, out, pt })
        }
        for (let cx = cxLo; cx <= cxHi; cx++) {
            const px = (cx + 0.5) * G
            add(cx, topCy, 0, [px, b.y])
            add(cx, botCy, 2, [px, b.y + b.h])
        }
        for (let cy = cyLo; cy <= cyHi; cy++) {
            const py = (cy + 0.5) * G
            add(rightCx, cy, 1, [b.x + b.w, py])
            add(leftCx, cy, 3, [b.x, py])
        }
        return ports
    }

    const result = new Map<string, RoutedEdge>()
    const dist = (r: StepBox, o: StepBox) => Math.abs(r.x - o.x) + Math.abs(r.y - o.y)
    // ข้ามคำขอที่หากล่องต้นทาง/ปลายทางไม่เจอก่อน เพื่อให้ตัวเปรียบเทียบด้านล่างไม่ต้องอ่านค่า undefined
    const ordered = requests
        .filter((r) => geo.steps[r.from] && geo.steps[r.to])
        .sort((a, b) => Number(b.intra) - Number(a.intra) || dist(geo.steps[a.from], geo.steps[a.to]) - dist(geo.steps[b.from], geo.steps[b.to]))

    for (const req of ordered) {
        const a = geo.steps[req.from]
        const b = geo.steps[req.to]
        const own = [frameNames.indexOf(a.tab) + 1, frameNames.indexOf(b.tab) + 1]
        const starts = portsOf(a)
        const goals = new Map<number, Port>()
        portsOf(b).forEach((p) => goals.set(p.cell * 4 + ((p.out + 2) & 3), p))
        const tx0 = b.x + b.w / 2
        const ty0 = b.y + b.h / 2
        const heuristic = (cell: number) => {
            const x = ((cell % gw) + 0.5) * G
            const y = (Math.floor(cell / gw) + 0.5) * G
            return (Math.max(0, Math.abs(x - tx0) - b.w / 2) + Math.max(0, Math.abs(y - ty0) - b.h / 2)) / G
        }

        search++
        const open = new MinHeap()
        const startPort = new Map<number, Port>()
        for (const p of starts) {
            const s = p.cell * 4 + p.out
            gScore[s] = 0
            seen[s] = search
            prev[s] = -1
            startPort.set(s, p)
            open.push(heuristic(p.cell), s)
        }
        let found = -1
        let expanded = 0
        while (open.size && expanded < 600000) {
            const [f, s] = open.pop()
            const cell = s >> 2
            const dir = s & 3
            if (f - heuristic(cell) > gScore[s] + 1e-3) continue
            expanded++
            if (goals.has(s)) {
                found = s
                break
            }
            const cx = cell % gw
            const cy = (cell - cx) / gw
            for (const turn of [0, 1, 3]) {
                const nd = (dir + turn) & 3
                const nx = cx + DX[nd]
                const ny = cy + DY[nd]
                if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
                const nc = ny * gw + nx
                if (blocked[nc]) continue
                const fa = frameAt[nc]
                let cost = gScore[s] + 1
                if (fa && fa !== own[0] && fa !== own[1]) cost += FOREIGN_FRAME_COST
                if (turn) cost += BEND_COST
                if (nd & 1 ? usedH[nc] : usedV[nc]) cost += SHARED_COST
                const ns = nc * 4 + nd
                if (seen[ns] === search && gScore[ns] <= cost) continue
                seen[ns] = search
                gScore[ns] = cost
                prev[ns] = s
                open.push(cost + heuristic(nc), ns)
            }
        }

        let pts: [number, number][]
        if (found < 0) {
            pts = [[a.x + a.w / 2, a.y + a.h / 2], [b.x + b.w / 2, b.y + b.h / 2]]
        } else {
            const cells: number[] = []
            let cur = found
            let origin = found
            while (cur >= 0) {
                cells.push(cur >> 2)
                origin = cur
                cur = prev[cur]
            }
            cells.reverse()
            const sp = startPort.get(origin) as Port
            const gp = goals.get(found) as Port
            const centers = cells.map((c) => [((c % gw) + 0.5) * G, (Math.floor(c / gw) + 0.5) * G] as [number, number])
            const raw: [number, number][] = [sp.pt, ...centers, gp.pt]
            pts = raw.filter((p, i) => {
                if (i === 0 || i === raw.length - 1) return true
                const q = raw[i - 1]
                const n = raw[i + 1]
                return !((q[0] === p[0] && p[0] === n[0]) || (q[1] === p[1] && p[1] === n[1]))
            })
            for (let i = 1; i < cells.length; i++) {
                const horizontal = Math.abs(cells[i] - cells[i - 1]) === 1
                ;(horizontal ? usedH : usedV)[cells[i]] = 1
                ;(horizontal ? usedH : usedV)[cells[i - 1]] = 1
            }
        }
        result.set(req.id, {
            d: roundedPath(pts),
            mid: pointAt(pts, polylineLength(pts) / 2),
            back: pts[pts.length - 1][1] < pts[0][1] - 5,
            points: pts,
        })
    }
    return result
}

let geoCache: OverviewGeometry | null = null
let routeCache: Map<string, RoutedEdge> | null = null

export const crossId = (key: string) => `x:${key}`
export const stepEdgeId = (tab: string, from: string, to: string) => `i:${tab}:${from}>${to}`

/** ตำแหน่งกรอบแท็บและกล่อง milestone (คำนวณครั้งเดียว) */
export function overviewGeometry(): OverviewGeometry {
    if (!geoCache) geoCache = buildGeometry()
    return geoCache
}

/** เส้นทางของทุกเส้น (คำนวณครั้งแรกที่วาดผัง ไม่คำนวณตอน import) */
export function overviewRoutes(): Map<string, RoutedEdge> {
    if (!routeCache) {
        const requests: RouteRequest[] = []
        Object.entries(OVERVIEW_DETAIL.tabs).forEach(([tab, d]) => {
            d.edges.forEach((e) => requests.push({ id: stepEdgeId(tab, e.from, e.to), from: stepKey(tab, e.from), to: stepKey(tab, e.to), intra: true }))
        })
        Object.entries(OVERVIEW_DETAIL.cross).forEach(([key, c]) => {
            const [a, b] = key.split('>')
            requests.push({ id: crossId(key), from: stepKey(a, c.from), to: stepKey(b, c.to), intra: false })
        })
        routeCache = routeEdges(overviewGeometry(), requests)
    }
    return routeCache
}
