import { expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import base from '../flow-snapshots/states/de1168fd4d52.json'
import { useCaseStore } from '../store/useCaseStore'
import { useFormDraftStore } from '../store/useFormDraftStore'
import { useAuthStore } from '../store/useAuthStore'
import { savePoliceData, requestPoliceNumbers, issuePoliceNumbers, signPoliceLetters } from './policeLetterActions'
import { policeRevisionKey } from './policeLetters'
import { signIndividualNotice, finishIndividualApproval } from './individualApprovalSigning'
const NO = '0501/2569'
const dir = 'e2e/.method-snapshots-raw'
function capture(key: string, label: string, route: string) {
  if (process.env.WRITE_METHOD_SNAPSHOTS !== '1') return
  mkdirSync(dir, { recursive: true })
  const data = Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('ecmis-')).map(k => [k, localStorage.getItem(k)!]))
  writeFileSync(`${dir}/${key.replace(/[:>]/g, '_')}.json`, JSON.stringify({ key, label, route, role: 'secretary', capturedAt: new Date().toISOString(), localStorageData: data }))
}
it.each([1, 2, 3, 4, 0])('branch %s restores its actual method and can finish bundle approval', method => {
  localStorage.clear(); sessionStorage.clear()
  Object.entries(base.localStorageData).forEach(([k, v]) => localStorage.setItem(k, v))
  useCaseStore.setState(JSON.parse(base.localStorageData['ecmis-case-storage-v2']).state)
  useFormDraftStore.setState(JSON.parse(base.localStorageData['ecmis-form-draft-storage-v2']).state)
  useAuthStore.setState({ ...JSON.parse(base.localStorageData['ecmis-auth-storage']).state, loginUsername: null })
  useAuthStore.getState().setRole('secretary')
  const forms = useFormDraftStore.getState()
  const methods = method ? [method] : [1, 2, 3, 4]
  useFormDraftStore.setState({ drafts: { ...forms.drafts, 6: { ...forms.drafts[6], รูปแบบคุ้มครองที่เลือก: methods, หน่วยงานรูปแบบข้อ4: methods.includes(4) ? 'ส่งให้ตำรวจ' : '', ระยะเวลาคุ้มครองวัน: 30 } }, draftCaseNo: { ...forms.draftCaseNo, 6: NO } })
  const store = useCaseStore.getState()
  expect(store.beginPreliminaryDecision(NO, 'approved')).toBe(true)
  expect(store.savePreliminaryDecision(NO, 9, { decisionNo: 'ลธ. 501/2569', reason: 'เห็นชอบตามข้อเสนอ (ข้อมูลสาธิต)', instruction: 'ดำเนินการตามวิธีที่อนุมัติ', destination: 'original_owner', durationDays: 30, fields: {} })).toBe(true)
  if (methods.includes(4)) {
    useAuthStore.getState().setRole('admin')
    const b = store.getCase(NO)!.policeLetters!
    expect(savePoliceData(NO, { ...b.data, witness: store.getCase(NO)!.person, age: '40', citizenId: '0000000000000', house: '1', subdistrict: 'พื้นที่สาธิต', district: 'อำเภอสาธิต', province: 'จังหวัดสาธิต', station: 'สถานีตำรวจสาธิต', months: '1', start: '2026-11-01', end: '2026-12-01', contact: 'ผู้ประสานงานสาธิต', contactPhone: '0000000000' })).toBe(true)
    useAuthStore.getState().setRole('secretary')
    expect(requestPoliceNumbers(NO)).toBe(true)
    useAuthStore.getState().setRole('secretary_receiver')
    expect(issuePoliceNumbers(NO, { station: { registryNo: 'ปป 0012/DEMO-101', registryDate: '2026-10-28' }, national: { registryNo: 'ปป 0012/DEMO-102', registryDate: '2026-10-28' } })).toBe(true)
    useAuthStore.getState().setRole('secretary')
  }
  if (method) {
    const label = `เลือกวิธีที่ ${method} ใน คบ.6 แล้ว — เลขาธิการตรวจและลงนาม${method === 4 ? ' คบ.9 พร้อมหนังสือตำรวจสองฉบับ' : ' คบ.9'} (ข้อมูลสาธิต)`
    for (const key of [`node:07:A6METHOD${method}`, `edge:07:A6METHOD_EDGE_${method}_1`]) capture(key, label, `/form/9?caseNo=${encodeURIComponent(NO)}`)
  }
  expect(signIndividualNotice(NO)).toBe(true)
  if (methods.includes(4)) {
    for (const kind of ['station', 'national'] as const) {
      expect(signPoliceLetters(NO, policeRevisionKey(store.getCase(NO)!.policeLetters!), undefined, undefined, [kind])).toMatchObject({ ok: true, errors: [] })
    }
    expect(finishIndividualApproval(NO)).toBe(true)
  }
  expect(store.getCase(NO)!.approvalNoticeSignature).toBeTruthy()
  expect(store.getCase(NO)!.orderedMethods).toEqual(methods)
  expect(store.getCase(NO)!.protectionHandoff?.step).toBe('pending_send')
  capture(method ? `edge:07:A6METHOD_EDGE_${method}_2` : 'node:07:A6METHODDONE', `ลงนามครบชุดของวิธี ${methods.join(', ')} แล้ว — เลขาธิการส่งให้ธุรการได้ (ข้อมูลสาธิต)`, `/dossier/${encodeURIComponent(NO)}`)
})
