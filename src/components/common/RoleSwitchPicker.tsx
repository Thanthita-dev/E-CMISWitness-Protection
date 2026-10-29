import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from './Button'
import { useAuthStore } from '../../store/useAuthStore'
import { LOGIN_ACCOUNT_GROUPS, type LoginAccount } from '../../lib/loginAccounts'
import { ROLE_NAMES } from '../../lib/constants'
import { showToast } from '../../lib/swal'
import type { UserRole } from '../../types/user'

/** ป้ายชื่อบทบาทในตัวกรอง — ROLE_NAMES ของ appeal เป็นชื่อบุคคล จึงใช้ชื่อตำแหน่งแทน */
const ROLE_FILTER_LABELS: Partial<Record<UserRole, string>> = { appeal: 'เจ้าหน้าที่อุทธรณ์' }

/** บทบาทที่ไม่ซ้ำ เรียงตามลำดับที่พบในบัญชีทดลอง */
const ROLE_FILTER_OPTIONS: { value: UserRole; label: string }[] = Array.from(
    new Set(LOGIN_ACCOUNT_GROUPS.flatMap((group) => group.accounts.map((account) => account.role)))
).map((role) => ({ value: role, label: ROLE_FILTER_LABELS[role] ?? ROLE_NAMES[role] }))

interface RoleSwitchFilters {
    query: string
    group: string
    role: UserRole | ''
}

const EMPTY_FILTERS: RoleSwitchFilters = { query: '', group: '', role: '' }

const readFilters = (key?: string): RoleSwitchFilters => {
    if (!key) return EMPTY_FILTERS
    try {
        const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
        return saved ? { ...EMPTY_FILTERS, ...saved } : EMPTY_FILTERS
    } catch {
        return EMPTY_FILTERS
    }
}

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, '')

const matchesQuery = (account: LoginAccount, query: string) => {
    const needle = normalize(query)
    if (!needle) return true
    return [account.name, account.position, account.username, ROLE_NAMES[account.role], ROLE_FILTER_LABELS[account.role] ?? '']
        .some((text) => normalize(text).includes(needle))
}

interface RoleSwitchPickerProps {
    /** prefix ของ data-testid ปุ่มบัญชี — หน้า /role ใช้ "role-switch" ส่วนหน้าต่างใช้ชื่ออื่นเพื่อไม่ซ้ำกัน */
    testIdPrefix?: string
    /** key ใน localStorage สำหรับจำค่าตัวกรองล่าสุด — ไม่ระบุ = ไม่จำ */
    persistKey?: string
    /** โฟกัสช่องค้นหาเมื่อแสดงผล (ใช้ในหน้าต่าง) */
    autoFocus?: boolean
    /** เรียกหลังสลับบัญชีสำเร็จ */
    onSwitched?: (account: LoginAccount) => void
}

