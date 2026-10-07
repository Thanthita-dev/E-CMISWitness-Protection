import { UserRole } from '../types/user'
import { CaseItem } from '../types/case'
import { canOperateHandoff, canViewHandoffCase } from './protectionHandoff'

/**
 * สิทธิ์การเข้าถึงตามบทบาท — ใช้ร่วมกันทั้งเมนู (Sidebar), การกันเส้นทาง (RouteGuard)
 * และการซ่อนการ์ด/ปุ่มในแฟ้มคำร้อง เพื่อให้ทุกจุดตัดสินจากแหล่งเดียว
 *
 * Super Admin เห็นและทำได้ทุกอย่าง (ใช้สำหรับงานระบบและการสาธิต)
 */

export interface NavItem {
  path: string
  label: string
  icon: string
  group: NavGroupKey
  /**
   * กลุ่มย่อยที่พับ/กางได้ใน Sidebar — ใช้กับกลุ่ม 'operations' ที่มีเมนูจำนวนมาก
   * ไม่ระบุ = แสดงเป็นรายการระดับบนของกลุ่มนั้นตามปกติ
   */
  section?: NavSectionKey
}

export type NavGroupKey = 'intake' | 'operations' | 'dispatch' | 'info'
export type NavSectionKey = 'protect' | 'review'

/**
 * เมนูทั้งหมดของระบบ เรียงตามกลุ่ม/กลุ่มย่อยที่แสดงใน Sidebar
 *
 * การจัดกลุ่มนี้เปลี่ยนเฉพาะการ "แสดงผล" เท่านั้น — path ทุกเส้นทางคงเดิมทั้งหมด
 * เพื่อไม่ให้กระทบ RouteGuard (เทียบแบบ prefix), ลิงก์ข้ามหน้า และชุดทดสอบ e2e
 * ที่อ้าง URL ตรง ๆ ส่วนสิทธิ์การเห็นยังตัดสินรายเมนูด้วย canAccessRoute เหมือนเดิม
 */
export const NAV_ITEMS: NavItem[] = [
  { path: '/registry', label: 'ทะเบียนและรับคำร้อง', icon: 'fa-clipboard-list', group: 'intake' },
  { path: '/activity7-results', label: 'ผลพิจารณาและคำสั่ง', icon: 'fa-file-circle-check', group: 'intake' },

  /** กลุ่มย่อย "คุ้มครองและติดตาม" — แท็บ 08A/08B และรอบรายงาน คบ.13 (แท็บ 10) */
  { path: '/protection', label: 'ภาพรวมการคุ้มครอง', icon: 'fa-shield', group: 'operations', section: 'protect' },
  { path: '/protection-methods', label: 'ดำเนินการตามวิธีคุ้มครอง', icon: 'fa-list-check', group: 'operations', section: 'protect' },
  { path: '/protection-monitor', label: 'รายงานผลการคุ้มครอง (คบ.13)', icon: 'fa-file-waveform', group: 'operations', section: 'protect' },

  /** กลุ่มย่อย "ทบทวนและสิ้นสุด" — แท็บ 11A-11D และทางออกตามข้อ 14 (แท็บ 08C) */
  { path: '/protection-reviews', label: 'รายการทบทวน', icon: 'fa-diagram-project', group: 'operations', section: 'review' },
  { path: '/protection-extensions', label: 'ขยายเวลา (คบ.14)', icon: 'fa-calendar-plus', group: 'operations', section: 'review' },
  { path: '/termination', label: 'ยุติการคุ้มครอง (คบ.15-17)', icon: 'fa-flag-checkered', group: 'operations', section: 'review' },
  { path: '/article14', label: 'ส่งต่อกรมคุ้มครองสิทธิฯ', icon: 'fa-building-columns', group: 'operations', section: 'review' },

  /**
   * กลุ่ม "แจ้งผลและนำส่ง" — ขั้นก่อนนำส่ง (คบ.9/10/11) กับขั้นติดตามพัสดุ เป็นงานช่วงเดียวกัน
   * แยกเป็นคนละเมนูต่อไป เพราะธุรการ (receiver) มีสิทธิ์เฉพาะ '/delivery-tracking'
   * ส่วนรองเลขาธิการฯ มีสิทธิ์เฉพาะ '/notice' — ยุบเป็นหน้าเดียวจะทำให้บทบาทหนึ่งเห็นงานของอีกบทบาท
   */
  { path: '/notice', label: 'แจ้งผลแก่พยาน', icon: 'fa-paper-plane', group: 'dispatch' },
  { path: '/delivery-tracking', label: 'การนำส่งและติดตามพัสดุ', icon: 'fa-truck-fast', group: 'dispatch' },
  { path: '/appeal', label: 'อุทธรณ์', icon: 'fa-rotate-left', group: 'dispatch' },

  { path: '/forms', label: 'แบบฟอร์ม คบ. (1-17)', icon: 'fa-file-lines', group: 'info' },
  { path: '/reports', label: 'รายงานและสถิติ', icon: 'fa-chart-column', group: 'info' },
]

