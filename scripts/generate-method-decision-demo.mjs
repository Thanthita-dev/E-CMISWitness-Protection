// Generate method-specific decision checkpoints with the same store actions as the app.
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const base = JSON.parse(await readFile(new URL('../src/mock-states/Case 1.7.json', import.meta.url), 'utf8'))
const output = []
const browser = await chromium.launch()
try {
  for (const method of [1, 2, 3, 4]) {
    for (const approved of [false, true]) {
      const context = await browser.newContext({ locale: 'th-TH', timezoneId: 'Asia/Bangkok' })
      const page = await context.newPage()
      await page.goto('http://127.0.0.1:5174/')
      await page.evaluate(data => {
        localStorage.clear(); sessionStorage.clear()
        for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value)
      }, base.localStorageData)
      await page.reload()
      const result = await page.evaluate(async ({ method, approved }) => {
        const { useCaseStore, useAuthStore, useFormDraftStore } = await import('/scripts/post-approval-fixture.ts')
        const { activateCaseForms } = await import('/src/lib/formPrefill.ts')
        const { selectCaseDraft } = await import('/src/store/useFormDraftStore.ts')
        const { PROTECTION_METHOD_OPTIONS, readRoutableProtectionMethods } = await import('/src/lib/constants.ts')
        const store = useCaseStore.getState(), auth = useAuthStore.getState()
        const c = store.getCase('WP-2569-000501')
        auth.setRole('secretary'); activateCaseForms(c)
        const forms = useFormDraftStore.getState()
        forms.updateField(6, 'รูปแบบคุ้มครองที่เลือก', [method])
        forms.updateField(6, 'รูปแบบการคุ้มครอง', PROTECTION_METHOD_OPTIONS.find(option => option.n === method).label)
        forms.updateField(6, 'มาตรการทั่วไป', `ดำเนินการคุ้มครองตามวิธีที่ ${method} ที่เสนอใน คบ.6 (ข้อมูลสมมติ)`)
        if (method !== 1) for (const key of ['ชุดชื่อ1', 'ชุดตำแหน่ง1', 'ชุดชื่อ2', 'ชุดตำแหน่ง2']) forms.updateField(6, key, '')
        forms.updateField(11, 'รูปแบบที่เลือก', [])
        if (approved) {
          store.signKb6(c.no, 'secretary')
          if (!store.beginPreliminaryDecision(c.no, 'approved')) throw Error('Cannot select draft')
          if (!store.savePreliminaryDecision(c.no, 9, {
            decisionNo: `ลธ.ปปท. 501/2569 (วิธีที่ ${method})`, reason: `อนุมัติการคุ้มครองตามวิธีที่ ${method} ที่เสนอใน คบ.6 (ข้อมูลสมมติ)`,
            destination: 'original_owner', instruction: `ดำเนินการต่อเฉพาะวิธีที่ ${method}`, durationDays: 30, fields: {},
          }) || !store.confirmPreliminaryDecision(c.no, 9)) throw Error('Cannot confirm approval')
          auth.setRole('officer')
        }
        const current = store.getCase(c.no)
        const methods = readRoutableProtectionMethods(selectCaseDraft(useFormDraftStore.getState(), 6, c.no))
        if (JSON.stringify(methods) !== JSON.stringify([method])) throw Error('Draft methods mismatch')
        if (approved && (current.activity7State !== 'approved' || JSON.stringify(current.orderedMethods) !== JSON.stringify([method]) || !current.resultNotices?.[9]?.original)) throw Error('Signed approval mismatch')
        if (!approved && (current.activity7State === 'approved' || current.resultNotices?.[9]?.original)) throw Error('Unexpected final result')
        return {
          label: PROTECTION_METHOD_OPTIONS.find(option => option.n === method).label,
          localStorageData: Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('ecmis-')).map(key => [key, localStorage.getItem(key)])),
        }
      }, { method, approved })
      const name = approved ? `Approved - วิธีที่ ${method}` : `Case 1.7 - วิธีที่ ${method}`
      output.push({ name, group: approved ? 'เลขาธิการอนุมัติแล้ว · แยกวิธีคุ้มครอง' : 'เลขาธิการรอพิจารณา · แยกวิธีคุ้มครอง',
        description: `[${approved ? 'เจ้าของสำนวนเดิม' : 'เลขาธิการ ป.ป.ท.'}] วิธีที่ ${method}: ${result.label} · ${approved ? 'อนุมัติและลงนาม คบ.9 แล้ว รอเติมรายละเอียด ยังไม่ส่งหนังสือ' : 'รอเลขาธิการพิจารณา เหมือน Case 1.7'}`,
        to: '/dossier/WP-2569-000501', capturedAt: new Date().toISOString(), localStorageData: result.localStorageData })
      await context.close()
    }
  }
} finally { await browser.close() }
for (const state of output) {
  await writeFile(new URL(`../src/mock-states/${state.name}.json`, import.meta.url), JSON.stringify(state, null, 2) + '\n')
  console.log(state.name)
}
