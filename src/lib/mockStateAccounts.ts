import type { UserRole } from '../types/user'
import { ECMIS_USER_DIRECTORY, ROLE_ORG_ASSIGNMENTS } from './constants'
import { ACTIVE_ROLE_SET, getRoleSet, ROLE_SET_STORAGE_KEY, type RoleSet } from './roleSets'
import { LOGIN_ACCOUNTS, findLoginAccount, type LoginAccount } from './loginAccounts'

/**
 * จับคู่ mock state (src/mock-states/*.json) กับบัญชีทดลองปัจจุบัน
 * บัญชีของสำนัก/กองเจ้าของเรื่องส่วนกลางถูกถอดออกแล้ว บทบาทสายเจ้าของเรื่องจึงใช้บัญชี สำนักงาน ป.ป.ท. เขต 1
 * ส่วนบทบาทส่วนกลาง (เลขาธิการ/คณะกรรมการ/อุทธรณ์) และ กอท. ใช้บัญชีแรกของบทบาทนั้น
 * ชุดคุ้มครองในแฟ้มสาธิตคือ PROT-001 (หัวหน้าชุดใน คบ.6) จึงคงบัญชีหน่วยปฏิบัติการ (protection: wp.protection)
 * ค่ากำหนดอยู่ใน mockStateAccounts ของชุดบทบาท (src/data/role-sets/*.json)
 */
export const MOCK_STATE_ACCOUNT_BY_ROLE: Partial<Record<UserRole, string>> = ACTIVE_ROLE_SET.mockStateAccounts

/** `roleSet` ไม่ระบุ = ชุดที่แอปใช้อยู่ · state ที่เลือกชุดบทบาทเอง (ecmis-role-set) ส่งชุดนั้นเข้ามา */
export function mockStateAccountForRole(role: UserRole, roleSet?: RoleSet): LoginAccount | undefined {
  const username = (roleSet?.mockStateAccounts ?? MOCK_STATE_ACCOUNT_BY_ROLE)[role]
  return (username && findLoginAccount(username)) || LOGIN_ACCOUNTS.find((a) => a.role === role)
}

export interface MockAuthState {
  currentRole: UserRole
  currentOfficerUserId: string
  currentDirectorUserId: string
  currentOrgUnitId: string | null
  isAuthenticated?: boolean
  loginUsername?: string | null
  rememberLogin?: boolean
  [key: string]: unknown
}

/** ค่าที่ useAuthStore.login(account) ตั้งให้ — คำนวณตรง ๆ เพื่อใช้นอกแอป (สคริปต์/e2e seed) โดยไม่แตะ store จริง */
export function authStateForAccount(account: LoginAccount, prev: MockAuthState): MockAuthState {
  const assignment = ROLE_ORG_ASSIGNMENTS[account.role] || ROLE_ORG_ASSIGNMENTS.receiver
  const roleUnit = assignment.central ? 'central-wp' : (assignment.units[0] || 'central-wp')
  const user = account.userId ? ECMIS_USER_DIRECTORY.find((u) => u.id === account.userId) : undefined
  const isDirector = account.role === 'director' || account.role === 'got_director'
  return {
    ...prev,
    currentRole: account.role,
    currentOfficerUserId: account.userId ?? prev.currentOfficerUserId,
    currentDirectorUserId: isDirector && account.userId ? account.userId : prev.currentDirectorUserId,
    currentOrgUnitId: account.orgUnitId ?? (user && !assignment.central ? user.orgUnitId : roleUnit),
    isAuthenticated: true,
    loginUsername: account.username,
    rememberLogin: true,
  }
}

/** ผู้ใช้ส่วนกลางเดิมในแฟ้มสาธิต → ผู้ใช้ตำแหน่งเดียวกันของเขต 1 */
const LEGACY_USER_MAP: Record<string, string> = {
  'OFF-001': 'OFF-REG1',
  'OFF-002': 'OFF-REG1',
  'SUP-001': 'SUP-REG1',
  'DIR-001': 'DIR-REG1',
  'REC-001': 'REC-REG1',
}
const REGION_UNIT = 'สำนักงาน ป.ป.ท. เขต 1'
const userById = (id: string) => ECMIS_USER_DIRECTORY.find((u) => u.id === id)
const NAME_PAIRS: Array<[string, string]> = Object.entries(LEGACY_USER_MAP).map(([from, to]) => [userById(from)!.name, userById(to)!.name])
/** ข้อความหน่วยงานส่วนกลางที่แทนได้ทุกที่ (ไม่ซ้ำกับหน่วยอื่น) */
const UNIT_PAIRS: Array<[string, string]> = [
  ['กลุ่มงานคุ้มครองพยาน กองบริหารคดี สำนักงาน ป.ป.ท.', REGION_UNIT],
  ['กลุ่มงานคุ้มครองพยาน (ส่วนกลาง)', REGION_UNIT],
  ['กองบริหารคดี (ส่วนกลาง)', REGION_UNIT],
]
/** ช่องในแบบ คบ. ที่ผูกกับเจ้าหน้าที่/หน่วยงานเจ้าของเรื่อง */
const FIELD_VALUE_MAP: Record<string, Record<string, string>> = {
  'ตำแหน่งเจ้าพนักงาน': { 'นักสืบสวนสอบสวนชำนาญการ': userById('OFF-REG1')!.position },
  'ตำแหน่งผู้รับแจ้ง': { 'นักสืบสวนสอบสวนชำนาญการ': userById('OFF-REG1')!.position },
  'สถานที่บันทึก': { 'สำนักงาน ป.ป.ท. (ส่วนกลาง)': REGION_UNIT },
}

