import type { CaseItem } from '../types/case'
import { isRightsReferral } from './referralDocumentIdentity'

export const isReferralCommitteeTask = (c: CaseItem): boolean =>
  c.article14?.step === 'committee_pending' && Boolean(c.article14.committeeSentAt) && !c.sarabanDispatch

/** Repair the former return-to-officer detour without changing signatures or registry history. */
export function restoreReferralCommitteeRoute(c: CaseItem): CaseItem {
  const a = c.article14
  if (!a || !isRightsReferral(c) || a.step !== 'committee_pending' || !a.secretaryAt || a.committeeSentAt) return c
  if (c.sarabanDispatch && (c.sarabanDispatch.flow !== 'article14' || c.sarabanDispatch.direction !== 'down')) return c
  return { ...c, sarabanDispatch: undefined,
    article14: { ...a, committeeSentAt: a.secretaryAt, committeeSentBy: a.approvals?.find(x => x.level === 'secretary')?.by || 'เลขาธิการ ป.ป.ท.' },
    owner: 'ฝ่ายเลขานุการคณะกรรมการ ป.ป.ท.', status: 'รอคณะกรรมการพิจารณาส่งต่อกรมคุ้มครองสิทธิฯ', next: 'ฝ่ายเลขานุการคณะกรรมการบันทึกมติในแฟ้ม' }
}
