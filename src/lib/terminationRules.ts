import type { CaseItem, Kb15Report, TerminationClause } from '../types/case'
import { TERMINATION_CLAUSES, article14Agency } from './constants'
import { addProtectionMonths, calendarDate } from './protectionMonths'
import { cumulativeDays, deriveEpisode } from './episode'

/** ข้อ 19 ตามแม่แบบลูกค้า/ระเบียบฯ แยกจากที่มาของเรื่อง */
export const ARTICLE19_REASONS = [
  'ไม่มีเหตุที่จะให้การคุ้มครองต่อไปแล้ว',
  'พยานฝ่าฝืนหรือไม่ปฏิบัติตามเงื่อนไขโดยไม่มีเหตุอันควร',
  'การคุ้มครองไม่เป็นไปตามคำสั่งเลขาธิการ หรือไม่คุ้มค่า',
  'พฤติการณ์หรือสถานภาพเปลี่ยนไปจนไม่จำเป็นหรือไม่สามารถคุ้มครองต่อได้',
  'พยานไม่ยอมให้ถ้อยคำ ข้อเท็จจริง หรือข้อมูลโดยไม่มีเหตุอันควร',
] as const

export const clauseFromDraft = (draft: Record<string, any>): TerminationClause | undefined =>
  TERMINATION_CLAUSES.find(c => c.label === draft['ข้อระเบียบ'])?.value

export const reasonOptions = (clause?: TerminationClause): readonly string[] => clause === 4
  ? ARTICLE19_REASONS
  : clause ? [TERMINATION_CLAUSES.find(c => c.value === clause)!.label] : []

