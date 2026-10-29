import type { CaseItem, CoordinationLetterDraft, OfficialLetter } from '../types/case'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { selectCaseDraft, useFormDraftStore } from '../store/useFormDraftStore'
import { ECMIS_USER_DIRECTORY, ORG_UNITS } from './constants'
import { canOperateHandoff, roleForCase } from './protectionHandoff'
import { isCaseClosed } from './permissions'
import { buildLetterHtml } from '../components/protection/CoordinationLetterComposer'
import { policePersonalFields, createPoliceBundle, policeAllSigned, policeDate, policeDraft, policeMissing, policeRequired, policeRevisionKey, POLICE_KINDS, POLICE_SIGNER_POSITION, POLICE_TITLES, type PoliceLetterBundle, type PoliceLetterData, type PoliceLetterKind } from './policeLetters'

const context = (no: string) => {
  const c = useCaseStore.getState().cases.find(c => c.no === no)
  const a = useAuthStore.getState()
  return { c, a, actor: a.getCurrentUserAccount(), b: c?.policeLetters }
}
export const canPreparePolice = (c: CaseItem) => {
  const a = useAuthStore.getState(), actor = a.getCurrentUserAccount()
  if (isCaseClosed(c)) return false
  if (a.currentRole === 'admin') return true
  if (c.policeLetters?.revisionStage && !['draft', 'complete'].includes(c.policeLetters.revisionStage)) return false
  if (!actor) return false
  if (!['officer', 'case_owner', 'got_officer'].includes(a.currentRole)) return false
  if (c.protectionHandoff) return canOperateHandoff(a.currentRole, c, actor.id)
  return ['staff_review', 'assigned', 'draft', 'intake', 'revision'].includes(c.stage) && (c.gotRevision ? c.gotRevision.assigneeUserId === actor.id : !c.assignedOfficerUserId || c.assignedOfficerUserId === actor.id)
}
const save = (c: CaseItem, b: PoliceLetterBundle, action: string, versionId?: string) => {
  const by = useAuthStore.getState().getCurrentUserAccount()?.name || ''
  const next = { ...b, events: [...b.events, { at: new Date().toISOString(), by, action, versionId }] }
  useCaseStore.getState().updateCase(c.no, { policeLetters: next })
  useCaseStore.getState().logHistory(c.no, action, by, versionId || 'หนังสือตำรวจสองฉบับในชุดเสนอเดียวกัน')
}
export function preparePoliceLetters(no: string) {
  const { c, b, actor } = context(no)
  if (!c || !actor || !canPreparePolice(c)) return false
  if (b) return true
  const forms = useFormDraftStore.getState(), kb6 = selectCaseDraft(forms, 6, no)
  const oldCoordination = c.methodTracks?.find(t => t.method === 4)?.coordination
  const legacyPolice = c.activity7State === 'approved' && !!oldCoordination && (!oldCoordination.agencyType || oldCoordination.agencyType === 'police')
  if (!policeRequired(c, kb6) && !legacyPolice) return false
  const bundle = createPoliceBundle(c, policePersonalFields(forms, no), kb6, actor.name)
  if (c.activity7State === 'approved') bundle.revisionStage = 'draft'
  if (oldCoordination?.letterDraft) bundle.archives.push({ id: crypto.randomUUID(), version: 0, kind: 'station', draft: { ...oldCoordination.letterDraft }, data: { ...bundle.data }, status: 'draft' })
  save(c, bundle, 'เตรียมหนังสือตำรวจพร้อมชุดเสนอ คบ.6')
  return true
}
export function savePoliceData(no: string, data: PoliceLetterData) {
  const { c, b } = context(no)
  if (!c || !b || !canPreparePolice(c) || POLICE_KINDS.some(k => b.letters[k].signedAt || b.letters[k].status === 'awaiting_number')) return false
  if (JSON.stringify(b.data) === JSON.stringify(data)) return true
  const letters = { ...b.letters }
  for (const k of POLICE_KINDS) letters[k] = { ...letters[k], data: { ...data }, draft: { ...policeDraft(k, data), signerName: letters[k].draft.signerName }, status: 'draft', numberedAt: undefined, numberedBy: undefined }
  save(c, { ...b, data: { ...data }, letters }, 'แก้ข้อมูลร่วมของหนังสือตำรวจ · ต้องตรวจและออกเลขใหม่')
  return true
}
export function savePoliceDraft(no: string, kind: PoliceLetterKind, draft: CoordinationLetterDraft) {
  const { c, b } = context(no)
  if (!c || !b || !canPreparePolice(c) || b.letters[kind].signedAt || b.letters[kind].status === 'awaiting_number') return false
  const old = b.letters[kind]
  // Numbering, addressee, signature, and enclosure are owned by the workflow, not free-text editing.
  const next = { ...old.draft, subject: draft.subject, body: draft.body, signerName: draft.signerName, signerPosition: POLICE_SIGNER_POSITION }
  save(c, { ...b, letters: { ...b.letters, [kind]: { ...old, draft: next, status: old.numberedAt ? 'awaiting_signature' : 'draft' } } }, `แก้ร่าง${POLICE_TITLES[kind]}`, old.id)
  return true
}
export function requestPoliceNumbers(no: string) {
  const { c, b, a } = context(no)
  if (!c || !b || !['secretary', 'admin'].includes(a.currentRole) || (c.stage !== 'external_pending' && b.revisionStage !== 'secretary') || policeAllSigned(b)) return false
  const letters = { ...b.letters }
  for (const k of POLICE_KINDS) if (!letters[k].signedAt && !letters[k].numberedAt) letters[k] = { ...letters[k], status: 'awaiting_number' }
  save(c, { ...b, letters }, 'ขอธุรการ สลธ. เตรียมเลขและวันที่ก่อนลงนามในรอบอนุมัติเดิม')
  return true
}
export function issuePoliceNumbers(no: string, numbers: Record<PoliceLetterKind, { registryNo: string; registryDate: string }>) {
  const { c, b, a, actor } = context(no)
  if (!c || !b || !actor || !['secretary_receiver', 'admin'].includes(a.currentRole) || !POLICE_KINDS.some(k => b.letters[k].status === 'awaiting_number')) return false
  if (numbers.station.registryNo.trim() === numbers.national.registryNo.trim()) return false
  for (const k of POLICE_KINDS) {
    const n = numbers[k]
    if (!n.registryNo.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(n.registryDate) || !Number.isFinite(Date.parse(n.registryDate))) return false
    if (b.letters[k].signedAt && (b.letters[k].draft.registryNo !== n.registryNo.trim() || b.letters[k].draft.registryDate !== n.registryDate)) return false
    if (useCaseStore.getState().cases.some(other => other.no !== no && other.policeLetters && POLICE_KINDS.some(key => other.policeLetters!.letters[key].draft.registryNo === n.registryNo.trim()))) return false
  }
  const letters = { ...b.letters }, at = new Date().toISOString()
  for (const k of POLICE_KINDS) if (!letters[k].signedAt) letters[k] = { ...letters[k], draft: { ...letters[k].draft, registryNo: numbers[k].registryNo.trim(), registryDate: numbers[k].registryDate }, status: 'awaiting_signature', numberedAt: at, numberedBy: actor.name }
  letters.national = { ...letters.national, attachmentVersionId: letters.station.id, draft: { ...letters.national.draft, enclosure: `สำเนาหนังสือ สำนักงาน ป.ป.ท. ลับ ด่วนที่สุด ที่ ${letters.station.draft.registryNo} ลงวันที่ ${policeDate(letters.station.draft.registryDate)}` } }
  save(c, { ...b, letters }, 'ธุรการ สลธ. เตรียมเลขและวันที่หนังสือสองฉบับก่อนลงนาม')
  return true
}
export function revisePoliceLetters(no: string, reason: string) {
  const { c, b } = context(no)
  if (!c || !b || !canPreparePolice(c) || !reason.trim()) return false
  const letters = { ...b.letters }
  for (const k of POLICE_KINDS) letters[k] = { id: crypto.randomUUID(), version: b.letters[k].version + 1, kind: k, data: { ...b.data }, draft: { ...b.letters[k].draft, registryNo: '', registryDate: '', enclosure: undefined, signatureImage: undefined }, status: 'draft' }
  save(c, { ...b, decisionKey: undefined, revisionStage: c.activity7State === 'approved' ? 'draft' : undefined, letters, archives: [...b.archives, ...POLICE_KINDS.map(k => b.letters[k])] }, `สร้างฉบับแก้ไขหนังสือตำรวจ: ${reason.trim()}`)
  return true
}
export interface PoliceSignResult { ok: boolean; signed: PoliceLetterKind[]; pending: PoliceLetterKind[]; errors: string[] }
/** Each document is committed independently. A retry skips persisted signed versions. */
export function signPoliceLetters(no: string, reviewedKey: string, signatureImage?: string, beforeEach?: (kind: PoliceLetterKind) => void, kinds: PoliceLetterKind[] = POLICE_KINDS): PoliceSignResult {
  const { c, b, a, actor } = context(no)
  const result: PoliceSignResult = { ok: false, signed: [], pending: [], errors: [] }
  if (!c || !b || !actor || !['secretary', 'admin'].includes(a.currentRole) || (c.stage !== 'external_pending' && b.revisionStage !== 'secretary')) return { ...result, errors: ['ไม่มีสิทธิหรือไม่อยู่ในรอบลงนาม'] }
  const decision = c.preliminaryDecision
  if (!decision || decision.formNo !== 9 || !decision.decisionNo.trim() || !c.kb6SecretarySignedAt || !policeRequired(c, selectCaseDraft(useFormDraftStore.getState(), 6, no))) return { ...result, errors: ['ต้องลงนาม คบ.6 และเลือกผลอนุมัติก่อนลงนามหนังสือ'] }
  if (decision.destination === 'original_owner' && !ECMIS_USER_DIRECTORY.some(u => u.id === c.assignedOfficerUserId && u.active && u.roles.some(r => r === 'officer' || r === 'case_owner'))) return { ...result, errors: ['ไม่พบผู้รับผิดชอบปลายทางที่ใช้งานได้'] }
  const decisionKey = JSON.stringify({ decisionNo: decision.decisionNo, reason: decision.reason, instruction: decision.instruction, days: decision.durationDays, fields: c.resultNotices?.[9]?.fields, kb6: selectCaseDraft(useFormDraftStore.getState(), 6, no) })
  if (b.decisionKey && b.decisionKey !== decisionKey) return { ...result, errors: ['ข้อมูลผลอนุมัติเปลี่ยนหลังลงนามบางฉบับ ต้องส่งกลับและสร้างฉบับแก้ไข'] }
  const missing = kinds.length === 1 ? [] : policeMissing(b, c.preliminaryDecision?.durationDays)
  if (b.data.witness !== c.person) missing.push('ชื่อพยานในหนังสือไม่ตรงกับแฟ้ม')
  if (missing.length || reviewedKey !== policeRevisionKey(b)) return { ...result, errors: missing.length ? missing : ['เอกสารเปลี่ยนหลังเปิดตรวจ กรุณาตรวจทั้งชุดอีกครั้ง'] }
  for (const kind of kinds) {
    const latest = context(no), letter = latest.b!.letters[kind]
    if (letter.signedAt) { result.signed.push(kind); continue }
    try {
      beforeEach?.(kind)
      const draft = { ...letter.draft, signerName: actor.name, signerPosition: POLICE_SIGNER_POSITION, signatureImage }
      const recipient = kind === 'national' ? 'ผู้บัญชาการตำรวจแห่งชาติ' : `ผู้กำกับการ${latest.b!.data.station}`
      const signedHtml = buildLetterHtml({ draft, recipient, unit: '', garudaSrc: '/assets/forms/official/emblem/garuda-letter.png' })
      save(latest.c!, { ...latest.b!, decisionKey, letters: { ...latest.b!.letters, [kind]: { ...letter, draft, signedHtml, signedAt: new Date().toISOString(), signedBy: actor.name, signatureImage, status: 'signed', reviewKey: reviewedKey } } }, `ลงนาม${POLICE_TITLES[kind]} ฉบับ ${letter.version}`, letter.id)
      result.signed.push(kind)
    } catch { result.pending.push(kind); result.errors.push(`ลงนาม${POLICE_TITLES[kind]}ไม่สำเร็จ ลองต่อเฉพาะฉบับที่ค้าง`) }
  }
  result.ok = result.pending.length === 0
  if (result.ok && policeAllSigned(context(no).b) && b.revisionStage === 'secretary') { const latest = context(no); save(latest.c!, { ...latest.b!, revisionStage: 'awaiting_dispatch' }, 'ลงนามฉบับแก้ไขหนังสือตำรวจครบแล้ว โดยไม่ลงนาม คบ.9 ซ้ำ') }
  return result
}
export function sendPoliceLetter(no: string, kind: PoliceLetterKind, channel: NonNullable<OfficialLetter['channel']>, trackingNo: string) {
  const { c, b, actor } = context(no)
  if (!c || !b || !actor || !canPreparePolice(c) || !c.protectionHandoff || !canOperateHandoff(useAuthStore.getState().currentRole, c, actor.id) || !policeAllSigned(b)) return false
  const letter = b.letters[kind]
  if (b.revisionStage && b.revisionStage !== 'complete') return false
  if (!letter.signedAt || letter.sentAt || (channel === 'post' && !trackingNo.trim())) return false
  if (kind === 'national' && (!b.letters.station.sentAt || letter.attachmentVersionId !== b.letters.station.id)) return false
  const at = new Date().toISOString()
  const entry: OfficialLetter = { id: letter.id, direction: 'outgoing', context: 'method4', methodNo: 4, subject: `${letter.draft.subject} — ${POLICE_TITLES[kind]}`, draftSnapshot: { ...letter.draft }, registryNo: letter.draft.registryNo, registryDate: letter.draft.registryDate, agency: kind === 'station' ? b.data.station : 'สำนักงานตำรวจแห่งชาติ', channel, trackingNo, sentAt: at, attachmentSnapshot: kind === 'national' ? { versionId: b.letters.station.id, registryNo: b.letters.station.draft.registryNo, registryDate: b.letters.station.draft.registryDate, signedHtml: b.letters.station.signedHtml! } : undefined, note: kind === 'national' ? `แนบสำเนาฉบับลงนาม ${b.letters.station.id}` : '' }
  save(c, { ...b, letters: { ...b.letters, [kind]: { ...letter, status: 'sent', sentAt: at, sentBy: actor.name, channel, trackingNo } } }, `นำส่ง${POLICE_TITLES[kind]}`, letter.id)
  useCaseStore.getState().updateCase(no, { officialLetters: [...(c.officialLetters || []).filter(l => l.id !== entry.id), entry], methodTracks: c.methodTracks?.map(t => t.method === 4 ? { ...t, status: 'preparing', wizardStep: 2, coordination: { ...t.coordination, agency: b.data.station, agencyType: 'police', responseStatus: 'awaiting' } } : t) })
  return true
}

