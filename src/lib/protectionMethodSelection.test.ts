import { describe, it, expect } from 'vitest'
import { missingMethodSubitem, protectionMethodSelectionIssue } from './constants'

describe('รูปแบบการคุ้มครอง คบ.4/คบ.6 — เงื่อนไขก่อนส่งต่อ', () => {
  it('ยังไม่ได้เลือกรูปแบบใด', () => {
    expect(protectionMethodSelectionIssue([], {})).toBe('ยังไม่ได้เลือกรูปแบบการคุ้มครอง')
  })

  it('เลือกข้อ 4 แต่ยังไม่ได้เลือกหน่วยงาน 4.1–4.4', () => {
    expect(missingMethodSubitem([4], { 4: '' })).toBe(4)
    expect(protectionMethodSelectionIssue([4], { 4: ' ' })).toBe(
      'เลือกข้อ 4 แล้วแต่ยังไม่ได้เลือกตัวเลือกย่อย (4.1–4.4)'
    )
  })

  it('ครบเมื่อเลือกข้อ 4 พร้อมหน่วยงาน หรือเลือกข้อที่ไม่มีตัวเลือกย่อย', () => {
    expect(protectionMethodSelectionIssue([4], { 4: 'ส่งให้ตำรวจ' })).toBeUndefined()
    expect(protectionMethodSelectionIssue([1, 2, 3])).toBeUndefined()
  })
})
