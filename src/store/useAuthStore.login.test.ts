import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from './useAuthStore'
import type { LoginAccount } from '../lib/loginAccounts'
import { LOGIN_ACCOUNTS, LOGIN_ACCOUNT_GROUPS, findLoginAccount, verifyLogin } from '../lib/loginAccounts'

const STORAGE_KEY = 'ecmis-auth-storage'
const SESSION_KEY = 'ecmis-wp-login-session'
const acc = (u: string) => findLoginAccount(u)!

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useAuthStore.setState({
    currentRole: 'officer', currentOfficerUserId: 'OFF-001', currentDirectorUserId: 'DIR-001',
    isAuthenticated: false, rememberLogin: true, loginUsername: null,
  })
})

describe('บัญชีทดลอง', () => {
  it('ชื่อผู้ใช้ไม่ซ้ำ ครบทุกบทบาท และจัดกลุ่มตามลำดับ', () => {
    expect(LOGIN_ACCOUNTS).toHaveLength(65)
    expect(new Set(LOGIN_ACCOUNTS.map((a) => a.username)).size).toBe(LOGIN_ACCOUNTS.length)
    expect(new Set(LOGIN_ACCOUNTS.map((a) => a.role)).size).toBe(16)
    expect(LOGIN_ACCOUNT_GROUPS.slice(0, 11).map((g) => g.label)).toEqual([
      ...Array.from({ length: 9 }, (_, i) => `สำนักงาน ป.ป.ท. เขต ${i + 1}`),
      'ส่วนกลาง · สำนักงานเลขาธิการ',
      'ส่วนกลาง · กองคุ้มครองพยาน (กอท.)',
    ])
    // บัญชีของ กอท. ใช้บทบาทเฉพาะของ กอท.
    expect(acc('got.officer')).toMatchObject({ role: 'got_officer', userId: 'GOT-OFF-001' })
    expect(acc('got.director')).toMatchObject({ role: 'got_director', userId: 'GOT-DIR-001' })
    expect(LOGIN_ACCOUNT_GROUPS.flatMap((g) => g.accounts)).toEqual(LOGIN_ACCOUNTS)
    expect(acc('wp.admin').userId).toBeNull()
    expect(acc('reg1.officer').name).toBeTruthy()
    expect(findLoginAccount('wp.officer')).toBeUndefined()
    expect(acc('got.officer').name).toBe('นางสาวอรุณี ใจมั่น')
  })
  it('verifyLogin รับรหัสถูก ปฏิเสธรหัสผิด รับรูปแบบอีเมลและตัวพิมพ์ต่าง', () => {
    expect(verifyLogin('reg1.officer', '1234')?.role).toBe('officer')
    expect(verifyLogin('reg1.officer', '0000')).toBeNull()
    expect(verifyLogin('nobody', '1234')).toBeNull()
    expect(verifyLogin('  REG1.Officer@PACC.go.th ', '1234')?.role).toBe('officer')
  })
})

describe('บัญชีตามหน่วยงาน กอท. และเขต 1–9', () => {
  it('ทุกเขตมีตำแหน่งชุดเดียวกัน กอท. มีบทบาทเฉพาะ และ login แล้วอยู่หน่วยงานนั้น', () => {
    for (const prefix of Array.from({ length: 9 }, (_, i) => `reg${i + 1}`)) {
      for (const pos of ['receiver', 'officer', 'caseowner', 'supervisor', 'director', 'protection']) expect(findLoginAccount(`${prefix}.${pos}`)).toBeDefined()
    }
    for (const pos of ['receiver', 'officer', 'supervisor', 'director']) expect(findLoginAccount(`got.${pos}`)).toBeDefined()
    useAuthStore.getState().login(acc('reg3.supervisor'))
    expect(useAuthStore.getState()).toMatchObject({ currentRole: 'supervisor', currentOrgUnitId: 'pacc-reg-3' })
    useAuthStore.getState().login(acc('got.officer'))
    useAuthStore.getState().login(acc('reg5.officer'))
    expect(useAuthStore.getState()).toMatchObject({ currentRole: 'officer', currentOfficerUserId: 'OFF-REG5', currentOrgUnitId: 'pacc-reg-5' })
    useAuthStore.getState().login(acc('reg1.director'))
    expect(useAuthStore.getState()).toMatchObject({ currentDirectorUserId: 'DIR-REG1', currentOrgUnitId: 'pacc-reg-1' })
  })
})

