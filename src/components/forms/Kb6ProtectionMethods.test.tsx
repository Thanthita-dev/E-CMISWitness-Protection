import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { Kb6FormEditor } from './Kb6FormEditor'
import { FormPaperViewer } from './FormPaperViewer'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { PROTECTION_METHOD_OPTIONS } from '../../lib/constants'

/** 8.2 รูปแบบการคุ้มครอง — ข้อ 1-3 เป็นกลุ่มเดียวกัน ข้อ 4 เลือกแยกอย่างเดียว */
const KEY = 'รูปแบบคุ้มครองที่เลือก'

const selected = (): number[] => useFormDraftStore.getState().getDraft(6)[KEY] ?? []

const setSelected = (value: number[]) => useFormDraftStore.getState().updateField(6, KEY, value)

/** ปุ่มตัวเลือกใน 8.2 — จับจากข้อความต้นฉบับของแต่ละข้อ */
const OPTION_TEXT: Record<number, RegExp> = {
  1: /จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัย/,
  2: /จัดให้พยานอยู่ในสถานที่เหมาะสม/,
  3: /ปกปิด และรักษาความลับเกี่ยวกับชื่อตัว/,
  4: /4\. ประสานงานหน่วยงานอื่น/,
}

const option = (n: number) => screen.getByRole('button', { name: OPTION_TEXT[n] })

beforeEach(() => {
  useFormDraftStore.getState().resetDrafts()
  useFormDraftStore.setState({ manualPage: null })
})

/** vitest ไม่ได้เปิด globals จึงต้องล้าง DOM เอง มิฉะนั้นผลการ render จะสะสมข้ามเคส */
afterEach(cleanup)

describe('คบ.6 8.2 — กลุ่มรูปแบบการคุ้มครอง', () => {
  it('เลือกข้อ 1-3 ได้เป็นรายข้อ', () => {
    render(<Kb6FormEditor />)

    fireEvent.click(option(2))

    expect(selected()).toEqual([2])
  })

  it('กดข้อ 1 ซ้ำ ยกเลิกเฉพาะข้อ 1 โดยคงข้อ 2-3', () => {
    setSelected([1, 2, 3])
    render(<Kb6FormEditor />)

    fireEvent.click(option(1))

    expect(selected()).toEqual([2, 3])
  })

  it('เลือกข้อ 4 แล้วได้เฉพาะข้อ 4', () => {
    render(<Kb6FormEditor />)

    fireEvent.click(option(4))

    expect(selected()).toEqual([4])
  })

  it('กดข้อ 4 ซ้ำขณะเลือกอยู่ แล้วล้างการเลือก', () => {
    setSelected([4])
    render(<Kb6FormEditor />)

    fireEvent.click(option(4))

    expect(selected()).toEqual([])
  })

  it('สลับไปข้อ 4 แล้วนำข้อ 1-3 ออก', () => {
    setSelected([1, 2, 3])
    render(<Kb6FormEditor />)

    fireEvent.click(option(4))
    expect(selected()).toEqual([4])
  })

  it('สลับไปข้อ 1 แล้วนำข้อ 4 ออก', () => {
    setSelected([4])
    render(<Kb6FormEditor />)

    fireEvent.click(option(1))
    expect(selected()).toEqual([1])
  })

  it('เปิดทุกข้อเมื่อยังไม่ได้เลือกอะไร', () => {
    render(<Kb6FormEditor />)

    expect(option(1)).toBeEnabled()
    expect(option(4)).toBeEnabled()
  })
})

describe('คบ.6 8.1 — ช่องกรอกชุดเจ้าพนักงานในหน้าแก้ไข', () => {
  /** 8.1 มีชื่อ 4 ช่อง + ตำแหน่ง 4 ช่อง */
  const ROSTER_INPUTS = 8

  /**
   * นับเฉพาะช่องกรอกของชุดปฏิบัติการ (8.1 = <input>) — ไม่รวมช่องความเห็นข้อ 10-13 (9.–13. = <textarea>)
   * ซึ่งปิดใช้งานเองตามลำดับชั้น/ขั้นตอนของแฟ้ม (WIT0513) ไม่เกี่ยวกับการเลือกรูปแบบการคุ้มครองในข้อนี้
   */
  const disabledTextboxes = () =>
    screen
      .getAllByRole('textbox')
      .filter((el) => el.tagName === 'INPUT')
      .filter((el) => (el as HTMLInputElement).disabled)

  it('ปิดช่องกรอกชุดเจ้าพนักงานเมื่อเลือกข้อ 4', () => {
    setSelected([4])
    render(<Kb6FormEditor />)

    expect(disabledTextboxes()).toHaveLength(ROSTER_INPUTS)
  })

  it('เปิดช่องกรอกชุดเจ้าพนักงานเมื่อเลือกกลุ่ม 1-3', () => {
    setSelected([1, 2, 3])
    render(<Kb6FormEditor />)

    expect(disabledTextboxes()).toHaveLength(0)
  })

  it('เก็บชื่อที่กรอกไว้เมื่อสลับไปเลือกข้อ 4', () => {
    useFormDraftStore.getState().updateField(6, 'ชุดชื่อ1', 'ร.ต.อ. อนุชา กล้าหาญ')
    setSelected([4])
    render(<Kb6FormEditor />)

    expect(useFormDraftStore.getState().getDraft(6)['ชุดชื่อ1']).toBe('ร.ต.อ. อนุชา กล้าหาญ')
  })
})

