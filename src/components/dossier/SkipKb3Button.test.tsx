import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { SkipKb3Button } from './SkipKb3Button'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem } from '../../types/case'

vi.mock('../../lib/swal', () => ({
  showToast: vi.fn(),
  MySwal: { fire: vi.fn(), close: vi.fn() },
}))

import { MySwal } from '../../lib/swal'

const caseFor = (kb3Skipped: boolean): CaseItem => ({
  no: 'WP-TEST-0001',
  form: 'คบ.1',
  person: 'นางสาวทดสอบ ระบบดี',
  status: 'รอตรวจข้อมูลจากผู้ยื่น',
  stage: 'staff_review',
  owner: 'นางสาวอรุณี ใจมั่น',
  next: 'ตรวจข้อมูลและลายมือชื่อก่อนรับเข้าแฟ้ม',
  risk: 'สูง',
  kb3Skipped,
})

const button = () => screen.getByRole('button', { name: /กดข้าม คบ\.3|กู้คืน คบ\.3/ })

beforeEach(() => {
  vi.mocked(MySwal.fire).mockClear()
  useCaseStore.setState({ cases: [caseFor(true), caseFor(false)].slice(0, 1) })
})

afterEach(cleanup)

describe('SkipKb3Button', () => {
  it('แสดงปุ่มกดข้ามเมื่อยังไม่ได้ข้าม คบ.3', () => {
    render(<SkipKb3Button caseItem={caseFor(false)} />)

    expect(button()).toHaveTextContent('กดข้าม คบ.3')
  })

  it('แสดงปุ่มกู้คืนเมื่อข้าม คบ.3 แล้ว', () => {
    render(<SkipKb3Button caseItem={caseFor(true)} />)

    expect(button()).toHaveTextContent('กู้คืน คบ.3')
  })

  it('เปิดกล่องระบุเหตุผลเมื่อกดข้าม', () => {
    render(<SkipKb3Button caseItem={caseFor(false)} />)

    fireEvent.click(button())

    expect(MySwal.fire).toHaveBeenCalledTimes(1)
  })

  it('กู้คืนแล้วล้างสถานะข้าม คบ.3 ทันทีโดยไม่ต้องระบุเหตุผล', () => {
    const target = caseFor(true)
    useCaseStore.setState({ cases: [target] })
    render(<SkipKb3Button caseItem={target} />)

    fireEvent.click(button())

    expect(MySwal.fire).not.toHaveBeenCalled()
    expect(useCaseStore.getState().getCase(target.no)?.kb3Skipped).toBe(false)
  })
})
