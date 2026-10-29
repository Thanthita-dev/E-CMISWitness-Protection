import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

test.use({ channel: process.env.POLICE_TEST_BROWSER || undefined })
const NO = 'POLICE-0501/2569'
const evidence = path.resolve('test-results/police-delivery')
async function setup(page: Page) {
  await page.goto('/')
  await page.evaluate(async (no) => {
    const { useCaseStore: cs } = await import('/src/store/useCaseStore.ts' as string)
    const { useAuthStore: auth } = await import('/src/store/useAuthStore.ts' as string)
    const { useFormDraftStore: fs } = await import('/src/store/useFormDraftStore.ts' as string)
    const actions = await import('/src/lib/policeLetterActions.ts' as string)
    auth.setState({ isAuthenticated: true, rememberLogin: true, currentOfficerUserId: 'OFF-001', loginUsername: null })
    auth.getState().setRole('officer')
    auth.setState({ currentOfficerUserId: 'OFF-001', currentOrgUnitId: 'central-wp' })
    cs.setState({ cases: [{ no, form: 'คบ.1', person: 'นางสาวกมลชนก บุญรักษา', stage: 'staff_review', status: 'จัดทำ', owner: 'เจ้าหน้าที่', next: '', risk: 'สูง', orgUnitId: 'central-wp', assignedOfficerUserId: 'OFF-001', assignedOfficer: 'นางสาวอรุณี ใจมั่น', kb6SecretarySignedAt: '2026-10-27T00:00:00Z', documents: [], assignmentHistory: [], methodTracks: [{ method: 4, status: 'pending', coordination: { agencyType: 'police', agency: '', responseStatus: 'awaiting' } }] }], activeCaseNo: no })
    fs.setState({ drafts: { 6: { รูปแบบคุ้มครองที่เลือก: [4], หน่วยงานรูปแบบข้อ4: 'ส่งให้ตำรวจ', ระยะเวลาคุ้มครองวัน: 30 } }, draftCaseNo: { 6: no }, caseDrafts: {}, locks: {}, signatures: {}, revisions: {}, draftTouched: {} })
    actions.preparePoliceLetters(no)
    const b = cs.getState().getCase(no).policeLetters
    actions.savePoliceData(no, { ...b.data, age: '40', citizenId: '1234567890123', house: '99/1', village: '2', subdistrict: 'บางพูด', district: 'ปากเกร็ด', province: 'นนทบุรี', phone: '020000000', station: 'สถานีตำรวจภูธรปากเกร็ด', months: '1', start: '2026-11-01', end: '2026-12-01', contact: 'เจ้าหน้าที่ผู้ประสานงาน', contactPhone: '020000000' })
    cs.getState().updateCase(no, { stage: 'external_pending' })
    auth.getState().setRole('secretary')
    cs.getState().beginPreliminaryDecision(no, 'approved')
    cs.getState().savePreliminaryDecision(no, 9, { decisionNo: 'ลธ. 501/2569', reason: 'เห็นควรคุ้มครองตามข้อเท็จจริงและความเสี่ยงที่เสนอ', instruction: 'ดำเนินการตามคำสั่ง', destination: 'original_owner', durationDays: 30, fields: { เลขที่หนังสือ: 'ปป 0012', ปีหนังสือ: '100', วันที่: '27', เดือน: 'ตุลาคม', 'พ.ศ.': '2569', คำร้องลงวันที่: '20 ตุลาคม 2569' } })
  }, NO)
}
async function role(page: Page, role: string) {
  await page.evaluate(async role => { const { useAuthStore } = await import('/src/store/useAuthStore.ts' as string); useAuthStore.getState().setRole(role) }, role)
}

