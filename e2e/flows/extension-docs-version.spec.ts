import { expect, test } from '@playwright/test'
import { readCase, switchRole } from '../helpers/seed'
import { NO, card, noHorizontalOverflow, openDemoCase, passKb14Down, passKb14Up, reqOf, shot, signKb6AsCurrentRole, submitKb14FromForm, tracker } from '../helpers/extensionDocs'

test('ขอขยายเวลา: คบ.3/คบ.6 ฉบับที่ 2 ลงนามตามลำดับชั้นพร้อม คบ.14 จนเลขาธิการอนุมัติ', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const v1Dept = await openDemoCase(page, { v1Marker: true })
  const original: any = await readCase(page, NO)

  // 1) การ์ดชุดเอกสาร + แถวฉบับที่ 2 ในแฟ้ม
  await expect(card(page)).toBeVisible()
  await expect(card(page).getByRole('heading', { name: 'ชุดเอกสารขอขยายระยะเวลา ครั้งที่ 1' })).toBeVisible()
  await expect(card(page)).toContainText('คบ.3 ฉบับที่ 2')
  await expect(card(page)).toContainText('คบ.6 ฉบับที่ 2')
  await expect(card(page)).toContainText('คบ.14')
  for (const n of [3, 6]) {
    await expect(page.locator(`[data-testid="dossier-form-row"][data-form-number="${n}"]`)).toContainText('ฉบับที่ 2 · ขยายเวลา')
  }
  await noHorizontalOverflow(page)
  await shot(page, '01-dossier-1440')
  await page.setViewportSize({ width: 390, height: 844 })
  await noHorizontalOverflow(page)
  await shot(page, '01-dossier-390')
  await page.setViewportSize({ width: 1440, height: 1000 })

  // 2) คบ.6 ฉบับที่ 2: banner, ดึงค่าจากฉบับ 1, แก้ไขได้, เห็นประวัติฉบับก่อน
  await card(page).locator('a', { hasText: 'เปิดแบบฟอร์ม' }).nth(1).click()
  await expect(page).toHaveURL(new RegExp(`/form/6\\?caseNo=${NO.replace('/', '(?:/|%2F)')}`))
  await expect(page.getByTestId('ext-docs-banner')).toBeVisible()
  const dept = page.getByRole('textbox', { name: /ส่วนราชการ/ })
  await expect(dept).toHaveValue(v1Dept)
  await expect(dept).toBeEditable()
  await dept.fill('กลุ่มงานคุ้มครองพยาน-v2-แก้ไข')
  await expect(dept).toHaveValue('กลุ่มงานคุ้มครองพยาน-v2-แก้ไข')
  await page.getByText('ดูประวัติเวอร์ชัน').first().click()
  await shot(page, '02-kb6-v2-history')
  await expect(page.getByText(/ฉบับที่ 1/).first()).toBeVisible()
  await page.keyboard.press('Escape')

  // 3) ส่ง คบ.14 -> ล็อก คบ.3/คบ.6 และ tracker ชี้ผู้บังคับบัญชา
  await submitKb14FromForm(page, 'ภัยคุกคามยังไม่หมดไป ขอขยายเวลาคุ้มครองเพิ่ม')
  await expect.poll(async () => (await reqOf(page)).status).toBe('submitted')
  const submitted = await reqOf(page)
  expect(submitted.docVersion).toBe(2)
  expect(submitted.kb6Snapshot).toBeTruthy()
  expect(submitted.kb3Snapshot).toBeTruthy()
  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  await expect(card(page)).toContainText('ส่งตรวจแล้ว · ล็อก')
  await expect(tracker(page, 'ผู้บังคับบัญชา')).toHaveAttribute('data-state', 'current')
  await shot(page, '03-submitted-tracker')
  await page.goto(`/form/6?caseNo=${NO}`)
  await expect(page.getByRole('textbox', { name: /ส่วนราชการ/ })).not.toBeEditable()

  // 4) ผู้บังคับบัญชาลงนาม คบ.6 ฉบับที่ 2
  await switchRole(page, 'supervisor')
  await signKb6AsCurrentRole(page)
  await expect.poll(async () => (await reqOf(page)).kb6Signatures?.supervisor?.at).toBeTruthy()
  await expect.poll(async () => (await reqOf(page)).approvalStage).toBe('director')
  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  await expect(tracker(page, 'ผู้บังคับบัญชา')).toHaveAttribute('data-state', 'signed')
  await expect(tracker(page, 'ผู้อำนวยการ')).toHaveAttribute('data-state', 'current')
  await shot(page, '04-supervisor-signed')

  // ผอ. เห็นชอบ คบ.14 = ลงนาม คบ.6 ชั้นเดียวกัน
  await switchRole(page, 'director')
  await page.goto(`/form/14?caseNo=${NO}`)
  await expect(page.getByTestId('kb14-kb6-note')).toContainText('คบ.6 ฉบับที่ 2')
  await page.getByRole('button', { name: 'เห็นชอบ · ส่งรองเลขาธิการ', exact: true }).click()
  await page.getByRole('button', { name: 'ยืนยันครบถ้วน', exact: true }).click()
  await expect.poll(async () => (await reqOf(page)).approvalStage).toBe('deputy_secretary')
  expect((await reqOf(page)).kb6Signatures.director).toBeTruthy()
  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  await expect(tracker(page, 'ผู้อำนวยการ')).toHaveAttribute('data-state', 'signed')
  await expect(tracker(page, 'รองเลขาธิการ')).toHaveAttribute('data-state', 'current')

  // ข้ามจากหน่วยเข้าสำนักงานเลขาธิการ — ผ่านธุรการหน่วย (ขาออก) และธุรการ สลธ. (ขาเข้า)
  await passKb14Up(page)

  // รองเลขาธิการลงนามที่ฟอร์ม คบ.6
  await switchRole(page, 'deputy_secretary')
  await signKb6AsCurrentRole(page)
  await expect.poll(async () => (await reqOf(page)).approvalStage).toBe('secretary')
  expect((await reqOf(page)).kb6Signatures.deputy).toBeTruthy()
  expect((await reqOf(page)).protectionEndAt ?? original.protectionEndAt).toBe(original.protectionEndAt)

  // เลขาธิการลงนาม = อนุมัติขยายเวลา
  await switchRole(page, 'secretary')
  await signKb6AsCurrentRole(page)
  await expect.poll(async () => (await reqOf(page)).status).toBe('approved')
  // ผลลงหน่วยผ่านธุรการ สลธ. (ขาออก) → ธุรการหน่วย (ขาเข้า)
  await passKb14Down(page)
  const done: any = await readCase(page, NO)
  expect(done.extensionRequests.at(-1).kb6Signatures.secretary).toBeTruthy()
  expect(done.protectionEndAt).not.toBe(original.protectionEndAt)
  expect(new Date(done.protectionEndAt).getTime()).toBeGreaterThan(new Date(original.protectionEndAt).getTime())
  await switchRole(page, 'officer')
  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  await expect(card(page)).toContainText('เสร็จสิ้น')
  for (const l of ['ผู้บังคับบัญชา', 'ผู้อำนวยการ', 'รองเลขาธิการ', 'เลขาธิการ']) {
    await expect(tracker(page, l).first()).toHaveAttribute('data-state', 'signed')
  }
  await noHorizontalOverflow(page)
  await shot(page, '05-completed')
  await page.setViewportSize({ width: 390, height: 844 })
  await noHorizontalOverflow(page)
  await shot(page, '05-completed-390')
})

