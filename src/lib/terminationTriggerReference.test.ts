import { expect, it } from 'vitest'
import { terminationTriggerReference } from './terminationRules'
import { TERMINATION_CLAUSES } from './constants'
import type { CaseItem } from '../types/case'
it('uses the existing approval reference for a signed expiry form without changing its draft', () => {
  const c = { no: 'EXPIRY', decisionNumber: 'คำสั่ง 99/2569' } as CaseItem
  const draft = Object.freeze({ ข้อระเบียบ: TERMINATION_CLAUSES[1].label })
  expect(terminationTriggerReference(c, draft)).toBe('คำสั่ง 99/2569')
  expect(terminationTriggerReference(c, { ...draft, อ้างอิงเหตุยุติ: 'อ้างอิงเฉพาะ' })).toBe('อ้างอิงเฉพาะ')
  expect(terminationTriggerReference(c, { ข้อระเบียบ: TERMINATION_CLAUSES[0].label })).toBe('')
})
