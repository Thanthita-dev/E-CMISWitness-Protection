import React, { useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { BackLink } from '../components/common/BackLink'
import { PageHeader } from '../components/common/PageHeader'
import {
    FlowOverviewCanvas,
    OVERVIEW_H,
    OVERVIEW_W,
    STATUS_BAR,
    STATUS_ORDER,
    OVERVIEW_EDGES,
    OverviewEdge,
    ROLE_SHORT,
    StatusBar,
    TAB_SUMMARY,
    edgeByKey,
    edgeKey,
    formMeta,
    overviewMinimap,
    tabRoles,
    tabStatusCount,
} from '../components/flow-guide/FlowOverviewChart'
import { DiagramNode, TAB_DIAGRAMS, TabStepDiagram, nodeForms, stepByCode, tabDiagramMinimap } from '../components/flow-guide/TabStepDiagram'
import { ZoomViewport } from '../components/flow-guide/ZoomViewport'
import { PlayButton, StatusBadge, roleName } from '../components/flow-guide/playback'
import { FLOW_GUIDE, FlowGuideTab, hasMockState, tabForms, tabShortTitle } from '../lib/flowGuide'
import { cn } from '../lib/utils'

interface FlowChartSearch {
    /** แท็บที่กางดูขั้น WIT — ไม่ระบุ = ผังภาพรวม */
    tab?: string
    /** กล่องที่เลือกในผังรายขั้น (id ในผัง drawio) */
    node?: string
    /** เส้นที่เลือกในผังภาพรวม ("ต้นทาง>ปลายทาง") */
    edge?: string
    /** กล่องแท็บที่เลือกในผังภาพรวม (เปิดแผงคำอธิบาย ยังไม่กางผังรายขั้น) */
    box?: string
}

export const Route = createFileRoute('/flow-chart')({
    validateSearch: (search: Record<string, unknown>): FlowChartSearch => ({
        tab: typeof search.tab === 'string' ? search.tab : undefined,
        node: typeof search.node === 'string' ? search.node : undefined,
        edge: typeof search.edge === 'string' ? search.edge : undefined,
        box: typeof search.box === 'string' ? search.box : undefined,
    }),
    component: FlowChartPage,
})

const TAB_IDS = FLOW_GUIDE.tabs.map((t) => t.tab)

/** หาเลขแท็บที่ข้อความในกล่องชี้ไป เช่น "ไปแท็บ 05", "ไปหน้า 08A-1" ("แท็บ 08" = 08A) */
function referencedTabs(text: string, current: string): string[] {
    const found = [...text.matchAll(/(?:แท็บ|หน้า)\s*(\d{2}[A-Z]?(?:-\d)?)/g)].map((m) => (TAB_IDS.includes(m[1]) ? m[1] : `${m[1]}A`))
    return [...new Set(found)].filter((t) => TAB_IDS.includes(t) && t !== current)
}

function FlowChartPage() {
    const { tab, node, edge, box } = Route.useSearch()
    const navigate = Route.useNavigate()
    const tabInfo = FLOW_GUIDE.tabs.find((t) => t.tab === tab) ?? null
    const diagram = tabInfo ? TAB_DIAGRAMS[tabInfo.tab] : null
    const selectedNode = diagram?.nodes.find((n) => n.id === node) ?? null
    const selectedEdge = tabInfo ? null : edgeByKey(edge)
    const selectedBox = tabInfo || selectedEdge ? null : FLOW_GUIDE.tabs.find((t) => t.tab === box) ?? null

    // การเลือกกล่อง/เส้นแทนที่ประวัติเดิม ส่วนการกางผังรายขั้นเป็นหน้าใหม่ (กดย้อนกลับได้)
    const selecting = (x: FlowChartSearch) => !!x.node || !!x.edge || !!x.box
    const go = (search: FlowChartSearch) => navigate({ search, replace: selecting(search) || (!search.tab && (!!node || !!edge || !!box)) })
    const index = tabInfo ? TAB_IDS.indexOf(tabInfo.tab) : -1

    const minimap = useMemo(() => (diagram ? tabDiagramMinimap(diagram) : overviewMinimap()), [diagram])

    const toolbarLeft = (
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-white/95 p-1 text-[0.88rem] shadow-card">
            <button
                type="button"
                onClick={() => go({})}
                className={cn('min-h-[38px] rounded-lg px-2.5 py-1 font-semibold', tabInfo ? 'text-blue hover:bg-blue-soft' : 'bg-navy text-white')}
            >
                <i className="fa-solid fa-diagram-project mr-1.5" />
                ภาพรวม
            </button>
            {tabInfo && (
                <>
                    <i className="fa-solid fa-chevron-right text-[0.8rem] text-muted" />
                    <span className="px-1 font-semibold text-navy">
                        <span className="font-mono">{tabInfo.tab}</span> {tabShortTitle(tabInfo)}
                    </span>
                    <span className="mx-0.5 h-5 w-px bg-line" />
                    <button
                        type="button"
                        disabled={index <= 0}
                        onClick={() => go({ tab: TAB_IDS[index - 1] })}
                        title="แท็บก่อนหน้า"
                        className="h-[38px] w-[38px] rounded-lg text-ink hover:bg-soft disabled:opacity-30"
                    >
                        <i className="fa-solid fa-arrow-left" />
                    </button>
                    <button
                        type="button"
                        disabled={index >= TAB_IDS.length - 1}
                        onClick={() => go({ tab: TAB_IDS[index + 1] })}
                        title="แท็บถัดไป"
                        className="h-[38px] w-[38px] rounded-lg text-ink hover:bg-soft disabled:opacity-30"
                    >
                        <i className="fa-solid fa-arrow-right" />
                    </button>
                    <Link
                        to="/flow-guide"
                        search={{ tab: tabInfo.tab }}
                        className="inline-flex min-h-[38px] items-center rounded-lg px-2 py-1 text-blue hover:bg-blue-soft"
                    >
                        <i className="fa-solid fa-route mr-1" />
                        เปิดในคู่มือ
                    </Link>
                </>
            )}
        </div>
    )

    return (
        <div>
            <BackLink to="/flow-guide">กลับคู่มือเดิน Flow</BackLink>
            <PageHeader
                eyebrow="คู่มือ · ผังภาพรวม"
                title="ผังภาพรวม Activity 6"
                description={
                    <>
                        กดกล่องแท็บหรือเส้นเพื่อดูคำอธิบาย แล้วกด "เปิดผังรายขั้น" เพื่อกางขั้น WIT ตามผัง drawio · กดขั้น WIT เพื่อดูวิธีเล่นใน prototype · ลากเพื่อเลื่อน, Ctrl/⌘ + ล้อเมาส์เพื่อซูม
                    </>
                }
                actions={
                    <>
                        <Link
                            to="/flow-guide"
                            className="inline-flex min-h-[44px] items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition hover:bg-slate-50"
                        >
                            <i className="fa-solid fa-route" />
                            คู่มือเดิน Flow
                        </Link>
                        <Link
                            to="/mock-state"
                            className="inline-flex min-h-[44px] items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition hover:bg-slate-50"
                        >
                            <i className="fa-solid fa-database" />
                            Mock State ทั้งหมด
                        </Link>
                    </>
                }
            />

            <ZoomViewport
                contentWidth={diagram?.width ?? OVERVIEW_W}
                contentHeight={diagram?.height ?? OVERVIEW_H}
                resetKey={tabInfo?.tab ?? 'overview'}
                minimap={minimap}
                toolbarLeft={toolbarLeft}
                legend={<Legend detail={!!diagram} />}
                panel={
                    selectedNode && tabInfo ? (
                        <NodePanel
                            node={selectedNode}
                            tab={tabInfo.tab}
                            onClose={() => go({ tab: tabInfo.tab })}
                            onOpenTab={(t) => go({ tab: t })}
                        />
                    ) : selectedEdge ? (
                        <EdgePanel edge={selectedEdge} onClose={() => go({})} onOpen={go} />
                    ) : selectedBox ? (
                        <TabPanel tab={selectedBox} onClose={() => go({})} onOpen={go} />
                    ) : undefined
                }
            >
                {diagram && tabInfo ? (
                    <TabStepDiagram
                        diagram={diagram}
                        selected={selectedNode?.id ?? null}
                        onSelect={(n) => go({ tab: tabInfo.tab, node: n.id === node ? undefined : n.id })}
                    />
                ) : (
                    <FlowOverviewCanvas
                        onPick={(t) => go({ box: t === box ? undefined : t })}
                        selectedTab={selectedBox?.tab ?? null}
                        selectedEdge={selectedEdge ? edgeKey(selectedEdge) : null}
                        onPickEdge={(e) => go({ edge: edgeKey(e) === edge ? undefined : edgeKey(e) })}
                    />
                )}
            </ZoomViewport>
        </div>
    )
}

const Legend: React.FC<{ detail: boolean }> = ({ detail }) => (
    <div className="space-y-1 text-[0.8rem] text-ink">
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {STATUS_ORDER.map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                    <span className={cn('h-2.5 w-2.5 rounded-sm', STATUS_BAR[s].className)} />
                    {STATUS_BAR[s].label}
                </li>
            ))}
        </ul>
        {detail ? (
            <p className="text-muted">
                ◇ จุดตัดสินใจ · ⬭ จุดรับ/ส่งต่อแท็บ · <span className="rounded-full bg-blue px-1.5 text-[0.74rem] text-white">ป้าย</span> = บทบาทใน
                prototype · <FormLegendChip /> = แบบ คบ. ที่เกี่ยวข้อง · แถบด้านซ้าย = swimlane ในผัง
            </p>
        ) : (
            <p className="text-muted">
                แถบสีใต้กล่อง = สัดส่วนสถานะของขั้นในแท็บ · <span className="rounded bg-blue-soft px-1.5 text-[0.74rem] text-blue">ป้าย</span> = บทบาทที่ต้องใช้ ·
                <FormLegendChip /> = แบบ คบ. ที่ใช้ในแท็บ · เส้นประ = ย้อนกลับ · ชี้/กดที่กล่อง เส้น หรือป้ายบนเส้นเพื่อดูคำอธิบาย
            </p>
        )}
    </div>
)