const isGotId = (v: unknown) => typeof v === 'string' && v.startsWith('GOT-')

/**
 * ชื่อของ กอท. ซ้ำกับผู้ใช้ส่วนกลางเดิม (เช่น GOT-OFF-001 / OFF-001 ชื่อเดียวกัน)
 * จึงไม่แทนชื่อในช่วงงานของ กอท.: ช่องชื่อที่คู่กับรหัส GOT-*, ประวัติที่ระบุ กอท., gotRevision
 * และ owner ของแฟ้มที่ส่งมอบให้ กอท. แล้ว
 */
function isGotNameField(obj: Record<string, unknown>, key: string): boolean {
  const idKeys = [`${key}UserId`, key.replace(/Name$/, 'UserId'), key.replace(/Name$/, 'Id')]
  if (idKeys.some((k) => k !== key && isGotId(obj[k]))) return true
  if (key === 'owner') {
    const handoff = obj.protectionHandoff as { destination?: string } | undefined
    return handoff?.destination === 'got' || Boolean(obj.gotRevision)
  }
  return false
}

function isGotScope(obj: Record<string, unknown>): boolean {
  if (typeof obj.action === 'string' && obj.action.includes('กอท.')) return true
  return typeof obj.actorRole === 'string' && obj.actorRole.startsWith('got_')
}

function remapText(value: string, key: string, got: boolean): string {
  if (LEGACY_USER_MAP[value]) return LEGACY_USER_MAP[value]
  const fieldMap = FIELD_VALUE_MAP[key]
  if (fieldMap?.[value]) return fieldMap[value]
  let next = value
  if (!got) NAME_PAIRS.forEach(([from, to]) => { next = next.split(from).join(to) })
  UNIT_PAIRS.forEach(([from, to]) => { next = next.split(from).join(to) })
  return next
}

function remapNode(node: unknown, key: string, got: boolean): unknown {
  if (typeof node === 'string') return remapText(node, key, got)
  if (Array.isArray(node)) return node.map((item) => remapNode(item, key, got))
  if (!node || typeof node !== 'object') return node
  const obj = node as Record<string, unknown>
  const scopeGot = got || isGotScope(obj)
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => {
    const childGot = scopeGot || k === 'gotRevision' || (typeof v === 'string' && isGotNameField(obj, k))
    return [LEGACY_USER_MAP[k] ?? k, remapNode(v, k, childGot)]
  }))
}

export interface MockStateData {
  localStorageData: Record<string, string>
}

const AUTH_KEY = 'ecmis-auth-storage'

/** ปรับ mock state ให้เข้าสู่ระบบด้วยบัญชีปัจจุบันของบทบาท และย้ายผู้ใช้ส่วนกลางเดิมในแฟ้มไปเป็นเขต 1 */
export function syncMockStateAccounts<T extends MockStateData>(state: T): T {
  const roleSet = getRoleSet(state.localStorageData[ROLE_SET_STORAGE_KEY])
  const localStorageData = Object.fromEntries(Object.entries(state.localStorageData).map(([storageKey, raw]) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return [storageKey, raw]
    }
    let next = remapNode(parsed, '', false) as { state?: MockAuthState }
    if (storageKey === AUTH_KEY && next.state) {
      const account = mockStateAccountForRole(next.state.currentRole, roleSet)
      if (account) next = { ...next, state: authStateForAccount(account, next.state) }
    }
    return [storageKey, JSON.stringify(next)]
  }))
  return { ...state, localStorageData }
}

/** รหัสผู้ใช้ส่วนกลางเดิมที่ไม่ควรเหลือในแฟ้มสาธิตหลังซิงก์ */
export const LEGACY_MOCK_USER_IDS = Object.keys(LEGACY_USER_MAP)
