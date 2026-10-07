import React, { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { cn } from '../lib/utils'
import {
    FLOW_GUIDE,
    FlowGuideStep,
    FlowGuideTab,
    StepStatus,
    hasMockState,
    mockStateRole,
    tabShortTitle,
} from '../lib/flowGuide'
import { PlayButton, StatusBadge, confirmPlay, roleName } from '../components/flow-guide/playback'

interface FlowGuideSearch {
    tab?: string
}

export const Route = createFileRoute('/flow-guide')({
    validateSearch: (search: Record<string, unknown>): FlowGuideSearch => ({
        tab: typeof search.tab === 'string' ? search.tab : undefined,
    }),
    component: FlowGuidePage,
})


function tabStats(tab: FlowGuideTab) {
    const count = (s: StepStatus) => tab.steps.filter((step) => step.implemented === s).length
    return { yes: count('yes'), partial: count('partial'), no: count('no'), system: count('system') }
}

const StepCard: React.FC<{ step: FlowGuideStep }> = ({ step }) => {
    const playable = hasMockState(step.mock_state)
    return (
        <li id={step.code} className="ws-card scroll-mt-24 p-4">
            <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-navy px-2 py-0.5 font-mono text-[0.8rem] font-bold text-white">{step.code}</span>
                {step.decision && (
                    <span className="rounded-full border border-gold/40 bg-gold-soft px-[0.58rem] py-[0.28rem] text-[0.74rem] font-semibold text-warning">
                        จุดตัดสินใจ
                    </span>
                )}
                <StatusBadge status={step.implemented} />
                <span className="text-[0.8rem] text-muted">ในผัง: {step.lane}</span>
            </div>
            <p className="mt-2 text-[0.95rem] font-semibold text-ink">{step.text}</p>

            <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[0.88rem] sm:grid-cols-[8.5rem_minmax(0,1fr)]">
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
                            <code className="rounded bg-soft px-1 text-ink break-all">{step.route}</code>
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
                        <dd className="space-x-2 font-mono text-[0.8rem] text-muted">
                            {step.code_ref && <span>{step.code_ref}</span>}
                            {step.specs.map((spec) => (
                                <span key={spec} className="text-blue">
                                    {spec}
                                </span>
                            ))}
                        </dd>
                    </>
                )}
            </dl>

            {playable && (
                <div className="mt-3">
                    <PlayButton mockState={step.mock_state!} role={step.role} route={step.route} />
                </div>
            )}
        </li>
    )
}

