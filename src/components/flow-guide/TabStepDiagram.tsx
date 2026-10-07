import React, { useMemo } from 'react'
import diagramData from '../../flow-guide/flow-diagram.json'
import { cn } from '../../lib/utils'
import { FLOW_GUIDE, FlowGuideStep, StepStatus, formsInText, stepForms } from '../../lib/flowGuide'
import { FormChips, ROLE_SHORT, formsTitle } from './FlowOverviewChart'
import type { MinimapItem } from './ZoomViewport'

/**
 * ผังรายขั้น WIT ของหนึ่งแท็บ — ตำแหน่งกล่อง เส้น และ swimlane ยกจากผัง drawio ตรง ๆ
 * (src/flow-guide/flow-diagram.json สร้างด้วย docs/extract-flow-diagram.py)
 * แต่สีกล่องเปลี่ยนเป็นสถานะใน prototype และมีป้ายบทบาทที่ต้องใช้จริง
 */

type NodeKind = 'step' | 'decision' | 'terminal' | 'note' | 'box'

export interface DiagramNode {
    id: string
    code: string | null
    kind: NodeKind
    text: string
    x: number
    y: number
    w: number
    h: number
}

interface DiagramEdge {
    id: string
    source: string | null
    target: string | null
    label: string | null
    points: number[][]
    sourcePoint: number[] | null
    targetPoint: number[] | null
    exit: number[] | null
    entry: number[] | null
    dashed: boolean
}

interface DiagramLane {
    label: string
    x: number
    y: number
    w: number
    h: number
    fill: string | null
}

export interface TabDiagram {
    width: number
    height: number
    lanes: DiagramLane[]
    nodes: DiagramNode[]
    edges: DiagramEdge[]
}

export const TAB_DIAGRAMS = (diagramData as unknown as { tabs: Record<string, TabDiagram> }).tabs

const STEP_BY_CODE = new Map(FLOW_GUIDE.tabs.flatMap((t) => t.steps.map((s) => [s.code, s] as const)))
export const stepByCode = (code: string | null): FlowGuideStep | undefined => (code ? STEP_BY_CODE.get(code) : undefined)

/** แบบ คบ. ที่เกี่ยวข้องกับกล่อง — กล่องที่มีเลข WIT ใช้ข้อมูลขั้นใน flow-map ส่วนกล่องอื่นดูจากข้อความในผัง */
export const nodeForms = (n: DiagramNode): number[] => {
    const step = stepByCode(n.code)
    return step ? stepForms(step) : formsInText(n.text)
}

export const STEP_TONE: Record<StepStatus, { box: string; fill: string; stroke: string }> = {
    yes: { box: 'border-emerald-400 bg-emerald-50', fill: '#ecfdf5', stroke: '#34d399' },
    partial: { box: 'border-amber-400 bg-amber-50', fill: '#fffbeb', stroke: '#fbbf24' },
    system: { box: 'border-slate-300 bg-slate-50', fill: '#f8fafc', stroke: '#cbd5e1' },
    no: { box: 'border-rose-400 bg-rose-50', fill: '#fff1f2', stroke: '#fb7185' },
}

export function tabDiagramMinimap(diagram: TabDiagram): MinimapItem[] {
    return [
        ...diagram.lanes.map((l) => ({ x: l.x, y: l.y, w: diagram.width - l.x - 20, h: l.h, fill: laneTint(l.fill) })),
        ...diagram.nodes.map((n) => {
            const step = stepByCode(n.code)
            return { x: n.x, y: n.y, w: n.w, h: n.h, fill: step ? STEP_TONE[step.implemented].stroke : '#94a3b8' }
        }),
    ]
}

/** สีพื้น swimlane แบบจาง (ต้นฉบับใน drawio เข้มเกินเมื่อมีสีสถานะซ้อน) */
const laneTint = (fill: string | null) => (fill ? `${fill}66` : '#f1f5f9')

type Side = 'left' | 'right' | 'top' | 'bottom'
type Pt = [number, number]

const center = (n: DiagramNode): Pt => [n.x + n.w / 2, n.y + n.h / 2]

function sideOf(rel: number[]): Side {
    const [rx, ry] = rel
    if (rx <= 0) return 'left'
    if (rx >= 1) return 'right'
    return ry <= 0 ? 'top' : 'bottom'
}

/** จุดต่อบนขอบกล่อง: ใช้ exit/entry จาก drawio ถ้ามี ไม่เช่นนั้นหันเข้าหาจุดถัดไป (แบบ orthogonal ของ drawio) */
function attach(n: DiagramNode, rel: number[] | null, toward: Pt): { p: Pt; side: Side } {
    if (rel) return { p: [n.x + n.w * rel[0], n.y + n.h * rel[1]], side: sideOf(rel) }
    const [tx, ty] = toward
    if (tx >= n.x && tx <= n.x + n.w && (ty < n.y || ty > n.y + n.h)) {
        return ty < n.y ? { p: [tx, n.y], side: 'top' } : { p: [tx, n.y + n.h], side: 'bottom' }
    }
    if (ty >= n.y && ty <= n.y + n.h) {
        return tx < n.x ? { p: [n.x, ty], side: 'left' } : { p: [n.x + n.w, ty], side: 'right' }
    }
    const [cx, cy] = center(n)
    const dx = (tx - cx) / n.w
    const dy = (ty - cy) / n.h
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? { p: [n.x, cy], side: 'left' } : { p: [n.x + n.w, cy], side: 'right' }
    return dy < 0 ? { p: [cx, n.y], side: 'top' } : { p: [cx, n.y + n.h], side: 'bottom' }
}