test('ตรวจชุด คบ.9 + หนังสือตำรวจ เตรียมเลข ลงนามครั้งเดียวและเปิดย้อนหลัง', async ({ page }) => {
  test.setTimeout(120_000)
  mkdirSync(evidence, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await setup(page)
  await page.goto(`/form/9?caseNo=${encodeURIComponent(NO)}`)
  await expect(page.getByTestId('notice-decision-workspace')).toBeVisible()
  await page.getByTestId('notice-decision-confirm').click()
  await expect(page.getByTestId('notice-decision-error')).toContainText('เลขและวันที่')
  await page.getByRole('button', { name: 'ขอธุรการ สลธ. เตรียมเลขก่อนลงนาม' }).click()
  await role(page, 'secretary_receiver')
  await page.goto('/saraban')
  await expect(page.getByTestId(`saraban-row-${NO}`)).toBeVisible()
  await page.getByTestId(`saraban-row-${NO}`).click()
  for (const [kind, num] of [['station', '101'], ['national', '102']]) {
    await page.getByTestId(`police-number-${kind}`).fill(`ปป ๐๐๑๒/${num}`)
    await page.getByTestId(`police-number-date-${kind}`).fill('2026-10-27')
  }
  await page.getByRole('button', { name: 'บันทึกเลขและวันที่ทั้งสองฉบับ' }).click()
  await expect(page.getByText('เตรียมเลขและวันที่ครบแล้ว ส่งคืนเลขาธิการตรวจลงนามในรอบเดิม')).toBeVisible()
  await role(page, 'secretary')
  await page.goto(`/form/9?caseNo=${encodeURIComponent(NO)}`)
  await page.getByTestId('bundle-reviewed-kb9').click()
  await page.getByTestId('police-reviewed-station').click()
  await page.getByTestId('coordination-letter-preview').screenshot({ path: path.join(evidence, 'station-letter.png') })
  await page.getByRole('button', { name: /หนังสือถึงผู้บัญชาการตำรวจแห่งชาติ · ฉบับ/ }).click()
  await page.getByTestId('police-reviewed-national').click()
  await page.getByTestId('coordination-letter-preview').screenshot({ path: path.join(evidence, 'national-letter.png') })
  await page.getByTestId('notice-decision-confirm').click()
  await expect(page.getByRole('dialog', { name: 'ยืนยันลงนามชุด คบ.9 และหนังสือตำรวจสองฉบับ' })).toBeVisible()
  await page.screenshot({ path: path.join(evidence, 'bundle-signing.png'), fullPage: false })
  await page.getByRole('button', { name: /ยืนยันลงนามทั้งชุดครั้งเดียว$/ }).click()
  await expect.poll(async () => page.evaluate(async no => { const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string); return useCaseStore.getState().getCase(no).kb9Signed }, NO)).toBe(true)
  const result = await page.evaluate(async no => { const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string); const c = useCaseStore.getState().getCase(no); return { letters: Object.values(c.policeLetters.letters).map((l: any) => ({ status: l.status, signedAt: l.signedAt, sentAt: l.sentAt })), step: c.protectionHandoff.step } }, NO)
  expect(result.letters).toHaveLength(2)
  expect(result.letters.every(l => !!l.signedAt && !l.sentAt)).toBe(true)
  expect(result.step).toBe('pending_send')
  for (const kind of ['station', 'national']) {
    const render = await page.evaluate(async ({ no, kind }) => {
      const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string)
      const { LETTER_CSS } = await import('/src/components/protection/CoordinationLetterComposer.tsx' as string)
      return { html: useCaseStore.getState().getCase(no).policeLetters.letters[kind].signedHtml, css: LETTER_CSS }
    }, { no: NO, kind })
    const paper = await page.context().newPage()
    await paper.goto('/')
    await paper.setViewportSize({ width: 794, height: 1123 })
    await paper.setContent(`<html lang="th"><head><style>@page{size:A4;margin:0}body{margin:0}${render.css}</style></head><body>${render.html}</body></html>`)
    await paper.evaluate(() => document.fonts.ready)
    await paper.screenshot({ path: path.join(evidence, `${kind}-letter.png`), fullPage: true })
    await paper.pdf({ path: path.join(evidence, `${kind}-letter.pdf`), preferCSSPageSize: true, printBackground: true })
    await paper.close()
  }
  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  await page.getByTestId('signed-decision-send').getByRole('button', { name: /ส่งให้ธุรการออกเลข/ }).click()
  await page.locator('.swal2-confirm').click()
  for (const clerkRole of ['secretary_receiver', 'receiver']) {
    await page.evaluate(async ({ no, clerkRole }) => {
      const { useAuthStore } = await import('/src/store/useAuthStore.ts' as string)
      const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string)
      const { activeSarabanCheckpoint, sarabanClerkAccount } = await import('/src/lib/saraban.ts' as string)
      const c = useCaseStore.getState().getCase(no)
      const clerk = sarabanClerkAccount(c, activeSarabanCheckpoint(c))
      useAuthStore.getState().setRole(clerkRole)
      useAuthStore.setState({ currentOrgUnitId: clerk.orgUnitId })
    }, { no: NO, clerkRole })
    await page.goto(`/saraban/${encodeURIComponent(NO)}`)
    const workspace = page.getByTestId('saraban-workspace')
    const pending = workspace.locator('[data-testid^="saraban-recipient-number-"]').filter({ hasText: /^(ออกเลข|ลงรับ)$/ })
    while (await pending.count()) {
      const remaining = await pending.count()
      await pending.first().click()
      const dialog = page.getByRole('dialog')
      if (clerkRole === 'secretary_receiver') await dialog.getByRole('textbox', { name: 'เลขที่หนังสือ' }).fill('ปป 0012/900')
      await page.getByTestId('saraban-number-confirm').click()
      await expect(dialog).toHaveCount(0)
      await expect(pending).toHaveCount(remaining - 1)
    }
    await workspace.getByTestId('saraban-submit-button').click()
    await page.locator('.swal2-confirm').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)
  }
  await role(page, 'officer')
  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  await page.getByRole('button', { name: /หนังสือถึงผู้บัญชาการตำรวจแห่งชาติ · ฉบับ/ }).click()
  await expect(page.getByRole('button', { name: 'ยืนยันนำส่งหนังสือถึงผู้บัญชาการตำรวจแห่งชาติ' })).toBeDisabled()
  await page.getByRole('button', { name: /หนังสือถึงผู้กำกับการสถานีตำรวจ · ฉบับ/ }).click()
  await page.getByRole('button', { name: 'ยืนยันนำส่งหนังสือถึงผู้กำกับการสถานีตำรวจ' }).click()
  await page.getByRole('button', { name: /หนังสือถึงผู้บัญชาการตำรวจแห่งชาติ · ฉบับ/ }).click()
  await page.getByRole('button', { name: 'ยืนยันนำส่งหนังสือถึงผู้บัญชาการตำรวจแห่งชาติ' }).click()
  await expect.poll(async () => page.evaluate(async no => { const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string); return useCaseStore.getState().getCase(no).officialLetters?.length }, NO)).toBe(2)
  expect(errors).toEqual([])
})

