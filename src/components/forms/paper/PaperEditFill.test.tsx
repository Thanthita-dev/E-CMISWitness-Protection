import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Fill, PaperEditContext } from './PaperPrimitives'

afterEach(cleanup)

describe('กรอกบนกระดาษเมื่อขยายเอกสาร', () => {
  it('ไม่มี Provider = แสดงค่าอ่านอย่างเดียวตามเดิม', () => {
    render(<Fill field="ชื่อ">สมชาย</Fill>)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('สมชาย')).toBeInTheDocument()
  })

  it('ช่องข้อความเขียนกลับ key เดียวกับแบบกรอกด้านซ้าย', () => {
    const set = vi.fn()
    render(<PaperEditContext.Provider value={{ draft: { ชื่อ: 'สมชาย' }, set }}><Fill field="ชื่อ">สมชาย</Fill></PaperEditContext.Provider>)
    const input = screen.getByRole('textbox', { name: 'ชื่อ' })
    expect(input).toHaveValue('สมชาย')
    fireEvent.change(input, { target: { value: 'สมหญิง' } })
    expect(set).toHaveBeenCalledWith('ชื่อ', 'สมหญิง')
  })

  it('ช่องวันที่ใช้ตัวเลือกวันที่ และค่ารายการ/ตัวเลือกไม่เปิดให้พิมพ์ทับ', () => {
    const set = vi.fn()
    const { container } = render(<PaperEditContext.Provider value={{ draft: { วันที่: '2026-10-13', วิธี: [1, 2] }, set }}>
      <Fill field="วันที่" date>13/10/2569</Fill>
      <Fill field="วิธี">1, 2</Fill>
    </PaperEditContext.Provider>)
    const date = container.querySelector('input[type="date"]') as HTMLInputElement
    expect(date.value).toBe('2026-10-13')
    expect(container.querySelectorAll('input')).toHaveLength(1)
    expect(screen.getByText('1, 2')).toBeInTheDocument()
  })
})