describe('useAuthStore login/logout', () => {
  it('ผู้เยี่ยมใหม่ยังไม่เข้าสู่ระบบ', () => {
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(false)
    expect(s.rememberLogin).toBe(true)
    expect(s.loginUsername).toBeNull()
  })
  it('login ตั้ง role, officer, director และสถานะ', () => {
    useAuthStore.getState().login(acc('got.officer'))
    let s = useAuthStore.getState()
    expect(s.currentRole).toBe('got_officer')
    expect(s.currentOfficerUserId).toBe('GOT-OFF-001')
    expect(s.currentOrgUnitId).toBe('central-gmc')
    expect(s.isAuthenticated).toBe(true)
    expect(s.loginUsername).toBe('got.officer')
    useAuthStore.getState().login(acc('reg1.director'))
    s = useAuthStore.getState()
    expect(s.currentRole).toBe('director')
    expect(s.currentDirectorUserId).toBe('DIR-REG1')
  })
  it('logout ล้างสถานะเข้าสู่ระบบแต่คง role', () => {
    useAuthStore.getState().login(acc('reg1.supervisor'))
    useAuthStore.getState().logout()
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(false)
    expect(s.loginUsername).toBeNull()
    expect(s.currentRole).toBe('supervisor')
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })
})

describe('persist merge', () => {
  it('เซสชันเขตที่เคยยืม OFF-001 กลับมาใช้บุคคลของบัญชีนั้นหลังโหลดใหม่', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: {
      currentRole: 'case_owner', currentOfficerUserId: 'OFF-001', currentOrgUnitId: 'pacc-reg-5',
      loginUsername: 'reg5.caseowner', isAuthenticated: true, rememberLogin: true,
    }, version: 0 }))
    await useAuthStore.persist.rehydrate()
    expect(useAuthStore.getState().currentOfficerUserId).toBe('OWN-REG5')
    expect(useAuthStore.getState().getCurrentUserAccount()?.orgUnitId).toBe('pacc-reg-5')
  })
  it('state เก่าที่ไม่มี isAuthenticated ถือว่าเข้าสู่ระบบแล้ว', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { currentRole: 'director' }, version: 0 }))
    await useAuthStore.persist.rehydrate()
    const s = useAuthStore.getState()
    expect(s.currentRole).toBe('director')
    expect(s.isAuthenticated).toBe(true)
  })
  it('โหมดไม่จำ: sessionStorage หายแล้วถือว่าออกจากระบบ', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      state: { isAuthenticated: true, rememberLogin: false, loginUsername: 'reg1.officer' }, version: 0,
    }))
    await useAuthStore.persist.rehydrate()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().loginUsername).toBeNull()
    sessionStorage.setItem(SESSION_KEY, '1')
    await useAuthStore.persist.rehydrate()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
  it('โหมดจำ: เซสชันหายก็ยังเข้าสู่ระบบอยู่', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      state: { isAuthenticated: true, rememberLogin: true, loginUsername: 'reg1.officer' }, version: 0,
    }))
    await useAuthStore.persist.rehydrate()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })
})

describe('login ตามหน่วยงานของผู้ใช้', () => {
  const mk = (role: LoginAccount['role'], userId: string): LoginAccount =>
    ({ username: `test.${userId}`, password: '1234', role, userId, name: userId, position: '', group: '' })
  it.each([
    ['director', 'DIR-REG2', 'pacc-reg-2'],
    ['receiver', 'REC-REG2', 'pacc-reg-2'],
    ['receiver', 'REC-REG1', 'pacc-reg-1'],
    ['got_supervisor', 'GOT-SUP-001', 'central-gmc'],
    ['secretary_receiver', 'SECREC-001', 'central-wp'],
  ] as const)('%s %s เข้าหน่วย %s และได้ผู้ใช้ของตน', (role, userId, org) => {
    useAuthStore.getState().login(mk(role, userId))
    const s = useAuthStore.getState()
    expect(s.currentOrgUnitId).toBe(org)
    expect(s.getCurrentUserAccount()?.id).toBe(userId)
  })
})
