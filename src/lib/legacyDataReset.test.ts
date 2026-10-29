import { beforeEach, describe, expect, it } from 'vitest'
import { resetLegacyWitnessProtectionData, WP_DATA_RESET_NOTICE_KEY, WP_DATA_VERSION, WP_DATA_VERSION_KEY } from './legacyDataReset'

describe('resetLegacyWitnessProtectionData', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('ล้าง store ของ ก6 ทั้งหมดเมื่อยังไม่มีเครื่องหมายรุ่นข้อมูล และไม่แตะ key อื่น', () => {
    localStorage.setItem('ecmis-auth-storage', '{"state":{"currentRole":"secretary"}}')
    localStorage.setItem('ecmis-case-storage-v2', '{"state":{"cases":[]}}')
    localStorage.setItem('ecmis-font-size', 'large')

    expect(resetLegacyWitnessProtectionData(localStorage, sessionStorage)).toBe(true)
    expect(localStorage.getItem('ecmis-auth-storage')).toBeNull()
    expect(localStorage.getItem('ecmis-case-storage-v2')).toBeNull()
    expect(localStorage.getItem('ecmis-font-size')).toBe('large')
    expect(localStorage.getItem(WP_DATA_VERSION_KEY)).toBe(WP_DATA_VERSION)
    expect(sessionStorage.getItem(WP_DATA_RESET_NOTICE_KEY)).toBe('1')
  })

  it('ไม่ล้างซ้ำเมื่อมีเครื่องหมายรุ่นปัจจุบันแล้ว (เช่น หลังโหลดสถานะสาธิต)', () => {
    localStorage.setItem(WP_DATA_VERSION_KEY, WP_DATA_VERSION)
    localStorage.setItem('ecmis-auth-storage', '{"state":{"currentRole":"officer"}}')

    expect(resetLegacyWitnessProtectionData(localStorage, sessionStorage)).toBe(false)
    expect(localStorage.getItem('ecmis-auth-storage')).not.toBeNull()
  })

  it('ผู้ใช้ใหม่ที่ไม่มีข้อมูล ไม่ต้องแสดงแจ้งเตือน', () => {
    expect(resetLegacyWitnessProtectionData(localStorage, sessionStorage)).toBe(false)
    expect(localStorage.getItem(WP_DATA_VERSION_KEY)).toBe(WP_DATA_VERSION)
    expect(sessionStorage.getItem(WP_DATA_RESET_NOTICE_KEY)).toBeNull()
  })
})