const FormLegendChip = () => (
    <span className="rounded border border-gold/60 bg-gold-soft px-1 font-mono text-[0.74rem] font-semibold text-warning">คบ.</span>
)

const NodePanel: React.FC<{ node: DiagramNode; tab: string; onClose: () => void; onOpenTab: (tab: string) => void }> = ({
    node,
    tab,
    onClose,
    onOpenTab,
}) => {
    const step = stepByCode(node.code)
    const jumps = referencedTabs(node.text, tab)
    const forms = node.kind === 'note' ? [] : nodeForms(node)

    return (
        <aside className="flex min-h-0 flex-col overflow-hidden ws-card">
            <header className="flex items-start gap-2 border-b border-line p-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {node.code && (
                            <span className="rounded-md bg-navy px-2 py-0.5 font-mono text-[0.8rem] font-bold text-white">{node.code}</span>
                        )}
                        {step && <StatusBadge status={step.implemented} />}
                        {node.kind === 'decision' && (
                            <span className="rounded-full border border-gold/40 bg-gold-soft px-[0.58rem] py-[0.28rem] text-[0.74rem] font-semibold text-warning">จุดตัดสินใจ</span>
                        )}
                    </div>
                    <p className="mt-1.5 text-[0.95rem] font-semibold leading-snug text-ink">{node.text}</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="ปิด"
                    className="h-[38px] w-[38px] shrink-0 rounded-lg text-muted hover:bg-soft hover:text-ink"
                >
                    <i className="fa-solid fa-xmark" />
                </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-[0.88rem]">
                {step ? (
                    <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                        <dt className="font-semibold text-muted">ในผัง</dt>
                        <dd className="text-ink">{step.lane}</dd>
                        {step.role && (
                            <>
                                <dt className="font-semibold text-muted">บทบาทใน prototype</dt>
                                <dd className="text-ink">
                                    <span className="font-semibold">{roleName(step.role)}</span>
                                    {step.role_note && <span className="block text-[0.8rem] text-muted">{step.role_note}</span>}
                                </dd>
                            </>
                        )}
                        {step.route && (
                            <>
                                <dt className="font-semibold text-muted">หน้า</dt>
                                <dd>
                                    <code className="break-all rounded bg-soft px-1 text-ink">{step.route}</code>
                                </dd>
                            </>
                        )}
                        {step.ui && (
                            <>
                                <dt className="font-semibold text-muted">บนหน้าจอ</dt>
                                <dd className="text-ink">{step.ui}</dd>
                            </>
                        )}
                        {step.how_to && (
                            <>
                                <dt className="font-semibold text-muted">วิธีกด</dt>
                                <dd className="leading-relaxed text-ink">{step.how_to}</dd>
                            </>
                        )}
                        {step.note && (
                            <>
                                <dt className="font-semibold text-warning">หมายเหตุ</dt>
                                <dd className="leading-relaxed text-warning">{step.note}</dd>
                            </>
                        )}
                        {(step.code_ref || step.specs.length > 0) && (
                            <>
                                <dt className="font-semibold text-muted">สำหรับ Dev</dt>
                                <dd className="space-y-0.5 break-all font-mono text-[0.8rem] text-muted">
                                    {step.code_ref && <span className="block">{step.code_ref}</span>}
                                    {step.specs.map((s) => (
                                        <span key={s} className="block text-blue">
                                            {s}
                                        </span>
                                    ))}
                                </dd>
                            </>
                        )}
                    </dl>
                ) : (
                    <p className="text-muted">{node.kind === 'note' ? 'หมายเหตุในผัง drawio' : 'กล่องในผังที่ไม่มีเลข WIT'}</p>
                )}

                <FormLinks forms={forms} />

                {jumps.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {jumps.map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => onOpenTab(t)}
                                className="min-h-[38px] rounded-lg border border-line bg-blue-soft px-2.5 py-1 font-semibold text-blue hover:border-blue"
                            >
                                ไปผังแท็บ <span className="font-mono">{t}</span> <i className="fa-solid fa-arrow-right ml-0.5" />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {step && (
                <footer className="flex flex-wrap items-center gap-2 border-t border-line p-3">
                    {hasMockState(step.mock_state) && <PlayButton mockState={step.mock_state} role={step.role} route={step.route} />}
                    <Link
                        to="/flow-guide"
                        search={{ tab }}
                        hash={step.code}
                        className="inline-flex min-h-[38px] items-center rounded-lg border border-[#9aabba] bg-white px-3 py-1.5 text-[0.85rem] font-semibold text-navy hover:bg-slate-50"
                    >
                        ดูในคู่มือ
                    </Link>
                </footer>
            )}
        </aside>
    )
}