/** เส้นทางที่ทุกบทบาทเข้าได้ — หน้าแรก คิวงานของตนเอง แฟ้มคำร้อง แบบฟอร์ม และการแจ้งเตือน */
const COMMON_ROUTES = ['/', '/registry', '/queue', '/dossier', '/forms', '/form', '/notifications']

/**
 * '/protection-method' (เอกพจน์) เป็นคนละ path กับ '/protection-methods' จึงต้องระบุทั้งคู่
 * '/protection-review' (เอกพจน์ — หน้าเลือกแนวทางรายสำนวน) กับ '/protection-reviews' (พหูพจน์ — รายการ) เช่นกัน
 * '/protection-extension' (11B รายสำนวน) กับ '/protection-extensions' (รายการ) ก็ต้องระบุทั้งคู่ด้วยเหตุผลเดียวกัน
 * '/protection-monitor' (แท็บ 10 รายสำนวน) ก็เช่นกัน — ไม่ได้อยู่ใต้ '/protection/' จึงไม่ถูกครอบโดยอัตโนมัติ
 */
const OPS_ROUTES = [
  '/protection',
  '/protection-monitor',
  '/protection-methods',
  '/protection-method',
  '/protection-extensions',
  '/protection-extension',
  '/article14',
  '/termination',
]

