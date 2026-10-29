import { describe, expect, it } from 'vitest'
import type { CaseItem } from '../types/case'
import { isFormSignedForCase } from './formSignature'

describe('สถานะลายมือชื่อ คบ.11', () => {
  const caseItem = { kb11Signed: false } as CaseItem
  it('ยังรอลงนามหากมีลายมือชื่อเพียงฝ่ายเดียว', () => {
    expect(isFormSignedForCase(11, caseItem, { 'kb11-witness': { signed: true } })).toBe(false)
  })
  it('แสดงลงนามแล้วเมื่อพยานและเจ้าหน้าที่ลงนามครบ แม้ยังไม่บันทึกข้อตกลง', () => {
    expect(isFormSignedForCase(11, caseItem, {
      'kb11-witness': { signed: true }, 'kb11-officer': { signed: true },
    })).toBe(true)
  })
  it('รักษาสถานะข้อตกลงที่บันทึกแล้ว', () => {
    expect(isFormSignedForCase(11, { ...caseItem, kb11Signed: true }, {})).toBe(true)
  })
})
