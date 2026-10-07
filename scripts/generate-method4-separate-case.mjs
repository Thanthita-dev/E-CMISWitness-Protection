// Add an independent method-4 case alongside the existing method-1 case.
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const base = JSON.parse(await readFile(new URL('../src/mock-states/Case 1.7 - วิธีที่ 1.json', import.meta.url), 'utf8'))
const caseNo = 'WP-2569-000604'
const output = []
const browser = await chromium.launch()
try {
  for (const approved of [false, true]) {
    const context = await browser.newContext({ locale: 'th-TH', timezoneId: 'Asia/Bangkok' })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:5174/')
    await page.evaluate(data => { localStorage.clear(); sessionStorage.clear(); for (const [key,value] of Object.entries(data)) localStorage.setItem(key,value) }, base.localStorageData)
    await page.reload()
    const data = await page.evaluate(async ({ approved, caseNo }) => {
      const { useCaseStore, useAuthStore, useFormDraftStore } = await import('/scripts/post-approval-fixture.ts')
      const { activateCaseForms } = await import('/src/lib/formPrefill.ts')
      const { selectCaseDraft } = await import('/src/store/useFormDraftStore.ts')
      const store = useCaseStore.getState(), auth = useAuthStore.getState(), forms = useFormDraftStore.getState()
      const original = structuredClone(store.getCase('WP-2569-000501'))
      const originalDraft = structuredClone(selectCaseDraft(forms, 6, original.no))
      const newCase = { ...structuredClone(original), no: caseNo, demoData: true,
        documents: (original.documents || []).map((doc,index) => ({ ...doc, id: `DOC-${caseNo}-${index}` })) }
      delete newCase.resultNotices
      delete newCase.preliminaryDecision
      delete newCase.noticeDecisionDrafts
      delete newCase.preliminaryDecisionHistory
      store.addCase(newCase)
      auth.setRole('secretary')
      forms.ensureDraftForCase(6, caseNo, { ...originalDraft, 'รูปแบบคุ้มครองที่เลือก': [4], 'รูปแบบการคุ้มครอง': 'ประสานงานกับหน่วยงานอื่นให้การคุ้มครองพยาน', 'มาตรการทั่วไป': 'ประสานหน่วยงานอื่นตามวิธีที่ 4 (แฟ้มสาธิตแยก)', 'ชุดชื่อ1': '', 'ชุดตำแหน่ง1': '', 'ชุดชื่อ2': '', 'ชุดตำแหน่ง2': '' })
      activateCaseForms(store.getCase(caseNo))
      if (approved) {
        store.signKb6(caseNo, 'secretary')
        if (!store.beginPreliminaryDecision(caseNo, 'approved') || !store.savePreliminaryDecision(caseNo, 9, {
          decisionNo: 'ลธ.ปปท. 604/2569 (วิธีที่ 4)', reason: 'อนุมัติประสานหน่วยงานอื่นให้คุ้มครองตามวิธีที่ 4 (แฟ้มสาธิตแยก)',
          destination: 'original_owner', instruction: 'ดำเนินการประสานหน่วยงานอื่นตามวิธีที่ 4', durationDays: 30, fields: {},
        }) || !store.confirmPreliminaryDecision(caseNo, 9)) throw Error('Approval failed')
        auth.setRole('officer')
      }
      store.setActiveCaseNo(caseNo)
      if (JSON.stringify(store.getCase(original.no)) !== JSON.stringify(original)) throw Error('Original case changed')
      if (JSON.stringify(selectCaseDraft(useFormDraftStore.getState(),6,original.no)['รูปแบบคุ้มครองที่เลือก']) !== '[1]') throw Error('Original method changed')
      if (JSON.stringify(selectCaseDraft(useFormDraftStore.getState(),6,caseNo)['รูปแบบคุ้มครองที่เลือก']) !== '[4]') throw Error('New method mismatch')
      const current = store.getCase(caseNo)
      if (approved && (JSON.stringify(current.orderedMethods) !== '[4]' || current.resultNotices?.[9]?.original?.caseNo !== caseNo)) throw Error('Wrong signed case')
      return Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith('ecmis-')).map(key=>[key,localStorage.getItem(key)]))
    }, { approved, caseNo })
    const name = approved ? 'Method 4 - อีกเคส (อนุมัติแล้ว)' : 'Method 4 - อีกเคส (รอเลขาธิการ)'
    output.push({ name, group: 'วิธีที่ 4 · แฟ้มแยก WP-2569-000604', description: `${caseNo} · วิธีที่ 4 ประสานหน่วยงานอื่น · ${approved ? 'อนุมัติและลงนาม คบ.9 แล้ว รอเติมรายละเอียด' : 'รอเลขาธิการพิจารณา'} · มีแฟ้มเดิม WP-2569-000501 วิธีที่ 1 แยกกัน`, to: `/dossier/${caseNo}`, capturedAt: new Date().toISOString(), localStorageData: data })
    await context.close()
  }
} finally { await browser.close() }
for (const state of output) {
  await writeFile(new URL(`../src/mock-states/${state.name}.json`, import.meta.url), JSON.stringify(state,null,2)+'\n')
  console.log(state.name)
}
