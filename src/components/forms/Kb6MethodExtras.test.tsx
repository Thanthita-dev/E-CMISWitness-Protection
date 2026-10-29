import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { Kb6FormEditor } from './Kb6FormEditor'
import { Kb4FormEditor } from './Kb4FormEditor'
import { FormPaperViewer } from './FormPaperViewer'
import { ProtectionMethodChecks } from './fields/FormKit'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import {
  KB6_PROTECTION_METHOD_FIELD,
  KB6_METHOD2_DETAIL_FIELD,
  KB6_METHOD3_DETAIL_FIELD,
  KB6_METHOD_LABELS,
  KB6_METHOD_SUBITEMS,
  KB6_METHOD_SUBITEM_FIELDS,
} from '../../lib/constants'

const draft = () => useFormDraftStore.getState().getDraft(6)
const set = (k: string, v: unknown) => useFormDraftStore.getState().updateField(6, k, v)

beforeEach(() => {
  useFormDraftStore.getState().resetDrafts()
  useFormDraftStore.setState({ manualPage: null })
})
afterEach(cleanup)

const AGENCIES = ['ส่งให้ตำรวจ', 'ส่งให้ทหาร', 'ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ']
const AGENCY_FIELD = KB6_METHOD_SUBITEM_FIELDS[4]

describe('FB-014 ชื่อรูปแบบข้อ 4 — ประสานงานหน่วยงานอื่น + ตัวเลือกหน่วยงาน 4.1–4.3', () => {
  it('คบ.6 แสดงข้อ 4 เป็น "ประสานงานหน่วยงานอื่น" และแสดงตัวเลือกหน่วยงานเมื่อเลือกข้อ 4', () => {
    render(<Kb6FormEditor />)

    expect(screen.getByTestId('method-option-4').textContent).toContain('4. ประสานงานหน่วยงานอื่น')
    expect(screen.queryByTestId('method-option-4-sub-1')).toBeNull()
    expect(screen.queryByText(/ประสานงานกับหน่วยงานอื่นให้การคุ้มครองพยาน/)).toBeNull()

    fireEvent.click(screen.getByTestId('method-option-4'))
    const labels = AGENCIES.map((_, i) => screen.getByTestId(`method-option-4-sub-${i + 1}`).parentElement?.textContent)
    expect(labels).toEqual(AGENCIES.map((a, i) => `4.${i + 1} ${a}`))
  })

  it('คบ.6 เลือกหน่วยงานได้หน่วยงานเดียว และบันทึกลง draft', () => {
    set(KB6_PROTECTION_METHOD_FIELD, [4])
    render(<Kb6FormEditor />)

    fireEvent.click(screen.getByTestId('method-option-4-sub-1'))
    expect(draft()[AGENCY_FIELD]).toBe('ส่งให้ตำรวจ')

    fireEvent.click(screen.getByTestId('method-option-4-sub-3'))
    expect(draft()[AGENCY_FIELD]).toBe('ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ')
    expect((screen.getByTestId('method-option-4-sub-3') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByTestId('method-option-4-sub-1') as HTMLInputElement).checked).toBe(false)
  })

  it('คบ.4 ใช้ชื่อและตัวเลือกหน่วยงานเดียวกับ คบ.6 และไม่มีข้อ 5', () => {
    render(<Kb4FormEditor />)

    expect(screen.getByTestId('kb4-method-option-4').textContent).toContain('4. ประสานงานหน่วยงานอื่น')
    expect(screen.queryByTestId('kb4-method-option-5')).toBeNull()

    fireEvent.click(screen.getByTestId('kb4-method-option-4'))
    fireEvent.click(screen.getByTestId('kb4-method-option-4-sub-1'))
    expect(useFormDraftStore.getState().getDraft(4)[AGENCY_FIELD]).toBe('ส่งให้ตำรวจ')
  })

  it('ไม่ส่ง labels/subitems คงชื่อมาตรฐาน', () => {
    render(<ProtectionMethodChecks selected={[4]} onChange={() => {}} />)

    expect(screen.getByTestId('method-option-4').textContent).toContain('ประสานงานกับหน่วยงานอื่นให้การคุ้มครองพยาน')
    expect(screen.queryByTestId('method-option-4-sub-1')).toBeNull()
  })

  it('KB6_METHOD_LABELS / KB6_METHOD_SUBITEMS แก้เฉพาะข้อ 4', () => {
    expect(KB6_METHOD_LABELS).toEqual({ 4: 'ประสานงานหน่วยงานอื่น' })
    expect(KB6_METHOD_SUBITEMS).toEqual({ 4: AGENCIES })
  })

  it('ไม่มีปุ่มเพิ่มข้อย่อยเองแล้ว', () => {
    set(KB6_PROTECTION_METHOD_FIELD, [4])
    render(<Kb6FormEditor />)

    expect(screen.queryByText('เพิ่มข้อย่อย')).toBeNull()
  })
})

