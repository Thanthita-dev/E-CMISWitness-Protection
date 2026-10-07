import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from './Sidebar'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: () => ({ location: { pathname: '/registry' } }),
}))

describe('Sidebar', () => {
  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('clears all saved browser data after confirming a reset', () => {
    localStorage.setItem('ecmis-case-storage', 'changed case')
    localStorage.setItem('ecmis-auth-storage', 'changed settings')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'รีเซ็ตข้อมูลระบบ' }))

    expect(window.confirm).toHaveBeenCalledOnce()
    expect(localStorage.length).toBe(0)
  })
})
