import { describe, expect, it, vi } from 'vitest'
import { buildRoleSet, ACTIVE_ROLE_SET, DEFAULT_ROLE_SET_ID, ROLE_SETS, ROLE_SET_STORAGE_KEY, getRoleSet, readActiveRoleSetId } from './roleSets'
import { ECMIS_USER_DIRECTORY, ROLE_NAMES } from './constants'
import { MOCK_STATE_ACCOUNT_BY_ROLE } from './mockStateAccounts'

describe('role sets', () => {
  it('ชุดตั้งต้นมีผู้ใช้ 69 คนและรหัสไม่ซ้ำ', () => {
    const def = getRoleSet(DEFAULT_ROLE_SET_ID)
    expect(def.id).toBe(DEFAULT_ROLE_SET_ID)
    expect(def.users).toHaveLength(69)
    expect(new Set(def.users.map((u) => u.id)).size).toBe(69)
    expect(def.users.some((u) => u.id === 'PROT-001')).toBe(true)
  })

  it('รหัสชุดที่ไม่รู้จักหรือว่าง = ชุดตั้งต้น', () => {
    expect(getRoleSet('no-such-set')).toBe(ROLE_SETS[0])
    expect(getRoleSet(null)).toBe(ROLE_SETS[0])
    expect(getRoleSet(undefined)).toBe(ROLE_SETS[0])
  })

  it('readActiveRoleSetId อ่านจาก storage และ fallback เป็นชุดตั้งต้น', () => {
    expect(readActiveRoleSetId({ getItem: (k) => (k === ROLE_SET_STORAGE_KEY ? 'unknown' : null) })).toBe(DEFAULT_ROLE_SET_ID)
    expect(readActiveRoleSetId({ getItem: () => { throw new Error('blocked') } })).toBe(DEFAULT_ROLE_SET_ID)
    expect(readActiveRoleSetId({ getItem: () => DEFAULT_ROLE_SET_ID })).toBe(DEFAULT_ROLE_SET_ID)
  })

  it('ชุดที่ใช้อยู่เป็นชุดตั้งต้นนอกเบราว์เซอร์', () => {
    expect(ACTIVE_ROLE_SET.id).toBe(DEFAULT_ROLE_SET_ID)
  })

  it('ROLE_NAMES / ECMIS_USER_DIRECTORY / MOCK_STATE_ACCOUNT_BY_ROLE มาจากชุดที่ใช้อยู่', () => {
    expect(ROLE_NAMES).toEqual(ACTIVE_ROLE_SET.roleNames)
    expect(ECMIS_USER_DIRECTORY).toEqual(ACTIVE_ROLE_SET.users)
    expect(MOCK_STATE_ACCOUNT_BY_ROLE).toEqual(ACTIVE_ROLE_SET.mockStateAccounts)
    expect(MOCK_STATE_ACCOUNT_BY_ROLE.protection).toBe('wp.protection')
  })

  it('ชุดที่ override บางส่วนแก้เฉพาะผู้ใช้ที่ระบุ ที่เหลือและ roleNames/mockStateAccounts ตามชุดตั้งต้น', () => {
    const def = getRoleSet(DEFAULT_ROLE_SET_ID)
    const set = buildRoleSet({ id: 'test', label: 'ทดสอบ', users: { 'OFF-001': { name: 'ทดสอบ หนึ่ง', position: 'ตำแหน่งทดสอบ' } } })
    expect(set.users).toHaveLength(def.users.length)
    const off = set.users.find((u) => u.id === 'OFF-001')!
    const offDef = def.users.find((u) => u.id === 'OFF-001')!
    expect(off).toEqual({ ...offDef, name: 'ทดสอบ หนึ่ง', position: 'ตำแหน่งทดสอบ' })
    expect(set.users.filter((u) => u.id !== 'OFF-001')).toEqual(def.users.filter((u) => u.id !== 'OFF-001'))
    expect(set.roleNames).toEqual(def.roleNames)
    expect(set.mockStateAccounts).toEqual(def.mockStateAccounts)
  })

  it('{user:ID} ใน roleNames ถูกแทนด้วยชื่อผู้ใช้ตามชุด', () => {
    const def = getRoleSet(DEFAULT_ROLE_SET_ID)
    const app = def.users.find((u) => u.id === 'APP-001')!
    expect(def.roleNames.appeal).toBe(`${app.name} (เจ้าหน้าที่อุทธรณ์)`)
    expect(def.roleNames.appeal).not.toContain('{user:')
    const set = buildRoleSet({ id: 't', label: 't', users: { 'APP-001': { name: 'ผู้อุทธรณ์ใหม่' } } })
    expect(set.roleNames.appeal).toBe('ผู้อุทธรณ์ใหม่ (เจ้าหน้าที่อุทธรณ์)')
  })

  it('override ที่ว่าง/ช่องว่างถูกละทิ้ง และรหัสที่ไม่รู้จักถูกข้ามพร้อม warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const def = getRoleSet(DEFAULT_ROLE_SET_ID)
    const set = buildRoleSet({ id: 't', label: 't', users: { 'OFF-001': { name: '  ', position: '' }, 'NOPE-999': { name: 'x' } } })
    expect(set.users).toEqual(def.users)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('รหัสที่อ้างผ่าน userNameById/userPositionById ใน src มีอยู่ในชุดตั้งต้นทั้งหมด', () => {
    const ids = new Set(getRoleSet(DEFAULT_ROLE_SET_ID).users.map((u) => u.id))
    const files = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const used = new Set<string>()
    Object.entries(files).forEach(([path, text]) => {
      if (/\.test\./.test(path)) return
      for (const m of text.matchAll(/user(?:Name|Position)ById\(\s*'([^']+)'\s*\)/g)) used.add(m[1])
    })
    expect(used.size).toBeGreaterThan(0)
    used.forEach((id) => expect(ids.has(id), id).toBe(true))
  })
})
