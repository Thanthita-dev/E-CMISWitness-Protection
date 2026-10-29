import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '../common/Button'
import { RoleSwitchPicker } from '../common/RoleSwitchPicker'

interface RoleSwitchModalProps {
    isOpen: boolean
    onClose: () => void
}

/** หน้าต่างสลับบทบาทจากปุ่มบน topbar — เลือกบัญชีแล้วสลับทันที ปิดหน้าต่าง และไป "งานของฉัน" ของบทบาทใหม่ */
export const RoleSwitchModal: React.FC<RoleSwitchModalProps> = ({ isOpen, onClose }) => {
    const navigate = useNavigate()

    useEffect(() => {
        if (!isOpen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    if (!isOpen) return null

    // portal ไป body — ปุ่มเปิดอยู่ใน topbar (sticky z-20) ถ้าวางในนั้น sidebar (z-30) จะทับหน้าต่าง
    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(4,17,36,0.52)] p-4 pt-[min(4rem,6vh)]"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="role-switch-modal-title"
                className="ws-card flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden"
                data-testid="role-switch-modal"
            >
                <div className="flex items-start justify-between gap-3 border-b border-line bg-[#f6f8fa] px-5 py-3.5">
                    <div className="min-w-0">
                        <h2 id="role-switch-modal-title" className="flex items-center gap-2 text-[1.05rem] font-bold text-navy">
                            <i className="fa-solid fa-people-arrows" aria-hidden="true" />
                            สลับบทบาท
                        </h2>
                        <p className="text-[.8rem] text-muted">เลือกบัญชีเพื่อสลับบทบาทการทำงานทันที โดยไม่ต้องออกจากระบบ</p>
                    </div>
                    <Button onClick={onClose} variant="icon" size="icon" aria-label="ปิด" data-testid="role-switch-modal-close">
                        <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
                    </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                    <RoleSwitchPicker
                        testIdPrefix="role-switch-modal"
                        persistKey="ecmis-wp-role-switch-filters"
                        autoFocus
                        onSwitched={(account) => {
                            onClose()
                            navigate({ to: '/queue/$role', params: { role: account.role } })
                        }}
                    />
                </div>
            </div>
        </div>,
        document.body
    )
}
