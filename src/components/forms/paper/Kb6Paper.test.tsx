import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { getFormPages } from './formPages'
import type { PaperContext } from './PaperPrimitives'
import { FORMS_CATALOG, KB6_PROTECTION_METHOD_FIELD, KB6_METHOD_SUBITEM_FIELDS } from '../../../lib/constants'

afterEach(cleanup)
const context = (draft: PaperContext['draft'] = {}, caseItem?: PaperContext['caseItem']): PaperContext => ({
  formMeta: FORMS_CATALOG.find(f => f.n === 6)!, draft, caseItem,
  relatedPersons: [], signatures: {},
  val: (key, fallback = '') => String(draft[key] ?? fallback),
})
const page = (n: number, ctx: PaperContext) => render(<>{getFormPages(6)[n - 1](ctx)}</>)

describe('คบ.6 กระดาษตรงกับวิธีคุ้มครองและลำดับลงนาม', () => {
  it('เลือกวิธี 4 ไม่แสดงสรุปเก่าหรือข้อเสนอตั้งชุดเจ้าพนักงาน', () => {
    const ctx = context({
      [KB6_PROTECTION_METHOD_FIELD]: [4],
      [KB6_METHOD_SUBITEM_FIELDS[4]]: 'ส่งให้กรมการปกครอง',
      'รูปแบบการคุ้มครอง': 'จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัย',
    })
    const second = page(2, ctx)
    expect(second.container.textContent).toContain('ประสานงานหน่วยงานอื่น')
    expect(second.container.textContent).toContain('ส่งให้กรมการปกครอง')
    expect(second.container.textContent).not.toContain('จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัย')
    const third = page(3, ctx)
    expect(third.container.textContent).not.toContain('พร้อมได้เสนอคำสั่งมอบหมายเจ้าพนักงาน')
    expect(third.container.textContent).toContain('เห็นควรดำเนินการคุ้มครอง ตาม ๘.๒')
  })
  it('วิธีภายในยังมีข้อเสนอชุดเจ้าพนักงานตามข้อ 8.1', () => {
    const result = page(3, context({ [KB6_PROTECTION_METHOD_FIELD]: [1, 2, 3] }))
    expect(result.container.textContent).toContain('พร้อมได้เสนอคำสั่งมอบหมายเจ้าพนักงาน')
  })
  it('ไม่แสดงความเห็นจากร่างของผู้ที่ยังไม่ลงนาม และแสดงเฉพาะชั้นที่ลงนามแล้ว', () => {
    const draft = { 'ความเห็นผู้บังคับบัญชาชั้นต้น': 'ความเห็นที่ลงนามจริง', 'ความเห็นผู้อำนวยการ': 'ข้อความตั้งต้นที่ยังไม่ลงนาม' }
    const ctx = context(draft, { kb6SupervisorSignedAt: '26/10/2569', kb6SupervisorSignedBy: 'ผู้บังคับบัญชา' } as PaperContext['caseItem'])
    const result = page(3, ctx)
    expect(result.container.textContent).toContain('ความเห็นที่ลงนามจริง')
    expect(result.container.textContent).not.toContain('ข้อความตั้งต้นที่ยังไม่ลงนาม')
  })
})
