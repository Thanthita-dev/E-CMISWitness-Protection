import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { EditorShell } from './fields/FormKit'
import { ActionBarSlotContext, DocAside, EditorViewContext } from './EditorView'

afterEach(cleanup)

const shell = (
  <EditorShell code="คบ.2" title="คำร้องทดสอบ" footer={<button type="button">บันทึกแบบ คบ.2</button>}>
    <label>ชื่อ<input /></label>
    <DocAside><button type="button">ลงนาม</button></DocAside>
  </EditorShell>
)

describe('แบบกรอกในโหมดกรอกบนเอกสาร', () => {
  it('แบบกรอกเต็ม: ช่องกรอก ปุ่มลงนาม และปุ่มบันทึกอยู่ที่เดิม', () => {
    render(shell)
    expect(screen.getByRole('textbox', { name: 'ชื่อ' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'ลงนาม' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'บันทึกแบบ คบ.2' })).toBeInTheDocument()
    expect(screen.getByText('คำร้องทดสอบ')).toBeInTheDocument()
  })

  it('กรอกบนเอกสาร: ช่องกรอกถูกซ่อน ปุ่มท้ายแบบไปอยู่แถบดำเนินการล่าง', () => {
    const Page = () => {
      const [slot, setSlot] = React.useState<HTMLElement | null>(null)
      return <>
        <div hidden><EditorViewContext.Provider value="aside"><ActionBarSlotContext.Provider value={slot}>{shell}</ActionBarSlotContext.Provider></EditorViewContext.Provider></div>
        <footer aria-label="แถบดำเนินการ"><div ref={setSlot} /></footer>
      </>
    }
    render(<Page />)
    expect(screen.queryByRole('textbox', { name: 'ชื่อ' })).not.toBeInTheDocument()
    expect(screen.getByRole('contentinfo', { name: 'แถบดำเนินการ' })).toContainElement(screen.getByRole('button', { name: 'บันทึกแบบ คบ.2' }))
    expect(screen.getByRole('button', { name: 'บันทึกแบบ คบ.2' })).toBeVisible()
  })
})
