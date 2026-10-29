import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { UserRole, EcmisUser, OrgUnit } from '../types/user'
import { ECMIS_USER_DIRECTORY, ORG_UNITS, ROLE_ORG_ASSIGNMENTS } from '../lib/constants'
import { findLoginAccount, type LoginAccount } from '../lib/loginAccounts'

/** คีย์ sessionStorage บอกว่าเซสชันเข้าสู่ระบบนี้ยังอยู่ (ใช้กับโหมดไม่จำการเข้าสู่ระบบ) */
const LOGIN_SESSION_KEY = 'ecmis-wp-login-session'

const hasLoginSession = () => {
  try {
    return sessionStorage.getItem(LOGIN_SESSION_KEY) !== null
  } catch {
    return false
  }
}

interface AuthState {
  currentRole: UserRole
  currentOfficerUserId: string
  currentDirectorUserId: string
  currentOrgUnitId: string | null
  sidebarCollapsed: boolean
  isGlobalSearchOpen: boolean
  globalSearchQuery: string
  isAuthenticated: boolean
  rememberLogin: boolean
  loginUsername: string | null

  login: (account: LoginAccount, options?: { remember?: boolean }) => void
  logout: () => void
  setRole: (role: UserRole) => void
  setOfficerUserId: (id: string) => void
  setDirectorUserId: (id: string) => void
  setOrgUnitId: (id: string | null) => void
  toggleSidebar: () => void
  setGlobalSearchOpen: (open: boolean) => void
  setGlobalSearchQuery: (query: string) => void

  getCurrentOfficerAccount: () => EcmisUser | null
  getCurrentUserAccount: () => EcmisUser | null
  getCurrentDirectorAccount: () => EcmisUser | null
  getOrgUnitsForRole: (role?: UserRole) => OrgUnit[]
  getCurrentOrgUnit: () => OrgUnit | null
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentRole: 'officer',
      currentOfficerUserId: 'OFF-001',
      currentDirectorUserId: 'DIR-001',
      currentOrgUnitId: 'central-wp',
      sidebarCollapsed: false,
      isGlobalSearchOpen: false,
      globalSearchQuery: '',
      isAuthenticated: false,
      rememberLogin: true,
      loginUsername: null,

      login: (account, options) => {
        const remember = options?.remember ?? true
        get().setRole(account.role)
        // ทุกตำแหน่งใช้รหัสบุคคลจริงของบัญชีที่เลือก รวมถึงผู้รับเรื่องและผู้พิจารณา
        if (account.userId) {
          const roleUnit = get().currentOrgUnitId
          get().setOfficerUserId(account.userId)
          if (account.role === 'director' || account.role === 'got_director') get().setDirectorUserId(account.userId)
          // ผู้ใช้ที่ระบุตัวตนได้ → เข้าหน่วยงานของตนเอง (เช่น บัญชีเขต 2 ต้องเข้าเขต 2) บทบาทส่วนกลางคงหน่วยตาม setRole
          const user = ECMIS_USER_DIRECTORY.find((u) => u.id === account.userId)
          set({ currentOrgUnitId: user && !ROLE_ORG_ASSIGNMENTS[account.role]?.central ? user.orgUnitId : roleUnit })
        }
        // บัญชีของ กอท./เขต กำหนดหน่วยงานเอง
        if (account.orgUnitId) get().setOrgUnitId(account.orgUnitId)
        try {
          sessionStorage.setItem(LOGIN_SESSION_KEY, '1')
        } catch { /* ไม่มี sessionStorage ก็ข้ามได้ */ }
        set({ isAuthenticated: true, loginUsername: account.username, rememberLogin: remember })
      },
      logout: () => {
        try {
          sessionStorage.removeItem(LOGIN_SESSION_KEY)
        } catch { /* ไม่มี sessionStorage ก็ข้ามได้ */ }
        set({ isAuthenticated: false, loginUsername: null })
      },

