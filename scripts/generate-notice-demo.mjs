// สร้างเดโมจากคำสั่งของ store จริงเพื่อไม่ปลอมฉบับลงนาม/รุ่น/ประวัติ
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const base = JSON.parse(await readFile(new URL('../src/mock-states/PostApproval 1.json', import.meta.url), 'utf8'))
const scenarios = [
  { name: 'Notice 1', kind: 'proposal', description: 'ร่าง คบ.9 / คบ.10 ในชุดเสนอ คบ.1 / คบ.3 / คบ.6 เลขาธิการเลือกผลและลงนามเฉพาะฉบับที่ตรงผล', role: 'secretary' },
  { name: 'Notice 2', kind: 'approve', description: 'อนุมัติและลงนาม คบ.9 แล้ว — เจ้าของสำนวนเดิมเติมรายละเอียด ส่งไม่ได้จนกว่าจะครบและตรวจพร้อมส่ง', role: 'officer' },
  { name: 'Notice 3', kind: 'reject', description: 'ไม่อนุมัติและลงนาม คบ.10 แล้ว — ผู้รับผิดชอบเดิมเติมรายละเอียด ไม่มีเส้นทาง กอท. เพิ่ม', role: 'officer' },
  { name: 'Notice 4', kind: 'complete', description: 'เติม คบ.9 ครบเป็นรุ่นที่ 2 — รอตรวจพร้อมส่ง ดูฉบับเดิมและ audit ก่อน–หลังได้', role: 'officer' },
  { name: 'Notice 5', kind: 'sent', description: 'คบ.10 รุ่นที่ 2 ส่งแจ้งผลแล้ว — เก็บฉบับส่งจริงและหลักฐานรับแยก ตรวจสิทธิอุทธรณ์ตามโฟลว์เดิม', role: 'officer' },
  { name: 'Notice 6', kind: 'got', description: 'กอท. ได้รับมอบหมายและรับงานแล้ว — เฉพาะผู้ได้รับมอบหมายเติม คบ.9 ได้', role: 'got_officer' },
]
const browser = await chromium.launch()
try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({ locale: 'th-TH', timezoneId: 'Asia/Bangkok' })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:5174/')
    await page.evaluate(async (base) => {
      const { shiftMockDates } = await import('/src/lib/mockDateShift.ts')
      localStorage.clear()
      for (const [key, value] of Object.entries(shiftMockDates(base.localStorageData, base.capturedAt))) localStorage.setItem(key, value)
    }, base)
    await page.reload()
    const localStorageData = await page.evaluate(async ({ kind, role }) => {
      const { useCaseStore, useAuthStore, useFormDraftStore } = await import('/scripts/post-approval-fixture.ts')
      const store = useCaseStore.getState(), auth = useAuthStore.getState(), forms = useFormDraftStore.getState()
      const c = store.cases[0]
      auth.setRole('secretary')
      store.prepareResultNotices(c.no)
      if (kind !== 'proposal') {
        if (kind === 'reject' || kind === 'sent') store.secretaryReject(c.no, 'ลธ.ปปท. 501/2569 (สาธิต)', 'เหตุภัยยังไม่ปรากฏเพียงพอจากเอกสารสมมติ จึงไม่อนุมัติการคุ้มครอง')
        else if (!store.secretaryApprove(c.no, 'ลธ.ปปท. 501/2569 (สาธิต)', 'อนุมัติคุ้มครอง 30 วัน วิธีที่ 1 ตามชุดเสนอสมมติ', kind === 'got' ? 'got' : 'original_owner', 'ประสานพยาน เติมรายละเอียดหนังสือ และตรวจพร้อมส่ง', 30)) throw new Error('Sign failed')
        if (kind === 'got') {
          auth.setRole('got_receiver')
          if (!store.advanceProtectionHandoff(c.no, 'receive', 'รับแฟ้มและฉบับ คบ.9 ลงนามเดิม')) throw new Error('Receive failed')
          if (!store.advanceProtectionHandoff(c.no, 'submit', 'เสนอ ผอ. กอท. มอบหมายตามผลอนุมัติ')) throw new Error('Submit failed')
          auth.setRole('got_director')
          if (!store.advanceProtectionHandoff(c.no, 'assign', 'เติมรายละเอียด คบ.9 และประสานการคุ้มครองตามคำสั่งเดิม', 'GOT-OFF-001')) throw new Error('Assign failed')
          auth.setRole('got_officer')
          auth.setOfficerUserId('GOT-OFF-001')
          if (!store.advanceProtectionHandoff(c.no, 'accept', 'รับงานตามคำสั่ง')) throw new Error('Accept failed')
        }
        if (kind === 'complete' || kind === 'sent') {
          auth.setRole('officer')
          auth.setOfficerUserId(c.assignedOfficerUserId)
          const number = kind === 'sent' ? 10 : 9
          if (!store.completeResultNotice(c.no, number, { 'เลขที่หนังสือ': 'ปป 0012', 'ปีหนังสือ': '501', 'วันที่': '7', 'เดือน': 'ตุลาคม', 'พ.ศ.': '2569', 'คำร้องลงวันที่': c.createdAt.slice(0, 10) })) throw new Error('Completion failed')
          if (kind === 'sent') {
            if (!store.checkResultNoticeReady(c.no)) throw new Error('Ready failed')
            store.recordDispatch(c.no, 'ไปรษณีย์ตอบรับด่วน (EMS)', 'TH501256900TH')
            store.recordDelivery(c.no, new Date().toISOString(), { recipient: c.person, recipientRelation: 'พยานรับด้วยตนเอง', ackType: 'ใบตอบรับไปรษณีย์ (EMS)', ackDocument: 'ใบตอบรับ_TH501256900TH_สมมติ.pdf' })
          }
        }
      }
      auth.setRole(role)
      store.setActiveCaseNo(c.no)
      return Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith('ecmis-')).map((key) => [key, localStorage.getItem(key)]))
    }, scenario)
    const snapshot = { name: scenario.name, group: 'หนังสือแจ้งผล คบ.9 / คบ.10 · ลงนามในชุดเสนอ', description: scenario.description,
      to: '/dossier/WP-2569-000501', capturedAt: new Date().toISOString(), localStorageData }
    await writeFile(new URL(`../src/mock-states/${scenario.name}.json`, import.meta.url), JSON.stringify(snapshot, null, 2) + '\n')
    console.log(`${scenario.name}: ${scenario.kind}`)
    await context.close()
  }
} finally { await browser.close() }
