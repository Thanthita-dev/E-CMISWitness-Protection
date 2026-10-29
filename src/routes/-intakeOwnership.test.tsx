import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { IntakePage } from './intake'
import { useAuthStore } from '../store/useAuthStore'
import { useCaseStore } from '../store/useCaseStore'
import { findLoginAccount } from '../lib/loginAccounts'
import { canLinkMainCase, isMyQueueCase } from '../lib/permissions'
import { canViewHandoffCase } from '../lib/protectionHandoff'
import { MainCaseLinkCard } from '../components/dossier/MainCaseLinkCard'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock('../lib/swal', () => ({ showToast: vi.fn() }))

beforeEach(() => {
  useCaseStore.setState({ cases: [] })
  useAuthStore.setState({ currentRole: 'officer', currentOfficerUserId: 'OFF-001', currentDirectorUserId: 'DIR-001', currentOrgUnitId: 'central-wp', loginUsername: null })
})
afterEach(cleanup)

describe('รับคำร้องด้วยบุคคลที่เข้าสู่ระบบจริง', () => {
  it.each(['reg1.officer', 'reg2.officer', 'reg2.caseowner', 'reg9.officer'])('%s รับ คบ.1 แล้วเห็นงานของตน และเชื่อมเลขสำนวนได้ตั้งแต่ขั้นรับเรื่อง', (username) => {
    const account = findLoginAccount(username)!
    useAuthStore.getState().login(account)
    render(<IntakePage />)
    // ขั้นรับเรื่องไม่มีการกลั่นกรองความเร่งด่วน
    expect(screen.queryByRole('radio', { name: /กรณีปกติ/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'เจ้าหน้าที่กรอก คบ.1' }))
    const item = useCaseStore.getState().cases[0]
    expect(item).toBeDefined()
    expect(item.receivedByUserId).toBe(account.userId)
    expect(item.orgUnitId).toBe(account.orgUnitId)
    expect(canViewHandoffCase(account.role, item, account.userId!)).toBe(true)
    expect(isMyQueueCase(account.role, item, account.userId!)).toBe(true)
    expect(canLinkMainCase(account.role, item, account.userId!)).toBe(true)
    expect(canViewHandoffCase('officer', item, 'OFF-002')).toBe(false)
    expect(item.urgency).toBeFalsy()

    // เจ้าหน้าที่ผู้รับเรื่องเชื่อมโยงคดีหลักในแฟ้มก่อนส่ง ผอ. มอบหมาย
    expect(item.stage).toBe('officer_intake')
    render(<MainCaseLinkCard caseItem={item} />)
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }))
    expect(useCaseStore.getState().getCase(item.no)?.linkedMainCaseId).toBeTruthy()
    expect(useCaseStore.getState().getCase(item.no)?.mainCaseNo).toBeTruthy()
    // ขั้นรับเรื่องไม่มีการกลั่นกรองความเร่งด่วน แม้เชื่อมโยงแล้ว
    expect(screen.queryByRole('radio', { name: /กรณีปกติ/ })).toBeNull()
  })

  it('ธุรการรับคำร้องแล้วยังไม่เชื่อมโยงคดีหลัก — เจ้าของสำนวนเชื่อมโยงหลังจัดทำ คบ.1', () => {
    useAuthStore.getState().login(findLoginAccount('reg1.officer')!)
    const owner = useAuthStore.getState().currentOfficerUserId
    useCaseStore.getState().addCase({
      no: 'WP-TEST-0001', form: 'คำร้อง', person: 'ทดสอบ', status: '', stage: 'receiver_intake', owner: '', next: '',
      risk: 'ยังไม่ประเมิน', urgent: false, receivedByUserId: 'REC-REG1',
    } as never)
    const { unmount } = render(<MainCaseLinkCard caseItem={useCaseStore.getState().getCase('WP-TEST-0001')!} />)
    expect(screen.getByTestId('main-case-link-deferred')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' })).toBeNull()
    unmount()

    useCaseStore.getState().updateCase('WP-TEST-0001', { stage: 'staff_review', assignedOfficerUserId: owner, kb1CompletedAt: '01/10/2569 10:00' })
    render(<MainCaseLinkCard caseItem={useCaseStore.getState().getCase('WP-TEST-0001')!} />)
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }))
    expect(useCaseStore.getState().getCase('WP-TEST-0001')?.linkedMainCaseId).toBeTruthy()
  })
})
