import type { Director } from '../director'
import type { ScenarioScript } from '../types'

export default {
  id: 'fast-track-denied',
  steps: {
    'Case 3.1': {
      detail:
        'ผอ.สำนัก/กอง ตรวจ คบ.4 / ร่าง คบ.5 แล้วเห็นว่าระดับภัยยังไม่ถึงขั้นต้องคุ้มครองทันที จึงเลือก "ไม่อนุมัติคุ้มครองชั่วคราว" พร้อมบันทึกเหตุผล',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByTestId('fast-track-review-list'), 'WIT0605 — ผอ. ตรวจ คบ.4 ร่าง คบ.5 และหลักฐาน', 2500)
        // ลองข้ามไปส่งต่อคำร้องหลักก่อน — ระบบกันไว้
        await d.highlight(
          p.getByTestId('fast-track-decision-required-banner'),
          'ต้องตัดสินเรื่องคุ้มครองชั่วคราวก่อน จึงจะเดินคำร้องหลักต่อได้',
          2500
        )
        await d.click(p.getByTestId('fast-track-ready-button'), { note: 'WIT0606 ข้อมูลครบ — พร้อมพิจารณา' })
        await d.confirm('ยืนยันข้อมูลครบ', 'ยืนยันว่าข้อมูลครบ')

        // WIT0609 → WIT0610
        await d.highlight(p.getByTestId('fast-track-decision-panel'), 'WIT0609 อนุมัติคุ้มครองชั่วคราวหรือไม่?', 1800)
        await d.click(p.getByTestId('fast-track-deny-button'), { note: 'เลือก ไม่อนุมัติคุ้มครองชั่วคราว' })
        await d.fill(
          p.getByTestId('fast-track-deny-reason'),
          'ระดับภัยยังไม่ถึงขั้นต้องคุ้มครองทันที ให้เดินคำร้องหลักตามปกติและติดตามสถานการณ์',
          { note: 'WIT0610 บันทึกเหตุผลที่ไม่อนุมัติ' }
        )
        await d.click(p.getByTestId('fast-track-deny-confirm'), { note: 'ยืนยันบันทึกผล' })
        // จอยืนยันย้ำสองข้อห้าม: ไม่ปิดคำร้องหลัก และไม่ออก คบ.10
        await d.confirm('ยืนยันไม่อนุมัติชั่วคราว', 'ยืนยัน (ไม่ปิดคำร้องหลัก · ไม่ออก คบ.10)')
        await d.pause(800)
        await d.highlight(p.getByText('ไม่อนุมัติการคุ้มครองชั่วคราว (WIT0610)'), 'บันทึกผลไม่อนุมัติแล้ว', 2500)
      },
    },
    'Case 3.4': {
      detail:
        'ผอ. ไม่อนุมัติคุ้มครองชั่วคราว แต่คำร้องหลักไม่ถูกปิดและไม่ออก คบ.10 แฟ้มกลับมาที่เจ้าหน้าที่ให้จัดทำ คบ.6 แล้วเสนอต่อตามแท็บ 05',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByText('ไม่อนุมัติการคุ้มครองชั่วคราว (WIT0610)'), 'ผลชั่วคราว: ไม่อนุมัติ พร้อมเหตุผลของ ผอ.', 2500)
        await d.highlight(
          p.getByTestId('fast-track-main-petition-notice'),
          'WIT0614 คำร้องหลักยังเดินต่อ — ไม่ปิดคำร้อง ไม่ออก คบ.10 ไม่เกิดสิทธิอุทธรณ์',
          3200
        )
        const forward = p.getByTestId('forward-case-button')
        if (await forward.count()) {
          await d.scrollTo(forward)
          await d.highlight(forward, 'ถัดไป: จัดทำ/บันทึก คบ.6 แล้วเสนอ ผบช.ชั้นต้น (แท็บ 05)', 2800)
        }
      },
    },
  },
} satisfies ScenarioScript