/** ตัวกรอง + รายการบัญชีทดลองแยกตามหน่วยงาน ใช้ร่วมกันระหว่างหน้า /role และหน้าต่างสลับบทบาทบน topbar */
export const RoleSwitchPicker: React.FC<RoleSwitchPickerProps> = ({
    testIdPrefix = 'role-switch',
    persistKey,
    autoFocus = false,
    onSwitched,
}) => {
    const login = useAuthStore((s) => s.login)
    const rememberLogin = useAuthStore((s) => s.rememberLogin)
    const loginUsername = useAuthStore((s) => s.loginUsername)
    const currentRole = useAuthStore((s) => s.currentRole)
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

    const [filters, setFilters] = useState<RoleSwitchFilters>(() => readFilters(persistKey))
    const searchRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!persistKey) return
        try {
            localStorage.setItem(persistKey, JSON.stringify(filters))
        } catch {
            // เบราว์เซอร์ไม่ให้เขียน storage — ใช้ค่าในหน้าจอต่อได้ตามปกติ
        }
    }, [filters, persistKey])

    // เปิดมาแล้วเลื่อนให้เห็นบัญชีปัจจุบัน (ถ้าอยู่ในผลกรอง)
    useEffect(() => {
        if (autoFocus) searchRef.current?.focus()
        listRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest' })
    }, [autoFocus])

    // ยังไม่ล็อกอิน (เปิด /role ตรง ๆ) → ไม่มีบัญชีปัจจุบัน ทุกใบกดเพื่อเข้าสู่ระบบได้
    const isCurrent = (account: LoginAccount) =>
        isAuthenticated && (loginUsername ? loginUsername === account.username : currentRole === account.role)

    const handleSwitch = (account: LoginAccount) => {
        if (isCurrent(account)) return
        login(account, { remember: rememberLogin })
        showToast(`${isAuthenticated ? 'สลับบทบาทเป็น' : 'เข้าสู่ระบบเป็น'} ${ROLE_NAMES[account.role]} (${account.name})`)
        onSwitched?.(account)
    }

    const visibleGroups = useMemo(
        () =>
            LOGIN_ACCOUNT_GROUPS.filter((group) => !filters.group || group.label === filters.group)
                .map((group) => ({
                    ...group,
                    accounts: group.accounts.filter(
                        (account) => (!filters.role || account.role === filters.role) && matchesQuery(account, filters.query)
                    ),
                }))
                .filter((group) => group.accounts.length > 0),
        [filters]
    )
    const resultCount = visibleGroups.reduce((sum, group) => sum + group.accounts.length, 0)
    const hasFilters = Boolean(filters.query || filters.group || filters.role)
    const setFilter = <K extends keyof RoleSwitchFilters>(key: K, value: RoleSwitchFilters[K]) =>
        setFilters((prev) => ({ ...prev, [key]: value }))

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="ws-field min-w-0">
                    <label htmlFor={`${testIdPrefix}-query`}>ค้นหา</label>
                    <input
                        id={`${testIdPrefix}-query`}
                        ref={searchRef}
                        type="search"
                        className="ws-input"
                        value={filters.query}
                        onChange={(e) => setFilter('query', e.target.value)}
                        placeholder="ชื่อ ตำแหน่ง บทบาท หรือชื่อผู้ใช้"
                        data-testid={`${testIdPrefix}-filter-query`}
                    />
                </div>
                <div className="ws-field min-w-0">
                    <label htmlFor={`${testIdPrefix}-group`}>หน่วยงาน</label>
                    <select
                        id={`${testIdPrefix}-group`}
                        className="ws-input"
                        value={filters.group}
                        onChange={(e) => setFilter('group', e.target.value)}
                        data-testid={`${testIdPrefix}-filter-group`}
                    >
                        <option value="">ทุกหน่วยงาน</option>
                        {LOGIN_ACCOUNT_GROUPS.map((group) => (
                            <option key={group.label} value={group.label}>
                                {group.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="ws-field min-w-0">
                    <label htmlFor={`${testIdPrefix}-role`}>บทบาท</label>
                    <select
                        id={`${testIdPrefix}-role`}
                        className="ws-input"
                        value={filters.role}
                        onChange={(e) => setFilter('role', e.target.value as UserRole | '')}
                        data-testid={`${testIdPrefix}-filter-role`}
                    >
                        <option value="">ทุกบทบาท</option>
                        {ROLE_FILTER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[.8rem] text-muted">
                <span role="status" data-testid={`${testIdPrefix}-result-count`}>
                    พบ {resultCount} บัญชี
                </span>
                {hasFilters && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFilters(EMPTY_FILTERS)}
                        data-testid={`${testIdPrefix}-filter-clear`}
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                        ล้างตัวกรอง
                    </Button>
                )}
            </div>

            <div ref={listRef} className="flex flex-col gap-5">
                {visibleGroups.length === 0 && (
                    <p className="ws-readonly text-center text-[.88rem] text-muted">ไม่พบบัญชีที่ตรงกับตัวกรอง</p>
                )}
                {visibleGroups.map((group) => (
                    <section key={group.label} className="min-w-0" aria-labelledby={`${testIdPrefix}-group-${group.label}`}>
                        <h2 id={`${testIdPrefix}-group-${group.label}`} className="mb-2 text-[1rem] font-bold text-navy">
                            {group.label}
                        </h2>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {group.accounts.map((account) => {
                                const current = isCurrent(account)
                                return (
                                    <button
                                        key={account.username}
                                        type="button"
                                        data-testid={`${testIdPrefix}-${account.username}`}
                                        data-role={account.role}
                                        onClick={() => handleSwitch(account)}
                                        aria-pressed={current}
                                        className={`ws-card flex min-h-[44px] min-w-0 items-start gap-3 p-4 text-left transition ${
                                            current
                                                ? 'cursor-default border-gold ring-2 ring-gold/40'
                                                : 'cursor-pointer hover:border-[#9aabba] hover:bg-[#f5f7f9]'
                                        }`}
                                    >
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edf2f6] text-navy">
                                            <i className="fa-solid fa-user-tie" aria-hidden="true" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[.88rem] font-bold text-navy">{ROLE_NAMES[account.role]}</span>
                                            <span className="block break-words text-[.88rem] text-ink">{account.name}</span>
                                            <span className="block break-words text-[.8rem] text-muted">{account.position}</span>
                                            <span className="mt-1 block text-[.76rem] text-muted">{account.username}</span>
                                        </span>
                                        {current && (
                                            <span className="ws-status success shrink-0">
                                                <i className="fa-solid fa-check mr-1" aria-hidden="true" />
                                                บทบาทปัจจุบัน
                                            </span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    )
}
