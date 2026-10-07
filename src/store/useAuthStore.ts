import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { UserRole, EcmisUser, OrgUnit } from '../types/user'
import { ECMIS_USER_DIRECTORY, ORG_UNITS, ROLE_ORG_ASSIGNMENTS } from '../lib/constants'

interface AuthState {
  currentRole: UserRole
  currentOfficerUserId: string
  currentDirectorUserId: string
  currentOrgUnitId: string | null
  sidebarCollapsed: boolean
  isGlobalSearchOpen: boolean
  globalSearchQuery: string

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
        const { currentRole, currentOfficerUserId, currentDirectorUserId } = get()
        if (['officer', 'case_owner', 'got_officer'].includes(currentRole)) {
          return ECMIS_USER_DIRECTORY.find((u) => u.id === currentOfficerUserId && u.active && u.roles.includes(currentRole)) || null
        }
        if (currentRole === 'director') return ECMIS_USER_DIRECTORY.find((u) => u.id === currentDirectorUserId && u.active && u.roles.includes(currentRole)) || null
        return ECMIS_USER_DIRECTORY.find((u) => u.active && u.roles.includes(currentRole)) || null
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
    }
  )
)