/** เส้นทางเฉพาะของแต่ละบทบาท (นอกเหนือจาก COMMON_ROUTES) */
const ROLE_ROUTES: Record<UserRole, string[]> = {
  got_receiver: [],
  got_director: [],
  got_officer: ['/notice', '/delivery-tracking', ...OPS_ROUTES, '/protection-reviews', '/protection-review', '/activity7-results'],
  /** ธุรการ — รับคำร้องเข้าทะเบียนและงานสารบรรณนำส่ง */
  /** 09B WIT0912 — ธุรการรับคำอุทธรณ์ช่องทางหนังสือเข้าระบบ (เข้าแฟ้มเดิม) */
  receiver: ['/intake', '/delivery-tracking', '/appeal'],
  /** เจ้าหน้าที่ ป.ป.ท. — ผู้ปฏิบัติเต็มเส้นทางตั้งแต่รับเรื่องถึงคุ้มครอง */
  officer: [
    '/intake',
    '/notice',
    '/delivery-tracking',
    ...OPS_ROUTES,
    '/protection-reviews',
    '/protection-review',
    '/activity7-results',
    '/reports',
    /** 09B — เจ้าหน้าที่ผู้รับผิดชอบตรวจแฟ้มอุทธรณ์ (WIT0914/0915) และทำหนังสือแจ้งผล (WIT0921) */
    '/appeal',
    '/appeal-folder',
  ],
  /** เจ้าของสำนวน — สิทธิ์เดียวกับเจ้าหน้าที่ ป.ป.ท. */
  case_owner: [
    '/intake',
    '/notice',
    '/delivery-tracking',
    ...OPS_ROUTES,
    '/protection-reviews',
    '/protection-review',
    '/activity7-results',
    '/reports',
    '/appeal',
    '/appeal-folder',
  ],
  /** ผู้บังคับบัญชาชั้นต้น — กลั่นกรองและลงความเห็นเท่านั้น */
  supervisor: [
    /** 09B — รับแฟ้มที่ยื่นเกินกำหนดไว้ (WIT0914) และลงนามเสนอตามลำดับชั้น (WIT0916) */
    '/appeal',
    '/appeal-folder',
    '/activity7-results',
    '/reports',
    '/protection-monitor',
    '/protection-reviews',
    '/protection-review',
    '/protection-methods',
    '/protection-method',
    '/protection-extensions',
    '/protection-extension',
    '/article14',
    '/termination',
  ],
  /**
   * ผอ.สำนัก/กอง — มอบหมาย ลงนาม คบ.6 และพิจารณาคำขอถอนตัว
   * รวมหน้า 11A ด้วย เพราะ WIT1110 ให้ ผอ. เป็นผู้อนุมัติการเปลี่ยนวิธี/เงื่อนไขก่อนปรับ คบ.11
   */
  director: [
    '/activity7-results',
    '/reports',
    '/protection-reviews',
    '/protection-review',
    ...OPS_ROUTES,
    /** 09B — ผอ.สำนัก/กอง ตรวจและลงนามเสนอแฟ้มอุทธรณ์ต่อจาก ผบช.ชั้นต้น (WIT0916) */
    '/appeal',
    '/appeal-folder',
  ],
  /** เลขาธิการ ป.ป.ท. — สั่งการ ลงนามหนังสือ และพิจารณาขยาย/ยุติการคุ้มครอง */
  /** รองเลขาธิการฯ — กลั่นกรองชุดเสนอ คบ.6 (WIT0513) คบ.10 แฟ้มอุทธรณ์ และเรื่องตามข้อ 14 ก่อนถึงเลขาธิการฯ */
  deputy_secretary: ['/protection-extension', '/protection-extensions', '/activity7-results', '/reports', '/notice', '/appeal', '/appeal-folder', '/article14'],
  secretary: ['/activity7-results', '/reports', '/notice', '/appeal', '/appeal-folder', ...OPS_ROUTES],
  /** ฝ่ายเลขานุการคณะกรรมการ ป.ป.ท. — บรรจุวาระและบันทึกมติ (อุทธรณ์ + ข้อ 14) */
  committee: ['/appeal', '/appeal-folder', '/article14', '/activity7-results'],
  /** ชุดคุ้มครอง — ปฏิบัติการคุ้มครองและรายงานประจำเดือน */
  protection: ['/protection', '/protection-monitor', '/protection-methods', '/protection-method'],
  /** เจ้าหน้าที่อุทธรณ์ — งานอุทธรณ์เท่านั้น */
  appeal: ['/appeal', '/appeal-folder', '/activity7-results', '/termination'],
  admin: [],
}

export const isAdmin = (role: UserRole): boolean => role === 'admin'

/** บทบาทที่ทำหน้าที่ผู้ปฏิบัติในสำนวน (เจ้าหน้าที่ ป.ป.ท. และเจ้าของสำนวน) */
export const isCaseWorker = (role: UserRole): boolean => role === 'officer' || role === 'case_owner' || role === 'got_officer'

export const getAllowedRoutes = (role: UserRole): string[] =>
  isAdmin(role) ? [...COMMON_ROUTES, ...NAV_ITEMS.map((i) => i.path), '/intake', '/appeal-folder'] : [...COMMON_ROUTES, ...(ROLE_ROUTES[role] || [])]

