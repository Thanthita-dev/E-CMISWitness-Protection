import { describe, it, expect } from 'vitest'
import { canAccessRoute, canLinkMainCase, DOSSIER_CARD_ROLES, getNavItemsForRole, isAppealFolderStageReviewer, isCaseClosed, isLegacyCase } from './permissions'

/**
 * เส้นทางของ 11B/11C/11D มีทั้งแบบรายการ (พหูพจน์) และรายสำนวน (เอกพจน์ + พารามิเตอร์)
 * ถ้าลืมประกาศตัวใดตัวหนึ่ง RouteGuard จะบล็อกหน้าที่เพิ่งสร้างโดยไม่มีอาการฟ้องตอน build
 */
describe('สิทธิ์เข้าถึงเส้นทางขั้น 11B-11D', () => {
  const CASE = '0501/2569'

  it('เจ้าหน้าที่เข้าได้ทั้งหน้ารายการและหน้ารายสำนวนของทุกขั้น', () => {
    for (const path of [
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

describe('หน้าสลับบทบาท /role', () => {
  it('ทุกบทบาทเข้าได้ แต่ไม่แสดงในเมนู', () => {
    for (const role of ['receiver', 'officer', 'director', 'got_receiver', 'appeal', 'committee'] as const) {
      expect(canAccessRoute(role, '/role'), role).toBe(true)
      expect(getNavItemsForRole(role).some((item) => item.path === '/role'), role).toBe(false)
    }
  })
})

describe('isCaseClosed กับเรื่องที่ย้ายมาจากระบบเดิม', () => {
  it('legacySource ทำให้ล็อกแม้ยังไม่ปิดงาน', () => {
    expect(isCaseClosed({ stage: 'protection', legacySource: { system: 'old' } })).toBe(true)
    expect(isLegacyCase({ legacySource: { system: 'old' } })).toBe(true)
  })
  it('เรื่องปกติยังใช้กฎเดิม', () => {
    expect(isCaseClosed({ stage: 'protection' })).toBe(false)
    expect(isCaseClosed({ stage: 'terminated', closedAt: '2569-01-01' })).toBe(true)
    expect(isCaseClosed(null)).toBe(false)
  })
})

/** แฟ้มอุทธรณ์ต้องเข้าคิว "งานของฉัน" ของชั้นที่ถึงตาเท่านั้น — เจ้าหน้าที่เสนอแล้วต้องขึ้นคิว ผบช.ชั้นต้น */
describe('isAppealFolderStageReviewer', () => {
  const folder = (stage: string) => ({ appealFolder: { stage } as never })

  it('แฟ้มที่เจ้าหน้าที่เสนอแล้วอยู่ในคิว ผบช.ชั้นต้น ไม่ใช่ ผอ. หรือรองเลขาธิการฯ', () => {
    expect(isAppealFolderStageReviewer('supervisor', folder('supervisor'))).toBe(true)
    expect(isAppealFolderStageReviewer('director', folder('supervisor'))).toBe(false)
    expect(isAppealFolderStageReviewer('deputy_secretary', folder('supervisor'))).toBe(false)
  })

  it('ไล่ตามลำดับชั้นจนถึงฝ่ายเลขานุการคณะกรรมการ', () => {
    expect(isAppealFolderStageReviewer('officer', folder('officer_opinion'))).toBe(true)
    expect(isAppealFolderStageReviewer('supervisor', folder('late_pending'))).toBe(true)
    expect(isAppealFolderStageReviewer('director', folder('director'))).toBe(true)
    expect(isAppealFolderStageReviewer('deputy_secretary', folder('deputy'))).toBe(true)
    expect(isAppealFolderStageReviewer('secretary', folder('secretary'))).toBe(true)
    expect(isAppealFolderStageReviewer('committee', folder('agenda'))).toBe(true)
    expect(isAppealFolderStageReviewer('secretary', folder('resolved'))).toBe(false)
  })

  it('ระหว่างธุรการลงทะเบียนนำส่ง แฟ้มยังไม่เข้าคิวผู้รับปลายทาง', () => {
    expect(isAppealFolderStageReviewer('deputy_secretary', { ...folder('deputy'), sarabanDispatch: { flow: 'appeal' } as never })).toBe(false)
  })
})


describe('หน้าลงนามหนังสือประสานรายฉบับ', () => {
  it('เลขาธิการและแอดมินเปิดแฟ้มที่เลขคำร้องมี / ได้', () => {
    for (const role of ['secretary', 'admin'] as const) {
      expect(canAccessRoute(role, '/coordination/0501%2F2569')).toBe(true)
    }
  })
  it('เปิดเอกสารให้บทบาทอื่นตรวจร่างได้ แต่ไม่เปิดเส้นทางชื่อคล้ายกัน', () => {
    for (const role of ['receiver', 'secretary_receiver', 'officer', 'director', 'deputy_secretary'] as const) {
      expect(canAccessRoute(role, '/coordination/0501%2F2569')).toBe(true)
    }
    expect(canAccessRoute('secretary', '/coordination-other/0501%2F2569')).toBe(false)
  })
})
