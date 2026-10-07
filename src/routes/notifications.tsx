import { Button } from "../components/common/Button"
import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { Badge } from '../components/common/Badge'
import { filterNotificationsForUser, useNotificationStore } from '../store/useNotificationStore'
import { useAuthStore } from '../store/useAuthStore'

export const Route = createFileRoute('/notifications')({
    component: NotificationsPage,
})

function NotificationsPage() {
    const { notifications, markAsRead, markAllAsRead } = useNotificationStore()
    const { currentRole, currentOfficerUserId, currentDirectorUserId, getCurrentUserAccount } = useAuthStore()

    /** เห็นเฉพาะการแจ้งเตือนที่ส่งถึงตนเอง — งานที่ ผอ. มอบหมายให้คนอื่นไม่โผล่ในกล่องของเรา (WIT0306) */
    const visibleNotifications = React.useMemo(
        () => filterNotificationsForUser(notifications, [getCurrentUserAccount()?.id], currentRole),
        [notifications, currentOfficerUserId, currentDirectorUserId, currentRole]
    )

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow="งานคุ้มครองพยาน · การแจ้งเตือน"
                title="การแจ้งเตือนและรายการแจ้งเตือนด่วน"
                description="แจ้งเตือนการมอบหมายงาน คำร้องเร่งด่วน คำสั่งอนุมัติ และรายการที่ต้องดำเนินการตามกำหนดเวลา"
                actions={
                    <Button
                        type="button"
                        onClick={markAllAsRead}
                        variant="secondary"
                        size="md"
                    >
                        <i className="fa-solid fa-check-double" />
                        ทำเครื่องหมายอ่านทั้งหมด
                    </Button>
                }
            />

            <div className="space-y-3">
                {visibleNotifications.length === 0 ? (
                    <div className="ws-card p-12 text-center text-muted" role="status">
                        <i className="fa-solid fa-bell-slash text-3xl mb-2 block" />
                        ไม่มีรายการแจ้งเตือนในขณะนี้
                    </div>
                ) : (
                    visibleNotifications.map((n) => (
                        <div
                            key={n.id}
                            onClick={() => markAsRead(n.id)}
                            className={`flex items-start justify-between gap-3 rounded-xl border p-4 transition cursor-pointer ${n.read ? 'border-line bg-white text-muted' : 'border-blue/40 bg-blue-soft text-navy-deep'
                                }`}
                        >
                            <div className="flex min-w-0 items-start gap-3.5">
                                <div
                                    className={`flex h-10 w-10 items-center justify-center rounded-xl font-bold flex-shrink-0 ${n.urgency === 'ด่วนที่สุด'
                                        ? 'bg-danger-soft text-danger-dark'
                                        : n.urgency === 'ด่วน'
                                            ? 'bg-warning-soft text-warning'
                                            : 'bg-blue-soft text-blue'
                                        }`}
                                >
                                    <i className={`fa-solid ${n.urgency === 'ด่วนที่สุด' ? 'fa-triangle-exclamation' : 'fa-bell'}`} />
                                </div>

                                <div className="min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <strong className="text-[1rem] font-bold text-navy-deep">{n.type}</strong>
                                        <Badge variant="neutral">แฟ้ม: {n.caseNo}</Badge>
                                        {!n.read && (
                                            <span className="h-2 w-2 rounded-full bg-rose-600" role="img" aria-label="ยังไม่ได้อ่าน" />
                                        )}
                                    </div>
                                    <p className="text-[0.88rem] leading-relaxed">{n.message}</p>
                                    <small className="block text-[0.8rem] text-muted">
                                        {n.timestamp} | ผู้รับ: {n.toName}
                                    </small>
                                </div>
                            </div>

                            <Link
                                to="/dossier/$caseNo"
                                params={{ caseNo: n.caseNo }}
                                className="flex min-h-[44px] flex-shrink-0 items-center gap-1 rounded-lg border border-[#9aabba] bg-white px-4 py-2.5 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
                            >
                                เปิดแฟ้ม
                            </Link>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
