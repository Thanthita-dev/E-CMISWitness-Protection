import { describe, it, expect } from 'vitest'
import { addProtectionMonths, calendarMonthsBetween } from './protectionMonths'
import { openEpisode, summarizeEpisode, checkExtension } from './episode'
describe('calendar protection months', () => {
  it('adds a month and clamps month-end including leap years', () => {
    expect(addProtectionMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addProtectionMonths('2024-01-31', 1)).toBe('2024-02-29')
    expect(addProtectionMonths('2026-10-18', 1)).toBe('2026-11-18')
    expect(calendarMonthsBetween('2026-01-31', '2026-02-28')).toBe(1)
  })
  it('reaches six months on the calendar boundary, not at 180 days', () => {
    const ep = openEpisode('MAIN', '2026-01-01')
    expect(summarizeEpisode(ep, '2026-06-30').atCap).toBe(false)
    expect(summarizeEpisode(ep, '2026-07-01').atCap).toBe(true)
    expect(checkExtension(ep, 1, '2026-07-01').allowed).toBe(false)
    expect(summarizeEpisode(ep, '2026-06-30').remaining).toBe(1)
  })
})
