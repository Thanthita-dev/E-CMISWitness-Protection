import { expect, it } from 'vitest'
import { completedProtectionOriginals } from './referralDocumentIdentity'
import type { CaseItem } from '../types/case'
const c = (fields: Partial<CaseItem>) => fields as CaseItem
it('marks original documents completed for active protection even in old demo data', () => {
  expect(completedProtectionOriginals(c({ stage: 'protection' }))).toBe(true)
  expect(completedProtectionOriginals(c({ stage: 'method_operation', activity7State: 'approved', protectionHandoff: { step: 'active' } as CaseItem['protectionHandoff'] }))).toBe(true)
})
it('does not imply completion while GOT is accepting work or approval is still pending', () => {
  expect(completedProtectionOriginals(c({ stage: 'external_pending' }))).toBe(false)
  expect(completedProtectionOriginals(c({ stage: 'notice', activity7State: 'approved', protectionHandoff: { step: 'accepted' } as CaseItem['protectionHandoff'] }))).toBe(false)
})
