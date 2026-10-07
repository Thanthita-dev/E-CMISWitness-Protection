import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'
import { Kb6FormEditor } from './Kb6FormEditor'
import { FormPaperViewer } from './FormPaperViewer'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { KB6_LEGAL_REFS_FIELD, KB6_DEFAULT_LEGAL_REFS } from '../../lib/constants'

/** ช่องว่างไม่ตัดบรรทัด — ไม่ถูกยืดเมื่อจัดข้อความชิดขอบสองข้าง */
const NBSP = ' '

const refs = (): string[] => useFormDraftStore.getState().getDraft(6)[KB6_LEGAL_REFS_FIELD]

const setRefs = (value: string[]) =>
  useFormDraftStore.getState().updateField(6, KB6_LEGAL_REFS_FIELD, value)

/** ช่องกรอกของข้อ 7 — จับจากป้ายกำกับ 7.1 / 7.2 / ... */
const refInput = (n: number) => screen.getByLabelText(new RegExp(`^7\\.${'123456789'[n - 1]}`))

const addButton = () => screen.getByRole('button', { name: /เพิ่มกฎหมาย กฎ ระเบียบ/ })

const removeButtons = () => screen.getAllByRole('button', { name: /ลบข้อ 7\./ })

beforeEach(() => {
  useFormDraftStore.getState().resetDrafts()
  useFormDraftStore.setState({ manualPage: null })
})

afterEach(cleanup)

describe('คบ.6 ข้อ 7 — หน้าแก้ไข', () => {
  it('ตั้งต้นด้วยกฎหมายสามฉบับตามต้นฉบับ', () => {
    render(<Kb6FormEditor />)

    expect(refInput(1)).toHaveValue(KB6_DEFAULT_LEGAL_REFS[0])
    expect(refInput(2)).toHaveValue(KB6_DEFAULT_LEGAL_REFS[1])
    expect(refInput(3)).toHaveValue(KB6_DEFAULT_LEGAL_REFS[2])
  })

  it('แก้ไขข้อความในแต่ละข้อได้', () => {
    render(<Kb6FormEditor />)

    fireEvent.change(refInput(1), { target: { value: 'พระราชบัญญัติฉบับใหม่ พ.ศ. 2570' } })

    expect(refs()[0]).toBe('พระราชบัญญัติฉบับใหม่ พ.ศ. 2570')
    expect(refs()).toHaveLength(3)
  })

  it('กดปุ่มเพิ่มแล้วได้ช่องว่างเป็นข้อ 7.4', () => {
    render(<Kb6FormEditor />)

    fireEvent.click(addButton())

    expect(refs()).toHaveLength(4)
    expect(refs()[3]).toBe('')
    expect(refInput(4)).toHaveValue('')
  })

  it('ลบข้อที่เลือกออก และเลื่อนเลขข้อที่เหลือขึ้น', () => {
    render(<Kb6FormEditor />)

    fireEvent.click(removeButtons()[1])

    expect(refs()).toEqual([KB6_DEFAULT_LEGAL_REFS[0], KB6_DEFAULT_LEGAL_REFS[2]])
    expect(refInput(2)).toHaveValue(KB6_DEFAULT_LEGAL_REFS[2])
  })

  it('ลบออกได้จนหมดทุกข้อ', () => {
    setRefs(['พ.ร.บ. เดียว'])
    render(<Kb6FormEditor />)

    fireEvent.click(removeButtons()[0])

    expect(refs()).toEqual([])
  })

  it('ยังเพิ่มข้อใหม่ได้หลังลบหมดแล้ว', () => {
    setRefs([])
    render(<Kb6FormEditor />)

    fireEvent.click(addButton())

    expect(refs()).toEqual([''])
  })
})

describe('คบ.6 ข้อ 7 — หน้ากระดาษ A4', () => {
  const HEADING = '7. กฎหมาย กฎ ระเบียบที่เกี่ยวข้อง'

  const renderPage2 = () => {
    useFormDraftStore.setState({ manualPage: 2 })
    return render(<FormPaperViewer formId={6} />)
  }

  it('พิมพ์กฎหมายสามฉบับตามค่าตั้งต้น', () => {
    const { container } = renderPage2()

    expect(container.textContent).toContain(`7.1${NBSP}${KB6_DEFAULT_LEGAL_REFS[0]}`)
    expect(container.textContent).toContain(`7.2${NBSP}${KB6_DEFAULT_LEGAL_REFS[1]}`)
    expect(container.textContent).toContain(`7.3${NBSP}${KB6_DEFAULT_LEGAL_REFS[2]}`)
  })

  it('พิมพ์ข้อที่ผู้ใช้เพิ่มเข้ามาเป็นข้อ 7.4', () => {
    setRefs([...KB6_DEFAULT_LEGAL_REFS, 'ประกาศ ป.ป.ท. เรื่องหลักเกณฑ์เพิ่มเติม พ.ศ. 2570'])
    const { container } = renderPage2()

    expect(container.textContent).toContain(`7.4${NBSP}ประกาศ ป.ป.ท. เรื่องหลักเกณฑ์เพิ่มเติม พ.ศ. 2570`)
  })

  it('ข้ามข้อที่เว้นว่างและเลื่อนเลขข้อขึ้นให้ต่อเนื่อง', () => {
    setRefs(['พ.ร.บ. ก', '   ', 'ระเบียบ ข'])
    const { container } = renderPage2()

    expect(container.textContent).toContain(`7.1${NBSP}พ.ร.บ. ก`)
    expect(container.textContent).toContain(`7.2${NBSP}ระเบียบ ข`)
    expect(container.textContent).not.toContain('7.3')
  })

  /**
   * ข้อความยาวถูกจัดชิดขอบสองข้าง (text-justify) — ตัวคั่นที่เป็นอักขระช่องว่าง
   * (รวมถึง nbsp ซึ่งนับเป็น word-separator ตาม CSS Text) จะถูกยืดในบรรทัดที่ตัดคำ
   * ทำให้ข้อสั้นกับข้อยาวเริ่มข้อความไม่ตรงกัน จึงต้องหุ้มเลขข้อด้วย inline-block
   * ซึ่งเป็น atomic inline — การจัดชิดขอบของบรรทัดนอกยืดเนื้อหาข้างในไม่ได้
   */
  it('หุ้มเลขข้อด้วย inline-block เพื่อให้ทุกข้อเริ่มข้อความตรงกัน', () => {
    setRefs(['สั้น'])
    const { container } = renderPage2()

    const marker = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent === `7.1${NBSP}`
    )

    expect(marker).toBeDefined()
    expect(marker!.className).toContain('inline-block')
  })

  it('ยังอ่านข้อความรวมได้ตามปกติ', () => {
    setRefs(['สั้น'])
    const { container } = renderPage2()

    expect(container.textContent).toContain(`7.1${NBSP}สั้น`)
  })

  it('เหลือเพียงหัวข้อ 7 เมื่อไม่มีกฎหมายเลย', () => {
    setRefs([])
    const { container } = renderPage2()

    expect(container.textContent).toContain(HEADING)
    expect(container.textContent).not.toContain('7.1')
  })
})
