import React, { useState } from 'react'
import { useCaseStore } from '../../store/useCaseStore'
import type { CaseItem } from '../../types/case'
import { createPoliceBundle, POLICE_TITLES, type PoliceLetterKind } from '../../lib/policeLetters'
import { CoordinationLetterComposer } from './CoordinationLetterComposer'
import { PoliceLetterBundlePanel } from './PoliceLetterBundlePanel'
import { Button } from '../common/Button'

export const POLICE_CATALOG = [
  { id: 'police-station', kind: 'station' as const, title: 'ขอจัดเจ้าหน้าที่ตำรวจ: ถึงผู้กำกับการสถานีตำรวจ', source: 'https://docs.google.com/document/d/1swkZC_aiOnjPpU82EjKMcs-MrnZ2FILo/edit' },
  { id: 'police-national', kind: 'national' as const, title: 'ขอจัดเจ้าหน้าที่ตำรวจ: ถึงผู้บัญชาการตำรวจแห่งชาติ', source: 'https://docs.google.com/document/d/1xPM2wkdiu24TWyQtEZ35P--kU1eSqYbr/edit' },
]
export function PoliceLetterCatalog({ kind, onBack }: { kind: PoliceLetterKind; onBack: () => void }) {
  const cases = useCaseStore(s => s.cases)
  const [caseNo, setCaseNo] = useState('')
  const blank = { no: '', person: '' } as CaseItem
  const [draft, setDraft] = useState(() => createPoliceBundle(blank, {}, {}, '').letters[kind].draft)
  const item = cases.find(c => c.no === caseNo)
  return <div className="space-y-4"><div className="flex flex-wrap justify-between gap-3"><h1 className="text-[1.5rem] font-bold text-navy">{POLICE_TITLES[kind]}</h1><Button variant="secondary" onClick={onBack}>กลับรายการแบบฟอร์ม</Button></div>
    <p>ขอความอนุเคราะห์จัดเจ้าหน้าที่ตำรวจให้ความคุ้มครองพยาน · หนังสือประกอบ ไม่มีเลข คบ.</p>
    <a className="text-blue underline" href={POLICE_CATALOG.find(t => t.kind === kind)!.source} target="_blank" rel="noreferrer">เปิดต้นฉบับหนังสือ</a>
    <label className="block"><span className="ws-label">เปิดหนังสือที่อยู่ในแฟ้ม</span><select className="ws-input w-full" value={caseNo} onChange={e => setCaseNo(e.target.value)}><option value="">ตัวอย่างแบบหนังสือเปล่า</option>{cases.filter(c => c.policeLetters).map(c => <option key={c.no} value={c.no}>{c.no} · {c.person}</option>)}</select></label>
    {item ? <PoliceLetterBundlePanel key={caseNo} caseItem={item} initialKind={kind} /> : <CoordinationLetterComposer caseItem={blank} stationName="สถานีตำรวจ..........................." draft={draft} onChange={setDraft} />}
  </div>
}