/** The template instruction controls KB17 wording, never appeal intake eligibility. */
export const showKb17AppealNotice = (c: Pick<CaseItem, 'kb15'>): boolean => c.kb15?.regulationClause === 4
export const confirmedAppealDeadline = (c: Pick<CaseItem, 'kb15'>, receivedAt: string): string | undefined => {
  if (!showKb17AppealNotice(c) || !calendarDate(receivedAt)) return undefined
  const date = new Date(`${calendarDate(receivedAt)}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 30)
  return date.toISOString().slice(0, 10)
}

export function terminationExpiry(c: CaseItem) {
  const episode = c.episode || deriveEpisode(c)
  const extensions = (c.extensionRequests || []).filter(r => r.status === 'approved' && r.periodTo)
    .sort((a, b) => calendarDate(a.periodTo!).localeCompare(calendarDate(b.periodTo!)))
  const latest = extensions.at(-1)
  const ends = [c.protectionEndAt, ...extensions.map(r => r.periodTo)].filter(Boolean).map(x => calendarDate(x!)).filter(Boolean).sort()
  return {
    orderRef: latest ? `คบ.14 ${latest.id}` : episode?.phases.at(-1)?.orderRef || '',
    currentEndAt: ends.at(-1) || '',
    capAt: episode?.openedAt ? addProtectionMonths(episode.openedAt, 6) : '',
    extensionIds: extensions.map(r => r.id),
    cumulativeDays: cumulativeDays(episode),
    pending: (c.extensionRequests || []).some(r => ['submitted', 'pending'].includes(r.status)),
  }
}

/** Returns issues without guessing a clause for historic records. Rechecked before ordering. */
export function validateTerminationBasis(c: CaseItem, report: Partial<Kb15Report>): string[] {
  const errors: string[] = []
  const clause = report.regulationClause
  if (!clause) return ['กรุณาตรวจยืนยันเหตุสิ้นสุดตามข้อ 18 จากหลักฐานเดิม']
  if (!report.summary || !reasonOptions(clause).includes(report.summary)) errors.push('เหตุย่อยไม่สอดคล้องกับเหตุหลัก กรุณาตรวจยืนยันใหม่')
  if (!report.evidenceNote?.trim()) errors.push('กรุณาระบุหลักฐานประกอบ')
  if (!calendarDate(report.occurredAt || '')) errors.push('กรุณาระบุวันที่เกิดเหตุ')
  if (!calendarDate(report.proposedEndAt || '')) errors.push('กรุณาระบุวันที่เสนอให้สิ้นสุด')
  if (clause === 1) {
    const kb7 = report.basis?.kb7
    if (!kb7?.signed || !kb7.documentName || !kb7.applicant || !kb7.reason || !calendarDate(kb7.receivedAt)) errors.push('ต้องเชื่อม คบ.7 เดิมพร้อมผู้ยื่น วันที่รับ เหตุผล และหลักฐานการลงนาม')
    if (kb7?.requestedEndAt && calendarDate(kb7.requestedEndAt) < calendarDate(kb7.receivedAt)) errors.push('วันที่ขอให้ยุติต้องไม่ก่อนวันที่รับคำร้อง')
    if (kb7?.requestedEndAt && calendarDate(report.proposedEndAt || '') < calendarDate(kb7.requestedEndAt)) errors.push('วันที่เสนอให้สิ้นสุดต้องไม่ก่อนวันที่พยานขอให้ยุติ')
    if (!calendarDate(kb7?.requestedEndAt || '')) errors.push('กรุณาระบุวันที่พยานขอให้ยุติจากคำร้อง')
    if (kb7?.receivedAt && calendarDate(report.occurredAt || '') !== calendarDate(kb7.receivedAt)) errors.push('วันที่เกิดเหตุต้องตรงกับวันที่รับคำร้องขอยุติ')
  }
  if (clause === 2) {
    const expiry = terminationExpiry(c)
    if (!expiry.currentEndAt || !expiry.orderRef) errors.push('ยังไม่มีคำสั่งและวันครบกำหนดที่ตรวจสอบได้')
    if (expiry.pending) errors.push('มีคำขอขยายเวลารอพิจารณา ต้องตรวจผลก่อนสรุปเหตุครบกำหนด')
    if (!report.basis?.expiry || report.basis.expiry.currentEndAt !== expiry.currentEndAt || report.basis.expiry.extensionIds.join() !== expiry.extensionIds.join()) errors.push('คำสั่งหรือระยะเวลาคุ้มครองเปลี่ยนแล้ว กรุณาตรวจข้อมูลล่าสุด')
    if (calendarDate(report.occurredAt || '') !== expiry.currentEndAt) errors.push('วันที่ครบกำหนดต้องตรงกับคำสั่งล่าสุดรวมคำสั่งขยายเวลา')
    if (calendarDate(report.proposedEndAt || '') < expiry.currentEndAt) errors.push('วันที่เสนอให้สิ้นสุดต้องไม่ก่อนครบกำหนดคำสั่งที่มีผล')
  }
  if (clause === 3) {
    const a = c.article14
    if (a?.step !== 'handover_done' || !a.successorStartedAt || !a.successorLegalBasis || !a.replyDocumentName || !a.handoverCompletedAt) errors.push('ต้องมีหลักฐานว่าได้รับความคุ้มครองตามกฎหมายคดีอาญาแล้วจากงานส่งต่อเดิม การส่งหนังสือหรือรับพิจารณายังไม่เพียงพอ')
    if (!report.basis?.referral || report.basis.referral.effectiveAt !== a?.successorStartedAt || report.basis.referral.documentName !== a?.replyDocumentName) errors.push('กรุณาเชื่อมหลักฐานและวันที่มีผลจากงานส่งต่อเดิม')
    if (calendarDate(report.occurredAt || '') !== calendarDate(a?.successorStartedAt || '')) errors.push('วันที่เกิดเหตุต้องตรงกับวันที่ได้รับความคุ้มครองต่อ')
  }
  if (clause === 4 && (!report.article19Reason || ARTICLE19_REASONS[report.article19Reason - 1] !== report.summary)) errors.push('กรุณาเลือกเหตุย่อยตามข้อ 19')
  return [...new Set(errors)]
}

/** Document progress and appeal activity never extend an order's effective period. */
export function terminationEffectiveAt(c: CaseItem, now = new Date()): string | undefined {
  const report = c.kb15
  if (!report || validateTerminationBasis(c, report).length) return undefined
  const date = report.regulationClause === 4
    ? c.kb16?.signedAt ? c.kb16.effectiveAt : undefined
    : report.regulationClause === 1 ? report.basis?.kb7?.requestedEndAt : report.occurredAt
  const iso = calendarDate(date || '')
  return iso && iso <= calendarDate(now) ? iso : undefined
}

export const terminationReasonText = (report?: Partial<Kb15Report>): string => report
  ? [TERMINATION_CLAUSES.find(c => c.value === report.regulationClause)?.label,
    report.regulationClause === 4 ? `ข้อ 19 (${report.article19Reason || '…'}) ${report.summary}` : '',
    report.facts, report.evidenceNote].filter(Boolean).join(' · ') : ''

export function terminationReportFromDraft(c: CaseItem, draft: Record<string, any>, kb7: Record<string, any>, kb7Signed = false): Partial<Kb15Report> {
  const clause = clauseFromDraft(draft)
  const summary = String(draft['เหตุยุติ'] || '')
  const doc = (c.documents || []).find(d => !d.deleted && d.name === (draft['หลักฐานคำร้อง คบ.7'] || c.terminationTrigger?.documentName))
  return {
    trigger: c.terminationTrigger?.source,
    triggerRef: terminationTriggerReference(c, draft),
    triggerDocumentName: c.terminationTrigger?.documentName,
    triggerReceivedAt: c.terminationTrigger?.receivedAt,
    regulationClause: clause,
    summary,
    article19Reason: clause === 4 && ARTICLE19_REASONS.includes(summary as any) ? (ARTICLE19_REASONS.indexOf(summary as any) + 1) as 1 | 2 | 3 | 4 | 5 : undefined,
    facts: String(draft['ข้อเท็จจริง'] || ''),
    evidenceNote: String(draft['สรุปผล'] || ''),
    occurredAt: String(draft['วันที่เกิดเหตุ'] || ''),
    proposedEndAt: String(draft['วันที่เสนอให้สิ้นสุด'] || ''),
    basis: {
      ...(clause === 1 ? { kb7: {
        applicant: [kb7['ชื่อผู้ยื่น'], kb7['นามสกุลผู้ยื่น']].filter(Boolean).join(' '),
        receivedAt: String(draft['วันที่รับคำร้อง คบ.7'] || c.terminationTrigger?.receivedAt || ''),
        requestedEndAt: String(kb7['วันที่ขอให้ยุติ'] || draft['วันที่ขอให้ยุติ'] || ''),
        reason: String(kb7['เหตุผลการยุติ'] || ''),
        documentName: doc?.name || (kb7Signed ? 'คบ.7 ลงนามในแฟ้ม' : ''),
        signed: kb7Signed || Boolean(doc?.signed) || Boolean(doc && draft['ตรวจลายมือชื่อคำร้อง คบ.7']),
      } } : {}),
      ...(clause === 2 ? { expiry: terminationExpiry(c) } : {}),
      ...(clause === 3 ? { referral: {
        agency: article14Agency(c).office,
        documentName: c.article14?.replyDocumentName || '',
        effectiveAt: c.article14?.successorStartedAt || '',
        legalBasis: c.article14?.successorLegalBasis || '',
      } } : {}),
    },
    formSnapshot: structuredClone(draft),
  }
}

/** Resolve expiry evidence from the approved order without modifying the signed form. */
export function terminationTriggerReference(c: CaseItem, draft: Record<string, any>): string {
  const entered = String(draft['อ้างอิงเหตุยุติ'] || c.terminationTrigger?.ref || '').trim()
  if (entered) return entered
  if (clauseFromDraft(draft) !== 2) return ''
  return String(draft['คำสั่งเดิม'] || terminationExpiry(c).orderRef || c.decisionNumber || '').trim()
}
