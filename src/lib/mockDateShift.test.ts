import { describe, expect, it } from 'vitest'
import { shiftMockDates } from './mockDateShift'

const DAY = 86400000

describe('shiftMockDates', () => {
  it('เลื่อนวันเวลา ISO ทุกค่าไปข้างหน้าเท่ากับเวลาที่ผ่านไปนับจากวันที่บันทึก state', () => {
    const data = {
      'ecmis-case-storage-v2': JSON.stringify({ deliveredAt: '2026-09-18T00:00:00.000Z', appealDueAt: '2026-10-18T00:00:00.000Z' }),
    }
    const shifted = shiftMockDates(data, '2026-09-23T00:00:00.000Z', Date.parse('2026-09-23T00:00:00.000Z') + 10 * DAY)
    const c = JSON.parse(shifted['ecmis-case-storage-v2'])
    expect(c.deliveredAt).toBe('2026-09-28T00:00:00.000Z')
    expect(c.appealDueAt).toBe('2026-10-28T00:00:00.000Z')
  })

  it('ไม่แตะวันที่แบบไทยที่ใช้แสดงผล และไม่เปลี่ยนอะไรเมื่อ state ไม่มี capturedAt', () => {
    const data = { k: '{"signedAt":"01/07/2569 10:00","at":"2026-09-18T00:00:00Z"}' }
    expect(shiftMockDates(data, undefined)).toBe(data)
    const shifted = shiftMockDates(data, '2026-09-18T00:00:00Z', Date.parse('2026-09-18T00:00:00Z') + DAY)
    expect(shifted.k).toContain('"signedAt":"01/07/2569 10:00"')
    expect(shifted.k).toContain('"at":"2026-09-19T00:00:00.000Z"')
  })
})
