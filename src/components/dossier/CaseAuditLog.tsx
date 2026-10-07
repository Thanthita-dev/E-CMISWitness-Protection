import React from 'react'
import { Button } from '../common/Button'
import { Badge } from '../common/Badge'
import { CaseItem } from '../../types/case'
import { useAuditStore } from '../../store/useAuditStore'
import { AUDIT_CATEGORY_LABELS, AuditCategory, buildAuditCsv, buildUnifiedAuditTimeline } from '../../lib/auditTrail'

interface CaseAuditLogProps {
    caseItem: CaseItem
    /** จำกัดจำนวนรายการล่าสุดที่แสดง — ไม่ระบุ = แสดงทั้งหมด */
    limit?: number
    /** พาดหัวการ์ด ปรับได้ตามที่วาง (แฟ้มคำร้อง / แฟ้มอุทธรณ์) */
    title?: string
    testId?: string
}

/**
 * TC-159 · Timeline & Audit Trail ของแฟ้ม — ผสาน assignmentHistory (การดำเนินการทุกขั้น: รับเรื่อง,
 * มอบหมาย, จัดทำ/แก้ไขเอกสาร, ลงนาม, ปิดงาน) กับ access log ของ useAuditStore (การเข้าถึงข้อมูลพยาน,
 * การส่งออก) ให้เป็นเส้นเวลาเดียวเรียงตามเวลาจริง อ่านอย่างเดียว — ไม่มีปุ่มลบ/แก้ไขรายการใดๆ
 * ใช้ร่วมกันทั้งแฟ้มคำร้อง (แท็บประวัติ) และแฟ้มอุทธรณ์ เพื่อไม่ให้มีรายการประวัติสองรูปแบบในระบบ
 */
export const CaseAuditLog: React.FC<CaseAuditLogProps> = ({
    caseItem,
    limit,
    title = 'ประวัติการดำเนินการ / Audit Log',
    testId = 'dossier-audit-log',
}) => {
    const history = caseItem.assignmentHistory || []
    const accessLogsAll = useAuditStore((s) => s.logs)
    const addLog = useAuditStore((s) => s.addLog)
    const [category, setCategory] = React.useState<AuditCategory | 'all'>('all')

    const accessLogs = React.useMemo(
        () => accessLogsAll.filter((l) => l.caseNo === caseItem.no),
        [accessLogsAll, caseItem.no]
    )

    const timeline = React.useMemo(
        () => buildUnifiedAuditTimeline(history, accessLogs),
        [history, accessLogs]
    )

    const filtered = React.useMemo(() => {
        const base = category === 'all' ? timeline : timeline.filter((e) => e.category === category)
        return limit ? base.slice(0, limit) : base
    }, [timeline, category, limit])

    const handleExportCsv = () => {
        const csv = buildAuditCsv(caseItem.no, timeline)
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `audit-log-${caseItem.no}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        /** การส่งออกเองก็ต้องถูกบันทึกลง Audit Log — ต่อท้ายเท่านั้น ไม่แก้ไขของเดิม */
        addLog({
            caseNo: caseItem.no,
            actorName: 'ผู้ใช้งานปัจจุบัน',
            actorRole: '-',
            action: 'ส่งออก Audit Log',
            docRef: caseItem.no,
        })
    }

    return (
        <section
            data-testid={testId}
            className="ws-card p-5 space-y-4"
        >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 font-bold">
                        <i className="fa-solid fa-clock-rotate-left text-sm" />
                    </div>
                    <div>
                        <h2 className="text-[1.1rem] font-bold leading-snug text-navy">{title}</h2>
                        <p className="text-[0.8rem] text-muted">
                            Timeline &amp; Audit Trail · ทุกเหตุการณ์ในแฟ้มถูกบันทึกพร้อมผู้กระทำและวันเวลา แบบอ่านอย่างเดียว — เรียงจากรายการล่าสุด
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        aria-label="กรองตามหมวดหมู่เหตุการณ์"
                        data-testid={`${testId}-category-filter`}
                        value={category}
                        onChange={(e) => setCategory(e.target.value as AuditCategory | 'all')}
                        className="ws-input"
                    >
                        <option value="all">ทุกหมวดหมู่</option>
                        {(Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[]).map((c) => (
                            <option key={c} value={c}>
                                {AUDIT_CATEGORY_LABELS[c]}
                            </option>
                        ))}
                    </select>
                    <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        data-testid={`${testId}-export-csv`}
                        onClick={handleExportCsv}
                        title="ส่งออก Audit Log ทั้งแฟ้มเป็นไฟล์ CSV (UTF-8 BOM)"
                    >
                        <i className="fa-solid fa-file-export text-[0.8rem]" />
                        Export CSV
                    </Button>
                    <Badge variant="neutral">
                        {timeline.length} รายการ
                    </Badge>
                </div>
            </div>

            {filtered.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-center text-[0.8rem] text-muted">
                    ไม่มีเหตุการณ์ในหมวดหมู่ที่เลือก
                </p>
            ) : (
                <ol data-testid={`${testId}-list`} className="space-y-2.5">
                    {filtered.map((entry) => (
                        <li
                            key={entry.key}
                            data-testid={entry.source === 'access' ? `${testId}-access-entry` : `${testId}-entry`}
                            data-category={entry.category}
                            className="rounded-lg border border-line border-l-4 border-l-blue bg-white p-3"
                        >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.8rem] font-semibold text-slate-600">
                                        {AUDIT_CATEGORY_LABELS[entry.category]}
                                    </span>
                                    <strong className="text-[0.8rem] font-semibold text-navy">{entry.action}</strong>
                                </div>
                                <span className="text-[0.8rem] text-muted">{entry.timestamp}</span>
                            </div>
                            <p className="mt-1 text-[0.88rem] text-slate-700 leading-relaxed whitespace-pre-line">{entry.detail}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.8rem] font-semibold text-muted">
                                <span>
                                    <i className="fa-solid fa-user-pen text-[0.74rem] mr-1" />
                                    ผู้กระทำ: {entry.actor}
                                    {entry.role ? ` (${entry.role})` : ''}
                                </span>
                                {entry.ipAddress && (
                                    <span className="font-normal text-muted">
                                        <i className="fa-solid fa-network-wired mr-1" />
                                        {entry.ipAddress}
                                    </span>
                                )}
                                {entry.device && (
                                    <span className="truncate max-w-[220px] font-normal text-muted" title={entry.device}>
                                        <i className="fa-solid fa-desktop mr-1" />
                                        {entry.device}
                                    </span>
                                )}
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    )
}
