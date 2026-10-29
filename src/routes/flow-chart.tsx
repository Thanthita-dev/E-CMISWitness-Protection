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
    crossEdgesOfStep,
    formMeta,
    overviewMinimap,
    overviewStep,
    stepEdgeByParam,
    stepEdgeParam,
    tabRoles,
    tabStatusCount,
} from '../components/flow-guide/FlowOverviewChart'
import { OVERVIEW_DETAIL, OverviewStep, OverviewStepEdge } from '../components/flow-guide/overviewLayout'
import {
    ALL_SNAPSHOT_KEYS,
    DiagramEdge,
    DiagramNode,
    TAB_DIAGRAMS,
    TabDiagram,
    TabStepDiagram,
    nodeForms,
    stepByCode,
    tabDiagramMinimap,
} from '../components/flow-guide/TabStepDiagram'
import { ZoomViewport } from '../components/flow-guide/ZoomViewport'
import { FlowDownloadButtons } from '../components/flow-guide/FlowDownloadButtons'
import { PlayButton, PlayMark, SnapshotInfo, SnapshotPlayButton, StatusBadge, roleName } from '../components/flow-guide/playback'
import { FLOW_GUIDE, FlowGuideTab, hasMockState, tabForms, tabShortTitle } from '../lib/flowGuide'
import { hasSnapshot, snapshotCoverage, snapshotFor, snapshotKey } from '../lib/flowSnapshots'
import { useAuthStore } from '../store/useAuthStore'
import { cn } from '../lib/utils'

interface FlowChartSearch {
    /** แท็บที่กางดูขั้น WIT — ไม่ระบุ = ผังภาพรวม */
    tab?: string
    /** กล่องที่เลือกในผังรายขั้น (id ในผัง drawio) */
    node?: string
    /** เส้นที่เลือกในผังรายขั้น (id เส้นในผัง drawio เช่น E01) */
    link?: string
    /** เส้นที่เลือกในผังภาพรวม ("ต้นทาง>ปลายทาง") */
    edge?: string
    /** กล่องแท็บที่เลือกในผังภาพรวม (เปิดแผงคำอธิบาย ยังไม่กางผังรายขั้น) */
    box?: string
    /** กล่องขั้นสำคัญที่เลือกในผังภาพรวม ("แท็บ:เลข WIT" เช่น 05:WIT0502) */
    ms?: string
    /** เส้นระหว่างขั้นสำคัญในกรอบแท็บที่เลือกในผังภาพรวม ("แท็บ:ต้นทาง>ปลายทาง") */
    mlink?: string
}

export const Route = createFileRoute('/flow-chart')({
    validateSearch: (search: Record<string, unknown>): FlowChartSearch => ({
        tab: typeof search.tab === 'string' ? search.tab : undefined,
        node: typeof search.node === 'string' ? search.node : undefined,
        link: typeof search.link === 'string' ? search.link : undefined,
        edge: typeof search.edge === 'string' ? search.edge : undefined,
        box: typeof search.box === 'string' ? search.box : undefined,
        ms: typeof search.ms === 'string' ? search.ms : undefined,
        mlink: typeof search.mlink === 'string' ? search.mlink : undefined,
    }),
    component: FlowChartPage,
})

const COVERAGE = snapshotCoverage(ALL_SNAPSHOT_KEYS)

const TAB_IDS = FLOW_GUIDE.tabs.map((t) => t.tab)

/** หาเลขแท็บที่ข้อความในกล่องชี้ไป เช่น "ไปแท็บ 05", "ไปหน้า 08A-1" ("แท็บ 08" = 08A) */
function referencedTabs(text: string, current: string): string[] {
    const found = [...text.matchAll(/(?:แท็บ|หน้า)\s*(\d{2}[A-Z]?(?:-\d)?)/g)].map((m) => (TAB_IDS.includes(m[1]) ? m[1] : `${m[1]}A`))
    return [...new Set(found)].filter((t) => TAB_IDS.includes(t) && t !== current)
}

