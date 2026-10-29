import { expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import base from '../flow-snapshots/states/de1168fd4d52.json'
import { useCaseStore } from '../store/useCaseStore'
import { useFormDraftStore } from '../store/useFormDraftStore'
import { useAuthStore } from '../store/useAuthStore'
import { signIndividualNotice } from './individualApprovalSigning'
import { passSecretaryOutgoing, passDestinationIncoming } from './sarabanTestHelpers'
import type { UserRole } from '../types/user'
const NO = '0501/2569'
const dossier = `/dossier/${encodeURIComponent(NO)}`
function capture(keys: string[], label: string, role: UserRole, route = dossier) {
  useAuthStore.getState().setRole(role)
  if (process.env.WRITE_GOT_SNAPSHOTS !== '1') return
  const dir = 'e2e/.got-snapshots-raw'
  mkdirSync(dir, { recursive: true })
  const data = Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('ecmis-')).map(k => [k, localStorage.getItem(k)!]))
  for (const key of keys) writeFileSync(`${dir}/${key.replace(/[:>]/g, '_')}.json`, JSON.stringify({ key, label, role, route, capturedAt: new Date().toISOString(), localStorageData: data }))
}
it('approved case travels through registry, GOT assignment and acceptance without a new approval', () => {
  localStorage.clear(); sessionStorage.clear()
  Object.entries(base.localStorageData).forEach(([k,v]) => localStorage.setItem(k,v))
  useCaseStore.setState(JSON.parse(base.localStorageData['ecmis-case-storage-v2']).state)
  useFormDraftStore.setState(JSON.parse(base.localStorageData['ecmis-form-draft-storage-v2']).state)
  useAuthStore.setState({ ...JSON.parse(base.localStorageData['ecmis-auth-storage']).state, loginUsername: null })
  useAuthStore.getState().setRole('secretary')
  const forms = useFormDraftStore.getState()
  useFormDraftStore.setState({ drafts: { ...forms.drafts, 6: { ...forms.drafts[6], รูปแบบคุ้มครองที่เลือก: [1], หน่วยงานรูปแบบข้อ4: '', ระยะเวลาคุ้มครองวัน: 30 } }, draftCaseNo: { ...forms.draftCaseNo, 6: NO } })
  const store = useCaseStore.getState(), current = () => store.getCase(NO)!
  expect(store.beginPreliminaryDecision(NO, 'approved')).toBe(true)
  expect(store.savePreliminaryDecision(NO, 9, { decisionNo: 'ลธ. 501/2569', reason: 'เห็นชอบให้คุ้มครอง (ข้อมูลสาธิต)', instruction: 'มอบหมาย กอท. ดำเนินการตามคำสั่งเดิม', destination: 'got', durationDays: 30, fields: {} })).toBe(true)
  capture(['node:07G:A6POST01', 'tab:07G'], 'อนุมัติให้ กอท. ดำเนินการต่อ: เลขาธิการตรวจและลงนาม คบ.9', 'secretary', `/form/9?caseNo=${encodeURIComponent(NO)}`)
  expect(signIndividualNotice(NO)).toBe(true)
  expect(current().protectionHandoff).toMatchObject({ destination: 'got', step: 'pending_send' })
  const original = current().resultNotices![9]!.original
  capture(['node:07:A6GOT', 'edge:07:A6GOT-DEST', 'node:07G:A6POSTSEND', 'edge:07G:GOT-SIGNED', 'overview:07>07G'], 'ลงนามอนุมัติครบแล้ว ปลายทาง กอท. รอเลขาธิการกดส่งให้ธุรการออกเลข', 'secretary')
  expect(store.sendSignedDecision(NO)).toBe(true)
  capture(['node:07G:A6POST07', 'edge:07G:GOT-EDGE-0'], 'ส่งเรื่องแล้ว รอธุรการ สลธ. ออกเลขส่งไป กอท.', 'secretary_receiver', `/saraban/${encodeURIComponent(NO)}`)
  expect(passSecretaryOutgoing(NO)).toBe(true)
  expect(current().protectionHandoff?.step).toBe('pending_receipt')
  capture(['node:07G:A6POST02', 'edge:07G:GOT-EDGE-1'], 'ธุรการคดี กอท. ลงเลขรับชุดเอกสารอนุมัติ', 'got_receiver', `/saraban/${encodeURIComponent(NO)}`)
  capture(['node:07G:A6POST03', 'edge:07G:GOT-EDGE-2'], 'ธุรการ กอท. ลงเลขรับแล้วกดส่งต่อเพื่อเสนอ ผอ. กอท.', 'got_receiver', `/saraban/${encodeURIComponent(NO)}`)
  expect(passDestinationIncoming(NO)).toBe(true)
  expect(current().protectionHandoff?.step).toBe('pending_assignment')
  capture(['node:07G:A6POST04', 'edge:07G:GOT-EDGE-3'], 'ผอ. กอท. เลือกเจ้าหน้าที่และบันทึกคำสั่งมอบหมาย', 'got_director')
  expect(store.advanceProtectionHandoff(NO, 'assign', 'ดำเนินการตามคำสั่งอนุมัติเดิม', 'GOT-OFF-001')).toBe(true)
  capture(['node:07G:A6POST05', 'edge:07G:GOT-EDGE-4'], 'เจ้าหน้าที่ กอท. ที่ได้รับมอบหมายรับงานและตรวจเอกสาร', 'got_officer')
  expect(store.advanceProtectionHandoff(NO, 'accept', 'รับงานตามคำสั่งเดิม')).toBe(true)
  capture(['node:07G:A6POST06', 'edge:07G:GOT-EDGE-5', 'overview:07G>08A'], 'เจ้าหน้าที่ กอท. รับงานแล้ว แจ้งผลและดำเนินการคุ้มครองต่อในแฟ้มเดิม', 'got_officer')
  expect(current().activity7State).toBe('approved')
  expect(current().protectionHandoff).toMatchObject({ step: 'accepted', assigneeUserId: 'GOT-OFF-001' })
  expect(current().resultNotices![9]!.original).toEqual(original)
})
