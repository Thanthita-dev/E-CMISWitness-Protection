import { describe, expect, it } from 'vitest'
import { formatThaiDate, formatThaiDateTime, getCaseFormNumbers, parseAnyDate, toIsoDate, toIsoDateTimeLocal } from './utils'

describe('getCaseFormNumbers', () => {
  it('ประเมินเป็นกรณีปกติ: ซ่อน คบ.4/คบ.5 ที่เคยแนบเพิ่มไว้ในแฟ้ม (WIT0411)', () => {
    const forms = getCaseFormNumbers({
      form: 'คบ.1',
      urgency: 'normal',
      urgent: false,
      urgencyAssessedAt: '13/09/2569 10:00',
      extraForms: [4, 5, 9],
    })
    expect(forms).toEqual([1, 3, 6, 9])
  })

  it('ประเมินเป็นกรณีเร่งด่วน: แสดง คบ.4/คบ.5 ตามเส้นทาง Fast Track', () => {
    const forms = getCaseFormNumbers({ form: 'คบ.1', urgency: 'urgent', urgent: true, extraForms: [4] })
    expect(forms).toEqual([1, 3, 4, 5])
  })

  it('ยังไม่ประเมินความเร่งด่วน: ไม่ตัดแบบที่แนบเพิ่มไว้', () => {
    const forms = getCaseFormNumbers({ form: 'คบ.1', extraForms: [4] })
    expect(forms).toEqual([1, 3, 4])
  })
})

describe('formatThaiDate (TC-050)', () => {
  it('ISO yyyy-mm-dd (ค.ศ.) แสดงเป็น วว/ดด/ปปปป พ.ศ.', () => {
    expect(formatThaiDate('2026-10-01')).toBe('01/10/2569')
    expect(formatThaiDate('2026-10-01T05:00:00.000Z')).toBe('01/10/2569')
  })

  it('dd/mm/yyyy ที่เป็น พ.ศ. (> 2400) คืนค่าเดิม ไม่ parse ซ้ำจนปีเพี้ยนเป็น 3112', () => {
    expect(formatThaiDate('01/10/2569')).toBe('01/10/2569')
    expect(formatThaiDate('1/9/2569')).toBe('01/09/2569')
    expect(formatThaiDate('01/10/2569')).not.toContain('3112')
  })

  it('dd/mm/yyyy ที่เป็น ค.ศ. ตีความเป็น วัน/เดือน ไม่ใช่ เดือน/วัน', () => {
    expect(formatThaiDate('01/10/2026')).toBe('01/10/2569')
    expect(formatThaiDate('25/12/2026')).toBe('25/12/2569')
  })

  it('ค่าว่างและข้อความที่ไม่ใช่วันที่', () => {
    expect(formatThaiDate(undefined)).toBe('-')
    expect(formatThaiDate('')).toBe('-')
    expect(formatThaiDate('ไม่ระบุ')).toBe('ไม่ระบุ')
  })

  it('Date object', () => {
    expect(formatThaiDate(new Date(2026, 9, 1))).toBe('01/10/2569')
  })

  it('formatThaiDateTime รองรับ dd/mm/พ.ศ. hh:mm', () => {
    expect(formatThaiDateTime('01/10/2569 09:05')).toBe('01/10/2569 09:05')
  })
})

describe('toIsoDate / parseAnyDate', () => {
  it('แปลง พ.ศ. dd/mm/yyyy เป็น ISO ค.ศ.', () => {
    expect(toIsoDate('01/10/2569')).toBe('2026-10-01')
    expect(toIsoDate('2026-10-01')).toBe('2026-10-01')
    expect(toIsoDate('')).toBe('')
    expect(toIsoDate('abc')).toBe('')
  })

  it('parseAnyDate ตีความ dd/mm/ค.ศ. เป็นวัน/เดือน', () => {
    const d = parseAnyDate('01/10/2026')!
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 10, 1])
    const be = parseAnyDate('01/10/2569')!
    expect([be.getFullYear(), be.getMonth() + 1, be.getDate()]).toEqual([2026, 10, 1])
  })
})

describe('วันที่แบบราชการ "4 สิงหาคม 2569"', () => {
  it('แปลงชื่อเดือนเต็ม พ.ศ. เป็น ISO และแสดงเป็น วว/ดด/ปปปป', () => {
    expect(toIsoDate('4 สิงหาคม 2569')).toBe('2026-08-04')
    expect(formatThaiDate('4 สิงหาคม 2569')).toBe('04/08/2569')
    expect(toIsoDate('31 กุมภาพันธ์ 2569')).toBe('')
  })

  it('รองรับเวลาท้าย และแปลงเป็นค่าของ datetime-local', () => {
    expect(toIsoDateTimeLocal('4 สิงหาคม 2569 09:15')).toBe('2026-08-04T09:15')
    expect(toIsoDateTimeLocal('4 สิงหาคม 2569 09.15 น.')).toBe('2026-08-04T09:15')
    expect(toIsoDateTimeLocal('2026-08-04T09:15')).toBe('2026-08-04T09:15')
    expect(toIsoDateTimeLocal('abc')).toBe('')
  })
})
