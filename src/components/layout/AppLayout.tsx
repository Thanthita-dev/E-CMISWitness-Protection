import React from 'react'
import { Navigate, Outlet, useRouterState } from '@tanstack/react-router'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { GlobalSearchModal } from './GlobalSearchModal'
import { RouteGuard } from './RouteGuard'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { notifyCapWarnings } from '../../lib/capWarning'

export const AppLayout: React.FC = () => {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const href = useRouterState({ select: (s) => s.location.href })
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  /** เมนู off-canvas ที่ความกว้าง <= 900px (desktop ใช้ sidebarCollapsed ใน store) */
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  const closeMobileNav = React.useCallback(() => setMobileNavOpen(false), [])
  const cases = useCaseStore((s) => s.cases)

  // แจ้งเตือนเข้ากระดิ่งล่วงหน้า 1 เดือนก่อนครบระยะเวลาคุ้มครอง 6 เดือน (ครั้งเดียวต่อแฟ้ม)
  React.useEffect(() => {
    if (isAuthenticated) notifyCapWarnings(cases)
  }, [cases, isAuthenticated])

  React.useEffect(() => {
    if (!isAuthenticated) return
    const refresh = () => { const store = useCaseStore.getState(); store.cases.filter(c => c.kb15 && !c.episode?.closedAt).forEach(c => store.refreshTerminationEffect(c.no)) }
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [isAuthenticated])

  // ปิดเมนูมือถือเมื่อเปลี่ยนหน้า
  React.useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  // ปิดด้วยปุ่ม Escape
  React.useEffect(() => {
    if (!mobileNavOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileNavOpen])

  // ลิงก์เซ็นทางไกล (/sign/*) เปิดโดยบุคคลภายนอกที่ไม่ได้ล็อกอินระบบ —
  // ไม่ครอบด้วยแถบเมนู/บทบาท และไม่ผ่านการตรวจสิทธิ์ตามบทบาทของ RouteGuard
  if (pathname.startsWith('/sign/')) {
    return <Outlet />
  }

  // หน้าเข้าสู่ระบบไม่ครอบด้วย shell
  if (pathname === '/login') {
    return <Outlet />
  }

  // หน้าเครื่องมือสาธิต/ทดสอบ (/role, /mock-state, /flow-guide, /flow-chart) เปิดได้แม้ยังไม่ล็อกอิน —
  // ระหว่างยังไม่ล็อกอินแสดงแบบไม่มี shell (ไม่มีบทบาทให้ใช้กับเมนู/RouteGuard)
  const isPublicStandaloneRoute =
    pathname === '/role' ||
    pathname === '/mock-state' ||
    pathname === '/flow-guide' ||
    pathname === '/flow-chart'

  if (!isAuthenticated && isPublicStandaloneRoute) {
    return (
      <div className="min-h-screen bg-soft">
        <main className="mx-auto w-full max-w-[1600px] min-w-0 px-3 pb-28 pt-[0.9rem] min-[481px]:px-4 min-[721px]:px-6 min-[721px]:pt-[1.2rem]">
          <Outlet />
        </main>
      </div>
    )
  }

  // ต้องเข้าสู่ระบบก่อนใช้งาน — เก็บ path เดิมไว้ใน ?redirect= เพื่อกลับมาหลังล็อกอิน
  if (!isAuthenticated) {
    return <Navigate to="/login" search={{ redirect: href }} replace />
  }

  return (
    <div className="flex min-h-screen bg-soft">
      <Sidebar mobileOpen={mobileNavOpen} onMobileClose={closeMobileNav} />
      {mobileNavOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="ปิดเมนู"
          onClick={closeMobileNav}
          className="fixed inset-0 z-40 cursor-default border-0 bg-[rgba(4,17,36,0.52)] min-[901px]:hidden"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar mobileNavOpen={mobileNavOpen} onMobileNavToggle={() => setMobileNavOpen((open) => !open)} />
        {/* ค่าเทียบ .ws-container: 1.2rem 1.5rem 7rem (desktop); .9rem .75rem 7rem (<=720px) */}
        <main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 px-3 pb-28 pt-[0.9rem] min-[481px]:px-4 min-[721px]:px-6 min-[721px]:pt-[1.2rem]">
          <RouteGuard />
        </main>
      </div>
      <GlobalSearchModal />
    </div>
  )
}
