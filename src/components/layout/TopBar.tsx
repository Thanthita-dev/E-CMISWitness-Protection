import { Button } from "../common/Button"
import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '../../store/useAuthStore'
import { filterNotificationsForUser, useNotificationStore } from '../../store/useNotificationStore'
import { ECMIS_USER_DIRECTORY, ORG_UNITS } from '../../lib/constants'
import { showToast } from '../../lib/swal'
import { UserRole } from '../../types/user'
import { FontSizeControls } from '../common/FontSizeControls'

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
    { value: 'got_receiver', label: 'ธุรการคดี กอท.' },
    { value: 'got_director', label: 'ผอ. กอท.' },
    { value: 'got_officer', label: 'ผู้รับผิดชอบคุ้มครอง กอท.' },
    { value: 'receiver', label: 'ธุรการสำนัก/กอง' },
    { value: 'officer', label: 'เจ้าหน้าที่ ป.ป.ท.' },
    { value: 'case_owner', label: 'เจ้าของสำนวน' },
    { value: 'supervisor', label: 'ผู้บังคับบัญชาชั้นต้น' },
    { value: 'director', label: 'ผอ.สำนัก/กอง' },
    { value: 'deputy_secretary', label: 'รองเลขาธิการ ป.ป.ท.' },
    { value: 'secretary', label: 'เลขาธิการ ป.ป.ท.' },
    { value: 'committee', label: 'ฝ่ายเลขานุการคณะกรรมการ ป.ป.ท.' },
    { value: 'protection', label: 'ชุดคุ้มครอง' },
    { value: 'appeal', label: 'เจ้าหน้าที่อุทธรณ์' },
    { value: 'admin', label: 'Super Admin' },
]

interface TopBarProps {
    /** เมนู off-canvas (<= 900px) เปิดอยู่หรือไม่ และตัวสลับ — AppLayout เป็นเจ้าของ state */
    mobileNavOpen?: boolean
    onMobileNavToggle?: () => void
}

