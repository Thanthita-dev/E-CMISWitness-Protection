import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { AppLayout } from './AppLayout'
import { useAuthStore } from '../../store/useAuthStore'

let currentPathname = '/mock-state'
let currentHref = '/mock-state'

vi.mock('@tanstack/react-router', () => ({
  useRouterState: ({ select }: { select: (s: { location: { pathname: string; href: string } }) => string }) =>
    select({ location: { pathname: currentPathname, href: currentHref } }),
  Navigate: ({ to, search }: { to: string; search?: Record<string, unknown> }) => (
    <div data-testid="navigate" data-to={to} data-redirect={search?.redirect as string}>
      Redirecting to {to}
    </div>
  ),
  Outlet: () => <div data-testid="outlet-content">Outlet Content</div>,
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('./Sidebar', () => ({
  Sidebar: () => <aside data-testid="sidebar">Sidebar</aside>,
}))

vi.mock('./TopBar', () => ({
  TopBar: () => <header data-testid="topbar">TopBar</header>,
}))

vi.mock('./GlobalSearchModal', () => ({
  GlobalSearchModal: () => null,
}))

vi.mock('./RouteGuard', () => ({
  RouteGuard: () => <div data-testid="route-guard">RouteGuard Content</div>,
}))

describe('AppLayout public route access', () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: false })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it.each([
    '/mock-state',
    '/flow-guide',
    '/flow-chart',
    '/role',
  ])('เมื่อยังไม่ได้ล็อกอิน เข้า %s ได้โดยไม่ redirect ไป /login และไม่มี sidebar/topbar shell', (path) => {
    currentPathname = path
    currentHref = path

    render(<AppLayout />)

    expect(screen.queryByTestId('navigate')).toBeNull()
    expect(screen.queryByTestId('sidebar')).toBeNull()
    expect(screen.queryByTestId('topbar')).toBeNull()
    expect(screen.getByTestId('outlet-content')).toBeDefined()
  })

  it('เมื่อยังไม่ได้ล็อกอิน และเข้า route ทั่วไป เช่น /registry จะถูก redirect ไป /login พร้อมเก็บ redirect href', () => {
    currentPathname = '/registry'
    currentHref = '/registry?search=test'

    render(<AppLayout />)

    const nav = screen.getByTestId('navigate')
    expect(nav.getAttribute('data-to')).toBe('/login')
    expect(nav.getAttribute('data-redirect')).toBe('/registry?search=test')
    expect(screen.queryByTestId('outlet-content')).toBeNull()
  })

  it('เมื่อล็อกอินแล้ว และเข้า /mock-state จะแสดง shell ปกติ (Sidebar, TopBar, RouteGuard)', () => {
    useAuthStore.setState({ isAuthenticated: true, currentRole: 'officer' })
    currentPathname = '/mock-state'
    currentHref = '/mock-state'

    render(<AppLayout />)

    expect(screen.queryByTestId('navigate')).toBeNull()
    expect(screen.getByTestId('sidebar')).toBeDefined()
    expect(screen.getByTestId('topbar')).toBeDefined()
    expect(screen.getByTestId('route-guard')).toBeDefined()
  })
})
