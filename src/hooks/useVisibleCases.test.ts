import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useVisibleCases } from './useVisibleCases'
import { useAuthStore } from '../store/useAuthStore'
import { useCaseStore } from '../store/useCaseStore'
import type { CaseItem } from '../types/case'

describe('รายการงานใช้ขอบเขตเดียวกับการเปิดแฟ้ม', () => {
  it('สลับเจ้าหน้าที่แล้วทะเบียน รายงาน และรายการงานไม่ค้างข้อมูลของคนเดิม', () => {
    useAuthStore.setState({ currentRole: 'officer', currentOfficerUserId: 'OFF-001', currentOrgUnitId: 'central-wp' })
    useCaseStore.setState({ cases: [
      { no: 'mine', assignedOfficerUserId: 'OFF-001', stage: 'supervisor_review' },
      { no: 'other', assignedOfficerUserId: 'OFF-002' },
      { no: 'reassigned', assignedOfficerUserId: 'OFF-002', receivedByUserId: 'OFF-001' },
      { no: 'own-intake', receivedByUserId: 'OFF-001' },
      { no: 'unknown-owner' },
    ] as CaseItem[] })
    const { result, unmount } = renderHook(() => useVisibleCases())
    expect(result.current.map((item) => item.no)).toEqual(['mine', 'own-intake'])
    act(() => useAuthStore.getState().setOfficerUserId('OFF-002'))
    expect(result.current.map((item) => item.no)).toEqual(['other', 'reassigned'])
    unmount()
  })
})