export const TopBar: React.FC<TopBarProps> = ({ mobileNavOpen = false, onMobileNavToggle }) => {
    const {
        currentRole,
        currentOfficerUserId,
        currentDirectorUserId,
        currentOrgUnitId,
        setRole,
        setOfficerUserId,
        setOrgUnitId,
        toggleSidebar,
        setGlobalSearchOpen,
        getOrgUnitsForRole,
        getCurrentUserAccount,
    } = useAuthStore()

    const navigate = useNavigate()
    const notifications = useNotificationStore((state) => state.notifications)
    /** ตัวเลขบนกระดิ่งต้องนับเฉพาะรายการที่ส่งถึงผู้ใช้คนนี้ ให้ตรงกับที่เห็นจริงในหน้า /notifications */
    const unreadCount = React.useMemo(
        () =>
            filterNotificationsForUser(
                notifications,
                [getCurrentUserAccount()?.id],
                currentRole
            ).filter((n) => !n.read).length,
        [notifications, currentOfficerUserId, currentDirectorUserId, currentRole]
    )
    const [isOnline, setIsOnline] = useState(navigator.onLine)

    useEffect(() => {
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    const availableOrgUnits = getOrgUnitsForRole()
    const officerList = ECMIS_USER_DIRECTORY.filter((u) => u.active && (currentRole === 'got_officer' ? u.roles.includes('got_officer') : u.roles.includes('officer') || u.roles.includes('case_owner')))

    const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newRole = e.target.value as UserRole
        setRole(newRole)
        showToast(`เปลี่ยนบทบาทเป็น: ${e.target.selectedOptions[0].text}`)
    }

    const handleOfficerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setOfficerUserId(e.target.value)
        showToast(`สลับบัญชีผู้ปฏิบัติงาน: ${e.target.selectedOptions[0].text}`)
    }

    const handleOrgUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setOrgUnitId(e.target.value)
        showToast(`เปลี่ยนหน่วยงาน: ${e.target.selectedOptions[0].text}`)
    }

    const selectedOrgUnitName = availableOrgUnits.find((unit) => unit.id === currentOrgUnitId)?.name ?? ''
    const selectedOfficer = officerList.find((off) => off.id === currentOfficerUserId)
    const selectedOfficerLabel = selectedOfficer ? `${selectedOfficer.name} (${selectedOfficer.unit})` : ''
    const selectedRoleLabel = ROLE_OPTIONS.find((role) => role.value === currentRole)?.label ?? ''
    const showOfficerSelect = currentRole === 'officer' || currentRole === 'case_owner' || currentRole === 'got_officer'

    return (
        <header className="sticky top-0 z-20 flex min-h-16 min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b-[3px] border-gold bg-[linear-gradient(135deg,#061d35,#0f416f)] px-3 py-[0.6rem] text-white shadow-[0_5px_20px_rgba(7,28,50,0.18)] min-[721px]:px-6 xl:flex-nowrap">
            {/* Left: Sidebar Toggle & Search */}
            <div className="order-1 flex min-w-0 flex-1 items-center gap-3 xl:min-w-[15rem]">
                {/* desktop: ย่อ/ขยายเมนู */}
                <Button
                    onClick={toggleSidebar}
                    className="ws-topbar-icon max-[900px]:hidden"
                    aria-label="ย่อหรือขยายเมนู"
                >
                    <i className="fa-solid fa-bars text-base" />
                </Button>
                {/* <= 900px: เปิด/ปิดเมนู off-canvas */}
                <Button
                    onClick={onMobileNavToggle}
                    className="ws-topbar-icon hidden max-[900px]:flex"
                    aria-label="เปิดหรือปิดเมนู"
                    aria-expanded={mobileNavOpen}
                    aria-controls="app-sidebar"
                >
                    <i className="fa-solid fa-bars text-base" />
                </Button>

                <Button
                    onClick={() => setGlobalSearchOpen(true)}
                    className="ws-topbar-search hidden w-full min-w-[9rem] max-w-[24rem] flex-1 md:flex"
                    aria-label="ค้นหา"
                >
                    <i className="fa-solid fa-magnifying-glass text-muted" />
                    <span className="truncate">ค้นหาเลขคำร้อง ผู้ร้อง สำนวนคดี...</span>
                    <kbd className="ml-auto shrink-0 rounded border border-line bg-soft px-1.5 py-0.5 text-xs text-muted">Ctrl K</kbd>
                </Button>
                {/* < md: ปุ่มค้นหาแบบไอคอน (เปิด modal เดียวกัน) */}
                <Button
                    onClick={() => setGlobalSearchOpen(true)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-navy md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                    aria-label="ค้นหา"
                >
                    <i className="fa-solid fa-magnifying-glass" />
                </Button>
            </div>

            {/* Context: หน่วยงาน / ผู้ปฏิบัติงานจำลอง / สิทธิ์ — < 1280px ขึ้นบรรทัดที่สอง */}
            <div className="ws-topbar-context order-3 basis-full xl:order-2 xl:basis-auto">
                <div className="ws-topbar-field hidden w-[11rem] lg:block" title={selectedOrgUnitName}>
                    <label htmlFor="topbar-org-unit-select">หน่วยงาน</label>
                    <select
                        id="topbar-org-unit-select"
                        value={currentOrgUnitId || ''}
                        onChange={handleOrgUnitChange}
                        aria-label="เลือกหน่วยงาน"
                    >
                        {availableOrgUnits.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                                {unit.name}
                            </option>
                        ))}
                    </select>
                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                </div>

                {/* Officer Account Simulator (when officer) */}
                {showOfficerSelect && (
                    <div className={currentRole === 'got_officer' ? 'ws-topbar-field w-[12rem] max-md:w-auto max-md:flex-1' : 'ws-topbar-field hidden w-[12rem] md:block'} title={selectedOfficerLabel}>
                        <label htmlFor="topbar-officer-select">ผู้ปฏิบัติงาน</label>
                        <select
                            id="topbar-officer-select"
                            value={currentOfficerUserId}
                            onChange={handleOfficerChange}
                            aria-label="เลือกบัญชีเจ้าหน้าที่จำลอง"
                        >
                            {officerList.map((off) => (
                                <option key={off.id} value={off.id}>
                                    {off.name} ({off.unit})
                                </option>
                            ))}
                        </select>
                        <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                    </div>
                )}

                {/* Role Selector */}
                <div className="ws-topbar-field w-[11rem] max-md:w-auto max-md:flex-1" title={selectedRoleLabel}>
                    <label htmlFor="topbar-role-select">สิทธิ์การทำงาน</label>
                    <select
                        id="topbar-role-select"
                        value={currentRole}
                        onChange={handleRoleChange}
                        aria-label="เลือกบทบาทผู้ใช้งาน"
                    >
                        {ROLE_OPTIONS.map((role) => (
                            <option key={role.value} value={role.value}>
                                {role.label}
                            </option>
                        ))}
                    </select>
                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                </div>
            </div>

            {/* Utilities: สถานะออฟไลน์ / ขนาดตัวอักษร / แจ้งเตือน */}
            <div className="order-2 flex shrink-0 items-center gap-2 xl:order-3">
                {/* Field Mode status — แสดงเฉพาะเมื่อขาดการเชื่อมต่อ */}
                {!isOnline && (
                    <div
                        role="status"
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#f9e1df] px-[0.58rem] py-[0.28rem] text-[0.74rem] font-semibold text-[#8c261f]"
                    >
                        <span className="h-2 w-2 rounded-full bg-danger" aria-hidden="true" />
                        ออฟไลน์
                    </div>
                )}

                {/* ปรับขนาดตัวอักษร A−/A/A+ (ใช้ค่าร่วมกับ ก4/ก5) */}
                <FontSizeControls />

                {/* Notifications Icon */}
                <Link
                    to="/notifications"
                    className="ws-topbar-icon relative border border-white/25"
                    aria-label="การแจ้งเตือน"
                >
                    <i className="fa-solid fa-bell text-sm" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-white ring-2 ring-[#0b2f55]">
                            {unreadCount}
                        </span>
                    )}
                </Link>
            </div>
        </header>
    )
}