const isH = (s: Side | null) => s === 'left' || s === 'right'
const isV = (s: Side | null) => s === 'top' || s === 'bottom'

/** ต่อจุดให้เป็นเส้นตั้ง/นอนเท่านั้น (orthogonal) โดยเคารพทิศออกจากต้นทางและทิศเข้าปลายทาง */
function orthogonal(a: Pt, b: Pt, out: Side | null, into: Side | null): Pt[] {
    if (a[0] === b[0] || a[1] === b[1]) return [b]
    if (isV(out) && isV(into)) {
        const my = (a[1] + b[1]) / 2
        return [[a[0], my], [b[0], my], b]
    }
    if (isH(out) && isH(into)) {
        const mx = (a[0] + b[0]) / 2
        return [[mx, a[1]], [mx, b[1]], b]
    }
    if (isV(out) || isH(into)) return [[a[0], b[1]], b]
    return [[b[0], a[1]], b]
}

function routeEdge(e: DiagramEdge, nodes: Map<string, DiagramNode>) {
    const src = e.source ? nodes.get(e.source) : undefined
    const tgt = e.target ? nodes.get(e.target) : undefined
    const waypoints = e.points.map((p) => [p[0], p[1]] as Pt)
    const firstToward: Pt = waypoints[0] ?? (tgt ? center(tgt) : (e.targetPoint as Pt))
    const lastFrom: Pt = waypoints[waypoints.length - 1] ?? (src ? center(src) : (e.sourcePoint as Pt))
    const start = src ? attach(src, e.exit, firstToward) : { p: (e.sourcePoint ?? firstToward) as Pt, side: null }
    const end = tgt ? attach(tgt, e.entry, lastFrom) : { p: (e.targetPoint ?? lastFrom) as Pt, side: null }

    const pts: Pt[] = [start.p]
    const stops = [...waypoints, end.p]
    stops.forEach((b, i) => {
        const a = pts[pts.length - 1]
        const out = i === 0 ? start.side : null
        const into = i === stops.length - 1 ? end.side : null
        pts.push(...orthogonal(a, b, out, into))
    })
    const clean = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1])
    return { d: `M${clean.map((p) => p.join(',')).join(' L')}`, mid: midpoint(clean) }
}

/** จุดกึ่งกลางตามความยาวเส้น — ใช้วางป้ายเส้น */
function midpoint(pts: Pt[]): Pt {
    const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]))
    let half = lens.reduce((a, b) => a + b, 0) / 2
    for (let i = 0; i < lens.length; i++) {
        if (half <= lens[i]) {
            const t = lens[i] ? half / lens[i] : 0
            return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]
        }
        half -= lens[i]
    }
    return pts[0]
}

interface TabStepDiagramProps {
    diagram: TabDiagram
    selected: string | null
    onSelect: (node: DiagramNode) => void
}

