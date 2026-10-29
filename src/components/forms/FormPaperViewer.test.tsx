import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { FormPaperViewer } from './FormPaperViewer'
import { FORMS_CATALOG } from '../../lib/constants'
import type { CaseItem } from '../../types/case'
import { useFormDraftStore } from '../../store/useFormDraftStore'

describe('FormPaperViewer', () => {
  FORMS_CATALOG.forEach((f) => {
    it(`renders every page of ${f.code}`, () => {
      const total = f.pages || 1
      for (let p = 1; p <= total; p++) {
        useFormDraftStore.setState({ manualPage: p })
        const { container, unmount } = render(<FormPaperViewer formId={f.n} />)
        expect(container.textContent).toContain('ลับ')
        expect(container.textContent).toContain(f.t)
        unmount()
      }
    })
  })
})

// ตรวจข้อความจริงบนแม่แบบ แยกจากการรับคำอุทธรณ์ใน workflow
 describe('ข้อความแจ้งสิทธิ คบ.16 และ คบ.17 ตามต้นฉบับ', () => {
  it.each([1, 2, 3, 4] as const)('เหตุ 18(%s): คบ.16 คงข้อความ ส่วน คบ.17 ใช้เงื่อนไขข้อ 19', (clause) => {
    const c = { no: 'TEST/2569', person: 'พยานทดสอบ', kb15: { regulationClause: clause }, kb16: { orderNo: '101/2569', issuedAt: '2026-10-28', effectiveAt: '2026-10-29', signedBy: 'เลขาธิการทดสอบ' } } as CaseItem
    const fields = { 'ชื่อพยาน': c.person, 'เหตุยุติ': 'ข้อเท็จจริงที่ยืนยันแล้ว', 'วันที่มีผล': '2026-10-29', 'วันที่ออกคำสั่ง': '2026-10-28' }
    const order = render(<FormPaperViewer formId={16} snapshotCase={c} versionSnapshot={{ fields }} />)
    expect(order.container.textContent).toContain('มีสิทธิอุทธรณ์คำสั่งภายในสามสิบวัน')
    expect(order.container.textContent).toContain('เลขาธิการทดสอบ')
    expect(order.container.textContent).toContain('29/10/2569')
    order.unmount()
    const notice = render(<FormPaperViewer formId={17} snapshotCase={c} versionSnapshot={{ fields }} />)
    expect(notice.container.textContent?.includes('ท่านมีสิทธิอุทธรณ์คำสั่ง')).toBe(clause === 4)
    expect(notice.container.textContent).toContain('101/2569')
    notice.unmount()
  })
 })