/** ตรวจว่าบทบาทนี้เข้าเส้นทางนี้ได้หรือไม่ — เทียบแบบ prefix เพื่อรองรับ path ที่มีพารามิเตอร์ */
export const canAccessRoute = (role: UserRole, pathname: string): boolean => {
  const path = pathname.replace(/\/+$/, '') || '/'
  // หน้าระยะเวลารายเคสใช้สิทธิ์เดียวกับภาพรวมที่เปิดรายการนั้น
  if (path === '/protection-duration') return canAccessRoute(role, '/protection')
  if (path === '/protection-method-work') return canAccessRoute(role, '/protection-methods')
  /** หน้าเครื่องมือสำหรับ dev/QA — เปิดให้ทุกบทบาทเข้าถึงได้เสมอ ไม่ผูกกับสิทธิ์ */
  if (path === '/mock-state' || path === '/flow-guide' || path === '/flow-chart') return true
  if (isAdmin(role)) return true
  return getAllowedRoutes(role).some((allowed) =>
    allowed === '/' ? path === '/' : path === allowed || path.startsWith(`${allowed}/`)
  )
}

/** เมนูที่บทบาทนี้เห็นใน Sidebar */
export const getNavItemsForRole = (role: UserRole): NavItem[] =>
  NAV_ITEMS.filter((item) => canAccessRoute(role, item.path))

/** หัวข้อกลุ่มหลักใน Sidebar เรียงตามลำดับที่แสดง */
export const NAV_GROUPS: Array<{ key: NavGroupKey; title: string }> = [
  { key: 'intake', title: 'รับเรื่องและพิจารณา' },
  { key: 'operations', title: 'ดำเนินมาตรการ' },
  { key: 'dispatch', title: 'แจ้งผลและนำส่ง' },
  { key: 'info', title: 'ข้อมูลอ้างอิง' },
]

/** หัวข้อกลุ่มย่อยที่พับ/กางได้ เรียงตามลำดับที่แสดงภายในกลุ่มหลัก */
export const NAV_SECTIONS: Array<{ key: NavSectionKey; title: string; icon: string }> = [
  { key: 'protect', title: 'คุ้มครองและติดตาม', icon: 'fa-shield-halved' },
  { key: 'review', title: 'ทบทวนและสิ้นสุด', icon: 'fa-scale-balanced' },
]

export interface NavSectionNode {
  kind: 'section'
  key: NavSectionKey
  title: string
  icon: string
  items: NavItem[]
}

export type NavNode = { kind: 'item'; item: NavItem } | NavSectionNode

/**
 * โครงเมนูของบทบาทหนึ่ง ๆ แยกเป็นกลุ่มหลัก > (กลุ่มย่อย) > รายการ
 *
 * กลุ่มย่อยที่เหลือรายการเดียวหลังกรองตามสิทธิ์จะถูกคลี่ออกมาเป็นรายการเดี่ยว
 * เพื่อไม่ให้บทบาทที่มีสิทธิ์แคบ (เช่น ชุดคุ้มครอง) ต้องกดกางหัวข้อที่มีลูกเพียงตัวเดียว
 */
export const getNavTreeForRole = (role: UserRole): Array<{ key: NavGroupKey; title: string; nodes: NavNode[] }> => {
  const visible = getNavItemsForRole(role)

  return NAV_GROUPS.map(({ key, title }) => {
    const groupItems = visible.filter((item) => item.group === key)
    const nodes: NavNode[] = []

    for (const item of groupItems.filter((item) => !item.section)) {
      nodes.push({ kind: 'item', item })
    }

    for (const { key: sectionKey, title: sectionTitle, icon } of NAV_SECTIONS) {
      const items = groupItems.filter((item) => item.section === sectionKey)
      if (items.length === 0) continue
      if (items.length === 1) {
        nodes.push({ kind: 'item', item: items[0] })
        continue
      }
      nodes.push({ kind: 'section', key: sectionKey, title: sectionTitle, icon, items })
    }

    return { key, title, nodes }
  }).filter((group) => group.nodes.length > 0)
}

/** บทบาทที่รับคำร้องเข้าระบบได้ (ปุ่ม "รับคำร้องใหม่") */
export const canCreateIntake = (role: UserRole): boolean => canAccessRoute(role, '/intake')

