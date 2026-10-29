import { expect, it } from 'vitest'
import { protectionOverviewDemos } from './protectionOverviewDemos'
import { visibleOperationCase } from './protectionHandoff'
import type { CaseItem } from '../types/case'

it.each(['GOT-OFF-001', 'GOT-OFF-002'])('creates visible demo cases without an existing case for %s', (userId) => {
  const base: CaseItem = { no: 'DEMO', person: 'พยานตัวอย่าง', form: 'คำร้อง', stage: 'protection', status: 'กำลังคุ้มครอง', owner: 'ผู้รับผิดชอบ', next: '', risk: 'สูง', orgUnitId: 'central-gmc', assignedOfficerUserId: userId, receivedByUserId: userId, protectionOwnerUserId: userId }
  const cases = protectionOverviewDemos(base)
  expect(cases.length).toBeGreaterThan(0)
  expect(cases.every(c => visibleOperationCase('got_officer', c, userId))).toBe(true)
})
