import { describe, it, expect } from 'vitest'
import { canAccessRoute, canLinkMainCase, DOSSIER_CARD_ROLES, getNavItemsForRole } from './permissions'

/**
 * เส้นทางของ 11A/11B/11C/11D มีทั้งแบบรายการ (พหูพจน์) และรายสำนวน (เอกพจน์ + พารามิเตอร์)
 * ถ้าลืมประกาศตัวใดตัวหนึ่ง RouteGuard จะบล็อกหน้าที่เพิ่งสร้างโดยไม่มีอาการฟ้องตอน build
 */
describe('สิทธิ์เข้าถึงเส้นทางขั้น 11A-11D', () => {
  const CASE = 'WP-2569-000501'

  it('เจ้าหน้าที่เข้าได้ทั้งหน้ารายการและหน้ารายสำนวนของทุกขั้น', () => {
    for (const path of [
      '/protection-reviews',
      `/protection-review/${CASE}`,
      '/protection-extensions',
      `/protection-extension/${CASE}`,
      '/termination',
      `/termination/${CASE}`,
    ]) {
      expect(canAccessRoute('officer', path), path).toBe(true)
    }
  })

  it('ผู้บังคับบัญชาเข้าหน้า 11B ได้ เพราะเป็นผู้ตรวจ คบ.14 ที่ WIT1117', () => {
    expect(canAccessRoute('supervisor', '/protection-extensions')).toBe(true)
    expect(canAccessRoute('supervisor', `/protection-extension/${CASE}`)).toBe(true)
  })

  it('ผอ.สำนัก/กอง เข้าหน้า 11A ได้ เพราะเป็นผู้อนุมัติการเปลี่ยนวิธีที่ WIT1110', () => {
    expect(canAccessRoute('director', '/protection-reviews')).toBe(true)
    expect(canAccessRoute('director', `/protection-review/${CASE}`)).toBe(true)
  })

  it('บทบาทที่ไม่มีสิทธิ์ยังถูกกันไว้เหมือนเดิม', () => {
    expect(canAccessRoute('receiver', `/protection-extension/${CASE}`)).toBe(false)
  })

  it('เมนู Sidebar ของเจ้าหน้าที่มีรายการขยายเวลา (คบ.14)', () => {
    expect(getNavItemsForRole('officer').some((i) => i.path === '/protection-extensions')).toBe(true)
  })
})

describe('canLinkMainCase — เฉพาะเจ้าของสำนวนที่ได้รับมอบหมายหรือเจ้าหน้าที่ผู้รับเรื่องเอง', () => {
  const assigned = { assignedOfficerUserId: 'off-1', receivedByUserId: 'rcv-9' }

  it('ธุรการและ ผอ. เชื่อมโยงไม่ได้', () => {
    expect(canLinkMainCase('receiver', assigned, 'rcv-9')).toBe(false)
    expect(canLinkMainCase('director', assigned, 'off-1')).toBe(false)
  })

  it('เจ้าหน้าที่ที่ ผอ. มอบหมายเชื่อมโยงได้', () => {
    expect(canLinkMainCase('officer', assigned, 'off-1')).toBe(true)
    expect(canLinkMainCase('case_owner', assigned, 'off-1')).toBe(true)
  })

  it('เจ้าหน้าที่ที่เป็นผู้รับคำร้องเอง (officer-receiver) เชื่อมโยงได้', () => {
    expect(canLinkMainCase('officer', { receivedByUserId: 'off-2' }, 'off-2')).toBe(true)
  })

  it('เจ้าหน้าที่คนอื่นเชื่อมโยงไม่ได้', () => {
    expect(canLinkMainCase('officer', assigned, 'off-3')).toBe(false)
  })

  it('สำนวนที่ยังไม่มอบหมาย เจ้าหน้าที่ที่ไม่ใช่ผู้รับเรื่องเชื่อมโยงไม่ได้', () => {
    expect(canLinkMainCase('officer', { receivedByUserId: 'rcv-9' }, 'off-1')).toBe(false)
    expect(canLinkMainCase('officer', {}, 'off-1')).toBe(false)
  })

  it('แอดมินเชื่อมโยงได้เสมอ', () => {
    expect(canLinkMainCase('admin', {}, 'anyone')).toBe(true)
  })
})

describe('DOSSIER_CARD_ROLES.mainCaseLink', () => {
  it('ธุรการไม่เห็นการ์ดคดีหลัก แต่ผู้ปฏิบัติและ ผอ. ยังเห็น', () => {
    expect(DOSSIER_CARD_ROLES.mainCaseLink).not.toContain('receiver')
    expect(DOSSIER_CARD_ROLES.mainCaseLink).toEqual(expect.arrayContaining(['officer', 'case_owner', 'director']))
  })
})
