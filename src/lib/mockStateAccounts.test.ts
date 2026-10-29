import { describe, expect, it } from 'vitest'
import type { UserRole } from '../types/user'
import { useAuthStore } from '../store/useAuthStore'
import { MOCK_STATES } from './mockState'
import { getRoleSet, ROLE_SET_STORAGE_KEY } from './roleSets'
import { LEGACY_MOCK_USER_IDS, authStateForAccount, mockStateAccountForRole, syncMockStateAccounts, type MockAuthState } from './mockStateAccounts'

const authOf = (data: Record<string, string>) => JSON.parse(data['ecmis-auth-storage']).state as MockAuthState
const caseText = (data: Record<string, string>) => data['ecmis-case-storage-v2'] ?? ''

describe('mock state ตรงกับบัญชีทดลองปัจจุบัน', () => {
  const roles = [...new Set(MOCK_STATES.map((s) => authOf(s.localStorageData).currentRole))]

  it.each(roles)('บัญชีของบทบาท %s ให้ค่าเดียวกับการเข้าสู่ระบบจริง', (role) => {
    const account = mockStateAccountForRole(role as UserRole)!
    const prev = useAuthStore.getState()
    useAuthStore.getState().login(account)
    const real = useAuthStore.getState()
    const computed = authStateForAccount(account, { ...prev })
    expect({
      currentRole: computed.currentRole,
      currentOfficerUserId: computed.currentOfficerUserId,
      currentDirectorUserId: computed.currentDirectorUserId,
      currentOrgUnitId: computed.currentOrgUnitId,
      loginUsername: computed.loginUsername,
    }).toEqual({
      currentRole: real.currentRole,
      currentOfficerUserId: real.currentOfficerUserId,
      currentDirectorUserId: real.currentDirectorUserId,
      currentOrgUnitId: real.currentOrgUnitId,
      loginUsername: real.loginUsername,
    })
  })

  it.each(MOCK_STATES.map((s) => [s.name, s] as const))('%s ซิงก์แล้ว (รัน scripts/sync-mock-state-accounts.mjs ถ้าไม่ผ่าน)', (_name, state) => {
    const auth = authOf(state.localStorageData)
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.loginUsername).toBe(mockStateAccountForRole(auth.currentRole, getRoleSet(state.localStorageData[ROLE_SET_STORAGE_KEY]))?.username)
    expect(syncMockStateAccounts(state)).toEqual(state)
    const text = caseText(state.localStorageData)
    LEGACY_MOCK_USER_IDS.forEach((id) => expect(text).not.toContain(`"${id}"`))
  })
})
