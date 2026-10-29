import { describe, expect, it } from 'vitest'
import { isReferralCommitteeTask, restoreReferralCommitteeRoute } from './referralCommittee'
import { additionalFormDocument, getAdditionalForm } from './additionalForms'
import { referralValues } from './referralDocuments'
import type { CaseItem } from '../types/case'

const pending = (): CaseItem => ({ no: '9903/2569', article14: { step: 'committee_pending', secretaryAt: '28/10/2569 17:11', threatSummary: 'existing', riskAssessment: 'existing', revisions: [] }, sarabanDispatch: { flow: 'article14', direction: 'down' }, sarabanRecords: [{ number: 'keep' }] } as unknown as CaseItem)
describe('referral committee routing', () => {
  it('repairs the old officer-return detour and preserves records and drafts', () => {
    const before = pending()
    const c = restoreReferralCommitteeRoute(before)
    expect(c.sarabanDispatch).toBeUndefined()
    expect(c.sarabanRecords).toEqual(before.sarabanRecords)
    expect(c.article14?.threatSummary).toBe('existing')
    expect(c.article14?.secretarySignature).toBeUndefined()
    expect(isReferralCommitteeTask(c)).toBe(true)
    expect(restoreReferralCommitteeRoute(c)).toBe(c)
    expect(before.sarabanDispatch).toBeTruthy()
  })
  it('excludes unrelated protection work and respects other pending registry work', () => {
    expect(isReferralCommitteeTask({ stage: 'protection' } as CaseItem)).toBe(false)
    const c = pending()
    c.sarabanDispatch!.flow = 'appeal'
    expect(restoreReferralCommitteeRoute(c)).toBe(c)
    expect(isReferralCommitteeTask(c)).toBe(false)
  })
  it('renders the secretary signature in the original signature field for preview and print', () => {
    const c = restoreReferralCommitteeRoute(pending())
    c.article14!.secretarySignature = { name: 'Test Secretary', at: 'now', image: 'data:image/png;base64,aGVsbG8=' }
    const values = referralValues(c, 'chairman-signature', { _referralValues: { values: { subject: 'Existing subject' }, paragraphs: {} } })
    const html = additionalFormDocument(getAdditionalForm('chairman-signature')!, values)
    expect(values.values.subject).toBe('Existing subject')
    expect(html).toContain('Test Secretary')
    expect(html).toContain('data:image/png;base64,aGVsbG8=')
  })
})