function FlowChartPage() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
    const { tab, node, link, edge, box, ms, mlink } = Route.useSearch()
    const navigate = Route.useNavigate()
    const tabInfo = FLOW_GUIDE.tabs.find((t) => t.tab === tab) ?? null
    const diagram = tabInfo ? TAB_DIAGRAMS[tabInfo.tab] : null
    const selectedNode = diagram?.nodes.find((n) => n.id === node) ?? null
    const selectedLink = diagram?.edges.find((e) => e.id === link) ?? null
    const selectedEdge = tabInfo ? null : edgeByKey(edge)
    const overviewOnly = !tabInfo
    const [msTab, msCode] = (ms ?? '').split(':')
    const selectedMilestone = overviewOnly ? overviewStep(msTab, msCode) ?? null : null
    const selectedMilestoneEdge = overviewOnly && !selectedMilestone ? stepEdgeByParam(mlink) : null
    const selectedBox = tabInfo || selectedEdge || selectedMilestone || selectedMilestoneEdge ? null : FLOW_GUIDE.tabs.find((t) => t.tab === box) ?? null

    // การเลือกกล่อง/เส้นแทนที่ประวัติเดิม ส่วนการกางผังรายขั้นเป็นหน้าใหม่ (กดย้อนกลับได้)
    const selecting = (x: FlowChartSearch) => !!x.node || !!x.link || !!x.edge || !!x.box || !!x.ms || !!x.mlink
    const go = (search: FlowChartSearch) =>
        navigate({
            search,
            // เลือกกล่อง/เส้นภายในมุมมองเดิม (ภาพรวมหรือแท็บเดิม) แทนที่ประวัติ ส่วนการข้ามมุมมอง (เช่น เปิดผังรายขั้นจาก milestone) เป็นหน้าใหม่
            replace: (selecting(search) && search.tab === tab) || (!search.tab && (!!node || !!link || !!edge || !!box || !!ms || !!mlink)),
        })
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
                        กรอบแท็บแสดงขั้นสำคัญของแต่ละแท็บ · กดหัวกรอบ ขั้นสำคัญ หรือเส้นเพื่อดูคำอธิบายและเล่นจากจุดนั้น แล้วกด "เปิดผังรายขั้น" เพื่อกางขั้น WIT ทั้งหมดของแท็บ · ลากเพื่อเลื่อน, Ctrl/⌘ + ล้อเมาส์เพื่อซูม
                    </>
                }
                actions={
                    <>
                        {!isAuthenticated && (
                            <Link
                                to="/login"
                                className="inline-flex min-h-[44px] items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition hover:bg-slate-50"
                            >
                                <i className="fa-solid fa-right-to-bracket" />
                                เข้าสู่ระบบ
                            </Link>
                        )}
                        <FlowDownloadButtons kind="flow-chart" />
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
                    selectedLink && diagram && tabInfo ? (
                        <StepEdgePanel
                            edge={selectedLink}
                            diagram={diagram}
                            tab={tabInfo.tab}
                            onClose={() => go({ tab: tabInfo.tab })}
                            onOpen={go}
                        />
                    ) : selectedNode && tabInfo ? (
                        <NodePanel
                            node={selectedNode}
                            tab={tabInfo.tab}
                            onClose={() => go({ tab: tabInfo.tab })}
                            onOpenTab={(t) => go({ tab: t })}
                        />
                    ) : selectedMilestone ? (
                        <MilestonePanel tab={msTab} step={selectedMilestone} onClose={() => go({})} onOpen={go} />
                    ) : selectedMilestoneEdge ? (
                        <MilestoneEdgePanel tab={selectedMilestoneEdge.tab} edge={selectedMilestoneEdge.edge} onClose={() => go({})} onOpen={go} />
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
                        tab={tabInfo.tab}
                        selected={selectedNode?.id ?? null}
                        onSelect={(n) => go({ tab: tabInfo.tab, node: n.id === node ? undefined : n.id })}
                        selectedEdge={selectedLink?.id ?? null}
                        onSelectEdge={(e) => go({ tab: tabInfo.tab, link: e.id === link ? undefined : e.id })}
                    />
                ) : (
                    <FlowOverviewCanvas
                        onPick={(t) => go({ box: t === box ? undefined : t })}
                        selectedTab={selectedBox?.tab ?? null}
                        selectedEdge={selectedEdge ? edgeKey(selectedEdge) : null}
                        onPickEdge={(e) => go({ edge: edgeKey(e) === edge ? undefined : edgeKey(e) })}
                        selectedStep={selectedMilestone ? ms ?? null : null}
                        onPickStep={(t, code) => go({ ms: `${t}:${code}` === ms ? undefined : `${t}:${code}` })}
                        selectedStepEdge={selectedMilestoneEdge ? mlink ?? null : null}
                        onPickStepEdge={(t, e) => go({ mlink: stepEdgeParam(t, e) === mlink ? undefined : stepEdgeParam(t, e) })}
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
        <p className="flex flex-wrap items-center gap-1.5 text-muted">
            <PlayMark className="pointer-events-auto shadow-none" />
            = มี snapshot ให้เล่นจากจุดนั้น · มี snapshot <strong className="text-ink">{COVERAGE.done}/{COVERAGE.total}</strong> จุด
        </p>
        {detail ? (
            <p className="text-muted">
                ◇ จุดตัดสินใจ · ⬭ จุดรับ/ส่งต่อแท็บ · <span className="rounded-full bg-blue px-1.5 text-[0.74rem] text-white">ป้าย</span> = บทบาทใน
                prototype · <FormLegendChip /> = แบบ คบ. ที่เกี่ยวข้อง · แถบด้านซ้าย = swimlane ในผัง
            </p>
        ) : (
            <p className="max-w-[40rem] text-muted">
                กรอบ = แท็บ (แถบสีใต้หัวกรอบ = สัดส่วนสถานะของขั้น) · กล่อง = ขั้นสำคัญ สีตามสถานะ ◇ = จุดตัดสินใจ กล่องมน = จุดส่งต่อ ·{' '}
                <span className="rounded bg-blue-soft px-1.5 text-[0.74rem] text-blue">ป้าย</span> = บทบาท · <FormLegendChip /> = แบบ คบ. · เส้นบางในกรอบ = ลำดับขั้น ·
                เส้นเข้มข้ามกรอบ = ส่งต่อแท็บ · เส้นประ = ย้อนกลับ · ชี้/กดหัวกรอบ กล่อง หรือเส้นเพื่อดูคำอธิบาย
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
    const snapKey = node.kind === 'note' ? null : snapshotKey.node(tab, node.id)
    const snap = snapshotFor(snapKey)

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
                    <p className="text-muted">{node.kind === 'note' ? 'หมายเหตุในผัง' : 'กล่องในผังที่ไม่มีเลข WIT'}</p>
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

            {(step || snap) && (
                <footer className="flex flex-wrap items-center gap-2 border-t border-line p-3">
                    {snapKey && snap ? (
                        <SnapshotPlayButton snapshotKey={snapKey} />
                    ) : (
                        step && hasMockState(step.mock_state) && <PlayButton mockState={step.mock_state} role={step.role} route={step.route} />
                    )}
                    {step && (
                        <Link
                            to="/flow-guide"
                            search={{ tab }}
                            hash={step.code}
                            className="inline-flex min-h-[38px] items-center rounded-lg border border-[#9aabba] bg-white px-3 py-1.5 text-[0.85rem] font-semibold text-navy hover:bg-slate-50"
                        >
                            ดูในคู่มือ
                        </Link>
                    )}
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

/** ชื่อกล่องในแผงเส้น: เลข WIT (ถ้ามี) + ข้อความในกล่อง */
const nodeTitle = (n: DiagramNode | undefined, onPick: () => void) =>
    n ? (
        <button
            type="button"
            onClick={onPick}
            className="flex w-full items-start gap-2 min-h-[38px] rounded-lg border border-line px-2 py-1.5 text-left hover:border-blue hover:bg-blue-soft"
        >
            {n.code && <span className="shrink-0 rounded bg-navy px-1.5 py-px font-mono text-[0.8rem] font-bold text-white">{n.code}</span>}
            <span className="min-w-0 flex-1 leading-snug text-ink">{n.text || 'จุดเริ่ม'}</span>
            <i className="fa-solid fa-arrow-right mt-0.5 text-[0.8rem] text-muted" />
        </button>
    ) : null

const StepEdgePanel: React.FC<{
    edge: DiagramEdge
    diagram: TabDiagram
    tab: string
    onClose: () => void
    onOpen: (search: FlowChartSearch) => void
}> = ({ edge, diagram, tab, onClose, onOpen }) => {
    const source = diagram.nodes.find((n) => n.id === edge.source)
    const target = diagram.nodes.find((n) => n.id === edge.target)
    const snapKey = snapshotKey.edge(tab, edge.id)
    const snap = snapshotFor(snapKey)

    return (
        <aside className="flex min-h-0 flex-col overflow-hidden ws-card">
            <header className="flex items-start gap-2 border-b border-line p-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[0.88rem] font-bold text-navy">
                        <span className="text-[0.8rem] font-normal text-muted">เส้นในผังแท็บ</span>
                        <span className="font-mono">{tab}</span>
                        {edge.label && <span className="rounded-full bg-blue px-2 py-0.5 text-[0.74rem] font-semibold text-white">{edge.label}</span>}
                        {edge.dashed && <span className="text-[0.8rem] font-normal text-muted">เส้นประ</span>}
                    </div>
                    <p className="mt-1.5 text-[0.95rem] font-semibold leading-snug text-ink">
                        {source?.code ?? source?.text ?? 'จุดเริ่ม'} → {target?.code ?? target?.text ?? 'จุดจบ'}
                    </p>
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
                <section className="space-y-1">
                    <h3 className="mb-1.5 font-semibold text-muted">จากกล่อง</h3>
                    {nodeTitle(source, () => onOpen({ tab, node: source?.id }))}
                    <h3 className="mb-1.5 mt-3 font-semibold text-muted">ไปกล่อง</h3>
                    {nodeTitle(target, () => onOpen({ tab, node: target?.id }))}
                </section>

                {snap ? (
                    <SnapshotInfo snap={snap} />
                ) : (
                    <p className="text-muted">เส้นนี้ยังไม่มี snapshot ให้เล่น</p>
                )}
            </div>

            {snap && (
                <footer className="flex flex-wrap items-center gap-2 border-t border-line p-3">
                    <SnapshotPlayButton snapshotKey={snapKey} />
                </footer>
            )}
        </aside>
    )
}

/** แถวชื่อขั้นสำคัญ (เลข WIT + ข้อความ) ในแผงเส้น กดแล้วไปเลือกกล่องนั้น */
const stepRow = (tab: string, code: string, onPick: () => void) => {
    const s = overviewStep(tab, code)
    return (
        <button
            type="button"
            onClick={onPick}
            className="flex w-full items-start gap-2 min-h-[38px] rounded-lg border border-line px-2 py-1.5 text-left hover:border-blue hover:bg-blue-soft"
        >
            <span className="shrink-0 rounded bg-navy px-1.5 py-px font-mono text-[0.8rem] font-bold text-white">{code}</span>
            <span className="min-w-0 flex-1 leading-snug text-ink">
                <span className="mr-1 font-mono font-bold text-navy">{tab}</span>
                {s?.label}
            </span>
            <i className="fa-solid fa-arrow-right mt-0.5 text-[0.8rem] text-muted" />
        </button>
    )
}

const MilestonePanel: React.FC<{ tab: string; step: OverviewStep; onClose: () => void; onOpen: (search: FlowChartSearch) => void }> = ({
    tab,
    step,
    onClose,
    onOpen,
}) => {
    const info = stepByCode(step.code)
    const tabInfo = FLOW_GUIDE.tabs.find((t) => t.tab === tab)
    const forms = info ? nodeForms({ id: step.code, code: step.code, kind: 'step', text: info.text, x: 0, y: 0, w: 0, h: 0 }) : []
    const snap = snapshotFor(step.snapshot)
    const detail = OVERVIEW_DETAIL.tabs[tab]
    const incoming = detail.edges.filter((e) => e.to === step.code)
    const outgoing = detail.edges.filter((e) => e.from === step.code)
    const cross = crossEdgesOfStep(tab, step.code)
    const pending = detail.pending?.includes(step.code)
    const hasDiagramNode = !!TAB_DIAGRAMS[tab]?.nodes.some((n) => n.id === step.code)

    return (
        <aside className="flex min-h-0 flex-col overflow-hidden ws-card">
            <header className="flex items-start gap-2 border-b border-line p-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-navy px-2 py-0.5 font-mono text-[0.8rem] font-bold text-white">{step.code}</span>
                        <span className="text-[0.8rem] text-muted">
                            ขั้นสำคัญในแท็บ <span className="font-mono font-bold text-navy">{tab}</span> {tabInfo && tabShortTitle(tabInfo)}
                        </span>
                        {info && <StatusBadge status={info.implemented} />}
                    </div>
                    <p className="mt-1.5 text-[0.95rem] font-semibold leading-snug text-ink">{info?.text ?? step.label}</p>
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
                {pending && <p className="ws-callout">ขั้นนี้ยังไม่มีกล่องในผังรายขั้นของแท็บ {tab} (กำลังปรับผังแท็บนี้)</p>}
                {info && (
                    <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                        <dt className="font-semibold text-muted">ในผัง</dt>
                        <dd className="text-ink">{info.lane}</dd>
                        {info.role && (
                            <>
                                <dt className="font-semibold text-muted">บทบาทใน prototype</dt>
                                <dd className="text-ink">
                                    <span className="font-semibold">{roleName(info.role)}</span>
                                    {info.role_note && <span className="block text-[0.8rem] text-muted">{info.role_note}</span>}
                                </dd>
                            </>
                        )}
                        {info.route && (
                            <>
                                <dt className="font-semibold text-muted">หน้า</dt>
                                <dd>
                                    <code className="break-all rounded bg-soft px-1 text-ink">{info.route}</code>
                                </dd>
                            </>
                        )}
                        {info.how_to && (
                            <>
                                <dt className="font-semibold text-muted">วิธีกด</dt>
                                <dd className="leading-relaxed text-ink">{info.how_to}</dd>
                            </>
                        )}
                        {info.note && (
                            <>
                                <dt className="font-semibold text-warning">หมายเหตุ</dt>
                                <dd className="leading-relaxed text-warning">{info.note}</dd>
                            </>
                        )}
                    </dl>
                )}

                {(incoming.length > 0 || outgoing.length > 0 || cross.length > 0) && (
                    <section className="space-y-1">
                        <h3 className="mb-1.5 font-semibold text-muted">เส้นที่เกี่ยวข้อง</h3>
                        {incoming.map((e) => (
                            <div key={`in-${e.from}`}>{stepRow(tab, e.from, () => onOpen({ mlink: stepEdgeParam(tab, e) }))}</div>
                        ))}
                        {outgoing.map((e) => (
                            <div key={`out-${e.to}`}>{stepRow(tab, e.to, () => onOpen({ mlink: stepEdgeParam(tab, e) }))}</div>
                        ))}
                        {cross.map((e) => (
                            <button
                                key={edgeKey(e)}
                                type="button"
                                onClick={() => onOpen({ edge: edgeKey(e) })}
                                className="flex w-full items-start gap-2 min-h-[38px] rounded-lg border border-line px-2 py-1.5 text-left hover:border-blue hover:bg-blue-soft"
                            >
                                <span className="shrink-0 font-mono font-bold text-navy">
                                    {e.from} → {e.to}
                                </span>
                                <span className="min-w-0 flex-1 leading-snug text-ink">
                                    {e.label && <span className="mr-1 rounded-full bg-blue px-1.5 text-[0.74rem] font-semibold text-white">{e.label}</span>}
                                    ส่งต่อข้ามแท็บ
                                </span>
                                <i className="fa-solid fa-circle-info mt-0.5 text-[0.8rem] text-muted" />
                            </button>
                        ))}
                    </section>
                )}

                <FormLinks forms={forms} />
            </div>

            <footer className="flex flex-wrap items-center gap-2 border-t border-line p-3">
                {snap ? (
                    <SnapshotPlayButton snapshotKey={step.snapshot} />
                ) : (
                    info && hasMockState(info.mock_state) && <PlayButton mockState={info.mock_state} role={info.role} route={info.route} />
                )}
                <button
                    type="button"
                    onClick={() => onOpen({ tab, node: hasDiagramNode ? step.code : undefined })}
                    className="inline-flex min-h-[38px] items-center rounded-lg bg-navy px-3 py-1.5 text-[0.85rem] font-semibold text-white hover:bg-blue"
                >
                    <i className="fa-solid fa-diagram-project mr-1" />
                    เปิดผังรายขั้น
                </button>
            </footer>
        </aside>
    )
}

const MilestoneEdgePanel: React.FC<{ tab: string; edge: OverviewStepEdge; onClose: () => void; onOpen: (search: FlowChartSearch) => void }> = ({
    tab,
    edge,
    onClose,
    onOpen,
}) => {
    const snap = snapshotFor(edge.snapshot)
    const direct = edge.snapshot.startsWith('edge:')
    const tabInfo = FLOW_GUIDE.tabs.find((t) => t.tab === tab)

    return (
        <aside className="flex min-h-0 flex-col overflow-hidden ws-card">
            <header className="flex items-start gap-2 border-b border-line p-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[0.88rem] font-bold text-navy">
                        <span className="text-[0.8rem] font-normal text-muted">เส้นในแท็บ</span>
                        <span className="font-mono">{tab}</span>
                        {edge.label && <span className="rounded-full bg-blue px-2 py-0.5 text-[0.74rem] font-semibold text-white">{edge.label}</span>}
                    </div>
                    <p className="mt-1.5 text-[0.95rem] font-semibold leading-snug text-ink">
                        {edge.from} → {edge.to}
                    </p>
                    {tabInfo && <p className="mt-0.5 text-[0.8rem] text-muted">{tabShortTitle(tabInfo)}</p>}
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
                <section className="space-y-1">
                    <h3 className="mb-1.5 font-semibold text-muted">จากขั้น</h3>
                    {stepRow(tab, edge.from, () => onOpen({ ms: `${tab}:${edge.from}` }))}
                    <h3 className="mb-1.5 mt-3 font-semibold text-muted">ไปขั้น</h3>
                    {stepRow(tab, edge.to, () => onOpen({ ms: `${tab}:${edge.to}` }))}
                </section>
                <p className="text-[0.8rem] text-muted">
                    {direct ? 'เส้นนี้ตรงกับเส้นหนึ่งเส้นในผังรายขั้น' : 'ระหว่างสองขั้นนี้ยังมีขั้นย่อยอื่นในผังรายขั้น (เล่นได้จากจุดที่พร้อมทำขั้นปลายทาง)'}
                </p>
                {snap ? (
                    <SnapshotInfo snap={snap} />
                ) : (
                    <p className="text-muted">เส้นนี้ยังไม่มี snapshot ให้เล่น</p>
                )}
            </div>

            <footer className="flex flex-wrap items-center gap-2 border-t border-line p-3">
                {snap && <SnapshotPlayButton snapshotKey={edge.snapshot} />}
                <button
                    type="button"
                    onClick={() => onOpen({ tab })}
                    className="inline-flex min-h-[38px] items-center rounded-lg border border-line bg-blue-soft px-3 py-1.5 text-[0.85rem] font-semibold text-blue hover:border-blue"
                >
                    เปิดผังรายขั้น <i className="fa-solid fa-arrow-right ml-0.5" />
                </button>
            </footer>
        </aside>
    )
}

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
    const cross = OVERVIEW_DETAIL.cross[edgeKey(edge)]
    const mockState = edge.mockState ?? null
    const snapKey = snapshotKey.overview(edgeKey(edge))
    const snap = hasSnapshot(snapKey)

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

                {cross && (
                    <section className="space-y-1">
                        <h3 className="mb-1.5 font-semibold text-muted">ขั้นสำคัญที่เส้นนี้เชื่อม</h3>
                        {stepRow(edge.from, cross.from, () => onOpen({ ms: `${edge.from}:${cross.from}` }))}
                        {stepRow(edge.to, cross.to, () => onOpen({ ms: `${edge.to}:${cross.to}` }))}
                    </section>
                )}

                <FormLinks forms={edge.forms ?? []} />
            </div>

            {(nodeId || snap || hasMockState(mockState)) && (
                <footer className="flex flex-wrap items-center gap-2 border-t border-line p-3">
                    {snap ? (
                        <SnapshotPlayButton snapshotKey={snapKey} />
                    ) : (
                        hasMockState(mockState) && <PlayButton mockState={mockState} role={edge.mockRole ?? null} route={edge.mockRoute ?? null} />
                    )}
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
                {hasSnapshot(snapshotKey.tab(tab.tab)) ? (
                    <SnapshotPlayButton snapshotKey={snapshotKey.tab(tab.tab)} label="เริ่มแท็บนี้" />
                ) : (
                    hasMockState(tab.entry_mock_state) && <PlayButton mockState={tab.entry_mock_state} role={tab.entry_role} route={null} />
                )}
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
