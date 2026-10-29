import { describe, expect, it } from 'vitest'
import type { CaseItem } from '../types/case'
import { isFormSignedForCase } from './formSignature'

describe('KB17 dossier signature status', () => {
  it('recognizes the saved authority signature without an editor draft', () => {
    const c = { kb17: { signedAt: '2026-10-29T09:00:00+07:00' } } as CaseItem
    expect(isFormSignedForCase(17, c, {})).toBe(true)
  })
  it('keeps an unsigned submitted notice pending', () => {
    const c = { kb17: { status: 'submitted' } } as CaseItem
    expect(isFormSignedForCase(17, c, {})).toBe(false)
  })
  it('does not reuse the preceding order signature for the notice', () => {
    const c = { kb16: { signedAt: '2026-10-29T09:00:00+07:00' } } as CaseItem
    expect(isFormSignedForCase(17, c, {})).toBe(false)
  })
})