describe('FB-014 ข้อ 4 — กระดาษ', () => {
  const page2 = () => {
    useFormDraftStore.setState({ manualPage: 2 })
    return render(<FormPaperViewer formId={6} />)
  }

  it('เลือกข้อ 4 และหน่วยงาน พิมพ์ ๑. ประสานงานหน่วยงานอื่น และ ๑.๑ เฉพาะหน่วยงานที่เลือก', () => {
    set(KB6_PROTECTION_METHOD_FIELD, [4])
    set(AGENCY_FIELD, 'ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ')
    const { container } = page2()

    expect(container.textContent).toContain('๑. ประสานงานหน่วยงานอื่น')
    const lines = screen.getAllByTestId('paper-protection-method-subitem').map((e) => e.textContent)
    expect(lines).toEqual(['๑.๑ ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ'])
  })

  it('เลือกข้อ 4 แต่ยังไม่เลือกหน่วยงาน = ไม่พิมพ์ข้อย่อย', () => {
    set(KB6_PROTECTION_METHOD_FIELD, [4])
    const { container } = page2()

    expect(container.textContent).toContain('๑. ประสานงานหน่วยงานอื่น')
    expect(screen.queryByTestId('paper-protection-method-subitem')).toBeNull()
  })

  it('ไม่เลือกข้อ 4 = ไม่พิมพ์ทั้งชื่อข้อ 4 และข้อย่อย', () => {
    set(AGENCY_FIELD, 'ส่งให้ตำรวจ')
    const { container } = page2()

    expect(screen.queryByTestId('paper-protection-method-subitem')).toBeNull()
    expect(container.textContent).not.toContain('ประสานงานหน่วยงานอื่น')
  })

  it('draft เก่าที่ไม่มีฟิลด์ใหม่ แสดงผลได้', () => {
    set(KB6_PROTECTION_METHOD_FIELD, [2, 3, 4])
    const { container } = page2()

    expect(container.textContent).toContain('จัดให้พยานอยู่ในสถานที่เหมาะสม')
    expect(screen.queryByTestId('kb6-paper-method-detail-2')).toBeNull()
  })
})

describe('FB-015 รายละเอียดรูปแบบข้อ 2 / 3', () => {
  it('ซ่อนช่องเมื่อไม่ได้เลือก และแสดง/บันทึกเมื่อเลือก', () => {
    render(<Kb6FormEditor />)
    expect(screen.queryByTestId('kb6-method-detail-2')).toBeNull()
    expect(screen.queryByTestId('kb6-method-detail-3')).toBeNull()

    fireEvent.click(screen.getByTestId('method-option-2'))
    fireEvent.click(screen.getByTestId('method-option-3'))
    fireEvent.change(screen.getByTestId('kb6-method-detail-2'), { target: { value: 'บ้านพักปลอดภัย' } })
    fireEvent.change(screen.getByTestId('kb6-method-detail-3'), { target: { value: 'ปกปิดชื่อ' } })

    expect(draft()[KB6_METHOD2_DETAIL_FIELD]).toBe('บ้านพักปลอดภัย')
    expect(draft()[KB6_METHOD3_DETAIL_FIELD]).toBe('ปกปิดชื่อ')
    expect(screen.getByLabelText('รายละเอียดข้อ 2 — สถานที่ที่จัดให้พยานอยู่')).toBeTruthy()
    expect(screen.getByLabelText('รายละเอียดข้อ 3 — ข้อมูลที่ปกปิดและวิธีรักษาความลับ')).toBeTruthy()

    fireEvent.click(screen.getByTestId('method-option-2'))
    expect(screen.queryByTestId('kb6-method-detail-2')).toBeNull()
    expect(draft()[KB6_METHOD2_DETAIL_FIELD]).toBe('บ้านพักปลอดภัย')
  })

  const page2 = () => {
    useFormDraftStore.setState({ manualPage: 2 })
    return render(<FormPaperViewer formId={6} />)
  }

  it('กระดาษพิมพ์รายละเอียดใต้ข้อที่เลือกและคงการขึ้นบรรทัด', () => {
    set(KB6_PROTECTION_METHOD_FIELD, [2, 3])
    set(KB6_METHOD2_DETAIL_FIELD, 'บ้านพักปลอดภัย\nจังหวัดนนทบุรี')
    set(KB6_METHOD3_DETAIL_FIELD, 'ปกปิดชื่อและที่อยู่')
    page2()

    const d2 = screen.getByTestId('kb6-paper-method-detail-2')
    expect(d2.textContent).toBe('บ้านพักปลอดภัย\nจังหวัดนนทบุรี')
    expect(d2.className).toContain('whitespace-pre-wrap')
    expect(screen.getByTestId('kb6-paper-method-detail-3').textContent).toBe('ปกปิดชื่อและที่อยู่')
  })

  it('ไม่เลือกหรือว่าง = ไม่พิมพ์รายละเอียด', () => {
    set(KB6_PROTECTION_METHOD_FIELD, [3])
    set(KB6_METHOD2_DETAIL_FIELD, 'ไม่ควรพิมพ์')
    set(KB6_METHOD3_DETAIL_FIELD, '  ')
    page2()

    expect(screen.queryByTestId('kb6-paper-method-detail-2')).toBeNull()
    expect(screen.queryByTestId('kb6-paper-method-detail-3')).toBeNull()
  })
})
