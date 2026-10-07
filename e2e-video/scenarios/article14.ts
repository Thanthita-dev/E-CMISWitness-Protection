import type { Locator } from '@playwright/test'
import { isoDaysFromToday, type Director } from '../director'
import type { ScenarioScript } from '../types'

const TARGET_AGENCY = 'กรมคุ้มครองสิทธิและเสรีภาพ'

export default {
  id: 'article14',
  steps: {
    'Case 10': {
      detail:
        'ทบทวนผลที่คุ้มครองสะสมครบ 180/180 วันแต่ยังมีภัย ตัวเลือกขยาย คบ.14 ถูกปิด เจ้าหน้าที่จึงเสนอแนวทางส่งต่อกรมคุ้มครองสิทธิและเสรีภาพตามข้อ 14',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByText(/สะสม|คงเหลือ/).first(), 'WIT1103: คุ้มครองสะสมครบ 180/180 วัน ยังมีภัย', 2600)
        await d.highlight(p.getByTestId('review-outcome-extend'), 'WIT1149: ครบเพดานแล้ว ขยาย คบ.14 ไม่ได้', 2400)
        await d.click(p.getByTestId('review-outcome-article14'), { note: 'WIT1105: เลือกแนวทาง ส่งต่อกรมตามข้อ 14' })
        await d.fill(
          p.getByRole('textbox', { name: /ผลประเมินความเสี่ยงและความจำเป็น/ }),
          'ครบเพดานคุ้มครองรวม 180 วันแล้ว แต่ยังมีภัยคุกคามต่อเนื่องต่อพยาน',
          { note: 'ผลประเมินความเสี่ยงและความจำเป็น' }
        )
        await d.fill(
          p.getByPlaceholder('อ้างอิง คบ.13 คำสั่งเดิม และกรณีครบเพดานแต่ยังมีภัย'),
          'ครบเพดาน 180 วันแต่ยังมีภัย — ขอทบทวนแนวทางตามข้อ 14',
          { note: 'อ้างอิง คบ.13 และกรณีครบเพดานแต่ยังมีภัย' }
        )
        await d.click(p.getByTestId('review-submit-proposal'), { note: 'เสนอผลทบทวน' })
        await d.confirm('ยืนยันเสนอผลทบทวน', 'ครบเพดานแต่ยังมีภัย — ส่งต่อกรมคุ้มครองสิทธิฯ')
        await d.pause(1200)
      },
    },

    'Case 10.1': {
      detail: 'ผบช.ชั้นต้นตรวจข้อเสนอแนวทางข้อ 14 จากผลทบทวน เห็นชอบหรือส่งคืนแก้ไขได้',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByText('ครบเพดานแต่ยังมีภัย — ส่งต่อกรมคุ้มครองสิทธิฯ').first(), 'WIT1106: ข้อเสนอ ส่งต่อกรมตามข้อ 14', 2600)
        await d.fill(p.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน'), 'เห็นชอบให้ดำเนินการตามข้อ 14', { note: 'ความเห็นผู้บังคับบัญชา' })
        await d.click(p.getByTestId('review-endorse'), { note: 'เห็นชอบข้อเสนอ' })
        await d.confirm('ยืนยันเห็นชอบ', 'ยืนยันเห็นชอบข้อเสนอ')
        await d.pause(1200)
      },
    },

    'Case 10.2': {
      detail: 'ผบช.ชั้นต้นเห็นชอบแล้ว เจ้าหน้าที่ดำเนินการตามแนวทางที่เห็นชอบ ระบบพาไปหน้าส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ (ข้อ 14)',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByText('ครบเพดานแต่ยังมีภัย — ส่งต่อกรมคุ้มครองสิทธิฯ').first(), 'ผบช.ชั้นต้นเห็นชอบแล้ว: ส่งต่อกรมตามข้อ 14', 2400)
        await d.click(p.getByTestId('review-apply-outcome'), { note: 'WIT1107: ดำเนินการตามแนวทางที่เห็นชอบ' })
        await d.confirm('ยืนยันดำเนินการ', 'ไปหน้าส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ')
        await d.highlight(p.getByText(/ไปหน้าส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ/).first(), 'WIT1149: เรื่องเข้าเส้นทางข้อ 14 (หน้าส่งต่อกรม)', 2800)
      },
    },

    'Case 5': {
      detail:
        'คุ้มครองสะสมใกล้ครบเพดาน 180 วันแต่ยังมีภัย ห้ามขยาย คบ.14 จึงต้องเสนอส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ ตามข้อ 14 โดยผ่านหลายบทบาทตามลำดับ',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByText(/คุ้มครองสะสม 178 วัน/).first(), 'WIT0852: คุ้มครองสะสม 178 วัน ใกล้เพดาน 180 วัน', 2800)
        const hint = p.getByTestId('article14-near-cap-hint')
        if (await hint.count()) await d.highlight(hint.first(), 'ครบ 180 วันแต่ยังมีภัย: ห้ามขยาย คบ.14 ให้ส่งกรมตามข้อ 14', 2400)

        await d.fill(
          p.getByRole('textbox', { name: 'เหตุความไม่ปลอดภัยที่ยังคงอยู่' }),
          'ยังมีกลุ่มผู้มีอิทธิพลเฝ้าติดตามที่พักพยาน แม้คุ้มครองสะสมใกล้ครบเพดาน 180 วัน',
          { note: 'WIT0854: ระบุเหตุภัยที่ยังคงอยู่' }
        )
        await d.fill(
          p.getByRole('textbox', { name: /รายงานผล \/ ประเมินความเสี่ยง/ }),
          'อ้างอิง คบ.13 รอบล่าสุดและคำสั่งเดิม (คบ.11) — คุ้มครองสะสม 178 วัน ความเสี่ยงสูงต่อเนื่อง',
          { note: 'ผลประเมินความเสี่ยงอ้างอิง คบ.13' }
        )
        await d.click(p.getByTestId('submit-article14-proposal'), { note: 'เสนอเรื่องข้อ 14' })
        await d.confirm('ยืนยันเสนอ', 'ยืนยันเสนอเรื่องให้ ผบช.ชั้นต้น')

        await d.switchRole('supervisor', 'ผบช.ชั้นต้นตรวจข้อเสนอ (WIT0855)', 'ตรวจเอกสาร เหตุภัย ระยะสะสม และข้อเสนอ ส่งคืนแก้ไขได้โดยบันทึกเหตุผล')
        await d.highlight(p.getByTestId('article14-return-button'), 'ถ้าไม่ครบถ้วนสามารถส่งคืนแก้ไขได้', 1800)
        await d.click(p.getByTestId('article14-endorse-button'), { note: 'เห็นชอบ ส่งเลขาธิการฯ' })
        await d.confirm('ยืนยันเห็นชอบ', 'ยืนยันเห็นชอบและเสนอขั้นถัดไป')

        await d.switchRole('secretary', 'เลขาธิการฯ เสนอคณะกรรมการ (WIT0856)', 'เลขาธิการฯ พิจารณาและเสนอเรื่องพร้อมความเห็นต่อคณะกรรมการ ป.ป.ท.')
        await d.click(p.getByTestId('article14-endorse-button'), { note: 'เห็นชอบ เสนอคณะกรรมการ ป.ป.ท.' })
        await d.confirm('ยืนยันเห็นชอบ', 'ยืนยันเสนอคณะกรรมการ')

        await d.switchRole('committee', 'คณะกรรมการมีมติ (WIT0857)', 'คณะกรรมการ ป.ป.ท. พิจารณาและมีมติว่าเห็นชอบส่งกรมคุ้มครองสิทธิฯ หรือไม่')
        await d.fill(p.getByPlaceholder('เลขที่มติ / ครั้งที่ประชุม'), 'มติที่ 25/2569', { note: 'เลขที่มติ' })
        await d.fill(p.getByPlaceholder('สาระสำคัญของมติ'), 'เห็นชอบส่งกรมคุ้มครองสิทธิและเสรีภาพ', { note: 'สาระสำคัญของมติ' })
        await d.highlight(p.getByTestId('article14-committee-reject'), 'ถ้าไม่เห็นชอบ (WIT0858) ให้ดำเนินการตามคำสั่งเดิม', 1800)
        await d.click(p.getByTestId('article14-committee-approve'), { note: 'มติเห็นชอบส่งกรม' })
        await d.confirm('ยืนยันมติ', 'ยืนยันมติเห็นชอบ')

        await d.switchRole('officer', 'เจ้าหน้าที่ออกหนังสือถึงกรม (WIT0859)', `ออกหนังสือขาออกผ่านสารบรรณเดิมถึง ${TARGET_AGENCY}`)
        await d.fill(p.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)'), 'ปปท 0001/7788', { note: 'เลขที่หนังสือขาออก' })
        await d.click(p.getByRole('button', { name: 'บันทึกหนังสือขาออก' }), { note: 'บันทึกหนังสือขาออกถึงกรม' })
        await d.confirm('ยืนยันบันทึก', 'ยืนยันบันทึกหนังสือขาออก')
      },
    },

    'Case 5.1': {
      detail:
        'ส่งหนังสือถึงกรมแล้ว เจ้าหน้าที่บันทึกหนังสือตอบรับจากกรม นัดส่งมอบ แล้วส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่ ระบบปิดช่วงคุ้มครองเดิม',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByTestId('article14-reply-form'), 'WIT0860: บันทึกหนังสือตอบรับจากกรมก่อนส่งมอบ', 2400)
        // ถ้าแฟ้มของจุดพักนี้ยังไม่มีหนังสือขาออก ต้องบันทึกก่อนจึงจะเปิดฟอร์มหนังสือตอบรับ
        const outgoing = p.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)')
        if (await outgoing.count()) {
          await d.fill(outgoing, 'ปปท 0001/7788', { note: 'WIT0859: เลขที่หนังสือขาออกถึงกรม' })
          await d.click(p.getByRole('button', { name: 'บันทึกหนังสือขาออก' }), { note: 'บันทึกหนังสือขาออก' })
          await d.confirm('ยืนยันบันทึก', 'ยืนยันบันทึกหนังสือขาออก')
        }
        await d.fill(p.getByPlaceholder('เลขที่หนังสือตอบรับของกรม'), 'ยธ 0501/2569', { note: 'เลขที่หนังสือตอบรับ' })
        await d.fill(p.getByPlaceholder('ผู้ประสานของกรม'), 'นายประสาน ตอบรับ', { note: 'ผู้ประสานของกรม' })
        await d.fillDate(p.getByLabel('วันนัดส่งมอบ'), isoDaysFromToday(3), 'วันนัดส่งมอบ')
        // ช่องอัปโหลดซ่อนอยู่ จึงแนบไฟล์ด้วย setInputFiles
        await p.getByTestId('article14-reply-file').setInputFiles({ name: 'หนังสือตอบรับกรม.pdf', mimeType: 'application/pdf', buffer: Buffer.from('mock reply') })
        await d.pause(500)
        await d.click(p.getByTestId('article14-record-reply'), { note: 'บันทึกหนังสือตอบรับ' })
        await d.confirm('ยืนยันบันทึก', 'ยืนยันบันทึกหนังสือตอบรับ')

        await d.fillDate(p.getByLabel('วันเริ่มมาตรการของหน่วยงานใหม่'), isoDaysFromToday(3), 'WIT0862: วันเริ่มมาตรการของกรม')
        await d.fill(p.getByLabel('ฐานกฎหมายของหน่วยงานใหม่'), 'มาตรการพิเศษตามระเบียบกรมคุ้มครองสิทธิและเสรีภาพ', { note: 'ฐานกฎหมายของหน่วยงานใหม่' })
        await d.click(p.getByRole('button', { name: 'บันทึกส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่' }), { note: 'บันทึกส่งมอบ' })
        await d.confirm('ยืนยันส่งมอบ', 'ยืนยันส่งมอบและปิดช่วงคุ้มครองเดิม')
        await d.highlight(p.getByText(/เริ่มมาตรการตั้งแต่/).first(), 'WIT0863: ปิด Episode เดิม เชื่อมกับมาตรการของกรม', 3000)
      },
    },
  },
} satisfies ScenarioScript
