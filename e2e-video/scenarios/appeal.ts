import type { Locator } from '@playwright/test'
import { isoDaysFromToday, type Director } from '../director'
import type { ScenarioScript } from '../types'

const CASE_NO = 'WP-2569-000501'
const APPEAL_URL = `/appeal-folder/${CASE_NO}`
const SECRETARY = 'นายสุรศักดิ์ ธรรมพิทักษ์'

/** ไล่เสนอแฟ้มอุทธรณ์ทีละชั้น (WIT0915-0918) — ผู้ใช้แต่ละชั้นกรอกความเห็นแล้วกดส่งต่อ */
async function opinionLayer(d: Director, note: string, hint: string, confirmNote: string) {
  await d.fill(d.page.getByTestId('appeal-opinion-note'), note, { note: hint })
  await d.click(d.page.getByTestId('appeal-opinion-submit'), { note: 'กดบันทึกความเห็นและส่งต่อ' })
  await d.confirm('ยืนยัน', confirmNote)
}

export default {
  id: 'appeal',
  steps: {
    'Case 4': {
      detail:
        'ผลพิจารณาคือไม่อนุมัติ เจ้าหน้าที่ตรวจร่าง คบ.10 ที่แจ้งสิทธิอุทธรณ์ภายใน 30 วัน แล้วเสนอกลั่นกรองตามลำดับ จนลงนามและนำส่งให้พยาน',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByTestId('kb10-readiness-note'), 'WIT0903-0904: ร่าง คบ.10 แจ้งเหตุผลและสิทธิอุทธรณ์ 30 วัน', 2400)
        await d.fill(
          p.getByTestId('kb10-readiness-note'),
          'ตรวจร่าง คบ.10 ครบถ้วนตามผลพิจารณา — เหตุผล ฐานการพิจารณา และสิทธิอุทธรณ์ 30 วัน',
          { note: 'บันทึกผลตรวจความครบถ้วนของร่าง คบ.10' }
        )
        await d.click(p.getByTestId('kb10-submit-screening'), { note: 'กดเสนอกลั่นกรอง' })
        await d.confirm('ยืนยันเสนอกลั่นกรอง', 'ยืนยันเสนอ คบ.10 ให้รองเลขาธิการฯ')

        await d.switchRole('deputy_secretary', 'รองเลขาธิการฯ กลั่นกรอง คบ.10 (WIT0905)', 'ตรวจว่าข้อความตรงกับผลพิจารณาและแจ้งสิทธิอุทธรณ์ครบถ้วน')
        await d.fill(p.getByTestId('kb10-deputy-note'), 'ข้อความตรงกับผลพิจารณาและแจ้งสิทธิอุทธรณ์ครบถ้วน', { note: 'บันทึกผลกลั่นกรอง' })
        await d.click(p.getByTestId('kb10-deputy-pass'), { note: 'กลั่นกรองผ่าน' })
        await d.confirm('ยืนยันกลั่นกรองผ่าน', 'ยืนยันกลั่นกรองผ่าน ส่งเลขาธิการฯ ลงนาม')

        await d.switchRole('secretary', 'เลขาธิการฯ ลงนาม คบ.10 (WIT0906)', 'ผู้มีอำนาจลงนามอิเล็กทรอนิกส์ใน คบ.10 เมื่อลงนามแล้วฉบับจะถูกล็อก')
        const forms = p.getByTestId('dossier-forms')
        await d.highlight(forms, 'คบ.10 รอเลขาธิการฯ ลงนาม')
        await d.click(forms.getByRole('button', { name: 'ลงนาม' }), { note: 'เปิดดูฉบับพิมพ์ก่อนลงนาม' })
        await d.pause(800)
        await d.click(p.getByRole('button', { name: 'ลงนาม' }).last(), { note: 'กดลงนาม' })
        await d.fill(p.getByTestId('signature-name-input'), SECRETARY, { note: 'กรอกชื่อผู้ลงนาม' })
        await d.check(p.getByTestId('signature-certify-checkbox'), { note: 'รับรองการลงนามอิเล็กทรอนิกส์' })
        await d.click(p.getByTestId('signature-confirm-button'), { note: 'ยืนยันลงนาม' })
        await d.highlight(forms.getByText('ลงนามแล้ว').first(), 'คบ.10 ลงนามแล้ว ฉบับถูกล็อก')

        await d.switchRole('officer', 'เจ้าหน้าที่นำส่ง คบ.10 และบันทึกวันที่พยานรับ (WIT0907)', 'นำส่งทางไปรษณีย์ แล้วบันทึกวันที่พยานได้รับจริงเพื่อเริ่มนับ 30 วัน')
        const dispatch = p
          .getByText('การนำส่งหนังสือและวันที่พยานได้รับ')
          .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
        await d.click(dispatch.getByRole('button', { name: 'บันทึกการนำส่ง' }), { note: 'บันทึกการนำส่งทางไปรษณีย์ EMS' })
        await d.fillDate(dispatch.locator('input[type="date"]'), isoDaysFromToday(-5), 'วันที่พยานได้รับหนังสือจริง')
        await d.fill(
          dispatch.locator('label', { hasText: 'ผู้รับหนังสือ' }).locator('xpath=following-sibling::*[1]'),
          'นางสาวศิริพร ใจดี',
          { note: 'ชื่อผู้รับหนังสือ' }
        )
        // อัปโหลดไฟล์ใบตอบรับ — ช่อง file ซ่อนอยู่ ไม่มีเคอร์เซอร์ให้กด จึงใช้ setInputFiles ตรง ๆ
        await dispatch
          .locator('label', { hasText: 'เลือกไฟล์อัปโหลด' })
          .locator('input[type="file"]')
          .setInputFiles({ name: 'ใบตอบรับ-EMS.pdf', mimeType: 'application/pdf', buffer: Buffer.from('mock ack file') })
        await d.pause(600)
        await d.click(dispatch.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }), { note: 'ยืนยันการรับหนังสือ' })
        await d.highlight(p.getByText('สิทธิยื่นอุทธรณ์ภายใน 30 วัน').first(), 'ระบบเริ่มนับกรอบอุทธรณ์ 30 วัน จากวันที่พยานได้รับจริง', 3000)
      },
    },

    'Case 4.1': {
      detail:
        'พยานได้รับ คบ.10 แล้วและยังอยู่ในกรอบอุทธรณ์ 30 วัน เมื่อพยานแสดงความประสงค์อุทธรณ์ เจ้าหน้าที่รับคำอุทธรณ์เข้าแฟ้มเดิม แล้ว ผบช.ชั้นต้นมอบหมายเจ้าหน้าที่อุทธรณ์',
      run: async (d) => {
        const p = d.page
        const section = p
          .getByText('สิทธิยื่นอุทธรณ์ภายใน 30 วัน')
          .first()
          .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
        await d.highlight(section, 'WIT0908: อยู่ในกรอบอุทธรณ์ 30 วัน นับจากวันที่พยานได้รับจริง', 2800)
        await d.fill(p.getByTestId('appeal-intake-reason'), 'มีพยานหลักฐานใหม่แสดงความเชื่อมโยงของผู้ข่มขู่กับผู้ถูกกล่าวหา', { note: 'บันทึกเหตุผลการอุทธรณ์' })
        await d.click(p.getByTestId('appeal-intake-channel-letter'), { note: 'ช่องทางรับ: หนังสือ' })
        await d.fill(p.getByTestId('appeal-intake-registry-no'), '512/2569', { note: 'เลขรับสารบรรณกลาง' })
        // ช่องอัปโหลดซ่อนอยู่ จึงแนบไฟล์ด้วย setInputFiles
        await p.getByTestId('appeal-intake-evidence-file').setInputFiles({ name: 'คำร้องอุทธรณ์.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 mock') })
        await d.highlight(p.getByTestId('appeal-intake-submit'), 'แนบหนังสืออุทธรณ์แล้ว ไม่สร้าง คบ.1 ใหม่ (WIT0911-0913)', 1800)
        await d.click(p.getByTestId('appeal-intake-submit'), { note: 'กดรับคำอุทธรณ์' })
        await d.confirm('ยืนยัน', 'ยืนยันรับคำอุทธรณ์เข้าแฟ้มเดิม')

        await d.switchRole('supervisor', 'ผบช.ชั้นต้นมอบหมายเจ้าหน้าที่อุทธรณ์', 'เปิดแฟ้มอุทธรณ์ (09B) แล้วเลือกเจ้าหน้าที่ผู้รับผิดชอบ ซึ่งเป็นจุดเดียวที่เปลี่ยนเจ้าของเรื่อง', APPEAL_URL)
        const assign = p.getByTestId('appeal-assign')
        await d.highlight(assign, 'แฟ้มอุทธรณ์ในแฟ้มเดิมของพยาน')
        await d.select(assign.getByTestId('appeal-assign-officer'), 'APP-001', { note: 'เลือกเจ้าหน้าที่อุทธรณ์' })
        await d.click(assign.getByTestId('appeal-assign-submit'), { note: 'กดมอบหมาย' })
        await d.confirm('ยืนยัน', 'ยืนยันมอบหมายเจ้าหน้าที่อุทธรณ์')
      },
    },

    'Case 4.2': {
      detail:
        'แฟ้มอุทธรณ์รับเรื่องแล้ว เจ้าหน้าที่ตรวจความครบถ้วนและให้ความเห็น จากนั้นเสนอขึ้นตามลำดับ ผบช.ชั้นต้น ผอ.สำนัก/กอง รองเลขาธิการฯ และเลขาธิการฯ จนฝ่ายเลขานุการบรรจุวาระ',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByTestId('appeal-check-submit'), 'WIT0914: ตรวจความครบถ้วนและกรอบ 30 วัน', 2200)
        await d.click(p.getByTestId('appeal-check-submit'), { note: 'ตรวจแฟ้มครบถ้วน' })
        await d.confirm('ยืนยันแฟ้มครบถ้วน', 'ระบบคำนวณกรอบ 30 วัน แล้วเข้าชั้นความเห็นเจ้าหน้าที่')

        await opinionLayer(d, 'ตรวจข้อเท็จจริงและเอกสารแล้ว เห็นควรเสนอตามลำดับชั้น', 'WIT0915: ความเห็นเจ้าหน้าที่ แยกจากคำอุทธรณ์ของผู้ยื่น', 'ส่งต่อ ผบช.ชั้นต้น')

        await d.switchRole('supervisor', 'ผบช.ชั้นต้น ให้ความเห็น', 'ตรวจความครบถ้วนของแฟ้มและให้ความเห็นก่อนเสนอ ผอ.สำนัก/กอง')
        await opinionLayer(d, 'ตรวจความครบถ้วนแล้ว เห็นควรเสนอ ผอ.สำนัก/กอง', 'WIT0916: ผบช.ชั้นต้นให้ความเห็น', 'ส่งต่อ ผอ.สำนัก/กอง')

        await d.switchRole('director', 'ผอ.สำนัก/กอง ลงนามเสนอ', 'ตรวจและลงนามเสนอแฟ้มอุทธรณ์ขึ้นรองเลขาธิการฯ ข้ามชั้นไม่ได้')
        await opinionLayer(d, 'ตรวจแฟ้มแล้ว เห็นควรเสนอรองเลขาธิการฯ', 'WIT0916: ผอ.ลงนามเสนอ', 'ส่งต่อรองเลขาธิการฯ')

        await d.switchRole('deputy_secretary', 'รองเลขาธิการฯ กลั่นกรองแฟ้ม', 'กลั่นกรองแฟ้มอุทธรณ์และให้ความเห็นประกอบก่อนถึงเลขาธิการฯ')
        await opinionLayer(d, 'กลั่นกรองแฟ้มแล้ว ความเห็นประกอบครบถ้วน', 'WIT0917: รองเลขาธิการฯ กลั่นกรอง', 'ส่งต่อเลขาธิการฯ')

        await d.switchRole('secretary', 'เลขาธิการฯ รับทราบและส่งเสนอคณะกรรมการ', 'เลขาธิการฯ ไม่ใช่ผู้วินิจฉัยอุทธรณ์ เป็นผู้ส่งเรื่องให้คณะกรรมการ ป.ป.ท. วินิจฉัย')
        await d.highlight(p.getByTestId('appeal-opinion-note'), 'WIT0918: เลขาธิการฯ ไม่ใช่ผู้วินิจฉัย', 1800)
        await opinionLayer(d, 'รับทราบและให้ความเห็นประกอบ ส่งเสนอคณะกรรมการวินิจฉัย', 'ความเห็นเลขาธิการฯ', 'ส่งเสนอคณะกรรมการ')

        await d.switchRole('committee', 'ฝ่ายเลขานุการคณะกรรมการบรรจุวาระ', 'ฝ่ายเลขานุการนำแฟ้มอุทธรณ์เสนอประธานเพื่อบรรจุระเบียบวาระ')
        await d.fill(p.getByTestId('appeal-agenda-no'), 'วาระที่ 4.2 ครั้งที่ 9/2569', { note: 'WIT0919: ระบุวาระที่และครั้งที่ประชุม' })
        await d.click(p.getByTestId('appeal-agenda-submit'), { note: 'กดบรรจุวาระ' })
        await d.confirm('ยืนยันบรรจุวาระ', 'บรรจุวาระ รอคณะกรรมการ ป.ป.ท. วินิจฉัย')
      },
    },

    'Case 4.3': {
      detail:
        'คณะกรรมการ ป.ป.ท. วินิจฉัยอุทธรณ์ ในที่นี้มีมติยืนคำสั่งเดิม จากนั้นเจ้าหน้าที่ออกหนังสือแจ้งผลผ่านสารบรรณ เก็บหลักฐานการรับ แล้วปิดขั้นอุทธรณ์',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByTestId('appeal-resolution-no'), 'WIT0920: แฟ้มบรรจุวาระแล้ว รอคณะกรรมการวินิจฉัย', 2400)
        await d.fill(p.getByTestId('appeal-resolution-no'), 'มติที่ 55/2569', { note: 'เลขที่มติ' })
        await d.fill(p.getByTestId('appeal-resolution-note'), 'พยานหลักฐานใหม่ไม่เปลี่ยนสาระสำคัญของคำสั่งเดิม', { note: 'สาระสำคัญของมติ' })
        await d.highlight(p.getByTestId('appeal-resolution-overturn'), 'อีกทางเลือก: เปลี่ยนคำสั่งเป็นอนุมัติ (WIT0922) — ครั้งนี้เลือกยืนคำสั่งเดิม', 2200)
        await d.click(p.getByTestId('appeal-resolution-uphold'), { note: 'มติยืนคำสั่งเดิม' })
        await d.confirm('ยืนยันมติยืนคำสั่งเดิม', 'ยืนยันมติ — เป็นที่สุด แต่ยังต้องแจ้งผลอย่างเป็นทางการ')

        await d.switchRole('officer', 'เจ้าหน้าที่แจ้งผลอุทธรณ์ (WIT0921)', 'ออกหนังสือแจ้งผลอุทธรณ์ (ไม่มีเลข คบ.) ผ่านสารบรรณ พร้อมเก็บหลักฐานการรับ')
        const form = p.getByTestId('appeal-notice-form')
        await d.highlight(form, 'ฟอร์มหนังสือแจ้งผลอุทธรณ์')
        await d.fill(p.getByTestId('appeal-notice-document'), 'หนังสือแจ้งผลอุทธรณ์_สมชาย.pdf', { note: 'ชื่อไฟล์หนังสือแจ้งผล' })
        await d.fill(p.getByTestId('appeal-notice-registry'), 'ปปท 0007/4412', { note: 'เลขทะเบียนส่งสารบรรณ' })
        await d.fill(p.getByTestId('appeal-notice-ack'), 'ใบตอบรับไปรษณีย์ (EMS)', { note: 'หลักฐานการรับ' })
        await d.click(p.getByTestId('appeal-notice-submit'), { note: 'บันทึกแจ้งผล' })
        await d.confirm('ยืนยันบันทึกหนังสือแจ้งผล', 'ยืนยันแจ้งผลและปิดขั้นอุทธรณ์')
        await d.highlight(p.getByTestId('appeal-notice-done'), 'แจ้งผลอุทธรณ์ให้พยานแล้ว ปิดขั้นอุทธรณ์', 3000)
      },
    },
  },
} satisfies ScenarioScript
