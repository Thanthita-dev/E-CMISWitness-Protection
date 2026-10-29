import type { UserRole } from '../types/user'
import { ECMIS_USER_DIRECTORY } from './constants'

/** บัญชีทดลองเข้าสู่ระบบ (mock) — หนึ่งบัญชีต่อหนึ่งบทบาทต่อหนึ่งหน่วยงาน (บทบาทเดียวกันอาจมีหลายบัญชีข้ามหน่วย ให้อ้างด้วย username ไม่ใช่ role) */
export interface LoginAccount {
  username: string
  password: string
  role: UserRole
  /** id ใน ECMIS_USER_DIRECTORY (admin ไม่มีผู้ใช้ในทะเบียน จึงเป็น null) */
  userId: string | null
  name: string
  position: string
  group: string
  /** หน่วยงานที่บัญชีนี้สังกัด (ตั้งค่าหลังเข้าสู่ระบบ) — ไม่ระบุ = ตามค่าตั้งต้นของบทบาท */
  orgUnitId?: string
}

export const DEMO_PASSWORD = '1234'

/** [ชื่อผู้ใช้, บทบาท, id ผู้ใช้, หน่วยงาน, ชื่อแสดงเมื่อไม่มีผู้ใช้ในทะเบียน] */
type AccountSpec = [username: string, role: UserRole, userId: string | null, orgUnitId?: string, label?: string]

/** ตำแหน่งชุดเดียวกันของสำนักงาน ป.ป.ท. เขต */
const unitSpecs = (prefix: string, unit: string, short: string, users: Partial<Record<UserRole, string>> = {}): AccountSpec[] => [
  [`${prefix}.receiver`, 'receiver', users.receiver ?? null, unit, `ธุรการคดี ${short}`],
  [`${prefix}.officer`, 'officer', users.officer ?? null, unit, `เจ้าหน้าที่ ป.ป.ท. ${short}`],
  [`${prefix}.caseowner`, 'case_owner', users.case_owner ?? null, unit, `เจ้าของสำนวน ${short}`],
  [`${prefix}.supervisor`, 'supervisor', users.supervisor ?? null, unit, `ผู้บังคับบัญชาชั้นต้น ${short}`],
  [`${prefix}.director`, 'director', users.director ?? null, unit, `ผอ. ${short}`],
  [`${prefix}.protection`, 'protection', users.protection ?? null, unit, `ชุดคุ้มครอง ${short}`],
]
/** เขต 1-2 มีรายชื่อบุคคลในทะเบียน (เขต 1 เจ้าหน้าที่คนเดียวกันเป็นเจ้าของสำนวน) ตำแหน่งที่เหลือใช้บัญชีตามตำแหน่งในชุดบทบาท (role-sets/default.json) */
const REGION_GROUPS = Array.from({ length: 9 }, (_, i) => {
  const n = i + 1
  const users = {
    receiver: `REC-REG${n}`, officer: `OFF-REG${n}`, case_owner: n === 1 ? 'OFF-REG1' : `OWN-REG${n}`,
    supervisor: `SUP-REG${n}`, director: `DIR-REG${n}`, protection: `PROT-REG${n}`,
  }
  return { label: `สำนักงาน ป.ป.ท. เขต ${n}`, specs: unitSpecs(`reg${n}`, `pacc-reg-${n}`, `เขต ${n}`, users) }
})

// ลำดับกลุ่มเรียงตามหน่วยงาน (เขต → ส่วนกลาง → คณะกรรมการ → อื่น ๆ)
// ROLE_GROUPS ใน TopBar.tsx เป็นรายการบทบาทที่ไม่ซ้ำ (ใช้เป็นป้ายชื่อ/ตัวเลือกบทบาท) จึงเรียงตามบทบาทเดียวกัน แต่ไม่ต้องมีทุกบัญชี
const GROUP_SPECS: { label: string; specs: AccountSpec[] }[] = [
  ...REGION_GROUPS,
  {
    label: 'ส่วนกลาง · สำนักงานเลขาธิการ',
    specs: [
      ['sec.receiver', 'secretary_receiver', 'SECREC-001'],
      ['wp.deputy', 'deputy_secretary', 'DSEC-001'],
      ['wp.secretary', 'secretary', 'SEC-001'],
    ],
  },
  {
    label: 'ส่วนกลาง · กองคุ้มครองพยาน (กอท.)',
    // ธุรการคดี กอท. รับคำร้องเข้าทะเบียนได้เหมือนธุรการเขต และรับเรื่องส่งต่อหลังอนุมัติ
    specs: [
      ['got.receiver', 'got_receiver', 'GOT-REC-001'],
      ['got.officer', 'got_officer', 'GOT-OFF-001'],
      ['got.officer2', 'got_officer', 'GOT-OFF-002'],
      ['got.supervisor', 'got_supervisor', 'GOT-SUP-001'],
      ['got.director', 'got_director', 'GOT-DIR-001'],
    ],
  },
  {
    label: 'คณะกรรมการ ป.ป.ท.',
    specs: [['wp.committee', 'committee', 'CMT-001']],
  },
  {
    label: 'หน่วยปฏิบัติการ',
    specs: [
      ['wp.protection', 'protection', 'PROT-001'],
      ['wp.appeal', 'appeal', 'APP-001'],
    ],
  },
  {
    label: 'ผู้ดูแลระบบ',
    specs: [['wp.admin', 'admin', null]],
  },
]

export const LOGIN_ACCOUNT_GROUPS: { label: string; accounts: LoginAccount[] }[] = GROUP_SPECS.map(
  ({ label, specs }) => ({
    label,
    accounts: specs.map(([username, role, userId, orgUnitId, accountLabel]) => {
      const user = userId ? ECMIS_USER_DIRECTORY.find((u) => u.id === userId) : undefined
      return {
        username,
        password: DEMO_PASSWORD,
        role,
        userId,
        name: user?.name ?? accountLabel ?? 'ผู้ดูแลระบบ',
        // บัญชีตามหน่วยงาน (กอท./เขต) ใช้ชื่อตำแหน่งชุดเดียวกันทุกหน่วย
        position: accountLabel ?? user?.position ?? 'Super Admin',
        group: label,
        ...(orgUnitId ? { orgUnitId } : {}),
      }
    }),
  })
)

export const LOGIN_ACCOUNTS: LoginAccount[] = LOGIN_ACCOUNT_GROUPS.flatMap((g) => g.accounts)

/** ค้นหาจากชื่อผู้ใช้หรืออีเมล `${username}@pacc.go.th` (ไม่สนตัวพิมพ์เล็กใหญ่) */
export function findLoginAccount(usernameOrEmail: string): LoginAccount | undefined {
  const key = usernameOrEmail.trim().toLowerCase().replace(/@pacc\.go\.th$/, '')
  return LOGIN_ACCOUNTS.find((a) => a.username === key)
}

export function verifyLogin(username: string, password: string): LoginAccount | null {
  const account = findLoginAccount(username)
  return account && account.password === password ? account : null
}