export function isPoliceQueueCase(role: string, c: CaseItem, unitId?: string | null): boolean {
  const b = c.policeLetters
  if (!b) return false
  if (POLICE_KINDS.some(k => b.letters[k].status === 'awaiting_number')) return ['admin', 'secretary_receiver'].includes(role)
  const stage = b.revisionStage
  if (stage === 'awaiting_dispatch') return ['admin', 'secretary_receiver'].includes(role)
  if (!stage || stage === 'complete' || stage === 'draft') return false
  if (role === 'admin') return true
  if (stage === 'secretary') return role === 'secretary'
  if (stage === 'deputy') return role === 'deputy_secretary' || role === 'deputy'
  const got = c.protectionHandoff?.destination === 'got'
  const expected = got ? `got_${stage}` : stage
  const actual = roleForCase(role as Parameters<typeof roleForCase>[0], c)
  return actual === expected && (got || !unitId || !c.orgUnitId || unitId === c.orgUnitId || (ORG_UNITS.find(u => u.id === unitId)?.isCentral && ORG_UNITS.find(u => u.id === c.orgUnitId)?.isCentral) === true)
}
export function advancePoliceRevision(no: string, action: 'submit' | 'approve' | 'return', note = '') {
  const { c, b, a } = context(no)
  if (!c || !b?.revisionStage || b.revisionStage === 'complete') return false
  if (action === 'submit') {
    if (b.revisionStage !== 'draft' || !canPreparePolice(c)) return false
    save(c, { ...b, revisionStage: 'supervisor', letters: { station: { ...b.letters.station, status: 'review' }, national: { ...b.letters.national, status: 'review' } } }, 'เสนอฉบับแก้ไขหนังสือตำรวจให้ผู้บังคับบัญชาชั้นต้นตรวจ')
    return true
  }
  if (!isPoliceQueueCase(a.currentRole, c, a.currentOrgUnitId)) return false
  if (action === 'return') {
    if (!note.trim()) return false
    save(c, { ...b, revisionStage: 'draft' }, `ส่งคืนฉบับแก้ไขหนังสือตำรวจ: ${note.trim()}`)
    return true
  }
  const next = { supervisor: 'director', director: 'deputy', deputy: 'secretary' } as const
  if (!(b.revisionStage in next)) return false
  save(c, { ...b, revisionStage: next[b.revisionStage as keyof typeof next] }, `ตรวจเห็นชอบฉบับแก้ไขหนังสือตำรวจ: ${b.revisionStage}`)
  return true
}

export function dispatchPoliceRevision(no: string) {
  const { c, b, a, actor } = context(no)
  if (!c || !b || !actor || b.revisionStage !== 'awaiting_dispatch' || !policeAllSigned(b) || !['secretary_receiver', 'admin'].includes(a.currentRole)) return false
  save(c, { ...b, revisionStage: 'complete', revisionDispatchedAt: new Date().toISOString(), revisionDispatchedBy: actor.name }, 'ธุรการ สลธ. ตรวจฉบับลงนามและส่งคืนหน่วยผู้รับผิดชอบ')
  return true
}