test('ตัวอย่าง A4 รองรับจอ 1440, 1024, 768 และ 390 โดยไม่ตัดข้อความ', async ({ page }) => {
  await setup(page)
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/forms?additional=police-national')
    await expect(page.getByTestId('coordination-letter-preview')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    const sizes = await page.getByTestId('coordination-letter-preview').evaluate(el => ({ content: el.scrollHeight, frame: el.parentElement!.getBoundingClientRect().height, scale: el.getBoundingClientRect().width / 794 }))
    expect(sizes.frame).toBeGreaterThanOrEqual(sizes.content * sizes.scale - 2)
  }
})

test('หนังสือยาวหลายหน้า PDF ยังมีข้อความและหน่วยงานติดต่อครบ', async ({ page }) => {
  await setup(page)
  const render = await page.evaluate(async no => {
    const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string)
    const { buildLetterHtml, LETTER_CSS } = await import('/src/components/protection/CoordinationLetterComposer.tsx' as string)
    const d = useCaseStore.getState().getCase(no).policeLetters.letters.national.draft
    return { html: buildLetterHtml({ draft: { ...d, body: d.body + '\n\n' + 'ข้อความรายละเอียดเพิ่มเติมสำหรับทดสอบการแบ่งหน้าหนังสือราชการ '.repeat(100), contact: 'ผู้ประสานงานท้ายเอกสาร' }, recipient: 'ผู้บัญชาการตำรวจแห่งชาติ', unit: '', garudaSrc: '/assets/forms/official/emblem/garuda-letter.png' }), css: LETTER_CSS }
  }, NO)
  await page.setContent(`<html lang="th"><head><style>@page{size:A4;margin:0}body{margin:0}${render.css}</style></head><body>${render.html}</body></html>`)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByText('(ผู้ประสานงานท้ายเอกสาร)')).toBeVisible()
  await page.pdf({ path: path.join(evidence, 'long-letter.pdf'), preferCSSPageSize: true })
})


