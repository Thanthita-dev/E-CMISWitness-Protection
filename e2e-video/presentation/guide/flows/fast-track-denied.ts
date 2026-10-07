import { GUIDE_DOSSIER_URL, type GuideFlow } from '../types'
import { commonToAssessment } from './common'
import { urgentToDecision } from './fast-track'

export default {
  id: 'fast-track-denied',
  title: 'ทางแยก: เร่งด่วนแต่ไม่อนุมัติคุ้มครองชั่วคราว',
  summary:
    'เจ้าหน้าที่ประเมินว่าเป็นกรณีเร่งด่วนและส่ง คบ.4 ให้ ผอ. แต่ ผอ. ไม่อนุมัติคุ้มครองชั่วคราว คำร้องหลักไม่ถูกปิดและไม่ออก คบ.10 แฟ้มกลับมาที่เจ้าหน้าที่เพื่อจัดทำ คบ.6 ตามเส้นทางปกติ',
  branchSection: 'เจ้าหน้าที่จัดทำ คบ.3 และ คบ.6',
  prefix: commonToAssessment,
  run: async (d) => {
    const { page } = d
    await urgentToDecision(d)

    // ── ผอ.: ไม่อนุมัติ ──
    d.section('ผอ. ไม่อนุมัติคุ้มครองชั่วคราว', 'ผู้อำนวยการเห็นว่าระดับภัยยังไม่ถึงขั้นต้องคุ้มครองทันที จึงบันทึกเหตุผลที่ไม่อนุมัติ (เฉพาะการคุ้มครองชั่วคราวเท่านั้น)')
    await d.click(page.getByTestId('fast-track-deny-button'), { note: 'กด "ไม่อนุมัติคุ้มครองชั่วคราว"' })
    await d.fill(page.getByTestId('fast-track-deny-reason'), 'ระดับภัยยังไม่ถึงขั้นต้องคุ้มครองทันที ให้เดินคำร้องหลักตามปกติและติดตามสถานการณ์', {
      note: 'บันทึกเหตุผลที่ไม่อนุมัติ',
    })
    await d.click(page.getByTestId('fast-track-deny-confirm'), { note: 'กด "ยืนยันไม่อนุมัติชั่วคราว"' })
    await d.confirm('ยืนยันไม่อนุมัติชั่วคราว', 'คำร้องหลักไม่ถูกปิด และไม่ออก คบ.10')
    await d.result(page.getByText('ไม่อนุมัติการคุ้มครองชั่วคราว', { exact: true }).first(), 'บันทึกผลไม่อนุมัติแล้ว พร้อมเหตุผลของ ผอ.')

    // ── กลับเข้าเส้นทางหลัก ──
    await d.switchRole('officer', 'กลับเข้าเส้นทางหลัก', 'แฟ้มกลับมาที่เจ้าหน้าที่ คำร้องหลักยังเดินต่อ ให้จัดทำ คบ.6 แล้วเสนอผู้บังคับบัญชาชั้นต้น ต่อจากขั้น "เจ้าหน้าที่จัดทำ คบ.3 และ คบ.6" ของเส้นทางหลัก', GUIDE_DOSSIER_URL)
    const notice = page.getByTestId('fast-track-main-petition-notice')
    await notice.waitFor()
    await d.scrollTo(notice)
    await d.result(notice, 'คำร้องหลักยังเดินต่อ — ไม่ปิดคำร้อง ไม่ออก คบ.10 ไม่เกิดสิทธิอุทธรณ์')
  },
} satisfies GuideFlow
