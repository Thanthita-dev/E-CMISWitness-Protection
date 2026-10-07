import { describe, it, expect } from 'vitest'
import { UserRole } from '../types/user'
import { NAV_ITEMS, getNavItemsForRole, getNavTreeForRole } from './permissions'

/**
 * ตาข่ายกันการถดถอยของ "สิทธิ์เห็นเมนู" — ล็อกไว้ว่าแต่ละบทบาทเห็นเมนูใดบ้าง
 *
 * การจัดกลุ่ม/พับเมนูใน Sidebar เปลี่ยนแค่การแสดงผล ไม่ควรทำให้บทบาทใด
 * เห็นเมนูเพิ่มหรือหายไปแม้แต่รายการเดียว ถ้าชุดข้างล่างนี้เปลี่ยน แปลว่ามีบางบทบาท
 * ถูกตัดทางเข้าถึงงานของตน หรือได้เห็นงานของบทบาทอื่น — ต้องตรวจกับ user flow ก่อนแก้ตัวเลข
 */
const EXPECTED_NAV: Record<UserRole, string[]> = {
  got_receiver: ['/registry', '/forms'],
  got_director: ['/registry', '/forms'],
  got_officer: ['/registry', '/activity7-results', '/protection', '/protection-methods', '/protection-monitor', '/protection-reviews', '/protection-extensions', '/termination', '/article14', '/notice', '/delivery-tracking', '/forms'],
  /** ธุรการ — รับคำร้องเข้าทะเบียนและงานสารบรรณนำส่ง */
  receiver: ['/registry', '/delivery-tracking', '/appeal', '/forms'],
  officer: [
    '/registry',
    '/activity7-results',
    '/protection',
    '/protection-methods',
    '/protection-monitor',
    '/protection-reviews',
    '/protection-extensions',
    '/termination',
    '/article14',
    '/notice',
    '/delivery-tracking',
    '/appeal',
    '/forms',
    '/reports',
  ],
  case_owner: [
    '/registry',
    '/activity7-results',
    '/protection',
    '/protection-methods',
    '/protection-monitor',
    '/protection-reviews',
    '/protection-extensions',
    '/termination',
    '/article14',
    '/notice',
    '/delivery-tracking',
    '/appeal',
    '/forms',
    '/reports',
  ],
  /** ผู้บังคับบัญชาชั้นต้น — กลั่นกรองและลงความเห็น ไม่มีงานนำส่งและภาพรวมการคุ้มครอง */
  supervisor: [
    '/registry',
    '/activity7-results',
    '/protection-methods',
    '/protection-monitor',
    '/protection-reviews',
    '/protection-extensions',
    '/termination',
    '/article14',
    '/appeal',
    '/forms',
    '/reports',
  ],
  director: [
    '/registry',
    '/activity7-results',
    '/protection',
    '/protection-methods',
    '/protection-monitor',
    '/protection-reviews',
    '/protection-extensions',
    '/termination',
    '/article14',
    '/appeal',
    '/forms',
    '/reports',
  ],
  /** รองเลขาธิการฯ — กลั่นกรอง คบ.10 แฟ้มอุทธรณ์ และเรื่องตามข้อ 14 (ไม่มีงานติดตามพัสดุ) */
  deputy_secretary: ['/registry', '/activity7-results', '/article14', '/notice', '/appeal', '/forms', '/reports'],
  secretary: [
    '/registry',
    '/activity7-results',
    '/protection',
    '/protection-methods',
    '/protection-monitor',
    '/protection-extensions',
    '/termination',
    '/article14',
    '/notice',
    '/appeal',
    '/forms',
    '/reports',
  ],
  committee: ['/registry', '/activity7-results', '/article14', '/appeal', '/forms'],
  /** ชุดคุ้มครอง — ปฏิบัติการภาคสนามเท่านั้น ไม่เห็นแท็บทบทวน/ขยาย/ยุติ */
  protection: ['/registry', '/protection', '/protection-methods', '/protection-monitor', '/forms'],
  appeal: ['/registry', '/activity7-results', '/termination', '/appeal', '/forms'],
  admin: NAV_ITEMS.map((item) => item.path),
}

const ROLES = Object.keys(EXPECTED_NAV) as UserRole[]

describe('สิทธิ์การเห็นเมนูของแต่ละบทบาท', () => {
  it.each(ROLES)('บทบาท %s เห็นเมนูตรงตามที่กำหนดไว้ทุกรายการ', (role) => {
    expect(getNavItemsForRole(role).map((item) => item.path)).toEqual(EXPECTED_NAV[role])
  })

  it('ทุกเมนูมีอย่างน้อยหนึ่งบทบาทที่เห็นได้ — ไม่มีเมนูที่ไม่มีใครเข้าถึง', () => {
    for (const item of NAV_ITEMS) {
      const owners = ROLES.filter((role) => role !== 'admin' && EXPECTED_NAV[role].includes(item.path))
      expect(owners, item.path).not.toHaveLength(0)
    }
  })
})

describe('โครงเมนูแบบกลุ่มย่อยใน Sidebar', () => {
  /** รวบ path ทั้งหมดจากโครงต้นไม้ ไม่ว่าจะอยู่ระดับบนหรือในกลุ่มย่อย */
  const flattenTree = (role: UserRole): string[] =>
    getNavTreeForRole(role).flatMap((group) =>
      group.nodes.flatMap((node) => (node.kind === 'item' ? [node.item.path] : node.items.map((item) => item.path)))
    )

  it.each(ROLES)('โครงกลุ่มของบทบาท %s มีเมนูครบเท่ากับรายการแบน — การจัดกลุ่มไม่ทำให้เมนูหาย', (role) => {
    expect([...flattenTree(role)].sort()).toEqual([...EXPECTED_NAV[role]].sort())
  })

  it.each(ROLES)('โครงกลุ่มของบทบาท %s ไม่มีเมนูซ้ำและไม่มีกลุ่มว่าง', (role) => {
    const paths = flattenTree(role)
    expect(new Set(paths).size).toBe(paths.length)
    for (const group of getNavTreeForRole(role)) {
      expect(group.nodes.length, group.key).toBeGreaterThan(0)
      for (const node of group.nodes) {
        if (node.kind === 'section') expect(node.items.length, node.key).toBeGreaterThan(1)
      }
    }
  })

  it('กลุ่มย่อยที่เหลือรายการเดียวจะถูกคลี่ออกมาเป็นเมนูเดี่ยว', () => {
    /** คณะกรรมการเห็นเฉพาะ '/article14' ในกลุ่มดำเนินมาตรการ จึงไม่ควรต้องกดกางหัวข้อ */
    const operations = getNavTreeForRole('committee').find((group) => group.key === 'operations')
    expect(operations?.nodes).toEqual([
      { kind: 'item', item: NAV_ITEMS.find((item) => item.path === '/article14') },
    ])
  })

  it('ชุดคุ้มครองเห็นกลุ่มย่อย "คุ้มครองและติดตาม" แต่ไม่เห็นกลุ่ม "ทบทวนและสิ้นสุด"', () => {
    const operations = getNavTreeForRole('protection').find((group) => group.key === 'operations')
    const sections = operations?.nodes.filter((node) => node.kind === 'section') ?? []
    expect(sections.map((node) => (node.kind === 'section' ? node.key : null))).toEqual(['protect'])
  })
})
