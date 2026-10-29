import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { Kb6FormEditor } from './Kb6FormEditor'
import { FormPaperViewer } from './FormPaperViewer'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import {
  KB6_RATIONALE_FIELD,
  KB6_PROTECTION_METHOD_FIELD,
  KB6_METHOD_EXTERNAL,
} from '../../lib/constants'

/** ประโยคเปิดของข้อความข้อพิจารณามาตรฐานเดิม — FB-013 เลิกพิมพ์แล้ว */
const OLD_STANDARD_TEXT = 'จากการตรวจสอบคำร้องตลอดจนเอกสารหลักฐานต่างๆ'

const HEADING = '๘. ข้อพิจารณา'
const SECTION_8_1 = 'มอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองพยาน ตามมาตรการคุ้มครองเบื้องต้น'
const SECTION_8_2 = '๘.๒ ดำเนินการคุ้มครองโดยการ'

const setRationale = (value: string) =>
  useFormDraftStore.getState().updateField(6, KB6_RATIONALE_FIELD, value)

beforeEach(() => {
  useFormDraftStore.getState().resetDrafts()
  useFormDraftStore.setState({ manualPage: null })
})

afterEach(cleanup)

describe('FB-013 คบ.6 ข้อ 8 — ช่องข้อพิจารณาที่เจ้าหน้าที่พิมพ์เอง ในหน้าแก้ไข', () => {
  it('เป็นช่องว่างเปล่า ไม่มีข้อความมาตรฐานเติมไว้ และไม่มีสวิตช์เดิม', () => {
    render(<Kb6FormEditor />)

    const input = screen.getByTestId('kb6-rationale-input') as HTMLTextAreaElement
    expect(input.tagName).toBe('TEXTAREA')
    expect(input.id).toBe('kb6-rationale')
    expect(input.value).toBe('')
    expect(screen.queryByRole('button', { name: /พิมพ์ข้อความข้อพิจารณามาตรฐาน/ })).toBeNull()
  })

  it('พิมพ์แล้วบันทึกลง draft', () => {
    render(<Kb6FormEditor />)

    fireEvent.change(screen.getByTestId('kb6-rationale-input'), { target: { value: 'เห็นควรคุ้มครอง\nเพราะถูกข่มขู่' } })

    expect(useFormDraftStore.getState().getDraft(6)[KB6_RATIONALE_FIELD]).toBe('เห็นควรคุ้มครอง\nเพราะถูกข่มขู่')
  })

  it('ผูก label กับช่อง', () => {
    render(<Kb6FormEditor />)

    expect(screen.getByLabelText(/ข้อพิจารณา \(เจ้าหน้าที่ระบุเอง/)).toBe(screen.getByTestId('kb6-rationale-input'))
  })
})

describe('FB-013 คบ.6 ข้อ 8 — หน้ากระดาษ A4', () => {
  const renderPage2 = () => {
    useFormDraftStore.setState({ manualPage: 2 })
    return render(<FormPaperViewer formId={6} page={2} />)
  }

  const dottedLines = (container: HTMLElement) => container.querySelectorAll('.border-dotted')

  it('ว่าง = เส้นประให้เขียนด้วยลายมือ และไม่พิมพ์ข้อความมาตรฐานเดิม', () => {
    const { container } = renderPage2()

    expect(dottedLines(container).length).toBeGreaterThanOrEqual(10)
    expect(screen.queryByTestId('kb6-paper-rationale')).toBeNull()
    expect(container.textContent).not.toContain(OLD_STANDARD_TEXT)
  })

  it('เยื้องซ้าย เว้นขอบขวา และเว้นระยะใต้หัวข้อของเส้นประ', () => {
    const { container } = renderPage2()

    const block = container.querySelector('.border-dotted')?.parentElement?.parentElement

    expect(block?.className).toContain('pl-8')
    expect(block?.className).toContain('pr-8')
    expect(block?.className).toContain('pt-3')
  })

  it('มีข้อความ = พิมพ์ใต้หัวข้อโดยคงการขึ้นบรรทัด และไม่มีเส้นประ', () => {
    setRationale('เห็นควรคุ้มครอง\nเพราะถูกข่มขู่')
    const { container } = renderPage2()

    const el = screen.getByTestId('kb6-paper-rationale')
    expect(el.textContent).toBe('เห็นควรคุ้มครอง\nเพราะถูกข่มขู่')
    expect(el.className).toContain('whitespace-pre-wrap')
    expect(dottedLines(container)).toHaveLength(0)
  })

  it('ข้อความที่มีแต่ช่องว่างถือว่าว่าง', () => {
    setRationale('   \n ')
    const { container } = renderPage2()

    expect(screen.queryByTestId('kb6-paper-rationale')).toBeNull()
    expect(dottedLines(container).length).toBeGreaterThanOrEqual(10)
  })

  it('คงหัวข้อ 8. และไม่กระทบข้อ 8.1 และ 8.2', () => {
    const { container } = renderPage2()

    expect(container.textContent).toContain(HEADING)
    expect(container.textContent).toContain(SECTION_8_1)
    expect(container.textContent).toContain(SECTION_8_2)
  })

  it('ใช้ร่วมกับข้อ 4 ได้ — เหลือหัวข้อ 8 ข้อพิจารณา และ 8.2', () => {
    setRationale('ไม่เห็นควรคุ้มครอง')
    useFormDraftStore.getState().updateField(6, KB6_PROTECTION_METHOD_FIELD, [KB6_METHOD_EXTERNAL])
    const { container } = renderPage2()

    expect(container.textContent).toContain(HEADING)
    expect(screen.getByTestId('kb6-paper-rationale').textContent).toBe('ไม่เห็นควรคุ้มครอง')
    expect(container.textContent).toContain(SECTION_8_2)
    expect(container.textContent).not.toContain(SECTION_8_1)
  })
})