test('เลขาธิการเปิดและลงนามหนังสือตำรวจแยกสองฉบับจากแฟ้ม', async ({ page }) => {
  await setup(page)
  await page.evaluate(async no => {
    const actions = await import('/src/lib/policeLetterActions.ts' as string)
    const { useAuthStore } = await import('/src/store/useAuthStore.ts' as string)
    actions.requestPoliceNumbers(no)
    useAuthStore.getState().setRole('secretary_receiver')
    actions.issuePoliceNumbers(no, {
      station: { registryNo: 'ปป 0012/101', registryDate: '2026-10-28' },
      national: { registryNo: 'ปป 0012/102', registryDate: '2026-10-28' },
    })
    useAuthStore.getState().setRole('secretary')
  }, NO)
  for (const kind of ['station', 'national']) {
    await page.goto(`/dossier/${encodeURIComponent(NO)}`)
    const row = page.getByTestId(`approval-letter-row-${kind}`)
    await row.getByRole('button', { name: 'เปิดแบบฟอร์ม', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`coordination/.*document=${kind}`))
    await expect(page.getByTestId('individual-coordination-signing')).toBeVisible()
    const alignment = await page.getByTestId('coordination-letter-preview').evaluate(el => {
      const paper = el.getBoundingClientRect()
      const container = el.parentElement!.parentElement!.getBoundingClientRect()
      return Math.abs((paper.left + paper.right) / 2 - (container.left + container.right) / 2)
    })
    expect(alignment).toBeLessThan(2)
    await page.getByTestId('coordination-letter-preview').getByRole('button', { name: 'ลงนาม', exact: true }).click()
    await page.getByTestId('signature-confirm-button').click()
    await expect(page.getByRole('button', { name: /ลงนามแล้ว$/ })).toBeDisabled()
    expect(await page.evaluate(async ({ no, kind }) => {
      const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string)
      return !!useCaseStore.getState().getCase(no).policeLetters.letters[kind].signedAt
    }, { no: NO, kind })).toBe(true)
  }
})


test('เตรียม คบ.9 และ คบ.10 ก่อนเลือกผล แล้วซ่อนเอกสารอีกฝั่ง', async ({ page }) => {
  await setup(page)
  await page.evaluate(async no => {
    const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string)
    useCaseStore.getState().updateCase(no, { preliminaryDecision: undefined, stage: 'staff_review', urgency: 'normal', extraForms: [] })
  }, NO)
  await role(page, 'officer')
  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  await expect(page.getByText('ร่างรอผลพิจารณา', { exact: true })).toHaveCount(4)
  for (const kind of ['station', 'national']) {
    await page.goto(`/dossier/${encodeURIComponent(NO)}`)
    await page.getByTestId(`approval-letter-row-${kind}`).getByRole('button', { name: 'เปิดแบบฟอร์ม', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`coordination/.*document=${kind}`))
    await expect(page.getByTestId('coordination-letter-preview')).toBeVisible()
    await expect(page.locator('[data-letter-sign]')).toHaveCount(0)
    await page.getByRole('button', { name: 'กรอกผ่านแบบฟอร์ม', exact: true }).click()
    await expect(page.getByText('ข้อมูลจากแฟ้มสำหรับหนังสือทั้งสองฉบับ', { exact: true })).toBeVisible()
  }
  for (const formNo of [9, 10]) {
    await page.goto(`/form/${formNo}?caseNo=${encodeURIComponent(NO)}`)
    await expect(page.getByTestId('notice-decision-workspace')).toHaveCount(0)
    await expect(page.locator(`[data-testid="paper-sign-kb${formNo}-secretary"]`)).toHaveCount(0)
  }
  await role(page, 'secretary')
  for (const outcome of ['approved', 'rejected']) {
    await page.evaluate(async ({ no, outcome }) => {
      const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string)
      useCaseStore.getState().updateCase(no, { stage: 'external_pending' })
      useCaseStore.getState().beginPreliminaryDecision(no, outcome)
    }, { no: NO, outcome })
    await page.goto(`/dossier/${encodeURIComponent(NO)}`)
    await expect(page.getByText('ร่างรอผลพิจารณา', { exact: true })).toHaveCount(0)
    await expect(page.getByTestId('approval-letter-row-station')).toHaveCount(outcome === 'approved' ? 1 : 0)
    await expect(page.getByTestId('approval-letter-row-national')).toHaveCount(outcome === 'approved' ? 1 : 0)
  }
})


