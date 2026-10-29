import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AdditionalFormEditor } from './AdditionalFormEditor'
import { getAdditionalForm } from '../../lib/additionalForms'
import { useAdditionalFormStore, useLegacyAdditionalFormStore } from '../../store/useAdditionalFormStore'

const police = getAdditionalForm('police-extension-request')!
const memo = getAdditionalForm('extension-memo')!

beforeEach(() => {
  localStorage.clear()
  useAdditionalFormStore.setState({ drafts: {} })
  useLegacyAdditionalFormStore.setState({ drafts: {} })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

/** หน้าเปิดมาที่ "กรอกบนเอกสาร" — สลับไปกรอกผ่านแบบฟอร์มเพื่อกรอกตามช่อง */
const renderForm = (ui: React.ReactElement) => {
  const view = render(ui)
  fireEvent.click(screen.getByRole('radio', { name: 'กรอกผ่านแบบฟอร์ม' }))
  return view
}

const preview = () => screen.getByTitle(`ตัวอย่าง ${police.title}`) as HTMLIFrameElement

describe('หน้ากรอกแบบฟอร์มและหนังสือประกอบ', () => {
  it('เปิดมาที่กรอกบนเอกสาร: กระดาษพิมพ์ได้ และบันทึกร่างได้จากแผงข้างกระดาษ', () => {
    render(<AdditionalFormEditor template={police} onBack={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'กรอกบนเอกสาร' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByLabelText('ค้นหาช่อง')).not.toBeInTheDocument()
    expect(preview()).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกร่าง' }))
    expect(screen.getByRole('status')).toHaveTextContent('บันทึกร่างในเบราว์เซอร์นี้แล้ว')
  })

  it('กรอกตามช่องที่มีชื่อ บันทึก แล้วเปิดร่างกลับมาได้โดยไม่แก้ต้นฉบับ', async () => {
    const view = renderForm(<AdditionalFormEditor template={police} onBack={vi.fn()} />)
    expect(document.body).not.toHaveTextContent('ลูกค้า')
    expect(screen.getByRole('button', { name: 'พิมพ์ / บันทึก PDF' })).toBeInTheDocument()
    expect(preview().getAttribute('srcdoc')).toContain('ขอความอนุเคราะห์ขยายระยะเวลาให้ความคุ้มครองพยาน')
    const subject = screen.getByLabelText('เรื่อง')
    expect(subject).toHaveValue('ขอความอนุเคราะห์ขยายระยะเวลาให้ความคุ้มครองพยาน')
    fireEvent.change(subject, { target: { value: 'เรื่องที่กรอกใหม่' } })
    fireEvent.change(screen.getByLabelText(/ชื่อพยาน/), { target: { value: 'นายทดสอบ ใจดี' } })
    expect(screen.getByRole('status')).toHaveTextContent('มีการแก้ไขที่ยังไม่ได้บันทึก')
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกร่าง' }))
    view.unmount()

    const persisted = localStorage.getItem('ecmis-a6-additional-form-fields')!
    useAdditionalFormStore.setState({ drafts: {} })
    localStorage.setItem('ecmis-a6-additional-form-fields', persisted)
    await useAdditionalFormStore.persist.rehydrate()
    renderForm(<AdditionalFormEditor template={police} onBack={vi.fn()} />)
    expect(screen.getByLabelText('เรื่อง')).toHaveValue('เรื่องที่กรอกใหม่')
    expect(screen.getByLabelText(/ชื่อพยาน/)).toHaveValue('นายทดสอบ ใจดี')
    // ตัวอย่างที่เปิดใหม่สร้างจากร่างที่บันทึก
    expect(preview().getAttribute('srcdoc')).toContain('เรื่องที่กรอกใหม่')
    expect(police.fields.find((field) => field.id === 'subject')!.sample).toBe('ขอความอนุเคราะห์ขยายระยะเวลาให้ความคุ้มครองพยาน')
    expect(screen.getByRole('link', { name: 'ดาวน์โหลด Word ต้นฉบับ' })).toHaveAttribute('href', police.sourceUrl)
  })

  it('เก็บร่างของแต่ละแบบแยกกัน และการเริ่มใหม่ยังยกเลิกได้', () => {
    useAdditionalFormStore.getState().saveDraft(memo.id, { values: { subject: 'ร่างอีกแบบ' }, paragraphs: {} })
    renderForm(<AdditionalFormEditor template={police} onBack={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('เรื่อง'), { target: { value: 'ฉบับใหม่' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกร่าง' }))
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มร่างใหม่จากต้นฉบับ' }))
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.getByLabelText('เรื่อง')).toHaveValue('ฉบับใหม่')
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มร่างใหม่จากต้นฉบับ' }))
    fireEvent.click(screen.getByRole('button', { name: 'คืนข้อความต้นฉบับ' }))
    expect(screen.getByLabelText('เรื่อง')).toHaveValue('ขอความอนุเคราะห์ขยายระยะเวลาให้ความคุ้มครองพยาน')
    expect(useAdditionalFormStore.getState().drafts[memo.id].values.subject).toBe('ร่างอีกแบบ')
    expect(useAdditionalFormStore.getState().drafts[police.id].values.subject).toBe('ฉบับใหม่')
  })

  it('กลับรายการแล้วเก็บข้อมูลล่าสุดก่อนออกจากแบบ', () => {
    const onBack = vi.fn()
    renderForm(<AdditionalFormEditor template={police} onBack={onBack} />)
    fireEvent.change(screen.getByLabelText('เรื่อง'), { target: { value: 'ข้อความก่อนกลับ' } })
    fireEvent.click(screen.getByRole('button', { name: 'กลับรายการแบบฟอร์ม' }))
    expect(useAdditionalFormStore.getState().drafts[police.id].values.subject).toBe('ข้อความก่อนกลับ')
    expect(onBack).toHaveBeenCalled()
  })

  it('ค้นหาช่องในฉบับยาว และคลิกช่องบนกระดาษแล้วไปยังช่องกรอก', () => {
    renderForm(<AdditionalFormEditor template={memo} onBack={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('ค้นหาช่อง'), { target: { value: 'ความเห็นผู้อำนวยการกอง' } })
    expect(screen.getByLabelText('๑๑. ความเห็นผู้อำนวยการกอง')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('ค้นหาช่อง'), { target: { value: '' } })
    const frame = screen.getByTitle(`ตัวอย่าง ${memo.title}`) as HTMLIFrameElement
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'a6-field', id: 'caseNo' }, source: frame.contentWindow })) })
    expect(screen.getByLabelText(/เลขสำนวนคดี/)).toBeInTheDocument()
    act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'a6-paragraph', key: '4' }, source: frame.contentWindow })) })
    expect(screen.getByLabelText('แก้ข้อความทั้งย่อหน้า')).toHaveValue('เรียน  เลขาธิการคณะกรรมการ ป.ป.ท.')
  })

  it('ร่างรูปแบบเดิมยังอยู่และดาวน์โหลดได้ ไม่ถูกทับ', () => {
    useLegacyAdditionalFormStore.setState({ drafts: { [police.id]: { texts: ['ร่างเก่า'], updatedAt: '2026-10-13T00:00:00.000Z' } } })
    renderForm(<AdditionalFormEditor template={police} onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'ดาวน์โหลดร่างเดิม' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('เรื่อง'), { target: { value: 'ใหม่' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกร่าง' }))
    expect(useLegacyAdditionalFormStore.getState().drafts[police.id].texts).toEqual(['ร่างเก่า'])
  })
})