export const TabStepDiagram: React.FC<TabStepDiagramProps> = ({ diagram, selected, onSelect }) => {
    const nodeMap = useMemo(() => new Map(diagram.nodes.map((n) => [n.id, n])), [diagram])
    const routes = useMemo(() => diagram.edges.map((e) => ({ edge: e, ...routeEdge(e, nodeMap) })), [diagram, nodeMap])
    const linked = (e: DiagramEdge) => !!selected && (e.source === selected || e.target === selected)
    const laneRight = diagram.width - 20

    return (
        <div className="relative bg-white" style={{ width: diagram.width, height: diagram.height }}>
            <svg className="absolute inset-0" width={diagram.width} height={diagram.height} aria-hidden="true">
                <defs>
                    <marker id="td-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M0,0 L10,5 L0,10 z" fill="#64748b" />
                    </marker>
                    <marker id="td-arrow-hl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M0,0 L10,5 L0,10 z" fill="#16558f" />
                    </marker>
                </defs>
                {diagram.lanes.map((l) => (
                    <g key={l.label + l.y}>
                        <rect x={l.x} y={l.y} width={laneRight - l.x} height={l.h} fill={laneTint(l.fill)} fillOpacity={0.35} stroke="#e2e8f0" />
                        <rect x={l.x} y={l.y} width={l.w} height={l.h} fill={laneTint(l.fill)} stroke="#e2e8f0" />
                    </g>
                ))}
                {routes.map(({ edge, d }) => {
                    const hl = linked(edge)
                    return (
                        <path
                            key={edge.id}
                            d={d}
                            fill="none"
                            stroke={hl ? '#16558f' : '#64748b'}
                            strokeWidth={hl ? 2.5 : 1.5}
                            strokeDasharray={edge.dashed ? '6 4' : undefined}
                            strokeLinejoin="round"
                            opacity={selected && !hl ? 0.35 : 1}
                            markerEnd={edge.target || edge.targetPoint ? (hl ? 'url(#td-arrow-hl)' : 'url(#td-arrow)') : undefined}
                        />
                    )
                })}
            </svg>

            {diagram.lanes.map((l) => (
                <div
                    key={`label-${l.label}-${l.y}`}
                    className="absolute flex items-center justify-center px-1 text-center text-[11px] font-bold leading-tight text-navy-deep"
                    style={{ left: l.x, top: l.y, width: l.w, height: l.h, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                    {l.label}
                </div>
            ))}

            {routes
                .filter(({ edge }) => edge.label)
                .map(({ edge, mid }) => (
                    <span
                        key={`elabel-${edge.id}`}
                        className={cn(
                            'pointer-events-none absolute z-10 max-w-[140px] -translate-x-1/2 -translate-y-1/2 rounded border px-1 text-center text-[10px] leading-tight',
                            linked(edge) ? 'border-blue bg-blue text-white' : 'border-slate-200 bg-white text-slate-600',
                            selected && !linked(edge) && 'opacity-40'
                        )}
                        style={{ left: mid[0], top: mid[1] }}
                    >
                        {edge.label}
                    </span>
                ))}

            {diagram.nodes.map((n) => (
                <DiagramNodeBox key={n.id} node={n} selected={selected === n.id} dim={!!selected && selected !== n.id} onSelect={onSelect} />
            ))}
        </div>
    )
}

const DiagramNodeBox: React.FC<{ node: DiagramNode; selected: boolean; dim: boolean; onSelect: (n: DiagramNode) => void }> = ({
    node: n,
    selected,
    dim,
    onSelect,
}) => {
    const step = stepByCode(n.code)
    const tone = step ? STEP_TONE[step.implemented] : null
    const role = step?.role ? ROLE_SHORT[step.role] : null
    const style = { left: n.x, top: n.y, width: n.w, height: n.h }
    const common = cn('absolute z-20 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue', dim && 'opacity-60')

    // จุดเริ่ม (วงกลมไม่มีข้อความ)
    if (n.kind === 'terminal' && !n.text) {
        return <span className={cn(common, 'rounded-full bg-navy-deep')} style={style} aria-hidden="true" />
    }

    if (n.kind === 'note') {
        return (
            <button
                type="button"
                onClick={() => onSelect(n)}
                className={cn(common, 'overflow-hidden rounded-sm border border-amber-200 bg-amber-50 p-1.5 text-[10px] leading-snug text-amber-900 shadow-sm', selected && 'ring-2 ring-blue')}
                style={style}
            >
                {n.text}
            </button>
        )
    }

    const label = (
        <>
            {n.code && <span className="block font-mono text-[10px] font-bold text-navy-deep">{n.code}</span>}
            <span className="block text-[10.5px] leading-tight text-slate-700">{n.text}</span>
        </>
    )
    const forms = nodeForms(n)
    const title = forms.length ? `${n.text}\n\n${formsTitle(forms)}` : n.text
    // ป้าย คบ. เกาะขอบล่าง (ข้าวหลามตัดวางกึ่งกลางเพราะมุมล่างซ้ายเป็นที่ว่าง)
    const formChips = forms.length > 0 && (
        <FormChips
            forms={forms}
            className={cn('absolute -bottom-2 z-10 flex-nowrap drop-shadow-sm', n.kind === 'decision' ? 'left-1/2 -translate-x-1/2' : 'left-1')}
        />
    )
    const roleChip = role && (
        <span className="absolute -top-2 right-1 z-10 whitespace-nowrap rounded-full bg-blue px-1.5 text-[9px] font-semibold leading-4 text-white shadow">
            {role}
        </span>
    )

    if (n.kind === 'decision') {
        return (
            <button type="button" onClick={() => onSelect(n)} className={common} style={style} title={title}>
                <svg className="absolute inset-0 overflow-visible" width={n.w} height={n.h} aria-hidden="true">
                    <polygon
                        points={`${n.w / 2},0 ${n.w},${n.h / 2} ${n.w / 2},${n.h} 0,${n.h / 2}`}
                        fill={tone?.fill ?? '#fff'}
                        stroke={selected ? '#16558f' : tone?.stroke ?? '#94a3b8'}
                        strokeWidth={selected ? 3 : 2}
                    />
                </svg>
                <span className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden px-[18%] py-[14%] text-center">{label}</span>
                {roleChip}
                {formChips}
            </button>
        )
    }

    return (
        <button
            type="button"
            onClick={() => onSelect(n)}
            title={title}
            className={cn(
                common,
                'flex flex-col justify-center border-2 px-2 py-1 shadow-sm hover:shadow-md',
                n.kind === 'terminal' ? 'items-center rounded-full text-center' : 'rounded-lg',
                tone?.box ?? 'border-slate-300 bg-white',
                selected && 'ring-2 ring-blue ring-offset-1'
            )}
            style={style}
        >
            <span className="overflow-hidden">{label}</span>
            {roleChip}
            {formChips}
        </button>
    )
}
