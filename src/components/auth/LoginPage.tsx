import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '../../store/useAuthStore'
import { verifyLogin } from '../../lib/loginAccounts'
import { showToast } from '../../lib/swal'
import { WP_DATA_RESET_NOTICE_KEY } from '../../lib/legacyDataReset'
import './login.css'

interface LoginPageProps {
    redirect?: string
}

const FEATURES = [
    { icon: 'fa-file-shield', text: 'รับคำร้องและพิจารณาการคุ้มครองพยาน' },
    { icon: 'fa-user-shield', text: 'กำหนดวิธีการคุ้มครองและติดตามผล' },
    { icon: 'fa-user-lock', text: 'แสดงงานตามบทบาทผู้ใช้งาน' },
]

export function LoginPage({ redirect }: LoginPageProps) {
    const navigate = useNavigate()
    const login = useAuthStore((s) => s.login)

    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)
    // ข้อมูลรุ่นเก่าเพิ่งถูกล้าง — แจ้งเหตุที่ต้องเข้าสู่ระบบใหม่ (ครั้งเดียวต่อแท็บ)
    const [dataResetNotice] = useState(() => {
        try {
            return sessionStorage.getItem(WP_DATA_RESET_NOTICE_KEY) === '1'
        } catch {
            return false
        }
    })
    useEffect(() => {
        try {
            sessionStorage.removeItem(WP_DATA_RESET_NOTICE_KEY)
        } catch { /* ไม่มี sessionStorage ก็ข้ามได้ */ }
    }, [])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (submitting) return
        const account = verifyLogin(username.trim(), password)
        if (!account) {
            setError('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง')
            return
        }
        setError('')
        setSubmitting(true)
        login(account, { remember: true })
        // เข้าสู่ระบบแล้วไป "งานของฉัน" ของบทบาทนั้นก่อน เว้นแต่ถูกส่งมาจากหน้าที่ต้องการเปิดอยู่แล้ว
        const myWork = `/queue/${account.role}`
        // คิวงานของบทบาทอื่น (เช่น จากหน้าแรกก่อนเข้าสู่ระบบ) ไม่ใช่งานของบัญชีนี้ — ไปงานของฉันแทน
        const target = redirect && redirect !== '/' && redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.startsWith('/login') && !redirect.startsWith('/queue/') ? redirect : myWork
        navigate({ to: target as any })
    }

    const fieldCls =
        'wp-login__field flex items-center gap-2.5 min-h-[44px] px-3 bg-[#f5f7fa] border border-[#dce3e9] rounded-lg transition'
    const inputCls = 'flex-1 min-w-0 bg-transparent border-none outline-none text-[.88rem] text-[#172434] placeholder:text-[#8a97a8] py-2'

    return (
        <div className="min-h-screen flex flex-col min-[901px]:flex-row bg-white text-[#172434]">
            <aside className="wp-login__aside relative text-white flex flex-col px-4 py-5 min-[901px]:w-[55%] min-[901px]:min-h-screen min-[901px]:px-11 min-[901px]:py-9 border-b-[3px] border-[#caa631] min-[901px]:border-b-0 min-[901px]:border-r-[3px]">
                <div className="flex items-center gap-3.5">
                    <img src="/assets/images/pacc-logo.webp" alt="" className="w-12 h-12 min-[901px]:w-14 min-[901px]:h-14 rounded-full ring-2 ring-[#caa631] bg-white object-cover shrink-0" />
                    <div className="min-w-0">
                        <div className="text-[1.45rem] font-bold leading-tight">E-CMIS</div>
                        <div className="text-[.78rem] font-semibold leading-snug">สำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ (ป.ป.ท.)</div>
                    </div>
                </div>

                <div className="min-[901px]:flex-1 flex flex-col justify-center mt-5 min-[901px]:mt-0">
                    <h2 className="text-[1.4rem] min-[901px]:text-[2rem] font-bold leading-[1.35] m-0">
                        กิจกรรมที่ 6
                        <br />
                        คุ้มครองพยาน
                    </h2>
                    <p className="hidden min-[901px]:block mt-3 mb-6 max-w-[34rem] text-[.9rem] leading-[1.7] text-white/80">
                        บริหารจัดการคำร้องขอคุ้มครองพยาน การพิจารณา กำหนดวิธีการคุ้มครอง และติดตามผลการคุ้มครอง ตามบทบาทและสิทธิ์ของผู้ใช้งาน
                    </p>
                    <ul className="hidden min-[901px]:flex flex-col gap-3 list-none p-0 m-0">
                        {FEATURES.map((f) => (
                            <li key={f.icon} className="flex items-center gap-3 text-[.85rem]">
                                <span className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-[#e0bd4f] shrink-0">
                                    <i className={`fa-solid ${f.icon}`} aria-hidden="true" />
                                </span>
                                {f.text}
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="hidden min-[901px]:block m-0 text-[.72rem] text-white/50">© 2569 E-CMIS | All rights reserved.</p>
            </aside>

            <main className="flex-1 flex items-center justify-center px-4 py-10 min-[901px]:py-0">
                <form onSubmit={handleSubmit} noValidate className="w-full max-w-[22rem]">
                    <h1 className="text-[1.5rem] font-bold text-[#082b50] m-0">เข้าสู่ระบบ</h1>
                    <p className="text-[.88rem] text-[#687789] mt-1 mb-6">กรอกชื่อผู้ใช้และรหัสผ่านเพื่อเข้าใช้งาน</p>

                    {dataResetNotice && (
                        <p data-testid="login-data-reset-notice" role="status" className="mb-5 border-l-4 border-[#caa631] bg-[#fff8e5] px-[.9rem] py-[.8rem] text-[.85rem] leading-relaxed text-[#5f5027] rounded-r-lg">
                            ระบบปรับปรุงรุ่นข้อมูลแล้ว ข้อมูลทดสอบเดิมในเบราว์เซอร์นี้ถูกล้างแล้ว กรุณาเข้าสู่ระบบใหม่
                        </p>
                    )}

                    <div className="mb-4">
                        <label htmlFor="login-username" className="block text-[.8rem] font-semibold mb-1.5">ชื่อผู้ใช้</label>
                        <div className={fieldCls}>
                            <i className="fa-solid fa-user text-[#8a97a8] text-[.85rem]" aria-hidden="true" />
                            <input
                                id="login-username"
                                name="username"
                                type="text"
                                placeholder="กรอกชื่อผู้ใช้"
                                autoComplete="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                aria-invalid={!!error}
                                aria-describedby={error ? 'login-error' : undefined}
                                className={inputCls}
                            />
                        </div>
                    </div>

                    <div className="mb-2">
                        <label htmlFor="login-password" className="block text-[.8rem] font-semibold mb-1.5">รหัสผ่าน</label>
                        <div className={fieldCls}>
                            <i className="fa-solid fa-lock text-[#8a97a8] text-[.85rem]" aria-hidden="true" />
                            <input
                                id="login-password"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="กรอกรหัสผ่าน"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                aria-invalid={!!error}
                                aria-describedby={error ? 'login-error' : undefined}
                                className={inputCls}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                                aria-pressed={showPassword}
                                className="wp-login__eye -mr-2 w-9 h-9 rounded-md bg-transparent text-[#687789] hover:text-[#082b50] cursor-pointer"
                            >
                                <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
                            </button>
                        </div>
                    </div>

                    <div className="flex justify-end mb-4">
                        <button
                            type="button"
                            onClick={() => showToast('ลืมรหัสผ่าน: ส่งลิงก์รีเซ็ตรหัสผ่านทางอีเมล (จำลอง — ยังไม่เชื่อมระบบจริง)', 'warning')}
                            className="wp-login__link min-h-[32px] px-1 bg-transparent text-[.8rem] font-semibold text-[#082b50] hover:underline cursor-pointer"
                        >
                            ลืมรหัสผ่าน?
                        </button>
                    </div>

                    {error && (
                        <p id="login-error" data-testid="login-error" role="alert" className="mb-3 flex items-start gap-2 text-[.85rem] text-[#a52c25] bg-[#f9e1df] rounded-lg px-3 py-2">
                            <i className="fa-solid fa-circle-exclamation mt-1" aria-hidden="true" />
                            <span>{error}</span>
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="wp-login__submit w-full min-h-[46px] flex items-center justify-center gap-2 rounded-lg bg-[#0d1b3e] hover:bg-[#14285a] text-white text-[.9rem] font-semibold shadow-[0_6px_16px_rgba(13,27,62,.28)] cursor-pointer disabled:opacity-70 transition"
                    >
                        <i className="fa-solid fa-right-to-bracket" aria-hidden="true" />
                        เข้าสู่ระบบ
                    </button>
                    <Link
                        to="/role"
                        data-testid="login-switch-role"
                        className="mt-3 w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg border border-[#9aabba] bg-white text-[#082b50] text-[.88rem] font-semibold hover:bg-[#f5f7fa] transition"
                    >
                        <i className="fa-solid fa-people-arrows" aria-hidden="true" />
                        เลือกบทบาททดสอบ (ไม่ต้องใช้รหัสผ่าน)
                    </Link>
                </form>
            </main>
        </div>
    )
}
