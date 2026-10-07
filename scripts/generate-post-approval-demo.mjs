// ข้อมูลสาธิตเป็นจุดเริ่มเล่นของเรื่องเดียวกันในแต่ละขั้น สร้างสถานะด้วยคำสั่งจริงของ store
// เปิด Vite :5174 ก่อน แล้วรัน node scripts/generate-post-approval-demo.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const base = JSON.parse(await readFile(new URL('../src/mock-states/Edge 07→08A·09A·08C.json', import.meta.url), 'utf8'))
const cases = [
  { name: 'PostApproval 1', description: 'ข้อมูลสำหรับสาธิต · เลขาธิการยังไม่เลือกปลายทาง เลือกเจ้าของสำนวนเดิมหรือ กอท. แล้วเดินต่อได้', role: 'secretary', kind: 'pending' },
  { name: 'PostApproval 2', description: 'ข้อมูลสำหรับสาธิต · ส่งให้เจ้าของสำนวนเดิมแล้ว ดำเนินการแจ้งผลและคุ้มครองตามโฟลว์เดิม', role: 'officer', kind: 'owner' },
  { name: 'PostApproval 3', description: 'ข้อมูลสำหรับสาธิต · อนุมัติและมอบหมาย กอท. รอธุรการคดีรับเรื่อง', role: 'got_receiver', kind: 'receipt' },
  { name: 'PostApproval 4', description: 'ข้อมูลสำหรับสาธิต · ธุรการรับและส่งเสนอแล้ว รอ ผอ. กอท. มอบหมาย', role: 'got_director', kind: 'assignment' },
  { name: 'PostApproval 5', description: 'ข้อมูลสำหรับสาธิต · ผอ. กอท. มอบหมายแล้ว รอผู้รับผิดชอบรับงานและดำเนินการตามผลอนุมัติเดิม', role: 'got_officer', kind: 'assigned' },
]
const browser = await chromium.launch()
try {
  for (const demo of cases) {
    const context = await browser.newContext({ locale: 'th-TH', timezoneId: 'Asia/Bangkok' })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:5174/')
    await page.evaluate(async ({ data, capturedAt }) => {
      const { shiftMockDates } = await import('/src/lib/mockDateShift.ts')
      localStorage.clear()
      for (const [k, v] of Object.entries(shiftMockDates(data, capturedAt))) localStorage.setItem(k, v)
    }, { data: base.localStorageData, capturedAt: base.capturedAt })
    await page.reload()
    const localStorageData = await page.evaluate(async ({ role, kind }) => {
      const { useCaseStore, useAuthStore, useFormDraftStore, useNotificationStore, useAuditStore, KB6_SIGNERS, ECMIS_USER_DIRECTORY } = await import('/scripts/post-approval-fixture.ts')
      const auth = useAuthStore.getState()
      const forms = useFormDraftStore.getState()
      const store = useCaseStore.getState()
      const c = store.cases[0]
      const draft = forms.getDraft(1)
      const person = `${draft['คำนำหน้า']}${draft['ชื่อ']} ${draft['นามสกุล']}`
      store.updateCase(c.no, { person, demoData: true, protectionDays: 30 })
      for (const slot of KB6_SIGNERS) {
        const account = ECMIS_USER_DIRECTORY.find((u) => u.roles.includes(slot.userRole))
        forms.signDocument(`kb6-${slot.role}`, account.name)
      }
      useNotificationStore.setState({ notifications: [], unreadCount: 0 })
      useAuditStore.setState({ logs: [] })
      auth.setRole('secretary')
      store.prepareResultNotices(c.no)
      if (kind !== 'pending') {
        const destination = kind === 'owner' ? 'original_owner' : 'got'
        if (!store.secretaryApprove(c.no, 'ลธ.ปปท. 501/2569 (สาธิต)', 'ตรวจเอกสารและความเห็นครบถ้วน อนุมัติคุ้มครอง 30 วันตามวิธีที่ 1', destination, 'ดำเนินการคุ้มครองตามคำสั่ง ประสานพยาน และรายงานความก้าวหน้า', 30)) throw new Error('Approval failed')
      }
      if (kind === 'assignment' || kind === 'assigned') {
        auth.setRole('got_receiver')
        if (!store.advanceProtectionHandoff(c.no, 'receive', 'รับแฟ้มเดิมและตรวจเอกสารครบถ้วน')) throw new Error('Receipt failed')
        if (!store.advanceProtectionHandoff(c.no, 'submit', 'เสนอ ผอ. กอท. เพื่อมอบหมายผู้รับผิดชอบตามผลอนุมัติ')) throw new Error('Submission failed')
      }
      if (kind === 'assigned') {
        auth.setRole('got_director')
        if (!store.advanceProtectionHandoff(c.no, 'assign', 'มอบหมายให้ดำเนินการตามผลอนุมัติเดิมและประสานพยาน', 'GOT-OFF-001')) throw new Error('Assignment failed')
      }
      auth.setRole(role)
      store.setActiveCaseNo(c.no)
      return Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('ecmis-')).map((k) => [k, localStorage.getItem(k)]))
    }, demo)
    const snapshot = {
      name: demo.name, group: 'ส่งงานหลังอนุมัติ · เจ้าของสำนวนเดิม / กอท.', description: demo.description,
      to: demo.kind === 'pending' ? '/dossier/WP-2569-000501' : `/queue/${demo.role}`,
      capturedAt: new Date().toISOString(), localStorageData,
    }
    await writeFile(new URL(`../src/mock-states/${demo.name}.json`, import.meta.url), JSON.stringify(snapshot, null, 2) + '\n')
    console.log(`${demo.name}: ${demo.kind}`)
    await context.close()
  }
} finally { await browser.close() }