/**
 * ตรวจ "ความเป็นเจ้าของคดี" — เจ้าหน้าที่/เจ้าของสำนวนลงมือกับสำนวนได้เฉพาะที่ตนได้รับมอบหมาย
 * สำนวนที่ยังไม่มีผู้รับมอบหมายถือว่าเปิดให้ผู้ปฏิบัติทุกคน (เช่น ช่วงก่อน ผอ. มอบหมาย)
 * บทบาทอื่นตัดสินจากขั้นตอนตามลำดับชั้น ไม่ผูกกับตัวบุคคล
 */
export const isCaseOwnedBy = (
  role: UserRole,
  caseItem: Pick<CaseItem, 'assignedOfficerUserId' | 'protectionOwnerUserId' | 'protectionHandoff'>,
  officerUserId: string
): boolean => {
  if (isAdmin(role)) return true
  if (role.startsWith('got_')) return canViewHandoffCase(role, caseItem, officerUserId)
  if (role === 'protection') {
    return !caseItem.protectionOwnerUserId || caseItem.protectionOwnerUserId === officerUserId
  }
  if (!isCaseWorker(role)) return true
  if (!caseItem.assignedOfficerUserId) return true
  return caseItem.assignedOfficerUserId === officerUserId
}

/**
 * แผงปฏิบัติรายวิธีตามข้อ 15 (08A-1/08A-2/08A-3/08B) เข้มกว่า canSeeDossierCard('protection') ทั่วไป —
 * เห็นเฉพาะเจ้าหน้าที่ที่ถูกมอบหมายเป็นเจ้าของสำนวนนี้จริง (assignedOfficerUserId ตรงกับตนเอง) เท่านั้น
 * บทบาทอื่นที่ปกติเห็นการ์ดคุ้มครองได้ (ผอ./เลขาธิการ/หัวหน้างาน/ชุดคุ้มครอง) ไม่เห็นแผงนี้ และสำนวนที่ยัง
 * ไม่มีผู้รับมอบหมาย (assignedOfficerUserId ว่าง) ให้ซ่อนไว้ก่อนจนกว่าจะมีการมอบหมาย
 */
export const isAssignedProtectionOfficer = (
  role: UserRole,
  caseItem: Pick<CaseItem, 'assignedOfficerUserId' | 'protectionHandoff'>,
  officerUserId: string
): boolean => {
  if (caseItem.protectionHandoff) return canOperateHandoff(role, caseItem, officerUserId)
  if (isAdmin(role)) return true
  if (!isCaseWorker(role)) return false
  return Boolean(caseItem.assignedOfficerUserId) && caseItem.assignedOfficerUserId === officerUserId
}

/**
 * WIT0306 — คิวงาน "ของฉัน" ต้องเป็นงานของตัวเจ้าหน้าที่จริง ไม่ใช่ของทุกคนในบทบาทเดียวกัน
 * เมื่อแฟ้มมีผู้รับผิดชอบแล้ว เห็นได้เฉพาะผู้ที่ถูกมอบหมาย (หรือผู้ที่เป็นคนรับเรื่องเข้าระบบเอง)
 * แฟ้มที่ยังไม่มีผู้รับผิดชอบยังเป็นงานส่วนกลางที่ผู้ปฏิบัติทุกคนหยิบได้ตามเดิม
 * บทบาทที่ไม่ใช่ผู้ปฏิบัติ (ผอ./หัวหน้างาน/เลขาธิการฯ) พิจารณาตามลำดับชั้น จึงเห็นทั้งหมดเหมือนเดิม
 * ใช้ร่วมกันระหว่างหน้าคิวงาน /queue/$role กับตัวเลขบนเมนู "งานของฉัน" เพื่อไม่ให้สองจุดขัดกัน
 */
