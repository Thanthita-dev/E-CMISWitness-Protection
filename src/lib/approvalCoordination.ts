import type { CaseItem, CoordinationAgencyType, CoordinationLetterDraft } from '../types/case'
import { COORDINATION_AGENCY_TYPES, KB6_METHOD_SUBITEM_FIELDS, KB6_PROTECTION_METHOD_FIELD, readRoutableProtectionMethods } from './constants'

/** Explicit KB6 choices win, including an empty selection; old cases fall back to their saved order. */
export const approvalMethods = (c: CaseItem, kb6: Record<string, any>): number[] =>
  Array.isArray(kb6[KB6_PROTECTION_METHOD_FIELD]) ? readRoutableProtectionMethods({ ...kb6, [KB6_PROTECTION_METHOD_FIELD]: kb6[KB6_PROTECTION_METHOD_FIELD].map(Number) })
    : c.orderedMethods ?? c.methodChoice?.methods ?? c.approvedMethods ?? (c.activity7State === 'approved' || c.stage === 'external_pending' ? c.methodTracks?.map(t => t.method) ?? [] : [])

export function approvalCoordinationAgency(c: CaseItem, kb6: Record<string, any>): CoordinationAgencyType | undefined {
  if (!approvalMethods(c, kb6).includes(4)) return undefined
  const raw = String(kb6[KB6_METHOD_SUBITEM_FIELDS[4]] || '').trim()
  if (raw) return COORDINATION_AGENCY_TYPES.find(t => [t.label, t.value, t.agency].includes(raw))?.value
  const co = c.methodTracks?.find(t => t.method === 4)?.coordination
  return c.methodChoice?.agencyType || co?.agencyType || c.coordinationApproval?.agencyType || (c.policeLetters || co ? 'police' : undefined)
}

export interface CoordinationApproval {
  id: string
  agencyType: Exclude<CoordinationAgencyType, 'police'>
  agency: string
  draft: CoordinationLetterDraft
  createdAt: string
  reviewedKey?: string
  signature?: { at: string; by: string; userId: string; draft: CoordinationLetterDraft; html: string }
}
export const coordinationApprovalKey = (a: CoordinationApproval) => JSON.stringify({ id: a.id, agencyType: a.agencyType, agency: a.agency, draft: a.draft })

export function makeCoordinationApproval(c: CaseItem, agencyType: CoordinationApproval['agencyType']): CoordinationApproval {
  const co = c.methodTracks?.find(t => t.method === 4)?.coordination
  const preset = COORDINATION_AGENCY_TYPES.find(t => t.value === agencyType)!
  const matching = co?.agencyType === agencyType
  const draft: CoordinationLetterDraft = matching && co?.letterDraft ? { ...co.letterDraft, signatureImage: undefined } : {
    registryNo: '', registryDate: '', subject: 'ขอความร่วมมือในการคุ้มครองพยาน', signerName: '', signerPosition: 'เลขาธิการคณะกรรมการ ป.ป.ท.',
    body: `สำนักงาน ป.ป.ท. ได้อนุมัติให้ความคุ้มครองแก่ ${c.person} ตามคำร้องเลขที่ ${c.no} โดยใช้วิธีประสานหน่วยงานอื่นให้คุ้มครอง ตามระยะเวลาและเงื่อนไขในคำสั่งอนุมัติคุ้มครอง\n\nจึงขอความร่วมมือจากหน่วยงานของท่านพิจารณาดำเนินการคุ้มครองพยานตามข้อตกลง คบ.11 และแจ้งผลการพิจารณาตอบรับเป็นหนังสือ เพื่อประสานรายละเอียดการดำเนินการต่อไป`,
  }
  return { id: crypto.randomUUID(), agencyType, agency: matching && co?.agency || preset.agency, draft, createdAt: new Date().toISOString() }
}
