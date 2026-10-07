import type { Director } from '../director'
import type { ScenarioScript } from '../types'

export default {
  id: 'extension',
  steps: {
    'Case 1.14': {
      detail:
        'ส่ง คบ.13 ล่าสุดมาทบทวนผลการคุ้มครอง เจ้าหน้าที่เสนอแนวทาง "ขยายระยะเวลา" ผบช.ชั้นต้นเห็นชอบ แล้วเจ้าหน้าที่ส่งงานไปจัดทำ คบ.14',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByText(/สะสม|คงเหลือ/).first(), 'WIT1103: ยอดวันสะสมและวันคงเหลือเทียบเพดาน 180 วัน', 2600)
        await d.click(p.getByTestId('review-outcome-extend'), { note: 'WIT1105: เลือกแนวทาง ขยายระยะเวลา' })
        await d.fill(
          p.getByRole('textbox', { name: /ผลประเมินความเสี่ยงและความจำเป็น/ }),
          'ภัยยังไม่คลี่คลาย ต้องคุ้มครองต่อเนื่องเกินกำหนดคำสั่งเดิม',
          { note: 'ผลประเมินความเสี่ยงและความจำเป็น' }
        )
        await d.fill(
          p.getByPlaceholder('อ้างอิง คบ.13 คำสั่งเดิม และกรณีครบเพดานแต่ยังมีภัย'),
          'อ้างอิง คบ.13 งวด 09/2569 ขอขยายเวลาอีก 30 วัน',
          { note: 'อ้างอิง คบ.13 และคำสั่งเดิม' }
        )
        await d.click(p.getByTestId('review-submit-proposal'), { note: 'เสนอผลทบทวน' })
        await d.confirm('ยืนยันเสนอผลทบทวน', 'ยืนยันเสนอผลทบทวนให้ผู้บังคับบัญชา')

        await d.switchRole('supervisor', 'ผบช.ชั้นต้นตรวจผลทบทวน (WIT1106)', 'ตรวจข้อเสนอ เอกสารประกอบ และระยะเวลาคงเหลือ เห็นชอบหรือส่งคืนแก้ไขได้')
        await d.fill(p.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน'), 'เห็นชอบให้ขยายเวลา', { note: 'ความเห็นผู้บังคับบัญชา' })
        await d.click(p.getByTestId('review-endorse'), { note: 'เห็นชอบ' })
        await d.confirm('ยืนยันเห็นชอบ', 'ยืนยันเห็นชอบข้อเสนอ')

        await d.switchRole('officer', 'เจ้าหน้าที่ส่งงานไปตามแนวทาง (WIT1107)', 'เมื่อได้รับความเห็นชอบ เจ้าหน้าที่ส่งงานต่อไปจัดทำ คบ.14 ที่แท็บ 11B')
        await d.click(p.getByTestId('review-apply-outcome'), { note: 'ส่งงานตามแนวทางที่เห็นชอบ' })
        await d.confirm('ยืนยันดำเนินการ', 'ยืนยันดำเนินการขยายระยะเวลา (คบ.14)')
        await d.highlight(p.getByTestId('review-goto-11b'), 'WIT1109: ไปจัดทำ คบ.14 (แท็บ 11B)', 2400)
      },
    },

    'Case 9': {
      detail:
        'ผลทบทวนเห็นชอบให้ขยายเวลา เจ้าหน้าที่จัดทำ คบ.14 ระบุเหตุผลและช่วงที่ขอขยาย ระบบตรวจยอดสะสมไม่เกินเพดาน 180 วัน แล้วส่งให้ผู้ตรวจ',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByText('30 วัน').first(), 'WIT1114: ช่วงที่ขอขยาย 30 วัน', 2400)
        const cap = p.getByText('WIT1116').first()
        if (await cap.count()) await d.highlight(cap, 'WIT1116: ระบบตรวจยอดสะสมไม่เกินเพดาน 180 วัน', 2400)
        await d.fill(
          p.getByPlaceholder('เหตุผลความจำเป็นในการขยายระยะเวลา และภัยที่ยังคงอยู่'),
          'ยังพบการเฝ้าติดตามพยานใกล้ที่พักอาศัย ความเสี่ยงยังไม่ลดลง และคดีหลักยังอยู่ระหว่างไต่สวน',
          { note: 'เหตุผลความจำเป็นในการขยาย' }
        )
        await d.click(p.getByRole('button', { name: 'จัดทำ คบ.14 และส่งตรวจ' }), { note: 'จัดทำ คบ.14 และส่งตรวจ' })
        await d.highlight(p.locator('.swal2-toast'), 'ส่ง คบ.14 ให้ผู้ตรวจแล้ว', 1800).catch(() => {})
        await d.pause(1500)
      },
    },

    'Case 9.1': {
      detail: 'ผบช.ชั้นต้นตรวจ คบ.14 ทั้งเหตุผล หลักฐาน ช่วงวันที่ และเพดานวันสะสม ถ้าครบถ้วนเสนอตามลำดับชั้น ถ้าไม่ครบส่งคืนแก้ไขได้',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByRole('button', { name: 'ส่งคืนแก้ไข' }), 'WIT1118: ถ้าเอกสารไม่ครบ ส่งคืนแก้ไขได้', 2000)
        await d.click(p.getByRole('button', { name: 'ครบถ้วน · เสนอตามลำดับชั้น' }), { note: 'WIT1120: เอกสารครบถ้วน เสนอตามลำดับชั้น' })
        await d.confirm('ยืนยันครบถ้วน', 'ยืนยันเสนอ คบ.14 ต่อเลขาธิการฯ')
        await d.pause(1500)
      },
    },

    'Case 9.2': {
      detail: 'เลขาธิการฯ พิจารณาอนุมัติหรือไม่อนุมัติขยายเวลา ถ้าอนุมัติ ระบบล็อก คบ.14 ที่ลงนามแล้ว และเพิ่มช่วงคุ้มครองใหม่โดยไม่แก้ทับช่วงเดิม',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByRole('button', { name: 'ไม่อนุมัติ' }), 'WIT1123: ถ้าไม่อนุมัติ คงคำสั่งเดิมถึงวันสิ้นสุด', 2200)
        await d.click(p.getByRole('button', { name: 'อนุมัติขยายเวลา (WIT1122)' }), { note: 'WIT1122: อนุมัติขยายเวลา' })
        await d.confirm('ยืนยันอนุมัติ', 'ยืนยันอนุมัติ — เพิ่มช่วงคุ้มครองใหม่')
        await d.highlight(p.getByText(/อนุมัติขยายเวลา 30 วันแล้ว/).first(), 'อนุมัติขยายเวลา 30 วัน คบ.14 ถูกล็อก', 3000)
        const back = p.getByRole('link', { name: /กลับแท็บ 10/ })
        if (await back.count()) await d.highlight(back.first(), 'กลับไปติดตามผลต่อที่แท็บ 10', 2000)
      },
    },
  },
} satisfies ScenarioScript
