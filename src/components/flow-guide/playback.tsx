import React from 'react'
import { Button } from '../common/Button'
import { MySwal } from '../../lib/swal'
import { ROLE_NAMES } from '../../lib/constants'
import { cn } from '../../lib/utils'
import { StepStatus, mockStateRole, playFromCheckpoint } from '../../lib/flowGuide'
import { FlowSnapshot, playSnapshot, snapshotFor } from '../../lib/flowSnapshots'
import type { UserRole } from '../../types/user'

/** ส่วนที่หน้า /flow-guide และ /flow-chart ใช้ร่วมกัน: ป้ายสถานะ และปุ่มเล่นจาก mock state */

export const STATUS_META: Record<StepStatus, { label: string; className: string }> = {
    yes: { label: 'ทำได้ใน UI', className: 'bg-success-soft text-success-dark border-success/30' },
    partial: { label: 'ทำได้บางส่วน', className: 'bg-warning-soft text-warning border-gold/40' },
    no: { label: 'ยังไม่มีใน prototype', className: 'bg-danger-soft text-danger-dark border-danger/30' },
    system: { label: 'ระบบ / นอกระบบ', className: 'bg-soft text-muted border-line' },
}

export const roleName = (role: UserRole | null) => (role ? ROLE_NAMES[role] ?? role : null)

interface PlayDialog {
    title: string
    role: UserRole | null
    savedRole?: UserRole | null
    route: string | null
    onConfirm: () => void
}

/** กล่องยืนยันก่อนล้าง localStorage แล้วเปิดหน้าเป้าหมายในแท็บใหม่ (ใช้ร่วมกันทั้ง mock state และ snapshot) */
function confirmDialog({ title, role, savedRole, route, onConfirm }: PlayDialog) {
    MySwal.fire({
        icon: 'question',
        title,
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
        if (result.isConfirmed) onConfirm()
    })
}

/** ยืนยันก่อนล้าง localStorage แล้วเปิดหน้าเป้าหมายในแท็บใหม่ */
export function confirmPlay(mockState: string, role: UserRole | null, route: string | null) {
    confirmDialog({
        title: `เล่นจาก "${mockState}"?`,
        role,
        savedRole: mockStateRole(mockState),
        route,
        onConfirm: () => playFromCheckpoint(mockState, role, route),
    })
}

/** ยืนยันแล้วเล่นจาก snapshot ของกล่อง/เส้น (key ดู lib/flowSnapshots) */
export function confirmPlaySnapshot(key: string) {
    const snap = snapshotFor(key)
    if (!snap) return
    confirmDialog({
        title: `เล่นจาก "${snap.label}"?`,
        role: snap.role,
        route: snap.route,
        onConfirm: () =>
            playSnapshot(key).catch((error) => {
                MySwal.fire({ icon: 'error', title: 'เปิด snapshot ไม่สำเร็จ', text: error instanceof Error ? error.message : String(error) })
            }),
    })
}

/** ปุ่มเล่นจาก snapshot ของกล่อง/เส้น — ไม่แสดงถ้า key นี้ยังไม่มี snapshot */
export const SnapshotPlayButton: React.FC<{ snapshotKey: string; label?: string }> = ({ snapshotKey, label = 'เล่นจากจุดนี้' }) => {
    const snap = snapshotFor(snapshotKey)
    if (!snap) return null
    return (
        <Button type="button" variant="primary" size="md" onClick={() => confirmPlaySnapshot(snapshotKey)} title={snap.label}>
            <i className="fa-solid fa-play" />
            {label}
            <span className="max-w-[16rem] truncate font-normal opacity-80">· {snap.label}</span>
        </Button>
    )
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

/** เครื่องหมายเล่นเล็ก ๆ บอกว่ากล่อง/เส้นนี้มี snapshot ให้เล่นจากจุดนี้ */
export const PlayMark: React.FC<{ className?: string }> = ({ className }) => (
    <span
        className={cn('pointer-events-none flex h-4 w-4 items-center justify-center rounded-full bg-success text-[7px] text-white shadow', className)}
        title="มี snapshot ให้เล่นจากจุดนี้"
    >
        <i className="fa-solid fa-play ml-px" />
    </span>
)

/** รายละเอียด snapshot ของเส้น: สถานะขณะเดินเส้น บทบาท และหน้า (ใช้ในแผงเส้นของ /flow-chart) */
export const SnapshotInfo: React.FC<{ snap: FlowSnapshot }> = ({ snap }) => (
    <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
        <dt className="font-semibold text-muted">ขณะเดินเส้นนี้</dt>
        <dd className="leading-relaxed text-ink">{snap.label}</dd>
        {snap.role && (
            <>
                <dt className="font-semibold text-muted">บทบาทใน prototype</dt>
                <dd className="font-semibold text-ink">{roleName(snap.role)}</dd>
            </>
        )}
        <dt className="font-semibold text-muted">หน้า</dt>
        <dd>
            <code className="break-all rounded bg-soft px-1 text-ink">{snap.route}</code>
        </dd>
    </dl>
)
