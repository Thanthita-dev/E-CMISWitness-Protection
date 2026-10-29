import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useAuthStore } from '../store/useAuthStore'
import { ADDITIONAL_FORMS } from '../lib/additionalForms'
import { FORMS_CATALOG } from '../lib/constants'

const routeState = vi.hoisted(() => ({
  search: {} as { additional?: string },
  navigate: vi.fn(),
}))
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({
    useSearch: () => routeState.search,
    useNavigate: () => routeState.navigate,
  }),
  Link: ({ children, params }: { children: React.ReactNode; params: { formId: string } }) => <a href={`/form/${params.formId}`}>{children}</a>,
}))
import { FormsCatalogPage } from './forms'

beforeEach(() => {
  routeState.search = {}
  routeState.navigate.mockReset()
  useAuthStore.setState({ currentRole: 'officer' })
})
afterEach(cleanup)

describe('หมวดแบบฟอร์มและหนังสือ', () => {
  it('ยังเปิดแบบ คบ. ได้ครบ และเพิ่มหนังสือตำรวจสองฉบับร่วมกับ 7 แบบเดิม', () => {
    render(<FormsCatalogPage />)
    expect(screen.getAllByRole('link', { name: 'เปิดแบบฟอร์ม' })).toHaveLength(FORMS_CATALOG.filter(f => f.n <= 17).length)
    fireEvent.click(screen.getByRole('button', { name: 'แบบฟอร์มและหนังสือประกอบ (11)' }))
    expect(document.body).not.toHaveTextContent('ลูกค้า')
    expect(screen.getAllByRole('button', { name: 'เปิดแบบฟอร์ม' })).toHaveLength(8)
    expect(screen.getByRole('heading', { name: 'ขอจัดเจ้าหน้าที่ตำรวจ: ถึงผู้กำกับการสถานีตำรวจ' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ขอจัดเจ้าหน้าที่ตำรวจ: ถึงผู้บัญชาการตำรวจแห่งชาติ' })).toBeInTheDocument()
    ADDITIONAL_FORMS.forEach((template) => expect(screen.getByRole('heading', { name: template.title })).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: 'เปิดแบบฟอร์ม' })[0])
    expect(routeState.navigate).toHaveBeenCalledWith({ search: { additional: ADDITIONAL_FORMS[0].id } })
  })

  it('ใช้สิทธิ์เปิดแบบเดิม และไม่ข้ามสิทธิ์ด้วย URL ของแบบเพิ่มเติม', () => {
    useAuthStore.setState({ currentRole: 'receiver' })
    const view = render(<FormsCatalogPage />)
    fireEvent.click(screen.getByRole('button', { name: 'แบบฟอร์มและหนังสือประกอบ (11)' }))
    screen.getAllByRole('button', { name: 'เปิดแบบฟอร์ม' }).forEach((button) => expect(button).toBeDisabled())
    view.unmount()
    routeState.search = { additional: ADDITIONAL_FORMS[0].id }
    render(<FormsCatalogPage />)
    expect(screen.getByRole('heading', { name: 'ไม่มีสิทธิ์เปิดแบบฟอร์มนี้' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('ลิงก์แบบที่ไม่พบกลับรายการได้', () => {
    routeState.search = { additional: 'missing-template' }
    render(<FormsCatalogPage />)
    expect(screen.getByRole('heading', { name: 'ไม่พบแบบฟอร์ม' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'กลับรายการแบบฟอร์ม' }))
    expect(routeState.navigate).toHaveBeenCalledWith({ search: {} })
  })
})