describe('คบ.6 หน้ากระดาษ A4 — หน้า 2', () => {
  const HEADING_8_1 = 'มอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองพยาน ตามมาตรการคุ้มครองเบื้องต้น'

  const renderPage2 = () => {
    useFormDraftStore.setState({ manualPage: 2 })
    return render(<FormPaperViewer formId={6} />)
  }

  it('ซ่อนข้อ 8.1 เมื่อเลือกข้อ 4', () => {
    setSelected([4])
    const { container } = renderPage2()

    expect(container.textContent).not.toContain(HEADING_8_1)
  })

  it('แสดงข้อ 8.1 เมื่อเลือกกลุ่ม 1-3', () => {
    setSelected([1, 2, 3])
    const { container } = renderPage2()

    expect(container.textContent).toContain(HEADING_8_1)
  })

  it('แสดงข้อ 8.1 เมื่อยังไม่ได้เลือกอะไร', () => {
    const { container } = renderPage2()

    expect(container.textContent).toContain(HEADING_8_1)
  })

  const printedMethods = () => screen.queryAllByTestId('paper-protection-method').map((e) => e.textContent)

  it('ข้อ 8.2 พิมพ์เฉพาะข้อ 4 เมื่อเลือกข้อ 4 และเรียงเลขเป็น ๑.', () => {
    setSelected([4])
    renderPage2()

    // FB-014 — ข้อ 4 ของ คบ.6 พิมพ์ชื่อ "ประสานงานหน่วยงานอื่น" แทนชื่อเดิม
    expect(printedMethods()).toEqual(['๑. ประสานงานหน่วยงานอื่น'])
  })

  it('ข้อ 8.2 พิมพ์เฉพาะข้อที่เลือกในกลุ่ม 1-3 และเรียงเลขใหม่', () => {
    setSelected([2, 3])
    renderPage2()

    const [, two, three] = PROTECTION_METHOD_OPTIONS
    expect(printedMethods()).toEqual([`๑. ${two.label}`, `๒. ${three.label}`])
  })

  it('ข้อ 8.2 ไม่พิมพ์รูปแบบใดเลยเมื่อยังไม่ได้เลือก', () => {
    const { container } = renderPage2()

    expect(printedMethods()).toEqual([])
    expect(container.textContent).not.toContain(PROTECTION_METHOD_OPTIONS[0].label)
  })

  it('ไม่มีช่องกาเครื่องหมายในข้อ 8.2 — พิมพ์เป็นข้อความล้วนตามต้นฉบับ', () => {
    setSelected([1, 2, 3])
    const { container } = renderPage2()

    expect(container.querySelectorAll('.official-box')).toHaveLength(0)
  })

  it('ไม่มีช่องกาเครื่องหมายแม้เลือกข้อ 4', () => {
    setSelected([4])
    const { container } = renderPage2()

    expect(container.querySelectorAll('.official-box')).toHaveLength(0)
  })
})

describe('คบ.6 8.2 — ต้องเลือกรูปแบบการคุ้มครองก่อนส่งต่อ', () => {
  const warning = () => screen.queryByTestId('method-option-required')

  it('เตือนเมื่อยังไม่ได้เลือกรูปแบบใด', () => {
    render(<Kb6FormEditor />)

    expect(warning()).toHaveTextContent('ยังไม่ได้เลือกรูปแบบการคุ้มครอง — ต้องเลือกก่อนส่งต่อ')
  })

  it('เตือนเมื่อเลือกข้อ 4 แต่ยังไม่ได้เลือก 4.1–4.4', () => {
    setSelected([4])
    render(<Kb6FormEditor />)

    expect(warning()).toHaveTextContent('เลือกข้อ 4 แล้วแต่ยังไม่ได้เลือกตัวเลือกย่อย (4.1–4.4)')
  })

  it('ไม่เตือนเมื่อเลือกข้อ 4 พร้อมตัวเลือกย่อยแล้ว', () => {
    setSelected([4])
    render(<Kb6FormEditor />)

    fireEvent.click(screen.getByTestId('method-option-4-sub-2'))

    expect(warning()).toBeNull()
  })

  it('ไม่เตือนเมื่อเลือกกลุ่ม 1-3', () => {
    setSelected([1, 2, 3])
    render(<Kb6FormEditor />)

    expect(warning()).toBeNull()
  })
})