export const isMyQueueCase = (
  role: UserRole,
  caseItem: Pick<CaseItem, 'assignedOfficerUserId' | 'receivedByUserId' | 'protectionHandoff'>,
  officerUserId: string
): boolean => {
  if (isAdmin(role)) return true
  if (role.startsWith('got_')) return canViewHandoffCase(role, caseItem, officerUserId)
  if (isCaseWorker(role) && caseItem.protectionHandoff?.destination === 'got') return false
  if (!isCaseWorker(role)) return true
  if (!caseItem.assignedOfficerUserId) return true
  return (
    caseItem.assignedOfficerUserId === officerUserId || caseItem.receivedByUserId === officerUserId
  )
}

/**
 * เชื่อมโยง/แก้ไข/ยกเลิกคดีหลัก หรือระบุ "ไม่พบคดี" — เฉพาะเจ้าหน้าที่ที่ ผอ. มอบหมายเป็นเจ้าของสำนวนนี้
 * หรือเจ้าหน้าที่ที่รับคำร้องเข้าระบบเอง (receivedByUserId) ธุรการไม่ทำขั้นนี้แล้ว ส่งเรื่องให้ ผอ. ได้เลย
 * ผอ.สำนัก/กอง และผู้ปฏิบัติคนอื่นเห็นการ์ดแบบดูอย่างเดียว
 */
export const canLinkMainCase = (
  role: UserRole,
  caseItem: Pick<CaseItem, 'assignedOfficerUserId' | 'receivedByUserId'>,
  officerUserId: string
): boolean => {
  if (isAdmin(role)) return true
  if (!isCaseWorker(role)) return false
  return caseItem.assignedOfficerUserId === officerUserId || caseItem.receivedByUserId === officerUserId
}

/** การ์ดต่าง ๆ ในแฟ้มคำร้อง — บทบาทใดควรเห็นบ้าง (ซ่อนทั้งการ์ดเมื่อไม่ใช่หน้าที่) */
export const DOSSIER_CARD_ROLES = {
  /**
   * ขั้นที่ 1 — คดีหลัก: ผู้ปฏิบัติเห็นการ์ด (ลงมือได้ตาม canLinkMainCase) ผอ. ดูอย่างเดียวก่อนมอบหมาย
   * ธุรการไม่เห็นการ์ดนี้ — เจ้าของสำนวนที่ได้รับมอบหมายเป็นผู้เชื่อมโยงภายหลัง
   */
  mainCaseLink: ['officer', 'case_owner', 'director'] as UserRole[],
  /** ขั้นที่ 2 — มอบหมายเจ้าของสำนวน: ผอ. เท่านั้น */
  assignment: ['director'] as UserRole[],
  /** ขั้นที่ 3-4 — ส่งงานตามลำดับชั้น (รองเลขาธิการฯ ส่งต่อจากขั้นกลั่นกรองไปเลขาธิการฯ) */
  forward: ['receiver', 'officer', 'case_owner', 'supervisor', 'director', 'deputy_secretary'] as UserRole[],
  /** ขั้นที่ 5 — เลขาธิการสั่งการ */
  secretaryReview: ['secretary'] as UserRole[],
  /**
   * ขั้นที่ 5 — จัดทำและนำส่งหนังสือแจ้งผล
   * รองเลขาธิการฯ อยู่ในรายการนี้เพราะ WIT0905 ให้กลั่นกรอง คบ.10 ก่อนถึงผู้ลงนาม
   */
  notice: ['officer', 'case_owner', 'got_officer', 'receiver', 'secretary', 'deputy_secretary'] as UserRole[],
  /** แก้ไขแฟ้ม — อัปโหลด/ลบเอกสาร เพิ่ม-ถอนแบบฟอร์ม บันทึกลายมือชื่อ คบ.1 */
  editDossier: ['receiver', 'officer', 'case_owner', 'got_officer'] as UserRole[],
  /** ขั้นที่ 6-7 — ปฏิบัติการคุ้มครอง ต่ออายุ ยุติ ส่งต่อ ถอนตัว */
  protection: ['officer', 'case_owner', 'got_officer', 'protection', 'supervisor', 'director', 'secretary'] as UserRole[],
  /** 08A — ตรวจฐานคำสั่ง ความยินยอม คบ.11 และแยกวิธีที่อนุมัติ */
  methodDispatch: ['officer', 'case_owner', 'got_officer', 'protection', 'director', 'secretary'] as UserRole[],
  /** 08C — เรื่องเสนอตามข้อ 14 */
  article14: ['officer', 'case_owner', 'supervisor', 'director', 'deputy_secretary', 'secretary', 'committee'] as UserRole[],
  /** 11C-11D — คบ.15 / คบ.16 / คบ.17 */
  termination: ['officer', 'case_owner', 'got_officer', 'supervisor', 'director', 'secretary', 'appeal'] as UserRole[],
} as const

