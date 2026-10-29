import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { OpenRoundModal } from './OpenRoundModal'
import { ExternalReportForm } from './ExternalReportForm'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem, MonthlyReport } from '../../types/case'

vi.mock('../../lib/swal', () => ({
  showToast: vi.fn(),
  showConfirmAlert: vi.fn(() => Promise.resolve({ isConfirmed: true })),
  MySwal: { fire: vi.fn(), close: vi.fn() },
}))

const baseCase = (patch: Partial<CaseItem> = {}): CaseItem => ({
  no: 'WP-TEST-EXT',
  form: 'คบ.1',
  person: 'นางสาวทดสอบ ระบบดี',
  status: 'อยู่ระหว่างคุ้มครอง',
  stage: 'protection',
  owner: 'นางสาวอรุณี ใจมั่น',
  next: 'ติดตามผลการคุ้มครอง',
  risk: 'ปานกลาง',
  ...patch,
})

afterEach(cleanup)

describe('OpenRoundModal source choice', () => {
  beforeEach(() => {
    useCaseStore.setState({ cases: [baseCase()] } as never)
  })

  it('defaults to kb13 and passes external when chosen', () => {
    const spy = vi.spyOn(useCaseStore.getState(), 'openKb13Round')
    useCaseStore.setState({ openKb13Round: spy } as never)
    render(<OpenRoundModal caseItem={baseCase()} open onClose={() => {}} />)
    expect((screen.getByLabelText(/^คบ\.13 \(เจ้าหน้าที่/) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByLabelText(/หนังสือรายงานจากหน่วยงานภายนอก \(บันทึกรับ/))
    fireEvent.click(screen.getAllByRole('button', { name: /เปิดรอบรายงานงวด/ }).pop()!)
    expect(spy).toHaveBeenCalledWith('WP-TEST-EXT', expect.objectContaining({ source: 'external' }))
  })
})

describe('ExternalReportForm', () => {
  const round: MonthlyReport = {
    id: 'MR-EXT',
    period: '2569-01',
    source: 'external',
    submittedAt: '',
    submittedBy: '',
    summary: '',
    incidentCount: 0,
  }

  it('shows validation messages and records letter', async () => {
    const record = vi.fn()
    useCaseStore.setState({ recordExternalReport: record } as never)
    render(<ExternalReportForm caseNo="WP-TEST-EXT" round={round} />)
    fireEvent.click(screen.getByRole('button', { name: /บันทึกรับหนังสือ/ }))
    expect(screen.getByText('กรุณาระบุหน่วยงานผู้ส่ง')).toBeTruthy()
    expect(record).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('หน่วยงานผู้ส่ง'), { target: { value: 'สภ.เมือง' } })
    fireEvent.change(screen.getByLabelText('เลขที่หนังสือ'), { target: { value: 'ตช 0001/1' } })
    const file = new File(['x'], 'letter.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('ไฟล์หนังสือ'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByText(/ไฟล์ที่เลือก: letter.pdf/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /บันทึกรับหนังสือ/ }))
    expect(record).toHaveBeenCalledWith(
      'WP-TEST-EXT',
      'MR-EXT',
      expect.objectContaining({ agency: 'สภ.เมือง', letterNo: 'ตช 0001/1', documentName: 'letter.pdf' }),
      expect.anything()
    )
  })
})