function FlowGuidePage() {
    const { tab: tabParam } = Route.useSearch()
    const navigate = Route.useNavigate()
    const [query, setQuery] = useState('')

    const phases = useMemo(() => {
        const groups = new Map<string, FlowGuideTab[]>()
        FLOW_GUIDE.tabs.forEach((t) => groups.set(t.phase, [...(groups.get(t.phase) ?? []), t]))
        return [...groups]
    }, [])

    const activeTab = FLOW_GUIDE.tabs.find((t) => t.tab === tabParam) ?? null
    const selectTab = (tab?: string) => navigate({ search: { tab }, replace: true })

    const cleanQuery = query.trim().toLowerCase()
    const searchHits = useMemo(() => {
        if (!cleanQuery) return []
        return FLOW_GUIDE.tabs.flatMap((t) =>
            t.steps
                .filter((s) => `${s.code} ${s.text} ${s.ui ?? ''}`.toLowerCase().includes(cleanQuery))
                .map((s) => ({ tab: t, step: s }))
        )
    }, [cleanQuery])

    return (
        <div>
            <PageHeader
                eyebrow="คู่มือ · เดิน Flow"
                title="คู่มือเดิน Flow (Activity 6)"
                description={
                    <>
                        จับคู่ทุกขั้น WIT ในผัง <span className="break-all">{FLOW_GUIDE.source}</span> กับหน้าจอ บทบาท และ Mock State ใน prototype —
                        กด "เล่นจากจุดนี้" เพื่อโหลดข้อมูลจำลองและเปิดหน้าที่ถูกต้องในแท็บใหม่
                    </>
                }
                actions={
                    <>
                    <Link
                        to="/flow-chart"
                        className="inline-flex min-h-[44px] items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition hover:bg-slate-50"
                    >
                        <i className="fa-solid fa-diagram-project" />
                        ผังภาพรวม
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

            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
                <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="ค้นหาเลข WIT หรือข้อความ"
                        className="ws-input" aria-label="ค้นหาเลข WIT หรือข้อความ"
                    />
                    <nav className="ws-card space-y-3 p-3">
                        <button
                            type="button"
                            onClick={() => selectTab(undefined)}
                            className={cn(
                                'min-h-[44px] w-full rounded-lg px-2.5 py-2 text-left text-[0.88rem] font-semibold',
                                !activeTab ? 'bg-navy text-white' : 'text-navy hover:bg-slate-50'
                            )}
                        >
                            <i className="fa-solid fa-route mr-1.5" />
                            ภาพรวมและเส้นทางแนะนำ
                        </button>
                        {phases.map(([phase, tabs]) => (
                            <div key={phase}>
                                <p className="mb-1 px-2.5 text-[0.8rem] font-bold text-muted">{phase}</p>
                                {tabs.map((t) => {
                                    const stats = tabStats(t)
                                    return (
                                        <button
                                            key={t.tab}
                                            type="button"
                                            onClick={() => selectTab(t.tab)}
                                            className={cn(
                                                'flex min-h-[44px] w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-[0.88rem]',
                                                activeTab?.tab === t.tab ? 'bg-navy text-white' : 'text-ink hover:bg-slate-50'
                                            )}
                                        >
                                            <span className="w-11 shrink-0 font-mono font-bold">{t.tab}</span>
                                            <span className="flex-1 leading-snug">{shortTitle(t)}</span>
                                            {stats.no > 0 && (
                                                <span
                                                    title={`${stats.no} ขั้นยังไม่มีใน prototype`}
                                                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-danger"
                                                />
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        ))}
                    </nav>
                </aside>

                <main className="min-w-0">
                    {cleanQuery ? (
                        <SearchResults hits={searchHits} onPick={(tab) => { setQuery(''); selectTab(tab) }} />
                    ) : activeTab ? (
                        <TabDetail tab={activeTab} />
                    ) : (
                        <Overview onPick={selectTab} />
                    )}
                </main>
            </div>
        </div>
    )
}

const shortTitle = tabShortTitle

const Overview: React.FC<{ onPick: (tab: string) => void }> = ({ onPick }) => {
    const all = FLOW_GUIDE.tabs.flatMap((t) => t.steps)
    const count = (s: StepStatus) => all.filter((step) => step.implemented === s).length
    return (
        <div className="space-y-6">
            <section className="ws-callout text-[0.88rem] leading-relaxed text-ink">
                <h2 className="mb-2 text-[1.1rem] font-bold text-navy">เริ่มต้นอย่างไร</h2>
                <ol className="list-decimal space-y-1 pl-5">
                    <li>เลือก "เส้นทางแนะนำ" ด้านล่าง แล้วกดจุดแวะ (checkpoint) ตามลำดับ — แต่ละจุดโหลดข้อมูลจำลองและสลับบทบาทให้เอง</li>
                    <li>ในแท็บที่เปิดขึ้น ทำตาม "วิธีกด" ของขั้นนั้น ๆ ใช้ช่องเลือกบทบาทมุมขวาบน (TopBar) เมื่อขั้นถัดไปเป็นของคนอื่น</li>
                    <li>อยากดูทีละแท็บของผัง drawio ให้กดกล่องในหน้าผังภาพรวม เลือกจากเมนูซ้าย หรือค้นหาด้วยเลข WIT</li>
                </ol>
                <p className="mt-2 text-[0.8rem] text-muted">
                    ทั้งหมด {all.length} ขั้น · ทำได้ใน UI {count('yes')} · บางส่วน {count('partial')} · ระบบ/นอกระบบ {count('system')} · ยังไม่มี{' '}
                    {count('no')}
                </p>
            </section>

            <Link
                to="/flow-chart"
                className="ws-card flex items-center gap-4 p-4 transition hover:border-blue hover:bg-blue-soft"
            >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-soft text-blue">
                    <i className="fa-solid fa-diagram-project" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[0.95rem] font-bold text-navy">ผังภาพรวมข้ามแท็บ</span>
                    <span className="block text-[0.88rem] text-muted">
                        ดูการส่งต่องานระหว่าง {FLOW_GUIDE.tabs.length} แท็บ พร้อมสีสถานะใน prototype และบทบาทที่ต้องใช้ กดกล่องแท็บเพื่อกลับมาดูรายละเอียด
                    </span>
                </span>
                <i className="fa-solid fa-arrow-right text-muted" />
            </Link>

            <section>
                <h2 className="mb-3 text-[1.1rem] font-bold text-navy">เส้นทางแนะนำ (เล่นตั้งแต่ต้นจนจบ)</h2>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {FLOW_GUIDE.scenarios.map((sc) => (
                        <article key={sc.id} className="ws-card min-w-0 p-4">
                            <h3 className="text-[0.95rem] font-semibold text-ink">{sc.title}</h3>
                            <p className="mt-1 text-[0.88rem] leading-relaxed text-muted">{sc.summary}</p>
                            <p className="mt-2 flex flex-wrap gap-1.5">
                                {sc.tabs.map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => onPick(t)}
                                        className="min-h-[28px] rounded-md border border-line px-2 py-0.5 font-mono text-[0.8rem] text-blue hover:bg-blue-soft"
                                    >
                                        {t}
                                    </button>
                                ))}
                            </p>
                            <ol className="mt-3 space-y-1.5">
                                {sc.checkpoints.filter((cp) => hasMockState(cp.mock_state)).map((cp, i) => (
                                    <li key={`${cp.mock_state}-${i}`} className="flex items-center gap-2 text-[0.88rem]">
                                        <span className="w-6 shrink-0 text-right font-mono text-muted">{i + 1}.</span>
                                        <button
                                            type="button"
                                            onClick={() => confirmPlay(cp.mock_state, cp.role, null)}
                                            className="flex min-h-[44px] min-w-0 flex-1 flex-wrap items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left hover:border-blue hover:bg-blue-soft"
                                        >
                                            <i className="fa-solid fa-play text-[0.8rem] text-blue" />
                                            <span className="font-semibold text-navy">{cp.mock_state}</span>
                                            <span className="min-w-0 flex-1 text-ink">{cp.label}</span>
                                            <span className="text-[0.8rem] text-muted">{roleName(cp.role ?? mockStateRole(cp.mock_state))}</span>
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    )
}

const TabDetail: React.FC<{ tab: FlowGuideTab }> = ({ tab }) => {
    const stats = tabStats(tab)
    return (
        <div className="space-y-4">
            <section className="ws-card p-4">
                <p className="font-mono text-[0.8rem] font-bold text-warning">แท็บ {tab.tab}</p>
                <h2 className="text-[1.1rem] font-bold text-navy">{shortTitle(tab)}</h2>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">{tab.path_summary}</p>
                <p className="mt-2 text-[0.88rem] leading-relaxed text-muted">
                    <strong className="text-ink">เริ่มแท็บนี้:</strong> {tab.entry}
                </p>
                <p className="mt-2 text-[0.8rem] text-muted">
                    {tab.steps.length} ขั้น · ทำได้ใน UI {stats.yes} · บางส่วน {stats.partial} · ระบบ/นอกระบบ {stats.system} · ยังไม่มี {stats.no}
                </p>
                {hasMockState(tab.entry_mock_state) && (
                    <div className="mt-3">
                        <PlayButton mockState={tab.entry_mock_state} role={tab.entry_role} route={null} label="เริ่มแท็บนี้" />
                    </div>
                )}
                {tab.gaps.length > 0 && (
                    <div className="ws-callout mt-3">
                        <p className="mb-1 text-[0.88rem] font-bold">จุดที่ prototype ยังต่างจากผัง</p>
                        <ul className="list-disc space-y-0.5 pl-5 text-[0.88rem] leading-relaxed">
                            {tab.gaps.map((g) => (
                                <li key={g}>{g}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>
            <ol className="space-y-3">
                {tab.steps.map((step) => (
                    <StepCard key={step.code} step={step} />
                ))}
            </ol>
        </div>
    )
}

const SearchResults: React.FC<{
    hits: Array<{ tab: FlowGuideTab; step: FlowGuideStep }>
    onPick: (tab: string) => void
}> = ({ hits, onPick }) => (
    <div className="space-y-2">
        <p className="text-[0.88rem] text-muted">พบ {hits.length} ขั้น</p>
        {hits.map(({ tab, step }) => (
            <button
                key={step.code}
                type="button"
                onClick={() => onPick(tab.tab)}
                className="ws-card flex min-h-[44px] w-full items-center gap-3 p-3 text-left text-[0.88rem] hover:border-blue"
            >
                <span className="font-mono font-bold text-navy">{step.code}</span>
                <span className="font-mono text-muted">{tab.tab}</span>
                <span className="min-w-0 flex-1 text-ink">{step.text}</span>
                <StatusBadge status={step.implemented} />
            </button>
        ))}
    </div>
)
