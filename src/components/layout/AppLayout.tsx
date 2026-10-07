import React from 'react'
import { Outlet, useRouterState } from '@tanstack/react-router'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { GlobalSearchModal } from './GlobalSearchModal'
import { RouteGuard } from './RouteGuard'

export const AppLayout: React.FC = () => {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  /** เมนู off-canvas ที่ความกว้าง <= 900px (desktop ใช้ sidebarCollapsed ใน store) */
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  const closeMobileNav = React.useCallback(() => setMobileNavOpen(false), [])

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
