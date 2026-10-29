import type { EcmisUser, UserRole } from '../types/user'
import defaultSet from '../data/role-sets/default.json' with { type: 'json' }
import legacyMigrationSet from '../data/role-sets/legacy-migration.json' with { type: 'json' }

/**
 * ชุดรายชื่อผู้ใช้ตามบทบาท (src/data/role-sets/*.json)
 * default.json เป็นชุดเต็ม ชุดอื่นระบุเฉพาะผู้ใช้ที่ต่าง (ชื่อ/ตำแหน่ง/หน่วยงาน) ด้วยรหัสผู้ใช้ — รหัสต้องตรงกับชุดตั้งต้น
 * mock state แต่ละอันเลือกชุดผ่าน localStorage key ROLE_SET_STORAGE_KEY (ขึ้นต้น ecmis- จึงถูกบันทึก/โหลดไปกับ state)
 * เพิ่มชุดใหม่: สร้างไฟล์ใน src/data/role-sets/ แล้ว import เพิ่มใน ROLE_SET_FILES ด้านล่าง
 * roleNames ใส่ {user:<รหัสผู้ใช้>} เพื่อแทนด้วยชื่อผู้ใช้นั้นตามชุด (เช่น "{user:APP-001} (เจ้าหน้าที่อุทธรณ์)")
 * src/data/mock-state-baseline-users.json เป็นค่า FROZEN: ชื่อ/ตำแหน่งที่ mock state เดิมถูกบันทึกมา ห้ามแก้ตาม default.json
 * (ใช้เป็นต้นทางแปลงชื่อตอนโหลด mock state ที่ยังไม่มี capturedUsers)
 */
export interface RoleSetFile {
  id: string
  label: string
  /** เฉพาะ default.json: ชื่อบทบาท */
  roleNames?: Partial<Record<UserRole, string>>
  /** default.json: รายชื่อเต็ม · ชุดอื่น: { [userId]: ค่าที่ต่างจากชุดตั้งต้น } */
  users: EcmisUser[] | Record<string, Partial<Pick<EcmisUser, 'name' | 'position' | 'unit'>>>
  /** บัญชีที่ mock state ใช้เข้าสู่ระบบตามบทบาท (ชุดอื่นไม่ระบุ = ตามชุดตั้งต้น) */
  mockStateAccounts?: Partial<Record<UserRole, string>>
}

export interface RoleSet {
  id: string
  label: string
  roleNames: Record<UserRole, string>
  users: EcmisUser[]
  mockStateAccounts: Partial<Record<UserRole, string>>
}

export const DEFAULT_ROLE_SET_ID = 'default'
export const ROLE_SET_STORAGE_KEY = 'ecmis-role-set'

const ROLE_SET_FILES: RoleSetFile[] = [defaultSet as RoleSetFile, legacyMigrationSet as RoleSetFile]

const DEFAULT_FILE = ROLE_SET_FILES[0]
const DEFAULT_USERS = DEFAULT_FILE.users as EcmisUser[]

const USER_TOKEN = /\{user:([^}]+)\}/g

/** ค่า override ที่ว่าง/มีแต่ช่องว่างถูกละทิ้ง (คงค่าชุดตั้งต้น) */
function cleanOverride(o: Partial<Pick<EcmisUser, 'name' | 'position' | 'unit'>>) {
  const out: Partial<Pick<EcmisUser, 'name' | 'position' | 'unit'>> = {}
  ;(['name', 'position', 'unit'] as const).forEach((k) => {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) out[k] = v
  })
  return out
}

export function buildRoleSet(file: RoleSetFile): RoleSet {
  const overrides = Array.isArray(file.users) ? undefined : file.users
  if (overrides) {
    const known = new Set(DEFAULT_USERS.map((u) => u.id))
    Object.keys(overrides).forEach((id) => {
      if (!known.has(id)) console.warn(`[role-set:${file.id}] ไม่พบรหัสผู้ใช้ ${id} ในชุดตั้งต้น — ข้าม`)
    })
  }
  const users = overrides
    ? DEFAULT_USERS.map((u) => (overrides[u.id] ? { ...u, ...cleanOverride(overrides[u.id]) } : u))
    : (file.users as EcmisUser[])
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? id
  const roleNames = { ...DEFAULT_FILE.roleNames, ...file.roleNames } as Record<UserRole, string>
  ;(Object.keys(roleNames) as UserRole[]).forEach((r) => {
    roleNames[r] = roleNames[r].replace(USER_TOKEN, (_, id: string) => nameOf(id.trim()))
  })
  return {
    id: file.id,
    label: file.label,
    roleNames,
    users,
    mockStateAccounts: { ...DEFAULT_FILE.mockStateAccounts, ...file.mockStateAccounts },
  }
}

export const ROLE_SETS: RoleSet[] = ROLE_SET_FILES.map(buildRoleSet)

/** ไม่พบรหัสชุด = ชุดตั้งต้น */
export function getRoleSet(id: string | null | undefined): RoleSet {
  return ROLE_SETS.find((s) => s.id === id) ?? ROLE_SETS[0]
}

/** อ่านชุดที่ใช้อยู่จาก storage (นอกเบราว์เซอร์ เช่น สคริปต์/e2e = ชุดตั้งต้น) */
export function readActiveRoleSetId(storage?: Pick<Storage, 'getItem'>): string {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
    return getRoleSet(s?.getItem(ROLE_SET_STORAGE_KEY)).id
  } catch {
    return DEFAULT_ROLE_SET_ID
  }
}

/** ชุดที่แอปใช้ — กำหนดครั้งเดียวตอนบูต (โหลด mock state จะเปิดแท็บใหม่/โหลดหน้าใหม่เสมอ) */
export const ACTIVE_ROLE_SET: RoleSet = getRoleSet(readActiveRoleSetId())