      setRole: (role) => {
        const assignment = ROLE_ORG_ASSIGNMENTS[role] || ROLE_ORG_ASSIGNMENTS.receiver
        const newOrgUnitId = assignment.central ? 'central-wp' : (assignment.units[0] || 'central-wp')
        const gotAccount = role.startsWith('got_')
          ? ECMIS_USER_DIRECTORY.find((u) => u.active && u.roles.includes(role))
          : undefined
        set({ currentRole: role, currentOrgUnitId: newOrgUnitId,
          ...(gotAccount ? { currentOfficerUserId: gotAccount.id } :
            (role === 'officer' || role === 'case_owner') && get().currentOfficerUserId.startsWith('GOT-')
              ? { currentOfficerUserId: 'OFF-001' } : {}) })
      },
      setOfficerUserId: (id) => {
        const officer = ECMIS_USER_DIRECTORY.find((u) => u.id === id)
        set({
          currentOfficerUserId: id,
          currentOrgUnitId: officer?.orgUnitId || get().currentOrgUnitId,
        })
      },
      setDirectorUserId: (id) => set({ currentDirectorUserId: id }),
      setOrgUnitId: (id) => set({ currentOrgUnitId: id }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setGlobalSearchOpen: (open) => set({ isGlobalSearchOpen: open }),
      setGlobalSearchQuery: (query) => set({ globalSearchQuery: query }),

      getCurrentOfficerAccount: () => {
        const { currentOfficerUserId } = get()
        return ECMIS_USER_DIRECTORY.find((u) => u.id === currentOfficerUserId) || null
      },
      getCurrentUserAccount: () => {
        const { currentRole, currentOfficerUserId, currentDirectorUserId, currentOrgUnitId } = get()
        /** บัญชีของ กอท. ใช้กับตำแหน่ง เจ้าหน้าที่/เจ้าของสำนวน/ผอ. ของ กอท. ในเมนูได้ (บทบาททั่วไป + หน้าที่ กอท.) */
        const accepts = (u: EcmisUser) => u.roles.includes(currentRole) ||
          (currentRole === 'director' && u.roles.includes('got_director')) ||
          ((currentRole === 'officer' || currentRole === 'case_owner') && u.roles.includes('got_officer'))
        if (['officer', 'case_owner', 'got_officer'].includes(currentRole)) {
          return ECMIS_USER_DIRECTORY.find((u) => u.id === currentOfficerUserId && u.active && accepts(u)) || null
        }
        if (currentRole === 'director') return ECMIS_USER_DIRECTORY.find((u) => u.id === currentDirectorUserId && u.active && accepts(u)) || null
        return ECMIS_USER_DIRECTORY.find((u) => u.id === currentOfficerUserId && u.active && accepts(u)) ||
          ECMIS_USER_DIRECTORY.find((u) => u.active && u.orgUnitId === currentOrgUnitId && accepts(u)) ||
          ECMIS_USER_DIRECTORY.find((u) => u.active && u.roles.includes(currentRole)) || null
      },
      getCurrentDirectorAccount: () => {
        const { currentDirectorUserId } = get()
        return ECMIS_USER_DIRECTORY.find((u) => u.id === currentDirectorUserId) || null
      },
      getOrgUnitsForRole: (role) => {
        const targetRole = role || get().currentRole
        const assignment = ROLE_ORG_ASSIGNMENTS[targetRole] || ROLE_ORG_ASSIGNMENTS.receiver
        return assignment.units.map((uid) => ORG_UNITS.find((u) => u.id === uid)).filter(Boolean) as OrgUnit[]
      },
      getCurrentOrgUnit: () => {
        const { currentOrgUnitId } = get()
        return ORG_UNITS.find((u) => u.id === currentOrgUnitId) || null
      },
    }),
    {
      name: 'ecmis-auth-storage',
      // state เก่า/ข้อมูลที่ seed (e2e, /mock-state) ไม่มี isAuthenticated ให้ถือว่าเข้าสู่ระบบแล้ว
      merge: (persisted, current) => {
        if (!persisted) return current
        const p = persisted as Partial<AuthState>
        const merged = { ...current, ...p, isAuthenticated: p.isAuthenticated ?? true }
        // ปรับรหัสบัญชีในเซสชันเก่าที่เคยยืมรหัสส่วนกลาง โดยไม่ย้ายเจ้าของแฟ้มย้อนหลัง
        const account = p.loginUsername ? findLoginAccount(p.loginUsername) : undefined
        if (account?.userId && account.orgUnitId === merged.currentOrgUnitId && account.role === merged.currentRole) {
          const legacyActor = ECMIS_USER_DIRECTORY.find((u) => u.id === merged.currentOfficerUserId)
          if (!legacyActor || legacyActor.orgUnitId !== account.orgUnitId) merged.currentOfficerUserId = account.userId
          if (account.role === 'director' && merged.currentDirectorUserId === 'DIR-001') merged.currentDirectorUserId = account.userId
        }
        // โหมดไม่จำการเข้าสู่ระบบ: ปิดแท็บแล้วเปิดใหม่ (sessionStorage หาย) ต้องเข้าสู่ระบบใหม่
        if (merged.isAuthenticated && merged.rememberLogin === false && !hasLoginSession()) {
          merged.isAuthenticated = false
          merged.loginUsername = null
        }
        return merged
      },
    }
  )
)
