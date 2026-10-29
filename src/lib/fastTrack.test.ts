import { describe, it, expect } from 'vitest'
import { kb5TemporaryPeriod } from './fastTrack'
import { isoFromThaiParts, thaiPartsFromIso } from './utils'

const kb5 = (start: [string, string, string], end: [string, string, string]) => ({
  เริ่มวันที่: start[0],
  เริ่มเดือน: start[1],
  'เริ่มพ.ศ.': start[2],
  ถึงวันที่: end[0],
  ถึงเดือน: end[1],
  'ถึงพ.ศ.': end[2],
})

describe('วันที่แบบแยกช่อง วัน / เดือน / พ.ศ.', () => {
  it('อ่านเดือนได้ทั้งชื่อเต็ม ตัวย่อ และตัวเลข', () => {
    expect(isoFromThaiParts('1', 'มกราคม', '2569')).toBe('2026-01-01')
    expect(isoFromThaiParts('1', 'ม.ค.', '2569')).toBe('2026-01-01')
    expect(isoFromThaiParts('1', '1', '2569')).toBe('2026-01-01')
  })

  it('วันที่ที่ไม่มีจริงหรือยังกรอกไม่ครบคืนค่าว่าง', () => {
    expect(isoFromThaiParts('30', 'กุมภาพันธ์', '2569')).toBe('')
    expect(isoFromThaiParts('', 'มกราคม', '2569')).toBe('')
    expect(isoFromThaiParts('1', 'มกรา', '2569')).toBe('')
  })

  it('เขียนกลับจาก ISO เป็นชื่อเดือนเต็มและปี พ.ศ.', () => {
    expect(thaiPartsFromIso('2026-01-30')).toEqual({ day: '30', month: 'มกราคม', year: '2569' })
  })
})

describe('kb5TemporaryPeriod — ช่วงคุ้มครองชั่วคราวจากร่าง คบ.5 (WIT0603)', () => {
  it('นับรวมวันแรกและวันสุดท้าย', () => {
    const p = kb5TemporaryPeriod(kb5(['1', 'มกราคม', '2569'], ['30', 'มกราคม', '2569']))
    expect(p).toMatchObject({ startIso: '2026-01-01', endIso: '2026-01-30', days: 30 })
    expect(p.error).toBeUndefined()
  })

  it('ช่วงวันเดียวนับเป็น 1 วัน', () => {
    expect(kb5TemporaryPeriod(kb5(['5', 'มีนาคม', '2569'], ['5', 'มีนาคม', '2569'])).days).toBe(1)
  })

  it('ยังไม่กรอกช่วงวันที่ → ไม่มีจำนวนวันและแจ้งให้ระบุใน คบ.5', () => {
    const p = kb5TemporaryPeriod({})
    expect(p.days).toBe(0)
    expect(p.error).toContain('คบ.5')
  })

  it('วันสิ้นสุดอยู่ก่อนวันเริ่ม → ใช้ไม่ได้', () => {
    const p = kb5TemporaryPeriod(kb5(['10', 'มกราคม', '2569'], ['1', 'มกราคม', '2569']))
    expect(p.days).toBe(0)
    expect(p.error).toContain('ก่อนวันที่เริ่ม')
  })
})