test('ลงนาม คบ.6 เลือกชุดแจ้งผล และซ่อมแฟ้มที่ลงนามไว้ก่อนหน้า', async ({ page }) => {
  await setup(page)
  for (const choice of ['agree', 'disagree']) {
    await page.evaluate(async ({ no, choice }) => {
      const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string)
      useCaseStore.getState().updateCase(no, { stage: 'external_pending', urgency: 'normal', preliminaryDecision: undefined, kb6SecretarySignedAt: undefined, kb6SecretaryOpinionChoice: choice, extraForms: [9, 10] })
      useCaseStore.getState().signKb6(no, 'secretary')
    }, { no: NO, choice })
    expect(await page.evaluate(async no => {
      const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string)
      return useCaseStore.getState().getCase(no).preliminaryDecision?.formNo
    }, NO)).toBe(choice === 'agree' ? 9 : 10)
    // จำลองแฟ้มที่ลงนามไปก่อนแก้ไข แต่ยังไม่เลือกชุดแจ้งผล
    await page.evaluate(async no => {
      const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string)
      useCaseStore.getState().updateCase(no, { preliminaryDecision: undefined })
    }, NO)
    await page.goto(`/dossier/${encodeURIComponent(NO)}`)
    await expect.poll(() => page.evaluate(async no => {
      const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string)
      return useCaseStore.getState().getCase(no).preliminaryDecision?.formNo
    }, NO)).toBe(choice === 'agree' ? 9 : 10)
    await expect(page.getByTestId('approval-letter-row-station')).toHaveCount(choice === 'agree' ? 1 : 0)
  }
})

test('ลงนาม คบ.9 ได้โดยไม่กรอกเหตุผลหรือหมายเหตุ', async ({ page }) => {
  await setup(page)
  await page.goto(`/form/9?caseNo=${encodeURIComponent(NO)}`)
  await page.getByTestId('notice-decision-reason').fill('')
  await page.getByTestId('notice-decision-instruction').fill('')
  await page.getByTestId('notice-decision-confirm').click()
  await page.getByTestId('signature-confirm-button').click()
  await expect.poll(() => page.evaluate(async no => {
    const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string)
    const c = useCaseStore.getState().getCase(no)
    return Boolean(c.approvalNoticeSignature)
  }, NO)).toBe(true)
})


for (const order of [['national', 'notice', 'station'], ['station', 'national', 'notice']]) {
  test(`ลงนามอิสระไม่มีปลายทาง ${order.join('-')}`, async ({ page }) => {
    await setup(page)
    await page.evaluate(async no => {
      const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string)
      const c = useCaseStore.getState().getCase(no)
      useCaseStore.getState().updateCase(no, { preliminaryDecision: { ...c.preliminaryDecision, savedAt: undefined, destination: undefined, reason: '' } })
    }, NO)
    for (const kind of order) {
      await page.goto(kind === 'notice' ? `/form/9?caseNo=${encodeURIComponent(NO)}` : `/coordination/${encodeURIComponent(NO)}?document=${kind}`)
      if (kind === 'notice') await page.getByTestId('notice-decision-confirm').click()
      else await page.getByTestId('coordination-letter-preview').getByRole('button', { name: 'ลงนาม', exact: true }).click()
      await page.getByTestId('signature-confirm-button').click()
      await expect.poll(() => page.evaluate(async ({ no, kind }) => {
        const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string)
        const c = useCaseStore.getState().getCase(no)
        return kind === 'notice' ? !!c.approvalNoticeSignature : !!c.policeLetters.letters[kind].signedAt
      }, { no: NO, kind })).toBe(true)
    }
  })
}

test('บันทึกนำส่งจากหน้าเอกสารตำรวจแต่ละฉบับ', async ({ page }) => {
  await setup(page)
  await page.evaluate(async no => {
    const { useCaseStore } = await import('/src/store/useCaseStore.ts' as string)
    const c = useCaseStore.getState().getCase(no), b = c.policeLetters
    for (const kind of ['station', 'national']) b.letters[kind] = { ...b.letters[kind], signedAt: new Date().toISOString(), numberedAt: new Date().toISOString(), status: 'signed' }
    b.letters.national.attachmentVersionId = b.letters.station.id
    useCaseStore.getState().updateCase(no, { policeLetters: b, stage: 'method_operation', activity7State: 'approved', protectionHandoff: { destination: 'original_owner', step: 'active', assigneeUserId: 'OFF-001', events: [] } })
  }, NO)
  await role(page, 'officer')
  for (const kind of ['station', 'national']) {
    await page.goto(`/coordination/${encodeURIComponent(NO)}?document=${kind}`)
    await page.getByLabel('เลขติดตามพัสดุ', { exact: true }).fill(`EMS-${kind}`)
    await page.getByRole('button', { name: 'บันทึกการนำส่ง', exact: true }).click()
    await expect(page.getByText('บันทึกการนำส่งแล้ว', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText(`เลขติดตาม: EMS-${kind}`, { exact: true })).toBeVisible()
  }
})
