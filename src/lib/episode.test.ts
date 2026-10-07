import { describe, it, expect } from 'vitest'
import { addProtectionMonths } from './protectionMonths'
import { episodeCapDays, checkExtension, closeEpisode, cumulativeDays, currentPhaseKind, openEpisode, remainingDays, switchPhase } from './episode'

/** วันที่ ISO ที่ห่างจากวันนี้ไป n วัน (ลบ = อดีต) */
const iso = (offsetDays: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString()
}

describe('Episode — วันสะสมต่อเนื่อง', () => {
  it('Phase ที่ยังเปิดอยู่นับรวมวันเริ่ม: เริ่มวันนี้เท่ากับ 1 วัน', () => {
    const ep = openEpisode('MAIN', iso(0))

    expect(cumulativeDays(ep)).toBe(1)
  })

  it('เปลี่ยน Phase TEMPORARY → MAIN แล้ววันสะสมไม่รีเซ็ต', () => {
    const temp = openEpisode('TEMPORARY', iso(-30), 'คบ.5')
    const ep = switchPhase(temp, 'MAIN', iso(-10), 'คบ.8')

    expect(ep.phases).toHaveLength(2)
    expect(currentPhaseKind(ep)).toBe('MAIN')
    /**
     * ช่วงชั่วคราว [-30, -10) = 20 วัน + ช่วงหลัก [-10, วันนี้] = 11 วัน
     * รวม 31 วัน เท่ากับช่วงเวลาจริงพอดี — วันคาบเกี่ยวไม่ถูกนับซ้ำ
     */
    expect(cumulativeDays(ep)).toBe(31)
  })

  it('ปิด Episode แล้วหยุดนับที่วันที่มีผล', () => {
    const ep = closeEpisode(openEpisode('MAIN', iso(-20)), iso(-10), 'คำสั่ง คบ.16 มีผล')

    expect(cumulativeDays(ep)).toBe(10)
  })
})

describe('เพดานรวม 6 เดือน — กัน คบ.14', () => {
  it('ยังไม่ถึงเพดานแล้วขยายได้เท่าที่เหลือ', () => {
    const ep = openEpisode('MAIN', iso(-30))

    const check = checkExtension(ep, 60)

    expect(check.allowed).toBe(true)
    expect(check.remaining).toBe(episodeCapDays(ep) - 30)
    expect(cumulativeDays(ep)).toBe(31)
  })

  it('ขอเกินวันคงเหลือแล้วไม่อนุญาต และบอกเพดานที่ขยายได้จริง', () => {
    const ep = openEpisode('MAIN', iso(-175))

    const check = checkExtension(ep, 60)

    expect(check.allowed).toBe(false)
    expect(check.maxDays).toBe(remainingDays(ep))
    expect(check.maxDays).toBeLessThan(60)
  })

  it('ครบเพดานแล้วห้ามขยายเลย', () => {
    const ep = openEpisode('MAIN', addProtectionMonths(new Date(), -6))

    const check = checkExtension(ep, 15)

    expect(check.allowed).toBe(false)
    expect(check.maxDays).toBe(0)
    expect(check.reason).toContain('ส่งต่อกรมคุ้มครองสิทธิฯ')
  })
})
