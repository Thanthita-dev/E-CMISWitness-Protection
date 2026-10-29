import { useMemo } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { useCaseStore } from '../store/useCaseStore'
import { canViewHandoffCase } from '../lib/protectionHandoff'

/** ใช้ขอบเขตแฟ้มเดียวกันในหน้ารายการและการเปิด URL รายสำนวน */
export function useVisibleCases() {
  const allCases = useCaseStore((state) => state.cases)
  const { currentRole, currentOfficerUserId, currentDirectorUserId, currentOrgUnitId } = useAuthStore()
  return useMemo(() => allCases.filter((item) => canViewHandoffCase(currentRole, item, currentOfficerUserId)),
    [allCases, currentRole, currentOfficerUserId, currentDirectorUserId, currentOrgUnitId])
}
