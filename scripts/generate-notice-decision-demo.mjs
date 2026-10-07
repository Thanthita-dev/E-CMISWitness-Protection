// ร่างเลือกผลเบื้องต้น: สร้างด้วย store จริง ไม่มีผลสุดท้าย ลายมือชื่อ ส่งงาน หรือแจ้งเตือน
// เปิด Vite :5174 แล้วรัน node scripts/generate-notice-decision-demo.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const base = JSON.parse(await readFile(new URL('../src/mock-states/PostApproval 1.json', import.meta.url), 'utf8'))
const scenarios = [
  { name: 'NoticeDecision 1', kind: 'unselected', description: 'ยังไม่เลือกผล — กดอนุมัติหรือไม่อนุมัติครั้งแรกเพื่อเปิดหนังสือในส่วนแบบฟอร์ม ไม่มีผลสุดท้ายหรือส่งงาน' },
  { name: 'NoticeDecision 2', kind: 'owner', description: 'บันทึกร่าง คบ.9 แล้ว เลือกเจ้าของสำนวนเดิม — ตรวจ A4 และกดยืนยันครั้งที่สองก่อนลงนามและส่งงานจริง' },
  { name: 'NoticeDecision 3', kind: 'reject', description: 'บันทึกร่าง คบ.10 แล้ว — ยังไม่ลงนาม ไม่แจ้งผล และเปลี่ยนกลับไปเลือกผลอื่นได้ก่อนยืนยัน' },
  { name: 'NoticeDecision 4', kind: 'got', description: 'บันทึกร่าง คบ.9 แล้ว เลือก กอท. — ต้องยืนยันครั้งที่สองก่อนธุรการ กอท. รับเรื่องและเสนอ ผอ. มอบหมาย' },
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
    const localStorageData = await page.evaluate(async ({ kind }) => {
      const { useCaseStore, useAuthStore, useNotificationStore } = await import('/scripts/post-approval-fixture.ts')
      const store = useCaseStore.getState(), auth = useAuthStore.getState(), c = store.cases[0]
      auth.setRole('secretary')
      useNotificationStore.setState({ notifications: [], unreadCount: 0 })
      if (kind !== 'unselected') {
        const outcome = kind === 'reject' ? 'rejected' : 'approved'
        const formNo = kind === 'reject' ? 10 : 9
        if (!store.beginPreliminaryDecision(c.no, outcome)) throw new Error('Select draft failed')
        if (!store.savePreliminaryDecision(c.no, formNo, {
          decisionNo: 'ลธ.ปปท. 501/2569 (สาธิต)',
          reason: kind === 'reject' ? 'เอกสารสมมติยังไม่แสดงเหตุภัยเกี่ยวเนื่องกับการให้ถ้อยคำเพียงพอ จึงไม่อนุมัติให้ความคุ้มครอง' : 'ตรวจชุดเสนอสมมติและเหตุภัยครบถ้วน เห็นควรอนุมัติคุ้มครอง 30 วันตามวิธีที่เสนอ',
          destination: kind === 'reject' ? undefined : kind === 'got' ? 'got' : 'original_owner',
          durationDays: 30, instruction: kind === 'reject' ? '' : 'ประสานพยานและเติมรายละเอียดหนังสือหลังยืนยันลงนาม',
          fields: { 'เลขที่หนังสือ': 'ปป 0012', 'ปีหนังสือ': '501', 'วันที่': '', 'เดือน': '', 'พ.ศ.': '', 'คำร้องลงวันที่': c.createdAt.slice(0, 10) },
        })) throw new Error('Save draft failed')
      }
      const current = store.getCase(c.no)
      if (current.activity7State === 'approved' || current.activity7State === 'rejected' || current.protectionHandoff || current.resultNotices?.[9]?.original || current.resultNotices?.[10]?.original || useNotificationStore.getState().notifications.length) throw new Error('Preliminary fixture produced final side effects')
      store.setActiveCaseNo(c.no)
      return Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith('ecmis-')).map((key) => [key, localStorage.getItem(key)]))
    }, scenario)
    const snapshot = { name: scenario.name, group: 'เลือกผลเบื้องต้น → ตรวจหนังสือ → ยืนยันลงนาม', description: scenario.description,
      to: '/dossier/WP-2569-000501', capturedAt: new Date().toISOString(), localStorageData }
    await writeFile(new URL(`../src/mock-states/${scenario.name}.json`, import.meta.url), JSON.stringify(snapshot, null, 2) + '\n')
    console.log(`${scenario.name}: ${scenario.kind}`)
    await context.close()
  }
} finally { await browser.close() }