/** รายการแบบ คบ. พร้อมชื่อเต็ม กดแล้วเปิดแบบฟอร์มในแท็บใหม่ */
const FormLinks: React.FC<{ forms: number[] }> = ({ forms }) =>
    forms.length > 0 ? (
        <section>
            <h3 className="mb-1.5 font-semibold text-muted">แบบฟอร์มที่เกี่ยวข้อง</h3>
            <ul className="space-y-1">
                {forms.map((n) => (
                    <li key={n}>
                        <Link
                            to="/form/$formId"
                            params={{ formId: String(n) }}
                            target="_blank"
                            title="เปิดแบบฟอร์มในแท็บใหม่"
                            className="group flex items-start gap-2 min-h-[38px] rounded-lg border border-line px-2 py-1.5 hover:border-gold hover:bg-gold-soft"
                        >
                            <span className="shrink-0 rounded border border-gold/60 bg-gold-soft px-1 font-mono text-[0.8rem] font-bold text-warning">
                                คบ.{n}
                            </span>
                            <span className="min-w-0 flex-1 leading-snug text-ink">{formMeta(n)?.t}</span>
                            <i className="fa-solid fa-arrow-up-right-from-square mt-0.5 text-[0.8rem] text-muted group-hover:text-warning" />
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    ) : null

/** กล่องในผังรายขั้นของแท็บต้นทางที่ตรงกับ WIT ของเส้น — ใช้เปิดผังแล้วเลือกกล่องนั้นให้เลย */
const witNodeId = (tab: string, wit?: string) => (wit ? TAB_DIAGRAMS[tab]?.nodes.find((n) => n.code === wit)?.id : undefined)

const EdgePanel: React.FC<{ edge: OverviewEdge; onClose: () => void; onOpen: (search: FlowChartSearch) => void }> = ({
    edge,
    onClose,
    onOpen,
}) => {
    const step = stepByCode(edge.wit ?? null)
    const tabLink = (t: string, role: string) => {
        const info = FLOW_GUIDE.tabs.find((x) => x.tab === t)
        return (
            <button
                type="button"
                onClick={() => onOpen({ tab: t })}
                className="flex w-full items-start gap-2 min-h-[38px] rounded-lg border border-line px-2 py-1.5 text-left hover:border-blue hover:bg-blue-soft"
            >
                <span className="w-8 shrink-0 pt-px text-[0.8rem] text-muted">{role}</span>
                <span className="min-w-0 flex-1 leading-snug text-ink">
                    <span className="mr-1 font-mono font-bold text-navy">{t}</span>
                    {info ? tabShortTitle(info) : ''}
                </span>
                <i className="fa-solid fa-arrow-right mt-0.5 text-[0.8rem] text-muted" />
            </button>
        )
    }
    const nodeId = witNodeId(edge.from, edge.wit)
    const mockState = edge.mockState ?? null

    return (
        <aside className="flex min-h-0 flex-col overflow-hidden ws-card">
            <header className="flex items-start gap-2 border-b border-line p-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[0.88rem] font-bold text-navy">
                        <span className="text-[0.8rem] font-normal text-muted">เส้นทาง</span>
                        <span className="font-mono">{edge.from}</span>
                        <i className="fa-solid fa-arrow-right text-[0.8rem] text-muted" />
                        <span className="font-mono">{edge.to}</span>
                        {edge.label && <span className="rounded-full bg-blue px-2 py-0.5 text-[0.74rem] font-semibold text-white">{edge.label}</span>}
                    </div>
                    <p className="mt-1.5 text-[0.95rem] font-semibold leading-snug text-ink">{edge.desc}</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="ปิด"
                    className="h-[38px] w-[38px] shrink-0 rounded-lg text-muted hover:bg-soft hover:text-ink"
                >
                    <i className="fa-solid fa-xmark" />
                </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-[0.88rem]">
                <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                    <dt className="font-semibold text-muted">ใครทำให้เดินเส้นนี้</dt>
                    <dd className="font-semibold text-ink">{edge.actor}</dd>
                    {edge.wit && (
                        <>
                            <dt className="font-semibold text-muted">ขั้นต้นทางในผัง</dt>
                            <dd className="text-ink">
                                <span className="mr-1 rounded bg-navy px-1.5 py-px font-mono text-[0.8rem] font-bold text-white">{edge.wit}</span>
                                {step?.text}
                            </dd>
                        </>
                    )}
                    {step?.note && (
                        <>
                            <dt className="font-semibold text-warning">หมายเหตุ prototype</dt>
                            <dd className="leading-relaxed text-warning">{step.note}</dd>
                        </>
                    )}
                </dl>

                <section className="space-y-1">
                    <h3 className="mb-1.5 font-semibold text-muted">จากไหนไปไหน</h3>
                    {tabLink(edge.from, 'จาก')}
                    {tabLink(edge.to, 'ไป')}
                </section>

                <FormLinks forms={edge.forms ?? []} />
            </div>

            {(nodeId || hasMockState(mockState)) && (
                <footer className="flex flex-wrap items-center gap-2 border-t border-line p-3">
                    {hasMockState(mockState) && <PlayButton mockState={mockState} role={edge.mockRole ?? null} route={edge.mockRoute ?? null} />}
                    {nodeId && (
                        <button
                            type="button"
                            onClick={() => onOpen({ tab: edge.from, node: nodeId })}
                            className="inline-flex min-h-[38px] items-center rounded-lg border border-line bg-blue-soft px-3 py-1.5 text-[0.85rem] font-semibold text-blue hover:border-blue"
                        >
                            ดู <span className="font-mono">{edge.wit}</span> ในผังรายขั้น <i className="fa-solid fa-arrow-right ml-0.5" />
                        </button>
                    )}
                </footer>
            )}
        </aside>
    )
}

const TabPanel: React.FC<{ tab: FlowGuideTab; onClose: () => void; onOpen: (search: FlowChartSearch) => void }> = ({ tab, onClose, onOpen }) => {
    const incoming = OVERVIEW_EDGES.filter((e) => e.to === tab.tab)
    const outgoing = OVERVIEW_EDGES.filter((e) => e.from === tab.tab)
    const edgeRow = (e: OverviewEdge, other: string) => (
        <li key={edgeKey(e)}>
            <button
                type="button"
                onClick={() => onOpen({ edge: edgeKey(e) })}
                title="ดูคำอธิบายเส้นนี้"
                className="flex w-full items-start gap-2 min-h-[38px] rounded-lg border border-line px-2 py-1.5 text-left hover:border-blue hover:bg-blue-soft"
            >
                <span className="w-12 shrink-0 pt-px font-mono font-bold text-navy">{other}</span>
                <span className="min-w-0 flex-1 leading-snug text-ink">
                    {e.label && <span className="mr-1 rounded-full bg-blue px-1.5 text-[0.74rem] font-semibold text-white">{e.label}</span>}
                    {tabShortTitle(FLOW_GUIDE.tabs.find((t) => t.tab === other)!)}
                </span>
                <i className="fa-solid fa-circle-info mt-0.5 text-[0.8rem] text-muted" />
            </button>
        </li>
    )

    return (
        <aside className="flex min-h-0 flex-col overflow-hidden ws-card">
            <header className="flex items-start gap-2 border-b border-line p-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-navy px-2 py-0.5 font-mono text-[0.8rem] font-bold text-white">{tab.tab}</span>
                        <span className="text-[0.95rem] font-semibold leading-snug text-ink">{tabShortTitle(tab)}</span>
                    </div>
                    <p className="mt-1.5 text-[0.88rem] leading-relaxed text-ink">{TAB_SUMMARY[tab.tab]}</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="ปิด"
                    className="h-[38px] w-[38px] shrink-0 rounded-lg text-muted hover:bg-soft hover:text-ink"
                >
                    <i className="fa-solid fa-xmark" />
                </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-[0.88rem]">
                <section>
                    <h3 className="mb-1.5 font-semibold text-muted">ความพร้อมใน prototype</h3>
                    <StatusBar tab={tab} className="h-2 overflow-hidden rounded-full" />
                    <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.8rem] text-ink">
                        {STATUS_ORDER.map((s) => (
                            <li key={s} className="flex items-center gap-1">
                                <span className={cn('h-2 w-2 rounded-sm', STATUS_BAR[s].className)} />
                                {STATUS_BAR[s].label} <strong>{tabStatusCount(tab, s)}</strong>
                            </li>
                        ))}
                        <li className="text-muted">จาก {tab.steps.length} ขั้น</li>
                    </ul>
                </section>

                <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                    <dt className="font-semibold text-muted">ใครเกี่ยวข้องในผัง</dt>
                    <dd className="text-ink">{tab.lanes.join(' · ')}</dd>
                    <dt className="font-semibold text-muted">บทบาทใน prototype</dt>
                    <dd className="flex flex-wrap gap-1">
                        {tabRoles(tab).map((r) => (
                            <span key={r} title={roleName(r) ?? r} className="rounded bg-blue-soft px-1.5 py-px font-medium text-blue">
                                {roleName(r) ?? ROLE_SHORT[r]}
                            </span>
                        ))}
                    </dd>
                </dl>

                {incoming.length > 0 && (
                    <section>
                        <h3 className="mb-1.5 font-semibold text-muted">มาจาก</h3>
                        <ul className="space-y-1">{incoming.map((e) => edgeRow(e, e.from))}</ul>
                    </section>
                )}
                {outgoing.length > 0 && (
                    <section>
                        <h3 className="mb-1.5 font-semibold text-muted">ไปต่อ</h3>
                        <ul className="space-y-1">{outgoing.map((e) => edgeRow(e, e.to))}</ul>
                    </section>
                )}

                <FormLinks forms={tabForms(tab)} />

                {tab.gaps.length > 0 && (
                    <details className="ws-callout !px-2 !py-1.5">
                        <summary className="cursor-pointer font-semibold">สิ่งที่ prototype ยังต่างจากผัง ({tab.gaps.length})</summary>
                        <ul className="mt-1.5 list-disc space-y-1 pl-4 leading-relaxed text-ink">
                            {tab.gaps.map((g) => (
                                <li key={g}>{g}</li>
                            ))}
                        </ul>
                    </details>
                )}
            </div>

            <footer className="flex flex-wrap items-center gap-2 border-t border-line p-3">
                <button
                    type="button"
                    onClick={() => onOpen({ tab: tab.tab })}
                    className="inline-flex min-h-[38px] items-center rounded-lg bg-navy px-3 py-1.5 text-[0.85rem] font-semibold text-white hover:bg-blue"
                >
                    <i className="fa-solid fa-diagram-project mr-1" />
                    เปิดผังรายขั้น
                </button>
                {hasMockState(tab.entry_mock_state) && <PlayButton mockState={tab.entry_mock_state} role={tab.entry_role} route={null} />}
                <Link
                    to="/flow-guide"
                    search={{ tab: tab.tab }}
                    className="inline-flex min-h-[38px] items-center rounded-lg border border-[#9aabba] bg-white px-3 py-1.5 text-[0.85rem] font-semibold text-navy hover:bg-slate-50"
                >
                    ดูในคู่มือ
                </Link>
            </footer>
        </aside>
    )
}
