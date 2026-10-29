import { expect, it } from 'vitest'
import { canProposeAgencyReferral } from './episode'
import type { CaseItem } from '../types/case'

const active = { stage: 'protection', actualStartedAt: '2026-10-08', approvedMethods: [4] } as CaseItem
it('allows an active method 4 case to propose referral before the protection cap', () => {
  expect(canProposeAgencyReferral(active)).toBe(true)
})
it('does not open referral before protection starts or after the case closes', () => {
  expect(canProposeAgencyReferral({ ...active, actualStartedAt: undefined })).toBe(false)
  for (const stage of ['terminated', 'transferred', 'withdrawn'] as const) {
    expect(canProposeAgencyReferral({ ...active, stage })).toBe(false)
  }
})
