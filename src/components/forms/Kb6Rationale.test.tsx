import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { Kb6FormEditor } from './Kb6FormEditor'
import { FormPaperViewer } from './FormPaperViewer'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import {
  KB6_SHOW_RATIONALE_FIELD,
  KB6_PROTECTION_METHOD_FIELD,
  KB6_METHOD_EXTERNAL,
} from '../../lib/constants'

/** ประโยคเปิดของแต่ละย่อหน้าในข้อความข้อพิจารณามาตรฐาน */
const PARAGRAPHS = [
  '(ชื่อ-สกุล) พยาน เป็น',
  'จากการตรวจสอบคำร้องตลอดจนเอกสารหลักฐานต่างๆ',
  'พิจารณาแล้วเห็นว่าการให้ข้อมูลและพยานหลักฐานของ',
]

const HEADING = '8. ข้อพิจารณา'
const SECTION_8_1 = 'มอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองพยาน ตามมาตรการคุ้มครองเบื้องต้น'
const SECTION_8_2 = '8.2 ดำเนินการคุ้มครองโดยการ'

const shown = (): unknown => useFormDraftStore.getState().getDraft(6)[KB6_SHOW_RATIONALE_FIELD]

const setShown = (value: boolean) =>
  useFormDraftStore.getState().updateField(6, KB6_SHOW_RATIONALE_FIELD, value)

const toggle = () => screen.getByRole('button', { name: /พิมพ์ข้อความข้อพิจารณามาตรฐาน/ })

beforeEach(() => {
  useFormDraftStore.getState().resetDrafts()
  useFormDraftStore.setState({ manualPage: null })
})

afterEach(cleanup)

describe('คบ.6 ข้อ 8 — สวิตช์ข้อความข้อพิจารณา ในหน้าแก้ไข', () => {
  it('ติ๊กไว้เป็นค่าตั้งต้น', () => {
    render(<Kb6FormEditor />)

    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
  })

  it('กดแล้วเลิกติ๊ก', () => {
    render(<Kb6FormEditor />)

    fireEvent.click(toggle())

    expect(shown()).toBe(false)
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
  })

  it('กดซ้ำแล้วกลับมาติ๊ก', () => {
    setShown(false)
    render(<Kb6FormEditor />)

    fireEvent.click(toggle())

    expect(shown()).toBe(true)
  })
})

describe('คบ.6 ข้อ 8 — หน้ากระดาษ A4', () => {
  const renderPage2 = () => {
    useFormDraftStore.setState({ manualPage: 2 })
    return render(<FormPaperViewer formId={6} />)
  }

  const dottedLines = (container: HTMLElement) =>
    container.querySelectorAll('.border-dotted')

  it('พิมพ์ข้อความข้อพิจารณาครบทุกย่อหน้าตามค่าตั้งต้น', () => {
    const { container } = renderPage2()

    PARAGRAPHS.forEach((p) => expect(container.textContent).toContain(p))
  })

  it('ไม่มีเส้นประในข้อ 8 เมื่อพิมพ์ข้อความ', () => {
    const { container } = renderPage2()

    expect(dottedLines(container)).toHaveLength(0)
  })

  it('ซ่อนทุกย่อหน้าเมื่อเลิกติ๊ก', () => {
    setShown(false)
    const { container } = renderPage2()

    PARAGRAPHS.forEach((p) => expect(container.textContent).not.toContain(p))
  })

  it('แทนที่ด้วยเส้นประเมื่อเลิกติ๊ก', () => {
    setShown(false)
    const { container } = renderPage2()

    expect(dottedLines(container).length).toBeGreaterThanOrEqual(10)
  })

  /** เส้นประต้องเยื้องซ้ายตรงกับหัวข้อ 8. เว้นขอบขวา และเว้นระยะใต้หัวข้อ */
  it('เยื้องซ้าย เว้นขอบขวา และเว้นระยะใต้หัวข้อของเส้นประ', () => {
    setShown(false)
    const { container } = renderPage2()

    const block = container.querySelector('.border-dotted')?.parentElement?.parentElement

    expect(block?.className).toContain('pl-8')
    expect(block?.className).toContain('pr-8')
    expect(block?.className).toContain('pt-3')
  })

  it('คงหัวข้อ 8. ไว้เสมอ', () => {
    setShown(false)
    const { container } = renderPage2()

    expect(container.textContent).toContain(HEADING)
  })

  it('ไม่กระทบข้อ 8.1 และ 8.2', () => {
    setShown(false)
    const { container } = renderPage2()

    expect(container.textContent).toContain(SECTION_8_1)
    expect(container.textContent).toContain(SECTION_8_2)
  })

  it('ใช้ร่วมกับข้อ 4 ได้ — เหลือหัวข้อ 8 เส้นประ และ 8.2', () => {
    setShown(false)
    useFormDraftStore.getState().updateField(6, KB6_PROTECTION_METHOD_FIELD, [KB6_METHOD_EXTERNAL])
    const { container } = renderPage2()

    expect(container.textContent).toContain(HEADING)
    expect(container.textContent).toContain(SECTION_8_2)
    expect(container.textContent).not.toContain(SECTION_8_1)
    PARAGRAPHS.forEach((p) => expect(container.textContent).not.toContain(p))
  })
})
