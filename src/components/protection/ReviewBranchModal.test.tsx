import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { ReviewBranchModal } from './ReviewBranchModal'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem, MonthlyReport } from '../../types/case'
import { PROTECTION_TOTAL_CAP_DAYS } from '../../lib/constants'
import { showConfirmAlert } from '../../lib/swal'

vi.mock('../../lib/swal', () => ({
  showToast: vi.fn(),
  showConfirmAlert: vi.fn(() => Promise.resolve({ isConfirmed: true })),
  MySwal: { fire: vi.fn(), close: vi.fn() },
}))

/** Link ของ TanStack ต้องมี router context — เทสต์นี้สนใจปลายทาง ไม่ใช่การนำทางจริง */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const addDays = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

const locked: MonthlyReport = {
  id: 'MR-1',
  period: '2569-01',
  periodFrom: '2026-01-01',
  periodTo: '2026-01-31',
  orderRef: 'คบ.11/2569',
  operators: 'ชุดปฏิบัติการ 1',
  summary: 'ปฏิบัติตามวิธีที่อนุมัติครบถ้วน',
  riskLevel: 'ปานกลาง',
  submittedAt: '31 ม.ค. 2569',
  submittedBy: 'นางสาวอรุณี ใจมั่น',
  incidentCount: 0,
  lockedAt: '31 ม.ค. 2569',
}

/** cumulative วันสะสมคุมด้วยวันเริ่มของ phase — ถอยไปกี่วันก็ได้ยอดสะสมเท่านั้น */
const caseFor = (startedDaysAgo: number, patch: Partial<CaseItem> = {}): CaseItem => ({
  no: 'WP-TEST-0001',
  form: 'คบ.1',
  person: 'นางสาวทดสอบ ระบบดี',
  status: 'อยู่ระหว่างคุ้มครอง',
  stage: 'protection',
  owner: 'นางสาวอรุณี ใจมั่น',
  next: 'ติดตามผลการคุ้มครอง',
  risk: 'ปานกลาง',
  monthlyReports: [locked],
  episode: { id: 'EP-1', openedAt: addDays(-startedDaysAgo), phases: [{ id: 'PH-1', kind: 'MAIN', startedAt: addDays(-startedDaysAgo) }] },
  ...patch,
})

const renderModal = (caseItem: CaseItem) => {
  useCaseStore.setState({ cases: [caseItem] })
  return render(<ReviewBranchModal caseItem={caseItem} locked={locked} open onClose={vi.fn()} />)
}

beforeEach(() => {
  useCaseStore.setState({ cases: [] })
})

afterEach(cleanup)

