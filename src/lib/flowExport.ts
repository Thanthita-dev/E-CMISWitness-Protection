import { FLOW_GUIDE, FlowGuideStep, FlowGuideTab, StepStatus, tabShortTitle } from './flowGuide'
import { FORMS_CATALOG, ROLE_NAMES } from './constants'
import { OVERVIEW_EDGES, TAB_SUMMARY, tabRoles } from '../components/flow-guide/FlowOverviewChart'
import { OVERVIEW_DETAIL } from '../components/flow-guide/overviewLayout'
import { TAB_DIAGRAMS, TabDiagram } from '../components/flow-guide/TabStepDiagram'
import type { UserRole } from '../types/user'

/**
 * ส่งออกข้อมูลหน้า /flow-guide และ /flow-chart เป็นไฟล์ JSON / Markdown ให้ดาวน์โหลด
 * ไฟล์คู่มือใช้ข้อมูลชุดเดียวกับ docs/flow-guide.md (src/flow-guide/flow-map.json)
 * ไฟล์ผังตัดพิกัดสำหรับวาดออก เหลือเฉพาะกล่อง เส้น และเงื่อนไขของ flow
 */

export type ExportFormat = 'json' | 'md'

const STATUS: Record<StepStatus, string> = { yes: '✅ ทำได้ใน UI', partial: '🟡 บางส่วน', no: '❌ ยังไม่มี', system: '⚙️ ระบบ/นอกระบบ' }

// เซลล์ตาราง markdown ห้ามมี | และขึ้นบรรทัดใหม่
const cell = (v: unknown) => (v == null || v === '' ? '—' : String(v).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' '))
const roleLabel = (role: UserRole | null | undefined) => (role ? ROLE_NAMES[role] ?? role : null)
const stepRole = (s: FlowGuideStep) => [roleLabel(s.role), s.role_note].filter(Boolean).join(' — ')
const anchor = (tab: string) => `tab-${tab.toLowerCase()}`
const count = (steps: FlowGuideStep[], k: StepStatus) => steps.filter((s) => s.implemented === k).length
const formsLabel = (forms: number[] | undefined) =>
    forms?.length ? forms.map((n) => `คบ.${n} ${FORMS_CATALOG.find((f) => f.n === n)?.t ?? ''}`.trim()).join(', ') : null
const today = () => new Date().toISOString().slice(0, 10)

// ---------- คู่มือเดิน Flow ----------

export const flowGuideJson = () => FLOW_GUIDE

