import React from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { ROLE_NAMES } from '../../lib/constants'
import { showToast } from '../../lib/swal'
import { getNavTreeForRole, isMyQueueCase, type NavItem, type NavSectionKey } from '../../lib/permissions'
import { isHandoffQueueCase } from '../../lib/protectionHandoff'

/** ความกว้างที่ sidebar เปลี่ยนเป็น off-canvas (ตรงกับ ecmis-sidebar.css) */
const MOBILE_QUERY = '(max-width: 900px)'

function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_QUERY).matches : false
  )
  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setIsMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isMobile
}

interface SidebarProps {
  /** เมนู off-canvas เปิดอยู่ (ใช้เฉพาะ <= 900px) */
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onMobileClose }) => {
  const { currentRole, currentOfficerUserId, sidebarCollapsed: storedCollapsed, getCurrentOfficerAccount, toggleSidebar } = useAuthStore()
  const isMobile = useIsMobileViewport()
  /** ย่อเมนูได้เฉพาะ desktop — บนมือถือแสดงเมนูเต็มเสมอเมื่อเปิด */
  const sidebarCollapsed = storedCollapsed && !isMobile
  const allCases = useCaseStore((state) => state.cases)
  /** นับเฉพาะงานที่เป็นของผู้ใช้คนนี้จริง ให้ตรงกับรายการในหน้าคิวงาน /queue/$role */
  const cases = React.useMemo(
    () => allCases.filter((c) => isMyQueueCase(currentRole, c, currentOfficerUserId)),
    [allCases, currentRole, currentOfficerUserId]
  )
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  // Calculate "My Work" count based on role
  const myWorkCount = React.useMemo(() => {
    if (currentRole.startsWith('got_')) return cases.filter((c) => isHandoffQueueCase(currentRole, c, currentOfficerUserId)).length
    if (currentRole === 'receiver') {
      return cases.filter((c) => c.stage === 'receiver_intake').length
    }
    if (currentRole === 'officer' || currentRole === 'case_owner') {
      return cases.filter((c) => c.stage === 'officer_intake' || c.stage === 'staff_review' || c.returned ||
        (c.stage === 'notice' && !c.deliveredAt) || (c.stage === 'protection' && !c.policeAckAt) ||
        (Boolean(c.protectionHandoff) && ['notice', 'method_operation', 'protection'].includes(c.stage))).length
    }
    if (currentRole === 'supervisor') {
      return cases.filter((c) => c.stage === 'supervisor_review' || c.extensionRequests?.at(-1)?.formSnapshot && c.extensionRequests.at(-1)?.approvalStage === 'supervisor' && ['submitted', 'pending'].includes(c.extensionRequests.at(-1)!.status)).length
    }
    if (currentRole === 'director') {
      return cases.filter((c) => c.stage === 'director_review' || c.stage === 'director_assign' || c.extensionRequests?.at(-1)?.formSnapshot && c.extensionRequests.at(-1)?.approvalStage === 'director' && c.extensionRequests.at(-1)?.status === 'pending').length
    }
    if (currentRole === 'deputy_secretary') {
      return cases.filter((c) => c.stage === 'deputy_review' || c.extensionRequests?.at(-1)?.formSnapshot && c.extensionRequests.at(-1)?.approvalStage === 'deputy_secretary' && c.extensionRequests.at(-1)?.status === 'pending').length
    }
    if (currentRole === 'secretary') {
      return cases.filter(
        (c) =>
          c.stage === 'external_pending' ||
          (c.extensionRequests || []).some((r) => r.status === 'pending' && r.approvalStage === 'secretary') ||
          c.terminationRequest?.status === 'pending'
      ).length
    }
    if (currentRole === 'protection') {
      return cases.filter((c) => c.stage === 'protection').length
    }
    if (currentRole === 'appeal') {
      return cases.filter((c) => c.stage === 'appeal').length
    }
    return cases.length
  }, [cases, currentRole, currentOfficerUserId])

  /** โครงเมนูตามสิทธิ์ของบทบาทปัจจุบัน — กลุ่มหลัก > กลุ่มย่อย > รายการ */
  const navTree = React.useMemo(() => getNavTreeForRole(currentRole), [currentRole])

  /** เมนูของรายการนี้กำลังถูกเปิดอยู่หรือไม่ — รวมหน้ารายสำนวนที่เป็นลูกของเมนูนั้น */
  const isItemActive = React.useCallback(
    (item: NavItem) =>
      currentPath === item.path ||
      (item.path === '/registry' && currentPath === '/') ||
      (item.path === '/forms' && currentPath.startsWith('/form/')) ||
      (item.path === '/appeal' && currentPath.startsWith('/appeal-folder')) ||
      (item.path === '/protection-methods' && currentPath.startsWith('/protection-method/')) ||
      (item.path === '/protection-reviews' && currentPath.startsWith('/protection-review/')) ||
      (item.path === '/protection-extensions' && currentPath.startsWith('/protection-extension/')) ||
      (item.path === '/termination' && currentPath.startsWith('/termination/')),
    [currentPath]
  )

  /**
   * กลุ่มย่อยที่ผู้ใช้กางไว้ — เริ่มต้นกางเฉพาะกลุ่มที่มีเมนูปัจจุบันอยู่ข้างใน
   * และกางให้อัตโนมัติเมื่อผู้ใช้เดินเข้าไปในกลุ่มนั้นจากลิงก์ในหน้าอื่น
   */
  const [openSections, setOpenSections] = React.useState<NavSectionKey[]>([])

  const activeSectionKey = React.useMemo(() => {
    for (const group of navTree) {
      for (const node of group.nodes) {
        if (node.kind === 'section' && node.items.some(isItemActive)) return node.key
      }
    }
    return null
  }, [navTree, isItemActive])

  React.useEffect(() => {
    if (activeSectionKey) {
      setOpenSections((prev) => (prev.includes(activeSectionKey) ? prev : [...prev, activeSectionKey]))
    }
  }, [activeSectionKey])

  const toggleSection = (key: NavSectionKey) =>
    setOpenSections((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

  const renderNavLink = (item: NavItem, nested: boolean) => (
    <Link
      key={item.path}
      to={item.path}
      className={`ws-nav-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${isItemActive(item) ? 'active text-gold' : ''} ${
        sidebarCollapsed ? 'justify-center !px-0' : nested ? '!pl-8 !pr-3' : ''
      }`}
      aria-current={isItemActive(item) ? 'page' : undefined}
      title={item.label}
    >
      <i className={`fa-solid ${item.icon} w-5 text-center text-sm`} />
      {!sidebarCollapsed && <span>{item.label}</span>}
    </Link>
  )

  const officerAccount = getCurrentOfficerAccount()
  const displayName = currentRole.startsWith('got_') ? useAuthStore.getState().getCurrentUserAccount()?.name || ROLE_NAMES[currentRole]
    : (currentRole === 'officer' || currentRole === 'case_owner') && officerAccount ? officerAccount.name : currentRole === 'secretary' ? 'นายสุรศักดิ์ ธรรมพิทักษ์' : 'thanthita'

  const myWorkRoute = `/queue/${currentRole}`

  const resetSystemData = () => {
    if (window.confirm('ต้องการรีเซ็ตข้อมูลทั้งหมดของระบบกลับเป็นค่าเริ่มต้นหรือไม่?')) {
      window.localStorage.clear()
      window.location.reload()
    }
  }

  /** ออกจากระบบผ่าน auth.js ของ Hub (global logout) — ถ้ารันแยก (ไม่มี Hub) จะไม่ทำอะไรนอกจากแจ้งเตือน */
  const handleLogout = () => {
    const hubLogout = (window as unknown as { logout?: () => void }).logout
    if (typeof hubLogout === 'function') {
      hubLogout()
      window.location.href = '/index.html'
    } else {
      showToast('ออกจากระบบได้เมื่อเปิดผ่านหน้าหลัก E-CMIS')
    }
  }

  return (
    <aside
      id="app-sidebar"
      aria-label="แถบเมนูหลัก"
      {...(isMobile && !mobileOpen ? { inert: '' } : {})}
      className={`z-30 flex h-screen shrink-0 flex-col overflow-hidden bg-[linear-gradient(180deg,#0d1b3e_0%,#1a2f6b_60%,#1e3575_100%)] text-slate-200 shadow-sidebar transition-all duration-300 min-[901px]:sticky min-[901px]:top-0 max-[900px]:fixed max-[900px]:inset-y-0 max-[900px]:left-0 max-[900px]:z-50 max-[900px]:w-[min(82vw,280px)] ${
        isMobile ? '' : sidebarCollapsed ? 'w-[68px]' : 'w-[260px]'
      } ${isMobile && !mobileOpen ? 'max-[900px]:invisible max-[900px]:-translate-x-[105%]' : 'max-[900px]:translate-x-0'}`}
    >
      {/* Brand Header */}
      <button
        type="button"
        onClick={resetSystemData}
        className={`flex min-h-[84px] items-center border-0 border-b border-white/10 bg-transparent text-left text-inherit ${sidebarCollapsed ? 'justify-center px-2 py-4' : 'gap-3 px-[14px] py-4'}`}
        aria-label="รีเซ็ตข้อมูลระบบ"
        title="รีเซ็ตข้อมูลทั้งหมดกลับเป็นค่าเริ่มต้น"
      >
        <img
          src="/assets/images/pacc-logo.webp"
          alt="ตราสำนักงาน ป.ป.ท."
          className="h-11 w-11 rounded-full border-2 border-gold bg-[#f4d56d] object-cover flex-shrink-0"
        />
        {!sidebarCollapsed && (
          <div className="overflow-hidden">
            <strong className="block text-lg font-bold tracking-wide text-white leading-tight">E-CMIS</strong>
            <small className="block text-xs font-semibold tracking-wider text-gold-accent">COMPLAINT MANAGEMENT</small>
          </div>
        )}
      </button>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-4" aria-label="เมนูระบบคุ้มครองพยาน">
        {/* Module Label */}
        <div className={`flex items-center gap-2.5 px-3 py-1.5 text-gold-accent font-semibold text-sm ${sidebarCollapsed ? 'justify-center' : ''}`}>
          <i className="fa-solid fa-shield-halved text-base" />
          {!sidebarCollapsed && <span>คุ้มครองพยาน</span>}
        </div>

        {/* My Work primary button */}
        <div className="border-b border-white/10 pb-3">
          <Link
            to={myWorkRoute}
            className={`group relative flex min-h-[52px] items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10 ${
              currentPath.startsWith('/queue') ? 'border-gold/50 bg-gold/15 text-gold font-semibold shadow-inner' : 'text-slate-200'
            } ${sidebarCollapsed ? 'justify-center px-0' : ''}`}
            title="เปิดคิวงานตามบทบาทของฉัน"
          >
            <i className="fa-solid fa-inbox text-gold text-lg flex-shrink-0" />
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <strong className="block text-[13.5px] font-semibold text-white truncate">งานของฉัน</strong>
                <small className="block text-xs text-slate-300 truncate">คิวงานตามบทบาทปัจจุบัน</small>
              </div>
            )}
            <span
              className={`rounded-full bg-[#23466f] px-2 py-0.5 text-xs font-bold text-white ${
                currentPath.startsWith('/queue') ? 'bg-gold text-navy-deep font-extrabold' : ''
              } ${sidebarCollapsed ? 'absolute -top-1 -right-1' : ''}`}
            >
              {myWorkCount}
            </span>
          </Link>
        </div>

        {!sidebarCollapsed && <div className="ws-nav-label !pt-0">เมนูตามสิทธิ์</div>}

        {/* กลุ่มเมนู — แสดงเฉพาะรายการที่บทบาทปัจจุบันมีสิทธิ์เข้าถึง */}
        {navTree.map((group) => (
          <div key={group.key} className="space-y-1">
            {!sidebarCollapsed && (
              <div className="ws-nav-label">{group.title}</div>
            )}
            {group.nodes.map((node) => {
              if (node.kind === 'item') return renderNavLink(node.item, false)

              const isOpen = sidebarCollapsed || openSections.includes(node.key)
              const hasActiveChild = node.items.some(isItemActive)

              return (
                <div key={node.key} className="space-y-1">
                  {!sidebarCollapsed && (
                    <button
                      type="button"
                      onClick={() => toggleSection(node.key)}
                      aria-expanded={isOpen}
                      className={`ws-nav-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${hasActiveChild && !isOpen ? 'active' : ''}`}
                    >
                      <i className={`fa-solid ${node.icon} w-5 text-center text-sm`} />
                      <span className="flex-1 text-left">{node.title}</span>
                      <i className={`fa-solid fa-chevron-down text-xs transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                    </button>
                  )}
                  {isOpen && node.items.map((item) => renderNavLink(item, !sidebarCollapsed))}
                </div>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer: user card + ปุ่มย่อเมนู + ออกจากระบบ (ก4/ก5) */}
      <div className="border-t border-white/10 px-[10px] pb-[14px] pt-3">
        <div className={`flex min-h-[52px] items-center gap-2.5 rounded-[10px] px-[9px] py-2 ${sidebarCollapsed ? 'justify-center bg-transparent px-[5px]' : 'bg-white/[0.06]'}`}>
          <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full border-2 border-[#c9a84c] bg-[linear-gradient(135deg,#2a4a8f,#3b6cc7)] text-xs font-bold text-white">
            {displayName.charAt(0)}
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1 overflow-hidden">
              <strong className="block truncate text-xs font-semibold text-white">{displayName}</strong>
              <small className="block truncate text-[0.625rem] text-[#b8c4d8]">{ROLE_NAMES[currentRole]}</small>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={isMobile ? onMobileClose : toggleSidebar}
          className="mt-2 flex h-[34px] w-full items-center justify-center gap-2 rounded-lg bg-white/[0.06] text-[0.75rem] text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          aria-label={isMobile ? 'ปิดเมนู' : sidebarCollapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
          title={isMobile ? 'ปิดเมนู' : sidebarCollapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
        >
          <i className={`fa-solid ${isMobile ? 'fa-xmark' : sidebarCollapsed ? 'fa-angles-right' : 'fa-angles-left'}`} aria-hidden="true" />
          {!sidebarCollapsed && <span>{isMobile ? 'ปิดเมนู' : 'ย่อเมนู'}</span>}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-2 flex min-h-[38px] w-full items-center justify-center gap-2 rounded-lg border border-white/20 bg-transparent text-[0.8125rem] font-semibold text-white/85 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          title="ออกจากระบบ"
          aria-label="ออกจากระบบ"
        >
          <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
          {!sidebarCollapsed && <span>ออกจากระบบ</span>}
        </button>
      </div>
    </aside>
  )
}
