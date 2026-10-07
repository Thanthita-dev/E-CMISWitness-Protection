import React from 'react'
import { Button } from '../common/Button'
import { MySwal } from '../../lib/swal'
import { ROLE_NAMES } from '../../lib/constants'
import { cn } from '../../lib/utils'
import { StepStatus, mockStateRole, playFromCheckpoint } from '../../lib/flowGuide'
import type { UserRole } from '../../types/user'

/** ส่วนที่หน้า /flow-guide และ /flow-chart ใช้ร่วมกัน: ป้ายสถานะ และปุ่มเล่นจาก mock state */

export const STATUS_META: Record<StepStatus, { label: string; className: string }> = {
    yes: { label: 'ทำได้ใน UI', className: 'bg-success-soft text-success-dark border-success/30' },
    partial: { label: 'ทำได้บางส่วน', className: 'bg-warning-soft text-warning border-gold/40' },
    no: { label: 'ยังไม่มีใน prototype', className: 'bg-danger-soft text-danger-dark border-danger/30' },
    system: { label: 'ระบบ / นอกระบบ', className: 'bg-soft text-muted border-line' },
}

export const roleName = (role: UserRole | null) => (role ? ROLE_NAMES[role] ?? role : null)

/** ยืนยันก่อนล้าง localStorage แล้วเปิดหน้าเป้าหมายในแท็บใหม่ */
export function confirmPlay(mockState: string, role: UserRole | null, route: string | null) {
    const savedRole = mockStateRole(mockState)
    MySwal.fire({
        icon: 'question',
        title: `เล่นจาก "${mockState}"?`,
        html: (
            <div className="space-y-2 text-left text-[0.88rem] leading-relaxed text-ink">
                <p>
                    ข้อมูลจำลองปัจจุบัน (ecmis-*) จะถูก<strong>ล้างและแทนที่</strong>ด้วย state นี้ แล้วเปิดหน้าใหม่อีกแท็บ
                    หน้าคู่มือนี้ยังเปิดค้างไว้ให้ดูประกอบ
                </p>
                {role && (
                    <p>
                        บทบาทที่ใช้: <strong>{roleName(role)}</strong>
                        {savedRole && savedRole !== role && <> (state นี้บันทึกไว้ในบทบาท {roleName(savedRole)})</>}
                    </p>
                )}
                {route && (
                    <p>
                        หน้า: <code className="rounded bg-slate-100 px-1">{route}</code>
                    </p>
                )}
            </div>
        ),
        showCancelButton: true,
        confirmButtonText: 'เริ่มเล่น',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true,
        confirmButtonColor: '#082b50',
        cancelButtonColor: '#506276',
        customClass: { popup: 'font-sans !rounded-xl shadow-card' },
    }).then((result) => {
        if (result.isConfirmed) playFromCheckpoint(mockState, role, route)
    })
}

export const PlayButton: React.FC<{ mockState: string; role: UserRole | null; route: string | null; label?: string }> = ({
    mockState,
    role,
    route,
    label = 'เล่นจากจุดนี้',
}) => (
    <Button
        type="button"
        variant="primary"
        size="md"
        onClick={() => confirmPlay(mockState, role, route)}
    >
        <i className="fa-solid fa-play" />
        {label}
        <span className="font-normal opacity-80">· {mockState}</span>
    </Button>
)

export const StatusBadge: React.FC<{ status: StepStatus }> = ({ status }) => (
    <span className={cn('rounded-full border px-[0.58rem] py-[0.28rem] text-[0.74rem] font-semibold', STATUS_META[status].className)}>
        {STATUS_META[status].label}
    </span>
)