export const canSeeDossierCard = (role: UserRole, card: keyof typeof DOSSIER_CARD_ROLES): boolean =>
  isAdmin(role) || DOSSIER_CARD_ROLES[card].includes(role)

/**
 * WIT1148 — แฟ้มที่ปิดงานคุ้มครองแล้ว (closeProtectionCase) ถูกล็อกทั้งแฟ้ม
 * ดู/พิมพ์/ดาวน์โหลดเอกสารได้อย่างเดียว ห้ามแก้ไขแบบ คบ. สร้างเวอร์ชันใหม่ แนบ/ลบไฟล์ หรือกดงานที่เปลี่ยนสถานะ
 * ใช้ตัวเดียวกันทั้ง UI และ store เพื่อไม่ให้สองจุดตัดสินไม่ตรงกัน
 * (ไม่รวมการปิดกระบวนการไม่อนุมัติ 09A — nonApprovalClosedAt เป็นอีกเส้นทางหนึ่ง)
 */
export const isCaseClosed = (caseItem?: Pick<CaseItem, 'closedAt' | 'stage'> | null): boolean =>
  Boolean(caseItem?.closedAt) && caseItem?.stage === 'terminated'

export const CASE_CLOSED_NOTICE =
  'แฟ้มนี้ปิดงานคุ้มครองแล้ว — เอกสารถูกล็อก ดู/พิมพ์/ดาวน์โหลดได้เท่านั้น'

/** ธุรการสำนัก/กอง เห็นแบบฟอร์ม คบ. ได้ แต่กรอก/แก้ไขแบบฟอร์มเองไม่ได้ */
export const canOpenForm = (role: UserRole): boolean => isAdmin(role) || role !== 'receiver'

/**
 * แก้ไขแบบฟอร์ม คบ. ในแฟ้มคำร้องได้เฉพาะเจ้าหน้าที่ ป.ป.ท./เจ้าของสำนวนที่ได้รับมอบหมายเป็นเจ้าของ
 * สำนวนนี้ (หรือเป็นผู้รับเรื่องเองตั้งแต่ขั้นแรก) เท่านั้น — บทบาทอื่นที่ไม่ใช่ผู้ปฏิบัติ (เช่น ผอ.สำนัก/กอง,
 * เลขาธิการ) แม้เห็นส่วนแบบฟอร์มได้ (canSeeFormsSection) ก็ดูเอกสารได้อย่างเดียว แก้ไขไม่ได้ เพราะไม่ใช่
 * ผู้ที่ถูกมอบหมายลงมือในแฟ้มนี้
 */
export const canEditFormsInDossier = (
  role: UserRole,
  caseItem: Pick<CaseItem, 'assignedOfficerUserId' | 'receivedByUserId' | 'protectionHandoff'>,
  officerUserId: string
): boolean => {
  if (caseItem.protectionHandoff) return canOperateHandoff(role, caseItem, officerUserId)
  if (isAdmin(role)) return true
  if (!isCaseWorker(role)) return false
  return caseItem.assignedOfficerUserId === officerUserId || caseItem.receivedByUserId === officerUserId
}

