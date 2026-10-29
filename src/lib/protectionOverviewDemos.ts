import { addProtectionMonths } from './protectionMonths'
import type { CaseItem } from '../types/case'
import { addDays, currentReportPeriod } from './utils'

/** Independent prototype cases; never modifies the source case or existing cases. */
export function protectionOverviewDemos(base: CaseItem, now = new Date()): CaseItem[] {
  const at = now.toISOString()
  const year = now.getFullYear() + 543
  /** เคสสาธิตผ่านขั้นแฟ้มมาแล้ว — เชื่อมคดีหลักและประเมินความเร่งด่วนตามเคสต้นทาง */
  const dossierReady = protectionDemoDossierFields(base)
  const create = (suffix: string, person: string, elapsed: number): CaseItem => {
    const no = `${suffix.slice(-4)}/${year}`
    const start = addDays(now, -elapsed)
    return {
      no, person, demoData: true, form: 'คำร้อง', status: 'กำลังคุ้มครอง', stage: 'protection', owner: base.owner,
      next: 'ติดตามผลการคุ้มครอง', risk: 'สูง', orgUnitId: base.orgUnitId, ...dossierReady,
      assignedOfficer: base.assignedOfficer, assignedOfficerUserId: base.assignedOfficerUserId, receivedByUserId: base.receivedByUserId, protectionOwner: base.protectionOwner, protectionOwnerUserId: base.protectionOwnerUserId,
      protectionHandoff: base.protectionHandoff ? { ...base.protectionHandoff, step: 'active', events: [] } : undefined,
      activity7State: 'approved', decisionNumber: `คำสั่งจำลอง/${suffix}/${year}`,
      protectionMonths: 2, protectionDays: 60, actualStartedAt: start, protectionEndAt: addProtectionMonths(start, 2),
      orderedMethods: [4], approvedMethods: [4], kb9Signed: true, kb11Signed: true,
      episode: { id: `demo-episode-${no}`, openedAt: start, phases: [{ id: `demo-phase-${no}`, kind: 'MAIN', startedAt: start, orderRef: 'คำสั่งจำลอง' }] },
      methodTracks: [{ method: 4, status: 'active', coordination: { agency: base.methodTracks?.find((t) => t.method === 4)?.coordination?.agency, responseStatus: 'accepted', operationStartedAt: start } }],
      monthlyReports: [{ id: `demo-report-${no}`, period: currentReportPeriod(), submittedAt: at, submittedBy: base.owner, summary: 'รายงานจำลอง: ยังพบภัยคุกคามต่อพยาน ต้องทบทวนแนวทางคุ้มครอง', incidentCount: 1 }],
      reviewHandoff: { at, by: base.owner, reason: 'ข้อมูลสาธิต: ยังมีภัยคุกคามต่อพยาน', reportId: `demo-report-${no}`, period: currentReportPeriod(), riskLevel: 'สูง', cumulativeDays: elapsed, remainingDays: 180 - elapsed },
    }
  }
  const review = create('009901', 'พยานตัวอย่าง · รอทบทวน', 45)
  const extension = create('009902', 'พยานตัวอย่าง · ขอขยายเวลา', 50)
  extension.reviewProposals = [{ id: 'demo-review-extend', createdAt: at, createdBy: base.owner, cumulativeDays: 50, remainingDays: 130, riskSummary: 'ยังมีภัยคุกคาม', performanceSummary: 'มาตรการเดิมยังเหมาะสม', issues: 'ใกล้สิ้นสุดคำสั่งเดิม', proposedOutcome: 'extend', reason: 'ข้อมูลสาธิต: ต้องการคุ้มครองต่อเกินวันสิ้นสุดเดิม', status: 'endorsed', appliedOutcome: 'extend', appliedAt: at }]
  const referral = create('009903', 'พยานตัวอย่าง · ครบ 6 เดือน', 180)
  const referralStart = addProtectionMonths(now, -6)
  referral.actualStartedAt = referralStart
  referral.episode!.openedAt = referralStart
  referral.stage = 'article14'; referral.status = 'ครบ 6 เดือน · รอส่งต่อกรมคุ้มครองสิทธิฯ'
  referral.protectionMonths = 6; referral.protectionDays = 60; referral.protectionEndAt = at
  referral.episode!.phases = [0, 1, 2].map((n) => ({ id: `demo-phase-cap-${n}`, kind: 'MAIN', startedAt: addProtectionMonths(referralStart, n * 2), endedAt: addProtectionMonths(referralStart, (n + 1) * 2), orderRef: `คำสั่งจำลองครั้งที่ ${n + 1}` }))
  referral.methodTracks![0].status = 'ended'
  referral.article14 = { step: 'proposal_draft', openedAt: at, openedBy: base.owner, threatSummary: 'ข้อมูลสาธิต: ครบเพดานสะสม 6 เดือน แต่ภัยยังคงอยู่', riskAssessment: 'ยังมีภัยคุกคาม', recommendedMeasure: '', revisions: [] }
  const normal = [
    create('009904', 'พยานตัวอย่าง · คุ้มครองปกติ 1', 10),
    create('009905', 'พยานตัวอย่าง · คุ้มครองปกติ 2', 20),
  ].map((c): CaseItem => ({
    ...c,
    urgent: false,
    urgency: 'normal',
    risk: 'ปานกลาง',
    reviewHandoff: undefined,
    monthlyReports: [],
    next: 'ติดตามและรายงานผลการคุ้มครองตามรอบปกติ',
  }))
  return [review, extension, referral, ...normal]
}

/** ข้อมูลเชื่อมคดีหลักและผลประเมินความเร่งด่วนที่เคสคุ้มครองต้องมีแล้ว */
export function protectionDemoDossierFields(base: CaseItem): Partial<CaseItem> {
  return {
    urgent: Boolean(base.urgent),
    urgency: base.urgency || 'normal',
    urgencyAssessedAt: base.urgencyAssessedAt || base.actualStartedAt || 'ข้อมูลสาธิต',
    urgencyAssessedBy: base.urgencyAssessedBy || base.assignedOfficer || base.owner,
    linkedMainCaseId: base.linkedMainCaseId || 'GBK-2569-0001',
    mainCaseNo: base.mainCaseNo || 'GBK-2569-0001',
    mainCaseTitle: base.mainCaseTitle,
    mainCaseScore: base.mainCaseScore,
    mainCaseRelation: base.mainCaseRelation,
    mainCaseStatus: base.mainCaseStatus,
    mainCaseLeadOfficer: base.mainCaseLeadOfficer,
    mainCaseNotFound: false,
  }
}