describe('ReviewBranchModal', () => {
  it('ไม่แสดงอะไรเลยเมื่อ open เป็น false', () => {
    const { container } = render(
      <ReviewBranchModal caseItem={caseFor(30)} locked={locked} open={false} onClose={vi.fn()} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('WIT1012 — ตั้งรอบถัดไปแล้วเปิดรอบรายงานใหม่ให้ในคราวเดียว', async () => {
    const onClose = vi.fn()
    const caseItem = caseFor(30)
    useCaseStore.setState({ cases: [caseItem] })
    render(<ReviewBranchModal caseItem={caseItem} locked={locked} open onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /ตั้งรอบถัดไปและเปิดรอบใหม่/ }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const saved = useCaseStore.getState().getCase('WP-TEST-0001')
    expect(saved?.nextReportDueAt).toBeTruthy()
    expect(saved?.monthlyReports).toHaveLength(2)
    expect(saved?.monthlyReports?.[1].lockedAt).toBeUndefined()
  })

  it('WIT1013 — ส่งทบทวนแล้วบันทึก handoff และเปิดป้ายบอกทาง WIT1107', async () => {
    renderModal(caseFor(30))

    fireEvent.click(screen.getByRole('button', { name: 'เลือกแขนง ต้องทบทวน' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ความเสี่ยงสูงขึ้นระหว่างรอบ' } })
    fireEvent.click(screen.getByRole('button', { name: /ส่งเข้าทบทวนผลการคุ้มครอง/ }))

    await waitFor(() =>
      expect(useCaseStore.getState().getCase('WP-TEST-0001')?.reviewHandoff?.reason).toBe('ความเสี่ยงสูงขึ้นระหว่างรอบ')
    )
  })

  it('ยกเลิก popup ยืนยันแล้วต้องไม่ตั้งรอบใหม่', async () => {
    vi.mocked(showConfirmAlert).mockResolvedValueOnce({ isConfirmed: false } as Awaited<ReturnType<typeof showConfirmAlert>>)
    const onClose = vi.fn()
    const caseItem = caseFor(30)
    useCaseStore.setState({ cases: [caseItem] })
    render(<ReviewBranchModal caseItem={caseItem} locked={locked} open onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: /ตั้งรอบถัดไปและเปิดรอบใหม่/ }))

    await waitFor(() => expect(showConfirmAlert).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
    expect(useCaseStore.getState().getCase('WP-TEST-0001')?.nextReportDueAt).toBeUndefined()
  })

  it('เลือกแขนงด้วยแท็บได้ — ค่าเริ่มต้นตามระบบแนะนำ และสลับไปมาได้อิสระ', () => {
    renderModal(caseFor(30))

    // ยังไม่ครบเพดานและไม่ overdue — ระบบแนะนำ WIT1012 ไว้เป็นค่าเริ่มต้น
    expect(screen.getByRole('button', { name: /ตั้งรอบถัดไปและเปิดรอบใหม่/ })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'เลือกแขนง ต้องทบทวน' }))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ตั้งรอบถัดไปและเปิดรอบใหม่/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'เลือกแขนง ยังคุ้มครองต่อ' }))
    expect(screen.getByRole('button', { name: /ตั้งรอบถัดไปและเปิดรอบใหม่/ })).toBeInTheDocument()
  })

  it('เดินได้แขนงเดียวต่อรอบ — ส่งทบทวนแล้วปิดแขนง WIT1012', () => {
    renderModal(
      caseFor(30, {
        reviewHandoff: {
          at: '1 ก.พ. 2569',
          by: 'นางสาวอรุณี ใจมั่น',
          reason: 'ความเสี่ยงสูงขึ้น',
          riskLevel: 'สูง',
          orderRef: 'คบ.11',
          cumulativeDays: 30,
          remainingDays: 150,
        },
      })
    )

    expect(screen.getByRole('button', { name: /ตั้งรอบถัดไปและเปิดรอบใหม่/ })).toBeDisabled()
    expect(screen.getByText(/แนวทางที่เลือกได้หลังผู้บังคับบัญชาเห็นชอบ/)).toBeInTheDocument()
    expect(screen.getByText(/จัดทำเรื่องยุติ \(คบ\.15\) แล้วต่อคำสั่งยุติ/)).toBeInTheDocument()
  })

  it('TC-122 — เหลือ ≤ 7 วันก่อนครบเพดาน บล็อกแขนง WIT1012 ไม่ให้ตั้งรอบถัดไปได้อีก', () => {
    // เริ่มมา 175 วัน (นับรวมวันนี้ = สะสม 176 วัน) จากเพดาน 180 วัน = เหลือ 4 วัน ≤ 7 วัน ต้องบล็อก
    renderModal(caseFor(175))

    const continueTab = screen.getByRole('button', { name: 'เลือกแขนง ยังคุ้มครองต่อ' })
    expect(continueTab).toBeDisabled()
    expect(screen.getByText(/ต้องเข้าสู่การทบทวนผลการคุ้มครองก่อนดำเนินการต่อ/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ตั้งรอบถัดไปและเปิดรอบใหม่/ })).not.toBeInTheDocument()

    // แม้จะกด (ไม่ควรมีผลเพราะปุ่ม disabled) แขนง "ยังคุ้มครองต่อ" ก็ยังเลือกไม่ได้
    fireEvent.click(continueTab)
    expect(screen.queryByRole('button', { name: /ตั้งรอบถัดไปและเปิดรอบใหม่/ })).not.toBeInTheDocument()
  })

  it('เหลือ 8 วัน (เกินเพดานบล็อก 7 วัน) — ยังเลือกและตั้งรอบถัดไปได้ตามปกติ', () => {
    // เริ่มมา 171 วัน (นับรวมวันนี้ = สะสม 172 วัน) จากเพดาน 180 วัน = เหลือ 8 วัน > 7 วัน ยังไม่บล็อก
    renderModal(caseFor(171))

    const continueTab = screen.getByRole('button', { name: 'เลือกแขนง ยังคุ้มครองต่อ' })
    expect(continueTab).not.toBeDisabled()
    expect(screen.queryByText(/ต้องเข้าสู่การทบทวนผลการคุ้มครองก่อนดำเนินการต่อ/)).not.toBeInTheDocument()

    // ใกล้ครบเพดาน (30 วัน) ระบบแนะนำแขนงทบทวนไว้เป็นค่าเริ่มต้น — แต่ยังสลับไปเลือก WIT1012 และตั้งรอบถัดไปได้ตามปกติ
    fireEvent.click(continueTab)
    expect(screen.getByRole('button', { name: /ตั้งรอบถัดไปและเปิดรอบใหม่/ })).toBeInTheDocument()
  })

  it('WIT1149 — ครบเพดานแล้วล็อกแขนงขยายเวลาและดันไปข้อ 14', () => {
    renderModal(
      caseFor(PROTECTION_TOTAL_CAP_DAYS + 5, {
        reviewHandoff: {
          at: '1 ก.พ. 2569',
          by: 'นางสาวอรุณี ใจมั่น',
          reason: 'ครบเพดานแต่ยังมีภัย',
          riskLevel: 'สูง',
          orderRef: 'คบ.11',
          cumulativeDays: PROTECTION_TOTAL_CAP_DAYS,
          remainingDays: 0,
        },
      })
    )

    expect(screen.getByText(new RegExp(`ห้ามขยายด้วย คบ\\.14`))).toBeInTheDocument()
    expect(screen.getByText(/ทำไม่ได้ — ครบเพดาน/)).toBeInTheDocument()
    expect(screen.queryByText(/ขยายเวลา \(คบ\.14\) · ขยายได้ไม่เกิน/)).not.toBeInTheDocument()
    expect(screen.getByText(/จัดทำเรื่องส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ/)).toBeInTheDocument()
  })
})