/**
 * ส่วนแบบฟอร์ม คบ. ในแฟ้มคำร้อง — เจ้าหน้าที่ ป.ป.ท./เจ้าของสำนวนต้องได้รับมอบหมายเป็นเจ้าของสำนวน
 * ของคดีนี้ก่อน จึงจะเห็นและแก้ไขแบบฟอร์มได้ ระหว่างที่เพิ่งรับเรื่องเข้าทะเบียนแต่ยังไม่มีผู้รับมอบหมาย
 * (assignedOfficerUserId ว่าง) ให้ซ่อนส่วนนี้ทั้งหมดสำหรับบทบาทผู้ปฏิบัติ — เว้นแต่เป็นเจ้าหน้าที่คนเดียวกัน
 * ที่รับเรื่องเองจาก คบ.1/คบ.2 ตั้งแต่ขั้นแรก (receivedByUserId) ซึ่งให้เห็น/แก้ไขได้ทันที บทบาทอื่นไม่ถูกจำกัด
 * ธุรการสำนัก/กอง (receiver) ไม่มีหน้าที่กรอก/แก้ไขแบบฟอร์ม คบ. จึงไม่แสดงส่วนนี้ให้เห็นเลย
 */
export const canSeeFormsSection = (
  role: UserRole,
  caseItem: Pick<CaseItem, 'assignedOfficerUserId' | 'receivedByUserId' | 'protectionHandoff'>,
  officerUserId: string
): boolean => {
  if (isAdmin(role)) return true
  if (role.startsWith('got_')) return canViewHandoffCase(role, caseItem, officerUserId)
  if (role === 'receiver') return false
  if (!isCaseWorker(role)) return true
  return caseItem.assignedOfficerUserId === officerUserId || caseItem.receivedByUserId === officerUserId
}

/**
 * ประวัติการดำเนินการ / Audit Log ของแฟ้ม — ธุรการผู้รับเรื่องและสายผู้บังคับบัญชา/ผู้พิจารณาเปิดดูได้
 * เพราะต้องใช้ตรวจลำดับขั้นก่อนมอบหมายและก่อนตัดสิน (WIT0303 / WIT0703) แต่เจ้าหน้าที่ผู้ปฏิบัติ
 * ต้องได้รับมอบหมายเป็นเจ้าของสำนวนนี้ หรือเป็นผู้รับเรื่องเองก่อน จึงเปิดดูได้ตามหลัก Need-to-Know
 * เดียวกับ canSeeFormsSection
 */
export const canSeeCaseAuditLog = (
  role: UserRole,
  caseItem: Pick<CaseItem, 'assignedOfficerUserId' | 'receivedByUserId' | 'protectionHandoff'>,
  officerUserId: string
): boolean => {
  if (isAdmin(role)) return true
  if (role.startsWith('got_')) return canViewHandoffCase(role, caseItem, officerUserId)
  if (!isCaseWorker(role)) return true
  return caseItem.assignedOfficerUserId === officerUserId || caseItem.receivedByUserId === officerUserId
}

/**
 * ก่อนได้รับมอบหมายอย่างเป็นทางการจาก ผอ.สำนัก/กอง เจ้าหน้าที่ ป.ป.ท./เจ้าของสำนวนที่รับเรื่องเอง
 * (เข้าเงื่อนไข canSeeFormsSection ผ่านทาง receivedByUserId) เห็นได้เฉพาะแบบฟอร์มที่ใช้รับเรื่อง
 * (คบ.1 หรือ คบ.2) เท่านั้น แบบฟอร์มอื่น (คบ.3, คบ.6 ฯลฯ) จะเห็นก็ต่อเมื่อได้รับมอบหมายเป็นเจ้าของสำนวนแล้ว
 */
export const canSeeAllForms = (
  role: UserRole,
  caseItem: Pick<CaseItem, 'assignedOfficerUserId' | 'protectionHandoff'>,
  officerUserId: string
): boolean => {
  if (isAdmin(role)) return true
  if (role.startsWith('got_')) return canViewHandoffCase(role, caseItem, officerUserId)
  if (!isCaseWorker(role)) return true
  return caseItem.assignedOfficerUserId === officerUserId
}