export function flowGuideMarkdown(): string {
    const data = FLOW_GUIDE
    const all = data.tabs.flatMap((t) => t.steps)
    const out: string[] = []
    out.push('# คู่มือเดิน Flow: Activity 6 คุ้มครองพยาน', '')
    out.push(`> ดาวน์โหลดจากหน้า \`/flow-guide\` เมื่อ ${today()} · ผังต้นทาง: \`${data.source}\` · ข้อมูล ณ ${data.generatedAt}`, '')
    out.push(
        `**ทั้งหมด ${all.length} ขั้น** · ${STATUS.yes} ${count(all, 'yes')} · ${STATUS.partial} ${count(all, 'partial')} · ${STATUS.system} ${count(all, 'system')} · ${STATUS.no} ${count(all, 'no')}`,
        ''
    )
    out.push('## เส้นทางแนะนำ (เล่นตั้งแต่ต้นจนจบ)', '')
    for (const sc of data.scenarios) {
        out.push(`### ${sc.title}`, '', sc.summary, '')
        out.push(`แท็บที่ผ่าน: ${sc.tabs.map((t) => `[${t}](#${anchor(t)})`).join(' → ')}`, '')
        sc.checkpoints.forEach((cp, i) => out.push(`${i + 1}. **${cp.mock_state}**: ${cp.label}${cp.role ? ` (สลับเป็น ${roleLabel(cp.role)})` : ''}`))
        out.push('')
    }

    out.push('## สารบัญแท็บ', '')
    out.push('| แท็บ | ชื่อ | ขั้น | ทำได้ | บางส่วน | ระบบ | ยังไม่มี | เริ่มจาก |', '|---|---|---|---|---|---|---|---|')
    for (const t of data.tabs) {
        out.push(
            `| [${t.tab}](#${anchor(t.tab)}) | ${cell(tabShortTitle(t))} | ${t.steps.length} | ${count(t.steps, 'yes')} | ${count(t.steps, 'partial')} | ${count(t.steps, 'system')} | ${count(t.steps, 'no')} | ${cell(t.entry_mock_state)} |`
        )
    }
    out.push('')

    let phase: string | null = null
    for (const t of data.tabs) {
        if (t.phase !== phase) {
            phase = t.phase
            out.push(`## ${phase}`, '')
        }
        out.push(`<a id="${anchor(t.tab)}"></a>`, '', `### ${t.title}`, '', t.path_summary, '')
        out.push(`**เริ่มแท็บนี้:** ${t.entry}`, '', `**Swimlane ในผัง:** ${t.lanes.join(' · ')}`, '')
        if (t.gaps.length) {
            out.push('**จุดที่ prototype ยังต่างจากผัง**', '')
            t.gaps.forEach((g) => out.push(`- ${g}`))
            out.push('')
        }
        out.push('| ขั้น | ในผัง | สถานะ | บทบาท | หน้า | วิธีกด | Mock State |', '|---|---|---|---|---|---|---|')
        for (const s of t.steps) {
            const how = [s.how_to, s.note ? `⚠️ ${s.note}` : null].filter(Boolean).join(' ')
            out.push(
                `| **${s.code}**${s.decision ? ' ◇' : ''} | ${cell(s.text)} | ${STATUS[s.implemented]} | ${cell(stepRole(s))} | ${s.route ? `\`${cell(s.route)}\`` : '—'} | ${cell(how)} | ${cell(s.mock_state)} |`
            )
        }
        out.push('')
    }
    out.push('◇ = จุดตัดสินใจในผัง', '')
    return out.join('\n')
}

// ---------- ผังภาพรวม ----------

/** swimlane ที่กึ่งกลางกล่องตกอยู่ (lane ในผังเรียงบนลงล่าง) */
function laneOf(diagram: TabDiagram, n: { y: number; h: number }): string | null {
    const cy = n.y + n.h / 2
    return diagram.lanes.find((l) => cy >= l.y && cy < l.y + l.h)?.label ?? null
}

function tabDiagramFlow(t: FlowGuideTab) {
    const diagram = TAB_DIAGRAMS[t.tab]
    if (!diagram) return { lanes: [], nodes: [], edges: [] }
    return {
        lanes: diagram.lanes.map((l) => l.label),
        nodes: diagram.nodes.map((n) => ({ id: n.id, code: n.code, kind: n.kind, lane: laneOf(diagram, n), text: n.text })),
        edges: diagram.edges.map((e) => ({ id: e.id, from: e.source, to: e.target, label: e.label, dashed: e.dashed })),
    }
}

export function flowChartJson() {
    return {
        title: 'ผังภาพรวม Activity 6',
        source: FLOW_GUIDE.source,
        generatedAt: FLOW_GUIDE.generatedAt,
        exportedAt: today(),
        /** เส้นส่งต่อระหว่างแท็บในผังภาพรวม */
        crossTabEdges: OVERVIEW_EDGES.map(({ from, to, label, wit, actor, desc, forms, mockState, mockRole }) => ({
            from,
            to,
            label: label ?? null,
            wit: wit ?? null,
            actor,
            desc,
            forms: forms ?? [],
            mockState: mockState ?? null,
            mockRole: mockRole ?? null,
        })),
        tabs: FLOW_GUIDE.tabs.map((t) => {
            const detail = OVERVIEW_DETAIL.tabs[t.tab]
            return {
                tab: t.tab,
                title: t.title,
                phase: t.phase,
                summary: TAB_SUMMARY[t.tab] ?? t.path_summary,
                roles: tabRoles(t),
                status: { yes: count(t.steps, 'yes'), partial: count(t.steps, 'partial'), system: count(t.steps, 'system'), no: count(t.steps, 'no') },
                /** ขั้นสำคัญที่แสดงในกรอบแท็บของผังภาพรวม */
                milestones: detail?.steps.map((s) => ({ code: s.code, label: s.label })) ?? [],
                milestoneEdges: detail?.edges.map((e) => ({ from: e.from, to: e.to, label: e.label ?? null })) ?? [],
                /** ผังรายขั้น (ทุกกล่อง WIT และเส้นในแท็บ) */
                diagram: tabDiagramFlow(t),
            }
        }),
    }
}

export function flowChartMarkdown(): string {
    const data = flowChartJson()
    const out: string[] = []
    out.push(`# ${data.title}`, '')
    out.push(`> ดาวน์โหลดจากหน้า \`/flow-chart\` เมื่อ ${data.exportedAt} · ผังต้นทาง: \`${data.source}\` · ข้อมูล ณ ${data.generatedAt}`, '')

    out.push('## สารบัญแท็บ', '')
    out.push('| แท็บ | ชื่อ | ช่วง | บทบาท | ขั้น |', '|---|---|---|---|---|')
    FLOW_GUIDE.tabs.forEach((t) =>
        out.push(`| [${t.tab}](#${anchor(t.tab)}) | ${cell(tabShortTitle(t))} | ${cell(t.phase)} | ${cell(tabRoles(t).map(roleLabel).join(', '))} | ${t.steps.length} |`)
    )
    out.push('')

    out.push('## เส้นส่งต่อระหว่างแท็บ', '')
    out.push('| จาก | ไป | เงื่อนไข | WIT ต้นทาง | ผู้ทำ | เกิดอะไรขึ้น | แบบ คบ. | Mock State |', '|---|---|---|---|---|---|---|---|')
    for (const e of data.crossTabEdges) {
        const mock = e.mockState ? `${e.mockState}${e.mockRole ? ` (${roleLabel(e.mockRole)})` : ''}` : null
        out.push(
            `| [${e.from}](#${anchor(e.from)}) | [${e.to}](#${anchor(e.to)}) | ${cell(e.label)} | ${cell(e.wit)} | ${cell(e.actor)} | ${cell(e.desc)} | ${cell(formsLabel(e.forms))} | ${cell(mock)} |`
        )
    }
    out.push('')

    out.push('## รายแท็บ', '')
    for (const t of data.tabs) {
        const nodeName = new Map(t.diagram.nodes.map((n) => [n.id, n.code ? `${n.code} ${n.text}`.trim() : n.text || (n.id === 'start' ? 'จุดเริ่มต้น' : n.id)]))
        const end = (id: string | null) => (id ? nodeName.get(id) ?? id : '—')
        const outgoing = data.crossTabEdges.filter((e) => e.from === t.tab)
        const incoming = data.crossTabEdges.filter((e) => e.to === t.tab)

        out.push(`<a id="${anchor(t.tab)}"></a>`, '', `### ${t.title}`, '', t.summary, '')
        out.push(`**ช่วง:** ${t.phase} · **บทบาท:** ${t.roles.map(roleLabel).join(', ') || '—'}`, '')
        out.push(
            `**สถานะขั้น:** ${STATUS.yes} ${t.status.yes} · ${STATUS.partial} ${t.status.partial} · ${STATUS.system} ${t.status.system} · ${STATUS.no} ${t.status.no}`,
            ''
        )
        if (incoming.length) out.push(`**รับจากแท็บ:** ${incoming.map((e) => `${e.from}${e.label ? ` (${e.label})` : ''}`).join(', ')}`, '')
        if (outgoing.length) out.push(`**ส่งต่อไปแท็บ:** ${outgoing.map((e) => `${e.to}${e.label ? ` (${e.label})` : ''}`).join(', ')}`, '')

        if (t.milestones.length) {
            out.push('#### ขั้นสำคัญในผังภาพรวม', '')
            t.milestones.forEach((m) => out.push(`- **${m.code}** ${m.label}`))
            out.push('')
            if (t.milestoneEdges.length) {
                out.push('| จาก | ไป | เงื่อนไข |', '|---|---|---|')
                t.milestoneEdges.forEach((e) => out.push(`| ${e.from} | ${e.to} | ${cell(e.label)} |`))
                out.push('')
            }
        }

        if (t.diagram.nodes.length) {
            out.push('#### ผังรายขั้น: กล่อง', '')
            out.push('| กล่อง | ประเภท | Swimlane | ข้อความ |', '|---|---|---|---|')
            t.diagram.nodes
                .filter((n) => n.kind !== 'terminal' || n.text)
                .forEach((n) => out.push(`| ${n.code ? `**${n.code}**` : cell(n.id)} | ${n.kind} | ${cell(n.lane)} | ${cell(n.text)} |`))
            out.push('')
            out.push('#### ผังรายขั้น: เส้น', '')
            out.push('| เส้น | จาก | ไป | เงื่อนไข |', '|---|---|---|---|')
            t.diagram.edges.forEach((e) => out.push(`| ${cell(e.id)}${e.dashed ? ' ┄' : ''} | ${cell(end(e.from))} | ${cell(end(e.to))} | ${cell(e.label)} |`))
            out.push('')
        }
    }
    out.push('┄ = เส้นประในผัง', '')
    return out.join('\n')
}

// ---------- ดาวน์โหลด ----------

export function downloadText(content: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const EXPORTS = {
    'flow-guide': { json: flowGuideJson, md: flowGuideMarkdown },
    'flow-chart': { json: flowChartJson, md: flowChartMarkdown },
} as const

export type FlowExportKind = keyof typeof EXPORTS

export function downloadFlowExport(kind: FlowExportKind, format: ExportFormat) {
    const name = `${kind}-activity-6`
    if (format === 'json') downloadText(JSON.stringify(EXPORTS[kind].json(), null, 2), `${name}.json`, 'application/json')
    else downloadText(EXPORTS[kind].md(), `${name}.md`, 'text/markdown')
}
