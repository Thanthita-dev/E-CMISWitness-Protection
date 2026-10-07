import type { Presenter } from './presenter'

/** ฉาก "ธุรการรับคำร้องใหม่" — ก่อนเข้าแฟ้มตัวอย่าง WP-2569-000501 (โหลด checkpoint Case 1 ในบทบาทธุรการแล้ว) */
export async function runNewIntake(d: Presenter): Promise<void> {
  const p = d.page

  // เข้าทะเบียนจากเมนูข้าง แล้วกด "รับคำร้องใหม่"
  const menu = p.getByRole('link', { name: 'ทะเบียนและรับคำร้อง' }).first()
  if (await menu.isVisible().catch(() => false)) await d.click(menu, { note: 'เปิดเมนู ทะเบียนและรับคำร้อง' })
  else await d.goto('/registry')
  await d.click(p.getByRole('link', { name: 'รับคำร้องใหม่' }), { note: 'รับคำร้องใหม่' })

  // กรอกเฉพาะช่องสำคัญ (ช่องอื่นมีค่าเริ่มต้นตามบทบาทธุรการ)
  await d.fill(p.locator('#intakePetitioner'), 'นายสมชาย ใจดี', { note: 'ระบุชื่อผู้ส่ง/ผู้แจ้ง' })
  await d.click(p.getByRole('button', { name: 'รับเอกสารเข้าทะเบียน' }), { note: 'บันทึกรับเรื่องเข้าทะเบียน', after: 1200 })

  // ระบบเปิดแฟ้มเลขใหม่ในขั้นรับเรื่อง
  await p.waitForURL(/\/dossier\//)
  await d.highlight(p.getByText(/WP-\d{4}-\d{6}/).first(), 'เปิดแฟ้มเลขคำร้องใหม่แล้ว', 2200)
}