test('ส่งกลับแก้: ปลดล็อก คบ.3/คบ.6 ฉบับเดิม ลายมือชื่อถูกล้าง และส่งซ้ำยังเป็นฉบับที่ 2', async ({ page }) => {
  await openDemoCase(page)
  await submitKb14FromForm(page, 'ขอขยายเวลาเพราะภัยยังอยู่')
  await expect.poll(async () => (await reqOf(page)).status).toBe('submitted')

  // ผู้บังคับบัญชาลงนาม แล้ว ผอ. ส่งกลับ
  await switchRole(page, 'supervisor')
  await signKb6AsCurrentRole(page)
  await expect.poll(async () => (await reqOf(page)).approvalStage).toBe('director')
  await switchRole(page, 'director')
  await page.goto(`/form/14?caseNo=${NO}`)
  await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืนแก้ไข').fill('ปรับรายละเอียด คบ.6')
  await page.getByRole('button', { name: 'ส่งคืนแก้ไข', exact: true }).click()
  await page.getByRole('button', { name: 'ยืนยันส่งคืน', exact: true }).click()
  await expect.poll(async () => (await reqOf(page)).status).toBe('returned')
  const returned = await reqOf(page)
  expect(Object.keys(returned.kb6Signatures || {})).toHaveLength(0)

  await switchRole(page, 'officer')
  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  await expect(card(page)).toContainText('ร่าง · แก้ไขได้')
  await expect(card(page)).toContainText('คบ.6 ฉบับที่ 2')
  await expect(tracker(page, 'ผู้บังคับบัญชา')).toHaveAttribute('data-state', 'pending')
  await shot(page, '06-returned-unlocked')
  await page.goto(`/form/6?caseNo=${NO}`)
  await expect(page.getByRole('textbox', { name: /ส่วนราชการ/ })).toBeEditable()

  await submitKb14FromForm(page, 'ขอขยายเวลาเพราะภัยยังอยู่ (แก้ไขแล้ว)')
  await expect.poll(async () => (await reqOf(page)).status).toBe('submitted')
  const again = await reqOf(page)
  expect(again.docVersion).toBe(2)
  expect(again.version).toBe(2)
  expect(((await readCase(page, NO)) as any).extensionDocs.kb6Version).toBe(2)
  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  await expect(card(page)).toContainText('คบ.6 ฉบับที่ 2')
  await expect(card(page)).not.toContainText('ฉบับที่ 3')
  await expect(tracker(page, 'ผู้บังคับบัญชา')).toHaveAttribute('data-state', 'current')
  await shot(page, '07-resubmitted-same-version')
})
