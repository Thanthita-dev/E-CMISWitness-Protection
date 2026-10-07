import { Button } from "../components/common/Button"
import React, { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { StatCard, StatGrid } from '../components/common/StatCard'
import { FilterCard } from '../components/common/FilterCard'
import { Badge } from '../components/common/Badge'
import { AdvancedFilter } from '../components/common/AdvancedFilter'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { canCreateIntake } from '../lib/permissions'
import { isPrivacyBlocked, privacyBlockedMessage } from '../lib/privacyGuard'
import { useAuditStore } from '../store/useAuditStore'
import { formatThaiDate } from '../lib/utils'
import { canViewHandoffCase } from '../lib/protectionHandoff'

export const Route = createFileRoute('/registry')({
    component: RegistryPage,
})

function RegistryPage() {
    const allCases = useCaseStore((state) => state.cases)
    const currentRole = useAuthStore((state) => state.currentRole)
    const currentOfficerUserId = useAuthStore((state) => state.currentOfficerUserId)
    const cases = React.useMemo(() => allCases.filter((c) => canViewHandoffCase(currentRole, c, currentOfficerUserId)), [allCases, currentRole, currentOfficerUserId])
    const navigate = useNavigate()

    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState('__all')
    const [advancedCriteria, setAdvancedCriteria] = useState<Record<string, any>>({})
    const [currentPage, setCurrentPage] = useState(1)
    const pageSize = 10

    // Stat metrics
    const totalCount = cases.length
    const pendingReviewCount = cases.filter((c) => c.status === 'รอตรวจคำร้อง' || c.status === 'รอตรวจข้อมูลจากผู้ยื่น' || c.status === 'รอตรวจเอกสาร').length
    const supervisorReviewCount = cases.filter((c) => c.stage === 'supervisor_review').length
    const activity7PendingCount = cases.filter((c) => c.stage === 'external_pending').length
    const rejectedCount = cases.filter((c) => c.activity7State === 'rejected').length
    const protectionActiveCount = cases.filter((c) => c.stage === 'protection').length

    /**
     * WIT0833 — มาตรการปกปิดข้อมูลตามข้อ 15(3) ต้องถูกบังคับใช้จริงที่จุดค้นหา
     * สำนวนที่ตั้ง restrictSearch ไว้ต้องไม่ปรากฏในผลค้นหาของผู้ใช้นอกขอบเขตที่อนุมัติ
     * และทุกครั้งที่มีความพยายามค้นหาต้องถูกบันทึกลง Access Log (WIT0837)
     */
    const addAuditLog = useAuditStore((state) => state.addLog)
    const searchBlockedCases = React.useMemo(
        () => cases.filter((c) => isPrivacyBlocked(c, currentRole, 'search')),
        [cases, currentRole]
    )
    /** บันทึกความพยายามค้นหาครั้งละหนึ่งรายการต่อคำค้นหนึ่งคำ ไม่ใช่ทุกตัวอักษรที่พิมพ์ */
    const loggedAttemptsRef = React.useRef<Set<string>>(new Set())
    React.useEffect(() => {
        const clean = searchQuery.trim().toLowerCase()
        if (!clean || searchBlockedCases.length === 0) return
        for (const c of searchBlockedCases) {
            const hit =
                c.no.toLowerCase().includes(clean) ||
                c.person.toLowerCase().includes(clean) ||
                (c.mainCaseNo || '').toLowerCase().includes(clean)
            if (!hit) continue
            const key = `${c.no}|${currentRole}|${clean}`
            if (loggedAttemptsRef.current.has(key)) continue
            loggedAttemptsRef.current.add(key)
            addAuditLog({
                caseNo: c.no,
                actorName: currentRole,
                actorRole: currentRole,
                action: `ถูกบล็อกการค้นหาตามมาตรการปกปิดข้อมูลพยาน — คำค้น "${searchQuery.trim()}"`,
            })
        }
    }, [searchQuery, searchBlockedCases, currentRole, addAuditLog])

    // Filter logic
    const filteredCases = cases.filter((c) => {
        /** ผู้ใช้นอกขอบเขตมองไม่เห็นสำนวนที่อยู่ภายใต้มาตรการปกปิดเลย ไม่ใช่แค่ซ่อนบางคอลัมน์ */
        if (isPrivacyBlocked(c, currentRole, 'search')) return false

        // Basic search
        const cleanSearch = searchQuery.trim().toLowerCase()
        const matchesSearch =
            !cleanSearch ||
            c.no.toLowerCase().includes(cleanSearch) ||
            c.person.toLowerCase().includes(cleanSearch) ||
            (c.mainCaseNo && c.mainCaseNo.toLowerCase().includes(cleanSearch))

        // Status filter
        let matchesStatus = true
        if (statusFilter === '__urgent') {
            matchesStatus = Boolean(c.urgent || c.urgency === 'urgent')
        } else if (statusFilter === '__normal') {
            matchesStatus = !c.urgent && c.urgency !== 'urgent'
        } else if (statusFilter === '__rejected') {
            matchesStatus = c.activity7State === 'rejected'
        } else if (statusFilter !== '__all') {
            matchesStatus = c.status === statusFilter || c.stage === statusFilter
        }

        // Advanced criteria
        if (advancedCriteria.formCode && c.form !== advancedCriteria.formCode) return false
        if (advancedCriteria.urgency && c.urgency !== advancedCriteria.urgency) return false
        if (advancedCriteria.risk && c.risk !== advancedCriteria.risk) return false
        if (advancedCriteria.orgUnit && c.orgUnitId !== advancedCriteria.orgUnit) return false
        if (advancedCriteria.ownerName && !c.owner.toLowerCase().includes(advancedCriteria.ownerName.toLowerCase())) return false

        return matchesSearch && matchesStatus
    })

    // Pagination
    const totalPages = Math.ceil(filteredCases.length / pageSize) || 1
    const paginatedCases = filteredCases.slice((currentPage - 1) * pageSize, currentPage * pageSize)

    return (
        <div>
            <PageHeader
                eyebrow="งานคุ้มครองพยาน · ทะเบียนและรับคำร้อง"
                title="ทะเบียนคำร้องคุ้มครองพยาน"
                description="ค้นหา ติดตาม และเปิดแฟ้มคำร้องขอรับความคุ้มครองพยานทั้งหมดจากจุดเดียว"
                actions={
                    canCreateIntake(currentRole) ? (
                        <Link
                            to="/intake"
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-[0.88rem] font-semibold text-white hover:bg-blue transition"
                        >
                            <i className="fa-solid fa-plus" />
                            รับคำร้องใหม่
                        </Link>
                    ) : undefined
                }
            />

            {/* KPI Stats Band */}
            <StatGrid>
                <StatCard
                    label="คำร้องทั้งหมด"
                    value={totalCount}
                    subtext="ทุกขั้นตอน"
                    active={statusFilter === '__all'}
                    onClick={() => setStatusFilter('__all')}
                />
                <StatCard
                    label="รอตรวจคำร้อง"
                    value={pendingReviewCount}
                    subtext="เจ้าหน้าที่เจ้าของเรื่อง"
                    variant="warning"
                    active={statusFilter === 'รอตรวจคำร้อง'}
                    onClick={() => setStatusFilter('รอตรวจคำร้อง')}
                />
                <StatCard
                    label="รอกลั่นกรอง"
                    value={supervisorReviewCount}
                    subtext="ผู้บังคับบัญชาชั้นต้น"
                    variant="gold"
                    active={statusFilter === 'supervisor_review'}
                    onClick={() => setStatusFilter('supervisor_review')}
                />
                <StatCard
                    label="รอผลกิจกรรมที่ 7"
                    value={activity7PendingCount}
                    subtext="เลขาธิการ ป.ป.ท."
                    variant="default"
                    active={statusFilter === 'external_pending'}
                    onClick={() => setStatusFilter('external_pending')}
                />
                <StatCard
                    label="เลขาธิการฯ ไม่อนุมัติ"
                    value={rejectedCount}
                    subtext="รอจัดทำ คบ.10"
                    variant="danger"
                    active={statusFilter === '__rejected'}
                    onClick={() => setStatusFilter('__rejected')}
                />
                <StatCard
                    label="กำลังคุ้มครอง"
                    value={protectionActiveCount}
                    subtext="ติดตามมาตรการ"
                    variant="success"
                    active={statusFilter === 'protection'}
                    onClick={() => setStatusFilter('protection')}
                />
            </StatGrid>

            {/* Search & Filter Toolbar */}
            <FilterCard
                actions={
                    <Button
                        type="button"
                        onClick={() => {
                            setSearchQuery('')
                            setStatusFilter('__all')
                            setAdvancedCriteria({})
                        }}
                        variant="secondary"
                        size="md"
                    >
                        <i className="fa-solid fa-rotate-left text-muted" />
                        ล้างเงื่อนไข
                    </Button>
                }
            >
                <div className="ws-field" style={{ gridColumn: 'span 2' }}>
                    <label htmlFor="registry-search">ค้นหา</label>
                    <input
                        id="registry-search"
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="ค้นหาเลขคำร้อง (WP-...), ชื่อผู้ยื่น, หรือเลขคดีหลัก..."
                        className="ws-input w-full"
                    />
                </div>
                <div className="ws-field">
                    <label htmlFor="registry-status">สถานะ</label>
                    <select
                        id="registry-status"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="ws-input w-full"
                    >
                        <option value="__all">ทุกสถานะ</option>
                        <option value="__urgent">กรณีจำเป็นเร่งด่วน</option>
                        <option value="__normal">กรณีปกติ</option>
                        <option value="__rejected">เลขาธิการ ป.ป.ท. ไม่อนุมัติ</option>
                        <option value="รอตรวจคำร้อง">รอตรวจคำร้อง</option>
                        <option value="supervisor_review">รอกลั่นกรอง (ผบช.ต้น)</option>
                        <option value="director_review">รอ ผอ.พิจารณา</option>
                        <option value="deputy_review">รอรองเลขาธิการฯ กลั่นกรอง</option>
                        <option value="external_pending">รอผลกิจกรรมที่ 7</option>
                        <option value="protection">กำลังคุ้มครอง</option>
                    </select>
                </div>
            </FilterCard>

            {/* Advanced Filter Component */}
            <div className="mb-4">
                <AdvancedFilter
                    onSearch={(crit) => setAdvancedCriteria(crit)}
                    onReset={() => setAdvancedCriteria({})}
                />
            </div>

            {/* WIT0833 — แจ้งให้ผู้ใช้นอกขอบเขตทราบว่าถูกปิดกั้นตามมาตรการ ไม่ปล่อยให้เข้าใจว่าไม่มีข้อมูล */}
            {searchBlockedCases.length > 0 && (
                <div
                    data-testid="registry-search-blocked"
                    className="ws-callout mb-4 text-sm font-semibold"
                >
                    <i className="fa-solid fa-lock mr-1.5" />
                    {privacyBlockedMessage('search')} · ความพยายามค้นหาถูกบันทึกลง Access Log ของแฟ้มแล้ว
                </div>
            )}

            {/* Case Table Card */}
            <div className="ws-card overflow-hidden">
                <div className="flex items-center justify-between flex-wrap gap-3 border-b border-line p-4 sm:px-6">
                    <div className="min-w-0">
                        <h2 className="text-[1.1rem] font-bold leading-snug text-navy">รายการคำร้องขอรับความคุ้มครองพยาน</h2>
                        <p className="text-[0.8rem] text-muted">พบทั้งหมด {filteredCases.length} รายการ</p>
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        size="md"
                    >
                        <i className="fa-solid fa-file-export text-muted" />
                        ส่งออก Excel
                    </Button>
                </div>

                <div className="ws-table-wrap">
                    <table className="ws-table">
                        <thead>
                            <tr>
                                <th>เลขคำร้อง</th>
                                <th>แบบ / ความเร่งด่วน</th>
                                <th>ผู้ขอรับการคุ้มครอง</th>
                                <th>ขั้นตอน / สถานะ</th>
                                <th>ผู้รับผิดชอบ / งานถัดไป</th>
                                <th className="text-right">การดำเนินการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedCases.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-muted">
                                        <i className="fa-solid fa-folder-open text-3xl mb-2 block" />
                                        ไม่พบรายการคำร้องที่ตรงตามเงื่อนไข
                                    </td>
                                </tr>
                            ) : (
                                paginatedCases.map((c) => (
                                    <tr
                                        key={c.no}
                                        className={`transition hover:bg-blue-50/40 ${c.urgent ? 'bg-rose-50/30' : c.activity7State === 'rejected' ? 'bg-amber-50/20' : ''
                                            }`}
                                    >
                                        {/* Case No & Date */}
                                        <td className="font-medium">
                                            <Link
                                                to="/dossier/$caseNo"
                                                params={{ caseNo: c.no }}
                                                className="font-bold text-blue-700 hover:underline"
                                            >
                                                {c.no}
                                            </Link>
                                            <div className="text-[0.8rem] text-muted mt-0.5">{formatThaiDate(c.createdAt)}</div>
                                        </td>

                                        {/* Form type & urgency */}
                                        <td>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <Badge variant="info">{c.form}</Badge>
                                                {c.urgent ? (
                                                    <Badge variant="danger" icon="fa-triangle-exclamation">
                                                        เร่งด่วน
                                                    </Badge>
                                                ) : (
                                                    <span className="text-[0.8rem] text-muted">กรณีปกติ</span>
                                                )}
                                                {c.returned && (
                                                    <Badge variant="danger" icon="fa-rotate-left">
                                                        ส่งกลับแก้ไข
                                                    </Badge>
                                                )}
                                            </div>
                                        </td>

                                        {/* Person / Source */}
                                        <td>
                                            <strong className="block text-ink font-semibold">{c.person}</strong>
                                            <span className="text-[0.8rem] text-muted flex items-center gap-1 mt-0.5">
                                                <i className="fa-solid fa-mobile-screen text-xs text-muted" />
                                                {c.source || 'เจ้าหน้าที่บันทึกรับเรื่อง'}
                                            </span>
                                        </td>

                                        {/* Status & Risk */}
                                        <td>
                                            <div className="space-y-1">
                                                <Badge
                                                    variant={
                                                        c.activity7State === 'approved'
                                                            ? 'success'
                                                            : c.activity7State === 'rejected' || c.returned
                                                                ? 'danger'
                                                                : 'default'
                                                    }
                                                >
                                                    {c.status}
                                                </Badge>
                                                <div className="text-[0.8rem] text-muted">
                                                    ความเสี่ยง: <span className="font-semibold text-blue-700">{c.risk}</span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Owner & Next work */}
                                        <td>
                                            <strong className="block text-ink">{c.owner}</strong>
                                            <small className="block text-[0.8rem] text-muted">{c.next}</small>
                                        </td>

                                        {/* Action button */}
                                        <td className="text-right">
                                            <Link
                                                to="/dossier/$caseNo"
                                                params={{ caseNo: c.no }}
                                                className="inline-flex min-h-[38px] items-center whitespace-nowrap gap-1.5 rounded-lg border border-[#9aabba] bg-white px-3 py-1.5 text-[0.85rem] font-semibold text-navy hover:bg-slate-50 transition"
                                            >
                                                <i className="fa-solid fa-folder-open text-xs" />
                                                เปิดแฟ้ม
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between border-t border-line px-4 py-3 bg-soft">
                    <span className="text-[0.8rem] text-muted">
                        แสดง {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredCases.length)} จาก{' '}
                        {filteredCases.length} รายการ
                    </span>

                    <div className="flex items-center gap-1">
                        <Button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(currentPage - 1)}
                            aria-label="หน้าก่อนหน้า"
                            variant="secondary"
                            size="icon"
                            className="disabled:opacity-40"
                        >
                            <i className="fa-solid fa-chevron-left" />
                        </Button>
                        <span className="px-3 text-[0.8rem] font-semibold text-ink">
                            {currentPage} / {totalPages}
                        </span>
                        <Button
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(currentPage + 1)}
                            aria-label="หน้าถัดไป"
                            variant="secondary"
                            size="icon"
                            className="disabled:opacity-40"
                        >
                            <i className="fa-solid fa-chevron-right" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
